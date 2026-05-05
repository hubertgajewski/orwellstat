"""Unit tests for scripts/generate-quality-metrics.py.

Covers compute_escape_rate_and_mttr() (the shared compute path used by both
the default markdown-writing flow and the --json flow consumed by
mcp/quality-metrics), the --json CLI branch of main(), the full
markdown-writing flow, and the helpers (gh_issues, mttr, compute_coverage,
icon, write_step_summary).

Usage:
    python3 scripts/test_generate_quality_metrics.py
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

_spec = importlib.util.spec_from_file_location(
    "gen_quality_metrics", Path(__file__).parent / "generate-quality-metrics.py"
)
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)
sys.modules["gen_quality_metrics"] = gen


def fake_gh_issues(responses):
    """Build a fake gh_issues that returns responses keyed by (labels, state)."""

    def _fake(labels, state="all", extra_fields=None):
        key = (labels, state)
        if key not in responses:
            raise AssertionError(f"unexpected gh_issues call: {key!r}")
        return responses[key]

    return _fake


class ComputeEscapeRateAndMttrTests(unittest.TestCase):
    def test_normal_bugs_produces_expected_shape(self):
        responses = {
            ("bug,found-by-test", "all"): [{"number": 1}] * 5,
            ("bug,found-by-manual-testing", "all"): [{"number": 2}] * 1,
            ("bug,found-in-production", "all"): [{"number": 3}] * 1,
            ("bug", "closed"): [
                {"number": 10, "createdAt": "2026-01-01T00:00:00Z", "closedAt": "2026-01-02T12:00:00Z"},
            ],
            ("bug,found-by-test", "closed"): [
                {"number": 11, "createdAt": "2026-01-01T00:00:00Z", "closedAt": "2026-01-03T00:00:00Z"},
            ],
            ("bug,found-by-manual-testing", "closed"): [
                {"number": 12, "createdAt": "2026-01-01T00:00:00Z", "closedAt": "2026-01-01T02:00:00Z"},
            ],
            ("bug,found-in-production", "closed"): [
                {"number": 13, "createdAt": "2026-01-01T00:00:00Z", "closedAt": "2026-01-01T00:30:00Z"},
            ],
        }
        with patch.object(gen, "gh_issues", side_effect=fake_gh_issues(responses)):
            result = gen.compute_escape_rate_and_mttr()

        self.assertEqual(result["total_bugs"], 7)
        self.assertEqual(
            result["counts"],
            {
                "found-by-test": 5,
                "found-by-manual-testing": 1,
                "found-in-production": 1,
            },
        )
        # 1 prod / 7 total = 14.28% -> "14%"
        self.assertEqual(result["escape_rate"], "14%")
        # mttr values should be non-N/A format strings
        self.assertIn("days", result["mttr"]["all"] + result["mttr"]["found-by-test"])
        self.assertEqual(set(result["mttr"].keys()), {"all", "found-by-test", "found-by-manual-testing", "found-in-production"})

    def test_zero_bugs_returns_na_without_division(self):
        responses = {
            ("bug,found-by-test", "all"): [],
            ("bug,found-by-manual-testing", "all"): [],
            ("bug,found-in-production", "all"): [],
            ("bug", "closed"): [],
            ("bug,found-by-test", "closed"): [],
            ("bug,found-by-manual-testing", "closed"): [],
            ("bug,found-in-production", "closed"): [],
        }
        with patch.object(gen, "gh_issues", side_effect=fake_gh_issues(responses)):
            result = gen.compute_escape_rate_and_mttr()

        self.assertEqual(result["total_bugs"], 0)
        self.assertEqual(result["escape_rate"], "N/A")
        self.assertEqual(result["mttr"]["all"], "N/A (no closed bugs)")
        # per-label MTTRs fall back to the default "N/A"
        self.assertEqual(result["mttr"]["found-by-test"], "N/A")

    def test_all_bugs_in_production_reports_100_percent(self):
        responses = {
            ("bug,found-by-test", "all"): [],
            ("bug,found-by-manual-testing", "all"): [],
            ("bug,found-in-production", "all"): [{"number": 1}, {"number": 2}],
            ("bug", "closed"): [],
            ("bug,found-by-test", "closed"): [],
            ("bug,found-by-manual-testing", "closed"): [],
            ("bug,found-in-production", "closed"): [],
        }
        with patch.object(gen, "gh_issues", side_effect=fake_gh_issues(responses)):
            result = gen.compute_escape_rate_and_mttr()
        self.assertEqual(result["escape_rate"], "100%")

    def test_closed_issue_with_null_closedAt_is_skipped(self):
        # mttr() guards against null closedAt; fall back to "N/A" when every closed issue lacks it.
        responses = {
            ("bug,found-by-test", "all"): [],
            ("bug,found-by-manual-testing", "all"): [],
            ("bug,found-in-production", "all"): [{"number": 1}],
            ("bug", "closed"): [{"number": 2, "createdAt": "2026-01-01T00:00:00Z", "closedAt": None}],
            ("bug,found-by-test", "closed"): [],
            ("bug,found-by-manual-testing", "closed"): [],
            ("bug,found-in-production", "closed"): [],
        }
        with patch.object(gen, "gh_issues", side_effect=fake_gh_issues(responses)):
            result = gen.compute_escape_rate_and_mttr()
        self.assertEqual(result["mttr"]["all"], "N/A (no closed bugs)")


class GhIssuesTests(unittest.TestCase):
    def _fake_run(self, issues, *, returncode=0):
        result = MagicMock()
        result.returncode = returncode
        result.stdout = json.dumps(issues)
        result.stderr = ""
        return result

    def test_returns_parsed_json_payload(self):
        payload = [{"number": 1}, {"number": 2}]
        with patch("subprocess.run", return_value=self._fake_run(payload)) as mock_run:
            result = gen.gh_issues("bug", state="closed", extra_fields=["createdAt"])
        self.assertEqual(result, payload)
        # argv form, no shell interpolation
        args = mock_run.call_args[0][0]
        self.assertEqual(args[:5], ["gh", "issue", "list", "--label", "bug"])
        self.assertIn("--json", args)
        self.assertIn("number,createdAt", args)

    def test_warns_when_pagination_limit_hit(self):
        payload = [{"number": i} for i in range(1000)]
        stderr = io.StringIO()
        with (
            patch("subprocess.run", return_value=self._fake_run(payload)),
            patch.object(sys, "stderr", stderr),
        ):
            result = gen.gh_issues("bug")
        self.assertEqual(len(result), 1000)
        self.assertIn("1000-item limit", stderr.getvalue())

    def test_does_not_warn_below_limit(self):
        payload = [{"number": i} for i in range(999)]
        stderr = io.StringIO()
        with (
            patch("subprocess.run", return_value=self._fake_run(payload)),
            patch.object(sys, "stderr", stderr),
        ):
            gen.gh_issues("bug")
        self.assertEqual(stderr.getvalue(), "")


class MttrHelperTests(unittest.TestCase):
    def test_returns_na_label_for_empty_list(self):
        self.assertEqual(gen.mttr([], "custom-na"), "custom-na")
        self.assertEqual(gen.mttr([]), "N/A")

    def test_reports_days_when_average_exceeds_one_day(self):
        issues = [
            {"createdAt": "2026-01-01T00:00:00Z", "closedAt": "2026-01-03T00:00:00Z"},
            {"createdAt": "2026-01-01T00:00:00Z", "closedAt": "2026-01-05T00:00:00Z"},
        ]
        # avg = 3 days -> "3.0 days"
        self.assertEqual(gen.mttr(issues), "3.0 days")

    def test_reports_hours_when_average_under_one_day(self):
        issues = [
            {"createdAt": "2026-01-01T00:00:00Z", "closedAt": "2026-01-01T02:00:00Z"},
        ]
        self.assertEqual(gen.mttr(issues), "2.0 hours")

    def test_skips_issues_with_null_closedAt(self):
        issues = [
            {"createdAt": "2026-01-01T00:00:00Z", "closedAt": None},
            {"createdAt": "2026-01-01T00:00:00Z", "closedAt": "2026-01-02T00:00:00Z"},
        ]
        # Only the second issue contributes — avg = 1 day
        self.assertEqual(gen.mttr(issues), "1.0 days")

    def test_returns_na_when_all_issues_have_null_closedAt(self):
        issues = [{"createdAt": "2026-01-01T00:00:00Z", "closedAt": None}]
        self.assertEqual(gen.mttr(issues, "empty"), "empty")


class ComputeCoverageTests(unittest.TestCase):
    def test_computes_pct_and_counts_for_typical_matrix(self):
        matrix = {
            "pages": {
                "/a": {"title": True, "content": True, "accessibility": True, "visualRegression": True, "api": True},
                "/b": {"title": True, "content": False, "accessibility": False, "visualRegression": False, "api": False},
            },
            "forms": {"form1": True, "form2": False},
        }
        pct, covered, total, pages, forms = gen.compute_coverage(matrix)
        self.assertEqual(covered, 7)
        self.assertEqual(total, 18)
        self.assertEqual(pct, round(7 * 100 / 18))
        self.assertIs(pages, matrix["pages"])
        self.assertIs(forms, matrix["forms"])

    def test_returns_zero_percent_for_empty_matrix(self):
        pct, covered, total, _pages, _forms = gen.compute_coverage({})
        self.assertEqual((pct, covered, total), (0, 0, 0))

    def test_missing_category_keys_count_as_uncovered(self):
        matrix = {"pages": {"/a": {}}, "forms": {}}
        pct, covered, total, _pages, _forms = gen.compute_coverage(matrix)
        self.assertEqual(covered, 0)
        self.assertEqual(total, len(gen.CATEGORIES))
        self.assertEqual(pct, 0)

    def test_respects_active_and_page_applicable_categories(self):
        matrix = {
            "pages": {
                "/page": {
                    "title": True,
                    "content": False,
                    "accessibility": True,
                    "visualRegression": False,
                    "api": True,
                    "securityHeaders": True,
                    "negativePath": False,
                    "tracking": False,
                },
                "/scripts/*.php": {
                    "title": False,
                    "content": False,
                    "accessibility": False,
                    "visualRegression": False,
                    "api": False,
                    "securityHeaders": False,
                    "negativePath": False,
                    "tracking": True,
                },
            },
            "activePageCategories": [
                "title",
                "content",
                "accessibility",
                "visualRegression",
                "api",
                "tracking",
            ],
            "defaultApplicablePageCategories": [
                "title",
                "content",
                "accessibility",
                "visualRegression",
                "api",
            ],
            "pageApplicableCategories": {
                "/scripts/*.php": ["tracking"],
            },
            "forms": {"form1": True, "form2": False},
        }
        pct, covered, total, _pages, _forms = gen.compute_coverage(matrix)
        self.assertEqual(covered, 5)
        self.assertEqual(total, 8)
        self.assertEqual(pct, round(5 * 100 / 8))


class IconTests(unittest.TestCase):
    def test_icon_truthy(self):
        self.assertEqual(gen.icon(True), ":white_check_mark:")

    def test_icon_falsy(self):
        self.assertEqual(gen.icon(False), ":x:")
        self.assertEqual(gen.icon(0), ":x:")
        self.assertEqual(gen.icon(""), ":x:")


class WriteStepSummaryTests(unittest.TestCase):
    def test_noop_without_env_var(self):
        # Must not raise when GITHUB_STEP_SUMMARY is unset
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GITHUB_STEP_SUMMARY", None)
            gen.write_step_summary(["line1", "line2"])

    def test_appends_lines_when_env_var_set(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "summary.md"
            path.write_text("existing\n")
            with patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(path)}):
                gen.write_step_summary(["new-line-1", "new-line-2"])
            self.assertEqual(path.read_text(), "existing\nnew-line-1\nnew-line-2\n")


class MainMarkdownFlowTests(unittest.TestCase):
    """Exercise main()'s default (markdown-writing) branch end-to-end."""

    def _gh_responses(self):
        closed_issue = {
            "number": 10,
            "createdAt": "2026-01-01T00:00:00Z",
            "closedAt": "2026-01-02T00:00:00Z",
        }
        return {
            ("bug,found-by-test", "all"): [{"number": 1}, {"number": 2}],
            ("bug,found-by-manual-testing", "all"): [{"number": 3}],
            ("bug,found-in-production", "all"): [{"number": 4}],
            ("bug", "closed"): [closed_issue],
            ("bug,found-by-test", "closed"): [closed_issue],
            ("bug,found-by-manual-testing", "closed"): [],
            ("bug,found-in-production", "closed"): [],
        }

    def _coverage_matrix(self):
        return {
            "pages": {
                "/a": {"title": True, "content": True, "accessibility": True, "visualRegression": True, "api": True},
                "/b": {"title": False, "content": False, "accessibility": False, "visualRegression": False, "api": False},
            },
            "forms": {"login": True, "register": False},
        }

    def test_writes_report_history_and_step_summary(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            matrix_path = tmp_path / "coverage-matrix.json"
            history_path = tmp_path / "quality-metrics-history.json"
            report_path = tmp_path / "QUALITY_METRICS.md"
            summary_path = tmp_path / "summary.md"
            summary_path.write_text("")

            matrix_path.write_text(json.dumps(self._coverage_matrix()))
            # seed a history entry for a different date to ensure both rows persist
            history_path.write_text(json.dumps([
                {"date": "2025-12-31", "escape_rate": "5%", "mttr": "1.0 days", "coverage": "50%"},
            ]))

            with (
                patch.object(gen, "COVERAGE_MATRIX", matrix_path),
                patch.object(gen, "HISTORY_FILE", history_path),
                patch.object(gen, "REPORT_FILE", report_path),
                patch.object(gen, "gh_issues", side_effect=fake_gh_issues(self._gh_responses())),
                patch.object(sys, "argv", ["generate-quality-metrics.py"]),
                patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(summary_path)}),
            ):
                gen.main()

            report = report_path.read_text()
            self.assertIn("# Quality Metrics", report)
            self.assertIn("## Defect Escape Rate", report)
            self.assertIn("## Mean Time To Resolve", report)
            self.assertIn("## Test Coverage Matrix", report)
            self.assertIn("## Trends", report)
            # escape rate 1 prod / 4 total = 25%
            self.assertIn("25%", report)
            # Historical row preserved; new row appended
            self.assertIn("2025-12-31", report)

            history = json.loads(history_path.read_text())
            self.assertEqual(len(history), 2)
            # Second entry should be today's
            self.assertEqual(history[0]["date"], "2025-12-31")

            summary = summary_path.read_text()
            self.assertIn("Quality Metrics Report", summary)
            self.assertIn("Defect Escape Rate", summary)

    def test_reruns_upsert_history_row_for_same_date(self):
        """Re-running on the same day must not append a duplicate row."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            matrix_path = tmp_path / "coverage-matrix.json"
            history_path = tmp_path / "quality-metrics-history.json"
            report_path = tmp_path / "QUALITY_METRICS.md"
            matrix_path.write_text(json.dumps({"pages": {}, "forms": {}}))
            history_path.write_text("[]")

            with (
                patch.object(gen, "COVERAGE_MATRIX", matrix_path),
                patch.object(gen, "HISTORY_FILE", history_path),
                patch.object(gen, "REPORT_FILE", report_path),
                patch.object(gen, "gh_issues", side_effect=fake_gh_issues(self._gh_responses())),
                patch.object(sys, "argv", ["generate-quality-metrics.py"]),
            ):
                gen.main()
                gen.main()

            history = json.loads(history_path.read_text())
            self.assertEqual(len(history), 1)

    def test_handles_missing_coverage_matrix_gracefully(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            missing_matrix = tmp_path / "does-not-exist.json"
            history_path = tmp_path / "quality-metrics-history.json"
            report_path = tmp_path / "QUALITY_METRICS.md"
            history_path.write_text("[]")

            with (
                patch.object(gen, "COVERAGE_MATRIX", missing_matrix),
                patch.object(gen, "HISTORY_FILE", history_path),
                patch.object(gen, "REPORT_FILE", report_path),
                patch.object(gen, "gh_issues", side_effect=fake_gh_issues(self._gh_responses())),
                patch.object(sys, "argv", ["generate-quality-metrics.py"]),
            ):
                gen.main()

            report = report_path.read_text()
            self.assertIn("Coverage matrix not available", report)

    def test_creates_history_file_when_missing(self):
        """Exercise the branch where quality-metrics-history.json does not yet exist."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            matrix_path = tmp_path / "coverage-matrix.json"
            history_path = tmp_path / "quality-metrics-history.json"
            report_path = tmp_path / "QUALITY_METRICS.md"
            matrix_path.write_text(json.dumps({"pages": {}, "forms": {}}))
            # history file intentionally missing

            with (
                patch.object(gen, "COVERAGE_MATRIX", matrix_path),
                patch.object(gen, "HISTORY_FILE", history_path),
                patch.object(gen, "REPORT_FILE", report_path),
                patch.object(gen, "gh_issues", side_effect=fake_gh_issues(self._gh_responses())),
                patch.object(sys, "argv", ["generate-quality-metrics.py"]),
            ):
                gen.main()

            self.assertTrue(history_path.exists())
            history = json.loads(history_path.read_text())
            self.assertEqual(len(history), 1)

    def test_renders_caught_before_production_message_when_no_prod_bugs(self):
        """Non-zero bugs but none in production should render the 'all caught' note."""
        responses = {
            ("bug,found-by-test", "all"): [{"number": 1}, {"number": 2}],
            ("bug,found-by-manual-testing", "all"): [{"number": 3}],
            ("bug,found-in-production", "all"): [],
            ("bug", "closed"): [],
            ("bug,found-by-test", "closed"): [],
            ("bug,found-by-manual-testing", "closed"): [],
            ("bug,found-in-production", "closed"): [],
        }
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            matrix_path = tmp_path / "coverage-matrix.json"
            history_path = tmp_path / "quality-metrics-history.json"
            report_path = tmp_path / "QUALITY_METRICS.md"
            matrix_path.write_text(json.dumps({"pages": {}, "forms": {}}))
            history_path.write_text("[]")

            with (
                patch.object(gen, "COVERAGE_MATRIX", matrix_path),
                patch.object(gen, "HISTORY_FILE", history_path),
                patch.object(gen, "REPORT_FILE", report_path),
                patch.object(gen, "gh_issues", side_effect=fake_gh_issues(responses)),
                patch.object(sys, "argv", ["generate-quality-metrics.py"]),
            ):
                gen.main()

            report = report_path.read_text()
            self.assertIn("All bugs were caught before production", report)

    def test_zero_bugs_renders_no_bugs_labeled_message(self):
        empty_responses = {key: [] for key in self._gh_responses()}
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            matrix_path = tmp_path / "coverage-matrix.json"
            history_path = tmp_path / "quality-metrics-history.json"
            report_path = tmp_path / "QUALITY_METRICS.md"
            matrix_path.write_text(json.dumps({"pages": {}, "forms": {}}))
            history_path.write_text("[]")

            with (
                patch.object(gen, "COVERAGE_MATRIX", matrix_path),
                patch.object(gen, "HISTORY_FILE", history_path),
                patch.object(gen, "REPORT_FILE", report_path),
                patch.object(gen, "gh_issues", side_effect=fake_gh_issues(empty_responses)),
                patch.object(sys, "argv", ["generate-quality-metrics.py"]),
            ):
                gen.main()

            report = report_path.read_text()
            self.assertIn("No bugs have been labeled yet", report)


class JsonFlagTests(unittest.TestCase):
    def test_json_flag_prints_parseable_json_and_writes_no_files(self):
        responses = {
            ("bug,found-by-test", "all"): [{"number": 1}],
            ("bug,found-by-manual-testing", "all"): [],
            ("bug,found-in-production", "all"): [],
            ("bug", "closed"): [],
            ("bug,found-by-test", "closed"): [],
            ("bug,found-by-manual-testing", "closed"): [],
            ("bug,found-in-production", "closed"): [],
        }
        buf = io.StringIO()
        with (
            patch.object(gen, "gh_issues", side_effect=fake_gh_issues(responses)),
            patch.object(sys, "argv", ["generate-quality-metrics.py", "--json"]),
            patch.object(sys, "stdout", buf),
        ):
            gen.main()

        parsed = json.loads(buf.getvalue())
        # Contract the MCP server depends on:
        self.assertIn("total_bugs", parsed)
        self.assertIn("counts", parsed)
        self.assertIn("escape_rate", parsed)
        self.assertIn("mttr", parsed)
        self.assertEqual(parsed["total_bugs"], 1)
        self.assertEqual(parsed["escape_rate"], "0%")


if __name__ == "__main__":
    unittest.main()
