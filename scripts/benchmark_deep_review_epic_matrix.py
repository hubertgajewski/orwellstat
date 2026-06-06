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
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from deep_review_benchmark_support import (
    build_full_prompt_frame_v1,
    build_scoped_prompt_frames_v1,
    load_fixtures,
    parse_deep_review_pro_roster,
    selected_agents_for_diff_v1,
)


REPO_ROOT = Path(__file__).parent.parent
REPORTS_DIR = REPO_ROOT / "docs/deep-review-pro-benchmark/reports"
MATRIX_MD = REPORTS_DIR / "587-epic-token-cost-matrix.md"
MATRIX_JSON = REPORTS_DIR / "587-epic-token-cost-matrix.json"
SKILL_PATH = ".claude/skills/deep-review-pro/SKILL.md"
AGENT_DIR = ".claude/agents"
ORIGINAL_580_REF = "4398fc9"
OutputMode = Literal["detailed", "compact"]
DeltaKey = Literal["incremental", "cumulative"]
PromptFrameContract = Literal["full-v1", "scoped-v1"]
OutputContract = Literal["detailed-v1", "detailed-reuse-v1", "compact-v1"]
DispatchContract = Literal["dispatch-v1"]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


@dataclass(frozen=True)
class Checkpoint:
    name: str
    ref: str
    issue: int | None
    previous: str | None
    dispatch_contract: DispatchContract
    prompt_frame_contract: PromptFrameContract
    output_contract: OutputContract
    label: str


@dataclass(frozen=True)
class FormatSpec:
    detailed_body_template: str
    compact_body_template: str
    summary_template: str
    total_template: str


@dataclass(frozen=True)
class AggregateRenderContext:
    fixture: dict
    roster: dict[str, dict[str, str]]
    agents: list[str]
    skipped: list[str]
    output_contract: OutputContract


