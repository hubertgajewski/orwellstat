#!/usr/bin/env bash
set -euo pipefail

target="${1:?usage: provision-worktree-env.sh <worktree-path>}"
target="$(cd "$target" && pwd)"

common_git="$(git -C "$target" rev-parse --path-format=absolute --git-common-dir)"
main="$(dirname "$common_git")"

if [[ "$main" == "$target" ]]; then
  echo "provision-worktree-env: target is main checkout, skipping" >&2
  exit 0
fi

link() {
  local src="$main/$1" dst="$target/$1"
  if [[ ! -e "$src" ]]; then
    echo "provision-worktree-env: WARN $src missing, skipping" >&2
    return 0
  fi
  mkdir -p "$(dirname "$dst")"
  if ln -sfn "$src" "$dst" 2>/dev/null; then
    echo "provision-worktree-env: linked $1" >&2
  else
    cp -f "$src" "$dst"
    echo "provision-worktree-env: WARN symlink failed, copied $1 instead — re-run this script if you edit $src in the main checkout (likely Windows without Developer Mode)" >&2
  fi
}

link .env
link .vars
link bruno/.env
