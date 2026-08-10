import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { applyAmericanVocabularyPhonetics } from './americanPhonetics.mjs'

const ACTIVE_RUN_STATUSES = new Set(['active', 'target_reached', 'program_exhausted'])
const FORMAL_AUDIO_VOICE = 'eqb-british-teacher-v1'
const DEFAULT_STUDENT_ID_PREFIX = 'vocabulary-student-default:'
const DEFAULT_STUDENT_NAME = '默认学生'
const EXAMPLE_CANDIDATE_VERSION = 'wanwei-examples-v1'

export class VocabularyStoreError extends Error {
  constructor(message, status = 400, code = 'invalid_vocabulary_request') {
    super(message)
    this.name = 'VocabularyStoreError'
    this.status = status
    this.code = code
  }
}

function nowIso() {
  return new Date().toISOString()
}

function parseJson(raw, fallback) {
  try {
    return JSON.parse(String(raw ?? ''))
  } catch {
    return fallback
  }
}

function legacyExampleCandidate(example, teachingSense) {
  return {
    candidateId: 'a',
    version: 'legacy-single-v1',
    teachingSense,
    english: example.english,
    chinese: example.chinese,
    highlight: example.highlight,
    reviewStatus: 'approved',
  }
}

function normalizeExampleCandidates(rawCandidates, fallbackExample, teachingSense) {
  const candidates = Array.isArray(rawCandidates) && rawCandidates.length
    ? rawCandidates
    : [legacyExampleCandidate(fallbackExample, teachingSense)]
  const seenIds = new Set()
  const normalizedCandidates = candidates.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new VocabularyStoreError(`exampleCandidates[${index}]格式无效。`)
    }
    const candidateId = requireNonEmpty(candidate.candidateId, `exampleCandidates[${index}].candidateId`)
    if (seenIds.has(candidateId)) throw new VocabularyStoreError(`例句候选ID重复：${candidateId}`)
    seenIds.add(candidateId)
    const normalized = {
      candidateId,
      version: requireNonEmpty(candidate.version, `exampleCandidates[${index}].version`),
      teachingSense: requireNonEmpty(candidate.teachingSense, `exampleCandidates[${index}].teachingSense`),
      english: requireNonEmpty(candidate.english, `exampleCandidates[${index}].english`),
      chinese: requireNonEmpty(candidate.chinese, `exampleCandidates[${index}].chinese`),
      highlight: requireNonEmpty(candidate.highlight, `exampleCandidates[${index}].highlight`),
      reviewStatus: candidate.reviewStatus,
    }
    if (normalized.version === 'legacy-single-v1') normalized.teachingSense = teachingSense
    if (normalized.teachingSense !== teachingSense) {
      throw new VocabularyStoreError(`例句候选 ${candidateId} 与教学核心义不一致。`)
    }
    if (normalized.reviewStatus !== 'approved') {
      throw new VocabularyStoreError(`例句候选 ${candidateId} 尚未审核通过。`)
    }
    if (!normalized.english.includes(normalized.highlight)) {
      throw new VocabularyStoreError(`例句候选 ${candidateId} 的高亮文本未出现在英文句子中。`)
    }
    return normalized
  })
  const versions = new Set(normalizedCandidates.map((candidate) => candidate.version))
  if (versions.size !== 1) throw new VocabularyStoreError('同一词条的例句候选版本必须一致。')
  return normalizedCandidates
}

function requireNonEmpty(value, label) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new VocabularyStoreError(`${label}不能为空。`)
  return normalized
}

function normalizeStudentName(value) {
  const displayName = String(value ?? '').trim().replace(/\s+/gu, ' ')
  const length = Array.from(displayName).length
  if (!displayName) throw new VocabularyStoreError('学生姓名不能为空。')
  if (length > 30) throw new VocabularyStoreError('学生姓名最多 30 个字。')
  if (/[\p{Cc}\p{Cf}\p{Extended_Pictographic}]/u.test(displayName)) {
    throw new VocabularyStoreError('学生姓名不能包含控制字符或 Emoji。')
  }
  return {
    displayName,
    nameKey: displayName.normalize('NFKC').toLocaleLowerCase('zh-CN'),
  }
}

function normalizeVocabularySetTitle(value) {
  const title = String(value ?? '').trim().replace(/\s+/gu, ' ')
  const length = Array.from(title).length
  if (!title) throw new VocabularyStoreError('生词组名称不能为空。')
  if (length > 30) throw new VocabularyStoreError('生词组名称最多 30 个字。')
  if (/[\p{Cc}\p{Cf}\p{Extended_Pictographic}]/u.test(title)) {
    throw new VocabularyStoreError('生词组名称不能包含控制字符或 Emoji。')
  }
  return title
}

function defaultStudentId(userId) {
  return `${DEFAULT_STUDENT_ID_PREFIX}${userId}`
}

function projectVocabularySnapshot(snapshot, invalid) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) invalid()
  const visual = snapshot.visual
  const audio = snapshot.audio
  const syllables = snapshot.syllables
  if (!visual || typeof visual !== 'object' || !audio || typeof audio !== 'object' || !Array.isArray(syllables)) invalid()
  if (!['syllables', 'forms'].includes(snapshot.pronunciationMode)) invalid()
  if (!['eqb-british-teacher-v1', 'en-GB-SoniaNeural'].includes(audio.voice)) invalid()
  const projectParts = (parts) => parts.map((part) => {
    if (typeof part === 'string' && part.trim()) return part
    if (!part || typeof part !== 'object' || Array.isArray(part)) invalid()
    const spelling = String(part.spelling ?? '').trim()
    const phonetic = String(part.phonetic ?? '').trim()
    if (!spelling) invalid()
    return { spelling, phonetic }
  })
  const publicSyllables = projectParts(syllables)
  if (!publicSyllables.length) invalid()
  const rawPronunciationParts = snapshot.pronunciationParts
  const publicPronunciationParts = rawPronunciationParts
    && typeof rawPronunciationParts === 'object'
    && !Array.isArray(rawPronunciationParts)
    && Array.isArray(rawPronunciationParts.american)
    && Array.isArray(rawPronunciationParts.british)
    ? {
        american: projectParts(rawPronunciationParts.american),
        british: projectParts(rawPronunciationParts.british),
      }
    : undefined
  const text = (value) => {
    const normalized = String(value ?? '').trim()
    if (!normalized) invalid()
    return normalized
  }
  const projected = applyAmericanVocabularyPhonetics({
    id: text(snapshot.id),
    headword: text(snapshot.headword),
    phonetic: text(snapshot.phonetic),
    partOfSpeech: text(snapshot.partOfSpeech),
    teachingSense: text(snapshot.teachingSense),
    pronunciationMode: snapshot.pronunciationMode,
    syllables: publicSyllables,
    pronunciationParts: publicPronunciationParts,
    visual: {
      key: text(visual.key),
      version: text(visual.version),
      path: text(visual.path),
      alt: text(visual.alt),
    },
    audio: {
      key: text(audio.key),
      version: text(audio.version),
      path: text(audio.path),
      voice: audio.voice,
    },
  })
  const phonetics = snapshot.phonetics
  if (!phonetics || typeof phonetics !== 'object' || Array.isArray(phonetics)) return projected
  return {
    ...projected,
    phonetics: {
      american: text(phonetics.american),
      british: text(phonetics.british),
    },
  }
}

function projectPublicVocabularyEntry(snapshot) {
  const invalid = () => {
    throw new VocabularyStoreError('这份听写单的冻结快照已损坏。', 500, 'vocabulary_share_snapshot_invalid')
  }
  return projectVocabularySnapshot(snapshot, invalid)
}

function projectPublicVocabularyDictationEntry(snapshot) {
  const entry = projectPublicVocabularyEntry(snapshot)
  const sourceMeanings = Array.isArray(snapshot.sourceMeanings)
    ? [...new Set(snapshot.sourceMeanings.map((meaning) => String(meaning ?? '').trim()).filter(Boolean))].slice(0, 3)
    : []
  const firstPronunciationPart = entry.pronunciationParts?.american?.[0] ?? entry.syllables[0]
  const answer = entry.pronunciationMode === 'forms'
    ? String(typeof firstPronunciationPart === 'string' ? firstPronunciationPart : firstPronunciationPart?.spelling ?? '').trim()
    : entry.headword
  if (!answer) {
    throw new VocabularyStoreError('这份听写单的冻结快照已损坏。', 500, 'vocabulary_share_snapshot_invalid')
  }
  return {
    id: entry.id,
    answer,
    partOfSpeech: entry.partOfSpeech,
    sourceMeanings: sourceMeanings.length ? sourceMeanings : [entry.teachingSense],
    teachingSense: entry.teachingSense,
    audio: entry.audio,
  }
}

