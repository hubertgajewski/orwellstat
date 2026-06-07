#!/usr/bin/env bash
# Blocks assistant shell commands that run Playwright tests outside playwright-report-mcp.
set -euo pipefail

CMD="${1:-}"

block() {
  echo 'BLOCKED: direct Playwright CLI is forbidden. Use mcp__playwright-report-mcp__run_tests instead (see CLAUDE.md MCP servers section). For multiple iterations, call the MCP tool repeatedly.' >&2
  exit 2
}

if [[ -z "$CMD" ]]; then
  exit 0
fi

if echo "$CMD" | grep -qE '(^|[^a-zA-Z0-9_-])playwright[[:space:]]+test([^a-zA-Z0-9_-]|$)'; then
  block
fi

if echo "$CMD" | grep -qE '@playwright/test/cli\.js[[:space:]]+test([^a-zA-Z0-9_-]|$)'; then
  block
fi

if echo "$CMD" | grep -qE '(^|[^a-zA-Z0-9_/])\.bin/playwright[[:space:]]+test([^a-zA-Z0-9_-]|$)'; then
  block
fi

exit 0
