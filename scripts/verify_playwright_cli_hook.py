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

# One combined pattern: playwright test, @playwright/test/cli.js test, .bin/playwright test
PLAYWRIGHT_TEST_PATTERN = re.compile(
    r"(^|[^a-zA-Z0-9_-])playwright\s+test([^a-zA-Z0-9_-]|$)"
    r"|@playwright/test/cli\.js\s+test([^a-zA-Z0-9_-]|$)"
    r"|(^|[^a-zA-Z0-9_/])\.bin/playwright\s+test([^a-zA-Z0-9_-]|$)"
)


def collapse_shell_obfuscation(command: str) -> str:
    """Remove quote/backslash obfuscation so play'wright' test scans as playwright test."""
    return command.replace("'", "").replace("\\", "")


def is_playwright_test_invocation(command: str) -> bool:
    collapsed = collapse_shell_obfuscation(command)
    if PLAYWRIGHT_TEST_PATTERN.search(collapsed):
        return True

    try:
        tokens = shlex.split(collapsed, posix=True)
    except ValueError:
        return False

    for index, token in enumerate(tokens):
        executable = token.rsplit("/", 1)[-1]
        if executable == "playwright" and index + 1 < len(tokens) and tokens[index + 1] == "test":
            return True
        if token.endswith("@playwright/test/cli.js") and index + 1 < len(tokens) and tokens[index + 1] == "test":
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
