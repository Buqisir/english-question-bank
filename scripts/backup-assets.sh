#!/usr/bin/env bash
# Back up app/public/paper-assets/ (raw source DOCX + parsed analyses) to an
# off-repo, timestamped folder. The versions/ dirs holding the raw DOCX are
# gitignored, so this copy is their only safety net. See docs/adr/0008
# (primary source data is import-gated and permanent) and docs/adr/0005
# (versioned file protocol).
#
# Usage:
#   scripts/backup-assets.sh                 # -> iCloud Drive (default)
#   scripts/backup-assets.sh /Volumes/Claude # -> a specific destination root
#   EQB_BACKUP_DIR=/path scripts/backup-assets.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT_DIR/app/public/paper-assets"

# Destination root precedence: positional arg, then env var, then iCloud Drive.
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs/eqb-backups"
DEST_ROOT="${1:-${EQB_BACKUP_DIR:-$ICLOUD}}"

if [[ ! -d "$SRC" ]]; then
  echo "Nothing to back up: $SRC does not exist" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M)"
DEST="$DEST_ROOT/paper-assets-$STAMP"
mkdir -p "$DEST"
cp -R "$SRC/." "$DEST/"

# Verify the copy landed: count raw DOCX and compare total size.
docx_count="$(find "$DEST" -iname '*.docx' | wc -l | tr -d ' ')"
src_size="$(du -sh "$SRC" | cut -f1)"
dest_size="$(du -sh "$DEST" | cut -f1)"

echo "Backed up: $SRC"
echo "       to: $DEST"
echo "Raw .docx files copied: $docx_count"
echo "Size: source $src_size -> backup $dest_size"
