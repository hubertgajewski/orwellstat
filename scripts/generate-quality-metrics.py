"""Generate quality metrics markdown report and update history JSON.

Reads playwright/typescript/coverage-matrix.json for test coverage, queries
GitHub issues via the gh CLI for escape rate and MTTR, upserts a data point
for today in quality-metrics-history.json, and regenerates QUALITY_METRICS.md.
Also appends the step summary to GITHUB_STEP_SUMMARY when the env var is set.

Usage (requires GH_TOKEN in environment):
    python3 scripts/generate-quality-metrics.py
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
COVERAGE_MATRIX = REPO_ROOT / "playwright" / "typescript" / "coverage-matrix.json"
HISTORY_FILE = REPO_ROOT / "quality-metrics-history.json"
REPORT_FILE = REPO_ROOT / "QUALITY_METRICS.md"

CATEGORIES = ["title", "content", "accessibility", "visualRegression", "api"]
CATEGORY_HEADERS = ["Title", "Content", "Accessibility", "Visual Regression", "API"]


def gh_issues(labels, state="all", extra_fields=None):
    fields = ["number"] + (extra_fields or [])
    result = subprocess.run(
        [
            "gh", "issue", "list",
            "--label", labels,
            "--state", state,
            "--limit", "1000",
            "--json", ",".join(fields),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    issues = json.loads(result.stdout)
    if len(issues) == 1000:
        print(
            f"Warning: --label {labels!r} --state {state} hit the 1000-item limit; counts may be understated.",
            file=sys.stderr,
        )
    return issues


def mttr(issues, na_label="N/A"):
    if not issues:
        return na_label
    deltas = []
    for i in issues:
        if not i.get("closedAt"):  # guard against null closedAt
            continue
        created = datetime.fromisoformat(i["createdAt"].replace("Z", "+00:00"))
        closed = datetime.fromisoformat(i["closedAt"].replace("Z", "+00:00"))
        deltas.append((closed - created).total_seconds())
    if not deltas:
        return na_label
    avg = sum(deltas) / len(deltas)
    days = avg / 86400
    return f"{days:.1f} days" if days >= 1 else f"{avg / 3600:.1f} hours"


def compute_coverage(matrix):
    pages = matrix.get("pages", {})
    forms = matrix.get("forms", {})
    total = len(pages) * len(CATEGORIES) + len(forms)
    covered = sum(
        sum(1 for cat in CATEGORIES if page.get(cat, False))
        for page in pages.values()
    ) + sum(1 for v in forms.values() if v)
    pct = round(covered * 100 / total) if total else 0
    return pct, covered, total, pages, forms


def icon(val):
    return ":white_check_mark:" if val else ":x:"


def write_step_summary(lines):
    """Append lines to the GitHub Actions step summary when GITHUB_STEP_SUMMARY is set."""
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return
    with open(summary_path, "a") as f:
        f.write("\n".join(lines) + "\n")


def main():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # --- Escape rate ---
    by_test = gh_issues("bug,found-by-test")
    by_manual = gh_issues("bug,found-by-manual-testing")
    in_prod = gh_issues("bug,found-in-production")
    n_test, n_manual, n_prod = len(by_test), len(by_manual), len(in_prod)
    total_bugs = n_test + n_manual + n_prod

    if total_bugs == 0:
        escape_rate_str = "N/A"
    else:
        escape_rate_str = f"{n_prod * 100 / total_bugs:.0f}%"

    # --- MTTR ---
    time_fields = ["createdAt", "closedAt"]
    all_closed = gh_issues("bug", state="closed", extra_fields=time_fields)
    closed_test = gh_issues("bug,found-by-test", state="closed", extra_fields=time_fields)
    closed_manual = gh_issues("bug,found-by-manual-testing", state="closed", extra_fields=time_fields)
    closed_prod = gh_issues("bug,found-in-production", state="closed", extra_fields=time_fields)

    mttr_all = mttr(all_closed, "N/A (no closed bugs)")
    mttr_test = mttr(closed_test)
    mttr_manual = mttr(closed_manual)
    mttr_prod = mttr(closed_prod)

    # --- Coverage ---
    if COVERAGE_MATRIX.exists():
        with open(COVERAGE_MATRIX) as f:
            matrix = json.load(f)
        cov_pct, covered, total, pages, forms = compute_coverage(matrix)
        coverage_str = f"{cov_pct}%"
    else:
        cov_pct, covered, total, pages, forms = None, 0, 0, {}, {}
        coverage_str = "N/A"

    # --- Step summary ---
    write_step_summary([
        f"## Quality Metrics Report — {today}",
        "",
        "### Defect Escape Rate",
        "",
        "| Discovery method | Count |",
        "|-----------------|-------|",
        f"| Found by automated tests | {n_test} |",
        f"| Found by manual testing (staging) | {n_manual} |",
        f"| Found in production | {n_prod} |",
        f"| **Total bugs** | **{total_bugs}** |",
        f"| **Escape rate** | **{escape_rate_str}** |",
        "",
        "### MTTR (Mean Time To Resolve)",
        "",
        "| Scope | MTTR |",
        "|-------|------|",
        f"| All closed bugs | {mttr_all} |",
        f"| Found by automated tests | {mttr_test} |",
        f"| Found by manual testing (staging) | {mttr_manual} |",
        f"| Found in production | {mttr_prod} |",
    ])

    # --- Update history (upsert by date to avoid duplicate rows on re-runs) ---
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE) as f:
            history = json.load(f)
    else:
        history = []

    history = [p for p in history if p["date"] != today]
    history.append({
        "date": today,
        "escape_rate": escape_rate_str,
        "mttr": mttr_all,
        "coverage": coverage_str,
    })

    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)
        f.write("\n")

    # --- Generate markdown ---
    lines = [
        "# Quality Metrics",
        "",
        f"> Last updated: {today}",
        "",
        "## Defect Escape Rate",
        "",
    ]

    if total_bugs == 0:
        lines += [
            "No bugs have been labeled yet — escape rate is not yet calculable.",
            "",
        ]
    else:
        lines += [
            "| Discovery method | Count |",
            "|-----------------|-------|",
            f"| Found by automated tests | {n_test} |",
            f"| Found by manual testing (staging) | {n_manual} |",
            f"| Found in production | {n_prod} |",
            f"| **Total bugs** | **{total_bugs}** |",
            f"| **Escape rate** | **{escape_rate_str}** |",
            "",
        ]
        if n_prod == 0:
            lines += [
                "> All bugs were caught before production (escape rate: 0%).",
                "",
            ]

    lines += [
        "## Mean Time To Resolve",
        "",
        "| Scope | MTTR |",
        "|-------|------|",
        f"| All closed bugs | {mttr_all} |",
        f"| Found by automated tests | {mttr_test} |",
        f"| Found by manual testing (staging) | {mttr_manual} |",
        f"| Found in production | {mttr_prod} |",
        "",
        "## Test Coverage Matrix",
        "",
    ]

    if not pages:
        lines += [
            "_Coverage matrix not available (`playwright/typescript/coverage-matrix.json` not found)._",
            "",
        ]
    else:
        header = "| Page | " + " | ".join(CATEGORY_HEADERS) + " |"
        separator = "|------|" + "|".join(["---"] * len(CATEGORY_HEADERS)) + "|"
        lines += [header, separator]
        for page_url, vals in sorted(pages.items()):
            row = f"| `{page_url}` | " + " | ".join(icon(vals.get(cat, False)) for cat in CATEGORIES) + " |"
            lines.append(row)
        lines.append("")

        if forms:
            lines += [
                "### Forms",
                "",
                "| Form | Covered |",
                "|------|---------|",
            ]
            for form_name, val in sorted(forms.items()):
                lines.append(f"| {form_name} | {icon(val)} |")
            lines.append("")

        lines += [
            f"**Overall coverage: {coverage_str}** ({covered}/{total} items covered)",
            "",
        ]

    lines += [
        "## Trends",
        "",
        "| Date | Escape Rate | MTTR | Coverage |",
        "|------|-------------|------|----------|",
    ]
    for point in history:
        lines.append(
            f"| {point['date']} | {point['escape_rate']} | {point['mttr']} | {point['coverage']} |"
        )
    lines.append("")

    with open(REPORT_FILE, "w") as f:
        f.write("\n".join(lines))

    print(f"Generated {REPORT_FILE}")
    print(f"Updated {HISTORY_FILE} ({len(history)} data point(s))")


if __name__ == "__main__":
    main()
