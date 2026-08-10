#!/usr/bin/env node
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { ensureSharedVocabularyShape, ensureUserVocabularyShape } from '../server/vocabulary/vocabularyStore.mjs'

function legacyDatabase({ allowInvalid = false, verification = 'page-checked' } = {}) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE vocabulary_programs (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      source_title TEXT NOT NULL,
      source_edition TEXT NOT NULL DEFAULT '',
      total_planned_entries INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE vocabulary_groups (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES vocabulary_programs(id) ON DELETE CASCADE,
      stage TEXT NOT NULL CHECK (stage IN ('core', 'basic', 'recognition')),
      week INTEGER NOT NULL,
      group_number INTEGER NOT NULL,
      source_label TEXT NOT NULL,
      start_order INTEGER NOT NULL,
      end_order INTEGER NOT NULL,
      UNIQUE(program_id, stage, group_number)
    );
    CREATE TABLE vocabulary_entries (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES vocabulary_programs(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES vocabulary_groups(id) ON DELETE CASCADE,
      headword TEXT NOT NULL,
      phonetic TEXT NOT NULL,
      part_of_speech TEXT NOT NULL,
      source_meanings_json TEXT NOT NULL,
      teaching_sense TEXT NOT NULL,
      pronunciation_mode TEXT NOT NULL CHECK (pronunciation_mode IN ('syllables', 'forms')),
      syllables_json TEXT NOT NULL,
      example_english TEXT NOT NULL,
      example_chinese TEXT NOT NULL,
      example_highlight TEXT NOT NULL,
      example_review_status TEXT NOT NULL CHECK (example_review_status = 'approved'),
      visual_key TEXT NOT NULL,
      visual_version TEXT NOT NULL,
      visual_path TEXT NOT NULL,
      visual_alt TEXT NOT NULL,
      audio_key TEXT NOT NULL,
      audio_version TEXT NOT NULL,
      audio_path TEXT NOT NULL,
      audio_voice TEXT NOT NULL CHECK (audio_voice = 'en-GB-SoniaNeural'),
      source_stage TEXT NOT NULL CHECK (source_stage IN ('core', 'basic', 'recognition')),
      source_day INTEGER NOT NULL,
      source_order INTEGER NOT NULL,
      printed_page INTEGER NOT NULL,
      source_verification TEXT NOT NULL CHECK (source_verification IN ('page-checked'${allowInvalid ? ", 'invalid'" : ''})),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(program_id, source_order)
    );
    CREATE INDEX idx_vocabulary_entries_program_order ON vocabulary_entries(program_id, source_order);
    CREATE UNIQUE INDEX idx_vocabulary_entries_program_visual ON vocabulary_entries(program_id, visual_key);
    CREATE UNIQUE INDEX idx_vocabulary_entries_program_audio ON vocabulary_entries(program_id, audio_key);
    INSERT INTO vocabulary_programs VALUES (
      'legacy-program', 'legacy-v1', 'Legacy vocabulary', '', 'Legacy source', 'Legacy edition', 1,
      '2026-08-07T00:00:00.000Z', '2026-08-07T00:00:00.000Z'
    );
    INSERT INTO vocabulary_groups VALUES (
      'legacy-group', 'legacy-program', 'core', 1, 1, 'Day 1', 1, 1
    );
  `)
  db.prepare(`
    INSERT INTO vocabulary_entries (
      id, program_id, group_id, headword, phonetic, part_of_speech, source_meanings_json,
      teaching_sense, pronunciation_mode, syllables_json, example_english, example_chinese,
      example_highlight, example_review_status, visual_key, visual_version, visual_path, visual_alt,
      audio_key, audio_version, audio_path, audio_voice, source_stage, source_day, source_order,
      printed_page, source_verification, created_at, updated_at
    ) VALUES (
      'legacy-entry', 'legacy-program', 'legacy-group', 'word', '/wɜːd/', 'n.', '["单词"]',
      '单词', 'syllables', '["word"]', 'A word.', '一个单词。', 'word', 'approved',
      'legacy-visual', 'koboyo-v1', '/word.svg', '一个单词卡片', 'legacy-audio', 'sonia-v1',
      '/word.mp3', 'en-GB-SoniaNeural', 'core', 1, 1, 1, ?,
      '2026-08-07T00:00:00.000Z', '2026-08-07T00:00:00.000Z'
    )
  `).run(verification)
  return db
}

const migrated = legacyDatabase()
ensureSharedVocabularyShape(migrated)
const migratedRow = migrated.prepare('SELECT * FROM vocabulary_entries WHERE id = ?').get('legacy-entry')
assert.equal(migratedRow.headword, 'word')
assert.equal(migratedRow.exam_frequency, 0)
assert.match(migrated.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vocabulary_entries'").get().sql, /index-and-heading-reviewed/u)
assert.match(migrated.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vocabulary_entries'").get().sql, /eqb-british-teacher-v1/u)
assert.deepEqual(
  migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_vocabulary_entries_%' ORDER BY name").all().map((row) => row.name),
  ['idx_vocabulary_entries_program_audio', 'idx_vocabulary_entries_program_order', 'idx_vocabulary_entries_program_visual'],
)
assert.deepEqual(migrated.prepare('PRAGMA foreign_key_check').all(), [])
assert.equal(migrated.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
assert.equal(migrated.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'vocabulary_entries_legacy_contract'").get().count, 0)
migrated.close()
console.log('PASS legacy vocabulary schema migrates atomically with row, indexes, and foreign keys preserved')

const failing = legacyDatabase({ allowInvalid: true, verification: 'invalid' })
assert.throws(() => ensureSharedVocabularyShape(failing), /CHECK constraint failed/u)
const restoredRow = failing.prepare('SELECT * FROM vocabulary_entries WHERE id = ?').get('legacy-entry')
assert.equal(restoredRow.source_verification, 'invalid')
assert.equal(Object.hasOwn(restoredRow, 'exam_frequency'), false)
assert.doesNotMatch(failing.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vocabulary_entries'").get().sql, /index-and-heading-reviewed/u)
assert.equal(failing.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'vocabulary_entries_legacy_contract'").get().count, 0)
assert.deepEqual(failing.prepare('PRAGMA foreign_key_check').all(), [])
assert.equal(failing.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
failing.close()
console.log('PASS failed vocabulary migration rolls back schema and data and restores foreign-key enforcement')

function legacyUserVocabularyDatabase({ invalidShare = false } = {}) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE vocabulary_review_progress (
      user_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      cursor INTEGER NOT NULL DEFAULT 0,
      last_target INTEGER NOT NULL DEFAULT 15 CHECK (last_target BETWEEN 1 AND 60),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, program_id)
    );
    CREATE TABLE vocabulary_review_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('main', 'temporary')),
      target_unfamiliar_count INTEGER NOT NULL CHECK (target_unfamiliar_count BETWEEN 1 AND 60),
      cursor INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('active', 'target_reached', 'program_exhausted', 'frozen')),
      temporary_stage TEXT,
      temporary_day INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE vocabulary_review_decisions (
      run_id TEXT NOT NULL REFERENCES vocabulary_review_runs(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      verdict TEXT NOT NULL CHECK (verdict IN ('known', 'unfamiliar')),
      decision_index INTEGER NOT NULL,
      decided_at TEXT NOT NULL,
      PRIMARY KEY(run_id, entry_id),
      UNIQUE(run_id, decision_index)
    );
    CREATE TABLE vocabulary_sets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      review_run_id TEXT NOT NULL UNIQUE REFERENCES vocabulary_review_runs(id),
      title TEXT NOT NULL,
      entry_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_vocabulary_sets_user ON vocabulary_sets(user_id, created_at DESC);
    CREATE TABLE vocabulary_set_entries (
      set_id TEXT NOT NULL REFERENCES vocabulary_sets(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      PRIMARY KEY(set_id, order_index),
      UNIQUE(set_id, entry_id)
    );
    CREATE TABLE vocabulary_shares (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL UNIQUE REFERENCES vocabulary_sets(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      share_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked'${invalidShare ? ", 'invalid'" : ''})),
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX idx_vocabulary_shares_public ON vocabulary_shares(share_id, status);
    INSERT INTO vocabulary_review_progress VALUES (
      'teacher-a', 'wanwei-round-one-v1', 1, 15, '2026-08-07T00:00:00.000Z'
    );
    INSERT INTO vocabulary_review_runs VALUES (
      'legacy-run', 'teacher-a', 'wanwei-round-one-v1', 'main', 1, 1, 'frozen', NULL, NULL,
      '2026-08-07T00:00:00.000Z', '2026-08-07T00:00:00.000Z'
    );
    INSERT INTO vocabulary_review_decisions VALUES (
      'legacy-run', 'legacy-entry', 'unfamiliar', 0, '2026-08-07T00:00:00.000Z'
    );
    INSERT INTO vocabulary_sets VALUES (
      'legacy-set', 'teacher-a', 'wanwei-round-one-v1', 'legacy-run', '旧生词组', 1,
      '2026-08-07T00:00:00.000Z'
    );
    INSERT INTO vocabulary_set_entries VALUES ('legacy-set', 'legacy-entry', 0, '{}');
    INSERT INTO vocabulary_shares VALUES (
      'legacy-share-row', 'legacy-set', 'teacher-a', 'legacy-share',
      '${invalidShare ? 'invalid' : 'active'}', '2026-08-07T00:00:00.000Z', NULL
    );
  `)
  return db
}

