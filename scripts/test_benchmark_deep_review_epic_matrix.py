"""Unit tests for scripts/benchmark_deep_review_epic_matrix.py.

Run directly:
    python3 scripts/test_benchmark_deep_review_epic_matrix.py
"""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).parents[1]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


epic = load_module(
    "benchmark_deep_review_epic_matrix",
    REPO_ROOT / "scripts/benchmark_deep_review_epic_matrix.py",
)


class EpicBenchmarkMatrixTests(unittest.TestCase):
    def test_default_checkpoint_sequence_starts_at_original_580(self):
        names = [checkpoint.name for checkpoint in epic.DEFAULT_CHECKPOINTS]

        self.assertEqual(
            names,
            ["original-580", "post-580", "post-581", "post-582", "post-583"],
        )
        self.assertEqual(epic.DEFAULT_CHECKPOINTS[0].ref, "4398fc9")
        self.assertEqual(epic.DEFAULT_CHECKPOINTS[1].previous, "original-580")
        self.assertEqual(epic.DEFAULT_CHECKPOINTS[4].issue, 583)
        self.assertEqual(epic.resolve_ref("HEAD"), "HEAD")

    def test_matrix_records_incremental_and_original_580_cumulative_deltas(self):
        matrix = epic.build_epic_matrix()
        by_name = {checkpoint["name"]: checkpoint for checkpoint in matrix["checkpoints"]}

        self.assertGreater(
            by_name["original-580"]["totals"]["combined_chars"],
            by_name["post-583"]["totals"]["combined_chars"],
        )
        self.assertGreater(
            by_name["original-580"]["totals"]["combined_est_tokens"],
            by_name["post-583"]["totals"]["combined_est_tokens"],
        )
        self.assertEqual(
            matrix["deltas"]["post-580"]["from_checkpoint"],
            "original-580",
        )
        self.assertEqual(
            matrix["deltas"]["post-583"]["cumulative_from"],
            "original-580",
        )
        self.assertEqual(
            matrix["deltas"]["post-583"]["cumulative"]["combined_est_tokens"],
            (
                by_name["post-583"]["totals"]["combined_est_tokens"]
                - by_name["original-580"]["totals"]["combined_est_tokens"]
            ),
        )

    def test_markdown_report_uses_comparable_units_and_table_titles(self):
        matrix = epic.build_epic_matrix()
        report = epic.render_epic_report(matrix)

        self.assertIn("# Issue 587 Deep-Review-Pro Token-Cost Matrix", report)
        self.assertIn("## Checkpoints", report)
        self.assertIn("## Incremental Deltas", report)
        self.assertIn("## Cumulative Deltas vs Original #580 Baseline", report)
        self.assertIn(
            "| Checkpoint | Ref | Prompt chars | Prompt est. tokens | Aggregate-output chars | Aggregate-output est. tokens | Combined chars | Combined est. tokens |",
            report,
        )
        self.assertIn(
            "| Issue | From | To | Combined chars before | Combined chars after | Char delta | Combined est. tokens before | Combined est. tokens after | Token delta |",
            report,
        )
        self.assertIn("original-580", report)
        self.assertIn("post-583", report)
        self.assertNotIn("Direct #580 vs #583 Comparison", report)

    def test_issue_report_sections_are_generated_from_matrix(self):
        matrix = epic.build_epic_matrix()
        section = epic.render_issue_comparable_section(matrix, 581)

        self.assertIn("## Epic Comparable Benchmark", section)
        self.assertIn("Incremental Delta: post-580 -> post-581", section)
        self.assertIn("Cumulative Delta: original-580 -> post-581", section)
        self.assertIn("Combined chars", section)
        self.assertIn("Combined est. tokens", section)

    def test_missing_issue_section_fails_clearly(self):
        matrix = epic.build_epic_matrix()

        with self.assertRaisesRegex(ValueError, "post-584 is not present"):
            epic.render_issue_comparable_section(matrix, 584)

    def test_existing_issue_reports_include_epic_comparable_sections(self):
        expected = {
            580: "Incremental Delta: original-580 -> post-580",
            581: "Incremental Delta: post-580 -> post-581",
            582: "Incremental Delta: post-581 -> post-582",
            583: "Incremental Delta: post-582 -> post-583",
        }
        report_paths = {
            580: REPO_ROOT / "docs/deep-review-pro-benchmark/reports/580-conditional-dispatch.md",
            581: REPO_ROOT / "docs/deep-review-pro-benchmark/reports/581-agent-subdiffs.md",
            582: REPO_ROOT / "docs/deep-review-pro-benchmark/reports/582-rerun-cache.md",
            583: REPO_ROOT / "docs/deep-review-pro-benchmark/reports/583-output-verbosity.md",
        }

        for issue, expected_line in expected.items():
            with self.subTest(issue=issue):
                report = report_paths[issue].read_text()
                self.assertIn("## Epic Comparable Benchmark", report)
                self.assertIn(expected_line, report)
                self.assertIn("Cumulative Delta: original-580 -> post-", report)
                self.assertIn("Combined est. tokens", report)


if __name__ == "__main__":
    unittest.main()
