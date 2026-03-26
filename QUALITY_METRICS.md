# Quality Metrics

> Last updated: 2026-03-23

## Defect Escape Rate

| Discovery method | Count |
|-----------------|-------|
| Found by automated tests | 4 |
| Found by manual testing (staging) | 1 |
| Found in production | 0 |
| **Total bugs** | **5** |
| **Escape rate** | **0%** |

> All bugs were caught before production (escape rate: 0%).

## Mean Time To Resolve

| Scope | MTTR |
|-------|------|
| All closed bugs | 1.5 days |
| Found by automated tests | 2.2 days |
| Found by manual testing (staging) | 2.2 hours |
| Found in production | N/A |

## Test Coverage Matrix

| Page | Title | Content | Accessibility | Visual Regression | API |
|------|---|---|---|---|---|
| `/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `/2/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: |
| `/about/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `/contact/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `/password_reset/` | :white_check_mark: | :x: | :white_check_mark: | :x: | :white_check_mark: |
| `/register/` | :white_check_mark: | :x: | :white_check_mark: | :x: | :white_check_mark: |
| `/statistics/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `/zone/` | :white_check_mark: | :x: | :x: | :x: | :white_check_mark: |
| `/zone/admin/` | :white_check_mark: | :x: | :x: | :x: | :white_check_mark: |
| `/zone/hits/` | :white_check_mark: | :x: | :x: | :x: | :white_check_mark: |
| `/zone/scripts/` | :white_check_mark: | :x: | :x: | :x: | :white_check_mark: |
| `/zone/stats/` | :white_check_mark: | :x: | :x: | :x: | :white_check_mark: |

### Forms

| Form | Covered |
|------|---------|
| adminSettings | :x: |
| hitsFilter | :x: |
| login | :x: |
| styleSelector | :white_check_mark: |

**Overall coverage: 64%** (41/64 items covered)

## Trends

| Date | Escape Rate | MTTR | Coverage |
|------|-------------|------|----------|
| 2026-03-19 | 0% | 1.8 days | 62% |
| 2026-03-23 | 0% | 1.5 days | 64% |
