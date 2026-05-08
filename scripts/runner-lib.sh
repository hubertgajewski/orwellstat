#!/usr/bin/env bash
# Shared helpers for local self-hosted GitHub Actions runner scripts.

WORKERS=4
REPO_API="repos/hubertgajewski/orwellstat"
RUNNER_TOKEN_RESULT=""
REMOVE_TOKEN=""

set_runner_token_result() {
  local token_path="$1"
  local description="$2"
  local token

  token=$(gh api -X POST "$REPO_API/actions/runners/$token_path" --jq '.token')
  if [ -z "$token" ] || [ "$token" = "null" ]; then
    echo "error: GitHub did not return $description token" >&2
    exit 1
  fi

  RUNNER_TOKEN_RESULT="$token"
}

ensure_remove_token() {
  if [ -z "$REMOVE_TOKEN" ]; then
    echo "Fetching removal token..."
    set_runner_token_result "remove-token" "a runner removal"
    REMOVE_TOKEN="$RUNNER_TOKEN_RESULT"
  fi
}

stop_runner_service() {
  if [ -f svc.sh ]; then
    echo "Stopping and uninstalling launchd service..."
    ./svc.sh stop 2>/dev/null || true
    ./svc.sh uninstall 2>/dev/null || true
  else
    echo "No service wrapper found; skipping service cleanup."
  fi
}

remove_configured_runner() {
  local dir="$1"

  if [ ! -f .runner ] && [ ! -f .credentials ]; then
    echo "No local runner configuration found; nothing to deregister."
    return 0
  fi

  if [ ! -f config.sh ]; then
    echo "warning: config.sh missing in $dir; cannot remove GitHub runner registration" >&2
    return 0
  fi

  ensure_remove_token
  echo "Removing runner registration..."
  ./config.sh remove --token "$REMOVE_TOKEN"
}

remove_configured_runner_strict() {
  local dir="$1"

  if remove_configured_runner "$dir"; then
    return 0
  fi

  echo "warning: failed to remove runner registration in $dir" >&2
  return 1
}

remove_configured_runner_best_effort() {
  local dir="$1"

  if ! remove_configured_runner "$dir"; then
    echo "warning: failed to remove runner registration in $dir" >&2
  fi
}