function projectFrozenVocabularyEntry(snapshot) {
  const invalid = () => {
    throw new VocabularyStoreError('这份生词集的冻结快照已损坏。', 500, 'vocabulary_set_snapshot_invalid')
  }
  const entry = projectVocabularySnapshot(snapshot, invalid)
  const example = snapshot.example
  if (!example || typeof example !== 'object' || Array.isArray(example) || example.reviewStatus !== 'approved') invalid()
  const text = (value) => {
    const normalized = String(value ?? '').trim()
    if (!normalized) invalid()
    return normalized
  }
  const sourceMeanings = Array.isArray(snapshot.sourceMeanings)
    ? [...new Set(snapshot.sourceMeanings.map((meaning) => String(meaning ?? '').trim()).filter(Boolean))].slice(0, 3)
    : []
  const exampleSelection = snapshot.exampleSelection == null
    ? undefined
    : {
        candidateId: text(snapshot.exampleSelection?.candidateId),
        version: text(snapshot.exampleSelection?.version),
      }
  return {
    ...entry,
    sourceMeanings: sourceMeanings.length ? sourceMeanings : [entry.teachingSense],
    example: {
      english: text(example.english),
      chinese: text(example.chinese),
      highlight: text(example.highlight),
      reviewStatus: 'approved',
    },
    ...(exampleSelection ? { exampleSelection } : {}),
  }
}

function normalizeTarget(value, fallback = 15) {
  const target = value == null ? fallback : Number(value)
  if (!Number.isInteger(target) || target < 1 || target > 60) {
    throw new VocabularyStoreError('目标生词数必须是 1–60 的整数。')
  }
  return target
}

