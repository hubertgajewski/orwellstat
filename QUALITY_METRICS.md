# Quality Metrics

> Last updated: 2026-05-01

## Defect Escape Rate

| Discovery method | Count |
|-----------------|-------|
| Found by automated tests | 23 |
| Found by manual testing (staging) | 13 |
| Found in production | 2 |
| **Total bugs** | **38** |
| **Escape rate** | **5%** |

## Mean Time To Resolve

| Scope | MTTR |
|-------|------|
| All closed bugs | 13.7 hours |
| Found by automated tests | 21.1 hours |
| Found by manual testing (staging) | 5.2 hours |
| Found in production | 0.3 hours |

## Test Coverage Matrix

| Page | Title | Content | Accessibility | Visual Regression | API |
|------|---|---|---|---|---|
| `/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `/2/` | :white_check_mark: | :white_check_mark: | :x: | :x: | :x: |
| `/about/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `/contact/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `/password_reset/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: |
| `/register/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: |
| `/statistics/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| `/zone/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: |
| `/zone/admin/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: |
| `/zone/hits/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: |
| `/zone/scripts/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: |
| `/zone/stats/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: |

### Forms

| Form | Covered |
|------|---------|
| adminSettings | :white_check_mark: |
| hitsFilter | :white_check_mark: |
| login | :x: |
| statisticsParameter | :white_check_mark: |
| styleSelector | :white_check_mark: |

**Overall coverage: 83%** (54/65 items covered)

## Trends

| Date | Escape Rate | MTTR | Coverage |
|------|-------------|------|----------|
| 2026-03-19 | 0% | 1.8 days | 62% |
| 2026-04-10 | 14% | 1.4 days | 64% |
| 2026-05-01 | 5% | 13.7 hours | 83% |
