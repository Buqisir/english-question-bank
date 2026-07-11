#!/usr/bin/env bash
# One-command production redeploy, wrapping the proven step-by-step flow
# (pull → install → build → restart → health). Replaces hand-typing the
# four ssh commands each deploy; deploy.sh on-server is known to trip on
# root/git ownership, so we drive每一步 via runuser -u eqb from here.
#
# Host/key are NEVER hardcoded (repo rule: real server IP stays out of
# tracked files). Provide them via gitignored .env.deploy at repo root:
#   EQB_DEPLOY_HOST=ubuntu@<SERVER_IP>
#   EQB_DEPLOY_KEY=~/.ssh/eqb_deploy   # optional, this is the default
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.deploy" ] && set -a && . "$ROOT/.env.deploy" && set +a
HOST="${EQB_DEPLOY_HOST:?set EQB_DEPLOY_HOST in .env.deploy (ubuntu@<SERVER_IP>)}"
KEY="${EQB_DEPLOY_KEY:-$HOME/.ssh/eqb_deploy}"
KEY="${KEY/#\~/$HOME}"
REPO=/opt/eqb/english-question-bank

run() { ssh -i "$KEY" -o ConnectTimeout=15 "$HOST" "$@"; }

echo "== 0/5 local main must be pushed =="
git -C "$ROOT" fetch github main --quiet
LOCAL=$(git -C "$ROOT" rev-parse main)
REMOTE=$(git -C "$ROOT" rev-parse github/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "ABORT: local main ($LOCAL) != github/main ($REMOTE). Push first." >&2
  exit 1
fi

echo "== 1/5 pull =="
run "sudo runuser -u eqb -- git -C $REPO pull --ff-only"

echo "== 2/5 install =="
run "cd $REPO && sudo runuser -u eqb -- pnpm -C app install --frozen-lockfile && sudo runuser -u eqb -- npm --prefix server ci" | tail -3

echo "== 3/5 build =="
run "cd $REPO && sudo runuser -u eqb -- pnpm -C app build" | tail -3

echo "== 4/5 restart + health =="
run "sudo systemctl restart eqb && sleep 3 && systemctl is-active eqb caddy && curl -s http://127.0.0.1:8787/api/health"

echo "== 5/5 public check (local line to HK can flap; 3 tries, non-fatal) =="
ok=""
for i in 1 2 3; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 15 https://eqbank.cc/ || true)
  echo "eqbank.cc try $i: $code"
  [ "$code" = "200" ] && ok=1 && break
  sleep 3
done
[ -n "$ok" ] || echo "WARN: public check failed from this machine — server health above is the authority; re-check network/curl manually."
echo -n "deployed commit: "
run "sudo runuser -u eqb -- git -C $REPO log --oneline -1"
