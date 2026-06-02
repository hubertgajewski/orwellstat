# Quality Metrics

> Last updated: 2026-06-01

## Defect Escape Rate

| Discovery method | Count |
|-----------------|-------|
| Found by automated tests | 28 |
| Found by manual testing (staging) | 17 |
| Found in production | 2 |
| **Total bugs** | **47** |
| **Escape rate** | **4%** |

## Mean Time To Resolve

| Scope | MTTR |
|-------|------|
| All closed bugs | 1.0 days |
| Found by automated tests | 23.4 hours |
| Found by manual testing (staging) | 1.3 days |
| Found in production | 0.3 hours |

## Test Coverage Matrix

| Page | Title | Content | Accessibility | Visual Regression | API | Security Headers | Negative Path | Tracking |
|------|---|---|---|---|---|---|---|---|
| `/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: |
| `/2/` | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: | :x: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: |
| `/about/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: |
| `/contact/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: |
| `/password_reset/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: |
| `/register/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: |
| `/scripts/*.php` | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: | :white_check_mark: |
| `/statistics/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :heavy_minus_sign: | :heavy_minus_sign: |
| `/zone/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :white_check_mark: | :heavy_minus_sign: |
| `/zone/admin/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :white_check_mark: | :heavy_minus_sign: |
| `/zone/hits/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :white_check_mark: | :heavy_minus_sign: |
| `/zone/scripts/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :white_check_mark: | :heavy_minus_sign: |
| `/zone/stats/` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :heavy_minus_sign: | :white_check_mark: | :heavy_minus_sign: |

### Forms

| Form | Covered |
|------|---------|
| adminSettings | :white_check_mark: |
| hitsFilter | :white_check_mark: |
| login | :x: |
| statisticsParameter | :white_check_mark: |
| styleSelector | :white_check_mark: |

**Overall coverage: 96%** (68/71 items covered)

## Trends

| Date | Escape Rate | MTTR | Coverage |
|------|-------------|------|----------|
| 2026-03-19 | 0% | 1.8 days | 62% |
| 2026-04-10 | 14% | 1.4 days | 64% |
| 2026-05-01 | 5% | 13.7 hours | 83% |
| 2026-06-01 | 4% | 1.0 days | 96% |