DEFAULT_CHECKPOINTS = (
    Checkpoint(
        name="original-580",
        ref=ORIGINAL_580_REF,
        issue=None,
        previous=None,
        dispatch_contract="dispatch-v1",
        prompt_frame_contract="full-v1",
        output_contract="detailed-v1",
        label="Original #580 baseline, after #579 and before #580",
    ),
    Checkpoint(
        name="post-580",
        ref="f57b577",
        issue=580,
        previous="original-580",
        dispatch_contract="dispatch-v1",
        prompt_frame_contract="full-v1",
        output_contract="detailed-v1",
        label="After #580 conditional dispatch",
    ),
    Checkpoint(
        name="post-581",
        ref="5e6947f",
        issue=581,
        previous="post-580",
        dispatch_contract="dispatch-v1",
        prompt_frame_contract="scoped-v1",
        output_contract="detailed-v1",
        label="After #581 agent-specific subdiffs",
    ),
    Checkpoint(
        name="post-582",
        ref="f1013ec",
        issue=582,
        previous="post-581",
        dispatch_contract="dispatch-v1",
        prompt_frame_contract="scoped-v1",
        output_contract="detailed-reuse-v1",
        label="After #582 rerun cache contract",
    ),
    Checkpoint(
        name="post-583",
        ref="f3952ee",
        issue=583,
        previous="post-582",
        dispatch_contract="dispatch-v1",
        prompt_frame_contract="scoped-v1",
        output_contract="compact-v1",
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


FORMAT_SPECS = {
    "H/M/L": FormatSpec(
        detailed_body_template="findings: none\n{summary}",
        compact_body_template="findings: none",
        summary_template="summary: 0 high / 0 medium / 0 low",
        total_template="0 {name}-H / 0 {name}-M / 0 {name}-L",
    ),
    "pass/fail/N/A": FormatSpec(
        detailed_body_template=(
            "- [pass] {name} primary checklist satisfied.\n"
            "- [pass] {name} ownership boundary satisfied.\n"
            "- [pass] {name} citation requirement satisfied.\n"
            "- [pass] {name} empty-state contract satisfied.\n"
            "- [N/A] {name} optional edge case not present.\n"
            "- [N/A] {name} unavailable-tool case not present.\n"
            "{empty_state}\n{summary}"
        ),
        compact_body_template="{empty_state}",
        summary_template="summary: 4 pass / 0 fail / 2 N/A",
        total_template="4 {name}-pass / 0 {name}-fail / 2 {name}-N/A",
    ),
}
OUTPUT_CONTRACT_MODES = {
    "detailed-v1": "detailed",
    "detailed-reuse-v1": "detailed",
    "compact-v1": "compact",
}


def output_mode_for_contract(output_contract: OutputContract) -> OutputMode:
    try:
        return OUTPUT_CONTRACT_MODES[output_contract]
    except KeyError as exc:
        raise ValueError(f"Unknown aggregate-output contract: {output_contract}") from exc


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
    try:
        return run_git(["rev-parse", "--short", ref]).strip()
    except subprocess.CalledProcessError:
        return ref


def ensure_checkpoint_refs_available(checkpoints: tuple[Checkpoint, ...]) -> None:
    missing = []
    for checkpoint in checkpoints:
        try:
            run_git(["cat-file", "-e", f"{checkpoint.ref}^{{commit}}"])
        except subprocess.CalledProcessError:
            missing.append(f"{checkpoint.name}={checkpoint.ref}")

    if missing:
        raise ValueError(
            "Missing historical refs: "
            + ", ".join(missing)
            + ". Fetch full git history "
            "(for example, `git fetch --unshallow`, "
            "`git fetch origin +refs/heads/*:refs/remotes/origin/*`, "
            "or GitHub Actions `fetch-depth: 0`) and retry."
        )


def load_checkpoint_roster(checkpoint: Checkpoint) -> dict[str, dict[str, str]]:
    return parse_deep_review_pro_roster(git_show(checkpoint.ref, SKILL_PATH))


def load_agent_prompt(ref: str, agent: str) -> str:
    return git_show(ref, f"{AGENT_DIR}/{agent}.md")


def load_agent_prompt_lengths(ref: str, roster: dict[str, dict[str, str]]) -> dict[str, int]:
    return {
        agent: len(load_agent_prompt(ref, agent))
        for agent in roster
    }


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
    try:
        return path.read_text()
    except FileNotFoundError:
        return generated_fixture_text(fixture)


def skipped_agents(roster: dict[str, dict[str, str]], agents: list[str]) -> list[str]:
    selected = set(agents)
    return [agent for agent in roster if agent not in selected]


def format_agent_name(agent: str) -> str:
    return agent.removeprefix("deep-review-")


def format_spec(cells: dict[str, str]) -> FormatSpec:
    try:
        return FORMAT_SPECS[cells["format"]]
    except KeyError as exc:
        raise ValueError(f"Unknown agent output format: {cells['format']}") from exc


def agent_summary_line(agent: str, cells: dict[str, str]) -> str:
    return format_spec(cells).summary_template.format(
        name=format_agent_name(agent),
        empty_state=cells["empty_state"],
    )


def prompt_frame_lengths(
    *,
    checkpoint: Checkpoint,
    diff_text: str,
    roster: dict[str, dict[str, str]],
    agents: list[str],
) -> dict[str, int]:
    try:
        builder = PROMPT_FRAME_CONTRACT_BUILDERS[checkpoint.prompt_frame_contract]
    except KeyError as exc:
        raise ValueError(
            f"Unknown prompt-frame contract: {checkpoint.prompt_frame_contract}"
        ) from exc
    return builder(diff_text=diff_text, roster=roster, agents=agents)


def prompt_frame_lengths_full_v1(
    *,
    diff_text: str,
    roster: dict[str, dict[str, str]],
    agents: list[str],
) -> dict[str, int]:
    del roster
    full_frame_length = len(build_full_prompt_frame_v1(diff_text))
    return {
        agent: full_frame_length
        for agent in agents
    }


def prompt_frame_lengths_scoped_v1(
    *,
    diff_text: str,
    roster: dict[str, dict[str, str]],
    agents: list[str],
) -> dict[str, int]:
    selected_roster = {
        agent: roster[agent]
        for agent in agents
    }
    return {
        agent: len(frame)
        for agent, frame in build_scoped_prompt_frames_v1(
            diff_text,
            roster=selected_roster,
        ).items()
    }


PROMPT_FRAME_CONTRACT_BUILDERS = {
    "full-v1": prompt_frame_lengths_full_v1,
    "scoped-v1": prompt_frame_lengths_scoped_v1,
}


def prompt_input_chars(
    *,
    checkpoint: Checkpoint,
    diff_text: str,
    roster: dict[str, dict[str, str]],
    prompt_lengths: dict[str, int],
    agents: list[str],
) -> int:
    frame_lengths = prompt_frame_lengths(
        checkpoint=checkpoint,
        diff_text=diff_text,
        roster=roster,
        agents=agents,
    )
    total = 0
    for agent in agents:
        total += prompt_lengths[agent]
        total += len(roster[agent]["domain"])
        total += frame_lengths[agent]
    return total


def detailed_agent_section(agent: str, cells: dict[str, str]) -> str:
    body = format_spec(cells).detailed_body_template.format(
        name=format_agent_name(agent),
        empty_state=cells["empty_state"],
        summary=agent_summary_line(agent, cells),
    )
    return f"### {agent}\n{body}"


def skipped_agent_section(agent: str, cells: dict[str, str]) -> str:
    return f"### {agent}\nSKIPPED: {cells['dispatch']} not satisfied"


def aggregate_total_line(
    agents: list[str],
    roster: dict[str, dict[str, str]],
) -> str:
    return "total: " + " / ".join(
        aggregate_total_part(agent, roster[agent])
        for agent in agents
    )


def aggregate_reuse_line(agents: list[str], skipped: list[str]) -> str:
    return (
        f"reuse: dispatched {len(agents)} / skipped {len(skipped)} / "
        "reused 0 / final_full_matching_pass no"
    )


def iteration_footer(
    output_contract: OutputContract,
    agents: list[str],
    skipped: list[str],
) -> str:
    if output_contract == "detailed-reuse-v1":
        return (
            f"iterations: 1 (dispatched {len(agents)}, skipped {len(skipped)}, "
            "reused 0, final_full_matching_pass no)"
        )
    return "iterations: 1"


def aggregate_output_proxy_text(
    *,
    context: AggregateRenderContext,
    agent_section: Callable[[str, dict[str, str]], str],
    aggregate_tail: list[str],
) -> str:
    lines = [
        f"fixture: {context.fixture['name']}",
        f"mode: {output_mode_for_contract(context.output_contract)} aggregate output",
        "",
    ]
    lines.extend(agent_section(agent, context.roster[agent]) for agent in context.agents)
    lines.extend(skipped_agent_section(agent, context.roster[agent]) for agent in context.skipped)
    lines.extend(
        [
            "",
            "### aggregate",
            aggregate_total_line(context.agents, context.roster),
            "status: ready",
        ]
    )
    if context.output_contract in ("detailed-reuse-v1", "compact-v1"):
        lines.append(aggregate_reuse_line(context.agents, context.skipped))
    lines.extend(aggregate_tail)
    return "\n".join(lines)


def detailed_output_proxy(
    *,
    fixture: dict,
    roster: dict[str, dict[str, str]],
    agents: list[str],
    skipped: list[str],
    output_contract: OutputContract,
) -> str:
    context = AggregateRenderContext(
        fixture=fixture,
        roster=roster,
        agents=agents,
        skipped=skipped,
        output_contract=output_contract,
    )
    lines = [
        "",
        "| Layer | Model | Input | Output | Total | Cache read | Cache creation | Tool uses | Wall-clock | Summary |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
        "| orchestrator | claude | <input> | <output> | — | <cache-read> | <cache-create> | — | — | aggregate coordinator |",
    ]
    lines.extend(
        f"| {agent} | claude | — | — | <total> | — | — | <tools> | <duration> | {agent_summary_line(agent, roster[agent])} |"
        for agent in agents
    )
    if output_contract in ("detailed-v1", "detailed-reuse-v1"):
        lines.extend(
            f"| {agent} | — | — | — | — | — | — | — | — | SKIPPED: {roster[agent]['dispatch']} not satisfied |"
            for agent in skipped
        )
    lines.append("| totals | — | <input> | <output> | <billable-total> | <cache-read> | <cache-create> | <tools> | <duration> | all non-skipped layers |")
    lines.append(iteration_footer(output_contract, agents, skipped))
    return aggregate_output_proxy_text(
        context=context,
        agent_section=detailed_agent_section,
        aggregate_tail=lines,
    )


def compact_agent_section(agent: str, cells: dict[str, str]) -> str:
    body = format_spec(cells).compact_body_template.format(
        name=format_agent_name(agent),
        empty_state=cells["empty_state"],
        summary=agent_summary_line(agent, cells),
    )
    return f"### {agent}\n{body}\n{agent_summary_line(agent, cells)}"


def aggregate_total_part(agent: str, cells: dict[str, str]) -> str:
    return format_spec(cells).total_template.format(
        name=format_agent_name(agent),
        empty_state=cells["empty_state"],
        summary=agent_summary_line(agent, cells),
    )


def compact_output_proxy(
    *,
    fixture: dict,
    roster: dict[str, dict[str, str]],
    agents: list[str],
    skipped: list[str],
) -> str:
    context = AggregateRenderContext(
        fixture=fixture,
        roster=roster,
        agents=agents,
        skipped=skipped,
        output_contract="compact-v1",
    )
    return aggregate_output_proxy_text(
        context=context,
        agent_section=compact_agent_section,
        aggregate_tail=[
            "tokens: total <value|unavailable> (use --usage or --verbose for the detailed table)"
        ],
    )


def aggregate_output_text_detailed_v1(
    *,
    fixture: dict,
    roster: dict[str, dict[str, str]],
    agents: list[str],
    skipped: list[str],
) -> str:
    return detailed_output_proxy(
        fixture=fixture,
        roster=roster,
        agents=agents,
        skipped=skipped,
        output_contract="detailed-v1",
    )


def aggregate_output_text_detailed_reuse_v1(
    *,
    fixture: dict,
    roster: dict[str, dict[str, str]],
    agents: list[str],
    skipped: list[str],
) -> str:
    return detailed_output_proxy(
        fixture=fixture,
        roster=roster,
        agents=agents,
        skipped=skipped,
        output_contract="detailed-reuse-v1",
    )


def aggregate_output_text_compact_v1(
    *,
    fixture: dict,
    roster: dict[str, dict[str, str]],
    agents: list[str],
    skipped: list[str],
) -> str:
    return compact_output_proxy(
        fixture=fixture,
        roster=roster,
        agents=agents,
        skipped=skipped,
    )


OUTPUT_CONTRACT_BUILDERS = {
    "detailed-v1": aggregate_output_text_detailed_v1,
    "detailed-reuse-v1": aggregate_output_text_detailed_reuse_v1,
    "compact-v1": aggregate_output_text_compact_v1,
}


def selected_agents_dispatch_v1(
    *,
    roster: dict[str, dict[str, str]],
    diff_text: str,
) -> list[str]:
    return selected_agents_for_diff_v1(roster, diff_text)


DISPATCH_CONTRACT_BUILDERS = {
    "dispatch-v1": selected_agents_dispatch_v1,
}


def selected_agents_for_checkpoint(
    *,
    checkpoint: Checkpoint,
    roster: dict[str, dict[str, str]],
    diff_text: str,
) -> list[str]:
    try:
        builder = DISPATCH_CONTRACT_BUILDERS[checkpoint.dispatch_contract]
    except KeyError as exc:
        raise ValueError(
            f"Unknown dispatch contract: {checkpoint.dispatch_contract}"
        ) from exc
    return builder(roster=roster, diff_text=diff_text)


def aggregate_output_chars(
    *,
    checkpoint: Checkpoint,
    fixture: dict,
    roster: dict[str, dict[str, str]],
    agents: list[str],
    skipped: list[str],
) -> int:
    try:
        builder = OUTPUT_CONTRACT_BUILDERS[checkpoint.output_contract]
    except KeyError as exc:
        raise ValueError(
            f"Unknown aggregate-output contract: {checkpoint.output_contract}"
        ) from exc
    return len(
        builder(
            fixture=fixture,
            roster=roster,
            agents=agents,
            skipped=skipped,
        )
    )


def checkpoint_fixture_metrics(
    checkpoint: Checkpoint,
    fixture: dict,
    *,
    diff_text: str,
    roster: dict[str, dict[str, str]],
    prompt_lengths: dict[str, int],
) -> dict:
    agents = selected_agents_for_checkpoint(
        checkpoint=checkpoint,
        roster=roster,
        diff_text=diff_text,
    )
    skipped = skipped_agents(roster, agents)
    prompt_chars = prompt_input_chars(
        checkpoint=checkpoint,
        diff_text=diff_text,
        roster=roster,
        prompt_lengths=prompt_lengths,
        agents=agents,
    )
    output_chars = aggregate_output_chars(
        checkpoint=checkpoint,
        fixture=fixture,
        roster=roster,
        agents=agents,
        skipped=skipped,
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


def validate_checkpoint_sequence(checkpoints: tuple[Checkpoint, ...]) -> None:
    for index, checkpoint in enumerate(checkpoints):
        if checkpoint.ref == "HEAD" and index != len(checkpoints) - 1:
            raise ValueError(
                f"{checkpoint.name} uses HEAD but is not the final checkpoint; "
                "pin it to a stable ref before adding later checkpoints"
            )


def build_checkpoint_metrics(
    checkpoint: Checkpoint,
    fixtures: list[dict],
    fixture_texts: dict[str, str],
) -> dict:
    ensure_checkpoint_refs_available((checkpoint,))
    roster = load_checkpoint_roster(checkpoint)
    prompt_lengths = load_agent_prompt_lengths(checkpoint.ref, roster)
    fixture_metrics = [
        checkpoint_fixture_metrics(
            checkpoint,
            fixture,
            diff_text=fixture_texts[fixture["name"]],
            roster=roster,
            prompt_lengths=prompt_lengths,
        )
        for fixture in fixtures
    ]
    return {
        "name": checkpoint.name,
        "ref": checkpoint.ref,
        "resolved_ref": resolve_ref(checkpoint.ref),
        "issue": checkpoint.issue,
        "previous": checkpoint.previous,
        "output_mode": output_mode_for_contract(checkpoint.output_contract),
        "dispatch_contract": checkpoint.dispatch_contract,
        "prompt_frame_contract": checkpoint.prompt_frame_contract,
        "output_contract": checkpoint.output_contract,
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
    checkpoints: tuple[Checkpoint, ...] | None = None,
    fixtures: list[dict] | None = None,
) -> dict:
    checkpoints = checkpoints if checkpoints is not None else DEFAULT_CHECKPOINTS
    validate_checkpoint_sequence(checkpoints)
    ensure_checkpoint_refs_available(checkpoints)
    fixtures = fixtures if fixtures is not None else load_fixtures()
    fixture_texts = {
        fixture["name"]: fixture_diff_text(fixture)
        for fixture in fixtures
    }
    checkpoint_metrics = [
        build_checkpoint_metrics(checkpoint, fixtures, fixture_texts)
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


def checkpoint_contract_row(checkpoint: dict) -> str:
    return (
        f"| {checkpoint['name']} | {checkpoint['dispatch_contract']} | "
        f"{checkpoint['prompt_frame_contract']} | "
        f"{checkpoint['output_contract']} |"
    )


def delta_table_row(by_name: dict[str, dict], delta: dict, delta_key: DeltaKey) -> str:
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


def render_delta_table(matrix: dict, delta_key: DeltaKey) -> list[str]:
    by_name = {checkpoint["name"]: checkpoint for checkpoint in matrix["checkpoints"]}
    lines = [
        "| Issue | From | To | Combined chars before | Combined chars after | Char delta | Combined est. tokens before | Combined est. tokens after | Token delta |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for checkpoint in matrix["checkpoints"]:
        delta = matrix["deltas"].get(checkpoint["name"])
        if delta:
            lines.append(delta_table_row(by_name, delta, delta_key))
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
            "## Checkpoint Contracts",
            "",
            "| Checkpoint | Dispatch contract | Prompt-frame contract | Aggregate-output contract |",
            "| --- | --- | --- | --- |",
            *(
                checkpoint_contract_row(checkpoint)
                for checkpoint in matrix["checkpoints"]
            ),
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

    try:
        matrix = build_epic_matrix()
        issue_section = None
        if args.issue_section is not None:
            issue_section = render_issue_comparable_section(matrix, args.issue_section)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    args.markdown_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_out.write_text(render_epic_report(matrix))
    args.json_out.write_text(json.dumps(matrix, indent=2) + "\n")
    output_stream = sys.stderr if issue_section else sys.stdout
    print(args.markdown_out, file=output_stream)
    print(args.json_out, file=output_stream)
    if issue_section:
        print(issue_section)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