export function ensureSharedVocabularyShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vocabulary_programs (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      source_title TEXT NOT NULL,
      source_edition TEXT NOT NULL DEFAULT '',
      total_planned_entries INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vocabulary_groups (
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
    CREATE INDEX IF NOT EXISTS idx_vocabulary_groups_program_order
      ON vocabulary_groups(program_id, start_order);
    CREATE TABLE IF NOT EXISTS vocabulary_entries (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES vocabulary_programs(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES vocabulary_groups(id) ON DELETE CASCADE,
      headword TEXT NOT NULL,
      phonetic TEXT NOT NULL,
      part_of_speech TEXT NOT NULL,
      source_meanings_json TEXT NOT NULL,
      teaching_sense TEXT NOT NULL,
      exam_frequency INTEGER NOT NULL DEFAULT 0,
      pronunciation_mode TEXT NOT NULL CHECK (pronunciation_mode IN ('syllables', 'forms')),
      syllables_json TEXT NOT NULL,
      example_english TEXT NOT NULL,
      example_chinese TEXT NOT NULL,
      example_highlight TEXT NOT NULL,
      example_review_status TEXT NOT NULL CHECK (example_review_status = 'approved'),
      example_candidates_json TEXT NOT NULL DEFAULT '[]',
      visual_key TEXT NOT NULL,
      visual_version TEXT NOT NULL,
      visual_path TEXT NOT NULL,
      visual_alt TEXT NOT NULL,
      audio_key TEXT NOT NULL,
      audio_version TEXT NOT NULL,
      audio_path TEXT NOT NULL,
      audio_voice TEXT NOT NULL CHECK (audio_voice IN ('en-GB-SoniaNeural', 'eqb-british-teacher-v1')),
      source_stage TEXT NOT NULL CHECK (source_stage IN ('core', 'basic', 'recognition')),
      source_day INTEGER NOT NULL,
      source_order INTEGER NOT NULL,
      printed_page INTEGER NOT NULL,
      source_verification TEXT NOT NULL CHECK (source_verification IN ('page-checked', 'index-and-heading-reviewed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(program_id, source_order)
    );
    CREATE INDEX IF NOT EXISTS idx_vocabulary_entries_program_order
      ON vocabulary_entries(program_id, source_order);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_entries_program_visual
      ON vocabulary_entries(program_id, visual_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_entries_program_audio
      ON vocabulary_entries(program_id, audio_key);
  `)
  const vocabularyEntryColumns = new Set(
    db.prepare('PRAGMA table_info(vocabulary_entries)').all().map((column) => column.name),
  )
  const missingExamFrequency = !vocabularyEntryColumns.has('exam_frequency')
  const hasExampleCandidates = vocabularyEntryColumns.has('example_candidates_json')
  const vocabularyEntriesSql = String(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vocabulary_entries'").get()?.sql ?? '')
  const requiresEntryContractMigration = !vocabularyEntriesSql.includes('index-and-heading-reviewed')
    || !vocabularyEntriesSql.includes(FORMAL_AUDIO_VOICE)
  if (requiresEntryContractMigration) {
    db.exec('PRAGMA foreign_keys = OFF')
    try {
      db.exec('BEGIN')
      if (missingExamFrequency) {
        db.exec('ALTER TABLE vocabulary_entries ADD COLUMN exam_frequency INTEGER NOT NULL DEFAULT 0')
      }
      const legacyExampleCandidatesSelect = hasExampleCandidates ? 'example_candidates_json' : "'[]'"
      db.exec(`
        ALTER TABLE vocabulary_entries RENAME TO vocabulary_entries_legacy_contract;
        CREATE TABLE vocabulary_entries (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL REFERENCES vocabulary_programs(id) ON DELETE CASCADE,
        group_id TEXT NOT NULL REFERENCES vocabulary_groups(id) ON DELETE CASCADE,
        headword TEXT NOT NULL,
        phonetic TEXT NOT NULL,
        part_of_speech TEXT NOT NULL,
        source_meanings_json TEXT NOT NULL,
        teaching_sense TEXT NOT NULL,
        exam_frequency INTEGER NOT NULL DEFAULT 0,
        pronunciation_mode TEXT NOT NULL CHECK (pronunciation_mode IN ('syllables', 'forms')),
        syllables_json TEXT NOT NULL,
        example_english TEXT NOT NULL,
        example_chinese TEXT NOT NULL,
        example_highlight TEXT NOT NULL,
        example_review_status TEXT NOT NULL CHECK (example_review_status = 'approved'),
        example_candidates_json TEXT NOT NULL DEFAULT '[]',
        visual_key TEXT NOT NULL,
        visual_version TEXT NOT NULL,
        visual_path TEXT NOT NULL,
        visual_alt TEXT NOT NULL,
        audio_key TEXT NOT NULL,
        audio_version TEXT NOT NULL,
        audio_path TEXT NOT NULL,
        audio_voice TEXT NOT NULL CHECK (audio_voice IN ('en-GB-SoniaNeural', 'eqb-british-teacher-v1')),
        source_stage TEXT NOT NULL CHECK (source_stage IN ('core', 'basic', 'recognition')),
        source_day INTEGER NOT NULL,
        source_order INTEGER NOT NULL,
        printed_page INTEGER NOT NULL,
        source_verification TEXT NOT NULL CHECK (source_verification IN ('page-checked', 'index-and-heading-reviewed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(program_id, source_order)
      );
      INSERT INTO vocabulary_entries (
        id, program_id, group_id, headword, phonetic, part_of_speech, source_meanings_json,
        teaching_sense, exam_frequency, pronunciation_mode, syllables_json, example_english,
        example_chinese, example_highlight, example_review_status, example_candidates_json, visual_key, visual_version,
        visual_path, visual_alt, audio_key, audio_version, audio_path, audio_voice, source_stage,
        source_day, source_order, printed_page, source_verification, created_at, updated_at
      )
      SELECT
        id, program_id, group_id, headword, phonetic, part_of_speech, source_meanings_json,
        teaching_sense, exam_frequency, pronunciation_mode, syllables_json, example_english,
        example_chinese, example_highlight, example_review_status, ${legacyExampleCandidatesSelect}, visual_key, visual_version,
        visual_path, visual_alt, audio_key, audio_version, audio_path, audio_voice, source_stage,
        source_day, source_order, printed_page, source_verification, created_at, updated_at
      FROM vocabulary_entries_legacy_contract;
      DROP TABLE vocabulary_entries_legacy_contract;
      CREATE INDEX idx_vocabulary_entries_program_order ON vocabulary_entries(program_id, source_order);
      CREATE UNIQUE INDEX idx_vocabulary_entries_program_visual ON vocabulary_entries(program_id, visual_key);
      CREATE UNIQUE INDEX idx_vocabulary_entries_program_audio ON vocabulary_entries(program_id, audio_key);
        COMMIT;
      `)
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // SQLite may already have rolled the transaction back after a fatal error.
      }
      throw error
    } finally {
      db.exec('PRAGMA foreign_keys = ON')
    }
  } else if (missingExamFrequency) {
    db.exec('ALTER TABLE vocabulary_entries ADD COLUMN exam_frequency INTEGER NOT NULL DEFAULT 0')
  }
  const migratedEntryColumns = new Set(
    db.prepare('PRAGMA table_info(vocabulary_entries)').all().map((column) => column.name),
  )
  if (!migratedEntryColumns.has('example_candidates_json')) {
    db.exec("ALTER TABLE vocabulary_entries ADD COLUMN example_candidates_json TEXT NOT NULL DEFAULT '[]'")
  }
  const legacyExampleRows = db.prepare(`
    SELECT id, teaching_sense, example_english, example_chinese, example_highlight
    FROM vocabulary_entries
    WHERE example_candidates_json = '[]'
  `).all()
  const backfillCandidates = db.prepare('UPDATE vocabulary_entries SET example_candidates_json = ? WHERE id = ?')
  for (const row of legacyExampleRows) {
    backfillCandidates.run(JSON.stringify([legacyExampleCandidate({
      english: row.example_english,
      chinese: row.example_chinese,
      highlight: row.example_highlight,
    }, row.teaching_sense)]), row.id)
  }
}

export function ensureUserVocabularyShape(db) {
  const currentShapeSql = `
    CREATE TABLE IF NOT EXISTS vocabulary_students (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, id),
      UNIQUE(user_id, name_key)
    );
    CREATE INDEX IF NOT EXISTS idx_vocabulary_students_user
      ON vocabulary_students(user_id, created_at, id);
    CREATE TABLE IF NOT EXISTS vocabulary_review_progress (
      user_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      cursor INTEGER NOT NULL DEFAULT 0,
      last_target INTEGER NOT NULL DEFAULT 15 CHECK (last_target BETWEEN 1 AND 60),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, student_id, program_id),
      FOREIGN KEY(user_id, student_id) REFERENCES vocabulary_students(user_id, id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS vocabulary_review_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('main', 'temporary')),
      target_unfamiliar_count INTEGER NOT NULL CHECK (target_unfamiliar_count BETWEEN 1 AND 60),
      cursor INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('active', 'target_reached', 'program_exhausted', 'frozen')),
      temporary_stage TEXT,
      temporary_day INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id, student_id) REFERENCES vocabulary_students(user_id, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_vocabulary_review_runs_student
      ON vocabulary_review_runs(user_id, student_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS vocabulary_review_decisions (
      run_id TEXT NOT NULL REFERENCES vocabulary_review_runs(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      verdict TEXT NOT NULL CHECK (verdict IN ('known', 'unfamiliar')),
      decision_index INTEGER NOT NULL,
      decided_at TEXT NOT NULL,
      PRIMARY KEY(run_id, entry_id),
      UNIQUE(run_id, decision_index)
    );
    CREATE INDEX IF NOT EXISTS idx_vocabulary_review_decisions_run
      ON vocabulary_review_decisions(run_id, decision_index);
    CREATE TABLE IF NOT EXISTS vocabulary_sets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      review_run_id TEXT UNIQUE REFERENCES vocabulary_review_runs(id),
      title TEXT NOT NULL,
      entry_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id, student_id) REFERENCES vocabulary_students(user_id, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_vocabulary_sets_student
      ON vocabulary_sets(user_id, student_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS vocabulary_set_entries (
      set_id TEXT NOT NULL REFERENCES vocabulary_sets(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      PRIMARY KEY(set_id, order_index),
      UNIQUE(set_id, entry_id)
    );
    CREATE TABLE IF NOT EXISTS vocabulary_shares (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL UNIQUE REFERENCES vocabulary_sets(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      share_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vocabulary_shares_public
      ON vocabulary_shares(share_id, status);
  `

  const hasLegacyShape = Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'vocabulary_review_runs'
  `).get())
  if (!hasLegacyShape) {
    db.exec(currentShapeSql)
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_review_runs_open
        ON vocabulary_review_runs(user_id, student_id, program_id)
        WHERE status <> 'frozen';
    `)
    return
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS vocabulary_review_progress (
      user_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      cursor INTEGER NOT NULL DEFAULT 0,
      last_target INTEGER NOT NULL DEFAULT 15 CHECK (last_target BETWEEN 1 AND 60),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, program_id)
    );
    CREATE TABLE IF NOT EXISTS vocabulary_review_decisions (
      run_id TEXT NOT NULL REFERENCES vocabulary_review_runs(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      verdict TEXT NOT NULL CHECK (verdict IN ('known', 'unfamiliar')),
      decision_index INTEGER NOT NULL,
      decided_at TEXT NOT NULL,
      PRIMARY KEY(run_id, entry_id),
      UNIQUE(run_id, decision_index)
    );
  `)

  const progressColumns = new Set(db.prepare('PRAGMA table_info(vocabulary_review_progress)').all().map((column) => column.name))
  const runColumns = new Set(db.prepare('PRAGMA table_info(vocabulary_review_runs)').all().map((column) => column.name))
  const setColumns = new Set(db.prepare('PRAGMA table_info(vocabulary_sets)').all().map((column) => column.name))
  const requiresStudentMigration = !progressColumns.has('student_id')
    || !runColumns.has('student_id')
    || !setColumns.has('student_id')

  if (requiresStudentMigration) {
    db.exec('PRAGMA foreign_keys = OFF')
    try {
      db.exec('BEGIN')
      db.exec(`
        ALTER TABLE vocabulary_shares RENAME TO vocabulary_shares_legacy_students;
        ALTER TABLE vocabulary_set_entries RENAME TO vocabulary_set_entries_legacy_students;
        ALTER TABLE vocabulary_sets RENAME TO vocabulary_sets_legacy_students;
        ALTER TABLE vocabulary_review_decisions RENAME TO vocabulary_review_decisions_legacy_students;
        ALTER TABLE vocabulary_review_runs RENAME TO vocabulary_review_runs_legacy_students;
        ALTER TABLE vocabulary_review_progress RENAME TO vocabulary_review_progress_legacy_students;

        CREATE TABLE vocabulary_students (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          name_key TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, id),
          UNIQUE(user_id, name_key)
        );
        CREATE TABLE vocabulary_review_progress (
          user_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          program_id TEXT NOT NULL,
          cursor INTEGER NOT NULL DEFAULT 0,
          last_target INTEGER NOT NULL DEFAULT 15 CHECK (last_target BETWEEN 1 AND 60),
          updated_at TEXT NOT NULL,
          PRIMARY KEY(user_id, student_id, program_id),
          FOREIGN KEY(user_id, student_id) REFERENCES vocabulary_students(user_id, id) ON DELETE CASCADE
        );
        CREATE TABLE vocabulary_review_runs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          program_id TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('main', 'temporary')),
          target_unfamiliar_count INTEGER NOT NULL CHECK (target_unfamiliar_count BETWEEN 1 AND 60),
          cursor INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK (status IN ('active', 'target_reached', 'program_exhausted', 'frozen')),
          temporary_stage TEXT,
          temporary_day INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(user_id, student_id) REFERENCES vocabulary_students(user_id, id) ON DELETE CASCADE
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
          student_id TEXT NOT NULL,
          program_id TEXT NOT NULL,
          review_run_id TEXT UNIQUE REFERENCES vocabulary_review_runs(id),
          title TEXT NOT NULL,
          entry_count INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(user_id, student_id) REFERENCES vocabulary_students(user_id, id) ON DELETE CASCADE
        );
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
          status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
          created_at TEXT NOT NULL,
          revoked_at TEXT
        );

        INSERT INTO vocabulary_students (id, user_id, display_name, name_key, created_at, updated_at)
        SELECT '${DEFAULT_STUDENT_ID_PREFIX}' || user_id, user_id, '${DEFAULT_STUDENT_NAME}', '${DEFAULT_STUDENT_NAME}',
          MIN(created_at), MAX(updated_at)
        FROM (
          SELECT user_id, updated_at AS created_at, updated_at FROM vocabulary_review_progress_legacy_students
          UNION ALL
          SELECT user_id, created_at, updated_at FROM vocabulary_review_runs_legacy_students
          UNION ALL
          SELECT user_id, created_at, created_at AS updated_at FROM vocabulary_sets_legacy_students
        )
        GROUP BY user_id;
        INSERT INTO vocabulary_review_progress
          (user_id, student_id, program_id, cursor, last_target, updated_at)
        SELECT user_id, '${DEFAULT_STUDENT_ID_PREFIX}' || user_id, program_id, cursor, last_target, updated_at
        FROM vocabulary_review_progress_legacy_students;
        INSERT INTO vocabulary_review_runs
          (id, user_id, student_id, program_id, mode, target_unfamiliar_count, cursor, status,
           temporary_stage, temporary_day, created_at, updated_at)
        SELECT id, user_id, '${DEFAULT_STUDENT_ID_PREFIX}' || user_id, program_id, mode,
          target_unfamiliar_count, cursor, status, temporary_stage, temporary_day, created_at, updated_at
        FROM vocabulary_review_runs_legacy_students;
        DELETE FROM vocabulary_review_decisions_legacy_students
        WHERE run_id IN (
          SELECT older.id FROM vocabulary_review_runs AS older
          WHERE older.status <> 'frozen'
            AND EXISTS (
              SELECT 1 FROM vocabulary_review_runs AS newer
              WHERE newer.user_id = older.user_id
                AND newer.student_id = older.student_id
                AND newer.program_id = older.program_id
                AND newer.status <> 'frozen'
                AND (newer.updated_at > older.updated_at OR (newer.updated_at = older.updated_at AND newer.id > older.id))
            )
        );
        DELETE FROM vocabulary_review_runs AS older
        WHERE older.status <> 'frozen'
          AND EXISTS (
            SELECT 1 FROM vocabulary_review_runs AS newer
            WHERE newer.user_id = older.user_id
              AND newer.student_id = older.student_id
              AND newer.program_id = older.program_id
              AND newer.status <> 'frozen'
              AND (newer.updated_at > older.updated_at OR (newer.updated_at = older.updated_at AND newer.id > older.id))
          );
        INSERT INTO vocabulary_review_decisions
          SELECT * FROM vocabulary_review_decisions_legacy_students;
        INSERT INTO vocabulary_sets
          (id, user_id, student_id, program_id, review_run_id, title, entry_count, created_at)
        SELECT id, user_id, '${DEFAULT_STUDENT_ID_PREFIX}' || user_id, program_id, review_run_id,
          title, entry_count, created_at
        FROM vocabulary_sets_legacy_students;
        INSERT INTO vocabulary_set_entries
          SELECT * FROM vocabulary_set_entries_legacy_students;
        INSERT INTO vocabulary_shares
          SELECT * FROM vocabulary_shares_legacy_students;

        DROP TABLE vocabulary_shares_legacy_students;
        DROP TABLE vocabulary_set_entries_legacy_students;
        DROP TABLE vocabulary_sets_legacy_students;
        DROP TABLE vocabulary_review_decisions_legacy_students;
        DROP TABLE vocabulary_review_runs_legacy_students;
        DROP TABLE vocabulary_review_progress_legacy_students;

        CREATE INDEX idx_vocabulary_students_user ON vocabulary_students(user_id, created_at, id);
        CREATE INDEX idx_vocabulary_review_runs_student ON vocabulary_review_runs(user_id, student_id, updated_at DESC);
        CREATE UNIQUE INDEX idx_vocabulary_review_runs_open
          ON vocabulary_review_runs(user_id, student_id, program_id)
          WHERE status <> 'frozen';
        CREATE INDEX idx_vocabulary_review_decisions_run ON vocabulary_review_decisions(run_id, decision_index);
        CREATE INDEX idx_vocabulary_sets_student ON vocabulary_sets(user_id, student_id, created_at DESC);
        CREATE INDEX idx_vocabulary_shares_public ON vocabulary_shares(share_id, status);
      `)
      const foreignKeyErrors = db.prepare('PRAGMA foreign_key_check').all()
      if (foreignKeyErrors.length) throw new Error('学生档案迁移后的外键校验失败。')
      db.exec('COMMIT')
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // SQLite may already have rolled the transaction back after a fatal error.
      }
      throw error
    } finally {
      db.exec('PRAGMA foreign_keys = ON')
    }
    return
  }

  db.exec(currentShapeSql)
  const hasOpenRunIndex = db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_vocabulary_review_runs_open'
  `).get()
  if (!hasOpenRunIndex) {
    db.exec(`
      BEGIN IMMEDIATE;
      DELETE FROM vocabulary_review_runs AS older
      WHERE older.status <> 'frozen'
        AND EXISTS (
          SELECT 1 FROM vocabulary_review_runs AS newer
          WHERE newer.user_id = older.user_id
            AND newer.student_id = older.student_id
            AND newer.program_id = older.program_id
            AND newer.status <> 'frozen'
            AND (newer.updated_at > older.updated_at OR (newer.updated_at = older.updated_at AND newer.id > older.id))
        );
      CREATE UNIQUE INDEX idx_vocabulary_review_runs_open
        ON vocabulary_review_runs(user_id, student_id, program_id)
        WHERE status <> 'frozen';
      COMMIT;
    `)
  }
  const reviewRunColumn = db.prepare('PRAGMA table_info(vocabulary_sets)').all()
    .find((column) => column.name === 'review_run_id')
  if (reviewRunColumn?.notnull === 1) {
    db.exec('PRAGMA foreign_keys = OFF')
    try {
      db.exec(`
        BEGIN;
        ALTER TABLE vocabulary_shares RENAME TO vocabulary_shares_legacy_required_run;
        ALTER TABLE vocabulary_set_entries RENAME TO vocabulary_set_entries_legacy_required_run;
        ALTER TABLE vocabulary_sets RENAME TO vocabulary_sets_legacy_required_run;
        CREATE TABLE vocabulary_sets (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          program_id TEXT NOT NULL,
          review_run_id TEXT UNIQUE REFERENCES vocabulary_review_runs(id),
          title TEXT NOT NULL,
          entry_count INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(user_id, student_id) REFERENCES vocabulary_students(user_id, id) ON DELETE CASCADE
        );
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
          status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
          created_at TEXT NOT NULL,
          revoked_at TEXT
        );
        INSERT INTO vocabulary_sets
          SELECT * FROM vocabulary_sets_legacy_required_run;
        INSERT INTO vocabulary_set_entries
          SELECT * FROM vocabulary_set_entries_legacy_required_run;
        INSERT INTO vocabulary_shares
          SELECT * FROM vocabulary_shares_legacy_required_run;
        DROP TABLE vocabulary_shares_legacy_required_run;
        DROP TABLE vocabulary_set_entries_legacy_required_run;
        DROP TABLE vocabulary_sets_legacy_required_run;
        CREATE INDEX idx_vocabulary_sets_student
          ON vocabulary_sets(user_id, student_id, created_at DESC);
        CREATE INDEX idx_vocabulary_shares_public
          ON vocabulary_shares(share_id, status);
        COMMIT;
      `)
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // SQLite may already have rolled the transaction back after a fatal error.
      }
      throw error
    } finally {
      db.exec('PRAGMA foreign_keys = ON')
    }
  }
}

function normalizeProgramEntry(entry, program) {
  const source = entry.source ?? {}
  const example = entry.example ?? entry.learning?.example ?? {}
  const pronunciation = entry.pronunciation ?? entry.learning?.pronunciationGuide ?? {}
  const visual = entry.visual ?? {}
  const audio = entry.audio ?? {}
  const syllables = entry.syllables ?? pronunciation.parts?.map((part) => part.spelling) ?? []
  const pronunciationMode = entry.pronunciationMode ?? pronunciation.mode
  const teachingSense = requireNonEmpty(entry.teachingSense, 'teachingSense')
  const fallbackExample = {
    english: requireNonEmpty(example.english, 'example.english'),
    chinese: requireNonEmpty(example.chinese, 'example.chinese'),
    highlight: requireNonEmpty(example.highlight, 'example.highlight'),
  }
  const exampleCandidates = normalizeExampleCandidates(entry.exampleCandidates, fallbackExample, teachingSense)
  if (!Array.isArray(syllables) || syllables.length === 0) {
    throw new VocabularyStoreError(`${entry.id || entry.headword} 缺少音节或词形拆分。`)
  }
  return {
    id: requireNonEmpty(entry.id, 'Entry id'),
    programId: program.id,
    groupId: requireNonEmpty(entry.groupId ?? source.groupId, 'Vocabulary Group id'),
    headword: requireNonEmpty(entry.headword, 'headword'),
    phonetic: requireNonEmpty(entry.phonetic, 'phonetic'),
    partOfSpeech: requireNonEmpty(entry.partOfSpeech, 'partOfSpeech'),
    sourceMeanings: Array.isArray(entry.sourceMeanings) ? entry.sourceMeanings : [],
    teachingSense,
    examFrequency: Number.isInteger(Number(entry.examFrequency)) ? Number(entry.examFrequency) : 0,
    pronunciationMode: requireNonEmpty(pronunciationMode, 'pronunciationMode'),
    syllables,
    exampleEnglish: fallbackExample.english,
    exampleChinese: fallbackExample.chinese,
    exampleHighlight: fallbackExample.highlight,
    exampleReviewStatus: example.reviewStatus ?? 'approved',
    exampleCandidates,
    visualKey: requireNonEmpty(visual.key ?? entry.visualKey, 'visual.key'),
    visualVersion: requireNonEmpty(visual.version, 'visual.version'),
    visualPath: requireNonEmpty(visual.path ?? visual.src, 'visual.path'),
    visualAlt: requireNonEmpty(visual.alt, 'visual.alt'),
    audioKey: requireNonEmpty(audio.key, 'audio.key'),
    audioVersion: requireNonEmpty(audio.version, 'audio.version'),
    audioPath: requireNonEmpty(audio.path, 'audio.path'),
    audioVoice: audio.voice ?? FORMAL_AUDIO_VOICE,
    sourceStage: source.stage,
    sourceDay: Number(source.day ?? source.group),
    sourceOrder: Number(source.sourceOrder ?? source.globalOrder),
    printedPage: Number(source.printedPage),
    sourceVerification: source.verification,
  }
}

export function replaceVocabularyProgram(db, input) {
  ensureSharedVocabularyShape(db)
  const program = {
    id: requireNonEmpty(input?.id, 'Program id'),
    version: requireNonEmpty(input?.version, 'Program version'),
    title: requireNonEmpty(input?.title, 'Program title'),
    subtitle: String(input?.subtitle ?? ''),
    sourceTitle: requireNonEmpty(input?.sourceTitle, 'sourceTitle'),
    sourceEdition: String(input?.sourceEdition ?? ''),
    totalPlannedEntries: Number(input?.totalPlannedEntries),
  }
  if (!Number.isInteger(program.totalPlannedEntries) || program.totalPlannedEntries < 1) {
    throw new VocabularyStoreError('totalPlannedEntries 必须是正整数。')
  }
  const groups = Array.isArray(input.groups) ? input.groups : []
  const entries = (Array.isArray(input.entries) ? input.entries : []).map((entry) => normalizeProgramEntry(entry, program))
  const groupIds = new Set(groups.map((group) => group.id))
  if (!groups.length || entries.some((entry) => !groupIds.has(entry.groupId))) {
    throw new VocabularyStoreError('Vocabulary Entry 必须引用同一 Program 内的 Vocabulary Group。')
  }

  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM vocabulary_programs WHERE id = ?').run(program.id)
    db.prepare(`
      INSERT INTO vocabulary_programs
        (id, version, title, subtitle, source_title, source_edition, total_planned_entries, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(program.id, program.version, program.title, program.subtitle, program.sourceTitle, program.sourceEdition, program.totalPlannedEntries, nowIso())
    const insertGroup = db.prepare(`
      INSERT INTO vocabulary_groups
        (id, program_id, stage, week, group_number, source_label, start_order, end_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const group of groups) {
      insertGroup.run(
        requireNonEmpty(group.id, 'Group id'),
        program.id,
        group.stage,
        Number(group.week),
        Number(group.group ?? group.groupNumber),
        requireNonEmpty(group.sourceLabel, 'sourceLabel'),
        Number(group.startOrder),
        Number(group.endOrder),
      )
    }
    const insertEntry = db.prepare(`
      INSERT INTO vocabulary_entries (
        id, program_id, group_id, headword, phonetic, part_of_speech,
        source_meanings_json, teaching_sense, exam_frequency, pronunciation_mode, syllables_json,
        example_english, example_chinese, example_highlight, example_review_status, example_candidates_json,
        visual_key, visual_version, visual_path, visual_alt,
        audio_key, audio_version, audio_path, audio_voice,
        source_stage, source_day, source_order, printed_page, source_verification, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const entry of entries) {
      insertEntry.run(
        entry.id, entry.programId, entry.groupId, entry.headword, entry.phonetic, entry.partOfSpeech,
        JSON.stringify(entry.sourceMeanings), entry.teachingSense, entry.examFrequency, entry.pronunciationMode, JSON.stringify(entry.syllables),
        entry.exampleEnglish, entry.exampleChinese, entry.exampleHighlight, entry.exampleReviewStatus, JSON.stringify(entry.exampleCandidates),
        entry.visualKey, entry.visualVersion, entry.visualPath, entry.visualAlt,
        entry.audioKey, entry.audioVersion, entry.audioPath, entry.audioVoice,
        entry.sourceStage, entry.sourceDay, entry.sourceOrder, entry.printedPage, entry.sourceVerification, nowIso(),
      )
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { programId: program.id, groupCount: groups.length, entryCount: entries.length }
}

function rowToEntry(row, sourceTitle, sourceEdition, includeExampleCandidates = false) {
  const projected = applyAmericanVocabularyPhonetics({
    id: row.id,
    headword: row.headword,
    phonetic: row.phonetic,
    partOfSpeech: row.part_of_speech,
    sourceMeanings: parseJson(row.source_meanings_json, []),
    teachingSense: row.teaching_sense,
    examFrequency: row.exam_frequency,
    pronunciationMode: row.pronunciation_mode,
    syllables: parseJson(row.syllables_json, []),
    example: {
      english: row.example_english,
      chinese: row.example_chinese,
      highlight: row.example_highlight,
      reviewStatus: row.example_review_status,
    },
    visual: {
      key: row.visual_key,
      version: row.visual_version,
      path: row.visual_path,
      alt: row.visual_alt,
    },
    audio: {
      key: row.audio_key,
      version: row.audio_version,
      path: row.audio_path,
      voice: row.audio_voice,
    },
    source: {
      title: sourceTitle,
      edition: sourceEdition,
      stage: row.source_stage,
      day: row.source_day,
      sourceOrder: row.source_order,
      printedPage: row.printed_page,
      verification: row.source_verification,
    },
  })
  const entry = {
    ...projected,
    phonetics: {
      american: projected.phonetic,
      british: row.phonetic,
    },
  }
  if (includeExampleCandidates) {
    entry.exampleCandidates = normalizeExampleCandidates(
      parseJson(row.example_candidates_json, []),
      projected.example,
      projected.teachingSense,
    )
  }
  return entry
}

export function getVocabularyProgram(db, programId, { includeExampleCandidates = false } = {}) {
  const row = db.prepare('SELECT * FROM vocabulary_programs WHERE id = ?').get(programId)
  if (!row) return null
  const groups = db.prepare(`
    SELECT id, stage, week, group_number, source_label, start_order, end_order
    FROM vocabulary_groups WHERE program_id = ? ORDER BY start_order
  `).all(programId).map((group) => ({
    id: group.id,
    stage: group.stage,
    week: group.week,
    group: group.group_number,
    sourceLabel: group.source_label,
    startOrder: group.start_order,
    endOrder: group.end_order,
  }))
  const entries = db.prepare('SELECT * FROM vocabulary_entries WHERE program_id = ? ORDER BY source_order')
    .all(programId)
    .map((entry) => rowToEntry(entry, row.source_title, row.source_edition, includeExampleCandidates))
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    subtitle: row.subtitle,
    sourceTitle: row.source_title,
    sourceEdition: row.source_edition,
    totalPlannedEntries: row.total_planned_entries,
    groups,
    entries,
  }
}

function getOwnedRun(userDb, userId, runId) {
  const run = userDb.prepare('SELECT * FROM vocabulary_review_runs WHERE id = ? AND user_id = ?').get(runId, userId)
  if (!run) throw new VocabularyStoreError('过词轮次不存在。', 404, 'review_run_not_found')
  return run
}

function serializeStudent(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    isDefault: row.id === defaultStudentId(row.user_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function ensureDefaultVocabularyStudent(userDb, userId) {
  const existing = userDb.prepare(`
    SELECT id FROM vocabulary_students WHERE user_id = ? ORDER BY created_at, id LIMIT 1
  `).get(userId)
  if (existing) return
  const timestamp = nowIso()
  userDb.prepare(`
    INSERT INTO vocabulary_students (id, user_id, display_name, name_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(defaultStudentId(userId), userId, DEFAULT_STUDENT_NAME, DEFAULT_STUDENT_NAME, timestamp, timestamp)
}

function requireOwnedVocabularyStudent(userDb, userId, studentId) {
  const normalizedStudentId = requireNonEmpty(studentId, '学生档案')
  const row = userDb.prepare(`
    SELECT * FROM vocabulary_students WHERE id = ? AND user_id = ?
  `).get(normalizedStudentId, userId)
  if (!row) throw new VocabularyStoreError('学生档案不存在。', 404, 'vocabulary_student_not_found')
  return row
}

export function listVocabularyStudents(userDb, userId) {
  ensureUserVocabularyShape(userDb)
  ensureDefaultVocabularyStudent(userDb, userId)
  return userDb.prepare(`
    SELECT * FROM vocabulary_students WHERE user_id = ? ORDER BY created_at, id
  `).all(userId).map(serializeStudent)
}

export function createVocabularyStudent(userDb, userId, input = {}) {
  ensureUserVocabularyShape(userDb)
  ensureDefaultVocabularyStudent(userDb, userId)
  const { displayName, nameKey } = normalizeStudentName(input.displayName)
  if (userDb.prepare('SELECT 1 FROM vocabulary_students WHERE user_id = ? AND name_key = ?').get(userId, nameKey)) {
    throw new VocabularyStoreError('已经有同名学生了。', 409, 'vocabulary_student_name_exists')
  }
  const timestamp = nowIso()
  const id = `vocabulary-student-${randomUUID()}`
  try {
    userDb.prepare(`
      INSERT INTO vocabulary_students (id, user_id, display_name, name_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, displayName, nameKey, timestamp, timestamp)
  } catch (error) {
    if (String(error?.message ?? error).includes('UNIQUE constraint failed: vocabulary_students.user_id, vocabulary_students.name_key')) {
      throw new VocabularyStoreError('已经有同名学生了。', 409, 'vocabulary_student_name_exists')
    }
    throw error
  }
  return serializeStudent(requireOwnedVocabularyStudent(userDb, userId, id))
}

function serializeRun(userDb, run) {
  const decisions = userDb.prepare(`
    SELECT entry_id, verdict, decision_index FROM vocabulary_review_decisions
    WHERE run_id = ? ORDER BY decision_index
  `).all(run.id)
  return {
    id: run.id,
    studentId: run.student_id,
    programId: run.program_id,
    mode: run.mode,
    targetUnfamiliarCount: run.target_unfamiliar_count,
    cursor: run.cursor,
    status: run.status,
    temporaryStage: run.temporary_stage,
    temporaryDay: run.temporary_day,
    decisions: Object.fromEntries(decisions.map((decision) => [decision.entry_id, decision.verdict])),
    decisionOrder: decisions.map((decision) => decision.entry_id),
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  }
}

export function getVocabularyProgress(userDb, userId, studentId, programId) {
  ensureUserVocabularyShape(userDb)
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const row = userDb.prepare(`
    SELECT cursor, last_target, updated_at FROM vocabulary_review_progress
    WHERE user_id = ? AND student_id = ? AND program_id = ?
  `).get(userId, studentId, programId)
  return row
    ? { studentId, programId, cursor: row.cursor, lastTarget: row.last_target, updatedAt: row.updated_at }
    : { studentId, programId, cursor: 0, lastTarget: 15, updatedAt: null }
}

export function createVocabularyReviewRun({ userDb, bankDb }, userId, input) {
  ensureUserVocabularyShape(userDb)
  ensureSharedVocabularyShape(bankDb)
  const studentId = requireNonEmpty(input?.studentId, '学生档案')
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const programId = requireNonEmpty(input?.programId, 'programId')
  const program = bankDb.prepare('SELECT id, total_planned_entries FROM vocabulary_programs WHERE id = ?').get(programId)
  if (!program) throw new VocabularyStoreError('词汇课程不存在。', 404, 'program_not_found')
  const existing = getCurrentVocabularyReviewRun(userDb, userId, studentId, programId)
  if (existing) return existing
  const mode = input?.mode === 'temporary' ? 'temporary' : 'main'
  const progress = getVocabularyProgress(userDb, userId, studentId, programId)
  const target = normalizeTarget(input?.targetUnfamiliarCount, progress.lastTarget)
  const temporaryStage = mode === 'temporary' && input?.temporaryStage ? String(input.temporaryStage) : null
  const temporaryDay = mode === 'temporary' && input?.temporaryDay != null ? Number(input.temporaryDay) : null
  if (temporaryStage && !['core', 'basic', 'recognition'].includes(temporaryStage)) {
    throw new VocabularyStoreError('临时过词阶段无效。')
  }
  if (temporaryDay != null && (!Number.isInteger(temporaryDay) || temporaryDay < 1)) {
    throw new VocabularyStoreError('临时过词 Day 必须是正整数。')
  }
  let cursor = Math.min(progress.cursor, program.total_planned_entries)
  if (mode === 'temporary') {
    const conditions = ['program_id = ?']
    const values = [programId]
    if (temporaryStage) {
      conditions.push('source_stage = ?')
      values.push(temporaryStage)
    }
    if (temporaryDay != null) {
      conditions.push('source_day = ?')
      values.push(temporaryDay)
    }
    const first = bankDb.prepare(`
      SELECT MIN(source_order) AS source_order FROM vocabulary_entries
      WHERE ${conditions.join(' AND ')}
    `).get(...values)
    if (!first?.source_order) throw new VocabularyStoreError('临时范围内没有词条。', 404, 'temporary_vocabulary_scope_empty')
    cursor = first.source_order - 1
  }
  const id = `vocabulary-run-${randomUUID()}`
  const timestamp = nowIso()
  userDb.prepare(`
    INSERT INTO vocabulary_review_runs
      (id, user_id, student_id, program_id, mode, target_unfamiliar_count, cursor, status, temporary_stage, temporary_day, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `).run(id, userId, studentId, programId, mode, target, cursor, temporaryStage, temporaryDay, timestamp, timestamp)
  if (mode === 'main') {
    userDb.prepare(`
      INSERT INTO vocabulary_review_progress (user_id, student_id, program_id, cursor, last_target, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, student_id, program_id) DO UPDATE SET last_target = excluded.last_target, updated_at = excluded.updated_at
    `).run(userId, studentId, programId, cursor, target, timestamp)
  }
  return serializeRun(userDb, getOwnedRun(userDb, userId, id))
}

export function getVocabularyReviewRun(userDb, userId, runId) {
  ensureUserVocabularyShape(userDb)
  return serializeRun(userDb, getOwnedRun(userDb, userId, runId))
}

export function discardVocabularyReviewRun(userDb, userId, runId) {
  ensureUserVocabularyShape(userDb)
  const run = getOwnedRun(userDb, userId, runId)
  if (run.status === 'frozen') {
    throw new VocabularyStoreError('已生成词表的轮次不能丢弃。', 409, 'review_run_frozen')
  }
  userDb.prepare('DELETE FROM vocabulary_review_runs WHERE id = ? AND user_id = ?').run(run.id, userId)
  return { ok: true }
}

export function getCurrentVocabularyReviewRun(userDb, userId, studentId, programId) {
  ensureUserVocabularyShape(userDb)
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const normalizedProgramId = requireNonEmpty(programId, 'programId')
  const run = userDb.prepare(`
    SELECT * FROM vocabulary_review_runs
    WHERE user_id = ? AND student_id = ? AND program_id = ? AND status <> 'frozen'
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get(userId, studentId, normalizedProgramId)
  return run ? serializeRun(userDb, run) : null
}

function computeRunStatus(userDb, bankDb, run, nextCursor) {
  const unfamiliarCount = userDb.prepare(`
    SELECT COUNT(*) AS count FROM vocabulary_review_decisions WHERE run_id = ? AND verdict = 'unfamiliar'
  `).get(run.id).count
  if (unfamiliarCount >= run.target_unfamiliar_count) return 'target_reached'
  const conditions = ['program_id = ?', 'source_order > ?']
  const values = [run.program_id, nextCursor]
  const remaining = bankDb.prepare(`
    SELECT 1 FROM vocabulary_entries WHERE ${conditions.join(' AND ')} LIMIT 1
  `).get(...values)
  if (!remaining) return 'program_exhausted'
  return 'active'
}

export function decideVocabularyReviewEntry({ userDb, bankDb }, userId, runId, input) {
  ensureUserVocabularyShape(userDb)
  const run = getOwnedRun(userDb, userId, runId)
  if (!ACTIVE_RUN_STATUSES.has(run.status) || run.status !== 'active') {
    throw new VocabularyStoreError('这次过词已经结束。', 409, 'review_run_complete')
  }
  const entryId = requireNonEmpty(input?.entryId, 'entryId')
  const verdict = input?.verdict
  if (verdict !== 'known' && verdict !== 'unfamiliar') {
    throw new VocabularyStoreError('过词判断必须是 known 或 unfamiliar。')
  }
  const scopeConditions = ['program_id = ?', 'source_order > ?']
  const scopeValues = [run.program_id, run.cursor]
  const entry = bankDb.prepare(`
    SELECT id, source_order FROM vocabulary_entries
    WHERE ${scopeConditions.join(' AND ')} ORDER BY source_order LIMIT 1
  `).get(...scopeValues)
  if (!entry) throw new VocabularyStoreError('词条不属于当前词汇课程。', 404, 'entry_not_found')
  if (entry.id !== entryId) {
    throw new VocabularyStoreError('只能判断当前词条。', 409, 'review_cursor_mismatch')
  }
  const nextDecisionIndex = Number(userDb.prepare(`
    SELECT COALESCE(MAX(decision_index), -1) + 1 AS value FROM vocabulary_review_decisions WHERE run_id = ?
  `).get(run.id).value)
  const timestamp = nowIso()
  userDb.exec('BEGIN')
  try {
    userDb.prepare(`
      INSERT INTO vocabulary_review_decisions (run_id, entry_id, verdict, decision_index, decided_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(run_id, entry_id) DO UPDATE SET
        verdict = excluded.verdict,
        decision_index = excluded.decision_index,
        decided_at = excluded.decided_at
    `).run(run.id, entry.id, verdict, nextDecisionIndex, timestamp)
    const nextCursor = entry.source_order
    const status = computeRunStatus(userDb, bankDb, run, nextCursor)
    userDb.prepare('UPDATE vocabulary_review_runs SET cursor = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(nextCursor, status, timestamp, run.id)
    if (run.mode === 'main') {
      userDb.prepare(`
        INSERT INTO vocabulary_review_progress (user_id, student_id, program_id, cursor, last_target, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, student_id, program_id) DO UPDATE SET cursor = excluded.cursor, last_target = excluded.last_target, updated_at = excluded.updated_at
      `).run(userId, run.student_id, run.program_id, nextCursor, run.target_unfamiliar_count, timestamp)
    }
    userDb.exec('COMMIT')
  } catch (error) {
    userDb.exec('ROLLBACK')
    throw error
  }
  return serializeRun(userDb, getOwnedRun(userDb, userId, run.id))
}

export function undoVocabularyReviewDecision({ userDb, bankDb }, userId, runId) {
  ensureUserVocabularyShape(userDb)
  const run = getOwnedRun(userDb, userId, runId)
  if (run.status === 'frozen') throw new VocabularyStoreError('已生成生词集，不能撤销。', 409, 'review_run_frozen')
  const latest = userDb.prepare(`
    SELECT entry_id, decision_index FROM vocabulary_review_decisions
    WHERE run_id = ? ORDER BY decision_index DESC LIMIT 1
  `).get(run.id)
  if (!latest) return serializeRun(userDb, run)
  const timestamp = nowIso()
  userDb.exec('BEGIN')
  try {
    userDb.prepare('DELETE FROM vocabulary_review_decisions WHERE run_id = ? AND entry_id = ?').run(run.id, latest.entry_id)
    const latestEntry = bankDb.prepare('SELECT source_order FROM vocabulary_entries WHERE id = ? AND program_id = ?')
      .get(latest.entry_id, run.program_id)
    if (!latestEntry) throw new VocabularyStoreError('撤销的词条已不存在。', 409, 'vocabulary_entry_drift')
    const cursor = Math.max(0, latestEntry.source_order - 1)
    userDb.prepare("UPDATE vocabulary_review_runs SET cursor = ?, status = 'active', updated_at = ? WHERE id = ?")
      .run(cursor, timestamp, run.id)
    if (run.mode === 'main') {
      userDb.prepare(`
        UPDATE vocabulary_review_progress SET cursor = ?, updated_at = ?
        WHERE user_id = ? AND student_id = ? AND program_id = ?
      `).run(cursor, timestamp, userId, run.student_id, run.program_id)
    }
    userDb.exec('COMMIT')
  } catch (error) {
    userDb.exec('ROLLBACK')
    throw error
  }
  return serializeRun(userDb, getOwnedRun(userDb, userId, run.id))
}

export function selectVocabularyExampleCandidate(entry, setId) {
  const candidates = normalizeExampleCandidates(entry.exampleCandidates, entry.example, entry.teachingSense)
  const selectionVersion = candidates[0]?.version ?? EXAMPLE_CANDIDATE_VERSION
  const digestHex = createHash('sha256')
    .update(`${selectionVersion}\0${setId}\0${entry.id}`)
    .digest('hex')
  const selected = candidates[Number(BigInt(`0x${digestHex}`) % BigInt(candidates.length))]
  return {
    example: {
      english: selected.english,
      chinese: selected.chinese,
      highlight: selected.highlight,
      reviewStatus: 'approved',
    },
    exampleSelection: {
      candidateId: selected.candidateId,
      version: selected.version,
    },
  }
}

function snapshotEntry(entry, setId) {
  const selectedExample = selectVocabularyExampleCandidate(entry, setId)
  return {
    id: entry.id,
    headword: entry.headword,
    phonetic: entry.phonetic,
    phonetics: entry.phonetics,
    partOfSpeech: entry.partOfSpeech,
    sourceMeanings: entry.sourceMeanings,
    teachingSense: entry.teachingSense,
    pronunciationMode: entry.pronunciationMode,
    syllables: entry.syllables,
    pronunciationParts: entry.pronunciationParts,
    example: selectedExample.example,
    exampleSelection: selectedExample.exampleSelection,
    visual: entry.visual,
    audio: entry.audio,
  }
}

function readVocabularySetRows(userDb, userId, setId) {
  const set = userDb.prepare('SELECT * FROM vocabulary_sets WHERE id = ? AND user_id = ?').get(setId, userId)
  if (!set) throw new VocabularyStoreError('生词集不存在。', 404, 'vocabulary_set_not_found')
  const rows = userDb.prepare(`
    SELECT entry_id, order_index, snapshot_json FROM vocabulary_set_entries WHERE set_id = ? ORDER BY order_index
  `).all(set.id)
  if (rows.length !== set.entry_count) {
    throw new VocabularyStoreError('这份生词集的冻结快照不完整。', 500, 'vocabulary_set_snapshot_invalid')
  }
  const entries = rows.map((row, index) => {
    const entry = projectFrozenVocabularyEntry(parseJson(row.snapshot_json, null))
    if (row.order_index !== index || entry.id !== row.entry_id) {
      throw new VocabularyStoreError('这份生词集的冻结快照已损坏。', 500, 'vocabulary_set_snapshot_invalid')
    }
    return entry
  })
  const share = userDb.prepare('SELECT share_id, status, created_at, revoked_at FROM vocabulary_shares WHERE set_id = ?').get(set.id)
  return {
    id: set.id,
    studentId: set.student_id,
    programId: set.program_id,
    reviewRunId: set.review_run_id,
    title: set.title,
    entryCount: set.entry_count,
    entries,
    share: share ? { shareId: share.share_id, status: share.status, createdAt: share.created_at, revokedAt: share.revoked_at } : null,
    createdAt: set.created_at,
  }
}

export function freezeVocabularySet({ userDb, bankDb }, userId, runId, input = {}) {
  ensureUserVocabularyShape(userDb)
  const run = getOwnedRun(userDb, userId, runId)
  const existing = userDb.prepare('SELECT id FROM vocabulary_sets WHERE review_run_id = ? AND user_id = ?').get(run.id, userId)
  if (existing) return readVocabularySetRows(userDb, userId, existing.id)
  if (run.status !== 'target_reached' && run.status !== 'program_exhausted') {
    throw new VocabularyStoreError('达到收词目标或过完整个课程后才能生成生词集。', 409, 'review_run_not_ready')
  }
  const decisions = userDb.prepare(`
    SELECT entry_id FROM vocabulary_review_decisions
    WHERE run_id = ? AND verdict = 'unfamiliar' ORDER BY decision_index
  `).all(run.id)
  if (!decisions.length) throw new VocabularyStoreError('本轮没有可生成的生词。', 409, 'empty_vocabulary_set')
  const program = getVocabularyProgram(bankDb, run.program_id, { includeExampleCandidates: true })
  if (!program) throw new VocabularyStoreError('词汇课程不存在。', 404, 'program_not_found')
  const entriesById = new Map(program.entries.map((entry) => [entry.id, entry]))
  const id = `vocabulary-set-${randomUUID()}`
  const snapshots = decisions.map(({ entry_id: entryId }) => {
    const entry = entriesById.get(entryId)
    if (!entry) throw new VocabularyStoreError('生词集引用了不存在的词条。', 409, 'vocabulary_entry_drift')
    return snapshotEntry(entry, id)
  })
  const timestamp = nowIso()
  const title = input?.title == null || String(input.title).trim() === ''
    ? `${program.title} · ${snapshots.length}词`
    : normalizeVocabularySetTitle(input.title)
  userDb.exec('BEGIN')
  try {
    userDb.prepare(`
      INSERT INTO vocabulary_sets (id, user_id, student_id, program_id, review_run_id, title, entry_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, run.student_id, run.program_id, run.id, title, snapshots.length, timestamp)
    const insertSnapshot = userDb.prepare(`
      INSERT INTO vocabulary_set_entries (set_id, entry_id, order_index, snapshot_json)
      VALUES (?, ?, ?, ?)
    `)
    snapshots.forEach((snapshot, index) => insertSnapshot.run(id, snapshot.id, index, JSON.stringify(snapshot)))
    userDb.prepare("UPDATE vocabulary_review_runs SET status = 'frozen', updated_at = ? WHERE id = ?").run(timestamp, run.id)
    userDb.exec('COMMIT')
  } catch (error) {
    userDb.exec('ROLLBACK')
    throw error
  }
  return readVocabularySetRows(userDb, userId, id)
}

export function createVocabularySetFromEntries({ userDb, bankDb }, userId, input = {}) {
  ensureUserVocabularyShape(userDb)
  const studentId = requireNonEmpty(input.studentId, '学生档案')
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const programId = requireNonEmpty(input.programId, '词汇课程')
  if (!Array.isArray(input.entryIds)) {
    throw new VocabularyStoreError('输入词条必须是一个列表。')
  }
  const entryIds = []
  const seenEntryIds = new Set()
  for (const rawEntryId of input.entryIds) {
    const entryId = requireNonEmpty(rawEntryId, '词条 id')
    if (seenEntryIds.has(entryId)) continue
    seenEntryIds.add(entryId)
    entryIds.push(entryId)
  }
  normalizeTarget(entryIds.length)

  const program = getVocabularyProgram(bankDb, programId, { includeExampleCandidates: true })
  if (!program) throw new VocabularyStoreError('词汇课程不存在。', 404, 'program_not_found')
  const entriesById = new Map(program.entries.map((entry) => [entry.id, entry]))
  const setId = `vocabulary-set-${randomUUID()}`
  const snapshots = entryIds.map((entryId) => {
    const entry = entriesById.get(entryId)
    if (!entry) {
      throw new VocabularyStoreError('输入中包含不属于当前1600词库的词条。', 400, 'vocabulary_entry_not_found')
    }
    return snapshotEntry(entry, setId)
  })

  const timestamp = nowIso()
  const title = input?.title == null || String(input.title).trim() === ''
    ? `输入词表 · ${snapshots.length}词`
    : normalizeVocabularySetTitle(input.title)
  userDb.exec('BEGIN')
  try {
    userDb.prepare(`
      INSERT INTO vocabulary_sets (id, user_id, student_id, program_id, review_run_id, title, entry_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(setId, userId, studentId, programId, null, title, snapshots.length, timestamp)
    const insertSnapshot = userDb.prepare(`
      INSERT INTO vocabulary_set_entries (set_id, entry_id, order_index, snapshot_json)
      VALUES (?, ?, ?, ?)
    `)
    snapshots.forEach((snapshot, index) => insertSnapshot.run(setId, snapshot.id, index, JSON.stringify(snapshot)))
    userDb.exec('COMMIT')
  } catch (error) {
    userDb.exec('ROLLBACK')
    throw error
  }
  return readVocabularySetRows(userDb, userId, setId)
}

export function listVocabularySets(userDb, userId, studentId) {
  ensureUserVocabularyShape(userDb)
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  return userDb.prepare(`
    SELECT id FROM vocabulary_sets WHERE user_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(userId, studentId).map((row) => readVocabularySetRows(userDb, userId, row.id))
}

export function getVocabularySet(userDb, userId, setId) {
  ensureUserVocabularyShape(userDb)
  return readVocabularySetRows(userDb, userId, setId)
}

export function renameVocabularySet(userDb, userId, setId, input = {}) {
  ensureUserVocabularyShape(userDb)
  readVocabularySetRows(userDb, userId, setId)
  const title = normalizeVocabularySetTitle(input.title)
  userDb.prepare('UPDATE vocabulary_sets SET title = ? WHERE id = ? AND user_id = ?')
    .run(title, setId, userId)
  return readVocabularySetRows(userDb, userId, setId)
}

export function getVocabularySetForReviewRun(userDb, userId, reviewRunId) {
  ensureUserVocabularyShape(userDb)
  const row = userDb.prepare(`
    SELECT id FROM vocabulary_sets WHERE review_run_id = ? AND user_id = ?
  `).get(reviewRunId, userId)
  if (!row) {
    throw new VocabularyStoreError('已冻结的生词组不存在。', 409, 'frozen_vocabulary_set_missing')
  }
  return readVocabularySetRows(userDb, userId, row.id)
}

export function shareVocabularySet(userDb, userId, setId) {
  ensureUserVocabularyShape(userDb)
  readVocabularySetRows(userDb, userId, setId)
  const existing = userDb.prepare('SELECT share_id, status FROM vocabulary_shares WHERE set_id = ? AND user_id = ?').get(setId, userId)
  const timestamp = nowIso()
  if (existing) {
    if (existing.status === 'revoked') {
      const shareId = randomBytes(24).toString('base64url')
      userDb.prepare("UPDATE vocabulary_shares SET share_id = ?, status = 'active', created_at = ?, revoked_at = NULL WHERE set_id = ? AND user_id = ?")
        .run(shareId, timestamp, setId, userId)
      return { shareId, status: 'active' }
    }
    return { shareId: existing.share_id, status: 'active' }
  }
  const shareId = randomBytes(24).toString('base64url')
  userDb.prepare(`
    INSERT INTO vocabulary_shares (id, set_id, user_id, share_id, status, created_at)
    VALUES (?, ?, ?, ?, 'active', ?)
  `).run(`vocabulary-share-${randomUUID()}`, setId, userId, shareId, timestamp)
  return { shareId, status: 'active' }
}

export function revokeVocabularyShare(userDb, userId, setId) {
  ensureUserVocabularyShape(userDb)
  readVocabularySetRows(userDb, userId, setId)
  const result = userDb.prepare(`
    UPDATE vocabulary_shares SET status = 'revoked', revoked_at = ? WHERE set_id = ? AND user_id = ?
  `).run(nowIso(), setId, userId)
  if (result.changes === 0) throw new VocabularyStoreError('这个生词集还没有公开分享。', 404, 'vocabulary_share_not_found')
  return { status: 'revoked' }
}

export function getPublicVocabularyShare(userDb, shareId) {
  ensureUserVocabularyShape(userDb)
  const share = userDb.prepare(`
    SELECT set_id, status FROM vocabulary_shares WHERE share_id = ?
  `).get(shareId)
  if (!share) return { status: 'not_found' }
  if (share.status !== 'active') return { status: 'revoked' }
  const set = userDb.prepare('SELECT id, title, entry_count, created_at FROM vocabulary_sets WHERE id = ?').get(share.set_id)
  if (!set) return { status: 'not_found' }
  const entries = userDb.prepare(`
    SELECT snapshot_json FROM vocabulary_set_entries WHERE set_id = ? ORDER BY order_index
  `).all(set.id)
    .map((row) => projectPublicVocabularyEntry(parseJson(row.snapshot_json, null)))
  if (entries.length !== set.entry_count) {
    throw new VocabularyStoreError('这份听写单的冻结快照不完整。', 500, 'vocabulary_share_snapshot_invalid')
  }
  return {
    status: 'active',
    set: {
      title: set.title,
      entryCount: set.entry_count,
      entries,
      createdAt: set.created_at,
    },
  }
}

export function getPublicVocabularyDictationShare(userDb, shareId) {
  ensureUserVocabularyShape(userDb)
  const share = userDb.prepare(`
    SELECT set_id, status FROM vocabulary_shares WHERE share_id = ?
  `).get(shareId)
  if (!share) return { status: 'not_found' }
  if (share.status !== 'active') return { status: 'revoked' }
  const set = userDb.prepare('SELECT id, title, entry_count, created_at FROM vocabulary_sets WHERE id = ?').get(share.set_id)
  if (!set) return { status: 'not_found' }
  const entries = userDb.prepare(`
    SELECT snapshot_json FROM vocabulary_set_entries WHERE set_id = ? ORDER BY order_index
  `).all(set.id)
    .map((row) => projectPublicVocabularyDictationEntry(parseJson(row.snapshot_json, null)))
  if (entries.length !== set.entry_count) {
    throw new VocabularyStoreError('这份听写单的冻结快照不完整。', 500, 'vocabulary_share_snapshot_invalid')
  }
  return {
    status: 'active',
    set: {
      title: set.title,
      entryCount: set.entry_count,
      entries,
      createdAt: set.created_at,
    },
  }
}
