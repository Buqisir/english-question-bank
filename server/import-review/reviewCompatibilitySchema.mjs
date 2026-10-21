import { DatabaseSync } from 'node:sqlite'

export const REVIEW_COMPATIBILITY_SCHEMA_VERSION = 'review-compatibility-schema-v2'

// Compare SQLite's structural introspection AND the complete constraint token
// stream. Unknown but possibly compatible DDL needs explicit review, not guessing.
const shapeSql = `
      CREATE TABLE IF NOT EXISTS review_subject (
        revision_id TEXT PRIMARY KEY REFERENCES import_review_revisions(id),
        subject_version TEXT NOT NULL CHECK(subject_version = 'review-content-subject-v2'),
        origin TEXT NOT NULL CHECK(origin IN ('finalize','stored_evidence')),
        source_renderer_build_id TEXT NOT NULL,
        bundle_digest TEXT NOT NULL,
        identity_digest TEXT NOT NULL,
        consumer_digest TEXT NOT NULL,
        sidecar_digest TEXT NOT NULL,
        media_digest TEXT NOT NULL,
        products_digest TEXT NOT NULL,
        inventory_digest TEXT NOT NULL,
        subject_digest TEXT NOT NULL,
        subject_json TEXT NOT NULL,
        provenance_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_compatibility (
        revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
        target_build_id TEXT NOT NULL,
        comparator_version TEXT NOT NULL,
        attempt_no INTEGER NOT NULL CHECK(attempt_no > 0),
        subject_digest TEXT,
        bundle_digest TEXT NOT NULL,
        result TEXT NOT NULL CHECK(result IN ('equal','different','unknown')),
        reason_code TEXT NOT NULL,
        evidence_digest TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        PRIMARY KEY(revision_id, target_build_id, comparator_version, attempt_no),
        CHECK(result <> 'equal' OR subject_digest IS NOT NULL)
      );
      CREATE INDEX IF NOT EXISTS idx_review_compatibility_lookup
        ON review_compatibility(revision_id, target_build_id, comparator_version, attempt_no DESC);
      CREATE TABLE IF NOT EXISTS review_subject_backfill_attempt (
        id INTEGER PRIMARY KEY,
        revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
        input_token TEXT NOT NULL,
        reason_code TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        diagnostic_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_review_subject_backfill_attempt
        ON review_subject_backfill_attempt(revision_id,input_token,id);
      CREATE TABLE IF NOT EXISTS review_subject_backfill (
        id INTEGER PRIMARY KEY,
        revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
        input_token TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('inserted','skipped')),
        reason_code TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        diagnostic_json TEXT,
        UNIQUE(revision_id, input_token)
      );

CREATE TABLE IF NOT EXISTS review_compatibility_schema_migration (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  from_schema_version TEXT NOT NULL CHECK(from_schema_version = 'review-compatibility-schema-v1'),
  migrated_at TEXT NOT NULL,
  legacy_row_count INTEGER NOT NULL CHECK(legacy_row_count >= 0)
);
`
const legacyName = 'review_subject_legacy_v1'
const tables = ['review_subject', 'review_compatibility', 'review_subject_backfill',
  'review_subject_backfill_attempt', 'review_compatibility_schema_migration']
