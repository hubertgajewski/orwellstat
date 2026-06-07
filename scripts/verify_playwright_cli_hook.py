#!/usr/bin/env python3
"""Blocks assistant shell commands that run Playwright tests outside playwright-report-mcp."""

from __future__ import annotations

import re
import shlex
import sys

from shell_c_option_utils import inline_c_command, short_option_includes_c

BLOCK_MESSAGE = (
    "BLOCKED: direct Playwright CLI is forbidden. Use the playwright-report-mcp "
    "run_tests MCP tool instead (see docs/AI_ASSISTANTS.md). For multiple iterations, "
    "call the MCP tool repeatedly."
)

# Fallback when shlex cannot parse a segment (combined playwright / cli.js / .bin paths).
PLAYWRIGHT_TEST_PATTERN = re.compile(
    r"(^|[^a-zA-Z0-9_-])playwright\s+test([^a-zA-Z0-9_-]|$)"
    r"|@playwright/test/cli\.js\s+test([^a-zA-Z0-9_-]|$)"
    r"|(^|[^a-zA-Z0-9_/])\.bin/playwright\s+test([^a-zA-Z0-9_-]|$)"
)

COMMAND_SEGMENT_SPLIT = re.compile(r"\s*&&\s*|\s*;\s*|\s*\|\|\s*")
EVAL_TOKEN = "eval"


def collapse_shell_obfuscation(command: str) -> str:
    """Remove quote/backslash obfuscation inside a command segment."""
    return command.replace("'", "").replace('"', "").replace("\\", "")


def tokens_or_pattern_match(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    try:
        tokens = shlex.split(stripped, posix=True)
    except ValueError:
        return bool(PLAYWRIGHT_TEST_PATTERN.search(collapse_shell_obfuscation(stripped)))
    return tokens_match_playwright_test(tokens)


def tokens_match_playwright_test(tokens: list[str]) -> bool:
    for index, token in enumerate(tokens):
        normalized = collapse_shell_obfuscation(token)
        executable = normalized.rsplit("/", 1)[-1]
        has_next = index + 1 < len(tokens)
        if has_next:
            next_normalized = collapse_shell_obfuscation(tokens[index + 1])
            if executable == "playwright" and next_normalized == "test":
                return True
            if normalized.endswith("@playwright/test/cli.js") and next_normalized == "test":
                return True

        inner = inline_c_command(token)
        if inner is not None and tokens_or_pattern_match(inner):
            return True

        if has_next and (token == EVAL_TOKEN or short_option_includes_c(token)):
            if is_playwright_test_invocation(tokens[index + 1]):
                return True

    return False


def is_playwright_test_invocation(command: str) -> bool:
    """Return True when any command segment invokes Playwright's test runner."""
    if not command:
        return False

    for segment in COMMAND_SEGMENT_SPLIT.split(command):
        stripped = segment.strip()
        if not stripped:
            continue
        if tokens_or_pattern_match(stripped):
            return True

    return False


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if not command:
        return 0
    if is_playwright_test_invocation(command):
        print(BLOCK_MESSAGE, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
