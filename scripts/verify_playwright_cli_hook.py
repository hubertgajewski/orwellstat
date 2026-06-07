#!/usr/bin/env python3
"""Blocks assistant shell commands that run Playwright tests outside playwright-report-mcp."""

from __future__ import annotations

import re
import shlex
import sys

BLOCK_MESSAGE = (
    "BLOCKED: direct Playwright CLI is forbidden. Use mcp__playwright-report-mcp__run_tests "
    "instead (see CLAUDE.md MCP servers section). For multiple iterations, call the MCP "
    "tool repeatedly."
)

# Fallback when shlex cannot parse a segment (combined playwright / cli.js / .bin paths).
PLAYWRIGHT_TEST_PATTERN = re.compile(
    r"(^|[^a-zA-Z0-9_-])playwright\s+test([^a-zA-Z0-9_-]|$)"
    r"|@playwright/test/cli\.js\s+test([^a-zA-Z0-9_-]|$)"
    r"|(^|[^a-zA-Z0-9_/])\.bin/playwright\s+test([^a-zA-Z0-9_-]|$)"
)

COMMAND_SEGMENT_SPLIT = re.compile(r"\s*&&\s*|\s*;\s*|\s*\|\|\s*")


def collapse_shell_obfuscation(command: str) -> str:
    """Remove quote/backslash obfuscation inside a command segment."""
    return command.replace("'", "").replace('"', "").replace("\\", "")


def normalize_token(token: str) -> str:
    return collapse_shell_obfuscation(token)


def tokens_match_playwright_test(tokens: list[str]) -> bool:
    for index, token in enumerate(tokens):
        executable = token.rsplit("/", 1)[-1]
        if executable == "playwright" and index + 1 < len(tokens) and tokens[index + 1] == "test":
            return True
        if token.endswith("@playwright/test/cli.js") and index + 1 < len(tokens) and tokens[index + 1] == "test":
            return True
    return False


def is_playwright_test_invocation(command: str) -> bool:
    if not command:
        return False

    for segment in COMMAND_SEGMENT_SPLIT.split(command):
        stripped = segment.strip()
        if not stripped:
            continue
        try:
            tokens = [normalize_token(token) for token in shlex.split(stripped, posix=True)]
        except ValueError:
            if PLAYWRIGHT_TEST_PATTERN.search(collapse_shell_obfuscation(stripped)):
                return True
            continue
        if tokens_match_playwright_test(tokens):
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
