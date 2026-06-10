#!/usr/bin/env bash
# dev-check: boot the dev server, wait until it answers, then typecheck + lint.
# Exits 0 only if everything passes. Reuses an already-running server on $PORT.
set -u
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"
LOG="/tmp/pp-dev-check.log"
STARTED=0
PID=""
FAIL=0

cleanup() {
  if [ "$STARTED" -eq 1 ] && [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null
    wait "$PID" 2>/dev/null
  fi
}
trap cleanup EXIT

# --- dev server ---------------------------------------------------------
if curl -sf -o /dev/null "$URL"; then
  echo "→ dev server already running at $URL (reusing it)"
else
  echo "→ starting dev server at $URL (log: $LOG)"
  npm run dev >"$LOG" 2>&1 &
  PID=$!
  STARTED=1
  ready=0
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "$URL"; then ready=1; break; fi
    if ! kill -0 "$PID" 2>/dev/null; then
      echo "✗ FAIL: dev server exited early — tail of $LOG:"
      tail -5 "$LOG"
      exit 1
    fi
    sleep 1
  done
  if [ "$ready" -ne 1 ]; then
    echo "✗ FAIL: dev server not ready after 60s — tail of $LOG:"
    tail -5 "$LOG"
    exit 1
  fi
fi
echo "✓ PASS: dev server responds"

# --- typecheck ----------------------------------------------------------
echo "→ typecheck (tsc --noEmit)"
if npx tsc --noEmit; then
  echo "✓ PASS: typecheck"
else
  echo "✗ FAIL: typecheck"
  FAIL=1
fi

# --- lint ---------------------------------------------------------------
if grep -q '"lint"' package.json; then
  echo "→ lint (npm run lint)"
  if npm run lint; then
    echo "✓ PASS: lint"
  else
    echo "✗ FAIL: lint"
    FAIL=1
  fi
else
  echo "– lint: skipped (no lint script configured yet)"
fi

# --- verdict ------------------------------------------------------------
if [ "$FAIL" -eq 0 ]; then
  echo "ALL CHECKS PASSED"
else
  echo "CHECKS FAILED"
fi
exit "$FAIL"
