# Quality Metrics

> Last updated: 2026-04-10

## Defect Escape Rate

| Discovery method | Count |
|-----------------|-------|
| Found by automated tests | 5 |
| Found by manual testing (staging) | 1 |
| Found in production | 1 |
| **Total bugs** | **7** |
| **Escape rate** | **14%** |

## Mean Time To Resolve

| Scope | MTTR |
|-------|------|
| All closed bugs | 1.4 days |
| Found by automated tests | 2.3 days |
| Found by manual testing (staging) | 2.2 hours |
| Found in production | 0.4 hours |

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
| 2026-04-10 | 14% | 1.4 days | 64% |
