#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAPER_ID="${1:?Usage: serve-nck1-candidate-consumer-qa.sh <paperId>}"
APP_PORT="${PORT:-5173}"
API_PORT="${QUESTION_BANK_API_PORT:-4318}"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

PORT="$API_PORT" node \
  "$ROOT_DIR/scripts/import-pipeline/nck1-candidate-preview-server.mjs" \
  "$PAPER_ID" &
API_PID="$!"

deadline=$((SECONDS + 60))
until curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    wait "$API_PID"
  fi
  if (( SECONDS >= deadline )); then
    echo "Timed out waiting for Candidate preview API" >&2
    exit 1
  fi
  sleep 0.2
done

cd "$ROOT_DIR/app"
QUESTION_BANK_API_PORT="$API_PORT" pnpm dev:vite \
  --host 0.0.0.0 \
  --port "$APP_PORT" \
  --strictPort
