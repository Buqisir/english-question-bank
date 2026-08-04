#!/usr/bin/env bash
set -euo pipefail

# Redeploy the english-question-bank server on the production host:
# pull latest code, install/build, restart the systemd unit, and smoke-check
# the API health endpoint. Safe to re-run (idempotent) — each step either
# no-ops on an already-up-to-date state or reproduces the same end result.
#
# Run this on the server as the `eqb` user. The browser cache belongs to that
# user and the systemd service runs as the same user. See
# docs/cuts/launch-deploy/runbook.md for first-time provisioning; this script
# assumes the repo is already cloned and `eqb.service` is already installed.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${QUESTION_BANK_API_PORT:-8787}"
API_URL="http://127.0.0.1:${API_PORT}/api/health"

if [[ "$(id -un)" != "eqb" ]]; then
  echo "Run scripts/deploy.sh as the eqb user so Chromium is installed for the service account." >&2
  exit 1
fi

echo "==> Pulling latest code in ${ROOT_DIR}"
git -C "$ROOT_DIR" pull --ff-only

echo "==> Installing app dependencies (pnpm, frozen lockfile)"
corepack enable
pnpm -C "$ROOT_DIR/app" install --frozen-lockfile

echo "==> Installing server dependencies (npm ci)"
npm --prefix "$ROOT_DIR/server" ci

echo "==> Installing the Playwright-matched full Chromium"
pnpm -C "$ROOT_DIR/app" exec playwright install --no-shell chromium

echo "==> Smoke-checking the production Chromium + PDF path"
node "$ROOT_DIR/scripts/smoke-production-chromium.mjs"

echo "==> Building app"
pnpm -C "$ROOT_DIR/app" build

echo "==> Restarting eqb service"
sudo systemctl restart eqb

echo "==> Waiting for API at ${API_URL}..."
deadline=$((SECONDS + 30))
until curl -fsS "$API_URL" >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "Timed out waiting for API at ${API_URL} after restart" >&2
    exit 1
  fi
  sleep 0.2
done

echo "==> Deploy complete, API healthy at ${API_URL}"
