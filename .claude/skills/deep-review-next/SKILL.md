---
description: Multi-agent code review orchestrator. Dispatches every project-scoped specialist agent under .claude/agents/ in parallel against the staged + unstaged diff, then surfaces their findings together. Coexists with /deep-review during rollout; will replace it via an atomic dir rename when promoted (#435).
---

`/deep-review-next` is a meta-orchestrator. It does not perform any review itself. Instead, it dispatches every project-scoped specialist agent that lives under `.claude/agents/` and aggregates their findings.

The bibliography of public sources cited by the specialist agents lives next to this skill at `.claude/skills/deep-review-next/REFERENCES.md`. Each agent must cite findings using the **Short ID** convention defined there (e.g. `OWASP-T10 A03`, `CWE-T25 89`, `OWASP-ASVS V5.1.1`, `WCAG-2.2 1.4.3`).

## Specialist agents

The current roster (extend by adding new files under `.claude/agents/` and listing them here):

| Agent | Domain |
|---|---|
| `deep-review-security` | Vulnerability review anchored in OWASP Top 10:2021 / CWE Top 25 (2024) / OWASP ASVS 4.0.3 |
| `deep-review-project-checklist` | orwellstat-specific Playwright / POM / fixture / tag / CI-workflow conventions |

## Run

Capture the diff once in this orchestrator and inject it into each dispatch — the specialist agents are granted `Read, Grep, Glob` only and cannot run `git diff` themselves.

1. Run `git diff HEAD` and capture the full stdout as `DIFF`. Run `git ls-files --others --exclude-standard` and capture its stdout as `UNTRACKED` (this returns **paths only**, not file content — agents fetch content with `Read`). If both are empty, return `aggregate: no changes` and stop.

2. For each agent in the roster, build the prompt by concatenating the captured `DIFF` text, a `\n\n--- untracked files (paths only; use Read to fetch content) ---\n` separator, the `UNTRACKED` listing, and a `\n\n---\n` followed by the per-agent task instruction. Dispatch all agents in parallel:

```
Task(subagent_type="deep-review-security",
     description="Security review of pending diff",
     prompt="<DIFF>\n\n--- untracked files (paths only; use Read to fetch content) ---\n<UNTRACKED>\n\n---\nReview for vulnerabilities and emit findings in the documented schema, citing REFERENCES.md short IDs.")

Task(subagent_type="deep-review-project-checklist",
     description="Project checklist review of pending diff",
     prompt="<DIFF>\n\n--- untracked files (paths only; use Read to fetch content) ---\n<UNTRACKED>\n\n---\nApply the orwellstat-specific Playwright / POM / fixture / tag / CI conventions and emit findings in the documented format.")
```

3. Each agent returns its findings in its own documented format. Do not coerce one format into the other — the formats are deliberately distinct because the domains are distinct.

## Aggregate output

Print one section per agent, in roster order, prefixed by the agent name. Concatenate the agent's verbatim output under each section. Then print one combined summary line:

```
### deep-review-security
<agent's verbatim findings or "findings: none">
summary: <H> high / <M> medium / <L> low

### deep-review-project-checklist
<agent's verbatim findings or "Failures: none.">
Summary: <pass> pass / <fail> fail / <N/A> N/A

### aggregate
total: <H> security HIGH / <M> security MEDIUM / <L> security LOW / <fail> checklist fail
status: <"ready" if zero security HIGH, zero security MEDIUM, and zero checklist fail; otherwise "blocked">
```

## How to consume the output

1. Status `blocked` means there is at least one item the caller must fix before considering the diff ready to commit. Walk each section in roster order; fix every security `HIGH` and `MEDIUM` finding and every checklist `fail`. Security `LOW` findings may be deferred with a one-sentence justification recorded in the PR body.

2. If any change is made in response to a finding, re-dispatch every agent against the updated diff. Repeat until status is `ready`. Stop after **3 iterations** — if still blocked, surface the remaining findings to the user and ask how to proceed; do not loop indefinitely.

3. Schema violations (an agent emitting prose that doesn't match its documented format) are themselves a finding to surface to the user — do not silently drop or rewrite the agent's output.

## Coexistence and promotion

- `/deep-review` (the legacy skill) remains untouched and continues to run alongside this skill until issue #435 promotes `/deep-review-next` by atomic directory rename of `.claude/skills/deep-review-next/ → .claude/skills/deep-review/`.
- Until that promotion, `REFERENCES.md` lives in this directory so the rename in #435 is a single mechanical operation.

## What this skill does NOT do

- It does not modify any source file. Every change is decided by the caller after reading the agents' findings.
- It does not call any built-in slash command. Specialist work is owned exclusively by the project-scoped agents under `.claude/agents/`.
- It does not enforce per-source quotation policy — that lives in `REFERENCES.md` and is the responsibility of each specialist agent's prose.
