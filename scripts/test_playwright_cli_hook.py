#!/usr/bin/env python3
"""Tests for scripts/verify_playwright_cli_hook.py."""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
HOOK_SCRIPT = REPO_ROOT / "scripts" / "verify_playwright_cli_hook.py"

_SPEC = importlib.util.spec_from_file_location("verify_playwright_cli_hook", HOOK_SCRIPT)
hook = importlib.util.module_from_spec(_SPEC)
assert _SPEC.loader is not None
_SPEC.loader.exec_module(hook)


def run_hook(command: str) -> tuple[int, str]:
    result = subprocess.run(
        [sys.executable, str(HOOK_SCRIPT), command],
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
            "npm install\nnpm run tsc",
            "echo 'not playwright' test",
            "   &&   ",
            "bash -lc 'git status'",
            "bash -c'echo hello'",
            "bash -lc 'npx playwright install'",
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
            "npx play'wright' test",
            "npx play\\wright test",
            "npx playw''right test",
            'node "@playwright/test/cli.js" test',
            "playwright\ttest",
            "npm install\nplaywright test",
            "npm install; playwright test",
            "false || npx playwright test",
            "bash -c 'npx playwright test'",
            "bash -lc 'npx playwright test'",
            "bash -lc'npx playwright test'",
            "bash -c'npx playwright test'",
            "eval 'npx playwright test'",
            "npx playwright test 'unclosed",
        ):
            with self.subTest(command=command):
                status, stderr = run_hook(command)
                self.assertEqual(status, 2)
                self.assertIn("BLOCKED:", stderr)
                self.assertIn("playwright-report-mcp", stderr)


class PlaywrightCliHookUnitTests(unittest.TestCase):
    def test_collapse_shell_obfuscation(self) -> None:
        self.assertEqual(hook.collapse_shell_obfuscation("npx play'wright' test"), "npx playwright test")
        self.assertEqual(hook.collapse_shell_obfuscation("npx play\\wright test"), "npx playwright test")
        self.assertEqual(
            hook.collapse_shell_obfuscation('node "@playwright/test/cli.js" test'),
            "node @playwright/test/cli.js test",
        )

    def test_inline_c_command_helpers(self) -> None:
        from shell_c_option_utils import inline_c_command, short_option_includes_c

        self.assertEqual(inline_c_command("-cnpx playwright test"), "npx playwright test")
        self.assertEqual(inline_c_command("-lcnpx playwright test"), "npx playwright test")
        self.assertEqual(inline_c_command("-ilcnpx playwright test"), "npx playwright test")
        self.assertIsNone(inline_c_command("-lc"))
        self.assertIsNone(inline_c_command("--config"))
        self.assertTrue(short_option_includes_c("-lc"))
        self.assertFalse(short_option_includes_c("--config"))


if __name__ == "__main__":
    unittest.main()
