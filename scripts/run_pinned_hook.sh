#!/usr/bin/env bash
# Verify pinned hook scripts (and shell_c_option_utils) then exec python3.
# Usage: run_pinned_hook.sh <hook_script_rel> <expected_sha> -- <python-args...>
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

UTIL="$ROOT/scripts/shell_c_option_utils.py"
EXPECTED_UTIL='9d4cd6eae23fae35f356630ed757e3313172edf79ca04256fb37c3607dd5606b'
ACTUAL_UTIL=$(shasum -a 256 "$UTIL" 2>/dev/null | awk '{print $1}') || exit 2
if [ "$ACTUAL_UTIL" != "$EXPECTED_UTIL" ]; then
  echo 'BLOCKED: hook helper dependency hash mismatch; review scripts/shell_c_option_utils.py and update the pinned hook hash deliberately.' >&2
  exit 2
fi

SCRIPT_REL="$1"
EXPECTED="$2"
shift 2
if [ "${1:-}" = "--" ]; then
  shift
fi

SCRIPT="$ROOT/$SCRIPT_REL"
ACTUAL=$(shasum -a 256 "$SCRIPT" 2>/dev/null | awk '{print $1}') || exit 2
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "BLOCKED: hook helper hash mismatch; review $SCRIPT_REL and update the pinned hook hash deliberately." >&2
  exit 2
fi

exec python3 "$SCRIPT" "$@"
