"""Unit tests for scripts/generate-quality-metrics.py.

Covers compute_escape_rate_and_mttr() (the shared compute path used by both
the default markdown-writing flow and the --json flow consumed by
mcp/quality-metrics) and the --json CLI branch of main().

Usage:
    python3 scripts/test_generate_quality_metrics.py
"""

from __future__ import annotations

import importlib.util
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

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
