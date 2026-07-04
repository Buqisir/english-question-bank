#!/usr/bin/env bash
# Daily off-site backup to Cloudflare R2 (S3-compatible, via rclone).
#
# Scope (plan.md PM #6): BOTH sqlite dbs (question-bank.sqlite +
# user-data.sqlite) + app/public/paper-assets/ (incl. versions/) +
# data/user-space/files/. A backup is a read-only off-site snapshot, so
# user-data.sqlite IS in scope here — this is the opposite of the
# pull-run-push (Slice 4) rule that never touches user-data.
#
# SQLite dbs are never `cp`'d live: each is snapshotted online via
# `sqlite3 "$src" ".backup '$snap'"`, then gated on
# `PRAGMA integrity_check` == 'ok' before anything is pushed. A corrupt
# snapshot aborts the whole run rather than getting pushed.
#
# Push uses rclone `copy` (never `sync`, SW-1): copy only adds objects at
# the destination, so a local mis-delete (or a bad prune) can never
# propagate to the off-site copy, which is the last line of defense.
# Retention/pruning of old dated prefixes is a separate, explicitly-guarded
# step — never `sync`, never an unguarded `rm -rf`.
#
# Usage:
#   scripts/backup-to-r2.sh              # real run: snapshot + push + prune
#   scripts/backup-to-r2.sh --dry-run    # snapshot + integrity_check + print
#                                         # manifest only; passes --dry-run to
#                                         # rclone if installed; if rclone is
#                                         # absent, prints the plan and exits 0
#
# Env overrides (mirror server/api.mjs defaults so this can be pointed at a
# throwaway fixture without touching real data/):
#   QUESTION_BANK_DB              default: data/question-bank.sqlite
#   USER_DATA_DB                  default: data/user-data.sqlite
#   QUESTION_BANK_PAPER_ASSET_ROOT default: app/public/paper-assets
#   QUESTION_BANK_USER_SPACE_ROOT  default: data/user-space/files
#   EQB_R2_REMOTE                 default: r2:eqb-backup (rclone remote:bucket)
#   EQB_SNAPSHOT_DIR               if set, snapshots are written there and NOT
#                                  cleaned up (lets a caller/verifier inspect
#                                  them); otherwise a mktemp -d dir is used and
#                                  cleaned up via trap.
#   EQB_BACKUP_RETENTION_COUNT     default: 14 (dated prefixes to keep)
#
# rclone reads R2 credentials from rclone.conf (gitignored) — never embed
# creds in this script or pass them as literal flags.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--dry-run]" >&2
      exit 1
      ;;
  esac
done

QUESTION_BANK_DB="${QUESTION_BANK_DB:-$ROOT_DIR/data/question-bank.sqlite}"
USER_DATA_DB="${USER_DATA_DB:-$ROOT_DIR/data/user-data.sqlite}"
PAPER_ASSET_ROOT="${QUESTION_BANK_PAPER_ASSET_ROOT:-$ROOT_DIR/app/public/paper-assets}"
USER_SPACE_ROOT="${QUESTION_BANK_USER_SPACE_ROOT:-$ROOT_DIR/data/user-space/files}"
R2_REMOTE="${EQB_R2_REMOTE:-r2:eqb-backup}"
RETENTION_COUNT="${EQB_BACKUP_RETENTION_COUNT:-14}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REMOTE_PREFIX="$R2_REMOTE/$STAMP"

# ── Snapshot dir (VA6 seam) ──────────────────────────────────────────────
CLEANUP_SNAPSHOT_DIR=1
if [[ -n "${EQB_SNAPSHOT_DIR:-}" ]]; then
  SNAPSHOT_DIR="$EQB_SNAPSHOT_DIR"
  mkdir -p "$SNAPSHOT_DIR"
  CLEANUP_SNAPSHOT_DIR=0
else
  SNAPSHOT_DIR="$(mktemp -d)"
fi

cleanup() {
  if [[ "$CLEANUP_SNAPSHOT_DIR" -eq 1 ]]; then
    rm -rf "$SNAPSHOT_DIR"
  fi
}
trap cleanup EXIT

echo "==> Snapshot dir: $SNAPSHOT_DIR"

# ── SQLite online snapshots + integrity gate ─────────────────────────────
snapshot_db() {
  local src="$1"
  local name="$2"
  local snap="$SNAPSHOT_DIR/$name"

  if [[ ! -f "$src" ]]; then
    echo "Source db not found, skipping: $src" >&2
    return 1
  fi

  echo "==> Snapshotting $src -> $snap"
  sqlite3 "$src" ".backup '$snap'"

  local check
  check="$(sqlite3 "$snap" "PRAGMA integrity_check")"
  if [[ "$check" != "ok" ]]; then
    echo "FATAL: integrity_check failed for snapshot of $src (got: $check)" >&2
    exit 1
  fi
  echo "    integrity_check: ok"
}

