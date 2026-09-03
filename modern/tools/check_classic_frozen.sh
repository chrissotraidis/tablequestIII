#!/usr/bin/env bash
# Guard for GOAL_LOOP.md §3.2-1: the classic build is frozen on the
# modern-preview branch. Exit 1 if any classic path differs from main.
set -euo pipefail
cd "$(dirname "$0")/../.."

BASE="${1:-main}"
CLASSIC_PATHS=(index.html src dist/index.html tools vite.config.js design design.md design-qa.md LICENSE)

changed=$(git diff --stat "$BASE" -- "${CLASSIC_PATHS[@]}" | tail -n +1)
dirty=$(git status --porcelain -- "${CLASSIC_PATHS[@]}")

if [[ -n "$changed" || -n "$dirty" ]]; then
    echo "CLASSIC FROZEN CHECK: FAILED — classic files differ from $BASE:"
    [[ -n "$changed" ]] && echo "$changed"
    [[ -n "$dirty" ]] && echo "$dirty"
    exit 1
fi
echo "CLASSIC FROZEN CHECK: OK (no classic changes vs $BASE)"
