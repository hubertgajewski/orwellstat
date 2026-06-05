#!/usr/bin/env python3
"""Normalize /deep-review-pro token benchmark artifacts.

The script does not invoke Claude Code. It consumes captured artifacts from
controlled /deep-review-pro runs and writes comparable JSON, CSV, and Markdown
reports for before/after optimization checks.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
DEFAULT_FIXTURES = REPO_ROOT / "docs" / "deep-review-pro-benchmark" / "fixtures.json"
METRIC_FIELDS = (
    "total_tokens",
    "dispatched_agents",
    "skipped_agents",
    "tool_uses",
    "wall_clock_ms",
    "cache_read",
    "cache_creation",
)
ORCHESTRATOR_FIELDS = {
    "input": "input_tokens",
    "output": "output_tokens",
    "cache_read": "cache_read_input_tokens",
    "cache_creation": "cache_creation_input_tokens",
}
AGENT_USAGE_FIELDS = ("total_tokens", "tool_uses", "duration_ms")
SAFE_FIXTURE_NAME = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SAFE_AGENT_NAME = re.compile(r"^deep-review-[a-z0-9-]+$")


def exact(value):
    return {"value": value, "availability": "exact"}


def unavailable(reason):
    return {"value": None, "availability": "unavailable", "reason": reason}


def metric_value(metric):
    return metric.get("value") if metric.get("availability") == "exact" else None


def render_metric(metric):
    value = metric_value(metric)
    return str(value) if value is not None else "unavailable"


def render_metric_detail(metric):
    value = metric_value(metric)
    if value is not None:
        return str(value)
    reason = metric.get("reason")
    return f"unavailable ({reason})" if reason else "unavailable"


def total_metric(run, fixture_name, field):
    return run["fixtures"][fixture_name]["totals"].get(
        field,
        unavailable(f"{field} missing from benchmark input"),
    )


def run_total_metric(run, field):
    return run["totals"].get(field, unavailable(f"total {field} missing from benchmark input"))


def sum_metrics(metrics, field_name):
    total = 0
    reasons = []
    for metric in metrics:
        value = metric_value(metric)
        if value is None:
            reasons.append(metric.get("reason", f"{field_name} unavailable"))
        else:
            total += value
    if reasons:
        return unavailable("; ".join(reasons))
    return exact(total)


def parse_orchestrator_jsonl(path):
    records = []
    try:
        with path.open() as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError as exc:
                    reason = f"{path}:{line_number} is not valid JSON: {exc.msg}"
                    return {field: unavailable(reason) for field in ORCHESTRATOR_FIELDS}
                usage = record.get("message", {}).get("usage")
                if usage is not None:
                    records.append(usage)
    except FileNotFoundError:
        reason = f"{path} missing"
        return {field: unavailable(reason) for field in ORCHESTRATOR_FIELDS}
    except OSError as exc:
        reason = f"{path} unreadable: {exc}"
        return {field: unavailable(reason) for field in ORCHESTRATOR_FIELDS}

    if not records:
        reason = f"{path} has no message.usage records"
        return {field: unavailable(reason) for field in ORCHESTRATOR_FIELDS}

    result = {}
    for output_field, jsonl_field in ORCHESTRATOR_FIELDS.items():
        missing_count = sum(1 for usage in records if jsonl_field not in usage)
        if missing_count:
            result[output_field] = unavailable(
                f"{jsonl_field} missing from {missing_count} of {len(records)} usage records"
            )
            continue
        values = []
        for usage in records:
            try:
                values.append(int(usage[jsonl_field]))
            except (TypeError, ValueError):
                result[output_field] = unavailable(f"{jsonl_field} is not numeric in {path}")
                break
        else:
            result[output_field] = exact(sum(values))
    return result


def parse_orchestrator_counter_json(path):
    try:
        with path.open() as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        reason = f"{path} missing"
        return {field: unavailable(reason) for field in ORCHESTRATOR_FIELDS}
    except (OSError, json.JSONDecodeError) as exc:
        reason = f"{path} unreadable or invalid JSON: {exc}"
        return {field: unavailable(reason) for field in ORCHESTRATOR_FIELDS}

    result = {}
    for output_field, counter_field in ORCHESTRATOR_FIELDS.items():
        if counter_field not in payload:
            result[output_field] = unavailable(f"{counter_field} missing from {path}")
            continue
        try:
            result[output_field] = exact(int(payload[counter_field]))
        except (TypeError, ValueError):
            result[output_field] = unavailable(f"{counter_field} is not numeric in {path}")
    return result


def subtract_orchestrator_counters(before, after):
    result = {}
    for field in ORCHESTRATOR_FIELDS:
        before_value = metric_value(before[field])
        after_value = metric_value(after[field])
        if before_value is None or after_value is None:
            result[field] = unavailable(
                f"cannot compute {field} delta: "
                f"before={render_metric_detail(before[field])}, "
                f"after={render_metric_detail(after[field])}"
            )
        else:
            result[field] = exact(after_value - before_value)
    return result


def parse_orchestrator_usage(fixture_dir):
    before_snapshot = fixture_dir / "orchestrator-before.json"
    after_snapshot = fixture_dir / "orchestrator-after.json"
    if before_snapshot.exists() or after_snapshot.exists():
        return subtract_orchestrator_counters(
            parse_orchestrator_counter_json(before_snapshot),
            parse_orchestrator_counter_json(after_snapshot),
        )
    return parse_orchestrator_jsonl(find_orchestrator_log(fixture_dir))


def parse_agent_usage(text):
    matches = re.findall(r"<usage>\s*(.*?)\s*</usage>", text, re.DOTALL)
    if not matches:
        return {field: unavailable("missing <usage> postscript") for field in AGENT_USAGE_FIELDS}

    raw_usage = matches[-1].strip()
    try:
        usage = json.loads(raw_usage)
    except json.JSONDecodeError:
        usage = {}
        for line in raw_usage.splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            usage[key.strip()] = value.strip()

    result = {}
    for field in AGENT_USAGE_FIELDS:
        if field not in usage:
            result[field] = unavailable(f"{field} missing from <usage> postscript")
            continue
        try:
            result[field] = exact(int(usage[field]))
        except (TypeError, ValueError):
            result[field] = unavailable(f"{field} in <usage> is not numeric")
    return result


def load_fixtures(path=DEFAULT_FIXTURES):
    with path.open() as handle:
        fixtures = json.load(handle)

    root = path.parent.resolve()
    names = set()
    for fixture in fixtures:
        for required in ("name", "scope_file", "description", "expected_dispatched", "expected_skipped"):
            if required not in fixture:
                raise ValueError(f"{path}: fixture missing {required}")
        if not SAFE_FIXTURE_NAME.fullmatch(fixture["name"]):
            raise ValueError(f"{path}: invalid fixture name {fixture['name']}")
        if fixture["name"] in names:
            raise ValueError(f"{path}: duplicate fixture name {fixture['name']}")
        names.add(fixture["name"])
        for agent in [*fixture["expected_dispatched"], *fixture["expected_skipped"]]:
            if not SAFE_AGENT_NAME.fullmatch(agent):
                raise ValueError(f"{path}: invalid agent name {agent}")
        scope_path = (root / fixture["scope_file"]).resolve()
        if not scope_path.is_relative_to(root):
            raise ValueError(f"{path}: scope_file {fixture['scope_file']} resolves outside {root}")
        if not scope_path.exists():
            generator = fixture.get("generator")
            if not generator:
                raise ValueError(f"{path}: scope_file {fixture['scope_file']} does not exist")
            generator_path = (REPO_ROOT / generator).resolve()
            if not generator_path.is_relative_to(REPO_ROOT):
                raise ValueError(f"{path}: generator {generator} resolves outside {REPO_ROOT}")
            if not generator_path.exists():
                raise ValueError(f"{path}: generator {generator} does not exist")
    return fixtures


def find_orchestrator_log(fixture_dir):
    for name in ("orchestrator.jsonl", "session.jsonl"):
        candidate = fixture_dir / name
        if candidate.exists():
            return candidate
    return fixture_dir / "orchestrator.jsonl"


def collect_fixture_run(run_dir, fixture):
    fixture_dir = run_dir / fixture["name"]
    orchestrator = parse_orchestrator_usage(fixture_dir)
    agents = {}
    for agent in fixture["expected_dispatched"]:
        agent_path = fixture_dir / "agents" / f"{agent}.txt"
        try:
            agent_text = agent_path.read_text()
        except FileNotFoundError:
            agent_text = ""
        agents[agent] = parse_agent_usage(agent_text)

    agent_token_metrics = [usage["total_tokens"] for usage in agents.values()]
    tool_metrics = [usage["tool_uses"] for usage in agents.values()]
    wall_metrics = [usage["duration_ms"] for usage in agents.values()]
    input_tokens = orchestrator["input"]
    output_tokens = orchestrator["output"]

    token_metrics = [input_tokens, output_tokens, *agent_token_metrics]
    totals = {
        "total_tokens": sum_metrics(token_metrics, "total_tokens"),
        "dispatched_agents": exact(len(fixture["expected_dispatched"])),
        "skipped_agents": exact(len(fixture["expected_skipped"])),
        "tool_uses": sum_metrics(tool_metrics, "tool_uses"),
        "wall_clock_ms": sum_metrics(wall_metrics, "wall_clock_ms"),
        "cache_read": orchestrator["cache_read"],
        "cache_creation": orchestrator["cache_creation"],
    }
    return {
        "description": fixture["description"],
        "scope_file": fixture["scope_file"],
        "expected_dispatch": {
            "dispatched": fixture["expected_dispatched"],
            "skipped": fixture["expected_skipped"],
        },
        "orchestrator": orchestrator,
        "agents": agents,
        "totals": totals,
    }


def collect_run(run_dir, fixtures):
    fixture_results = {}
    for fixture in fixtures:
        fixture_results[fixture["name"]] = collect_fixture_run(run_dir, fixture)

    totals = {}
    for field in METRIC_FIELDS:
        totals[field] = sum_metrics([result["totals"][field] for result in fixture_results.values()], field)
    return {"run_dir": str(run_dir), "fixtures": fixture_results, "totals": totals}


def delta(before_metric, after_metric):
    before_value = metric_value(before_metric)
    after_value = metric_value(after_metric)
    if before_value is None or after_value is None:
        return "unavailable"
    return str(after_value - before_value)


def comparison_rows(before, after):
    rows = []
    fixture_names = sorted(set(before["fixtures"]) | set(after["fixtures"]))
    for name in fixture_names:
        for field in METRIC_FIELDS:
            before_metric = total_metric(before, name, field)
            after_metric = total_metric(after, name, field)
            rows.append(
                {
                    "fixture": name,
                    "metric": field,
                    "before": render_metric(before_metric),
                    "after": render_metric(after_metric),
                    "delta": delta(before_metric, after_metric),
                    "has_unavailable": (
                        metric_value(before_metric) is None
                        or metric_value(after_metric) is None
                    ),
                }
            )
    for field in METRIC_FIELDS:
        before_total = run_total_metric(before, field)
        after_total = run_total_metric(after, field)
        rows.append(
            {
                "fixture": "TOTAL",
                "metric": field,
                "before": render_metric(before_total),
                "after": render_metric(after_total),
                "delta": delta(before_total, after_total),
                "has_unavailable": (
                    metric_value(before_total) is None
                    or metric_value(after_total) is None
                ),
            }
        )
    return rows


def build_comparison_report(before, after):
    lines = [
        "# deep-review-pro Token Benchmark",
        "",
        "| Fixture | Metric | Before | After | Delta |",
        "| --- | --- | ---: | ---: | ---: |",
    ]
    rows = comparison_rows(before, after)
    for row in rows:
        lines.append(
            f"| {row['fixture']} | {row['metric']} | {row['before']} | {row['after']} | {row['delta']} |"
        )

    unavailable_notes = [
        f"{row['fixture'].lower() if row['fixture'] == 'TOTAL' else row['fixture']} {row['metric']} unavailable"
        for row in rows
        if row["has_unavailable"]
    ]

    if unavailable_notes:
        lines.extend(["", "## Unavailable Fields", ""])
        lines.extend(f"- {note}" for note in sorted(set(unavailable_notes)))
    return "\n".join(lines) + "\n"


def write_csv(path, before, after):
    rows = comparison_rows(before, after)
    fieldnames = ["fixture", "metric", "before", "after", "delta"]
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows({name: row[name] for name in fieldnames} for row in rows)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", type=Path, default=DEFAULT_FIXTURES)
    parser.add_argument(
        "--before",
        type=Path,
        required=True,
        help="Directory containing before-run captured artifacts.",
    )
    parser.add_argument(
        "--after",
        type=Path,
        required=True,
        help="Directory containing after-run captured artifacts.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        required=True,
        help="Directory for benchmark JSON, CSV, and Markdown output.",
    )
    args = parser.parse_args(argv)

    fixtures = load_fixtures(args.fixtures)
    before = collect_run(args.before, fixtures)
    after = collect_run(args.after, fixtures)
    output = {"fixtures": fixtures, "before": before, "after": after}

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "deep-review-pro-benchmark.json").write_text(json.dumps(output, indent=2) + "\n")
    write_csv(args.out_dir / "deep-review-pro-benchmark.csv", before, after)
    (args.out_dir / "deep-review-pro-benchmark.md").write_text(build_comparison_report(before, after))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"benchmark-deep-review-pro failed: {exc}", file=sys.stderr)
        raise
