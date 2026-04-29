---
description: Multi-agent code review orchestrator (transitional name; replaces /deep-review in S8). Dispatches specialist reviewer agents in parallel via the Task tool, applies fixes across all severities, and runs a security-always re-review convergence loop — all in one invocation.
---

Argument: $ARGUMENTS

This skill dispatches the project's specialist reviewer agents in parallel and runs a fix → re-review convergence loop. It must complete every phase below within a single invocation. Silent termination after any phase is a defect — finish the run, or surface an explicit failure line.

This orchestrator does **not** call `/security-review`, `/simplify`, or `/review`. All review work is delegated to agents under `.claude/agents/deep-review-*.md`.

When an agent's reply ends with constraints like *"your final reply must contain the markdown report and nothing else"*, that constraint applies only to the agent's reply shape and does **not** halt this orchestrator.

---

## Step 0 — Argument parsing and scope resolution

Trim leading/trailing whitespace from `$ARGUMENTS`. Apply the rules in this order; the first match wins:

1. **Empty** (`$ARGUMENTS` is the empty string) → **US1 local-diff mode**. Scope is unstaged + staged + branch-vs-`main`:
   ```bash
   git diff origin/main...HEAD   # commits on the branch
   git diff --cached             # staged
   git diff                      # unstaged
   ```

2. **PR number with optional bias** — matches the regex `^#?(\d+)(\s+(.+))?$` → **US2 PR mode**. PR number = group 1, freeform bias = group 3 (may be empty).
   ```bash
   gh pr view <PR>               # description, state, base SHA
   gh pr diff <PR>                # the diff under review
   ```
   Pass the PR description verbatim to every agent prompt. Compare `gh pr view <PR> --json baseRefOid -q .baseRefOid` to `git rev-parse origin/main`; if they differ, emit one warning line:
   ```
   ⚠ PR base SHA <oid> differs from current origin/main <oid> — file context may have drifted from PR review time.
   ```
   Do not abort; continue with the PR diff.

3. **Git ref or range** — the argument contains `..` or `...`, OR `git rev-parse --verify --quiet <arg> -- 2>/dev/null` returns 0 → **US3a range mode**. Scope is `git diff <range>` (or `git diff <ref>...HEAD` if the user passed a single ref).

4. **Path** — `test -e "<arg>"` succeeds → **US3b file/dir mode**. Scope is the file or directory tree's contents (no diff). Useful for single-file or single-directory deep review.

5. **Otherwise** → **US3c freeform mode**. Scope is the local diff (same as US1) AND the freeform string is recorded as a `Reviewer bias:` for every agent.

A non-empty freeform bias must also be propagated in modes 2–4 if it is supplied (e.g. `213 focus on race conditions` parses as US2 PR=213 with bias `focus on race conditions`).

## Step 0.5 — Echo the resolved interpretation

Before dispatching, print exactly one line that names the resolved mode and the bias (if any). Examples:

- `Mode: US1 local diff — scope = unstaged + staged + branch-vs-main, bias = none.`
- `Mode: US2 PR #213 — bias = none.`
- `Mode: US2 PR #213 — bias = "focus on race conditions" (concurrency emphasis).`
- `Mode: US3a range HEAD~3..HEAD — bias = none.`
- `Mode: US3b file scripts/self-healing.py — bias = none.`
- `Mode: US3c freeform — interpreted as "running full agent stack with concurrency emphasis".`

If the bias is non-empty, append it verbatim to every agent's prompt under a `Reviewer bias:` header so each agent can prioritize but not be limited by it.

## Step 1 — Parallel agent dispatch

Dispatch every applicable agent in **a single message** with parallel Task tool calls — one Task call per agent, all in the same response. Each call uses `subagent_type` set to one of:

| `subagent_type`                  | Agent file                                            | Story |
| -------------------------------- | ----------------------------------------------------- | ----- |
| `deep-review-security`           | `.claude/agents/deep-review-security.md`              | #426  |
| `deep-review-simplification`     | `.claude/agents/deep-review-simplification.md`        | #427  |
| `deep-review-code`               | `.claude/agents/deep-review-code.md`                  | #428  |
| `deep-review-architecture`       | `.claude/agents/deep-review-architecture.md`          | #428  |
| `deep-review-typescript`         | `.claude/agents/deep-review-typescript.md`            | #429  |
| `deep-review-python`             | `.claude/agents/deep-review-python.md`                | #429  |
| `deep-review-qa`                 | `.claude/agents/deep-review-qa.md`                    | #430  |
| `deep-review-unit-test`          | `.claude/agents/deep-review-unit-test.md`             | #430  |
| `deep-review-ci`                 | `.claude/agents/deep-review-ci.md`                    | #431  |
| `deep-review-docs`               | `.claude/agents/deep-review-docs.md`                  | #432  |
| `deep-review-project-checklist`  | `.claude/agents/deep-review-project-checklist.md`     | #425  |

