#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${1:-"$ROOT_DIR/data/question-bank.sqlite"}"

mkdir -p "$(dirname "$DB_PATH")"

if [[ -f "$DB_PATH" ]] && sqlite3 "$DB_PATH" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='question_groups' LIMIT 1;" >/dev/null 2>&1; then
  echo "Database already initialized at $DB_PATH"
  exit 0
fi

sqlite3 "$DB_PATH" < "$ROOT_DIR/data/sql/schema.sql"

IMPORT_COLUMNS="$(sqlite3 "$DB_PATH" "PRAGMA table_info(import_files);")"
if ! grep -q "|content_role|" <<<"$IMPORT_COLUMNS"; then
  sqlite3 "$DB_PATH" "ALTER TABLE import_files ADD COLUMN content_role TEXT NOT NULL DEFAULT 'question';"
fi
if ! grep -q "|bundle_id|" <<<"$IMPORT_COLUMNS"; then
  sqlite3 "$DB_PATH" "ALTER TABLE import_files ADD COLUMN bundle_id TEXT NOT NULL DEFAULT '';"
fi
if ! grep -q "|bundle_title|" <<<"$IMPORT_COLUMNS"; then
  sqlite3 "$DB_PATH" "ALTER TABLE import_files ADD COLUMN bundle_title TEXT NOT NULL DEFAULT '';"
fi

sqlite3 "$DB_PATH" < "$ROOT_DIR/data/sql/seed-v0.sql"

echo "Initialized $DB_PATH"
sqlite3 "$DB_PATH" "SELECT COUNT(*) || ' sources, ' || (SELECT COUNT(*) FROM passages) || ' passages, ' || (SELECT COUNT(*) FROM question_groups) || ' question groups' FROM sources;"
