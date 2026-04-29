"""Self-healing selector fix for Playwright test failures.

Downloads test artifacts (results.json, selector-fix.md, dom.xhtml) produced by
the Playwright CI workflow, classifies selector/locator errors, and either posts
a comment on the originating PR or creates a draft PR with the proposed fix.

Designed to be invoked by .github/workflows/self-healing.yml after a failed
Playwright Typescript Tests workflow run.

Usage (env vars set by the workflow):
    python3 scripts/self-healing.py <data-dir>

Environment variables:
    HEAD_BRANCH   — branch that triggered the failed workflow run
    HEAD_SHA      — commit SHA of the failed run
    RUN_ID        — workflow run ID (for linking in comments)
    GH_TOKEN      — GitHub token (used by gh CLI)
    ANTHROPIC_API_KEY — Anthropic API key (fallback path)
    GEMINI_API_KEY    — Gemini API key (fallback path)
    AI_PROVIDER       — "anthropic" (default) or "gemini"
    AI_MODEL_STRONG   — override the selector-fix model (strong tier); defaults match diagnosis.util.ts
    DRY_RUN           — set to "true" to print actions without executing
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import textwrap
import urllib.error
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_ATTEMPTS = 2
COMMENT_MARKER = "<!-- self-healing-selector-fix -->"
SELF_HEALING_LABEL = "self-healing"
BRANCH_PREFIX = "fix/self-healing-"

# Must stay in sync with diagnosis.util.ts SELECTOR_ERROR_PATTERN (line 6-7).
SELECTOR_ERROR_PATTERN = re.compile(
    r"strict mode violation|waiting for locator|waiting for getBy|locator\.\w+:.*timeout",
    re.IGNORECASE,
)

DOM_TRUNCATE_CHARS = 30_000


def _run_url(run_id: str) -> str:
    """Build a URL to the workflow run, absolute when GITHUB_REPOSITORY is set."""
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if repo:
        return f"https://github.com/{repo}/actions/runs/{run_id}"
    return f"../actions/runs/{run_id}"


# ---------------------------------------------------------------------------
# Suggested-selector validation (defends against hostile AI output)
# ---------------------------------------------------------------------------

# Allow-list shape: a Playwright locator expression that begins with
# `getBy*(...)`, `locator(...)`, or `frameLocator(...)` (optionally prefixed
# by `page.`, `locator.`, or `frameLocator.`), then any number of chained
# `.first() / .last() / .nth(...) / .filter(...) / .getBy*(...) / .locator(...)`
# calls.  Argument bodies allow anything except the FORBIDDEN chars below.
LOCATOR_SHAPE = re.compile(
    r"^\s*(?:page|locator|frameLocator)?\.?(?:getBy[A-Z][A-Za-z]+|locator|frameLocator)"
    r"\([^\n`$]+\)(?:\.(?:first|last|nth|filter|getBy[A-Z][A-Za-z]+|locator)\([^\n`$]*\))*\s*$"
)

# Bytes that have no business inside a single Playwright locator expression
# but would be useful to an attacker pivoting from a string-replace into code
# execution: newline (multi-statement), backtick (template literal), `;`
# (statement terminator), `>` (CSS combinator AND shell redirect).  `$(` is
# checked separately so the substring isn't masked by also banning every `$`.
FORBIDDEN_CHARS = frozenset("\n`;>")

# Hard cap on AI-suggested selector length.  Real Playwright locators in this
# repo are well under 200 chars; 500 leaves room for object-literal options.
MAX_SUGGESTED_LENGTH = 500


class InvalidSuggestedSelectorError(ValueError):
    """Raised when an AI response's suggestedSelector fails the safety
    allow-list (shape, length, or forbidden chars).  Treated as a hard halt:
    the run terminates without opening any source file for writing."""


class SelectorReplaceError(RuntimeError):
    """Raised when `_apply_selector_fix` cannot perform an exact substring
    replace.  Refuses to fall back to fuzzy matching — a near-miss against
    a different chain in the same file would mutate the wrong code."""


def _is_valid_suggested(value: object) -> bool:
    """Return True iff `value` looks like a single Playwright locator
    expression and contains no obvious code-injection markers.

    Rejection classes (any of these → False):
      - non-string,
      - longer than MAX_SUGGESTED_LENGTH chars,
      - contains any byte in FORBIDDEN_CHARS,
      - contains the substring "$(",
      - does not match LOCATOR_SHAPE.
    """
    if not isinstance(value, str):
        return False
    if len(value) > MAX_SUGGESTED_LENGTH:
        return False
    if FORBIDDEN_CHARS & set(value):
        return False
    if "$(" in value:
        return False
    return bool(LOCATOR_SHAPE.match(value))


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


class SelectorFix:
    """Parsed selector fix proposal."""

    __slots__ = ("confidence", "broken_selector", "suggested_selector", "explanation")

    def __init__(
        self,
        confidence: str,
        broken_selector: str,
        suggested_selector: str,
        explanation: str,
    ):
        self.confidence = confidence
        self.broken_selector = broken_selector
        self.suggested_selector = suggested_selector
        self.explanation = explanation


class FailedTest:
    """A failed test extracted from results.json."""

    __slots__ = ("title", "project", "file", "line", "error_message", "output_dir")

    def __init__(
        self,
        title: str,
        project: str,
        file: str,
        line: int,
        error_message: str,
        output_dir: str | None = None,
    ):
        self.title = title
        self.project = project
        self.file = file
        self.line = line
        self.error_message = error_message
        # Path of the test's testInfo.outputDir relative to the shard root
        # (e.g. "test-results/home-home-page-Webkit-retry1"), derived from the
        # last result's attachments.  Used to pair error-context/dom artifacts
        # with the test that produced them — see issue #275.
        self.output_dir = output_dir


# ---------------------------------------------------------------------------
# Branch guard
# ---------------------------------------------------------------------------


def should_skip_branch(head_branch: str) -> bool:
    """Return True if the branch is a self-healing branch (loop prevention)."""
    return head_branch.startswith(BRANCH_PREFIX)


# ---------------------------------------------------------------------------
# Selector error classification
# ---------------------------------------------------------------------------


def is_selector_error(error_message: str) -> bool:
    """Return True if the error message indicates a selector/locator failure."""
    return bool(SELECTOR_ERROR_PATTERN.search(error_message))


# ---------------------------------------------------------------------------
# Parse selector-fix.md
# ---------------------------------------------------------------------------

_CONFIDENCE_RE = re.compile(r"\*\*Confidence:\*\*\s+(\w+)")
_BROKEN_RE = re.compile(r"\*\*Broken selector:\*\*\s+`([^`]+)`")
_SUGGESTED_RE = re.compile(r"\*\*Suggested selector:\*\*\s+`([^`]+)`")


def parse_selector_fix(content: str) -> SelectorFix | None:
    """Parse a selector-fix.md file into a SelectorFix, or None if malformed."""
    m_conf = _CONFIDENCE_RE.search(content)
    m_broken = _BROKEN_RE.search(content)
    m_suggested = _SUGGESTED_RE.search(content)
    if not (m_conf and m_broken and m_suggested):
        return None
    confidence = m_conf.group(1).lower()
    if confidence not in ("high", "medium", "low"):
        return None
    # Extract explanation: everything after "## Explanation"
    explanation = ""
    idx = content.find("## Explanation")
    if idx != -1:
        explanation = content[idx + len("## Explanation") :].strip()
    return SelectorFix(
        confidence=confidence,
        broken_selector=m_broken.group(1),
        suggested_selector=m_suggested.group(1),
        explanation=explanation,
    )


# ---------------------------------------------------------------------------
# Confidence filter
# ---------------------------------------------------------------------------


def filter_by_confidence(fixes: list[SelectorFix]) -> list[SelectorFix]:
    """Keep only medium and high confidence fixes."""
    return [f for f in fixes if f.confidence in ("high", "medium")]


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------


def deduplicate_fixes(fixes: list[SelectorFix]) -> list[SelectorFix]:
    """Remove duplicate fixes and no-op fixes (same broken_selector from multiple browsers,
    or suggested_selector identical to broken_selector)."""
    seen: dict[str, SelectorFix] = {}
    for fix in fixes:
        # Skip no-op fixes where the AI suggested the exact same selector
        if fix.broken_selector == fix.suggested_selector:
            continue
        if fix.broken_selector not in seen:
            seen[fix.broken_selector] = fix
        elif fix.confidence == "high" and seen[fix.broken_selector].confidence != "high":
            # Prefer higher confidence
            seen[fix.broken_selector] = fix
    return list(seen.values())


# ---------------------------------------------------------------------------
# Extract failed tests from results.json
# ---------------------------------------------------------------------------


def extract_failed_tests(results_path: Path) -> list[FailedTest]:
    """Parse results.json and return failed tests with selector errors."""
    with open(results_path) as f:
        data = json.load(f)

    failed: list[FailedTest] = []
    for suite in data.get("suites", []):
        _walk_suite(suite, failed)
    return failed


def _walk_suite(suite: dict, failed: list[FailedTest]) -> None:
    """Recursively walk suite/spec/test structure."""
    for spec in suite.get("specs", []):
        for test in spec.get("tests", []):
            if test.get("status") != "unexpected":
                continue
            results = test.get("results", [])
            if not results:
                continue
            # Use the last result (final retry)
            last = results[-1]
            if last.get("status") != "failed":
                continue
            errors = last.get("errors", [])
            error_msg = "\n".join(
                e.get("message", "") for e in errors
            )
            # Strip ANSI codes
            error_msg = re.sub(r"\x1b\[[0-9;]*m", "", error_msg)
            # Extract file path (relative to playwright/typescript/)
            file_path = spec.get("file", "")
            line = spec.get("line", 0)
            output_dir = _extract_output_dir(last.get("attachments", []))
            failed.append(
                FailedTest(
                    title=spec.get("title", ""),
                    project=test.get("projectName", ""),
                    file=file_path,
                    line=line,
                    error_message=error_msg,
                    output_dir=output_dir,
                )
            )
    for child in suite.get("suites", []):
        _walk_suite(child, failed)


def _extract_output_dir(attachments: list[dict]) -> str | None:
    """Derive the test's outputDir (relative to the shard root) from attachments.

    The Playwright JSON reporter records attachment paths as absolute runner
    paths like
    ``/home/runner/.../playwright/typescript/test-results/<slug>/dom.xhtml``.
    The self-healing workflow collects artifacts preserving the
    ``test-results/<slug>/`` segment (see ``Collect self-healing data`` step in
    ``playwright-typescript.yml``), so stripping everything before
    ``test-results/`` yields a path that resolves under the shard root.

    Returns ``None`` if no attachment carries a usable path — caller treats
    that as "no artifacts, skip this test" (issue #275).
    """
    for att in attachments:
        raw = att.get("path")
        if not isinstance(raw, str) or not raw:
            continue
        parts = Path(raw).parent.parts
        try:
            idx = parts.index("test-results")
        except ValueError:
            continue
        return str(Path(*parts[idx:]))
    return None


# ---------------------------------------------------------------------------
# Find selector-fix.md files in artifact directory
# ---------------------------------------------------------------------------


def find_selector_fixes(data_dir: Path) -> list[SelectorFix]:
    """Find and parse all selector-fix.md files, excluding attachments/ dirs."""
    fixes: list[SelectorFix] = []
    for fix_path in data_dir.rglob("selector-fix.md"):
        if "attachments" in fix_path.parts:
            continue
        content = fix_path.read_text(encoding="utf-8", errors="replace")
        fix = parse_selector_fix(content)
        if fix:
            fixes.append(fix)
    return fixes


# ---------------------------------------------------------------------------
# AI provider fallback — call API for selector fix
# ---------------------------------------------------------------------------

_SELECTOR_FIX_SYSTEM_PROMPT = textwrap.dedent("""\
    You are a Playwright test selector specialist. A test failed because a \
    locator could not find an element or matched multiple elements.

    Given the broken selector, the error message, and a DOM snapshot, propose \
    a replacement selector.

    This project uses getByRole/getByText with exact: true as the preferred \
    selector strategy. Avoid CSS selectors unless absolutely necessary.

    Reply with ONLY a JSON object (no markdown fencing, no extra text) matching \
    this schema:
    {
      "confidence": "high" | "medium" | "low",
      "brokenSelector": "<the original broken selector>",
      "suggestedSelector": "<your proposed replacement>",
      "explanation": "<why the original failed and why this fix should work>"
    }""")

_SELECTOR_EXTRACT = re.compile(
    r"((?:locator|getByRole|getByText|getByLabel|getByTestId|getByPlaceholder|getByAltText|getByTitle)"
    r"\([^)\n]*(?:\)[^)\n]*)*\))"
)


def _extract_broken_selector(error_message: str) -> str | None:
    m = _SELECTOR_EXTRACT.search(error_message)
    return m.group(1) if m else None


def _call_anthropic(api_key: str, user_content: str) -> str | None:
    model = os.environ.get("AI_MODEL_STRONG") or "claude-sonnet-4-6"
    body = json.dumps({
        "model": model,
        "max_tokens": 1024,
        "system": _SELECTOR_FIX_SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_content}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        for block in data.get("content", []):
            if block.get("type") == "text":
                return block["text"]
    except (urllib.error.URLError, json.JSONDecodeError, KeyError) as exc:
        print(f"[self-healing] Anthropic API call failed: {exc}", file=sys.stderr)
    return None


def _call_gemini(api_key: str, user_content: str) -> str | None:
    # Default matches diagnosis.util.ts — chosen for its free-tier RPD quota (500 vs 20).
    model = os.environ.get("AI_MODEL_STRONG") or "gemini-3.1-flash-lite-preview"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    body = json.dumps({
        "systemInstruction": {"parts": [{"text": _SELECTOR_FIX_SYSTEM_PROMPT}]},
        "contents": [{"parts": [{"text": user_content}]}],
        "generationConfig": {"maxOutputTokens": 1024},
    }).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                return parts[0].get("text", "")
    except (urllib.error.URLError, json.JSONDecodeError, KeyError) as exc:
        print(f"[self-healing] Gemini API call failed: {exc}", file=sys.stderr)
    return None


_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*\n(.*?)\n\s*```", re.DOTALL)


def _parse_ai_response(text: str, broken_selector: str) -> SelectorFix | None:
    """Parse JSON response from AI provider into a SelectorFix.

    Handles three response shapes: bare JSON, fenced JSON at the boundaries,
    and JSON fenced somewhere in the middle of explanatory text.
    """
    stripped = text.strip()
    # Try bare JSON first
    candidate = re.sub(r"^```(?:json)?\s*", "", stripped)
    candidate = re.sub(r"\s*```$", "", candidate).strip()
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        # Try extracting a fenced JSON block from anywhere in the response
        m = _JSON_BLOCK_RE.search(stripped)
        if not m:
            return None
        try:
            data = json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            return None
    conf = data.get("confidence", "")
    if conf not in ("high", "medium", "low"):
        return None
    suggested = data.get("suggestedSelector", "")
    explanation = data.get("explanation", "")
    if not isinstance(suggested, str) or not isinstance(explanation, str):
        return None
    # Safety gate: a hostile AI response could pass the schema check (string +
    # one of three confidence values) and then carry an arbitrary payload to
    # be planted into a spec file by the downstream replace.  Reject anything
    # outside the Playwright-locator shape and halt the run hard — silent
    # `return None` here would let the next fix in the batch proceed.
    if not _is_valid_suggested(suggested):
        raise InvalidSuggestedSelectorError(
            f"AI returned a suggestedSelector that does not pass the locator-shape "
            f"allow-list (length, forbidden chars, or shape): {suggested!r}"
        )
    return SelectorFix(
        confidence=conf,
        broken_selector=broken_selector,
        suggested_selector=suggested,
        explanation=explanation,
    )


def request_selector_fix_from_ai(
    error_message: str,
    dom_content: str,
    provider: str = "anthropic",
    error_context: str | None = None,
) -> SelectorFix | None:
    """Call AI provider to get a selector fix proposal (fallback path).

    When *error_context* is provided (the Playwright built-in error-context.md
    attachment), it replaces dom_content entirely — the accessibility tree
    snapshot it contains is more useful for selector fixing than raw HTML,
    and it also bundles the test source and error details.
    """
    broken = _extract_broken_selector(error_message)
    if not broken:
        return None

    api_key_env = {"anthropic": "ANTHROPIC_API_KEY", "gemini": "GEMINI_API_KEY"}
    api_key = os.environ.get(api_key_env.get(provider, ""), "")
    if not api_key:
        return None

    if error_context:
        # error-context.md already contains the page snapshot (accessibility
        # tree), test source, and error details — no need for dom.xhtml.
        # Strip the "# Instructions" section to avoid conflicting with our
        # system prompt (it tells the AI to "explain why", which causes it
        # to add prose before the JSON we need).
        ec_cleaned = re.sub(
            r"^#\s*Instructions\b.*?(?=^#\s|\Z)", "", error_context,
            count=1, flags=re.MULTILINE | re.DOTALL,
        ).strip()
        user_content = "\n".join([
            f"Broken selector: {broken}",
            "",
            ec_cleaned[:DOM_TRUNCATE_CHARS],
        ])
    else:
        dom_snippet = dom_content[:DOM_TRUNCATE_CHARS]
        if len(dom_content) > DOM_TRUNCATE_CHARS:
            dom_snippet += "\n...[truncated]"
        user_content = "\n".join([
            f"Broken selector: {broken}",
            f"Errors:\n{error_message}",
            "",
            "--- DOM snapshot (may be truncated) ---",
            dom_snippet,
        ])

    callers = {"anthropic": _call_anthropic, "gemini": _call_gemini}
    caller = callers.get(provider)
    if not caller:
        print(f"[self-healing] Unknown AI_PROVIDER: {provider}", file=sys.stderr)
        return None

    text = caller(api_key, user_content)
    if not text:
        return None
    return _parse_ai_response(text, broken)


# ---------------------------------------------------------------------------
# GitHub helpers (via gh CLI)
# ---------------------------------------------------------------------------


def gh(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    """Run a gh CLI command and return the result.

    When *check* is True and the command fails, stderr is printed before
    re-raising so the CI log always shows why.
    """
    result = subprocess.run(
        ["gh", *args],
        capture_output=True,
        text=True,
    )
    if check and result.returncode != 0:
        print(f"[self-healing] gh {args[0]} failed (exit {result.returncode}): "
              f"{result.stderr.strip()}", file=sys.stderr)
        result.check_returncode()
    return result


def find_pr_for_branch(branch: str) -> int | None:
    """Return the PR number for a branch, or None if no open PR exists."""
    result = gh(
        "pr", "list",
        "--head", branch,
        "--state", "open",
        "--json", "number",
        check=False,
    )
    if result.returncode != 0:
        return None
    prs = json.loads(result.stdout)
    return prs[0]["number"] if prs else None


def count_self_healing_comments(pr_number: int) -> int:
    """Count comments on a PR that contain the self-healing marker.

    ``gh api --paginate`` applies ``--jq`` per page, so the output is one
    number per page (e.g. ``"1\\n0\\n"``).  We sum them to get the total.
    """
    result = gh(
        "api",
        f"repos/{{owner}}/{{repo}}/issues/{pr_number}/comments",
        "--paginate",
        "--jq", f'[.[] | select(.body | contains("{COMMENT_MARKER}"))] | length',
        check=False,
    )
    if result.returncode != 0:
        return 0
    total = 0
    for line in result.stdout.strip().splitlines():
        try:
            total += int(line)
        except ValueError:
            continue
    return total


def _default_branch() -> str:
    return os.environ.get("GITHUB_DEFAULT_BRANCH", "main")


def has_existing_self_healing_pr(base_branch: str | None = None) -> bool:
    """Check if an open draft PR with the self-healing label already exists."""
    result = gh(
        "pr", "list",
        "--label", SELF_HEALING_LABEL,
        "--state", "open",
        "--base", base_branch or _default_branch(),
        "--json", "number",
        check=False,
    )
    if result.returncode != 0:
        return False
    prs = json.loads(result.stdout)
    return len(prs) > 0


# ---------------------------------------------------------------------------
# Compose comment body
# ---------------------------------------------------------------------------


def compose_comment(fixes: list[SelectorFix], run_id: str) -> str:
    """Build the markdown comment body with all fix proposals."""
    lines = [
        COMMENT_MARKER,
        "## Self-Healing: Selector Fix Proposal",
        "",
        f"Workflow run: [{run_id}]({_run_url(run_id)})",
        "",
    ]
    for i, fix in enumerate(fixes, 1):
        if len(fixes) > 1:
            lines.append(f"### Fix {i}")
            lines.append("")
        lines.extend([
            f"**Confidence:** {fix.confidence}",
            "",
            "**Broken selector:**",
            f"```",
            fix.broken_selector,
            "```",
            "",
            "**Suggested selector:**",
            f"```",
            fix.suggested_selector,
            "```",
            "",
            f"**Explanation:** {fix.explanation}",
            "",
            "---",
            "",
        ])
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Actions: post comment / create draft PR
# ---------------------------------------------------------------------------


def post_comment(pr_number: int, body: str, *, dry_run: bool = False) -> None:
    """Post a comment on the given PR."""
    if dry_run:
        print(f"[DRY RUN] Would post comment on PR #{pr_number}:")
        print(body)
        return
    body_file = Path("/tmp/self-healing-comment.md")
    body_file.write_text(body, encoding="utf-8")
    gh("pr", "comment", str(pr_number), "--body-file", str(body_file))
    print(f"[self-healing] Posted comment on PR #{pr_number}")


def _apply_selector_fix(content: str, fix: SelectorFix) -> str:
    """Replace a broken selector in source code via exact substring match.

    Refuses any fuzzy match.  When the broken selector is not an exact
    substring of `content` (e.g. the source wraps the chain across multiple
    lines while `broken_selector` is single-line), raises
    `SelectorReplaceError` — a near-miss against an unrelated chain in the
    same file would mutate the wrong code.  Multi-line chain repair is
    out of scope for this auto-fix path; a human handles those cases.

    Returns the new file contents.  The diff is guaranteed to be confined
    to the single contiguous range originally occupied by `fix.broken_selector`.
    """
    if fix.broken_selector not in content:
        raise SelectorReplaceError(
            f"broken_selector not found in source as an exact substring: "
            f"{fix.broken_selector!r}"
        )
    return content.replace(fix.broken_selector, fix.suggested_selector, 1)


def create_draft_pr(
    fixes: list[SelectorFix],
    head_sha: str,
    run_id: str,
    *,
    dry_run: bool = False,
) -> None:
    """Apply fixes, commit, push, and create a draft PR."""
    short_sha = head_sha[:7]
    fix_branch = f"{BRANCH_PREFIX}{short_sha}"
    comment_body = compose_comment(fixes, run_id)

    if dry_run:
        print(f"[DRY RUN] Would create draft PR on branch {fix_branch}:")
        print(comment_body)
        return

    # Configure git author for the bot commit
    git_run("git", "config", "user.name", "github-actions[bot]")
    git_run("git", "config", "user.email", "github-actions[bot]@users.noreply.github.com")

    # Ensure the self-healing label exists (idempotent)
    gh("label", "create", SELF_HEALING_LABEL,
       "--color", "FFA500",
       "--description", "Auto-generated selector fix",
       check=False)

    # Create branch from the failing commit
    git_run("git", "checkout", "-b", fix_branch, head_sha)

    # Apply each fix to test source files.  `_apply_selector_fix` raises
    # `SelectorReplaceError` per file when the broken selector isn't an exact
    # substring of that file — the broken selector is rarely in every spec, so
    # we catch per file and keep iterating.  If no file in the loop matched,
    # the fix is reported as un-appliable on stderr and the next fix runs.
    pw_dir = Path("playwright/typescript")
    applied = 0
    for fix in fixes:
        fix_applied = False
        for ts_file in pw_dir.rglob("*.spec.ts"):
            content = ts_file.read_text(encoding="utf-8")
            try:
                new_content = _apply_selector_fix(content, fix)
            except SelectorReplaceError:
                continue
            if new_content != content:
                ts_file.write_text(new_content, encoding="utf-8")
                git_run("git", "add", str(ts_file))
                applied += 1
                fix_applied = True
                break  # Only fix first occurrence
        if not fix_applied:
            print(
                f"[self-healing] could not apply fix (no exact match in any spec): "
                f"{fix.broken_selector!r}",
                file=sys.stderr,
            )

    if applied == 0:
        print("[self-healing] No fixes could be applied to source files", file=sys.stderr)
        return

    git_run(
        "git", "commit", "-m",
        f"fix: self-healing selector repair ({short_sha})",
    )
    git_run("git", "push", "origin", fix_branch)

    body_file = Path("/tmp/self-healing-pr-body.md")
    body_file.write_text(comment_body, encoding="utf-8")
    pr_args = (
        "pr", "create",
        "--draft",
        "--title", f"fix: self-healing selector repair ({short_sha})",
        "--body-file", str(body_file),
        "--label", SELF_HEALING_LABEL,
        "--head", fix_branch,
        "--base", _default_branch(),
    )
    result = gh(*pr_args, check=False)
    if result.returncode != 0:
        import time
        print(f"[self-healing] gh pr create failed, retrying in 5s: {result.stderr.strip()}",
              file=sys.stderr)
        time.sleep(5)
        gh(*pr_args)  # check=True — fail loudly on second attempt
    print(f"[self-healing] Created draft PR on branch {fix_branch}")


def git_run(*args: str) -> None:
    """Run a git command via subprocess."""
    subprocess.run(args, check=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(data_dir: str) -> None:
    data_path = Path(data_dir)
    head_branch = os.environ.get("HEAD_BRANCH", "")
    head_sha = os.environ.get("HEAD_SHA", "")
    run_id = os.environ.get("RUN_ID", "")
    provider = os.environ.get("AI_PROVIDER", "anthropic")
    dry_run = os.environ.get("DRY_RUN", "").lower() == "true"

    # Layer 1: Branch guard
    if should_skip_branch(head_branch):
        print(f"[self-healing] Skipping: self-healing branch ({head_branch})")
        return

    # Walk results.json artifacts once so Step 2 and the cross-check guard
    # below share the same parsed failed-test data.
    all_failed_tests: list[tuple[Path, list[FailedTest]]] = [
        (rf, extract_failed_tests(rf)) for rf in data_path.rglob("results.json")
    ]
    # Authoritative set of failed-test error messages.  Any fix whose
    # broken_selector does not appear in at least one of these is stale (e.g.
    # a selector-fix.md left over from a prior run that wasn't cleaned up)
    # and must be dropped — see issue #291.
    failed_error_messages: list[str] = [
        t.error_message for _, tests in all_failed_tests for t in tests
    ]

    def _drop_unreferenced_fixes(candidates: list[SelectorFix]) -> list[SelectorFix]:
        kept = [
            f for f in candidates
            if any(f.broken_selector in msg for msg in failed_error_messages)
        ]
        dropped = len(candidates) - len(kept)
        if dropped:
            print(
                f"[self-healing] Dropped {dropped} fix(es) whose broken selector "
                f"is not referenced by any failed test",
                file=sys.stderr,
            )
        return kept

    # Step 1: Find pre-computed selector fixes
    fixes = find_selector_fixes(data_path)
    fixes = filter_by_confidence(fixes)
    fixes = deduplicate_fixes(fixes)
    fixes = _drop_unreferenced_fixes(fixes)

    # Step 2: Fallback — check results.json for selector errors and call AI
    if not fixes:
        for results_file, failed_tests in all_failed_tests:
            selector_failures = [t for t in failed_tests if is_selector_error(t.error_message)]
            for test in selector_failures:
                # Pair artifacts with the test that produced them by using the
                # test's own testInfo.outputDir (issue #275).  A shard-wide
                # rglob[0] would pick whichever error-context/dom appeared
                # first in traversal order, which may belong to a different
                # failing test.
                if not test.output_dir:
                    print(
                        f"[self-healing] Skipping {test.title!r} ({test.project}): "
                        "no attachments recorded in results.json",
                        file=sys.stderr,
                    )
                    continue
                test_output_dir = results_file.parent / test.output_dir
                ec_path = test_output_dir / "error-context.md"
                dom_path = test_output_dir / "dom.xhtml"
                error_context = (
                    ec_path.read_text(encoding="utf-8", errors="replace")
                    if ec_path.is_file() else None
                )
                dom_content = (
                    dom_path.read_text(encoding="utf-8", errors="replace")
                    if dom_path.is_file() else ""
                )
                if not error_context and not dom_content:
                    print(
                        f"[self-healing] Skipping {test.title!r} ({test.project}): "
                        f"no error-context.md or dom.xhtml under {test_output_dir}",
                        file=sys.stderr,
                    )
                    continue
                fix = request_selector_fix_from_ai(
                    test.error_message, dom_content, provider,
                    error_context=error_context,
                )
                if fix:
                    fixes.append(fix)
        fixes = filter_by_confidence(fixes)
        fixes = deduplicate_fixes(fixes)
        fixes = _drop_unreferenced_fixes(fixes)

    if not fixes:
        print("[self-healing] No actionable selector fixes found")
        return

    # Defensive re-check (issue #291): every fix reaching the output stage must
    # reference a real failed test.  The cross-check guards in Steps 1 and 2
    # already enforce this — this is a last-ditch safety net against future
    # regressions in the filter pipeline.
    for fix in fixes:
        if not any(fix.broken_selector in msg for msg in failed_error_messages):
            print(
                f"[self-healing] Refusing to act: fix for {fix.broken_selector!r} "
                "is not referenced by any failed-test error message",
                file=sys.stderr,
            )
            return

    # Step 3: Determine output mode
    pr_number = find_pr_for_branch(head_branch)

    if pr_number:
        # PR comment mode
        # Layer 3: Max attempts
        attempts = count_self_healing_comments(pr_number)
        if attempts >= MAX_ATTEMPTS:
            print(
                f"[self-healing] Max attempts ({MAX_ATTEMPTS}) reached for PR #{pr_number}"
            )
            return
        body = compose_comment(fixes, run_id)
        post_comment(pr_number, body, dry_run=dry_run)
    else:
        # Draft PR mode
        # Layer 4: Dedup
        if has_existing_self_healing_pr():
            print("[self-healing] A self-healing PR already exists, skipping")
            return
        create_draft_pr(fixes, head_sha, run_id, dry_run=dry_run)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <data-dir>", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1])
