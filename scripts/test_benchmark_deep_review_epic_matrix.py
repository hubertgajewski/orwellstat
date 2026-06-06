"""Unit tests for scripts/benchmark_deep_review_epic_matrix.py.

Run directly:
    python3 scripts/test_benchmark_deep_review_epic_matrix.py
"""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path


REPO_ROOT = Path(__file__).parents[1]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


support = load_module(
    "deep_review_benchmark_support",
    REPO_ROOT / "scripts/deep_review_benchmark_support.py",
)

epic = load_module(
    "benchmark_deep_review_epic_matrix",
    REPO_ROOT / "scripts/benchmark_deep_review_epic_matrix.py",
)


class EpicBenchmarkMatrixTests(unittest.TestCase):
    def test_format_delta_handles_zero_denominator(self):
        self.assertEqual(epic.format_delta(5, 0), "5 (0.00%)")

    def test_estimate_tokens_rounds_up_four_character_chunks(self):
        self.assertEqual(epic.estimate_tokens(0), 0)
        self.assertEqual(epic.estimate_tokens(1), 1)
        self.assertEqual(epic.estimate_tokens(4), 1)
        self.assertEqual(epic.estimate_tokens(5), 2)

    def test_default_checkpoint_sequence_starts_at_original_580(self):
        names = [checkpoint.name for checkpoint in epic.DEFAULT_CHECKPOINTS]

        self.assertEqual(
            names,
            [
                "original-580",
                "post-580",
                "post-581",
                "post-582",
                "post-583",
                "post-584",
            ],
        )
        self.assertEqual(epic.DEFAULT_CHECKPOINTS[0].ref, "4398fc9")
        self.assertEqual(epic.DEFAULT_CHECKPOINTS[1].previous, "original-580")
        self.assertEqual(epic.DEFAULT_CHECKPOINTS[4].ref, "f3952ee")
        self.assertEqual(epic.DEFAULT_CHECKPOINTS[4].issue, 583)
        self.assertEqual(epic.DEFAULT_CHECKPOINTS[5].ref, "0d7add0")
        self.assertEqual(epic.DEFAULT_CHECKPOINTS[5].issue, 584)
        self.assertEqual(epic.DEFAULT_CHECKPOINTS[5].previous, "post-583")
        self.assertEqual(
            [checkpoint.dispatch_contract for checkpoint in epic.DEFAULT_CHECKPOINTS],
            [
                "dispatch-v1",
                "dispatch-v1",
                "dispatch-v1",
                "dispatch-v1",
                "dispatch-v1",
                "dispatch-v1",
            ],
        )
        self.assertEqual(
            [checkpoint.prompt_frame_contract for checkpoint in epic.DEFAULT_CHECKPOINTS],
            [
                "full-v1",
                "full-v1",
                "scoped-v1",
                "scoped-v1",
                "scoped-v1",
                "scoped-v1",
            ],
        )
        self.assertEqual(
            [checkpoint.output_contract for checkpoint in epic.DEFAULT_CHECKPOINTS],
            [
                "detailed-v1",
                "detailed-v1",
                "detailed-v1",
                "detailed-reuse-v1",
                "compact-v1",
                "compact-v1",
            ],
        )
        self.assertEqual(epic.output_mode_for_contract("detailed-v1"), "detailed")
        self.assertEqual(epic.output_mode_for_contract("detailed-reuse-v1"), "detailed")
        self.assertEqual(epic.output_mode_for_contract("compact-v1"), "compact")
        self.assertRegex(epic.resolve_ref("HEAD"), r"^[0-9a-f]+$")
        self.assertEqual(
            epic.resolve_ref("refs/heads/does-not-exist-for-test"),
            "refs/heads/does-not-exist-for-test",
        )

    def test_missing_checkpoint_refs_fail_before_fixture_loading(self):
        missing_checkpoint = epic.Checkpoint(
            name="missing-checkpoint",
            ref="refs/heads/does-not-exist-for-test",
            issue=None,
            previous=None,
            dispatch_contract="dispatch-v1",
            prompt_frame_contract="full-v1",
            output_contract="detailed-v1",
            label="Missing checkpoint",
        )
        original_load_fixtures = epic.load_fixtures

        def fail_if_called():
            self.fail("load_fixtures should not run when checkpoint refs are missing")

        try:
            epic.load_fixtures = fail_if_called
            with self.assertRaises(ValueError) as error:
                epic.build_epic_matrix(checkpoints=(missing_checkpoint,))
        finally:
            epic.load_fixtures = original_load_fixtures

        message = str(error.exception)
        self.assertIn(
            "Missing historical refs: "
            "missing-checkpoint=refs/heads/does-not-exist-for-test",
            message,
        )
        self.assertIn("Fetch full git history", message)
        self.assertIn("fetch-depth: 0", message)

    def test_missing_checkpoint_ref_fails_before_checkpoint_loading(self):
        missing_checkpoint = epic.Checkpoint(
            name="missing-checkpoint",
            ref="refs/heads/does-not-exist-for-test",
            issue=None,
            previous=None,
            dispatch_contract="dispatch-v1",
            prompt_frame_contract="full-v1",
            output_contract="detailed-v1",
            label="Missing checkpoint",
        )
        original_load_checkpoint_roster = epic.load_checkpoint_roster

        def fail_if_called(_checkpoint):
            self.fail("load_checkpoint_roster should not run when checkpoint refs are missing")

        try:
            epic.load_checkpoint_roster = fail_if_called
            with self.assertRaises(ValueError) as error:
                epic.build_checkpoint_metrics(missing_checkpoint, [], {})
        finally:
            epic.load_checkpoint_roster = original_load_checkpoint_roster

        self.assertIn(
            "Missing historical refs: "
            "missing-checkpoint=refs/heads/does-not-exist-for-test",
            str(error.exception),
        )

    def test_head_checkpoint_must_be_final_checkpoint(self):
        checkpoints = (
            epic.Checkpoint(
                name="post-583",
                ref="HEAD",
                issue=583,
                previous="post-582",
                dispatch_contract="dispatch-v1",
                prompt_frame_contract="scoped-v1",
                output_contract="compact-v1",
                label="After #583",
            ),
            epic.Checkpoint(
                name="post-584",
                ref="next-ref",
                issue=584,
                previous="post-583",
                dispatch_contract="dispatch-v1",
                prompt_frame_contract="scoped-v1",
                output_contract="compact-v1",
                label="After #584",
            ),
        )

        with self.assertRaisesRegex(ValueError, "post-583 uses HEAD"):
            epic.validate_checkpoint_sequence(checkpoints)

    def test_parse_roster_error_paths_are_explicit(self):
        with self.assertRaisesRegex(ValueError, "Malformed dispatch row"):
            epic.parse_deep_review_pro_roster("| `deep-review-code` | Domain | always |")

        with self.assertRaisesRegex(ValueError, "deep-review-pro roster not found"):
            epic.parse_deep_review_pro_roster("| Agent | Domain |\n| --- | --- |")

    def test_checkpoint_dispatch_uses_historical_roster_not_current_fixture_expectations(self):
        docs_fixture = [
            fixture
            for fixture in epic.load_fixtures()
            if fixture["name"] == "docs-only"
        ]

        matrix = epic.build_epic_matrix(fixtures=docs_fixture)
        by_name = {checkpoint["name"]: checkpoint for checkpoint in matrix["checkpoints"]}
        original_agents = by_name["original-580"]["fixtures"][0]["agents"]
        post_580_agents = by_name["post-580"]["fixtures"][0]["agents"]

        self.assertIn("deep-review-security", original_agents)
        self.assertIn("deep-review-project-checklist", original_agents)
        self.assertIn("deep-review-docs", original_agents)
        self.assertNotIn("deep-review-security", post_580_agents)
        self.assertNotIn("deep-review-project-checklist", post_580_agents)
        self.assertIn("deep-review-docs", post_580_agents)

    def test_generated_fixture_text_error_paths_are_explicit(self):
        with self.assertRaisesRegex(ValueError, "has no generated text source"):
            epic.generated_fixture_text({"name": "missing-generator"})

        with self.assertRaisesRegex(ValueError, "does not expose build_high_lines_fixture"):
            epic.generated_fixture_text(
                {
                    "name": "wrong-generator",
                    "generator": "scripts/test_benchmark_deep_review_epic_matrix.py",
                }
            )

    def test_build_epic_matrix_accepts_empty_and_single_fixture_lists(self):
        empty_matrix = epic.build_epic_matrix(fixtures=[])
        empty_totals = empty_matrix["checkpoints"][0]["totals"]

        self.assertEqual(empty_matrix["fixtures"], [])
        self.assertEqual(empty_totals["combined_chars"], 0)
        self.assertEqual(empty_totals["combined_est_tokens"], 0)

        one_fixture = epic.load_fixtures()[:1]
        single_matrix = epic.build_epic_matrix(fixtures=one_fixture)
        single_totals = single_matrix["checkpoints"][0]["totals"]

        self.assertEqual(single_matrix["fixtures"], [one_fixture[0]["name"]])
        self.assertGreater(single_totals["combined_chars"], 0)
        self.assertGreater(single_totals["combined_est_tokens"], 0)

    def test_build_epic_matrix_loads_each_fixture_text_once(self):
        fixture = epic.load_fixtures()[:1]
        original_fixture_diff_text = epic.fixture_diff_text
        calls = []

        def counting_fixture_diff_text(current_fixture):
            calls.append(current_fixture["name"])
            return original_fixture_diff_text(current_fixture)

        try:
            epic.fixture_diff_text = counting_fixture_diff_text
            epic.build_epic_matrix(fixtures=fixture)
        finally:
            epic.fixture_diff_text = original_fixture_diff_text

        self.assertEqual(calls, [fixture[0]["name"]])

    def test_compact_output_proxy_models_compact_contract(self):
        roster = {
            "deep-review-code": {
                "format": "H/M/L",
                "empty_state": "findings: none",
                "dispatch": "always",
            },
            "deep-review-docs": {
                "format": "pass/fail/N/A",
                "empty_state": "Failures: none.",
                "dispatch": "docs trigger",
            },
        }

        output = epic.compact_output_proxy(
            fixture={"name": "unit-fixture"},
            roster=roster,
            agents=["deep-review-code"],
            skipped=["deep-review-docs"],
        )

        self.assertIn("### deep-review-code", output)
        self.assertIn("findings: none", output)
        self.assertIn("summary: 0 high / 0 medium / 0 low", output)
        self.assertIn("### deep-review-docs", output)
        self.assertIn("SKIPPED: docs trigger not satisfied", output)
        self.assertIn("### aggregate", output)
        self.assertIn("total: 0 code-H / 0 code-M / 0 code-L", output)
        self.assertNotIn("<code-", output)
        self.assertIn("reuse: dispatched 1 / skipped 1 / reused 0", output)
        self.assertIn("tokens: total <value|unavailable>", output)

    def test_detailed_output_proxy_models_detailed_table_contract(self):
        roster = {
            "deep-review-docs": {
                "format": "pass/fail/N/A",
                "empty_state": "Failures: none.",
                "dispatch": "docs trigger",
            },
        }

        output = epic.detailed_output_proxy(
            fixture={"name": "unit-fixture"},
            roster=roster,
            agents=["deep-review-docs"],
            skipped=[],
            output_contract="detailed-v1",
        )

        self.assertIn("| Layer | Model | Input | Output | Total | Cache read | Cache creation | Tool uses | Wall-clock | Summary |", output)
        self.assertIn("summary: 4 pass / 0 fail / 2 N/A", output)
        self.assertIn("4 docs-pass / 0 docs-fail / 2 docs-N/A", output)
        self.assertNotIn("<docs-", output)
        self.assertIn("| totals |", output)
        self.assertIn("iterations: 1", output)
        self.assertNotIn("reuse: dispatched", output)

    def test_unknown_checkpoint_contracts_fail_clearly(self):
        checkpoint = epic.Checkpoint(
            name="bad-contract",
            ref="HEAD",
            issue=None,
            previous=None,
            dispatch_contract="unknown",
            prompt_frame_contract="unknown",
            output_contract="unknown",
            label="Bad contract",
        )
        roster = {
            "deep-review-code": {
                "domain": "code review",
                "dispatch": "always",
                "prompt_scope": "full",
                "format": "H/M/L",
                "empty_state": "findings: none",
                "blocking": "HIGH + MEDIUM",
                "tool_grant": "Read",
            },
        }

        with self.assertRaisesRegex(ValueError, "Unknown prompt-frame contract"):
            epic.prompt_frame_lengths(
                checkpoint=checkpoint,
                diff_text="diff --git a/a.py b/a.py\n",
                roster=roster,
                agents=["deep-review-code"],
            )
        with self.assertRaisesRegex(ValueError, "Unknown aggregate-output contract"):
            epic.aggregate_output_chars(
                checkpoint=checkpoint,
                fixture={"name": "unit-fixture"},
                roster=roster,
                agents=["deep-review-code"],
                skipped=[],
            )
        with self.assertRaisesRegex(ValueError, "Unknown dispatch contract"):
            epic.selected_agents_for_checkpoint(
                checkpoint=checkpoint,
                roster=roster,
                diff_text="diff --git a/a.py b/a.py\n",
            )
        with self.assertRaisesRegex(ValueError, "Unknown agent output format"):
            epic.format_spec({"format": "custom", "empty_state": "none"})
        with self.assertRaisesRegex(ValueError, "Unknown aggregate-output contract"):
            epic.output_mode_for_contract("unknown")

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
        self.assertIn("## Checkpoint Contracts", report)
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
        self.assertIn(
            "| post-582 | dispatch-v1 | scoped-v1 | detailed-reuse-v1 |",
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

        post_584_section = epic.render_issue_comparable_section(matrix, 584)

        self.assertIn("Incremental Delta: post-583 -> post-584", post_584_section)
        self.assertIn("Cumulative Delta: original-580 -> post-584", post_584_section)

    def test_missing_issue_section_fails_clearly(self):
        matrix = epic.build_epic_matrix()

        with self.assertRaisesRegex(ValueError, "post-585 is not present"):
            epic.render_issue_comparable_section(matrix, 585)

    def test_cli_issue_section_prints_section_without_path_noise(self):
        with tempfile.TemporaryDirectory() as tmp:
            stdout = StringIO()
            stderr = StringIO()
            result = None
            with redirect_stdout(stdout), redirect_stderr(stderr):
                result = epic.main(
                    [
                        "--markdown-out",
                        str(Path(tmp) / "matrix.md"),
                        "--json-out",
                        str(Path(tmp) / "matrix.json"),
                        "--issue-section",
                        "583",
                    ]
                )

        self.assertEqual(result, 0)
        self.assertTrue(stdout.getvalue().startswith("## Epic Comparable Benchmark\n"))
        self.assertIn("matrix.md", stderr.getvalue())
        self.assertIn("matrix.json", stderr.getvalue())

    def test_cli_default_writes_matrix_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            markdown_out = Path(tmp) / "matrix.md"
            json_out = Path(tmp) / "matrix.json"
            stdout = StringIO()
            stderr = StringIO()
            result = None
            with redirect_stdout(stdout), redirect_stderr(stderr):
                result = epic.main(
                    [
                        "--markdown-out",
                        str(markdown_out),
                        "--json-out",
                        str(json_out),
                    ]
                )
            markdown_exists = markdown_out.exists()
            json_exists = json_out.exists()

        self.assertEqual(result, 0)
        self.assertIn("matrix.md", stdout.getvalue())
        self.assertIn("matrix.json", stdout.getvalue())
        self.assertEqual(stderr.getvalue(), "")
        self.assertTrue(markdown_exists)
        self.assertTrue(json_exists)

    def test_cli_creates_distinct_output_directories(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            markdown_out = root / "md" / "matrix.md"
            json_out = root / "json" / "matrix.json"
            stdout = StringIO()
            stderr = StringIO()
            result = None
            with redirect_stdout(stdout), redirect_stderr(stderr):
                result = epic.main(
                    [
                        "--markdown-out",
                        str(markdown_out),
                        "--json-out",
                        str(json_out),
                    ]
                )
            markdown_exists = markdown_out.exists()
            json_exists = json_out.exists()

        self.assertEqual(result, 0)
        self.assertTrue(markdown_exists)
        self.assertTrue(json_exists)

    def test_cli_missing_issue_section_is_clean_error_without_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            markdown_out = Path(tmp) / "matrix.md"
            json_out = Path(tmp) / "matrix.json"
            stdout = StringIO()
            stderr = StringIO()
            result = None
            with redirect_stdout(stdout), redirect_stderr(stderr):
                result = epic.main(
                    [
                        "--markdown-out",
                        str(markdown_out),
                        "--json-out",
                        str(json_out),
                        "--issue-section",
                        "585",
                    ]
                )

        self.assertEqual(result, 2)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("error: post-585 is not present in the epic matrix", stderr.getvalue())
        self.assertFalse(markdown_out.exists())
        self.assertFalse(json_out.exists())

    def test_cli_build_error_is_clean_without_writes(self):
        original_build_epic_matrix = epic.build_epic_matrix

        def failing_build_epic_matrix():
            raise ValueError("Missing historical refs: missing-checkpoint=bad-ref")

        try:
            epic.build_epic_matrix = failing_build_epic_matrix
            with tempfile.TemporaryDirectory() as tmp:
                markdown_out = Path(tmp) / "matrix.md"
                json_out = Path(tmp) / "matrix.json"
                stdout = StringIO()
                stderr = StringIO()
                result = None
                with redirect_stdout(stdout), redirect_stderr(stderr):
                    result = epic.main(
                        [
                            "--markdown-out",
                            str(markdown_out),
                            "--json-out",
                            str(json_out),
                        ]
                    )
                markdown_exists = markdown_out.exists()
                json_exists = json_out.exists()
        finally:
            epic.build_epic_matrix = original_build_epic_matrix

        self.assertEqual(result, 2)
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(
            stderr.getvalue(),
            "error: Missing historical refs: missing-checkpoint=bad-ref\n",
        )
        self.assertFalse(markdown_exists)
        self.assertFalse(json_exists)

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
