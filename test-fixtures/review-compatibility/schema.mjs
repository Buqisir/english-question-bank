import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { reviewCompatibilityV1Sql, installV1Subject } from './schema-v1.mjs'
import { ensureReviewCompatibilityShape, readReviewCompatibilitySchemaStatus } from '../../server/import-review/reviewCompatibilitySchema.mjs'

const schema = db => db.prepare('SELECT * FROM sqlite_master ORDER BY name').all()
const integrity = db => {
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 73)
}
function database(file = ':memory:') {
  const db = new DatabaseSync(file)
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA user_version=73;
    CREATE TABLE import_review_revisions(id TEXT PRIMARY KEY);
    INSERT INTO import_review_revisions VALUES('old-revision');`)
  return db
}

export async function verifyReviewCompatibilitySchema(root, pass) {
  for (const state of ['missing', 'empty-v1', 'nonempty-v1']) {
    const db = database()
    try {
      if (state !== 'missing') {
        db.exec(reviewCompatibilityV1Sql)
        if (state === 'nonempty-v1') installV1Subject(db, 'old-revision')
        db.exec(`INSERT INTO review_subject_backfill VALUES(
          1,'old-revision','old-token','skipped','MISSING_BASELINE','2026-10-20')`)
      }
      const original = state === 'missing' ? [] : db.prepare('SELECT * FROM review_subject').all()
      integrity(db)
      ensureReviewCompatibilityShape(db)
      assert.equal(db.prepare('SELECT COUNT(*) n FROM review_subject').get().n, 0)
      const status = readReviewCompatibilitySchemaStatus(db)
      assert.equal(status.legacyPresent, state !== 'missing')
      if (state !== 'missing') {
        assert.deepEqual(db.prepare('SELECT * FROM review_subject_legacy_v1').all(), original)
        assert.equal(status.migration.legacyRowCount, original.length)
        assert.equal(status.migration.fromSchemaVersion, 'review-compatibility-schema-v1')
        assert.ok(Number.isFinite(Date.parse(status.migration.migratedAt)))
        assert.equal(db.prepare('SELECT input_token FROM review_subject_backfill').get().input_token, 'old-token')
      }
      const once = schema(db)
      ensureReviewCompatibilityShape(db)
      assert.deepEqual(schema(db), once)
      assert.deepEqual(readReviewCompatibilitySchemaStatus(db), status)
      integrity(db)
      pass(`${state}: exact historical DDL, lossless rename, durable migration status, v2 isolation and repeat startup`)
    } finally { db.close() }
  }
  const cases = [
    ['legacy-conflict', "CREATE TABLE review_subject_legacy_v1(id TEXT)", 'REVIEW_COMPATIBILITY_LEGACY_CONFLICT'],
    ['unknown-subject', 'ALTER TABLE review_subject ADD COLUMN surprise TEXT', 'REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN'],
    ['uppercase-unknown-subject', 'ALTER TABLE review_subject RENAME TO temporary_subject; ALTER TABLE temporary_subject RENAME TO REVIEW_SUBJECT; ALTER TABLE REVIEW_SUBJECT ADD COLUMN surprise TEXT', 'REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN'],
    ['unknown-compatibility', 'ALTER TABLE review_compatibility ADD COLUMN surprise TEXT', 'REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN'],
    ['unknown-backfill', 'ALTER TABLE review_subject_backfill ADD COLUMN surprise TEXT', 'REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN'],
    ['incoming-fk', 'CREATE TABLE incoming(id TEXT REFERENCES review_subject(revision_id))', 'REVIEW_COMPATIBILITY_SCHEMA_DEPENDENCY'],
    ['view', 'CREATE VIEW subject_view AS SELECT * FROM review_subject', 'REVIEW_COMPATIBILITY_SCHEMA_DEPENDENCY'],
    ['quoted-view', "CREATE VIEW quoted_view AS SELECT * FROM 'REVIEW_SUBJECT'", 'REVIEW_COMPATIBILITY_SCHEMA_DEPENDENCY'],
    ['view-literal-comment', "CREATE VIEW tricky_view AS SELECT '--' AS note, revision_id FROM review_subject", 'REVIEW_COMPATIBILITY_SCHEMA_DEPENDENCY'],
    ['trigger', 'CREATE TRIGGER subject_trigger AFTER INSERT ON review_subject BEGIN SELECT 1; END', 'REVIEW_COMPATIBILITY_SCHEMA_DEPENDENCY'],
    ['external-trigger', 'CREATE TRIGGER external_trigger AFTER INSERT ON import_review_revisions BEGIN SELECT * FROM review_subject; END', 'REVIEW_COMPATIBILITY_SCHEMA_DEPENDENCY'],
    ['extra-index', 'CREATE INDEX subject_extra ON review_subject(subject_digest)', 'REVIEW_COMPATIBILITY_SCHEMA_INDEX_CONFLICT'],
    ['wrong-index', 'DROP INDEX idx_review_compatibility_lookup; CREATE INDEX idx_review_compatibility_lookup ON import_review_revisions(id)', 'REVIEW_COMPATIBILITY_SCHEMA_INDEX_CONFLICT'],
    ['uppercase-index-conflict', 'DROP INDEX idx_review_compatibility_lookup; CREATE INDEX IDX_REVIEW_COMPATIBILITY_LOOKUP ON import_review_revisions(id)', 'REVIEW_COMPATIBILITY_SCHEMA_INDEX_CONFLICT'],
    ['missing-check', null, 'REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN'],
    ['wrong-fk', null, 'REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN'],
    ['wrong-primary-key', null, 'REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN'],
  ]
  for (const [label, sql, code] of cases) {
    const db = database()
    try {
      let ddl = reviewCompatibilityV1Sql
      if (label === 'missing-check') ddl = ddl.replace("CHECK(subject_version = 'review-content-subject-v1')", '')
      if (label === 'wrong-fk') ddl = ddl.replace('REFERENCES import_review_revisions(id)', 'REFERENCES import_review_revisions(id) ON DELETE CASCADE')
      if (label === 'wrong-primary-key') ddl = ddl.replace('revision_id TEXT PRIMARY KEY', 'revision_id TEXT UNIQUE')
      db.exec(ddl)
      if (sql) db.exec(sql)
      integrity(db)
      const before = schema(db)
      // Count executed DDL: rejection must precede even a rename.
      const ddlCalls = []
      const wrapped = {
        get isTransaction() { return db.isTransaction },
        prepare: db.prepare.bind(db),
        exec(sql) { if (/^\s*(CREATE|ALTER|DROP)/i.test(sql)) ddlCalls.push(sql); return db.exec(sql) },
      }
      assert.throws(() => ensureReviewCompatibilityShape(wrapped), failure => failure.code === code, label)
      assert.deepEqual(ddlCalls, [], label)
      assert.deepEqual(schema(db), before)
      integrity(db)
      pass(`${label}: named error before any DDL, original schema and FK/integrity preserved`)
    } finally { db.close() }
  }
  for (const outer of [false, true]) {
    const db = database()
    try {
      db.exec(reviewCompatibilityV1Sql)
      installV1Subject(db, 'old-revision')
      const before = schema(db)
      if (outer) db.exec('BEGIN IMMEDIATE')
      const wrapped = {
        get isTransaction() { return db.isTransaction },
        prepare: db.prepare.bind(db),
        exec(sql) {
          // Rename has already happened. Simulate a later DDL failure after
          // partially creating v2, rather than just rejecting preflight.
          if (sql.includes('CREATE TABLE IF NOT EXISTS review_subject (')) {
            db.exec(sql.split('CREATE TABLE IF NOT EXISTS review_compatibility (')[0])
            throw new Error('INJECTED_DDL_FAILURE')
          }
          return db.exec(sql)
        },
      }
      assert.throws(() => ensureReviewCompatibilityShape(wrapped), /INJECTED_DDL_FAILURE/)
      assert.equal(db.isTransaction, outer)
      if (outer) db.exec('COMMIT')
      assert.deepEqual(schema(db), before)
      assert.equal(db.prepare('SELECT subject_json FROM review_subject').get().subject_json, '{"preserved":true}')
      integrity(db)
      pass(`DDL failure outer=${outer}: function savepoint restores rename and partial create even if caller commits`)
    } finally { db.close() }
  }
  {
    const db = database()
    try {
      db.exec(reviewCompatibilityV1Sql)
      db.exec('BEGIN IMMEDIATE')
      ensureReviewCompatibilityShape(db)
      assert.equal(db.isTransaction, true)
      db.exec('ROLLBACK')
      assert.equal(readReviewCompatibilitySchemaStatus(db).legacyPresent, false)
      assert.match(db.prepare("SELECT sql FROM sqlite_master WHERE name='review_subject'").get().sql, /subject-v1/)
      integrity(db)
      pass('successful migration remains controlled by the outer transaction')
    } finally { db.close() }
  }
  const file = path.join(root, 'double-start.sqlite')
  const db = database(file)
  db.exec(reviewCompatibilityV1Sql)
  installV1Subject(db, 'old-revision')
  db.close()
  const moduleUrl = new URL('../../server/import-review/reviewCompatibilitySchema.mjs', import.meta.url).href
  const child = () => new Promise((resolve, reject) => {
    const process = spawn(globalThis.process.execPath, ['--input-type=module', '-e', `
      import {DatabaseSync} from 'node:sqlite';
      import {ensureReviewCompatibilityShape} from ${JSON.stringify(moduleUrl)};
      const db=new DatabaseSync(${JSON.stringify(file)});
      db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
      ensureReviewCompatibilityShape(db); db.close();
    `], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    process.stderr.on('data', value => { output += value })
    process.on('error', reject)
    process.on('exit', code => code === 0 ? resolve() : reject(new Error(output)))
  })
  await Promise.all([child(), child()])
  const final = new DatabaseSync(file)
  try {
    final.exec('PRAGMA foreign_keys=ON')
    ensureReviewCompatibilityShape(final)
    assert.equal(final.prepare('SELECT COUNT(*) n FROM review_compatibility_schema_migration').get().n, 1)
    assert.equal(final.prepare('SELECT COUNT(*) n FROM review_subject_legacy_v1').get().n, 1)
    integrity(final)
    pass('two concurrent process starts serialize to one archive and one migration record')
  } finally { final.close() }
}
