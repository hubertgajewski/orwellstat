# Security Policy

This repository contains test automation code (Playwright, Bruno) for the orwellstat project. It is not a versioned software product and does not have supported release versions.

## Reporting a Vulnerability

If you discover a security vulnerability in this repository (e.g. hardcoded credentials, insecure CI configuration), please report it by opening a [GitHub Issue](https://github.com/hubertgajewski/orwellstat/issues) or contacting the repository owner directly via GitHub.

---

## AI diagnosis data egress

When `AI_DIAGNOSIS=true`, every failed test POSTs its error messages, up to 30 000 chars of DOM, and its browser console logs to the configured provider (Anthropic or Gemini). Before transport, `redactSensitive()` in `utils/diagnosis.util.ts` masks the following well-known secrets:

| Category                            | Pattern (case-insensitive unless noted)                                                                                                  | Replacement                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Cookie header value                 | `Cookie: <name>=<value>` (value until `;"<>` or newline)                                                                                 | `Cookie: <name>=[REDACTED]`        |
| Set-Cookie header value             | `Set-Cookie: <name>=<value>`                                                                                                             | `Set-Cookie: <name>=[REDACTED]`    |
| Multi-pair cookie chain             | `; <name>=<value>` (catches the 2nd–Nth segment of a `Cookie:` chain; intentionally also masks `Path=` / `Domain=` etc. on `Set-Cookie`) | `; <name>=[REDACTED]`              |
| Bearer token (with header)          | `Authorization: Bearer <token>`                                                                                                          | `Authorization: Bearer [REDACTED]` |
| Bearer token (standalone)           | `bearer <token>` where token is 12+ chars of `A-Za-z0-9._-`                                                                              | `bearer [REDACTED]`                |
| API key header / JSON               | `x-api-key`, `apikey` followed by `:` or `=`, optional surrounding quotes, value 8+ chars                                                | `<key><sep>[REDACTED]`             |
| API key / token in URL query string | `?apikey=…`, `?api_key=…`, `?token=…` (and the `&…` variants)                                                                            | `?<key>=[REDACTED]`                |
| JWT (anywhere)                      | `eyJ….eyJ….[A-Za-z0-9_-]+` (case-sensitive — base64url JWT shape, 8+ chars per segment)                                                  | `[REDACTED_JWT]`                   |
| Email local-part                    | `<local>@<domain>`                                                                                                                       | `<first-char>***@<domain>`         |

**What still crosses the provider boundary after redaction:**

- Full XHTML DOM structure (tag names, attribute names, data-\* attributes, CSS class names), which can fingerprint the application.
- Test metadata: test title, browser project name, status, expected status.
- Error messages verbatim apart from the redactions above — assertion diffs, stack traces, and any locator strings are forwarded.
- Base URL, request paths, and non-redacted query strings visible in the DOM or console logs.
- Session IDs, CSRF tokens, or secrets that **do not** match one of the patterns above (e.g. a CSRF token in a hidden `<input>` not named `apikey`/`api_key`/`token`, or an opaque session token outside any of the recognized header/query-string contexts).

If a test can render data that falls outside those patterns, keep `AI_DIAGNOSIS` unset for that suite, or extend `REDACT_PATTERNS` before enabling it.

The local `dom.xhtml` Playwright attachment is **not** redacted — it is only ever saved to the test's output directory (and any published Playwright report artifact). Redaction happens in memory on the copy sent to the AI provider.
