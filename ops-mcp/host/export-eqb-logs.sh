#!/bin/sh
set -eu

# Fixed exporter. Callers cannot pass a unit, path, or command.
OUT=/var/lib/eqb-ops/eqb.log
TMP=/var/lib/eqb-ops/eqb.log.tmp
DIR=/var/lib/eqb-ops
MAX_BYTES=8388608

/usr/bin/install -d -o root -g eqb-ops -m 0750 "$DIR"

if ! /usr/bin/journalctl -u eqb.service --since "48 hours ago" -o short-iso --no-pager >"$TMP"
then
  /bin/rm -f "$TMP"
  echo "eqb journal export failed" >&2
  exit 1
fi

/usr/bin/tail -c "$MAX_BYTES" "$TMP" >"$OUT"
/bin/rm -f "$TMP"
/bin/chown root:eqb-ops "$OUT"
/bin/chmod 640 "$OUT"
