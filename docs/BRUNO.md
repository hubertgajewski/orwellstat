# Bruno API Collection

The Bruno collection lives under [`bruno/`](../bruno). It covers a simple CSRF bootstrap plus invalid and valid login checks against production or staging.

## Setup

Open the `bruno/` directory in the Bruno standalone app or the Bruno VSCode extension.

For CLI runs, copy the environment file and install dependencies:

```bash
cp bruno/.env.example bruno/.env
cd bruno
npm ci
```

`bruno/.env` must live at the collection root. Bruno CLI reads secrets from that file, not from environment directories.

Required keys:

```text
ORWELLSTAT_USER=<username>
ORWELLSTAT_PASSWORD=<password>
BASIC_AUTH_USER=<staging basic auth user>
BASIC_AUTH_PASSWORD=<staging basic auth password>
```

## Environments

| Environment  | Base URL                                      |
| ------------ | --------------------------------------------- |
| `production` | `https://orwellstat.hubertgajewski.com`       |
| `staging`    | `https://stage.orwellstat.hubertgajewski.com` |

Staging requires HTTP Basic Auth in addition to the application login.

To adapt Bruno to another application, replace the `baseUrl` values in:

- [`bruno/environments/production.bru`](../bruno/environments/production.bru)
- [`bruno/environments/staging.bru`](../bruno/environments/staging.bru)

Then update request paths, CSRF extraction, request bodies, and expected statuses in:

- [`bruno/csrf-bootstrap.bru`](../bruno/csrf-bootstrap.bru)
- [`bruno/login-invalid.bru`](../bruno/login-invalid.bru)
- [`bruno/login-valid.bru`](../bruno/login-valid.bru)

## CLI

Run from `bruno/`:

```bash
npx bru run --env production
npx bru run --env staging
```

## Variable Syntax

| Context             | Secret syntax                   | Bruno variable syntax      |
| ------------------- | ------------------------------- | -------------------------- |
| Request body or URL | `{{process.env.VAR_NAME}}`      | `{{varName}}`              |
| Pre-request scripts | `bru.getProcessEnv('VAR_NAME')` | `bru.getEnvVar('varName')` |

Use dotenv-backed secrets for credentials. Do not store plaintext credentials in `.bru` files.

## Requests

| File                 | Sequence | Description                                                                                        |
| -------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `csrf-bootstrap.bru` | 0        | GET `/zone/`, extract rendered `_csrf` hidden input, store as `{{bootstrapCsrfToken}}`, expect 200 |
| `login-invalid.bru`  | 1        | POST `/zone/` with invalid credentials plus bootstrap CSRF token, expect 401                       |
| `login-valid.bru`    | 2        | POST `/zone/` with valid credentials plus bootstrap CSRF token, expect 200                         |

The bootstrap CSRF token is captured once. It is not refreshed after `login-valid.bru` rotates the server-side token on successful login.

## CI

`.github/workflows/bruno.yml` runs on push/PR to `main`/`master` and on `workflow_dispatch`. It is gated by `vars.BRUNO == 'true'`.

Behavior:

- Uses workflow-level concurrency group `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`.
- Writes required secrets, including staging Basic Auth, into `bruno/.env`.
- Runs `bru run --env "$ENV"` where `ENV` is driven by the selected GitHub Environment.
- Removes `bruno/.env` in a cleanup step with `if: always()` so plaintext credentials do not remain on the runner filesystem.
- Uses GitHub Environment `staging` by default and `production` when selected by manual dispatch.
- Production has a required-reviewer protection rule.

Manual dispatch inputs:

| Input    | Purpose                                                    |
| -------- | ---------------------------------------------------------- |
| `env`    | `staging` or `production`; default `staging`               |
| `runner` | Optional runner override; leave empty to use `vars.RUNNER` |

Behavior change from April 2026: push/PR/schedule-style runs target staging by default. Production requires manual dispatch with `env=production`.
