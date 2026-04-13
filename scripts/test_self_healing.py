"""Unit tests for scripts/self-healing.py.

Covers all loop prevention scenarios, error classification, selector-fix
parsing, confidence filtering, multi-browser deduplication, and YAML-level
guard verification.

Usage:
    python3 scripts/test_self_healing.py
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Import self-healing.py (hyphenated filename requires importlib)
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "self_healing", Path(__file__).parent / "self-healing.py"
)
self_healing = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(self_healing)
sys.modules["self_healing"] = self_healing  # allow @patch("self_healing.gh") to resolve

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "self-healing.yml"

# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

SAMPLE_SELECTOR_FIX = textwrap.dedent("""\
    # Selector Fix Proposal

    **Confidence:** high
    **Broken selector:** `locator('#menubar').getByRole('link', { name: 'Strona glowna', exact: true })`
    **Suggested selector:** `locator('#menubar').getByRole('link', { name: 'Strona główna', exact: true })`

    ## Explanation
    The original selector used 'Strona glowna' (without Polish diacritics) but the actual link text is 'Strona główna'.""")

SAMPLE_ERROR_CONTEXT = textwrap.dedent("""\
    # Instructions

    - Following Playwright test failed.
    - Explain why, be concise, respect Playwright best practices.
    - Provide a snippet of code with the fix, if possible.

    # Test info

    - Name: navigation.spec.ts >> navigation >> home page
    - Location: tests/navigation.spec.ts:31:3

    # Error details

    ```
    TimeoutError: locator.click: Timeout 15000ms exceeded.
    Call log:
      - waiting for locator('#menubar').getByRole('link', { name: 'Strona glowna', exact: true })
    ```

    # Page snapshot

    ```yaml
    - list:
        - listitem:
            - link "Strona główna":
                - /url: /
    ```

    # Test source

    ```ts
      31 |   test('home page', async ({ page }) => {
      32 |     await page
      33 |       .locator('#menubar')
      34 |       .getByRole('link', { name: 'Strona glowna', exact: true })
    > 35 |       .click();
    ```""")

SAMPLE_SELECTOR_FIX_LOW = SAMPLE_SELECTOR_FIX.replace(
    "**Confidence:** high", "**Confidence:** low"
)
SAMPLE_SELECTOR_FIX_MEDIUM = SAMPLE_SELECTOR_FIX.replace(
    "**Confidence:** high", "**Confidence:** medium"
)

SAMPLE_RESULTS_JSON_FAILED = {
    "suites": [
        {
            "title": "navigation.spec.ts",
            "file": "navigation.spec.ts",
            "specs": [],
            "suites": [
                {
                    "title": "navigation",
                    "file": "navigation.spec.ts",
                    "line": 26,
                    "column": 6,
                    "specs": [
                        {
                            "title": "home page",
                            "ok": False,
                            "tags": ["smoke"],
                            "tests": [
                                {
                                    "timeout": 30000,
                                    "expectedStatus": "passed",
                                    "projectId": "Chromium",
                                    "projectName": "Chromium",
                                    "results": [
                                        {
                                            "status": "failed",
                                            "errors": [
                                                {
                                                    "message": "TimeoutError: locator.click: Timeout 15000ms exceeded.\nCall log:\n  - waiting for locator('#menubar').getByRole('link', { name: 'Strona glowna', exact: true })\n"
                                                }
                                            ],
                                            "attachments": [],
                                        }
                                    ],
                                    "status": "unexpected",
                                }
                            ],
                            "file": "navigation.spec.ts",
                            "line": 31,
                            "column": 3,
                        }
                    ],
                    "suites": [],
                }
            ],
        }
    ]
}

SAMPLE_RESULTS_JSON_PASSED = {
    "suites": [
        {
            "title": "navigation.spec.ts",
            "file": "navigation.spec.ts",
            "specs": [
                {
                    "title": "/ has correct title",
                    "ok": True,
                    "tags": ["smoke"],
                    "tests": [
                        {
                            "timeout": 30000,
                            "expectedStatus": "passed",
                            "projectId": "Chromium",
                            "projectName": "Chromium",
                            "results": [
                                {
                                    "status": "passed",
                                    "errors": [],
                                    "attachments": [],
                                }
                            ],
                            "status": "expected",
                        }
                    ],
                    "file": "navigation.spec.ts",
                    "line": 13,
                    "column": 3,
                }
            ],
            "suites": [],
        }
    ]
}


def _write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


# ===================================================================
# Branch guard tests
# ===================================================================


class TestBranchGuard(unittest.TestCase):
    def test_blocks_self_healing_branch(self):
        self.assertTrue(self_healing.should_skip_branch("fix/self-healing-abc123"))

    def test_blocks_self_healing_branch_with_sha(self):
        self.assertTrue(self_healing.should_skip_branch("fix/self-healing-d93137c"))

    def test_allows_feature_branch(self):
        self.assertFalse(self_healing.should_skip_branch("feature/123"))

    def test_allows_main(self):
        self.assertFalse(self_healing.should_skip_branch("main"))

    def test_allows_bugfix_branch(self):
        self.assertFalse(self_healing.should_skip_branch("bugfix/42"))

    def test_allows_empty_string(self):
        self.assertFalse(self_healing.should_skip_branch(""))


# ===================================================================
# Selector error classification tests
# ===================================================================


class TestClassification(unittest.TestCase):
    def test_skips_non_selector_error(self):
        self.assertFalse(
            self_healing.is_selector_error('Expected "foo" to equal "bar"')
        )

    def test_skips_generic_timeout(self):
        self.assertFalse(
            self_healing.is_selector_error("Navigation timeout of 30000 ms exceeded")
        )

    def test_detects_selector_timeout(self):
        self.assertTrue(
            self_healing.is_selector_error("waiting for locator('#foo')")
        )

    def test_detects_strict_mode_violation(self):
        self.assertTrue(
            self_healing.is_selector_error(
                "strict mode violation: getByRole('link') resolved to 3 elements"
            )
        )

    def test_detects_getby_timeout(self):
        self.assertTrue(
            self_healing.is_selector_error(
                "waiting for getByRole('link', { name: 'Home' })"
            )
        )

    def test_detects_locator_method_timeout(self):
        self.assertTrue(
            self_healing.is_selector_error(
                "locator.click: Timeout 15000ms exceeded"
            )
        )

    def test_case_insensitive(self):
        self.assertTrue(
            self_healing.is_selector_error("STRICT MODE VIOLATION")
        )


# ===================================================================
# Parse selector-fix.md tests
# ===================================================================


class TestParseSelectorFix(unittest.TestCase):
    def test_extracts_all_fields(self):
        fix = self_healing.parse_selector_fix(SAMPLE_SELECTOR_FIX)
        self.assertIsNotNone(fix)
        self.assertEqual(fix.confidence, "high")
        self.assertEqual(
            fix.broken_selector,
            "locator('#menubar').getByRole('link', { name: 'Strona glowna', exact: true })",
        )
        self.assertEqual(
            fix.suggested_selector,
            "locator('#menubar').getByRole('link', { name: 'Strona główna', exact: true })",
        )
        self.assertIn("diacritics", fix.explanation)

    def test_returns_none_for_malformed(self):
        self.assertIsNone(self_healing.parse_selector_fix("not a valid file"))

    def test_returns_none_for_empty(self):
        self.assertIsNone(self_healing.parse_selector_fix(""))

    def test_returns_none_for_missing_confidence(self):
        content = SAMPLE_SELECTOR_FIX.replace("**Confidence:** high", "")
        self.assertIsNone(self_healing.parse_selector_fix(content))

    def test_returns_none_for_invalid_confidence(self):
        content = SAMPLE_SELECTOR_FIX.replace("**Confidence:** high", "**Confidence:** extreme")
        self.assertIsNone(self_healing.parse_selector_fix(content))


# ===================================================================
# Confidence filter tests
# ===================================================================


class TestConfidenceFilter(unittest.TestCase):
    def _make_fix(self, confidence: str):
        return self_healing.SelectorFix(confidence, "broken", "suggested", "why")

    def test_skips_low(self):
        fixes = [self._make_fix("low")]
        self.assertEqual(self_healing.filter_by_confidence(fixes), [])

    def test_includes_medium(self):
        fixes = [self._make_fix("medium")]
        self.assertEqual(len(self_healing.filter_by_confidence(fixes)), 1)

    def test_includes_high(self):
        fixes = [self._make_fix("high")]
        self.assertEqual(len(self_healing.filter_by_confidence(fixes)), 1)

    def test_mixed(self):
        fixes = [self._make_fix("low"), self._make_fix("high"), self._make_fix("medium")]
        result = self_healing.filter_by_confidence(fixes)
        self.assertEqual(len(result), 2)
        confidences = {f.confidence for f in result}
        self.assertEqual(confidences, {"high", "medium"})


# ===================================================================
# Multi-browser dedup tests
# ===================================================================


class TestDeduplication(unittest.TestCase):
    def test_deduplicates_same_selector(self):
        fix1 = self_healing.SelectorFix("high", "getByRole('link')", "getByRole('button')", "reason")
        fix2 = self_healing.SelectorFix("medium", "getByRole('link')", "getByRole('button')", "reason2")
        result = self_healing.deduplicate_fixes([fix1, fix2])
        self.assertEqual(len(result), 1)
        # Should prefer high confidence
        self.assertEqual(result[0].confidence, "high")

    def test_keeps_different_selectors(self):
        fix1 = self_healing.SelectorFix("high", "getByRole('link')", "fix1", "reason")
        fix2 = self_healing.SelectorFix("high", "getByRole('button')", "fix2", "reason")
        result = self_healing.deduplicate_fixes([fix1, fix2])
        self.assertEqual(len(result), 2)

    def test_skips_noop_fix(self):
        """AI suggested the exact same selector — must be filtered out."""
        fix = self_healing.SelectorFix("high", "getByRole('link')", "getByRole('link')", "no change")
        result = self_healing.deduplicate_fixes([fix])
        self.assertEqual(len(result), 0)

    def test_empty_list(self):
        self.assertEqual(self_healing.deduplicate_fixes([]), [])


# ===================================================================
# Extract failed tests from results.json
# ===================================================================


class TestExtractFailedTests(unittest.TestCase):
    def test_extracts_failed_test(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(SAMPLE_RESULTS_JSON_FAILED, f)
            f.flush()
            try:
                failed = self_healing.extract_failed_tests(Path(f.name))
                self.assertEqual(len(failed), 1)
                self.assertEqual(failed[0].title, "home page")
                self.assertEqual(failed[0].project, "Chromium")
                self.assertIn("waiting for locator", failed[0].error_message)
            finally:
                os.unlink(f.name)

    def test_skips_passed_tests(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(SAMPLE_RESULTS_JSON_PASSED, f)
            f.flush()
            try:
                failed = self_healing.extract_failed_tests(Path(f.name))
                self.assertEqual(len(failed), 0)
            finally:
                os.unlink(f.name)

    def test_strips_ansi_codes(self):
        data = json.loads(json.dumps(SAMPLE_RESULTS_JSON_FAILED))
        data["suites"][0]["suites"][0]["specs"][0]["tests"][0]["results"][0]["errors"][0][
            "message"
        ] = "\x1b[2mwaiting for locator('#foo')\x1b[22m"
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(data, f)
            f.flush()
            try:
                failed = self_healing.extract_failed_tests(Path(f.name))
                self.assertEqual(len(failed), 1)
                self.assertNotIn("\x1b", failed[0].error_message)
            finally:
                os.unlink(f.name)

    def test_uses_last_retry(self):
        """When a test has multiple retries, use the last result."""
        data = json.loads(json.dumps(SAMPLE_RESULTS_JSON_FAILED))
        # Add a first result that passed (simulating a retry)
        test_obj = data["suites"][0]["suites"][0]["specs"][0]["tests"][0]
        failed_result = test_obj["results"][0]
        passed_result = {"status": "passed", "errors": [], "attachments": []}
        test_obj["results"] = [passed_result, failed_result]
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(data, f)
            f.flush()
            try:
                failed = self_healing.extract_failed_tests(Path(f.name))
                self.assertEqual(len(failed), 1)
                self.assertIn("waiting for locator", failed[0].error_message)
            finally:
                os.unlink(f.name)


# ===================================================================
# Find selector fixes in artifact directory
# ===================================================================


class TestFindSelectorFixes(unittest.TestCase):
    def test_finds_fixes_in_nested_dirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            _write_file(
                tmp_path / "test-results" / "nav-home-Chromium" / "selector-fix.md",
                SAMPLE_SELECTOR_FIX,
            )
            fixes = self_healing.find_selector_fixes(tmp_path)
            self.assertEqual(len(fixes), 1)

    def test_skips_attachments_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            _write_file(
                tmp_path / "test-results" / "nav" / "attachments" / "selector-fix.md",
                SAMPLE_SELECTOR_FIX,
            )
            fixes = self_healing.find_selector_fixes(tmp_path)
            self.assertEqual(len(fixes), 0)

    def test_returns_empty_for_no_fixes(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixes = self_healing.find_selector_fixes(Path(tmp))
            self.assertEqual(len(fixes), 0)


# ===================================================================
# Max attempts (comment counting)
# ===================================================================


class TestMaxAttempts(unittest.TestCase):
    @patch("self_healing.gh")
    def test_blocks_after_2_comments(self, mock_gh):
        mock_gh.return_value = MagicMock(returncode=0, stdout="2\n")
        count = self_healing.count_self_healing_comments(42)
        self.assertEqual(count, 2)
        self.assertTrue(count >= self_healing.MAX_ATTEMPTS)

    @patch("self_healing.gh")
    def test_allows_first_comment(self, mock_gh):
        mock_gh.return_value = MagicMock(returncode=0, stdout="0\n")
        count = self_healing.count_self_healing_comments(42)
        self.assertEqual(count, 0)
        self.assertFalse(count >= self_healing.MAX_ATTEMPTS)

    @patch("self_healing.gh")
    def test_allows_second_comment(self, mock_gh):
        mock_gh.return_value = MagicMock(returncode=0, stdout="1\n")
        count = self_healing.count_self_healing_comments(42)
        self.assertEqual(count, 1)
        self.assertFalse(count >= self_healing.MAX_ATTEMPTS)

    @patch("self_healing.gh")
    def test_handles_api_failure(self, mock_gh):
        mock_gh.return_value = MagicMock(returncode=1, stdout="")
        count = self_healing.count_self_healing_comments(42)
        self.assertEqual(count, 0)


# ===================================================================
# Draft PR dedup
# ===================================================================


class TestDraftPrDedup(unittest.TestCase):
    @patch("self_healing.gh")
    def test_blocks_existing_pr(self, mock_gh):
        mock_gh.return_value = MagicMock(
            returncode=0, stdout=json.dumps([{"number": 99}])
        )
        self.assertTrue(self_healing.has_existing_self_healing_pr())

    @patch("self_healing.gh")
    def test_allows_when_no_existing_pr(self, mock_gh):
        mock_gh.return_value = MagicMock(returncode=0, stdout="[]")
        self.assertFalse(self_healing.has_existing_self_healing_pr())


# ===================================================================
# Find PR for branch
# ===================================================================


class TestFindPrForBranch(unittest.TestCase):
    @patch("self_healing.gh")
    def test_returns_number(self, mock_gh):
        mock_gh.return_value = MagicMock(
            returncode=0, stdout=json.dumps([{"number": 42}])
        )
        self.assertEqual(self_healing.find_pr_for_branch("feature/123"), 42)

    @patch("self_healing.gh")
    def test_returns_none_for_no_pr(self, mock_gh):
        mock_gh.return_value = MagicMock(returncode=0, stdout="[]")
        self.assertIsNone(self_healing.find_pr_for_branch("main"))


# ===================================================================
# Compose comment
# ===================================================================


class TestComposeComment(unittest.TestCase):
    def test_includes_marker(self):
        fix = self_healing.SelectorFix("high", "broken", "suggested", "reason")
        body = self_healing.compose_comment([fix], "12345")
        self.assertIn(self_healing.COMMENT_MARKER, body)

    def test_includes_all_fixes(self):
        fix1 = self_healing.SelectorFix("high", "broken1", "suggested1", "reason1")
        fix2 = self_healing.SelectorFix("medium", "broken2", "suggested2", "reason2")
        body = self_healing.compose_comment([fix1, fix2], "12345")
        self.assertIn("broken1", body)
        self.assertIn("broken2", body)
        self.assertIn("suggested1", body)
        self.assertIn("suggested2", body)

    def test_includes_run_link(self):
        fix = self_healing.SelectorFix("high", "broken", "suggested", "reason")
        body = self_healing.compose_comment([fix], "99999")
        self.assertIn("99999", body)


# ===================================================================
# Dry run
# ===================================================================


class TestDryRun(unittest.TestCase):
    @patch("self_healing.gh")
    def test_dry_run_does_not_call_gh_for_comment(self, mock_gh):
        self_healing.post_comment(42, "test body", dry_run=True)
        mock_gh.assert_not_called()


# ===================================================================
# AI response parsing
# ===================================================================


class TestParseAiResponse(unittest.TestCase):
    def test_parses_valid_json(self):
        text = json.dumps({
            "confidence": "high",
            "brokenSelector": "getByRole('link')",
            "suggestedSelector": "getByRole('button')",
            "explanation": "Element changed",
        })
        fix = self_healing._parse_ai_response(text, "getByRole('link')")
        self.assertIsNotNone(fix)
        self.assertEqual(fix.confidence, "high")
        self.assertEqual(fix.suggested_selector, "getByRole('button')")

    def test_handles_markdown_fencing(self):
        text = "```json\n" + json.dumps({
            "confidence": "medium",
            "brokenSelector": "x",
            "suggestedSelector": "y",
            "explanation": "z",
        }) + "\n```"
        fix = self_healing._parse_ai_response(text, "x")
        self.assertIsNotNone(fix)

    def test_extracts_json_after_prose(self):
        """AI adds explanatory text before the fenced JSON block."""
        text = (
            "The selector failed because of a typo.\n\n"
            "```json\n"
            + json.dumps({
                "confidence": "high",
                "brokenSelector": "x",
                "suggestedSelector": "y",
                "explanation": "z",
            })
            + "\n```"
        )
        fix = self_healing._parse_ai_response(text, "x")
        self.assertIsNotNone(fix)
        self.assertEqual(fix.confidence, "high")

    def test_returns_none_for_invalid_json(self):
        self.assertIsNone(self_healing._parse_ai_response("not json", "x"))

    def test_returns_none_for_invalid_confidence(self):
        text = json.dumps({
            "confidence": "extreme",
            "brokenSelector": "x",
            "suggestedSelector": "y",
            "explanation": "z",
        })
        self.assertIsNone(self_healing._parse_ai_response(text, "x"))


# ===================================================================
# Error-context.md support in AI fallback
# ===================================================================


class TestErrorContextSupport(unittest.TestCase):
    @patch("self_healing._call_anthropic")
    def test_includes_error_context_in_prompt(self, mock_call):
        """When error-context.md is provided, it replaces dom.xhtml in the prompt."""
        mock_call.return_value = json.dumps({
            "confidence": "high",
            "brokenSelector": "locator('#menubar').getByRole('link', { name: 'Strona glowna', exact: true })",
            "suggestedSelector": "locator('#menubar').getByRole('link', { name: 'Strona główna', exact: true })",
            "explanation": "diacritic fix",
        })
        os.environ["ANTHROPIC_API_KEY"] = "test-key"
        try:
            fix = self_healing.request_selector_fix_from_ai(
                "waiting for locator('#menubar').getByRole('link', { name: 'Strona glowna', exact: true })",
                "<html></html>",
                "anthropic",
                error_context=SAMPLE_ERROR_CONTEXT,
            )
            self.assertIsNotNone(fix)
            call_args = mock_call.call_args
            user_content = call_args[0][1]  # second positional arg
            # Page snapshot and test source from error-context are included
            self.assertIn("Page snapshot", user_content)
            self.assertIn("Test source", user_content)
            # Instructions section is stripped to avoid conflicting with system prompt
            self.assertNotIn("# Instructions", user_content)
            # dom.xhtml is NOT included — error-context replaces it
            self.assertNotIn("DOM snapshot", user_content)
            self.assertNotIn("<html></html>", user_content)
        finally:
            del os.environ["ANTHROPIC_API_KEY"]

    @patch("self_healing._call_anthropic")
    def test_falls_back_to_dom_without_error_context(self, mock_call):
        """When error_context is None, prompt uses the old format with DOM only."""
        mock_call.return_value = json.dumps({
            "confidence": "medium",
            "brokenSelector": "locator('#foo')",
            "suggestedSelector": "locator('#bar')",
            "explanation": "changed",
        })
        os.environ["ANTHROPIC_API_KEY"] = "test-key"
        try:
            fix = self_healing.request_selector_fix_from_ai(
                "waiting for locator('#foo')",
                "<html><div id='bar'></div></html>",
                "anthropic",
                error_context=None,
            )
            self.assertIsNotNone(fix)
            call_args = mock_call.call_args
            user_content = call_args[0][1]
            self.assertIn("DOM snapshot", user_content)
            self.assertNotIn("Playwright error context", user_content)
        finally:
            del os.environ["ANTHROPIC_API_KEY"]


# ===================================================================
# YAML-level guard verification (static analysis of workflow file)
# ===================================================================


@unittest.skipUnless(WORKFLOW_PATH.exists(), "self-healing.yml not yet created")
class TestYamlGuards(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow_content = WORKFLOW_PATH.read_text(encoding="utf-8")

    def test_conclusion_check(self):
        self.assertIn("conclusion == 'failure'", self.workflow_content)

    def test_branch_guard(self):
        self.assertIn("fix/self-healing-", self.workflow_content)
        self.assertIn("startsWith", self.workflow_content)

    def test_feature_flag(self):
        self.assertIn("vars.SELF_HEALING", self.workflow_content)

    def test_concurrency_group(self):
        self.assertIn("concurrency:", self.workflow_content)
        self.assertIn("cancel-in-progress: false", self.workflow_content)

    def test_timeout(self):
        self.assertIn("timeout-minutes:", self.workflow_content)

    def test_repo_check(self):
        self.assertIn("github.repository", self.workflow_content)


if __name__ == "__main__":
    unittest.main()
