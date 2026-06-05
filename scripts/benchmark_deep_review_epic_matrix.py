#!/usr/bin/env python3
"""Build comparable /deep-review-pro proxy metrics across epic checkpoints.

This script does not invoke Claude Code. It recalculates deterministic proxy
metrics from historical repository commits so every child story in issue #587
can be compared against the same fixture set and original #580 baseline.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).parent.parent
REPORTS_DIR = REPO_ROOT / "docs/deep-review-pro-benchmark/reports"
MATRIX_MD = REPORTS_DIR / "587-epic-token-cost-matrix.md"
MATRIX_JSON = REPORTS_DIR / "587-epic-token-cost-matrix.json"
BENCHMARK_SCRIPT = REPO_ROOT / "scripts/benchmark-deep-review-pro.py"
SKILL_PATH = ".claude/skills/deep-review-pro/SKILL.md"
AGENT_DIR = ".claude/agents"
ORIGINAL_580_REF = "4398fc9"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


benchmark = load_module("benchmark_deep_review_pro", BENCHMARK_SCRIPT)


@dataclass(frozen=True)
class Checkpoint:
    name: str
    ref: str
    issue: int | None
    previous: str | None
    output_mode: str
    label: str


DEFAULT_CHECKPOINTS = (
    Checkpoint(
        name="original-580",
        ref=ORIGINAL_580_REF,
        issue=None,
        previous=None,
        output_mode="detailed",
        label="Original #580 baseline, after #579 and before #580",
    ),
    Checkpoint(
        name="post-580",
        ref="f57b577",
        issue=580,
        previous="original-580",
        output_mode="detailed",
        label="After #580 conditional dispatch",
    ),
    Checkpoint(
        name="post-581",
        ref="5e6947f",
        issue=581,
        previous="post-580",
        output_mode="detailed",
        label="After #581 agent-specific subdiffs",
    ),
    Checkpoint(
        name="post-582",
        ref="f1013ec",
        issue=582,
        previous="post-581",
        output_mode="detailed",
        label="After #582 rerun cache contract",
    ),
    Checkpoint(
        name="post-583",
        ref="HEAD",
        issue=583,
        previous="post-582",
        output_mode="compact",
        label="After #583 compact aggregate output",
    ),
)


METRIC_FIELDS = (
    "prompt_input_chars",
    "prompt_input_est_tokens",
    "aggregate_output_chars",
    "aggregate_output_est_tokens",
    "combined_chars",
    "combined_est_tokens",
    "dispatched_agents",
    "skipped_agents",
)


def estimate_tokens(char_count: int) -> int:
    return math.ceil(char_count / 4)


def run_git(args: list[str]) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout


def git_show(ref: str, path: str) -> str:
    return run_git(["show", f"{ref}:{path}"])


def resolve_ref(ref: str) -> str:
    if ref == "HEAD":
        return "HEAD"
    try:
        return run_git(["rev-parse", "--short", ref]).strip()
    except subprocess.CalledProcessError:
        return ref


def parse_roster(skill_text: str) -> dict[str, dict[str, str]]:
    roster: dict[str, dict[str, str]] = {}
    for line in skill_text.splitlines():
        if not line.startswith("| `deep-review-"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) == 7:
            agent, domain, dispatch, output_format, empty, blocking, tool_grant = cells
            prompt_scope = "full"
        elif len(cells) == 8:
            (
                agent,
                domain,
                dispatch,
                prompt_scope,
                output_format,
                empty,
                blocking,
                tool_grant,
            ) = cells
        else:
            raise ValueError(f"unexpected deep-review-pro roster row with {len(cells)} cells: {line}")
        agent_name = agent.strip("`")
        roster[agent_name] = {
            "domain": domain,
            "dispatch": dispatch,
            "prompt_scope": prompt_scope.strip("`"),
            "format": output_format,
            "empty_state": empty.strip("`"),
            "blocking": blocking,
            "tool_grant": tool_grant,
        }
    if not roster:
        raise ValueError("deep-review-pro roster not found")
    return roster


def load_checkpoint_roster(checkpoint: Checkpoint) -> dict[str, dict[str, str]]:
    return parse_roster(git_show(checkpoint.ref, SKILL_PATH))


def load_agent_prompt(ref: str, agent: str) -> str:
    return git_show(ref, f"{AGENT_DIR}/{agent}.md")


def generated_fixture_text(fixture: dict) -> str:
    generator = fixture.get("generator")
    if not generator:
        raise ValueError(f"fixture {fixture['name']} has no generated text source")
    generator_module = load_module(
        f"deep_review_fixture_{fixture['name'].replace('-', '_')}",
        REPO_ROOT / generator,
    )
    if not hasattr(generator_module, "build_high_lines_fixture"):
        raise ValueError(f"{generator} does not expose build_high_lines_fixture()")
    return generator_module.build_high_lines_fixture()


def fixture_diff_text(fixture: dict) -> str:
    path = REPO_ROOT / "docs/deep-review-pro-benchmark" / fixture["scope_file"]
    if path.exists():
        return path.read_text()
    return generated_fixture_text(fixture)


def selected_agents(roster: dict[str, dict[str, str]], fixture: dict) -> list[str]:
    expected_dispatched = set(fixture["expected_dispatched"])
    agents = []
    for agent, cells in roster.items():
        if cells["dispatch"] == "always" or agent in expected_dispatched:
            agents.append(agent)
    return agents


def full_prompt_frame(diff_text: str) -> str:
    diff = benchmark.sanitize_prompt_value(diff_text).strip()
    if not diff:
        return ""
    return f"<untrusted-diff>\n{diff}\n</untrusted-diff>"


def checkpoint_uses_scoped_frames(roster: dict[str, dict[str, str]]) -> bool:
    return any(cells["prompt_scope"] != "full" for cells in roster.values())


def prompt_frame_for_agent(
    *,
    agent: str,
    diff_text: str,
    roster: dict[str, dict[str, str]],
    scoped_frames: dict[str, str] | None,
) -> str:
    if scoped_frames is None:
        return full_prompt_frame(diff_text)
    return scoped_frames[agent]


def prompt_input_chars(
    *,
    checkpoint: Checkpoint,
    fixture: dict,
    roster: dict[str, dict[str, str]],
    agents: list[str],
) -> int:
    diff_text = fixture_diff_text(fixture)
    scoped_frames = None
    if checkpoint_uses_scoped_frames(roster):
        scoped_frames = benchmark.build_prompt_frames(diff_text, roster=roster)

    total = 0
    for agent in agents:
        total += len(load_agent_prompt(checkpoint.ref, agent))
        total += len(roster[agent]["domain"])
        total += len(
            prompt_frame_for_agent(
                agent=agent,
                diff_text=diff_text,
                roster=roster,
                scoped_frames=scoped_frames,
            )
        )
    return total


def detailed_agent_section(agent: str, cells: dict[str, str]) -> str:
    if cells["format"] == "H/M/L":
        body = "findings: none\nsummary: 0 HIGH / 0 MEDIUM / 0 LOW"
    else:
        body = (
            f"{cells['empty_state']}\n"
            f"summary: <{agent.removeprefix('deep-review-')}-pass> pass / "
            f"0 fail / <{agent.removeprefix('deep-review-')}-N/A> N/A"
        )
    return f"### {agent}\n{body}"


def detailed_output_proxy(
    *,
    checkpoint: Checkpoint,
    fixture: dict,
    roster: dict[str, dict[str, str]],
    agents: list[str],
) -> str:
    skipped = [agent for agent in roster if agent not in set(agents)]
    lines = [
        f"fixture: {fixture['name']}",
        "mode: detailed aggregate output",
        "",
    ]
    lines.extend(detailed_agent_section(agent, roster[agent]) for agent in agents)
    lines.extend(
        [
            "",
            "aggregate:",
            f"summary: dispatched {len(agents)} / skipped {len(skipped)}",
            "blocking: none",
            "status: ready",
            "",
            "| Agent | Dispatch | Input | Output | Total | Tool uses | Duration |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
            "| orchestrator | run | <input> | <output> | - | - | - |",
        ]
    )
    lines.extend(
        f"| {agent} | dispatched | - | - | <total> | <tools> | <duration> |"
        for agent in agents
    )
    lines.extend(
        f"| {agent} | skipped | - | - | - | - | - |"
        for agent in skipped
    )
    return "\n".join(lines)


def compact_output_proxy(
    *,
    checkpoint: Checkpoint,
    fixture: dict,
    roster: dict[str, dict[str, str]],
    agents: list[str],
) -> str:
    skipped = [agent for agent in roster if agent not in set(agents)]
    lines = [
        f"fixture: {fixture['name']}",
        "mode: compact aggregate output",
        "failures: none",
        f"summary: dispatched {len(agents)} / skipped {len(skipped)}",
    ]
    lines.extend(f"SKIPPED: {agent}" for agent in skipped)
    lines.extend(
        [
            "schema violations: none",
            "status: ready",
            "tokens: total <value|unavailable> (use --usage or --verbose for the detailed table)",
        ]
    )
    return "\n".join(lines)


def aggregate_output_chars(
    *,
    checkpoint: Checkpoint,
    fixture: dict,
    roster: dict[str, dict[str, str]],
    agents: list[str],
) -> int:
    if checkpoint.output_mode == "compact":
        return len(
            compact_output_proxy(
                checkpoint=checkpoint,
                fixture=fixture,
                roster=roster,
                agents=agents,
            )
        )
    return len(
        detailed_output_proxy(
            checkpoint=checkpoint,
            fixture=fixture,
            roster=roster,
            agents=agents,
        )
    )


def checkpoint_fixture_metrics(checkpoint: Checkpoint, fixture: dict) -> dict:
    roster = load_checkpoint_roster(checkpoint)
    agents = selected_agents(roster, fixture)
    skipped = [agent for agent in roster if agent not in set(agents)]
    prompt_chars = prompt_input_chars(
        checkpoint=checkpoint,
        fixture=fixture,
        roster=roster,
        agents=agents,
    )
    output_chars = aggregate_output_chars(
        checkpoint=checkpoint,
        fixture=fixture,
        roster=roster,
        agents=agents,
    )
    prompt_tokens = estimate_tokens(prompt_chars)
    output_tokens = estimate_tokens(output_chars)
    return {
        "fixture": fixture["name"],
        "prompt_input_chars": prompt_chars,
        "prompt_input_est_tokens": prompt_tokens,
        "aggregate_output_chars": output_chars,
        "aggregate_output_est_tokens": output_tokens,
        "combined_chars": prompt_chars + output_chars,
        "combined_est_tokens": prompt_tokens + output_tokens,
        "dispatched_agents": len(agents),
        "skipped_agents": len(skipped),
        "agents": agents,
        "skipped": skipped,
    }


def sum_fixture_metrics(fixtures: list[dict]) -> dict[str, int]:
    return {
        field: sum(fixture[field] for fixture in fixtures)
        for field in METRIC_FIELDS
    }


def build_checkpoint_metrics(checkpoint: Checkpoint, fixtures: list[dict]) -> dict:
    fixture_metrics = [
        checkpoint_fixture_metrics(checkpoint, fixture)
        for fixture in fixtures
    ]
    return {
        "name": checkpoint.name,
        "ref": checkpoint.ref,
        "resolved_ref": resolve_ref(checkpoint.ref),
        "issue": checkpoint.issue,
        "previous": checkpoint.previous,
        "output_mode": checkpoint.output_mode,
        "label": checkpoint.label,
        "fixtures": fixture_metrics,
        "totals": sum_fixture_metrics(fixture_metrics),
    }


def metric_delta(before: dict, after: dict) -> dict[str, int]:
    return {
        field: after[field] - before[field]
        for field in METRIC_FIELDS
    }


def build_delta_record(
    *,
    from_checkpoint: dict,
    to_checkpoint: dict,
    original_checkpoint: dict,
) -> dict:
    return {
        "issue": to_checkpoint["issue"],
        "from_checkpoint": from_checkpoint["name"],
        "to_checkpoint": to_checkpoint["name"],
        "cumulative_from": original_checkpoint["name"],
        "incremental": metric_delta(from_checkpoint["totals"], to_checkpoint["totals"]),
        "cumulative": metric_delta(original_checkpoint["totals"], to_checkpoint["totals"]),
    }


def build_epic_matrix(
    checkpoints: tuple[Checkpoint, ...] = DEFAULT_CHECKPOINTS,
    fixtures: list[dict] | None = None,
) -> dict:
    fixtures = fixtures if fixtures is not None else benchmark.load_fixtures()
    checkpoint_metrics = [
        build_checkpoint_metrics(checkpoint, fixtures)
        for checkpoint in checkpoints
    ]
    by_name = {checkpoint["name"]: checkpoint for checkpoint in checkpoint_metrics}
    original = by_name["original-580"]
    deltas = {}
    for checkpoint in checkpoint_metrics:
        previous_name = checkpoint["previous"]
        if not previous_name:
            continue
        deltas[checkpoint["name"]] = build_delta_record(
            from_checkpoint=by_name[previous_name],
            to_checkpoint=checkpoint,
            original_checkpoint=original,
        )
    return {
        "fixtures": [fixture["name"] for fixture in fixtures],
        "original_checkpoint": "original-580",
        "checkpoints": checkpoint_metrics,
        "deltas": deltas,
        "notes": [
            "Exact runtime tokens are unavailable in this Codex run.",
            "Proxy tokens are estimated as ceil(characters / 4) per fixture and summed.",
            "Historical prompt data is read from checkpoint commits with git show.",
            "The same current fixture set is used for every checkpoint.",
        ],
    }


def format_int(value: int) -> str:
    return f"{value:,}"


def format_delta(delta: int, before: int) -> str:
    percent = (delta / before * 100) if before else 0
    return f"{format_int(delta)} ({percent:.2f}%)"


def checkpoint_table_row(checkpoint: dict) -> str:
    totals = checkpoint["totals"]
    return (
        f"| {checkpoint['name']} | {checkpoint['resolved_ref']} | "
        f"{format_int(totals['prompt_input_chars'])} | "
        f"{format_int(totals['prompt_input_est_tokens'])} | "
        f"{format_int(totals['aggregate_output_chars'])} | "
        f"{format_int(totals['aggregate_output_est_tokens'])} | "
        f"{format_int(totals['combined_chars'])} | "
        f"{format_int(totals['combined_est_tokens'])} |"
    )


def delta_table_row(matrix: dict, delta: dict, delta_key: str) -> str:
    by_name = {checkpoint["name"]: checkpoint for checkpoint in matrix["checkpoints"]}
    before_name = delta["from_checkpoint"] if delta_key == "incremental" else delta["cumulative_from"]
    after_name = delta["to_checkpoint"]
    before = by_name[before_name]["totals"]
    after = by_name[after_name]["totals"]
    values = delta[delta_key]
    issue = f"#{delta['issue']}" if delta["issue"] else "-"
    return (
        f"| {issue} | {before_name} | {after_name} | "
        f"{format_int(before['combined_chars'])} | "
        f"{format_int(after['combined_chars'])} | "
        f"{format_delta(values['combined_chars'], before['combined_chars'])} | "
        f"{format_int(before['combined_est_tokens'])} | "
        f"{format_int(after['combined_est_tokens'])} | "
        f"{format_delta(values['combined_est_tokens'], before['combined_est_tokens'])} |"
    )


def render_delta_table(matrix: dict, delta_key: str) -> list[str]:
    lines = [
        "| Issue | From | To | Combined chars before | Combined chars after | Char delta | Combined est. tokens before | Combined est. tokens after | Token delta |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for checkpoint in matrix["checkpoints"]:
        delta = matrix["deltas"].get(checkpoint["name"])
        if delta:
            lines.append(delta_table_row(matrix, delta, delta_key))
    return lines


def render_epic_report(matrix: dict) -> str:
    lines = [
        "# Issue 587 Deep-Review-Pro Token-Cost Matrix",
        "",
        "This report is the comparable benchmark surface for the #587 epic. It uses one fixture set and one set of units for every child story.",
        "",
        "Exact runtime token usage is unavailable in this Codex run, so token fields below are deterministic proxy estimates, not billing data.",
        "",
        "## Measurement Contract",
        "",
        "- `original-580` is the baseline after #579 and before #580.",
        "- Every checkpoint uses the same current fixture set.",
        "- Historical prompt text, roster dispatch cells, prompt scopes, and agent prompt files are read from the checkpoint commit with `git show`.",
        "- Prompt tokens and aggregate-output tokens are estimated as `ceil(characters / 4)` per fixture and summed for totals.",
        "- Every child story is reported with an incremental delta and a cumulative delta against `original-580`.",
        "",
        "## Checkpoints",
        "",
        "| Checkpoint | Ref | Prompt chars | Prompt est. tokens | Aggregate-output chars | Aggregate-output est. tokens | Combined chars | Combined est. tokens |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(checkpoint_table_row(checkpoint) for checkpoint in matrix["checkpoints"])
    lines.extend(
        [
            "",
            "## Incremental Deltas",
            "",
            *render_delta_table(matrix, "incremental"),
            "",
            "## Cumulative Deltas vs Original #580 Baseline",
            "",
            *render_delta_table(matrix, "cumulative"),
            "",
            "## Fixture Set",
            "",
        ]
    )
    lines.extend(f"- `{fixture}`" for fixture in matrix["fixtures"])
    return "\n".join(lines) + "\n"


def issue_checkpoint_name(issue: int) -> str:
    return f"post-{issue}"


def render_issue_comparable_section(matrix: dict, issue: int) -> str:
    checkpoint_name = issue_checkpoint_name(issue)
    if checkpoint_name not in matrix["deltas"]:
        raise ValueError(f"{checkpoint_name} is not present in the epic matrix")
    delta = matrix["deltas"][checkpoint_name]
    by_name = {checkpoint["name"]: checkpoint for checkpoint in matrix["checkpoints"]}
    previous = delta["from_checkpoint"]
    original = delta["cumulative_from"]
    current = delta["to_checkpoint"]
    current_totals = by_name[current]["totals"]
    previous_totals = by_name[previous]["totals"]
    original_totals = by_name[original]["totals"]
    lines = [
        "## Epic Comparable Benchmark",
        "",
        "These rows are generated from `587-epic-token-cost-matrix.md` so this issue can be compared with every other #587 child story using the same units.",
        "",
        "Use this section for cross-ticket comparison. Story-specific tables below are retained as local evidence and may use a narrower prompt-only, output-only, dispatch-only, or rerun/cache proxy surface.",
        "",
        f"### Incremental Delta: {previous} -> {current}",
        "",
        "| Metric | Before | After | Delta |",
        "| --- | ---: | ---: | ---: |",
        (
            f"| Combined chars | {format_int(previous_totals['combined_chars'])} | "
            f"{format_int(current_totals['combined_chars'])} | "
            f"{format_delta(delta['incremental']['combined_chars'], previous_totals['combined_chars'])} |"
        ),
        (
            f"| Combined est. tokens | {format_int(previous_totals['combined_est_tokens'])} | "
            f"{format_int(current_totals['combined_est_tokens'])} | "
            f"{format_delta(delta['incremental']['combined_est_tokens'], previous_totals['combined_est_tokens'])} |"
        ),
        "",
        f"### Cumulative Delta: {original} -> {current}",
        "",
        "| Metric | Original #580 baseline | Current checkpoint | Delta |",
        "| --- | ---: | ---: | ---: |",
        (
            f"| Combined chars | {format_int(original_totals['combined_chars'])} | "
            f"{format_int(current_totals['combined_chars'])} | "
            f"{format_delta(delta['cumulative']['combined_chars'], original_totals['combined_chars'])} |"
        ),
        (
            f"| Combined est. tokens | {format_int(original_totals['combined_est_tokens'])} | "
            f"{format_int(current_totals['combined_est_tokens'])} | "
            f"{format_delta(delta['cumulative']['combined_est_tokens'], original_totals['combined_est_tokens'])} |"
        ),
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--markdown-out", type=Path, default=MATRIX_MD)
    parser.add_argument("--json-out", type=Path, default=MATRIX_JSON)
    parser.add_argument(
        "--issue-section",
        type=int,
        help="Print the generated Epic Comparable Benchmark section for one child issue.",
    )
    args = parser.parse_args(argv)

    matrix = build_epic_matrix()
    args.markdown_out.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_out.write_text(render_epic_report(matrix))
    args.json_out.write_text(json.dumps(matrix, indent=2) + "\n")
    print(args.markdown_out)
    print(args.json_out)
    if args.issue_section is not None:
        print(render_issue_comparable_section(matrix, args.issue_section))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