const indexes = ['idx_review_compatibility_lookup', 'idx_review_subject_backfill_attempt']
const quoted = name => `"${name.replaceAll('"', '""')}"`
// SQLite resolves object names case-insensitively; preflight must do the same.
const object = (db, name) => db.prepare('SELECT type, tbl_name, sql FROM sqlite_master WHERE name=? COLLATE NOCASE').get(name)
const fail = (code, name) => { throw Object.assign(new Error(`${code}: ${name}`), { code, schemaObject: name }) }
// Preserve string literals, remove comments/formatting, normalize identifiers.
// Full tokens also reject unknown CHECKs, collations, conflict/default clauses,
// WITHOUT ROWID, STRICT and extra constraints that PRAGMAs alone cannot show.
function tokens(sql) {
  return (sql.match(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z_0-9]*|\d+|<>|!=|>=|<=|[^\s]/g) || [])
    // Tokenize strings first: a literal '--' must not hide a later table reference.
    .filter(token => !token.startsWith('--') && !token.startsWith('/*'))
    .map(token => token.startsWith("'") ? token : token.replace(/^["`\[]|["`\]]$/g, '').toLowerCase())
    .filter(token => token !== ';')
}
function normalizedSql(sql, name) {
  const value = tokens(sql).join(' ').replace(' if not exists ', ' ')
  return name === legacyName ? value.replace(legacyName, 'review_subject') : value
}
// SQLite folds ASCII identifiers only. Do not normalize literals, defaults,
// types, collations or any other structural/constraint values from PRAGMAs.
const identifier = value => typeof value === 'string'
  ? value.replace(/[A-Z]/g, letter => letter.toLowerCase()) : value
const identifiers = (row, keys) => Object.fromEntries(Object.entries(row)
  .map(([key, value]) => [key, keys.includes(key) ? identifier(value) : value]))
function signature(db, name) {
  const row = object(db, name)
  if (!row || row.type !== 'table') return null
  return {
    sql: normalizedSql(row.sql, name),
    columns: db.prepare(`PRAGMA table_xinfo(${quoted(name)})`).all()
      .map(row => identifiers(row, ['name'])),
    foreignKeys: db.prepare(`PRAGMA foreign_key_list(${quoted(name)})`).all()
      .map(row => identifiers(row, ['table', 'from', 'to'])),
    indexes: db.prepare(`PRAGMA index_list(${quoted(name)})`).all().map(index => ({
      // Autoindex names change when renaming, their actual columns must not.
      name: index.origin === 'c' ? identifier(index.name) : index.origin,
      unique: index.unique, origin: index.origin, partial: index.partial,
      columns: db.prepare(`PRAGMA index_xinfo(${quoted(index.name)})`).all()
        .map(row => identifiers(row, ['name'])),
    })).sort((a, b) => a.name.localeCompare(b.name)),
  }
}
const expected = new DatabaseSync(':memory:')
expected.exec(shapeSql)
const v2 = Object.fromEntries(tables.map(name => [name, signature(expected, name)]))
expected.exec('DROP TABLE review_subject')
expected.exec(shapeSql.replaceAll('review-content-subject-v2', 'review-content-subject-v1'))
const v1 = signature(expected, 'review_subject')
expected.exec('DROP TABLE review_subject_backfill')
expected.exec(shapeSql.replace('        diagnostic_json TEXT,\n        UNIQUE', '        UNIQUE'))
const backfillV1 = signature(expected, 'review_subject_backfill')
// ALTER appends diagnostic_json after the table's UNIQUE in sqlite_master.
expected.exec('ALTER TABLE review_subject_backfill ADD COLUMN diagnostic_json TEXT')
const backfillAltered = signature(expected, 'review_subject_backfill')
const expectedIndexes = Object.fromEntries(indexes.map(name => [name, object(expected, name)]))
expected.close()
const equalShape = (left, right) => JSON.stringify(left) === JSON.stringify(right)

function subjectShape(db) {
  if (!object(db, 'review_subject')) return 'missing'
  const actual = signature(db, 'review_subject')
  if (equalShape(actual, v2.review_subject)) return 'v2'
  if (equalShape(actual, v1)) return 'v1'
  fail('REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN', 'review_subject')
}

export function reviewCompatibilityShapeAvailable(db) {
  return subjectShape(db) === 'v2'
}

function validateDependencies(db) {
  const protectedNames = [...tables, legacyName]
  for (const row of db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL").all()) {
    const name = row.name.toLowerCase()
    const tableName = row.tbl_name.toLowerCase()
    if (row.type === 'table') {
      for (const fk of db.prepare(`PRAGMA foreign_key_list(${quoted(row.name)})`).all()) {
        if (protectedNames.includes(fk.table.toLowerCase())) fail('REVIEW_COMPATIBILITY_SCHEMA_DEPENDENCY', row.name)
      }
    }
    // SQLite also accepts single-quoted table identifiers in FROM clauses.
    // Conservatively reject even a matching literal in an unknown dependency.
    if (['view', 'trigger'].includes(row.type) && (protectedNames.includes(tableName)
      || tokens(row.sql).some(token => protectedNames.includes(token.replace(/^'|'$/g, '').toLowerCase())))) {
      fail('REVIEW_COMPATIBILITY_SCHEMA_DEPENDENCY', row.name)
    }
    if (row.type === 'index' && (protectedNames.includes(tableName) || indexes.includes(name))) {
      const reference = expectedIndexes[name]
      if (!reference || reference.tbl_name !== tableName
        || normalizedSql(reference.sql) !== normalizedSql(row.sql)) {
        fail('REVIEW_COMPATIBILITY_SCHEMA_INDEX_CONFLICT', row.name)
      }
    }
    if (indexes.includes(name) && row.type !== 'index') fail('REVIEW_COMPATIBILITY_SCHEMA_INDEX_CONFLICT', row.name)
  }
}
function preflight(db) {
  // No DDL (including rename) before all existing objects have passed.
  validateDependencies(db)
  const subject = subjectShape(db)
  if (subject === 'v1' && object(db, legacyName)) fail('REVIEW_COMPATIBILITY_LEGACY_CONFLICT', legacyName)
  if (object(db, legacyName) && !equalShape(signature(db, legacyName), v1)) {
    fail('REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN', legacyName)
  }
  let upgradeBackfill = false
  for (const name of tables.filter(name => name !== 'review_subject')) {
    if (!object(db, name)) continue
    const actual = signature(db, name)
    if (equalShape(actual, v2[name])) continue
    if (name === 'review_subject_backfill') {
      if (equalShape(actual, backfillAltered)) continue
      if (equalShape(actual, backfillV1)) { upgradeBackfill = true; continue }
    }
    fail('REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN', name)
  }
  // A detached archive cannot be silently adopted without its provenance.
  if (object(db, legacyName)) {
    if (!object(db, 'review_compatibility_schema_migration')
      || !db.prepare('SELECT 1 FROM review_compatibility_schema_migration WHERE id=1').get()) {
      fail('REVIEW_COMPATIBILITY_MIGRATION_RECORD_MISSING', legacyName)
    }
  }
  return { subject, upgradeBackfill }
}

// Function-level atomicity even when an outer caller catches the error and
// commits its own transaction. Never disable FKs, change user_version, or rewrite
// legacy business/compatibility rows. IMMEDIATE serializes independent starts.
export function ensureReviewCompatibilityShape(db) {
  const ownTransaction = !db.isTransaction
  if (ownTransaction) db.exec('BEGIN IMMEDIATE')
  let savepoint = false
  try {
    db.exec('SAVEPOINT review_compatibility_shape')
    savepoint = true
    const { subject, upgradeBackfill } = preflight(db)
    let legacyRowCount
    if (subject === 'v1') {
      legacyRowCount = db.prepare('SELECT COUNT(*) n FROM review_subject').get().n
      db.exec(`ALTER TABLE review_subject RENAME TO ${legacyName}`)
    }
    db.exec(shapeSql)
    if (upgradeBackfill) db.exec('ALTER TABLE review_subject_backfill ADD COLUMN diagnostic_json TEXT')
    if (subject === 'v1') {
      db.prepare(`INSERT INTO review_compatibility_schema_migration
        (id,from_schema_version,migrated_at,legacy_row_count) VALUES (1,?,?,?)`)
        .run('review-compatibility-schema-v1', new Date().toISOString(), legacyRowCount)
    }
    db.exec('RELEASE SAVEPOINT review_compatibility_shape')
    savepoint = false
    if (ownTransaction) db.exec('COMMIT')
    return { enabled: true }
  } catch (error) {
    if (savepoint) db.exec('ROLLBACK TO SAVEPOINT review_compatibility_shape; RELEASE SAVEPOINT review_compatibility_shape')
    if (ownTransaction && db.isTransaction) db.exec('ROLLBACK')
    throw error
  }
}

// Small durable evidence exposed by the existing authenticated status endpoint;
// ensure's stdout is intentionally discarded by the deployment controller.
export function readReviewCompatibilitySchemaStatus(db) {
  const legacyPresent = Boolean(object(db, legacyName))
  const migration = object(db, 'review_compatibility_schema_migration')
    ? db.prepare(`SELECT from_schema_version AS fromSchemaVersion, migrated_at AS migratedAt,
      legacy_row_count AS legacyRowCount FROM review_compatibility_schema_migration WHERE id=1`).get() ?? null : null
  return { schemaVersion: REVIEW_COMPATIBILITY_SCHEMA_VERSION, legacyPresent, migration }
}
