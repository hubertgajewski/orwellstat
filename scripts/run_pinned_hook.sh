#!/usr/bin/env bash
# Verify pinned hook scripts (and shell_c_option_utils) then exec python3.
# Usage: run_pinned_hook.sh <hook_script_rel> <expected_sha> -- <python-args...>
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)

verify_pinned_file() {
  local path="$1"
  local expected="$2"
  local label="$3"
  local actual
  actual=$(shasum -a 256 "$path" 2>/dev/null | awk '{print $1}') || exit 2
  if [ "$actual" != "$expected" ]; then
    echo "BLOCKED: hook helper hash mismatch; review $label and update the pinned hook hash deliberately." >&2
    exit 2
  fi
}

verify_pinned_file "$ROOT/scripts/shell_c_option_utils.py" \
  '9d4cd6eae23fae35f356630ed757e3313172edf79ca04256fb37c3607dd5606b' \
  scripts/shell_c_option_utils.py

SCRIPT_REL="$1"
EXPECTED="$2"
shift 2
if [ "${1:-}" = "--" ]; then
  shift
fi

verify_pinned_file "$ROOT/$SCRIPT_REL" "$EXPECTED" "$SCRIPT_REL"
exec python3 "$ROOT/$SCRIPT_REL" "$@"
