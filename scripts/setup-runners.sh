#!/usr/bin/env bash
# setup-runners.sh — register and start self-hosted GitHub Actions runner instances as launchd services
#
# Usage:
#   ./scripts/setup-runners.sh [source_dir]
#
#   source_dir  Directory containing the extracted runner package (default: ~/actions-runner-src).
#               Download and extract the package from:
#               GitHub → Settings → Actions → Runners → New self-hosted runner
#
# Each runner is installed in ~/actions-runner-N and registered as mac-runner-N.
# Re-running the script removes existing local registrations, replaces GitHub-side
# runners with matching names (--replace), and reinstalls the service.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/runner-lib.sh
. "$SCRIPT_DIR/runner-lib.sh"

REPO_URL="https://github.com/hubertgajewski/orwellstat"
SRC="${1:-$HOME/actions-runner-src}"

if [ ! -f "$SRC/config.sh" ]; then
  echo "error: runner package not found at $SRC" >&2
  echo "Download and extract it there first, then re-run this script." >&2
  exit 1
fi

echo "Fetching registration token..."
set_runner_token_result "registration-token" "a runner registration"
TOKEN="$RUNNER_TOKEN_RESULT"

for i in $(seq 1 "$WORKERS"); do
  DIR="$HOME/actions-runner-$i"
  NAME="mac-runner-$i"

  echo ""
  echo "=== $NAME ==="

  if [ ! -d "$DIR" ]; then
    echo "Copying runner package to $DIR..."
    cp -r "$SRC/." "$DIR/"
  fi

  cd "$DIR"

  stop_runner_service
  remove_configured_runner_strict "$DIR"

  echo "Configuring..."
  ./config.sh \
    --url "$REPO_URL" \
    --token "$TOKEN" \
    --name "$NAME" \
    --unattended \
    --replace

  echo "Installing and starting launchd service..."
  ./svc.sh install
  ./svc.sh start

  echo "$NAME running"
done

echo ""
echo "All $WORKERS runners started."
echo "Verify at: https://github.com/hubertgajewski/orwellstat/settings/actions/runners"
