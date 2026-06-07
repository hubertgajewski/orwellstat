#!/usr/bin/env python3
"""Shared Claude/Codex hook for direct git push commands."""

from __future__ import annotations

import json
import re
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Literal

from shell_c_option_utils import inline_c_command


Decision = Literal["none", "block", "allow"]
MAX_ENV_SPLIT_DEPTH = 3

BLOCK_MESSAGES = {
    "claude": 'BLOCKED: use a direct git push command so the /deep-review agent hook runs before publication (avoid wrappers like "cd repo && git push").',
    "codex": 'BLOCKED: use a direct git push command so verification runs before publication (avoid wrappers like "cd repo && git push").',
}


def scan_command(command: str) -> tuple[bool, str]:
    state = "none"
    escaped = False
    forbidden = False
    normalized: list[str] = []

    for index, char in enumerate(command):
        if escaped:
            normalized.append(char)
            escaped = False
            continue

        if state == "single":
            normalized.append(char)
            if char == "'":
                state = "none"
            continue

        if state == "double":
            normalized.append(char)
            if char == '"':
                state = "none"
            elif char == "\\":
                escaped = True
            elif char == "`" or (char == "$" and command[index + 1 : index + 2] == "("):
                forbidden = True
            continue

        if char == "\\":
            normalized.append(char)
            escaped = True
        elif char == "'":
            normalized.append(char)
            state = "single"
        elif char == '"':
            normalized.append(char)
            state = "double"
        elif char == "\n":
            forbidden = True
            normalized.append(" ; ")
        elif char in ";&|<>`" or (char in "$<>" and command[index + 1 : index + 2] == "("):
            forbidden = True
            normalized.append(char)
        else:
            normalized.append(char)

    return forbidden, "".join(normalized)