snapshot_db "$QUESTION_BANK_DB" "question-bank.sqlite"
snapshot_db "$USER_DATA_DB" "user-data.sqlite"

# ── Manifest of what would be pushed ─────────────────────────────────────
echo ""
echo "==> Backup manifest (-> $REMOTE_PREFIX):"
echo "    $SNAPSHOT_DIR/question-bank.sqlite"
echo "    $SNAPSHOT_DIR/user-data.sqlite"
[[ -d "$PAPER_ASSET_ROOT" ]] && echo "    $PAPER_ASSET_ROOT/ (paper-assets, incl. versions/)"
[[ -d "$USER_SPACE_ROOT" ]] && echo "    $USER_SPACE_ROOT/ (user-space files)"

HAVE_RCLONE=1
if ! command -v rclone >/dev/null 2>&1; then
  HAVE_RCLONE=0
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo ""
  if [[ "$HAVE_RCLONE" -eq 0 ]]; then
    echo "NOTE: rclone is not installed on this machine — real push is unavailable."
    echo "Plan (would run when rclone is present):"
    echo "  rclone copy \"$SNAPSHOT_DIR/question-bank.sqlite\" \"$REMOTE_PREFIX/\""
    echo "  rclone copy \"$SNAPSHOT_DIR/user-data.sqlite\" \"$REMOTE_PREFIX/\""
    [[ -d "$PAPER_ASSET_ROOT" ]] && echo "  rclone copy \"$PAPER_ASSET_ROOT\" \"$REMOTE_PREFIX/paper-assets\""
    [[ -d "$USER_SPACE_ROOT" ]] && echo "  rclone copy \"$USER_SPACE_ROOT\" \"$REMOTE_PREFIX/user-space\""
    echo "==> Dry run complete (no rclone binary present, no push attempted)."
    exit 0
  fi

  echo "==> Dry run: invoking rclone copy --dry-run"
  rclone copy "$SNAPSHOT_DIR/question-bank.sqlite" "$REMOTE_PREFIX/" --dry-run
  rclone copy "$SNAPSHOT_DIR/user-data.sqlite" "$REMOTE_PREFIX/" --dry-run
  [[ -d "$PAPER_ASSET_ROOT" ]] && rclone copy "$PAPER_ASSET_ROOT" "$REMOTE_PREFIX/paper-assets" --dry-run
  [[ -d "$USER_SPACE_ROOT" ]] && rclone copy "$USER_SPACE_ROOT" "$REMOTE_PREFIX/user-space" --dry-run
  echo "==> Dry run complete."
  exit 0
fi

# ── Real push ─────────────────────────────────────────────────────────────
if [[ "$HAVE_RCLONE" -eq 0 ]]; then
  echo "FATAL: rclone is not installed — cannot push to R2. Install rclone or run with --dry-run." >&2
  exit 1
fi

echo "==> Pushing to $REMOTE_PREFIX (rclone copy — additive only)"
rclone copy "$SNAPSHOT_DIR/question-bank.sqlite" "$REMOTE_PREFIX/"
rclone copy "$SNAPSHOT_DIR/user-data.sqlite" "$REMOTE_PREFIX/"
[[ -d "$PAPER_ASSET_ROOT" ]] && rclone copy "$PAPER_ASSET_ROOT" "$REMOTE_PREFIX/paper-assets"
[[ -d "$USER_SPACE_ROOT" ]] && rclone copy "$USER_SPACE_ROOT" "$REMOTE_PREFIX/user-space"

echo "==> Push complete. Remote size/manifest:"
rclone size "$REMOTE_PREFIX" || true
rclone lsf "$REMOTE_PREFIX" || true

# ── Prune (independent retention step, never sync) ───────────────────────
echo ""
echo "==> Pruning: keeping last $RETENTION_COUNT dated prefixes under $R2_REMOTE"
mapfile -t DATED_PREFIXES < <(rclone lsf "$R2_REMOTE" --dirs-only | sort)
TOTAL_PREFIXES="${#DATED_PREFIXES[@]}"
if (( TOTAL_PREFIXES > RETENTION_COUNT )); then
  TO_DELETE_COUNT=$(( TOTAL_PREFIXES - RETENTION_COUNT ))
  for ((i = 0; i < TO_DELETE_COUNT; i++)); do
    prefix="${DATED_PREFIXES[$i]}"
    echo "    pruning old prefix: $R2_REMOTE/$prefix"
    rclone purge "$R2_REMOTE/$prefix"
  done
else
  echo "    nothing to prune ($TOTAL_PREFIXES prefixes <= retention $RETENTION_COUNT)"
fi

echo "==> Backup complete."
