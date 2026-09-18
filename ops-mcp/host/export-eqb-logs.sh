#!/bin/sh
set -eu

# Fixed exporter. Callers cannot pass a unit, path, or command.
# Same-directory temp + atomic mv so MCP never reads a half-written file.
DIR=${EQB_OPS_LOG_DIR:-/var/lib/eqb-ops}
OUT=${EQB_OPS_LOG_OUT:-$DIR/eqb.log}
TMP=$DIR/eqb.log.tmp
RAW=$DIR/eqb.log.raw
JOURNALCTL=${EQB_OPS_JOURNALCTL:-/usr/bin/journalctl}
MAX_BYTES=8388608
CHOWN=${EQB_OPS_LOG_CHOWN:-root:eqb-ops}

/usr/bin/install -d -m 0750 "$DIR"

if ! "$JOURNALCTL" -u eqb.service --since "48 hours ago" -o short-iso --no-pager >"$RAW"
then
  /bin/rm -f "$RAW" "$TMP"
  echo "eqb journal export failed" >&2
  exit 1
fi

/usr/bin/tail -c "$MAX_BYTES" "$RAW" >"$TMP"
/bin/rm -f "$RAW"
if [ "$(id -u)" -eq 0 ]; then
  /bin/chown "$CHOWN" "$TMP"
fi
/bin/chmod 640 "$TMP"
/bin/mv -f "$TMP" "$OUT"
