#!/usr/bin/env bash
# remove-runners.sh - stop, unregister, and uninstall local self-hosted runner instances
#
# Usage:
#   ./scripts/remove-runners.sh
#
# Removes the 4 persistent runner services created by setup-runners.sh when their
# local runner directories exist. Missing or partially removed directories are
# reported and skipped so one broken runner does not block the rest.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/runner-lib.sh
. "$SCRIPT_DIR/runner-lib.sh"

for i in $(seq 1 "$WORKERS"); do
  DIR="$HOME/actions-runner-$i"
  NAME="mac-runner-$i"

  echo ""
  echo "=== $NAME ==="

  if [ ! -d "$DIR" ]; then
    echo "Skipping missing runner directory: $DIR"
    continue
  fi

  cd "$DIR"

  stop_runner_service
  remove_configured_runner_best_effort "$DIR"
done

echo ""
echo "Runner removal complete."