def shell_tokens(normalized_command: str) -> list[str] | None:
    lexer = shlex.shlex(normalized_command, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    try:
        return list(lexer)
    except ValueError:
        return None


def split_segments(tokens: list[str]) -> list[list[str]]:
    segments: list[list[str]] = [[]]
    for token in tokens:
        if token and all(char in ";&|" for char in token):
            segments.append([])
        else:
            segments[-1].append(token)
    return [segment for segment in segments if segment]


ASSIGNMENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=.*$")
GIT_OPTIONS_WITH_VALUES = {
    "-C",
    "-c",
    "--git-dir",
    "--work-tree",
    "--namespace",
    "--exec-path",
    "--config-env",
}
PUBLISH_SUBCOMMANDS = {"push", "send-pack"}
PUBLISH_SUBCOMMAND_PATTERN = "|".join(
    re.escape(subcommand) for subcommand in sorted(PUBLISH_SUBCOMMANDS, key=len, reverse=True)
)
SUBSTITUTION_PUBLISH_RE = re.compile(
    rf"(`|\$\(|<\(|>\()\s*(/\S*/)?git\b(?:\s+(?:-[A-Za-z]|--[A-Za-z-]+)(?:[=\s]\S+)*)*\s+(?:{PUBLISH_SUBCOMMAND_PATTERN})\b",
    re.DOTALL,
)
DYNAMIC_PUBLISH_RE = re.compile(
    rf"\bgit\s*\$[({{A-Za-z_].*\b(?:{PUBLISH_SUBCOMMAND_PATTERN})\b|"
    rf"\bgit\$\{{[^}}]+\}}(?:{PUBLISH_SUBCOMMAND_PATTERN})\b",
    re.DOTALL,
)
GIT_PUBLISH_RE = re.compile(
    rf"\bgit\b(?:\s+(?:-[A-Za-z]|--[A-Za-z-]+)(?:[=\s]\S+)*)*\s+(?:{PUBLISH_SUBCOMMAND_PATTERN})\b|\bgit-send-pack\b",
    re.DOTALL,
)
RAW_PUBLISH_RE = re.compile(
    rf"\bgit\b.*\b(?:{PUBLISH_SUBCOMMAND_PATTERN})\b|\bgit-send-pack\b",
    re.DOTALL,
)
RUNTIME_PUBLISH_RE = re.compile(
    rf"\bgit\b(?:\s+(?:-[A-Za-z]|--[A-Za-z-]+)(?:[=\s]\S+)*)*\s+(?:{PUBLISH_SUBCOMMAND_PATTERN})\b|"
    rf"[\"']git[\"']\s*\+\s*[\"']\s+(?:{PUBLISH_SUBCOMMAND_PATTERN})\b|"
    r"\bgit-send-pack\b",
    re.DOTALL,
)
SHELL_INTERPRETERS = {"bash", "dash", "sh", "zsh"}
INLINE_RUNTIME_FLAGS = {"-c", "-e", "--eval", "-p", "--print"}
XARGS_OPTIONS_WITH_VALUES = {
    "-a",
    "--arg-file",
    "-d",
    "--delimiter",
    "-E",
    "-I",
    "-L",
    "--max-lines",
    "-n",
    "--max-args",
    "-P",
    "--max-procs",
    "-s",
    "--max-chars",
}
KNOWN_NON_PUBLISH_GIT_SUBCOMMANDS = {
    "add",
    "apply",
    "blame",
    "branch",
    "checkout",
    "cherry-pick",
    "check-ignore",
    "commit",
    "commit-graph",
    "config",
    "describe",
    "diff",
    "fetch",
    "gc",
    "grep",
    "help",
    "log",
    "ls-files",
    "ls-remote",
    "ls-tree",
    "merge",
    "mv",
    "pull",
    "remote",
    "reflog",
    "rebase",
    "restore",
    "rev-parse",
    "reset",
    "rm",
    "show",
    "show-ref",
    "stash",
    "status",
    "submodule",
    "switch",
    "tag",
    "version",
    "worktree",
}
ALIAS_CAPABLE_GIT_CONFIG_ENV = {
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_SYSTEM",
}
ENV_OPTIONS_WITH_VALUES = {
    "-u",
    "--unset",
    "-C",
    "--chdir",
    "-P",
    "--path",
}
ENV_FLAGS_WITHOUT_VALUES = {"-i", "-", "--ignore-environment"}


def config_value_defines_publish_alias(value: str) -> bool:
    return bool(re.match(rf"^alias\.[^.]+=.*\b(?:{PUBLISH_SUBCOMMAND_PATTERN})\b", value, re.IGNORECASE))


def config_value_can_define_alias(value: str) -> bool:
    return bool(
        config_value_defines_publish_alias(value)
        or re.match(r"^include(?:If\..+)?\.path=", value, re.IGNORECASE)
        or re.match(r"^alias\.[^.]+$", value, re.IGNORECASE)
    )


def config_env_key_can_define_alias(value: str) -> bool:
    key = value.split("=", 1)[0]
    return bool(
        re.match(r"^alias\.[^.]+$", key, re.IGNORECASE)
        or re.match(r"^include(?:If\..+)?\.path$", key, re.IGNORECASE)
    )


def is_git_executable(token: str) -> bool:
    return token == "git" or token.endswith("/git")


def is_git_send_pack_executable(token: str) -> bool:
    return Path(token).name == "git-send-pack" or token.endswith("/git-send-pack")


def is_git_config_assignment(token: str) -> bool:
    key = token.split("=", 1)[0]
    return (
        key in ALIAS_CAPABLE_GIT_CONFIG_ENV
        or key.startswith("GIT_CONFIG_KEY_")
        or key.startswith("GIT_CONFIG_VALUE_")
    )


def first_token_basename(segment: list[str]) -> str:
    return Path(segment[0]).name if segment else ""


def scan_env_prefix(segment: list[str], index: int) -> tuple[int, bool, list[str]]:
    index += 1
    has_git_config_assignment = False
    split_payloads: list[str] = []
    while index < len(segment):
        token = segment[index]
        if ASSIGNMENT_RE.match(token):
            has_git_config_assignment = has_git_config_assignment or is_git_config_assignment(token)
            index += 1
        elif token == "--":
            index += 1
            break
        elif token in {"-S", "--split-string"}:
            if index + 1 < len(segment):
                split_payloads.append(" ".join(segment[index + 1 :]))
            index += 2
        elif token.startswith("-S") and len(token) > 2:
            split_payloads.append(" ".join([token[2:], *segment[index + 1 :]]))
            index += 1
        elif token.startswith("--split-string="):
            split_payloads.append(" ".join([token.split("=", 1)[1], *segment[index + 1 :]]))
            index += 1
        elif token in ENV_OPTIONS_WITH_VALUES:
            index += 2
        elif (
            token in ENV_FLAGS_WITHOUT_VALUES
            or token.startswith("-u")
            or token.startswith("--unset=")
            or token.startswith("--path=")
            or token.startswith("-P")
        ):
            index += 1
        else:
            break
    return index, has_git_config_assignment, split_payloads


def skip_env_prefix(segment: list[str], index: int) -> int:
    return scan_env_prefix(segment, index)[0]


def env_prefix_has_git_config_assignment(segment: list[str], index: int) -> bool:
    return scan_env_prefix(segment, index)[1]


def env_split_string_contains_publish(segment: list[str], index: int, depth: int) -> bool:
    return any(command_decision(payload, depth + 1) != "none" for payload in scan_env_prefix(segment, index)[2])


def env_split_payloads(segment: list[str]) -> list[str]:
    return scan_env_prefix(segment, 0)[2]


def env_split_payload_allows_xargs_input(payload: str, depth: int) -> bool:
    if command_decision(payload, depth + 1) != "none":
        return True
    tokens = shell_tokens(scan_command(payload)[1])
    if not tokens:
        return False
    segments = split_segments(tokens)
    return any(len(segment) == 1 and is_git_executable(segment[0]) for segment in segments)


def skip_command_prefix(segment: list[str], index: int) -> int | None:
    index += 1
    while index < len(segment):
        token = segment[index]
        if token == "--":
            return index + 1
        if token.startswith("-") and not token.startswith("--") and any(flag in token for flag in {"v", "V"}):
            return None
        if token == "-p" or (token.startswith("-") and set(token[1:]) <= {"p"}):
            index += 1
            continue
        break
    return index


def skip_exec_prefix(segment: list[str], index: int) -> int:
    index += 1
    while index < len(segment):
        token = segment[index]
        if token == "--":
            return index + 1
        if token == "-a" and index + 1 < len(segment):
            index += 2
            continue
        if token.startswith("-") and not token.startswith("--") and "a" in token[1:] and index + 1 < len(segment):
            index += 2
            continue
        if token in {"-c", "-l"} or (token.startswith("-") and not token.startswith("--") and set(token[1:]) <= {"c", "l"}):
            index += 1
            continue
        break
    return index


def interpreter_string_contains_publish(segment: list[str], depth: int) -> bool:
    if not segment:
        return False

    interpreter = Path(segment[0]).name
    if interpreter not in SHELL_INTERPRETERS:
        return False

    for index, token in enumerate(segment[1:], start=1):
        inner = inline_c_command(token)
        if inner is not None:
            return command_decision(inner, depth + 1) != "none"
        if token == "-c":
            return index + 1 < len(segment) and command_decision(segment[index + 1], depth + 1) != "none"
        if token.startswith("-") and not token.startswith("--") and "c" in token[1:]:
            return index + 1 < len(segment) and command_decision(segment[index + 1], depth + 1) != "none"
        if token in {"--rcfile", "--init-file"}:
            continue

    return False


def python_string_contains_publish(segment: list[str]) -> bool:
    if not segment or not re.match(r"^python(?:\d+(?:\.\d+)?)?$", Path(segment[0]).name):
        return False

    for index, token in enumerate(segment[1:], start=1):
        if token == "-c":
            return index + 1 < len(segment) and RUNTIME_PUBLISH_RE.search(segment[index + 1]) is not None
        if token.startswith("-c") and len(token) > 2:
            return RUNTIME_PUBLISH_RE.search(token[2:]) is not None
    return False


def node_string_contains_publish(segment: list[str]) -> bool:
    if not segment or Path(segment[0]).name != "node":
        return False

    for index, token in enumerate(segment[1:], start=1):
        if token in INLINE_RUNTIME_FLAGS:
            if token in {"-p", "--print"} and index + 1 < len(segment) and segment[index + 1].startswith("-"):
                continue
            return index + 1 < len(segment) and RUNTIME_PUBLISH_RE.search(segment[index + 1]) is not None
        if token.startswith("--eval=") or token.startswith("--print="):
            return RUNTIME_PUBLISH_RE.search(token.split("=", 1)[1]) is not None
        if token.startswith("-") and not token.startswith("--") and "e" in token[1:] and len(token) > 2:
            inline = token[token.index("e") + 1 :]
            if inline:
                return RUNTIME_PUBLISH_RE.search(inline) is not None
            return index + 1 < len(segment) and RUNTIME_PUBLISH_RE.search(segment[index + 1]) is not None
        if token.startswith("-p") and len(token) > 2:
            return RUNTIME_PUBLISH_RE.search(token[2:]) is not None
    return False


def substitution_contains_publish(command: str, depth: int) -> bool:
    substitution_re = re.compile(r"\$\(([^)]*)\)|`([^`]*)`|[<>]\(([^)]*)\)", re.DOTALL)
    for match in substitution_re.finditer(command):
        body = next(group for group in match.groups() if group is not None)
        if body and command_decision(body, depth + 1) != "none":
            return True
    return False


def xargs_utility_index(segment: list[str]) -> int | None:
    index = 1
    while index < len(segment):
        token = segment[index]
        if token == "--":
            return index + 1 if index + 1 < len(segment) else None
        if token == "-i":
            index += 1
            continue
        if token in XARGS_OPTIONS_WITH_VALUES:
            index += 2
            continue
        if token.startswith("--") and "=" in token:
            index += 1
            continue
        if token.startswith("-") and token != "-":
            index += 1
            continue
        return index
    return None


def xargs_input_info(segment: list[str]) -> tuple[bool, set[str]]:
    index = 1
    has_external_input = False
    replacement_tokens: set[str] = set()
    while index < len(segment):
        token = segment[index]
        if token == "--":
            return has_external_input, replacement_tokens
        if token in {"-a", "--arg-file"}:
            has_external_input = True
            index += 2
            continue
        if token.startswith("--arg-file="):
            has_external_input = True
            index += 1
            continue
        if token == "-I":
            has_external_input = True
            if index + 1 < len(segment):
                replacement_tokens.add(segment[index + 1])
            index += 2
            continue
        if token == "-i":
            has_external_input = True
            replacement_tokens.add("{}")
            index += 1
            continue
        if token == "--replace":
            has_external_input = True
            replacement_tokens.add("{}")
            index += 1
            continue
        if token.startswith("--replace="):
            has_external_input = True
            replacement_tokens.add(token.split("=", 1)[1] or "{}")
            index += 1
            continue
        if token.startswith("-I") and len(token) > 2:
            has_external_input = True
            replacement_tokens.add(token[2:])
            index += 1
            continue
        if token.startswith("-i") and len(token) > 2:
            has_external_input = True
            replacement_tokens.add(token[2:])
            index += 1
            continue
        if token in XARGS_OPTIONS_WITH_VALUES:
            index += 2
            continue
        if token.startswith("--") and "=" in token:
            index += 1
            continue
        if token.startswith("-") and token != "-":
            index += 1
            continue
        return has_external_input, replacement_tokens
    return has_external_input, replacement_tokens


def xargs_utility_contains_publish(current: list[str], utility_index: int, depth: int) -> bool:
    utility = current[utility_index:]
    has_external_or_replacement_input, replacement_tokens = xargs_input_info(current)
    if has_external_or_replacement_input and utility and any(token in PUBLISH_SUBCOMMANDS for token in utility[1:]):
        return True
    if has_external_or_replacement_input and utility and any(
        marker and marker in token and any(config_value_can_define_alias(arg) for arg in utility)
        for marker in replacement_tokens
        for token in utility
    ):
        return any(config_value_can_define_alias(token) for token in utility[1:])
    if is_git_executable(utility[0]) and len(utility) == 1:
        return True
    if git_invocation(utility, depth)[0]:
        return True
    if is_git_executable(utility[0]) and git_invocation([*utility, "push"], depth)[0]:
        return True
    if first_token_basename(utility) == "env":
        if env_split_string_contains_publish(utility, 0, depth) or any(
            env_split_payload_allows_xargs_input(payload, depth) for payload in env_split_payloads(utility)
        ):
            return True
        utility = utility[skip_env_prefix(utility, 0) :]
    if utility and is_git_executable(utility[0]) and len(utility) == 1:
        return True
    if utility and git_invocation(utility, depth)[0]:
        return True
    if utility and is_git_executable(utility[0]) and git_invocation([*utility, "push"], depth)[0]:
        return True
    if has_external_or_replacement_input and utility and first_token_basename(utility) in {"eval", *SHELL_INTERPRETERS}:
        return True
    if utility and first_token_basename(utility) in SHELL_INTERPRETERS and any(token in {"<", "<<"} for token in current):
        return True
    return command_builder_contains_publish(current, utility_index, depth)


def command_builder_contains_publish(segment: list[str], index: int, depth: int) -> bool:
    current = segment[index:]
    if interpreter_string_contains_publish(current, depth) or python_string_contains_publish(current) or node_string_contains_publish(current):
        return True
    if current and first_token_basename(current) in SHELL_INTERPRETERS:
        return any(GIT_PUBLISH_RE.search(token) for token in current[1:])
    if current and first_token_basename(current) == "eval":
        nested = " ".join(current[1:])
        return bool(nested and command_decision(nested, depth + 1) != "none")
    if current and first_token_basename(current) == "env":
        if env_split_string_contains_publish(current, 0, depth) or any(
            env_split_payload_allows_xargs_input(payload, depth) for payload in env_split_payloads(current)
        ):
            return True
        env_index = skip_env_prefix(current, 0)
        return env_index < len(current) and command_builder_contains_publish(current, env_index, depth)
    if current and first_token_basename(current) == "xargs":
        utility_index = xargs_utility_index(current)
        if utility_index is None:
            return False
        return xargs_utility_contains_publish(current, utility_index, depth)
    return False


def git_invocation(segment: list[str], depth: int) -> tuple[bool, bool]:
    index = 0
    while index < len(segment) and segment[index] == "(":
        index += 1
    has_git_config_assignment = False
    while index < len(segment) and ASSIGNMENT_RE.match(segment[index]):
        has_git_config_assignment = has_git_config_assignment or is_git_config_assignment(segment[index])
        index += 1
    if command_builder_contains_publish(segment, index, depth):
        return True, False
    if index < len(segment) and first_token_basename(segment[index:]) == "env":
        if env_split_string_contains_publish(segment, index, depth):
            return True, False
        has_git_config_assignment = has_git_config_assignment or env_prefix_has_git_config_assignment(segment, index)
        index = skip_env_prefix(segment, index)
    if index < len(segment) and segment[index] == "command":
        next_index = skip_command_prefix(segment, index)
        if next_index is None:
            return False, False
        index = next_index
    if index < len(segment) and segment[index] == "exec":
        index = skip_exec_prefix(segment, index)
    if command_builder_contains_publish(segment, index, depth):
        return True, False

    if index < len(segment) and "$" in segment[index] and any(
        "$" in token or token in PUBLISH_SUBCOMMANDS or config_value_can_define_alias(token) for token in segment[index + 1 :]
    ):
        return True, False

    if index < len(segment) and is_git_send_pack_executable(segment[index]):
        return True, False

    if index >= len(segment) or not is_git_executable(segment[index]):
        return False, False

    git_index = index
    index += 1
    while index < len(segment):
        token = segment[index]
        if token == "--":
            index += 1
            break
        if token in GIT_OPTIONS_WITH_VALUES:
            if token == "-c" and index + 1 < len(segment) and config_value_can_define_alias(segment[index + 1]):
                return True, False
            if token == "--config-env" and index + 1 < len(segment) and config_env_key_can_define_alias(segment[index + 1]):
                return True, False
            index += 2
            continue
        if token.startswith("-c") and config_value_can_define_alias(token[2:]):
            return True, False
        if token.startswith("--config-env=") and config_env_key_can_define_alias(token.split("=", 1)[1]):
            return True, False
        if token.startswith("--") and "=" in token:
            index += 1
            continue
        if token.startswith("-"):
            index += 1
            continue
        break

    is_publish = index < len(segment) and segment[index] in PUBLISH_SUBCOMMANDS
    if index < len(segment) and not is_publish and segment[index] not in KNOWN_NON_PUBLISH_GIT_SUBCOMMANDS:
        return True, False
    if (
        has_git_config_assignment
        and git_index == index - 1
        and index < len(segment)
        and not is_publish
        and segment[index] not in KNOWN_NON_PUBLISH_GIT_SUBCOMMANDS
    ):
        return True, False
    if not is_publish and index < len(segment) and any("$" in token or token in {"(", ")"} for token in segment[index:]):
        return True, False
    is_direct = (
        len(segment) >= 2
        and segment[0] == "git"
        and segment[1] == "push"
        and git_index == 0
        and index == 1
    )
    return is_publish, is_direct


def segment_has_embedded_git_publish(segment: list[str]) -> bool:
    if segment and segment[0] == "command" and any(
        token.startswith("-") and not token.startswith("--") and any(flag in token for flag in {"v", "V"})
        for token in segment[1:]
    ):
        return False
    if segment and re.match(r"^python(?:\d+(?:\.\d+)?)?$", first_token_basename(segment)) and len(segment) > 1 and segment[1] != "-":
        return False
    for index in range(len(segment) - 1):
        if is_git_executable(segment[index]) and segment[index + 1] in PUBLISH_SUBCOMMANDS:
            return True
        if is_git_send_pack_executable(segment[index]):
            return True
    return False


def segment_has_dynamic_git_publish(segment: list[str]) -> bool:
    return any(DYNAMIC_PUBLISH_RE.search(token) for token in segment)


def command_decision(command: str, depth: int = 0) -> Decision:
    if depth > MAX_ENV_SPLIT_DEPTH:
        return "block" if RAW_PUBLISH_RE.search(command) else "none"

    forbidden, normalized_command = scan_command(command)
    tokens = shell_tokens(normalized_command)

    if tokens is None:
        return "block" if RAW_PUBLISH_RE.search(command) else "none"

    segments = split_segments(tokens)
    invocations = [git_invocation(segment, depth) for segment in segments]
    publish_invocations = [invocation for invocation in invocations if invocation[0]]
    direct_invocations = [invocation for invocation in publish_invocations if invocation[1]]
    if not publish_invocations:
        if any(segment_has_embedded_git_publish(segment) for segment in segments):
            return "block"
        if any(segment_has_dynamic_git_publish(segment) for segment in segments):
            return "block"
        if any(
            segment
            and (segment[0].startswith("`") or segment[0].startswith("$(") or segment[0].startswith("$"))
            and any(token in PUBLISH_SUBCOMMANDS or config_value_can_define_alias(token) for token in segment[1:])
            for segment in segments
        ):
            return "block"
        if any(segment and first_token_basename(segment) == "eval" for segment in segments) and GIT_PUBLISH_RE.search(command):
            return "block"
        if any(segment and first_token_basename(segment) in SHELL_INTERPRETERS for segment in segments) and GIT_PUBLISH_RE.search(command):
            return "block"
        if any(segment and first_token_basename(segment) == "python3" and len(segment) > 1 and segment[1] == "-" for segment in segments) and GIT_PUBLISH_RE.search(command):
            return "block"
        if forbidden and (
            substitution_contains_publish(command, depth)
            or SUBSTITUTION_PUBLISH_RE.search(command)
            or DYNAMIC_PUBLISH_RE.search(command)
        ):
            return "block"
        return "none"

    direct = (
        len(segments) == 1
        and len(direct_invocations) == 1
        and re.match(r"^\s*git\s+push(?:\s|$)", command) is not None
    )
    if direct and not forbidden:
        return "allow"
    return "block"


def run_check(command: list[str], cwd: Path) -> None:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        sys.stderr.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise SystemExit(2)


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "codex"
    if mode not in BLOCK_MESSAGES:
        print(f"Unknown hook mode: {mode}", file=sys.stderr)
        return 2

    payload = json.loads(sys.stdin.read() or "{}")
    command = payload.get("tool_input", {}).get("command", "")
    decision = command_decision(command)
    if decision == "none":
        return 0
    if decision == "block":
        print(BLOCK_MESSAGES[mode], file=sys.stderr)
        return 2

    root_result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        text=True,
        capture_output=True,
        check=False,
    )
    if root_result.returncode != 0:
        sys.stderr.write(root_result.stderr)
        return 2

    playwright_dir = Path(root_result.stdout.strip()) / "playwright" / "typescript"
    run_check(["npx", "tsc", "--noEmit"], playwright_dir)
    run_check(["npm", "run", "format:check"], playwright_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
