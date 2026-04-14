#!/bin/bash
# Fake python3 for tests. Ignores argv and emits a fixture file or exits non-zero.
# Controlled by env vars: FAKE_OUTPUT (file to cat) or FAKE_EXIT_CODE (status).
if [ -n "$FAKE_EXIT_CODE" ]; then
  echo "fake-python: simulated failure" >&2
  exit "$FAKE_EXIT_CODE"
fi
cat "$FAKE_OUTPUT"
