#!/bin/sh
set -eu

# Install the independent EQB Ops MCP. Does not edit Caddy, eqb.service,
# shared tunnels, databases, or website files.

HOST_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# shellcheck disable=SC1091
. "$HOST_DIR/host-checks.sh"

CHECK_ONLY=0
if [ "${EQB_OPS_MCP_INSTALL_CHECK_ONLY:-}" = 1 ]; then
  CHECK_ONLY=1
fi

if [ "$CHECK_ONLY" -eq 0 ] && [ "$(id -u)" -ne 0 ]; then
  echo "install-eqb-ops-mcp.sh must run as root" >&2
  exit 1
fi

REPO_OPS_MCP=${1:-}
if [ -z "$REPO_OPS_MCP" ]; then
  echo "usage: install-eqb-ops-mcp.sh /path/to/repo/ops-mcp" >&2
  exit 1
fi

APP=/opt/eqb-ops/app
ENV_FILE=/etc/eqb-ops-mcp.env
STATE=/var/lib/eqb-ops
CONF_DIR=/etc/eqb-ops-mcp
PORT=${EQB_OPS_MCP_PORT:-8790}

require_cloudflared

for dest in \
  "$APP" \
  "$ENV_FILE" \
  "$STATE" \
  "$CONF_DIR" \
  /etc/systemd/system/eqb-ops-mcp.service \
  /etc/systemd/system/eqb-ops-mcp-log-export.service \
  /etc/systemd/system/eqb-ops-mcp-log-export.timer \
  /etc/systemd/system/cloudflared-eqb-ops.service
do
  assert_install_destination "$dest"
done

if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "install checks passed"
  exit 0
fi

if ss -lnt | grep -qE "0\\.0\\.0\\.0:${PORT}\\s"; then
  echo "port ${PORT} is already bound on 0.0.0.0; refusing to install" >&2
  exit 1
fi

if ss -lnt | grep -qE "127\\.0\\.0\\.1:${PORT}\\s"; then
  if ! systemctl is-active --quiet eqb-ops-mcp; then
    echo "port ${PORT} is in use on 127.0.0.1 by something other than eqb-ops-mcp" >&2
    exit 1
  fi
fi

/usr/sbin/groupadd --system eqb-ops 2>/dev/null || true
/usr/sbin/useradd --system --home /opt/eqb-ops --shell /usr/sbin/nologin --gid eqb-ops eqb-ops 2>/dev/null || true
/usr/sbin/groupadd --system cloudflared 2>/dev/null || true
/usr/sbin/useradd --system --home /var/lib/cloudflared --shell /usr/sbin/nologin --gid cloudflared cloudflared 2>/dev/null || true

/usr/bin/install -d -o root -g eqb-ops -m 0750 /opt/eqb-ops
/usr/bin/install -d -o root -g eqb-ops -m 0750 "$STATE"
/usr/bin/install -d -o root -g cloudflared -m 0750 "$CONF_DIR"

/usr/bin/rm -rf "$APP"
/usr/bin/mkdir -p "$APP"
/usr/bin/cp -a "$REPO_OPS_MCP/." "$APP/"
/usr/bin/rm -rf "$APP/node_modules"
cd "$APP"
/usr/bin/npm ci --omit=dev
/usr/bin/chown -R root:eqb-ops "$APP"
/usr/bin/find "$APP" -type d -exec chmod 0750 {} \;
/usr/bin/find "$APP" -type f -exec chmod 0640 {} \;
if [ -d "$APP/node_modules/.bin" ]; then
  /usr/bin/find "$APP/node_modules/.bin" -type f -exec chmod 0750 {} \;
fi
/bin/chmod 0750 "$APP/host/"*.sh

if [ ! -f "$ENV_FILE" ]; then
  /usr/bin/install -o root -g eqb-ops -m 0640 "$APP/env.example" "$ENV_FILE"
  echo "wrote $ENV_FILE from env.example; fill TEAM_DOMAIN and AUD before starting" >&2
fi

if [ -f "$CONF_DIR/tunnel.token" ]; then
  /bin/chown root:cloudflared "$CONF_DIR/tunnel.token"
  /bin/chmod 0640 "$CONF_DIR/tunnel.token"
fi

/usr/bin/install -o root -g root -m 0644 "$APP/host/eqb-ops-mcp.service" /etc/systemd/system/eqb-ops-mcp.service
/usr/bin/install -o root -g root -m 0644 "$APP/host/eqb-ops-mcp-log-export.service" /etc/systemd/system/eqb-ops-mcp-log-export.service
/usr/bin/install -o root -g root -m 0644 "$APP/host/eqb-ops-mcp-log-export.timer" /etc/systemd/system/eqb-ops-mcp-log-export.timer
/usr/bin/install -o root -g root -m 0644 "$APP/host/cloudflared-eqb-ops.service" /etc/systemd/system/cloudflared-eqb-ops.service

/bin/systemctl daemon-reload
/bin/systemctl enable --now eqb-ops-mcp-log-export.timer

if grep -q 'REPLACE_' "$ENV_FILE"; then
  echo "auth env is incomplete; eqb-ops-mcp was NOT started" >&2
  exit 2
fi

/bin/systemctl enable --now eqb-ops-mcp
/bin/systemctl --no-pager --full status eqb-ops-mcp
echo "installed eqb-ops-mcp on 127.0.0.1:${PORT}"
