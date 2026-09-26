#!/usr/bin/env bash
# Table Quest 5 gate (docs/v5/GOAL_LOOP.md §3): builds must succeed before any
# test runs, so a stale dist/ can never pass for the current source.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build >/tmp/tq-gate-build.log 2>&1 || { tail -30 /tmp/tq-gate-build.log; echo "GATE: build failed"; exit 1; }
npm run build:arena >/tmp/tq-gate-arena.log 2>&1 || { tail -30 /tmp/tq-gate-arena.log; echo "GATE: arena build failed"; exit 1; }
for step in test:arena test:arena:bots test:arena:refinement test:scoreboard test:leaderboard-client test:audio-health check:classic validate:levels smoke:arena:eight; do
  npm run -s "$step" 2>&1 | grep -E 'PASS|OK|FAIL|Error' | grep -v '^OK   L' || true
  test "${PIPESTATUS[0]}" -eq 0 || { echo "GATE: $step failed"; exit 1; }
done
echo "GATE: PASS"
