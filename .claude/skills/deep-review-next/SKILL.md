---
description: Dispatch the project-scoped deep-review-security agent against the staged + unstaged diff for an OWASP Top 10:2021 / CWE Top 25 (2024) / ASVS 4.0.3 / Cheat Sheet Series-anchored vulnerability review, with findings emitted in a fixed pipe-separated schema.
---

This skill is a thin dispatcher around the `deep-review-security` sub-agent. It does one thing: run a world-class, diff-time security review and surface findings in a fixed schema. Style, reuse, doc consistency, and the full code-review checklist are out of scope here.

## Run

Dispatch the agent:

```
Task(subagent_type="deep-review-security",
     description="Security review of pending diff",
     prompt="Review the current staged + unstaged diff for OWASP Top 10:2021 / OWASP API Top 10:2023 / CWE Top 25 (2024) / ASVS 4.0.3 / Cheat-Sheet-class vulnerabilities and emit findings in the documented schema.")
```

The agent reads `git diff HEAD`, traces tainted data from sources to sinks, and emits findings under exactly one of these 11 categories: `access-control`, `crypto`, `injection`, `availability`, `misconfiguration`, `supply-chain`, `authentication`, `integrity`, `logging`, `ssrf`, `data-exposure`. Confidence threshold is `≥ 0.8`; an empty findings list is the correct output for a non-security diff.

## Output the agent will return

One line per finding, in this exact shape:

```
<severity> | <category> | <file>:<line> | <description with [STD-ID] citations> | <recommended fix>
```

`severity` is `HIGH`, `MEDIUM`, or `LOW`. Citations use the short-ID forms `[OWASP-Axx]`, `[OWASP-API-APIx]`, `[ASVS-Vx]` / `[ASVS-Vx.y]`, `[CWE-nnnn]`, `[CHEAT-<topic>]`, resolved through `REFERENCES.md` when available (verbatim otherwise).

When there are no findings, the agent returns exactly:

```
findings: none
```

After the findings (or the `findings: none` line), the agent always emits a one-line summary:

```
summary: <high count> high / <medium count> medium / <low count> low
```

## How to consume the output

1. Parse each finding line on the literal ` | ` separator. Reject any line that does not have exactly five fields — that is a schema violation by the agent and should be reported back.
2. Fix every `HIGH` and every `MEDIUM` finding before considering the diff ready to commit. A `LOW` finding may be deferred with a one-sentence justification recorded in the PR body.
3. If any change is made in response to a finding, re-dispatch the agent against the updated diff. Repeat until the agent returns `findings: none`. Stop after 3 iterations — if findings still remain, stop and surface them to the user with the proposed remaining fixes; do not loop indefinitely.

## What this skill does NOT do

- It does not run style, reuse, efficiency, or correctness checks.
- It does not run the project's full code-review checklist.
- It does not check documentation consistency.
- It does not modify any file directly — every change is decided by the caller after reading the agent's findings.

Other tooling layers own those concerns. This skill is security-only by design.

## Out-of-scope attack classes (handled elsewhere or unreachable)

The agent itself disclaims classes structurally out of reach for any diff-time reviewer: runtime exploitation (DAST/RASP), production / infra / network / TLS configuration not in this repo, threat modeling at architecture level, business-logic flaws not visible in one hunk, cryptographic protocol design, side channels beyond simple comparison timing, hardware / firmware / build-host attacks, operational vectors (incident response, key-rotation cadence), and social / insider / phishing vectors. Those belong to DAST tooling, threat-model documents, IaC review, and SOC operations — not to a static-diff agent.
