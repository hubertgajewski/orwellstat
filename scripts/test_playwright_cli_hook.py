#!/usr/bin/env python3
"""Tests for scripts/verify_playwright_cli_hook.sh."""

from __future__ import annotations

import subprocess
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
HOOK_SCRIPT = REPO_ROOT / "scripts" / "verify_playwright_cli_hook.sh"


def run_hook(command: str) -> tuple[int, str]:
    result = subprocess.run(
        [str(HOOK_SCRIPT), command],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode, result.stderr


class PlaywrightCliHookTests(unittest.TestCase):
    def test_allows_unrelated_commands(self) -> None:
        for command in (
            "npm run tsc",
            "npx playwright install",
            "npx playwright show-report",
            "git status",
            "",
        ):
            with self.subTest(command=command):
                status, stderr = run_hook(command)
                self.assertEqual(status, 0, stderr)

    def test_blocks_direct_playwright_test_invocations(self) -> None:
        for command in (
            "npx playwright test",
            "cd playwright/typescript && npx playwright test --grep @smoke",
            "playwright test tests/foo.spec.ts",
            "node node_modules/@playwright/test/cli.js test --grep-invert visual",
            "node_modules/.bin/playwright test",
        ):
            with self.subTest(command=command):
                status, stderr = run_hook(command)
                self.assertEqual(status, 2)
                self.assertIn("BLOCKED:", stderr)
                self.assertIn("playwright-report-mcp", stderr)


if __name__ == "__main__":
    unittest.main()