const migratedUser = legacyUserVocabularyDatabase()
ensureUserVocabularyShape(migratedUser)
const reviewRunColumn = migratedUser.prepare('PRAGMA table_info(vocabulary_sets)').all()
  .find((column) => column.name === 'review_run_id')
assert.equal(reviewRunColumn.notnull, 0)
const defaultStudent = migratedUser.prepare('SELECT * FROM vocabulary_students WHERE user_id = ?').get('teacher-a')
assert.equal(defaultStudent.id, 'vocabulary-student-default:teacher-a')
assert.equal(defaultStudent.display_name, '默认学生')
assert.equal(migratedUser.prepare('SELECT student_id FROM vocabulary_review_progress').get().student_id, defaultStudent.id)
assert.equal(migratedUser.prepare('SELECT student_id FROM vocabulary_review_runs').get().student_id, defaultStudent.id)
assert.equal(migratedUser.prepare('SELECT review_run_id FROM vocabulary_sets WHERE id = ?').get('legacy-set').review_run_id, 'legacy-run')
assert.equal(migratedUser.prepare('SELECT student_id FROM vocabulary_sets WHERE id = ?').get('legacy-set').student_id, defaultStudent.id)
assert.equal(migratedUser.prepare('SELECT COUNT(*) AS count FROM vocabulary_set_entries').get().count, 1)
assert.equal(migratedUser.prepare('SELECT COUNT(*) AS count FROM vocabulary_review_decisions').get().count, 1)
assert.equal(migratedUser.prepare('SELECT status FROM vocabulary_shares').get().status, 'active')
migratedUser.prepare(`
  INSERT INTO vocabulary_sets (id, user_id, student_id, program_id, review_run_id, title, entry_count, created_at)
  VALUES ('direct-set', 'teacher-a', ?, 'wanwei-round-one-v1', NULL, '输入词表', 1, '2026-08-09T00:00:00.000Z')
`).run(defaultStudent.id)
assert.equal(migratedUser.prepare('SELECT review_run_id FROM vocabulary_sets WHERE id = ?').get('direct-set').review_run_id, null)
assert.deepEqual(migratedUser.prepare('PRAGMA foreign_key_check').all(), [])
assert.equal(migratedUser.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
ensureUserVocabularyShape(migratedUser)
migratedUser.close()
console.log('PASS legacy user vocabulary data migrates into a default student without losing progress, runs, Sets, entries, or shares')

const failingUser = legacyUserVocabularyDatabase({ invalidShare: true })
assert.throws(() => ensureUserVocabularyShape(failingUser), /CHECK constraint failed/u)
assert.equal(failingUser.prepare('PRAGMA table_info(vocabulary_sets)').all().find((column) => column.name === 'review_run_id').notnull, 1)
assert.equal(failingUser.prepare('PRAGMA table_info(vocabulary_sets)').all().some((column) => column.name === 'student_id'), false)
assert.equal(failingUser.prepare('SELECT review_run_id FROM vocabulary_sets WHERE id = ?').get('legacy-set').review_run_id, 'legacy-run')
assert.equal(failingUser.prepare('SELECT status FROM vocabulary_shares').get().status, 'invalid')
assert.equal(failingUser.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE '%legacy_required_run'").get().count, 0)
assert.deepEqual(failingUser.prepare('PRAGMA foreign_key_check').all(), [])
assert.equal(failingUser.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
failingUser.close()
console.log('PASS failed student-scope migration rolls back schema, progress, runs, entries, shares, and foreign-key enforcement')

const duplicateRunsUser = new DatabaseSync(':memory:')
duplicateRunsUser.exec('PRAGMA foreign_keys = ON')
ensureUserVocabularyShape(duplicateRunsUser)
duplicateRunsUser.exec(`
  INSERT INTO vocabulary_students VALUES (
    'student-a', 'teacher-a', '小林', '小林', '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z'
  );
  DROP INDEX idx_vocabulary_review_runs_open;
  INSERT INTO vocabulary_review_runs VALUES (
    'run-older', 'teacher-a', 'student-a', 'wanwei-round-one-v1', 'main', 15, 1, 'active', NULL, NULL,
    '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z'
  );
  INSERT INTO vocabulary_review_runs VALUES (
    'run-newer', 'teacher-a', 'student-a', 'wanwei-round-one-v1', 'temporary', 15, 2, 'active', 'core', NULL,
    '2026-08-09T00:01:00.000Z', '2026-08-09T00:01:00.000Z'
  );
  INSERT INTO vocabulary_review_decisions VALUES (
    'run-older', 'entry-old', 'known', 0, '2026-08-09T00:00:30.000Z'
  );
`)
ensureUserVocabularyShape(duplicateRunsUser)
assert.equal(duplicateRunsUser.prepare("SELECT COUNT(*) AS count FROM vocabulary_review_runs WHERE status <> 'frozen'").get().count, 1)
assert.equal(duplicateRunsUser.prepare('SELECT id FROM vocabulary_review_runs').get().id, 'run-newer')
assert.equal(duplicateRunsUser.prepare('SELECT COUNT(*) AS count FROM vocabulary_review_decisions').get().count, 0)
assert.equal(duplicateRunsUser.prepare("SELECT COUNT(*) AS count FROM vocabulary_review_runs WHERE status = 'frozen'").get().count, 0)
assert.ok(duplicateRunsUser.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_vocabulary_review_runs_open'").get())
assert.deepEqual(duplicateRunsUser.prepare('PRAGMA foreign_key_check').all(), [])
duplicateRunsUser.close()
console.log('PASS duplicate unfinished Runs reconcile to the newest Run without fabricating a frozen Set')
