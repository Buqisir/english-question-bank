#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${QUESTION_BANK_API_PORT:-8787}"
# Probe an auth-whitelisted route: /api/paper-sets returns 401 once login
# is enforced (users exist), which would make this health wait time out.
API_URL="http://127.0.0.1:${API_PORT}/api/health"

sh "$ROOT_DIR/scripts/init-db.sh"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Load secrets (e.g. DEEPSEEK_API_KEY) from a gitignored .env if present —
# keeps keys server-side only (never in the frontend bundle or git).
node --env-file-if-exists="$ROOT_DIR/.env" "$ROOT_DIR/server/api.mjs" &
API_PID="$!"

echo "Waiting for API at ${API_URL}..."
deadline=$((SECONDS + 30))
until curl -fsS "$API_URL" >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "Timed out waiting for API at ${API_URL}" >&2
    exit 1
  fi
  sleep 0.2
done

cd "$ROOT_DIR/app"
pnpm dev:vite --host 127.0.0.1 --port "${PORT:-5173}" --strictPort
