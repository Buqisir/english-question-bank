import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { reviewCompatibilityV1Sql, installV1Subject } from './schema-v1.mjs'
import { ensureReviewCompatibilityShape, readReviewCompatibilitySchemaStatus } from '../../server/import-review/reviewCompatibilitySchema.mjs'
import { createImportReviewStore } from '../../server/import-review/importReviewStore.mjs'

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
  await verifyReviewCompatibilityStartupLocks(root, pass)
  for (const version of ['v1', 'v2']) {
    const reference = database()
    if (version === 'v1') reference.exec(reviewCompatibilityV1Sql)
    else ensureReviewCompatibilityShape(reference)
    const objects = reference.prepare("SELECT type,name,sql FROM sqlite_master WHERE tbl_name LIKE 'review_%' AND sql IS NOT NULL").all()
    const names = {
      tables: new Set(objects.filter(row => row.type === 'table').map(row => row.name).concat('import_review_revisions')),
      indexes: new Set(objects.filter(row => row.type === 'index').map(row => row.name)),
      columns: new Set(['id', ...objects.filter(row => row.type === 'table')
        .flatMap(row => reference.prepare(`PRAGMA table_xinfo("${row.name}")`).all().map(column => column.name))]),
    }
    reference.close()
    for (const surface of ['tables', 'indexes', 'columns', 'all']) {
      for (const style of ['upper', 'mixed']) {
        const identifiers = surface === 'all' ? new Set(Object.values(names).flatMap(set => [...set])) : names[surface]
        const changeCase = token => style === 'upper' ? token.toUpperCase()
          : [...token].map((letter, i) => i % 2 ? letter.toLowerCase() : letter.toUpperCase()).join('')
        const ddl = objects.map(row => row.sql).join(';\n').replace(
          /'(?:''|[^'])*'|[A-Za-z_][A-Za-z_0-9]*/g,
          token => identifiers.has(token) ? changeCase(token) : token)
        const db = database()
        try {
          db.exec(ddl)
          ensureReviewCompatibilityShape(db)
          const once = schema(db)
          ensureReviewCompatibilityShape(db)
          assert.deepEqual(schema(db), once)
          assert.equal(readReviewCompatibilitySchemaStatus(db).legacyPresent, version === 'v1')
          integrity(db)
          pass(`${version} ${surface} ${style}: SQLite-equivalent identifier casing migrates and restarts`)
        } finally { db.close() }
      }
    }
  }
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
    ['wrong-column-name', 'ALTER TABLE review_subject RENAME COLUMN subject_digest TO subject_fingerprint', 'REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN'],
    ['wrong-type', null, 'REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN'],
    ['missing-not-null', null, 'REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN'],
    ['extra-default', null, 'REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN'],
    ['changed-literal-case', null, 'REVIEW_COMPATIBILITY_SCHEMA_UNKNOWN'],
    ['wrong-index-order', 'DROP INDEX idx_review_compatibility_lookup; CREATE INDEX idx_review_compatibility_lookup ON review_compatibility(revision_id,target_build_id,comparator_version,attempt_no ASC)', 'REVIEW_COMPATIBILITY_SCHEMA_INDEX_CONFLICT'],
    ['wrong-collation', 'DROP INDEX idx_review_compatibility_lookup; CREATE INDEX idx_review_compatibility_lookup ON review_compatibility(revision_id COLLATE NOCASE,target_build_id,comparator_version,attempt_no DESC)', 'REVIEW_COMPATIBILITY_SCHEMA_INDEX_CONFLICT'],
  ]
  for (const [label, sql, code] of cases) {
    const db = database()
    try {
      let ddl = reviewCompatibilityV1Sql
      if (label === 'missing-check') ddl = ddl.replace("CHECK(subject_version = 'review-content-subject-v1')", '')
      if (label === 'wrong-fk') ddl = ddl.replace('REFERENCES import_review_revisions(id)', 'REFERENCES import_review_revisions(id) ON DELETE CASCADE')
      if (label === 'wrong-primary-key') ddl = ddl.replace('revision_id TEXT PRIMARY KEY', 'revision_id TEXT UNIQUE')
      if (label === 'wrong-type') ddl = ddl.replace('subject_digest TEXT NOT NULL', 'subject_digest BLOB NOT NULL')
      if (label === 'missing-not-null') ddl = ddl.replace('subject_digest TEXT NOT NULL', 'subject_digest TEXT')
      if (label === 'extra-default') ddl = ddl.replace('subject_digest TEXT NOT NULL', "subject_digest TEXT NOT NULL DEFAULT 'unexpected'")
      if (label === 'changed-literal-case') ddl = ddl.replaceAll('review-content-subject-v1', 'REVIEW-CONTENT-SUBJECT-V1')
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

export async function verifyReviewCompatibilityStartupLocks(root, pass) {
  const file = path.join(root, 'startup-locks.sqlite')
  const options = { dbPath: file, filesRoot: path.join(root, 'startup-files'), rendererBuildId: 'startup-lock-fixture' }
  createImportReviewStore(options)
  const holder = new DatabaseSync(file)
  try {
    assert.equal(holder.prepare('PRAGMA journal_mode').get().journal_mode, 'delete')
    const before = readFileSync(file)
    for (const lock of ['BEGIN; SELECT * FROM review_subject', 'BEGIN IMMEDIATE']) {
      holder.exec(lock)
      try {
        const db = new DatabaseSync(file)
        try {
          const calls = []
          const wrapped = {
            get isTransaction() { return db.isTransaction },
            prepare: db.prepare.bind(db),
            exec(sql) { calls.push(sql); return db.exec(sql) },
          }
          ensureReviewCompatibilityShape(wrapped)
          ensureReviewCompatibilityShape(wrapped)
          assert.equal(calls.some(sql => /\b(IMMEDIATE|CREATE|ALTER|INSERT|UPDATE|DELETE)\b/.test(sql)), false)
          assert.equal(db.isTransaction, false)
          assert.equal(db.prepare('SELECT total_changes() n').get().n, 0)
        } finally { db.close() }
        // Same synchronous constructor used before API listen, twice for deploy/restart.
        createImportReviewStore(options)
        createImportReviewStore(options)
      } finally { holder.exec('ROLLBACK') }
      assert.deepEqual(readFileSync(file), before)
      pass(`verified v2 startup under ${lock}: ensure and API store stay read-only and byte-stable`)
    }
  } finally { holder.close() }

  const moduleUrl = new URL('../../server/import-review/reviewCompatibilitySchema.mjs', import.meta.url).href
  for (const [label, lock, release] of [
    ['writer-release', 'BEGIN IMMEDIATE', true],
    ['writer-timeout', 'BEGIN IMMEDIATE', false],
    ['reader-release', 'BEGIN; SELECT * FROM review_subject', true],
    ['reader-timeout', 'BEGIN; SELECT * FROM review_subject', false],
  ]) {
    const file = path.join(root, `migration-lock-${label}.sqlite`)
    const holder = database(file)
    holder.exec(reviewCompatibilityV1Sql)
    installV1Subject(holder, 'old-revision')
    const before = schema(holder)
    holder.exec(lock)
    let released = false
    try {
      const child = spawn(process.execPath, ['--input-type=module', '-e', `
        import {DatabaseSync} from 'node:sqlite';
        import {ensureReviewCompatibilityShape} from ${JSON.stringify(moduleUrl)};
        const db = new DatabaseSync(${JSON.stringify(file)});
        process.send('starting');
        const start = performance.now();
        try {
          ensureReviewCompatibilityShape(db);
          console.log(JSON.stringify({enabled:true,elapsed:performance.now()-start,transaction:db.isTransaction}));
        } catch(error) {
          console.log(JSON.stringify({code:error.code,cause:error.cause?.errcode,
            elapsed:performance.now()-start,transaction:db.isTransaction}));
        } finally { db.close(); process.disconnect(); }
      `], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
      let output = '', errors = ''
      child.stdout.on('data', value => { output += value })
      child.stderr.on('data', value => { errors += value })
      const started = new Promise((resolve, reject) => {
        child.once('message', resolve)
        child.once('error', reject)
        child.once('exit', () => reject(new Error(`Child exited before lock probe: ${errors}`)))
      })
      const exited = new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(errors)))
      })
      await started
      if (release) {
        await yieldFor(150)
        holder.exec('ROLLBACK')
        released = true
      }
      await exited
      const result = JSON.parse(output)
      assert.equal(result.transaction, false)
      assert(result.elapsed >= (release ? 100 : 4500), output)
      assert(result.elapsed < 15_000, output)
      if (release) {
        assert.equal(result.enabled, true, output)
        const status = readReviewCompatibilitySchemaStatus(holder)
        assert.equal(status.migration.legacyRowCount, 1)
        ensureReviewCompatibilityShape(holder)
        ensureReviewCompatibilityShape(holder)
        assert.deepEqual(readReviewCompatibilitySchemaStatus(holder), status)
      } else {
        assert.equal(result.code, 'REVIEW_COMPATIBILITY_SCHEMA_BUSY', output)
        assert.equal(result.cause, 5)
        assert.deepEqual(schema(holder), before)
        holder.exec('ROLLBACK')
        released = true
        ensureReviewCompatibilityShape(holder)
        assert.equal(readReviewCompatibilitySchemaStatus(holder).migration.legacyRowCount, 1)
      }
      pass(`v1 migration ${label}: bounded wait, named timeout rollback, lossless retry and repeat ensure`)
    } finally {
      if (!released) holder.exec('ROLLBACK')
      holder.close()
    }
  }
}
