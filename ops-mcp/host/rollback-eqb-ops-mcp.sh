#!/bin/sh
set -eu

# Remove only the EQB Ops MCP hostname, Access app, independent tunnel, and
# systemd units. Never stop a shared cloudflared unit or Caddy/eqb.

if [ "$(id -u)" -ne 0 ]; then
  echo "rollback-eqb-ops-mcp.sh must run as root" >&2
  exit 1
fi

systemctl disable --now eqb-ops-mcp 2>/dev/null || true
systemctl disable --now eqb-ops-mcp-log-export.timer 2>/dev/null || true
systemctl disable --now cloudflared-eqb-ops 2>/dev/null || true
systemctl stop eqb-ops-mcp-log-export.service 2>/dev/null || true

rm -f /etc/systemd/system/eqb-ops-mcp.service
rm -f /etc/systemd/system/eqb-ops-mcp-log-export.service
rm -f /etc/systemd/system/eqb-ops-mcp-log-export.timer
rm -f /etc/systemd/system/cloudflared-eqb-ops.service
systemctl daemon-reload

# Leave /etc/eqb-ops-mcp and /opt/eqb-ops in place until DNS/Access are removed,
# then delete them explicitly.
echo "MCP units stopped. Remove DNS CNAME mcp.eqbank.cc, Access app 'EQB Ops', and tunnel eqb-ops-mcp next."
echo "Do not systemctl stop cloudflared unless that unit is cloudflared-eqb-ops."