Note: the issue text says *"all 10 agent files"* in shorthand; the actual count of specialist categories is 11 (project-checklist + bibliography ship as a single file under #425).

Every prompt must include:
- The resolved scope (paste the raw `git diff`, PR diff, or file content; do not summarise — agents need to see the literal text they are reviewing).
- The `Reviewer bias:` line if non-empty.
- The PR description verbatim for US2.
- An instruction to return findings in the schema below.

**Findings schema** — every agent must return entries in this exact shape:

```yaml
findings:
  - id: <agent>-<n>
    severity: HIGH | MEDIUM | LOW
    file: <path>
    line: <int or "N/A">
    title: <one-line summary>
    rationale: <why this is a finding>
    suggested_fix: <concrete edit, or "manual review required">
```

**Malformed entries** — if an agent returns malformed YAML or omits a required field on an entry, drop **that entry** (record its index in a `dropped: <count>` line for the final report); do not fail the whole run.

**Agent error handling** — if a Task call times out or errors, retry it once **sequentially** (single Task call, not bundled with others). If it still fails, mark the agent as `UNAVAILABLE: <reason>` for the final report and continue with the others.

**Applicable agents** — by default in US1/US2/US3c modes, dispatch all 11 agents. In US3a/US3b, you may skip agents whose entire scope is structurally absent (e.g. skip `deep-review-typescript` when the scope contains zero `.ts`/`.tsx` files), but `deep-review-security`, `deep-review-simplification`, and `deep-review-docs` always run regardless of file types.

## Step 2 — Aggregate

Collect every finding from every successful agent. Drop malformed entries (note the count). Group by severity (HIGH first, then MEDIUM, then LOW). Within each group, sort by file path, then by line number.

If the total findings list is empty AND no agent was marked unavailable, jump directly to **Step 5** with the message `No findings — ready to commit.` and skip Steps 3 and 4.

## Step 3 — Apply fixes (all severities)

For every finding with a non-empty `suggested_fix`, apply the fix via the Edit/Write tools. Apply across **all severities** (HIGH, MEDIUM, and LOW) — LOW-severity fixes are still applied automatically; the final report records that they were applied without prompting.

Findings whose `suggested_fix` is `manual review required` are **deferred to the final report** — do not invent edits for them.

After fixes are applied, record per-agent which findings were addressed; the next step uses this list.

## Step 4 — Re-review convergence loop (security always; others conditional; cap = 3)

After each fix pass, re-dispatch agents in parallel (same single-message rule as Step 1):

- **`deep-review-security` always re-runs**, regardless of whether any of its findings were addressed in the previous cycle. Security regressions can be introduced by any other agent's fix.
- Every other agent re-runs **only if at least one of its findings from the previous cycle was addressed in Step 3**. If none of its findings were addressed, the unchanged findings would simply be re-emitted; re-running would burn tokens for no new signal.

Track an integer `cycle` starting at 1 (the Step 1 dispatch is cycle 1; each Step 4 re-dispatch increments). Cap at **`cycle <= 3`** — stop after at most two re-review passes (cycles 2 and 3).

Between cycles, repeat Step 2 (aggregate) and Step 3 (fix). When all findings clear after a cycle, jump to Step 5 with `No findings — ready to commit.`

If the cap is reached and there are unresolved findings of severity ≥ MEDIUM, emit:

```
Convergence cap reached after 3 cycles. Unresolved ≥ MEDIUM findings:

  - [<severity>] <agent> · <file>:<line> — <title>
  ...

How would you like to proceed? (apply manually / mark accepted / abort)
```

…and stop without further auto-fix attempts. Do not loop silently.

## Step 5 — Final report

Emit, in this exact order:

1. **Summary line** — pass / fail / N/A counts aggregated across all agents and cycles.
2. **Open findings** — prioritised by severity (HIGH → MEDIUM → LOW), then by file/line:

   ```
   - [HIGH | MEDIUM | LOW] <agent> · <file>:<line> — <title>
   ```

3. **Auto-fixed findings** (informational) — one line per fix applied, grouped by agent.
4. **Unavailable agents** (if any) — `UNAVAILABLE: deep-review-<n> — <reason>`.
5. **Token-estimate line** in this exact shape:

   ```
   Token estimate: ~<X> input / ~<Y> output across <N> agent dispatches over <M> cycles.
   ```

   Static-tool dispatches (e.g. `actionlint`, `shellcheck`) count as 0 tokens.

If everything passes (zero open findings, no unavailable agents), end with the two-line block:

```
No findings — ready to commit.
Token estimate: ~<X> input / ~<Y> output across <N> agent dispatches over <M> cycles.
```

---

## No-stall guarantee

This orchestrator MUST finish in one invocation. Each step ends in a transition, not a stop. Only these terminal states are acceptable:

1. **Step 5 emitted with zero findings.**
2. **Step 5 emitted with the open-findings list** AND, if convergence cap was hit, the prompt asking how to proceed.
3. **An explicit failure line**: `Failed at Step <N>: <reason>.`

Stopping after Step 1, 2, 3, or 4 without entering Step 5 is a defect — proceed.

Agent reply-shape constraints (`"your final reply must be the report and nothing else"`) apply only to that agent's reply; they never halt this orchestrator.
