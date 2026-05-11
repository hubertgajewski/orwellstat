# Project Management

Planning and progress tracking for this repo live in [Project #1](https://github.com/users/hubertgajewski/projects/1). Use T-shirt sizing on epics and Fibonacci story points on stories. The two fields never overlap on a single item.

The `/create-issue` skill is authoritative for how to populate issue fields and project fields.

## Point Scale

Use story points only for stories. Estimate is a relative-complexity judgment, not a time estimate. Pick by analogy to the reference story.

| Points | Meaning                                                                                                  | Examples               |
| ------ | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1      | Trivial: single-line change, doc tweak, config swap                                                      | #191, #211, #215, #227 |
| 2      | Small: single-file logic change, minor bug, understood scope                                             | #198, #217, #232       |
| 3      | Reference: new skill, new MCP server, moderate refactor across 3-5 files                                 | #145                   |
| 5      | Complex: coordinated multi-file changes, visible uncertainty                                             | #176                   |
| 8      | Big: many moving parts, significant unknowns                                                             |                        |
| 13     | Warning zone: review for splitting or promoting to an epic. Proceed only if a split would be artificial. |                        |
| 21+    | Not allowed: must become an epic and be broken into child stories.                                       |                        |

## Size Scale

Use T-shirt size only for epics. Size is a coarse roadmap guess, not a mechanical sum of child-story points.

| Size | Intuition                                                                  |
| ---- | -------------------------------------------------------------------------- |
| XS   | Micro-epic: exactly 2 trivial 1-point stories, no more than 2 points total |
| S    | Small: 2-3 stories, narrow scope                                           |
| M    | Moderate: 4-6 stories                                                      |
| L    | Large: 5-9 stories                                                         |
| XL   | Very large: 6+ stories and/or a major cross-cutting concern                |

## Epic And Story Convention

- Stories are regular issues. Prefix them like `[bug]`, `[ci]`, `[enhancement]`, `[docs]`, and similar topic labels.
- Stories carry `Estimate` points and no `Size`.
- Epics prefix with `[epic]` and apply the `epic` label.
- Epics carry `Size` and no `Estimate`.
- A story joins an epic through GitHub's sub-issue relationship, surfaced on the board as `Parent issue` and auto-counted in `Sub-issues progress`.
- Retrospective epics are allowed. They group already-closed stories to organize history. Their children can already be closed; the epic itself ships as `N/N complete`.

## Dates

- `Start date`: day work began. Use the first commit day or the day the story moved to `In progress`.
- `Target date`: planned merge day while in flight, actual merge day once done.
- Retrospective epics: Start = earliest child `createdAt`, Target = latest child `closedAt`.

## Actual Hours

`Actual hours` is a retrospective numeric field populated by the `/fix-issue` skill after a PR merges.

Value = sum of active-commit-day hours derived from `git log` timestamps.

Use the field as a scale-drift detector. For example, if 3-point stories routinely take 5 hours instead of roughly 1 hour, the scale needs re-anchoring. Never use actual hours as an input to estimation; points are chosen by analogy.
