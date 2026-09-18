#!/bin/sh
# Explicit, separate opt-in: installs startup provenance, never restarts services.
set -eu
[ "$(id -u)" = 0 ] || { echo 'must run as root' >&2; exit 1; }
HOST_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
DEST=/usr/local/lib/eqb-provenance
DROPIN=/etc/systemd/system/eqb.service.d/50-running-provenance.conf
[ ! -e "$DROPIN" ] || { echo 'existing provenance drop-in: inspect before replacing' >&2; exit 1; }
[ ! -e "$DEST" ] || { echo 'existing provenance helper: inspect before replacing' >&2; exit 1; }
[ "$(systemctl show eqb -p User --value)" = eqb ]
[ "$(systemctl show eqb -p WorkingDirectory --value)" = /opt/eqb/current ]
[ -z "$(systemctl show eqb -p DropInPaths --value)" ]
[ -z "$(systemctl show eqb -p EnvironmentFiles --value)" ]
# Check only variable names; never print service environment values.
systemctl show eqb -p Environment --value | python3 -c '
import shlex,sys
names=[v.split("=",1)[0] for v in shlex.split(sys.stdin.read())]
if "NODE_OPTIONS" in names: raise SystemExit("existing NODE_OPTIONS: stop and review")
'
systemctl show eqb -p ExecStart --value | python3 -c '
import sys
x=sys.stdin.read()
expected="argv[]=/usr/bin/node --env-file-if-exists=/opt/eqb/shared/.env server/api.mjs ;"
if expected not in x: raise SystemExit("unexpected eqb ExecStart: stop and review")
'
[ "$(systemctl show eqb -p RuntimeDirectory --value)" = '' ]
[ ! -e /run/eqb-provenance ]
# Refuse redirected destinations; do not overwrite any existing configuration.
[ ! -L /usr/local/lib ]
[ ! -L /etc/systemd/system/eqb.service.d ]
install -d -o root -g root -m 0755 "$DEST" /etc/systemd/system/eqb.service.d
install -o root -g root -m 0644 "$HOST_DIR/record-running-commit.mjs" "$DEST/record-running-commit.mjs"
install -o root -g root -m 0644 "$HOST_DIR/preload-running-commit.mjs" "$DEST/preload-running-commit.mjs"
install -o root -g root -m 0644 "$HOST_DIR/eqb-provenance.conf" "$DROPIN"
systemctl daemon-reload
echo 'Provenance installed. eqb has NOT been restarted; proof appears at its next actual start.'
