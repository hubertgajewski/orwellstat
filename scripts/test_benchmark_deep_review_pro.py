"""Unit tests for scripts/benchmark-deep-review-pro.py.

Usage:
    python3 scripts/test_benchmark_deep_review_pro.py
"""

from __future__ import annotations

import importlib.util
import csv
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_spec = importlib.util.spec_from_file_location(
    "benchmark_deep_review_pro",
    Path(__file__).parent / "benchmark-deep-review-pro.py",
)
benchmark = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(benchmark)
sys.modules["benchmark_deep_review_pro"] = benchmark

_generator_spec = importlib.util.spec_from_file_location(
    "generate_deep_review_high_lines_fixture",
    Path(__file__).parent / "generate-deep-review-high-lines-fixture.py",
)
high_lines_generator = importlib.util.module_from_spec(_generator_spec)
_generator_spec.loader.exec_module(high_lines_generator)
sys.modules["generate_deep_review_high_lines_fixture"] = high_lines_generator


def write_json(path: Path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def write_run_fixture(run_dir: Path, fixture_name: str, agents, *, input_tokens=10):
    fixture_dir = run_dir / fixture_name
    (fixture_dir / "agents").mkdir(parents=True)
    (fixture_dir / "orchestrator.jsonl").write_text(
        json.dumps(
            {
                "message": {
                    "usage": {
                        "input_tokens": input_tokens,
                        "output_tokens": 5,
                        "cache_read_input_tokens": 2,
                        "cache_creation_input_tokens": 1,
                    }
                }
            }
        )
        + "\n"
    )
    for agent in agents:
        (fixture_dir / "agents" / f"{agent}.txt").write_text(
            "<usage>\n"
            '{"total_tokens": 20, "tool_uses": 3, "duration_ms": 40}'
            "\n</usage>\n"
        )


def read_deep_review_pro_dispatch_cells() -> dict[str, str]:
    skill_text = (
        Path(__file__).parents[1] / ".claude/skills/deep-review-pro/SKILL.md"
    ).read_text()
    dispatch_cells = {}
    for line in skill_text.splitlines():
        if not line.startswith("| `deep-review-"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        dispatch_cells[cells[0].strip("`")] = cells[2]
    return dispatch_cells


class OrchestratorUsageTests(unittest.TestCase):
    def test_sums_exact_jsonl_usage_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "session.jsonl"
            log.write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "message": {
                                    "usage": {
                                        "input_tokens": 10,
                                        "output_tokens": 5,
                                        "cache_read_input_tokens": 2,
                                        "cache_creation_input_tokens": 1,
                                    }
                                }
                            }
                        ),
                        json.dumps(
                            {
                                "message": {
                                    "usage": {
                                        "input_tokens": 3,
                                        "output_tokens": 7,
                                        "cache_read_input_tokens": 11,
                                        "cache_creation_input_tokens": 13,
                                    }
                                }
                            }
                        ),
                    ]
                )
                + "\n"
            )

            result = benchmark.parse_orchestrator_jsonl(log)

        self.assertEqual(result["input"], {"value": 13, "availability": "exact"})
        self.assertEqual(result["output"], {"value": 12, "availability": "exact"})
        self.assertEqual(result["cache_read"], {"value": 13, "availability": "exact"})
        self.assertEqual(result["cache_creation"], {"value": 14, "availability": "exact"})

    def test_missing_jsonl_field_is_unavailable_not_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "session.jsonl"
            log.write_text(
                json.dumps(
                    {
                        "message": {
                            "usage": {
                                "input_tokens": 10,
                                "output_tokens": 5,
                            }
                        }
                    }
                )
                + "\n"
            )

            result = benchmark.parse_orchestrator_jsonl(log)

        self.assertEqual(result["input"], {"value": 10, "availability": "exact"})
        self.assertEqual(result["cache_read"]["value"], None)
        self.assertEqual(result["cache_read"]["availability"], "unavailable")
        self.assertIn("cache_read_input_tokens", result["cache_read"]["reason"])

    def test_missing_jsonl_file_marks_every_orchestrator_field_unavailable(self):
        result = benchmark.parse_orchestrator_jsonl(Path("/tmp/does-not-exist.jsonl"))

        for field in ("input", "output", "cache_read", "cache_creation"):
            self.assertEqual(result[field]["value"], None)
            self.assertEqual(result[field]["availability"], "unavailable")

    def test_unreadable_jsonl_path_marks_every_orchestrator_field_unavailable(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = benchmark.parse_orchestrator_jsonl(Path(tmp))

        for field in ("input", "output", "cache_read", "cache_creation"):
            self.assertEqual(result[field]["value"], None)
            self.assertEqual(result[field]["availability"], "unavailable")
            self.assertIn("unreadable", result[field]["reason"])

    def test_invalid_jsonl_and_nonnumeric_fields_are_unavailable(self):
        with tempfile.TemporaryDirectory() as tmp:
            invalid = Path(tmp) / "invalid.jsonl"
            invalid.write_text("{not json}\n")
            invalid_result = benchmark.parse_orchestrator_jsonl(invalid)

            nonnumeric = Path(tmp) / "nonnumeric.jsonl"
            nonnumeric.write_text(
                json.dumps(
                    {
                        "message": {
                            "usage": {
                                "input_tokens": "ten",
                                "output_tokens": 5,
                                "cache_read_input_tokens": 2,
                                "cache_creation_input_tokens": 1,
                            }
                        }
                    }
                )
                + "\n"
            )
            nonnumeric_result = benchmark.parse_orchestrator_jsonl(nonnumeric)

        self.assertEqual(invalid_result["input"]["availability"], "unavailable")
        self.assertIn("not valid JSON", invalid_result["input"]["reason"])
        self.assertEqual(nonnumeric_result["input"]["availability"], "unavailable")
        self.assertIn("not numeric", nonnumeric_result["input"]["reason"])

    def test_jsonl_without_usage_records_is_unavailable(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "session.jsonl"
            log.write_text(json.dumps({"message": {}}) + "\n")

            result = benchmark.parse_orchestrator_jsonl(log)

        self.assertEqual(result["input"]["availability"], "unavailable")
        self.assertIn("no message.usage", result["input"]["reason"])


class AgentUsageTests(unittest.TestCase):
    def test_parses_json_usage_postscript(self):
        text = """findings: none
summary: 0 high / 0 medium / 0 low
<usage>
{"total_tokens": 123, "tool_uses": 4, "duration_ms": 5678}
</usage>
"""

        result = benchmark.parse_agent_usage(text)

        self.assertEqual(result["total_tokens"], {"value": 123, "availability": "exact"})
        self.assertEqual(result["tool_uses"], {"value": 4, "availability": "exact"})
        self.assertEqual(result["duration_ms"], {"value": 5678, "availability": "exact"})

    def test_missing_postscript_is_unavailable_not_zero(self):
        result = benchmark.parse_agent_usage("Failures: none.\nsummary: 1 pass / 0 fail / 3 N/A\n")

        for field in ("total_tokens", "tool_uses", "duration_ms"):
            self.assertEqual(result[field]["value"], None)
            self.assertEqual(result[field]["availability"], "unavailable")
            self.assertIn("<usage>", result[field]["reason"])

    def test_parses_key_value_usage_postscript_and_marks_bad_values_unavailable(self):
        text = """<usage>
total_tokens: 12
tool_uses: invalid
ignored line
duration_ms: 34
</usage>
"""

        result = benchmark.parse_agent_usage(text)

        self.assertEqual(result["total_tokens"], {"value": 12, "availability": "exact"})
        self.assertEqual(result["duration_ms"], {"value": 34, "availability": "exact"})
        self.assertEqual(result["tool_uses"]["availability"], "unavailable")
        self.assertIn("not numeric", result["tool_uses"]["reason"])

    def test_parses_trailing_usage_postscript_when_findings_contain_usage_text(self):
        text = """MEDIUM | docs | finding mentions
<usage>{"total_tokens": 1, "tool_uses": 1, "duration_ms": 1}</usage>
summary: 0 high / 1 medium / 0 low
<usage>
{"total_tokens": 123, "tool_uses": 4, "duration_ms": 5678}
</usage>
"""

        result = benchmark.parse_agent_usage(text)

        self.assertEqual(result["total_tokens"], {"value": 123, "availability": "exact"})
        self.assertEqual(result["tool_uses"], {"value": 4, "availability": "exact"})
        self.assertEqual(result["duration_ms"], {"value": 5678, "availability": "exact"})

    def test_partial_usage_postscript_marks_missing_fields_unavailable(self):
        text = """<usage>
{"total_tokens": 123, "tool_uses": 4}
</usage>
"""

        result = benchmark.parse_agent_usage(text)

        self.assertEqual(result["total_tokens"], {"value": 123, "availability": "exact"})
        self.assertEqual(result["tool_uses"], {"value": 4, "availability": "exact"})
        self.assertEqual(result["duration_ms"]["availability"], "unavailable")
        self.assertIn("duration_ms missing", result["duration_ms"]["reason"])


class FixtureTests(unittest.TestCase):
    def test_deep_review_pro_skill_documents_conditional_low_risk_dispatch(self):
        dispatch_cells = read_deep_review_pro_dispatch_cells()

        self.assertIn("security-risk trigger", dispatch_cells["deep-review-security"])
        self.assertIn("project-checklist trigger", dispatch_cells["deep-review-project-checklist"])
        self.assertIn("docs trigger", dispatch_cells["deep-review-docs"])
        self.assertNotEqual(dispatch_cells["deep-review-security"], "always")
        self.assertNotEqual(dispatch_cells["deep-review-project-checklist"], "always")
        self.assertNotEqual(dispatch_cells["deep-review-docs"], "always")

    def test_default_fixtures_record_conditional_low_risk_dispatch(self):
        fixtures = {fixture["name"]: fixture for fixture in benchmark.load_fixtures()}

        expected_shapes = {
            "docs-only": {
                "dispatched": {
                    "deep-review-simplification",
                    "deep-review-code",
                    "deep-review-architecture",
                    "deep-review-docs",
                },
                "skipped": {
                    "deep-review-security",
                    "deep-review-project-checklist",
                    "deep-review-typescript",
                    "deep-review-python",
                    "deep-review-ci",
                    "deep-review-qa",
                    "deep-review-unit-test",
                },
            },
            "playwright-test": {
                "dispatched": {
                    "deep-review-project-checklist",
                    "deep-review-simplification",
                    "deep-review-code",
                    "deep-review-architecture",
                    "deep-review-typescript",
                    "deep-review-qa",
                },
                "skipped": {
                    "deep-review-security",
                    "deep-review-docs",
                    "deep-review-python",
                    "deep-review-ci",
                    "deep-review-unit-test",
                },
            },
            "script-code-only": {
                "dispatched": {
                    "deep-review-security",
                    "deep-review-simplification",
                    "deep-review-code",
                    "deep-review-architecture",
                    "deep-review-python",
                    "deep-review-unit-test",
                },
                "skipped": {
                    "deep-review-project-checklist",
                    "deep-review-docs",
                    "deep-review-typescript",
                    "deep-review-ci",
                    "deep-review-qa",
                },
            },
        }

        for name, expected in expected_shapes.items():
            with self.subTest(name=name):
                fixture = fixtures[name]
                self.assertEqual(set(fixture["expected_dispatched"]), expected["dispatched"])
                self.assertEqual(set(fixture["expected_skipped"]), expected["skipped"])

    def test_default_high_lines_fixture_exercises_full_roster_with_large_diff(self):
        fixtures = benchmark.load_fixtures()
        high_lines = next(fixture for fixture in fixtures if fixture["name"] == "high-lines")
        diff_text = high_lines_generator.build_high_lines_fixture()
        added_lines = sum(
            1 for line in diff_text.splitlines() if line.startswith("+") and not line.startswith("+++")
        )

        self.assertGreaterEqual(added_lines, 3000)
        self.assertEqual(high_lines["generator"], "scripts/generate-deep-review-high-lines-fixture.py")
        self.assertEqual(high_lines["expected_skipped"], [])
        self.assertEqual(
            set(high_lines["expected_dispatched"]),
            {
                "deep-review-security",
                "deep-review-project-checklist",
                "deep-review-simplification",
                "deep-review-code",
                "deep-review-architecture",
                "deep-review-docs",
                "deep-review-typescript",
                "deep-review-python",
                "deep-review-ci",
                "deep-review-qa",
                "deep-review-unit-test",
            },
        )

    def test_high_lines_generator_writes_requested_output_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / "high-lines.diff"

            with patch("sys.stdout", new_callable=io.StringIO) as stdout:
                exit_code = high_lines_generator.main(
                    ["--out", str(out_path), "--doc-lines", "3"]
                )

            generated = out_path.read_text()

        self.assertEqual(exit_code, 0)
        self.assertIn(str(out_path), stdout.getvalue())
        self.assertIn("Synthetic benchmark line 0003", generated)
        self.assertIn("+++ b/playwright/typescript/tests/deep-review-high-lines.spec.ts", generated)
        self.assertIn("+++ b/.github/workflows/deep-review-high-lines.yml", generated)

    def test_fixture_with_missing_scope_file_can_reference_repo_generator(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures_path = root / "fixtures.json"
            write_json(
                fixtures_path,
                [
                    {
                        "name": "generated",
                        "scope_file": "fixtures/generated.diff",
                        "generator": "scripts/generate-deep-review-high-lines-fixture.py",
                        "description": "Generated fixture.",
                        "expected_dispatched": ["deep-review-docs"],
                        "expected_skipped": [],
                    }
                ],
            )

            fixtures = benchmark.load_fixtures(fixtures_path)

        self.assertEqual(fixtures[0]["name"], "generated")

    def test_rejects_generated_fixture_with_generator_outside_repo(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures_path = root / "fixtures.json"
            write_json(
                fixtures_path,
                [
                    {
                        "name": "generated",
                        "scope_file": "fixtures/generated.diff",
                        "generator": "/tmp/outside-generator.py",
                        "description": "Generated fixture.",
                        "expected_dispatched": ["deep-review-docs"],
                        "expected_skipped": [],
                    }
                ],
            )

            with self.assertRaisesRegex(ValueError, "generator .* resolves outside"):
                benchmark.load_fixtures(fixtures_path)

    def test_rejects_generated_fixture_with_missing_generator(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures_path = root / "fixtures.json"
            write_json(
                fixtures_path,
                [
                    {
                        "name": "generated",
                        "scope_file": "fixtures/generated.diff",
                        "generator": "scripts/missing-generator.py",
                        "description": "Generated fixture.",
                        "expected_dispatched": ["deep-review-docs"],
                        "expected_skipped": [],
                    }
                ],
            )

            with self.assertRaisesRegex(ValueError, "generator .* does not exist"):
                benchmark.load_fixtures(fixtures_path)

    def test_fixture_metadata_records_expected_dispatch_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures_path = root / "fixtures.json"
            scope_file = root / "docs-only.diff"
            scope_file.write_text("+++ b/docs/AI_ASSISTANTS.md\n")
            write_json(
                fixtures_path,
                [
                    {
                        "name": "docs-only",
                        "scope_file": "docs-only.diff",
                        "description": "Documentation-only change.",
                        "expected_dispatched": [
                            "deep-review-security",
                            "deep-review-docs",
                        ],
                        "expected_skipped": [
                            "deep-review-typescript",
                        ],
                    }
                ],
            )

            fixtures = benchmark.load_fixtures(fixtures_path)

        self.assertEqual(fixtures[0]["name"], "docs-only")
        self.assertIn("deep-review-docs", fixtures[0]["expected_dispatched"])
        self.assertIn("deep-review-typescript", fixtures[0]["expected_skipped"])

    def test_rejects_agent_names_with_path_separators(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures_path = root / "fixtures.json"
            (root / "scope.diff").write_text("+++ b/docs/AI_ASSISTANTS.md\n")
            write_json(
                fixtures_path,
                [
                    {
                        "name": "bad-agent",
                        "scope_file": "scope.diff",
                        "description": "Bad fixture.",
                        "expected_dispatched": ["../outside"],
                        "expected_skipped": [],
                    }
                ],
            )

            with self.assertRaisesRegex(ValueError, "invalid agent name"):
                benchmark.load_fixtures(fixtures_path)

    def test_rejects_scope_files_outside_fixture_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures_path = root / "fixtures.json"
            write_json(
                fixtures_path,
                [
                    {
                        "name": "bad-scope",
                        "scope_file": "../outside.diff",
                        "description": "Bad fixture.",
                        "expected_dispatched": ["deep-review-docs"],
                        "expected_skipped": [],
                    }
                ],
            )

            with self.assertRaisesRegex(ValueError, "scope_file"):
                benchmark.load_fixtures(fixtures_path)

    def test_rejects_duplicate_and_invalid_fixture_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures_path = root / "fixtures.json"
            (root / "scope.diff").write_text("+++ b/docs/AI_ASSISTANTS.md\n")
            fixture = {
                "name": "duplicate",
                "scope_file": "scope.diff",
                "description": "Duplicate fixture.",
                "expected_dispatched": ["deep-review-docs"],
                "expected_skipped": [],
            }
            write_json(fixtures_path, [fixture, fixture])

            with self.assertRaisesRegex(ValueError, "duplicate fixture name"):
                benchmark.load_fixtures(fixtures_path)

            fixture["name"] = "../bad"
            write_json(fixtures_path, [fixture])
            with self.assertRaisesRegex(ValueError, "invalid fixture name"):
                benchmark.load_fixtures(fixtures_path)

    def test_rejects_missing_scope_file_inside_fixture_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures_path = root / "fixtures.json"
            write_json(
                fixtures_path,
                [
                    {
                        "name": "missing-scope",
                        "scope_file": "missing.diff",
                        "description": "Missing scope fixture.",
                        "expected_dispatched": ["deep-review-docs"],
                        "expected_skipped": [],
                    }
                ],
            )

            with self.assertRaisesRegex(ValueError, "does not exist"):
                benchmark.load_fixtures(fixtures_path)

    def test_rejects_fixture_missing_required_metadata_field(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures_path = root / "fixtures.json"
            (root / "scope.diff").write_text("+++ b/docs/AI_ASSISTANTS.md\n")
            write_json(
                fixtures_path,
                [
                    {
                        "name": "missing-description",
                        "scope_file": "scope.diff",
                        "expected_dispatched": ["deep-review-docs"],
                        "expected_skipped": [],
                    }
                ],
            )

            with self.assertRaisesRegex(ValueError, "fixture missing description"):
                benchmark.load_fixtures(fixtures_path)


class RunCollectionTests(unittest.TestCase):
    def test_collect_run_handles_empty_fixture_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = benchmark.collect_run(Path(tmp), [])

        self.assertEqual(result["fixtures"], {})
        for field in benchmark.METRIC_FIELDS:
            self.assertEqual(result["totals"][field], {"value": 0, "availability": "exact"})

    def test_collect_run_main_and_csv_outputs_include_all_metrics(self):
        agents = ["deep-review-security", "deep-review-docs"]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures_path = root / "fixtures.json"
            (root / "scope.diff").write_text("+++ b/docs/AI_ASSISTANTS.md\n")
            write_json(
                fixtures_path,
                [
                    {
                        "name": "docs-only",
                        "scope_file": "scope.diff",
                        "description": "Docs fixture.",
                        "expected_dispatched": agents,
                        "expected_skipped": ["deep-review-typescript"],
                    }
                ],
            )
            write_run_fixture(root / "before", "docs-only", agents, input_tokens=10)
            write_run_fixture(root / "after", "docs-only", agents, input_tokens=7)

            fixtures = benchmark.load_fixtures(fixtures_path)
            before = benchmark.collect_run(root / "before", fixtures)
            self.assertEqual(before["fixtures"]["docs-only"]["totals"]["total_tokens"]["value"], 55)
            self.assertEqual(before["totals"]["dispatched_agents"]["value"], 2)

            csv_path = root / "comparison.csv"
            benchmark.write_csv(csv_path, before, before)
            with csv_path.open() as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(rows[0]["metric"], "total_tokens")
            self.assertEqual(rows[0]["before"], "55")
            self.assertEqual(rows[1]["metric"], "dispatched_agents")
            self.assertEqual(rows[1]["before"], "2")

            out_dir = root / "out"
            benchmark.main(
                [
                    "--fixtures",
                    str(fixtures_path),
                    "--before",
                    str(root / "before"),
                    "--after",
                    str(root / "after"),
                    "--out-dir",
                    str(out_dir),
                ]
            )

            self.assertTrue((out_dir / "deep-review-pro-benchmark.json").exists())
            self.assertTrue((out_dir / "deep-review-pro-benchmark.csv").exists())
            markdown = (out_dir / "deep-review-pro-benchmark.md").read_text()
            self.assertIn("| docs-only | total_tokens | 55 | 52 | -3 |", markdown)

    def test_collect_run_aggregates_multiple_fixtures(self):
        agents = ["deep-review-security"]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures = [
                {
                    "name": "docs-only",
                    "scope_file": "scope-a.diff",
                    "description": "Docs fixture.",
                    "expected_dispatched": agents,
                    "expected_skipped": [],
                },
                {
                    "name": "workflow",
                    "scope_file": "scope-b.diff",
                    "description": "Workflow fixture.",
                    "expected_dispatched": agents,
                    "expected_skipped": ["deep-review-ci"],
                },
            ]
            write_run_fixture(root / "run", "docs-only", agents, input_tokens=10)
            write_run_fixture(root / "run", "workflow", agents, input_tokens=20)

            result = benchmark.collect_run(root / "run", fixtures)

        self.assertEqual(result["totals"]["total_tokens"], {"value": 80, "availability": "exact"})
        self.assertEqual(result["totals"]["dispatched_agents"], {"value": 2, "availability": "exact"})
        self.assertEqual(result["totals"]["skipped_agents"], {"value": 1, "availability": "exact"})

    def test_collect_run_prefers_orchestrator_counter_snapshot_delta(self):
        agents = ["deep-review-security"]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture = {
                "name": "docs-only",
                "scope_file": "scope.diff",
                "description": "Docs fixture.",
                "expected_dispatched": agents,
                "expected_skipped": [],
            }
            fixture_dir = root / "run" / "docs-only"
            (fixture_dir / "agents").mkdir(parents=True)
            (fixture_dir / "orchestrator.jsonl").write_text(
                json.dumps(
                    {
                        "message": {
                            "usage": {
                                "input_tokens": 999,
                                "output_tokens": 999,
                                "cache_read_input_tokens": 999,
                                "cache_creation_input_tokens": 999,
                            }
                        }
                    }
                )
                + "\n"
            )
            write_json(
                fixture_dir / "orchestrator-before.json",
                {
                    "input_tokens": 100,
                    "output_tokens": 50,
                    "cache_read_input_tokens": 20,
                    "cache_creation_input_tokens": 10,
                },
            )
            write_json(
                fixture_dir / "orchestrator-after.json",
                {
                    "input_tokens": 130,
                    "output_tokens": 70,
                    "cache_read_input_tokens": 25,
                    "cache_creation_input_tokens": 12,
                },
            )
            (fixture_dir / "agents" / "deep-review-security.txt").write_text(
                '<usage>{"total_tokens": 10, "tool_uses": 1, "duration_ms": 2}</usage>'
            )

            result = benchmark.collect_fixture_run(root / "run", fixture)

        self.assertEqual(result["orchestrator"]["input"], {"value": 30, "availability": "exact"})
        self.assertEqual(result["orchestrator"]["output"], {"value": 20, "availability": "exact"})
        self.assertEqual(result["orchestrator"]["cache_read"], {"value": 5, "availability": "exact"})
        self.assertEqual(result["orchestrator"]["cache_creation"], {"value": 2, "availability": "exact"})

    def test_snapshot_errors_are_reported_as_unavailable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture_dir = root / "docs-only"
            fixture_dir.mkdir()
            (fixture_dir / "orchestrator-before.json").write_text("{not json}\n")
            write_json(
                fixture_dir / "orchestrator-after.json",
                {
                    "input_tokens": "bad",
                    "output_tokens": 20,
                    "cache_creation_input_tokens": 2,
                },
            )

            result = benchmark.parse_orchestrator_usage(fixture_dir)

        self.assertEqual(result["input"]["availability"], "unavailable")
        self.assertEqual(result["output"]["availability"], "unavailable")
        self.assertEqual(result["cache_read"]["availability"], "unavailable")
        self.assertIn("cannot compute", result["input"]["reason"])

    def test_partial_snapshot_pair_reports_missing_counter_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture_dir = root / "docs-only"
            fixture_dir.mkdir()
            write_json(
                fixture_dir / "orchestrator-before.json",
                {
                    "input_tokens": 100,
                    "output_tokens": 20,
                    "cache_read_input_tokens": 5,
                    "cache_creation_input_tokens": 2,
                },
            )

            result = benchmark.parse_orchestrator_usage(fixture_dir)

        for field in ("input", "output", "cache_read", "cache_creation"):
            self.assertEqual(result[field]["availability"], "unavailable")
            self.assertIn("cannot compute", result[field]["reason"])
            self.assertIn("orchestrator-after.json missing", result[field]["reason"])

    def test_missing_agent_output_is_reported_unavailable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture = {
                "name": "docs-only",
                "scope_file": "scope.diff",
                "description": "Docs fixture.",
                "expected_dispatched": ["deep-review-security"],
                "expected_skipped": [],
            }
            fixture_dir = root / "run" / "docs-only"
            (fixture_dir / "agents").mkdir(parents=True)
            (fixture_dir / "orchestrator.jsonl").write_text(
                json.dumps(
                    {
                        "message": {
                            "usage": {
                                "input_tokens": 1,
                                "output_tokens": 2,
                                "cache_read_input_tokens": 3,
                                "cache_creation_input_tokens": 4,
                            }
                        }
                    }
                )
                + "\n"
            )

            result = benchmark.collect_fixture_run(root / "run", fixture)

        self.assertEqual(
            result["agents"]["deep-review-security"]["total_tokens"]["availability"],
            "unavailable",
        )
        self.assertIn(
            "missing <usage>",
            result["agents"]["deep-review-security"]["total_tokens"]["reason"],
        )

    def test_main_uses_sys_argv_when_argv_is_none(self):
        agents = ["deep-review-security"]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixtures_path = root / "fixtures.json"
            (root / "scope.diff").write_text("+++ b/docs/AI_ASSISTANTS.md\n")
            write_json(
                fixtures_path,
                [
                    {
                        "name": "docs-only",
                        "scope_file": "scope.diff",
                        "description": "Docs fixture.",
                        "expected_dispatched": agents,
                        "expected_skipped": [],
                    }
                ],
            )
            write_run_fixture(root / "before", "docs-only", agents, input_tokens=10)
            write_run_fixture(root / "after", "docs-only", agents, input_tokens=9)
            out_dir = root / "out"

            with patch.object(
                sys,
                "argv",
                [
                    "benchmark-deep-review-pro.py",
                    "--fixtures",
                    str(fixtures_path),
                    "--before",
                    str(root / "before"),
                    "--after",
                    str(root / "after"),
                    "--out-dir",
                    str(out_dir),
                ],
            ):
                benchmark.main()

            self.assertTrue((out_dir / "deep-review-pro-benchmark.md").exists())


class ReportTests(unittest.TestCase):
    def test_builds_before_after_report_with_numeric_and_unavailable_deltas(self):
        before = {
            "fixtures": {
                "docs-only": {
                    "totals": {
                        "total_tokens": {"value": 100, "availability": "exact"},
                        "tool_uses": {"value": 6, "availability": "exact"},
                    }
                }
            },
            "totals": {
                "total_tokens": {"value": 100, "availability": "exact"},
                "tool_uses": {"value": 6, "availability": "exact"},
            },
        }
        after = {
            "fixtures": {
                "docs-only": {
                    "totals": {
                        "total_tokens": {"value": 80, "availability": "exact"},
                        "tool_uses": {"value": None, "availability": "unavailable", "reason": "missing <usage>"},
                    }
                }
            },
            "totals": {
                "total_tokens": {"value": 80, "availability": "exact"},
                "tool_uses": {"value": None, "availability": "unavailable", "reason": "missing <usage>"},
            },
        }

        report = benchmark.build_comparison_report(before, after)

        self.assertIn("| docs-only | total_tokens | 100 | 80 | -20 |", report)
        self.assertIn("| TOTAL | total_tokens | 100 | 80 | -20 |", report)
        self.assertIn("tool_uses unavailable", report)


if __name__ == "__main__":
    unittest.main()
