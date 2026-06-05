#!/usr/bin/env python3
"""Generate the high-line-count deep-review-pro benchmark fixture."""

from __future__ import annotations

import argparse
from pathlib import Path


DEFAULT_DOC_LINES = 3025
DEFAULT_OUT = Path("docs/deep-review-pro-benchmark/fixtures/high-lines.diff")


def append_new_file_diff(lines: list[str], path: str, body: list[str]) -> None:
    lines.extend(
        [
            f"diff --git a/{path} b/{path}",
            "new file mode 100644",
            "index 0000000..1111111",
            "--- /dev/null",
            f"+++ b/{path}",
            f"@@ -0,0 +1,{len(body)} @@",
        ]
    )
    lines.extend(f"+{line}" for line in body)


def build_high_lines_fixture(doc_line_count: int = DEFAULT_DOC_LINES) -> str:
    doc_body = [
        "# High Lines Benchmark Fixture",
        "",
        "This synthetic file exists only inside the benchmark fixture diff.",
        "It gives `/deep-review-pro` a stable high-line-count scope without changing production documentation.",
        "",
    ]
    for index in range(1, doc_line_count + 1):
        doc_body.append(
            "Synthetic benchmark line "
            f"{index:04d}: stable large-diff payload for token and dispatch measurement."
        )

    lines: list[str] = []
    append_new_file_diff(
        lines,
        "docs/deep-review-pro-benchmark/synthetic/high-lines.md",
        doc_body,
    )
    append_new_file_diff(
        lines,
        "scripts/deep_review_high_lines_fixture.py",
        [
            '"""Synthetic benchmark helper used only by the high-lines fixture diff."""',
            "",
            "from __future__ import annotations",
            "",
            "",
            "def summarize_fixture_lines(lines: list[str]) -> dict[str, int]:",
            '    """Return simple line metrics for benchmark fixture input."""',
            "    non_empty = [line for line in lines if line.strip()]",
            "    return {",
            '        "total": len(lines),',
            '        "non_empty": len(non_empty),',
            '        "empty": len(lines) - len(non_empty),',
            "    }",
            "",
            "",
            "def fixture_name() -> str:",
            '    """Return the stable fixture identifier."""',
            '    return "high-lines"',
        ],
    )
    append_new_file_diff(
        lines,
        "playwright/typescript/tests/deep-review-high-lines.spec.ts",
        [
            "import { expect, test } from '@fixtures/base.fixture';",
            "import { HIGH_LINES_FIXTURE_NAME, isHighLinesFixture } from '@utils/deep-review-high-lines';",
            "",
            "test.describe('high-lines benchmark fixture', { tag: '@regression' }, () => {",
            "  test('recognizes the high-lines fixture name', async () => {",
            "    expect(isHighLinesFixture(HIGH_LINES_FIXTURE_NAME)).toBe(true);",
            "  });",
            "});",
        ],
    )
    append_new_file_diff(
        lines,
        "playwright/typescript/utils/deep-review-high-lines.ts",
        [
            "export const HIGH_LINES_FIXTURE_NAME = 'high-lines' as const;",
            "",
            "export function isHighLinesFixture(name: string): boolean {",
            "  return name === HIGH_LINES_FIXTURE_NAME;",
            "}",
        ],
    )
    append_new_file_diff(
        lines,
        ".github/workflows/deep-review-high-lines.yml",
        [
            "name: Deep Review High Lines Fixture",
            "",
            "on:",
            "  workflow_dispatch:",
            "",
            "jobs:",
            "  noop:",
            "    runs-on: ubuntu-latest",
            "    steps:",
            "      - name: Print fixture name",
            "        run: echo high-lines",
        ],
    )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="Path where the generated high-lines diff should be written.",
    )
    parser.add_argument(
        "--doc-lines",
        type=int,
        default=DEFAULT_DOC_LINES,
        help="Number of synthetic documentation payload lines to generate.",
    )
    args = parser.parse_args(argv)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(build_high_lines_fixture(args.doc_lines))
    print(args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
