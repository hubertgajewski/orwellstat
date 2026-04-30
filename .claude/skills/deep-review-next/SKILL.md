---
description: Multi-agent code review orchestrator. Dispatches every project-scoped specialist agent under .claude/agents/ in parallel against a scope resolved from $ARGUMENTS (local diff / PR / range / file / freeform), then surfaces their findings together. Coexists with /deep-review during rollout; will replace it via an atomic dir rename when promoted (#435).
---

Argument: $ARGUMENTS

`/deep-review-next` is a meta-orchestrator. It does not perform any review itself. Instead, it dispatches every project-scoped specialist agent that lives under `.claude/agents/` and aggregates their findings.

The bibliography of public sources cited by the specialist agents lives next to this skill at `.claude/skills/deep-review-next/REFERENCES.md`. Each agent must cite findings using the **Short ID** convention defined there (e.g. `OWASP-T10 A03`, `CWE-T25 89`, `OWASP-ASVS V5.1.1`, `WCAG-2.2 1.4.3`).

This orchestrator must complete every step below within a **single invocation**. Silent termination after any step is a defect — finish the run, or surface an explicit failure line. Specialist agent reply-shape constraints (e.g. *"your final reply must contain the markdown report and nothing else"*) apply only to the agent's reply and never halt this orchestrator.

## Specialist agents (current roster)

Extend by adding new files under `.claude/agents/` and listing them here:

| Agent                            | Domain                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `deep-review-security`           | Vulnerability review anchored in OWASP Top 10:2021 / CWE Top 25 (2024) / OWASP ASVS 4.0.3            |
| `deep-review-project-checklist`  | orwellstat-specific Playwright / POM / fixture / tag / CI-workflow conventions                       |
| `deep-review-simplification`     | Code reuse, quality (DRY/SOLID/Fowler smells), and efficiency review — paraphrases public sources    |
| `deep-review-code`               | General code-review (functionality / tests / naming / comments / dead code) anchored in Google Code Review Developer Guide (CC BY 3.0) |
| `deep-review-architecture`       | Architecture review (dependency direction / layer leaks / abstraction boundaries) influenced by SOLID, "Clean Architecture" (Martin), GoF, DDD (Evans) |
| `deep-review-typescript`         | TypeScript idiom review (`as any`, missing `satisfies`, narrowing, `as const`) anchored in TS Handbook + typescript-eslint — dispatch only when the diff contains `.ts` / `.tsx` files |
| `deep-review-python`             | Python style / idiom / docstring review (PEP 8 / 20 / 257 violations and ruff-equivalent issues) — dispatch only when the diff contains `.py` files |
| `deep-review-ci`                 | GitHub Actions specialist — `actionlint` + `shellcheck` static pass first (zero LLM tokens), LLM semantic pass for non-trivial workflows (CI/CD integrity, secret handling, action pinning) — dispatch only when the diff contains `.github/workflows/**.yml` / `.yaml` or `action.yml` / `action.yaml` |

Roadmap — pending sibling stories under epic #436 will add the rest of the family (each story creates one agent file under `.claude/agents/` and adds a row above):

| Pending agent                | Story |
| ---------------------------- | ----- |
| `deep-review-qa`             | #430  |
| `deep-review-unit-test`      | #430  |
| `deep-review-docs`           | #432  |

## Step 0 — Argument parsing and scope resolution

Trim leading/trailing whitespace from `$ARGUMENTS`. Apply the rules below in order; the first match wins. Whatever the mode, the scope is captured as **`DIFF`** (the literal text the agents will review) and **`UNTRACKED`** (paths only of new untracked files; agents fetch content with `Read`):

1. **Empty** (`$ARGUMENTS` is the empty string) → **US1 local-diff mode**:
   ```bash
   DIFF=$(git diff HEAD)                                # staged + unstaged vs HEAD
   UNTRACKED=$(git ls-files --others --exclude-standard) # paths only
   ```
   If both are empty, return `aggregate: no changes` and stop.

2. **PR number with optional bias** — matches the regex `^#?(\d+)(\s+(.+))?$` → **US2 PR mode**. PR number = group 1, freeform bias = group 3 (may be empty).
   ```bash
   gh pr view <PR>                                      # description, state, base SHA
   DIFF=$(gh pr diff <PR>)
   UNTRACKED=                                            # PR diff already includes new files
   ```
   Pass the PR description verbatim to every agent prompt. Compare `gh pr view <PR> --json baseRefOid -q .baseRefOid` to `git rev-parse origin/main`; if they differ, emit one warning line:
   ```
   ⚠ PR base SHA <oid> differs from current origin/main <oid> — file context may have drifted from PR review time.
   ```
   Do not abort; continue with the PR diff.

3. **Git ref or range** — the argument contains `..` or `...`, OR `git rev-parse --verify --quiet <arg> -- 2>/dev/null` returns 0 → **US3a range mode**:
   ```bash
   DIFF=$(git diff <range>)   # or git diff <ref>...HEAD if a single ref was passed
   UNTRACKED=
   ```

4. **Path** — `test -e "<arg>"` succeeds → **US3b file/dir mode**: scope is the file or directory tree's contents (no diff). Concatenate the file's contents (or each file under the directory) into `DIFF`; leave `UNTRACKED` empty.

5. **Otherwise** → **US3c freeform mode**: scope is the local diff (same as US1) AND the freeform string is recorded as a `Reviewer bias:` for every agent.

A non-empty freeform bias must be propagated in modes 2–4 if it is supplied (e.g. `213 focus on race conditions` parses as US2 PR=213 with bias `focus on race conditions`).

## Step 0.5 — Echo the resolved interpretation

Before dispatching, print exactly one line that names the resolved mode and the bias (if any). Examples:

- `Mode: US1 local diff — bias = none.`
- `Mode: US2 PR #213 — bias = none.`
- `Mode: US2 PR #213 — bias = "focus on race conditions" (concurrency emphasis).`
- `Mode: US3a range HEAD~3..HEAD — bias = none.`
- `Mode: US3b file scripts/self-healing.py — bias = none.`
- `Mode: US3c freeform — interpreted as "running full agent stack with concurrency emphasis".`

If the bias is non-empty, append it verbatim to every agent's prompt under a `Reviewer bias:` header so each agent can prioritize but not be limited by it.

## Step 1 — Parallel agent dispatch

Dispatch every agent in the **current roster** (specialist agents table above — not the roadmap) in a single message via parallel Task tool calls. Most specialist agents are granted `Read, Grep, Glob` only and cannot run `git diff` themselves — `deep-review-ci` is the exception: it additionally whitelists `Bash(actionlint *)` and `Bash(shellcheck *)` because its first pass is a static analyzer run, not an LLM call. Capture the scope once in this orchestrator and inject it into each dispatch.

Build each prompt by concatenating `DIFF`, a `\n\n--- untracked files (paths only; use Read to fetch content) ---\n` separator, the `UNTRACKED` listing, the `Reviewer bias: <text>` line if non-empty, the PR description verbatim for US2, and a `\n\n---\n` followed by the per-agent task instruction. Dispatch all roster agents in parallel:

```
Task(subagent_type="deep-review-security",
     description="Security review of pending diff",
     prompt="<DIFF>\n\n--- untracked files (paths only; use Read to fetch content) ---\n<UNTRACKED>\n\n---\nReview for vulnerabilities and emit findings in the documented schema, citing REFERENCES.md short IDs.")

Task(subagent_type="deep-review-project-checklist",
     description="Project checklist review of pending diff",
     prompt="<DIFF>\n\n--- untracked files (paths only; use Read to fetch content) ---\n<UNTRACKED>\n\n---\nApply the orwellstat-specific Playwright / POM / fixture / tag / CI conventions and emit findings in the documented format.")

Task(subagent_type="deep-review-simplification",
     description="Simplification review of pending diff",
     prompt="<DIFF>\n\n--- untracked files (paths only; use Read to fetch content) ---\n<UNTRACKED>\n\n---\nReview for missed reuse, quality (DRY/SOLID/Fowler smells), and efficiency, and emit findings in the documented pass/fail/N/A format.")

Task(subagent_type="deep-review-code",
     description="Code review of pending diff",
     prompt="<DIFF>\n\n--- untracked files (paths only; use Read to fetch content) ---\n<UNTRACKED>\n\n---\nReview for functionality, tests, naming, comments, and dead code, citing REFERENCES.md short IDs, and emit findings in the documented HIGH/MEDIUM/LOW pipe-delimited schema.")

Task(subagent_type="deep-review-architecture",
     description="Architecture review of pending diff",
     prompt="<DIFF>\n\n--- untracked files (paths only; use Read to fetch content) ---\n<UNTRACKED>\n\n---\nReview for SOLID violations, coupling, cohesion, dependency direction, and abstraction-boundary leaks, and emit findings in the documented HIGH/MEDIUM/LOW pipe-delimited schema.")
```

Conditional dispatches — same single-message parallel batch as the unconditional dispatches above; do **not** open a second dispatch pass. For each agent below, evaluate the extension test against the file paths in the diff hunks and the untracked-files listing; include the `Task(...)` call in the same parallel-Task message when the test passes, and record the agent as `SKIPPED: no <ext> files in scope` in the aggregate block when it fails:

```
# Dispatch only when at least one path under review ends in .ts or .tsx
Task(subagent_type="deep-review-typescript",
     description="TypeScript idiom review of pending diff",
     prompt="<DIFF>\n\n--- untracked files (paths only; use Read to fetch content) ---\n<UNTRACKED>\n\n---\nReview for `as any`, missing `satisfies`, missing narrowing, `!` non-null assertions, and named typescript-eslint rule violations, citing REFERENCES.md short IDs, and emit findings in the documented HIGH/MEDIUM/LOW pipe-delimited schema.")

# Dispatch only when at least one path under review ends in .py
Task(subagent_type="deep-review-python",
     description="Python idiom review of pending diff",
     prompt="<DIFF>\n\n--- untracked files (paths only; use Read to fetch content) ---\n<UNTRACKED>\n\n---\nReview for PEP 8 / 20 / 257 violations and ruff-equivalent issues (style, idiom, docstring, bug-risk), citing REFERENCES.md short IDs, and emit findings in the documented HIGH/MEDIUM/LOW pipe-delimited schema.")

# Dispatch only when at least one path under review matches .github/workflows/**.yml, .github/workflows/**.yaml, action.yml, or action.yaml
Task(subagent_type="deep-review-ci",
     description="CI / GitHub Actions review of pending diff",
     prompt="<DIFF>\n\n--- untracked files (paths only; use Read to fetch content) ---\n<UNTRACKED>\n\n---\nRun the actionlint static pass on every changed workflow file first; escalate to the LLM semantic pass only for non-trivial workflows (if conditions, multi-job orchestration, head_sha-style refs, pull_request_target / workflow_run triggers, secret writes, concurrency, schedule). Cite REFERENCES.md short IDs and emit findings in the documented HIGH/MEDIUM/LOW pipe-delimited schema.")
```

Each agent returns its findings in its own documented format. Do not coerce one format into the other — the formats are deliberately distinct because the domains are distinct.

**Agent error handling** — if a Task call times out or errors, retry it once **sequentially** (single Task call, not bundled with others). If it still fails, mark the agent as `UNAVAILABLE: <reason>` for the aggregate report and continue with the others.

## Step 2 — Aggregate output

Print one section per agent, in roster order, prefixed by the agent name. Concatenate the agent's verbatim output under each section. Then print one combined summary line:

```
### deep-review-security
<agent's verbatim findings or "findings: none">
summary: <H> high / <M> medium / <L> low

### deep-review-project-checklist
<agent's verbatim findings or "Failures: none.">
Summary: <pass> pass / <fail> fail / <N/A> N/A

### deep-review-simplification
<agent's verbatim findings or "Failures: none.">
Summary: <pass> pass / <fail> fail / <N/A> N/A

### deep-review-code
<agent's verbatim findings or "findings: none">
summary: <H> high / <M> medium / <L> low

### deep-review-architecture
<agent's verbatim findings or "findings: none">
summary: <H> high / <M> medium / <L> low

### deep-review-typescript
<agent's verbatim findings or "findings: none" or "SKIPPED: no .ts/.tsx files in scope">
summary: <H> high / <M> medium / <L> low

### deep-review-python
<agent's verbatim findings or "findings: none" or "SKIPPED: no .py files in scope">
summary: <H> high / <M> medium / <L> low

### deep-review-ci
<agent's verbatim findings or "findings: none" or "SKIPPED: no .github/workflows/**.yml or action.yml files in scope">
summary: <H> high / <M> medium / <L> low

### aggregate
total: <H> security HIGH / <M> security MEDIUM / <L> security LOW / <CF> checklist fail / <SF> simplification fail / <H> code HIGH / <M> code MEDIUM / <L> code LOW / <H> architecture HIGH / <M> architecture MEDIUM / <L> architecture LOW / <H> typescript HIGH / <M> typescript MEDIUM / <L> typescript LOW / <H> python HIGH / <M> python MEDIUM / <L> python LOW / <H> ci HIGH / <M> ci MEDIUM / <L> ci LOW
status: <"ready" if zero security HIGH, zero security MEDIUM, zero checklist fail, zero simplification fail, zero code HIGH, zero code MEDIUM, zero architecture HIGH, zero architecture MEDIUM, zero typescript HIGH, zero typescript MEDIUM, zero python HIGH, zero python MEDIUM, zero ci HIGH, and zero ci MEDIUM; otherwise "blocked">
```

A `SKIPPED:` agent contributes 0 to all counts and never blocks. If any roster agent was marked `UNAVAILABLE`, list it under the `### aggregate` block before the `total:` line.

## Step 3 — Re-review convergence loop (cap = 3)

The orchestrator does **not** modify source files. The caller decides which findings to fix. After the caller (or a follow-up turn in the same session) makes any change in response to a finding, re-dispatch every roster agent against the updated scope. Repeat until status is `ready`.

Stop after **3 iterations** — if still blocked, surface the remaining findings to the user and ask how to proceed. Do not loop indefinitely. Schema violations (an agent emitting prose that doesn't match its documented format) are themselves a finding to surface to the user — do not silently drop or rewrite the agent's output.

## Step 4 — Token-estimate footer

After the aggregate block, emit one line:

```
Token estimate: ~<X> input / ~<Y> output across <N> agent dispatches over <M> iterations.
```

Static-tool dispatches (e.g. `actionlint`, `shellcheck`) count as 0 tokens.

## How to consume the output

1. Status `blocked` means there is at least one item the caller must fix before considering the diff ready to commit. Walk each section in roster order; fix every security `HIGH` and `MEDIUM` finding and every checklist `fail`. Security `LOW` findings may be deferred with a one-sentence justification recorded in the PR body.

2. If any change is made in response to a finding, re-dispatch every agent against the updated diff. Repeat until status is `ready`. Stop after 3 iterations as above.

3. Schema violations are a finding to surface to the user, not something to silently rewrite.

## No-stall guarantee

This orchestrator MUST finish in one invocation. Each step ends in a transition, not a stop. Only these terminal states are acceptable:

1. **Step 2 emitted with status `ready`** (zero blocking findings).
2. **Step 2 emitted with status `blocked`** AND, if the iteration cap was hit, the prompt asking how to proceed.
3. **An explicit failure line**: `Failed at Step <N>: <reason>.`

Stopping after Step 0, 0.5, or 1 without entering Step 2 is a defect — proceed.

## Coexistence and promotion

- `/deep-review` (the legacy skill) remains untouched and continues to run alongside this skill until issue #435 promotes `/deep-review-next` by atomic directory rename of `.claude/skills/deep-review-next/ → .claude/skills/deep-review/`.
- Until that promotion, `REFERENCES.md` lives in this directory so the rename in #435 is a single mechanical operation.

## What this skill does NOT do

- It does not modify any source file. Every change is decided by the caller after reading the agents' findings.
- It does not call any built-in slash command. Specialist work is owned exclusively by the project-scoped agents under `.claude/agents/`.
- It does not enforce per-source quotation policy — that lives in `REFERENCES.md` and is the responsibility of each specialist agent's prose.
