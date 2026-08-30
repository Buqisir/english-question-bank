import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { applyAmericanVocabularyPhonetics } from './americanPhonetics.mjs'

const ACTIVE_RUN_STATUSES = new Set(['active', 'target_reached', 'program_exhausted'])
const FORMAL_AUDIO_VOICE = 'eqb-british-teacher-v1'
const DEFAULT_STUDENT_ID_PREFIX = 'vocabulary-student-default:'
const DEFAULT_STUDENT_NAME = '默认学生'
const EXAMPLE_CANDIDATE_VERSION = 'wanwei-examples-v1'
const DICTATION_REVIEW_PROGRAM_ID = 'wanwei-round-one-v1'

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

function normalizeExampleCandidates(rawCandidates, fallbackExample, teachingSenses) {
  const allowedTeachingSenses = Array.isArray(teachingSenses) && teachingSenses.length
    ? teachingSenses
    : [requireNonEmpty(teachingSenses, 'teachingSense')]
  const candidates = Array.isArray(rawCandidates) && rawCandidates.length
    ? rawCandidates
    : [legacyExampleCandidate(fallbackExample, allowedTeachingSenses[0])]
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
    if (normalized.version === 'legacy-single-v1') normalized.teachingSense = allowedTeachingSenses[0]
    if (!allowedTeachingSenses.includes(normalized.teachingSense)) {
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

function normalizeVocabularyVisualBinding(rawBinding, exampleCandidates) {
  if (rawBinding == null) return null
  if (!rawBinding || typeof rawBinding !== 'object' || Array.isArray(rawBinding)) {
    throw new VocabularyStoreError('visual.binding格式无效。')
  }
  if (Object.keys(rawBinding).length === 0) return null
  const mode = requireNonEmpty(rawBinding.mode, 'visual.binding.mode')
  if (mode === 'direct-sense') {
    if (rawBinding.sentenceId != null || rawBinding.sentenceTextSha256 != null) {
      throw new VocabularyStoreError('direct-sense 视觉不能绑定例句。')
    }
    if (rawBinding.displayContract !== 'image_may_appear_with_headword_only') {
      throw new VocabularyStoreError('direct-sense 视觉显示合同无效。')
    }
    return { mode, displayContract: rawBinding.displayContract }
  }
  if (mode !== 'sentence-scene') throw new VocabularyStoreError(`不支持的视觉绑定模式：${mode}。`)
  const sentenceId = requireNonEmpty(rawBinding.sentenceId, 'visual.binding.sentenceId')
  const candidateId = sentenceId.match(/^candidate-([abc])$/u)?.[1]
  const sentence = candidateId ? exampleCandidates.find((candidate) => candidate.candidateId === candidateId) : null
  if (!sentence) throw new VocabularyStoreError(`sentence-scene 例句无法解析：${sentenceId}。`)
  const sentenceTextSha256 = requireNonEmpty(rawBinding.sentenceTextSha256, 'visual.binding.sentenceTextSha256')
  if (!/^[a-f0-9]{64}$/u.test(sentenceTextSha256) || createHash('sha256').update(sentence.english).digest('hex') !== sentenceTextSha256) {
    throw new VocabularyStoreError(`sentence-scene 例句哈希不一致：${sentenceId}。`)
  }
  if (rawBinding.displayContract !== 'image_and_exact_sentence_with_target_highlight') {
    throw new VocabularyStoreError('sentence-scene 视觉显示合同无效。')
  }
  return { mode, sentenceId, sentenceTextSha256, displayContract: rawBinding.displayContract }
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

function normalizeDictationTitle(value, fallback = '综合听写') {
  const title = String(value ?? fallback).trim().replace(/\s+/gu, ' ')
  const length = Array.from(title).length
  if (!title) throw new VocabularyStoreError('听写名称不能为空。')
  if (length > 60) throw new VocabularyStoreError('听写名称最多 60 个字。')
  if (/[\p{Cc}\p{Cf}\p{Extended_Pictographic}]/u.test(title)) {
    throw new VocabularyStoreError('听写名称不能包含控制字符或 Emoji。')
  }
  return title
}

function normalizeMeaningRecallTitle(value, fallback = '词义抽查') {
  const title = String(value ?? fallback).trim().replace(/\s+/gu, ' ')
  const length = Array.from(title).length
  if (!title) throw new VocabularyStoreError('词义抽查名称不能为空。')
  if (length > 60) throw new VocabularyStoreError('词义抽查名称最多 60 个字。')
  if (/[\p{Cc}\p{Cf}\p{Extended_Pictographic}]/u.test(title)) {
    throw new VocabularyStoreError('词义抽查名称不能包含控制字符或 Emoji。')
  }
  return title
}

function normalizeDictationDate(value) {
  const date = String(value ?? nowIso().slice(0, 10)).trim()
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date) {
    throw new VocabularyStoreError('听写日期必须是有效的 YYYY-MM-DD。')
  }
  return date
}

function normalizeDictationMaterialLayout(value) {
  if (value == null) return 'merged'
  if (value === 'merged' || value === 'grouped') return value
  throw new VocabularyStoreError('资料版式必须是合并去重或按组装订。', 400, 'invalid_vocabulary_material_layout')
}

function normalizeMeaningRecallDate(value) {
  const date = String(value ?? nowIso().slice(0, 10)).trim()
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date) {
    throw new VocabularyStoreError('词义抽查日期必须是有效的 YYYY-MM-DD。')
  }
  return date
}

function normalizeOptionalText(value, label, maxLength) {
  const text = String(value ?? '').trim().replace(/\s+/gu, ' ')
  if (Array.from(text).length > maxLength) throw new VocabularyStoreError(`${label}最多 ${maxLength} 个字。`)
  if (/[\p{Cc}\p{Cf}\p{Extended_Pictographic}]/u.test(text)) {
    throw new VocabularyStoreError(`${label}不能包含控制字符或 Emoji。`)
  }
  return text
}

function defaultStudentId(userId) {
  return `${DEFAULT_STUDENT_ID_PREFIX}${userId}`
}

function projectVocabularyVisualBinding(rawBinding, invalid) {
  if (rawBinding == null) return undefined
  if (!rawBinding || typeof rawBinding !== 'object' || Array.isArray(rawBinding)) invalid()
  if (rawBinding.mode === 'direct-sense') {
    if (rawBinding.sentenceId != null || rawBinding.sentenceTextSha256 != null || rawBinding.displayContract !== 'image_may_appear_with_headword_only') invalid()
    return { mode: 'direct-sense', displayContract: rawBinding.displayContract }
  }
  if (
    rawBinding.mode !== 'sentence-scene'
    || !/^candidate-[abc]$/u.test(String(rawBinding.sentenceId ?? ''))
    || !/^[a-f0-9]{64}$/u.test(String(rawBinding.sentenceTextSha256 ?? ''))
    || rawBinding.displayContract !== 'image_and_exact_sentence_with_target_highlight'
  ) invalid()
  return {
    mode: 'sentence-scene',
    sentenceId: rawBinding.sentenceId,
    sentenceTextSha256: rawBinding.sentenceTextSha256,
    displayContract: rawBinding.displayContract,
  }
}

function projectVocabularySnapshot(snapshot, invalid) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) invalid()
  const visual = snapshot.visual
  const audio = snapshot.audio
  const syllables = snapshot.syllables
  if (!visual || typeof visual !== 'object' || !audio || typeof audio !== 'object' || !Array.isArray(syllables)) invalid()
  if (!['syllables', 'forms'].includes(snapshot.pronunciationMode)) invalid()
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
  const visualBinding = projectVocabularyVisualBinding(visual.binding, invalid)
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
      ...(visualBinding ? { binding: visualBinding } : {}),
    },
    audio: {
      key: text(audio.key),
      version: text(audio.version),
      path: text(audio.path),
      voice: text(audio.voice),
    },
  })
  const teachingSenses = Array.isArray(snapshot.teachingSenses)
    ? [...new Set(snapshot.teachingSenses.map((sense) => String(sense ?? '').trim()).filter(Boolean))].slice(0, 3)
    : []
  const rawAudioVariants = snapshot.audioVariants
  let audioVariants
  if (rawAudioVariants != null) {
    if (!rawAudioVariants || typeof rawAudioVariants !== 'object' || Array.isArray(rawAudioVariants)) invalid()
    const projectAudio = (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
      return { key: text(value.key), version: text(value.version), path: text(value.path), voice: text(value.voice) }
    }
    audioVariants = {
      american: projectAudio(rawAudioVariants.american),
      british: projectAudio(rawAudioVariants.british),
    }
  }
  const projectedWithVariants = {
    ...projected,
    teachingSenses: teachingSenses.length ? teachingSenses : [projected.teachingSense],
    ...(audioVariants ? { audioVariants } : {}),
  }
  const phonetics = snapshot.phonetics
  if (!phonetics || typeof phonetics !== 'object' || Array.isArray(phonetics)) return projectedWithVariants
  return {
    ...projectedWithVariants,
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
    ...(entry.audioVariants ? { audioVariants: entry.audioVariants } : {}),
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
      ...(exampleSelection ? { candidateId: exampleSelection.candidateId, version: exampleSelection.version } : {}),
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
      structure_json TEXT NOT NULL DEFAULT '{}',
      availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'hidden')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vocabulary_groups (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES vocabulary_programs(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
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
      phonetics_json TEXT NOT NULL DEFAULT '{}',
      part_of_speech TEXT NOT NULL,
      source_meanings_json TEXT NOT NULL,
      teaching_sense TEXT NOT NULL,
      teaching_senses_json TEXT NOT NULL DEFAULT '[]',
      exam_frequency INTEGER NOT NULL DEFAULT 0,
      pronunciation_mode TEXT NOT NULL CHECK (pronunciation_mode IN ('syllables', 'forms')),
      syllables_json TEXT NOT NULL,
      pronunciation_parts_json TEXT NOT NULL DEFAULT '{}',
      example_english TEXT NOT NULL,
      example_chinese TEXT NOT NULL,
      example_highlight TEXT NOT NULL,
      example_review_status TEXT NOT NULL CHECK (example_review_status = 'approved'),
      example_candidates_json TEXT NOT NULL DEFAULT '[]',
      visual_key TEXT NOT NULL,
      visual_version TEXT NOT NULL,
      visual_path TEXT NOT NULL,
      visual_alt TEXT NOT NULL,
      visual_binding_json TEXT NOT NULL DEFAULT '{}',
      audio_key TEXT NOT NULL,
      audio_version TEXT NOT NULL,
      audio_path TEXT NOT NULL,
      audio_voice TEXT NOT NULL,
      audio_variants_json TEXT NOT NULL DEFAULT '{}',
      source_stage TEXT NOT NULL,
      source_day INTEGER NOT NULL,
      source_order INTEGER NOT NULL,
      printed_page INTEGER NOT NULL,
      source_verification TEXT NOT NULL CHECK (source_verification IN ('page-checked', 'index-and-heading-reviewed')),
      source_metadata_json TEXT NOT NULL DEFAULT '{}',
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
  const vocabularyProgramColumns = new Set(
    db.prepare('PRAGMA table_info(vocabulary_programs)').all().map((column) => column.name),
  )
  if (!vocabularyProgramColumns.has('structure_json')) {
    db.exec("ALTER TABLE vocabulary_programs ADD COLUMN structure_json TEXT NOT NULL DEFAULT '{}'")
  }
  if (!vocabularyProgramColumns.has('availability')) {
    db.exec("ALTER TABLE vocabulary_programs ADD COLUMN availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'hidden'))")
  }
  const vocabularyEntryColumns = new Set(
    db.prepare('PRAGMA table_info(vocabulary_entries)').all().map((column) => column.name),
  )
  const missingExamFrequency = !vocabularyEntryColumns.has('exam_frequency')
  const hasExampleCandidates = vocabularyEntryColumns.has('example_candidates_json')
  const hasPhonetics = vocabularyEntryColumns.has('phonetics_json')
  const hasPronunciationParts = vocabularyEntryColumns.has('pronunciation_parts_json')
  const hasTeachingSenses = vocabularyEntryColumns.has('teaching_senses_json')
  const hasAudioVariants = vocabularyEntryColumns.has('audio_variants_json')
  const hasSourceMetadata = vocabularyEntryColumns.has('source_metadata_json')
  const hasVisualBinding = vocabularyEntryColumns.has('visual_binding_json')
  const vocabularyGroupsSql = String(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vocabulary_groups'").get()?.sql ?? '')
  const vocabularyEntriesSql = String(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vocabulary_entries'").get()?.sql ?? '')
  const requiresEntryContractMigration = !vocabularyEntriesSql.includes('index-and-heading-reviewed')
    || vocabularyEntriesSql.includes("source_stage IN ('core', 'basic', 'recognition')")
    || vocabularyEntriesSql.includes('audio_voice IN')
  const requiresGroupContractMigration = vocabularyGroupsSql.includes("stage IN ('core', 'basic', 'recognition')")
  if (requiresEntryContractMigration || requiresGroupContractMigration) {
    db.exec('PRAGMA foreign_keys = OFF')
    try {
      db.exec('BEGIN')
      if (missingExamFrequency) {
        db.exec('ALTER TABLE vocabulary_entries ADD COLUMN exam_frequency INTEGER NOT NULL DEFAULT 0')
      }
      const legacyExampleCandidatesSelect = hasExampleCandidates ? 'example_candidates_json' : "'[]'"
      const legacyPhoneticsSelect = hasPhonetics ? 'phonetics_json' : "'{}'"
      const legacyPronunciationPartsSelect = hasPronunciationParts ? 'pronunciation_parts_json' : "'{}'"
      const legacyTeachingSensesSelect = hasTeachingSenses ? 'teaching_senses_json' : "'[]'"
      const legacyAudioVariantsSelect = hasAudioVariants ? 'audio_variants_json' : "'{}'"
      const legacySourceMetadataSelect = hasSourceMetadata ? 'source_metadata_json' : "'{}'"
      const legacyVisualBindingSelect = hasVisualBinding ? 'visual_binding_json' : "'{}'"
      db.exec(`
        ALTER TABLE vocabulary_entries RENAME TO vocabulary_entries_legacy_contract;
        ALTER TABLE vocabulary_groups RENAME TO vocabulary_groups_legacy_contract;
        CREATE TABLE vocabulary_groups (
          id TEXT PRIMARY KEY,
          program_id TEXT NOT NULL REFERENCES vocabulary_programs(id) ON DELETE CASCADE,
          stage TEXT NOT NULL,
          week INTEGER NOT NULL,
          group_number INTEGER NOT NULL,
          source_label TEXT NOT NULL,
          start_order INTEGER NOT NULL,
          end_order INTEGER NOT NULL,
          UNIQUE(program_id, stage, group_number)
        );
        INSERT INTO vocabulary_groups (
          id, program_id, stage, week, group_number, source_label, start_order, end_order
        ) SELECT
          id, program_id, stage, week, group_number, source_label, start_order, end_order
        FROM vocabulary_groups_legacy_contract;
        CREATE TABLE vocabulary_entries (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL REFERENCES vocabulary_programs(id) ON DELETE CASCADE,
        group_id TEXT NOT NULL REFERENCES vocabulary_groups(id) ON DELETE CASCADE,
        headword TEXT NOT NULL,
        phonetic TEXT NOT NULL,
        phonetics_json TEXT NOT NULL DEFAULT '{}',
        part_of_speech TEXT NOT NULL,
        source_meanings_json TEXT NOT NULL,
        teaching_sense TEXT NOT NULL,
        teaching_senses_json TEXT NOT NULL DEFAULT '[]',
        exam_frequency INTEGER NOT NULL DEFAULT 0,
        pronunciation_mode TEXT NOT NULL CHECK (pronunciation_mode IN ('syllables', 'forms')),
        syllables_json TEXT NOT NULL,
        pronunciation_parts_json TEXT NOT NULL DEFAULT '{}',
        example_english TEXT NOT NULL,
        example_chinese TEXT NOT NULL,
        example_highlight TEXT NOT NULL,
        example_review_status TEXT NOT NULL CHECK (example_review_status = 'approved'),
        example_candidates_json TEXT NOT NULL DEFAULT '[]',
        visual_key TEXT NOT NULL,
        visual_version TEXT NOT NULL,
        visual_path TEXT NOT NULL,
        visual_alt TEXT NOT NULL,
        visual_binding_json TEXT NOT NULL DEFAULT '{}',
        audio_key TEXT NOT NULL,
        audio_version TEXT NOT NULL,
        audio_path TEXT NOT NULL,
        audio_voice TEXT NOT NULL,
        audio_variants_json TEXT NOT NULL DEFAULT '{}',
        source_stage TEXT NOT NULL,
        source_day INTEGER NOT NULL,
        source_order INTEGER NOT NULL,
        printed_page INTEGER NOT NULL,
        source_verification TEXT NOT NULL CHECK (source_verification IN ('page-checked', 'index-and-heading-reviewed')),
        source_metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(program_id, source_order)
      );
      INSERT INTO vocabulary_entries (
        id, program_id, group_id, headword, phonetic, phonetics_json, part_of_speech, source_meanings_json,
        teaching_sense, teaching_senses_json, exam_frequency, pronunciation_mode, syllables_json, pronunciation_parts_json, example_english,
        example_chinese, example_highlight, example_review_status, example_candidates_json, visual_key, visual_version,
        visual_path, visual_alt, visual_binding_json, audio_key, audio_version, audio_path, audio_voice, audio_variants_json, source_stage,
        source_day, source_order, printed_page, source_verification, source_metadata_json, created_at, updated_at
      )
      SELECT
        id, program_id, group_id, headword, phonetic, ${legacyPhoneticsSelect}, part_of_speech, source_meanings_json,
        teaching_sense, ${legacyTeachingSensesSelect}, exam_frequency, pronunciation_mode, syllables_json, ${legacyPronunciationPartsSelect}, example_english,
        example_chinese, example_highlight, example_review_status, ${legacyExampleCandidatesSelect}, visual_key, visual_version,
        visual_path, visual_alt, ${legacyVisualBindingSelect}, audio_key, audio_version, audio_path, audio_voice, ${legacyAudioVariantsSelect}, source_stage,
        source_day, source_order, printed_page, source_verification, ${legacySourceMetadataSelect}, created_at, updated_at
      FROM vocabulary_entries_legacy_contract;
      DROP TABLE vocabulary_entries_legacy_contract;
      DROP TABLE vocabulary_groups_legacy_contract;
      CREATE INDEX idx_vocabulary_groups_program_order ON vocabulary_groups(program_id, start_order);
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
  if (!migratedEntryColumns.has('phonetics_json')) {
    db.exec("ALTER TABLE vocabulary_entries ADD COLUMN phonetics_json TEXT NOT NULL DEFAULT '{}'")
  }
  if (!migratedEntryColumns.has('pronunciation_parts_json')) {
    db.exec("ALTER TABLE vocabulary_entries ADD COLUMN pronunciation_parts_json TEXT NOT NULL DEFAULT '{}'")
  }
  if (!migratedEntryColumns.has('teaching_senses_json')) {
    db.exec("ALTER TABLE vocabulary_entries ADD COLUMN teaching_senses_json TEXT NOT NULL DEFAULT '[]'")
  }
  if (!migratedEntryColumns.has('audio_variants_json')) {
    db.exec("ALTER TABLE vocabulary_entries ADD COLUMN audio_variants_json TEXT NOT NULL DEFAULT '{}'")
  }
  if (!migratedEntryColumns.has('source_metadata_json')) {
    db.exec("ALTER TABLE vocabulary_entries ADD COLUMN source_metadata_json TEXT NOT NULL DEFAULT '{}'")
  }
  if (!migratedEntryColumns.has('visual_binding_json')) {
    db.exec("ALTER TABLE vocabulary_entries ADD COLUMN visual_binding_json TEXT NOT NULL DEFAULT '{}'")
  }
  db.exec("UPDATE vocabulary_entries SET teaching_senses_json = json_array(teaching_sense) WHERE teaching_senses_json = '[]'")
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

function ensureVocabularyDictationShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vocabulary_dictation_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      title TEXT NOT NULL,
      accent TEXT NOT NULL CHECK (accent IN ('american', 'british')),
      entry_count INTEGER NOT NULL CHECK (entry_count BETWEEN 1 AND 60),
      task_date TEXT NOT NULL,
      material_layout TEXT NOT NULL DEFAULT 'merged' CHECK (material_layout IN ('merged', 'grouped')),
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id, student_id) REFERENCES vocabulary_students(user_id, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_vocabulary_dictation_tasks_student
      ON vocabulary_dictation_tasks(user_id, student_id, created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS vocabulary_dictation_task_sources (
      task_id TEXT NOT NULL REFERENCES vocabulary_dictation_tasks(id) ON DELETE CASCADE,
      set_id TEXT NOT NULL REFERENCES vocabulary_sets(id) ON DELETE RESTRICT,
      order_index INTEGER NOT NULL,
      PRIMARY KEY(task_id, set_id),
      UNIQUE(task_id, order_index)
    );
    CREATE TABLE IF NOT EXISTS vocabulary_dictation_task_entries (
      task_id TEXT NOT NULL REFERENCES vocabulary_dictation_tasks(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      PRIMARY KEY(task_id, entry_id),
      UNIQUE(task_id, order_index)
    );
    CREATE TABLE IF NOT EXISTS vocabulary_dictation_task_entry_sources (
      task_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      set_id TEXT NOT NULL REFERENCES vocabulary_sets(id) ON DELETE RESTRICT,
      PRIMARY KEY(task_id, entry_id, set_id),
      FOREIGN KEY(task_id, entry_id)
        REFERENCES vocabulary_dictation_task_entries(task_id, entry_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS vocabulary_dictation_task_shares (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL UNIQUE REFERENCES vocabulary_dictation_tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      share_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vocabulary_dictation_task_shares_public
      ON vocabulary_dictation_task_shares(share_id, status);
    CREATE TABLE IF NOT EXISTS vocabulary_dictation_task_share_history (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES vocabulary_dictation_tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      share_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vocabulary_dictation_task_share_history_public
      ON vocabulary_dictation_task_share_history(share_id, status);
    CREATE TABLE IF NOT EXISTS vocabulary_dictation_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      task_id TEXT NOT NULL REFERENCES vocabulary_dictation_tasks(id) ON DELETE RESTRICT,
      mode TEXT NOT NULL CHECK (mode IN ('all', 'partial')),
      status TEXT NOT NULL CHECK (status IN ('draft', 'completed', 'void')),
      dictation_date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      voided_at TEXT,
      FOREIGN KEY(user_id, student_id) REFERENCES vocabulary_students(user_id, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_vocabulary_dictation_records_student
      ON vocabulary_dictation_records(user_id, student_id, dictation_date DESC, updated_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS vocabulary_dictation_record_results (
      record_id TEXT NOT NULL REFERENCES vocabulary_dictation_records(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('correct', 'wrong', 'untested')),
      wrong_spelling TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(record_id, entry_id),
      UNIQUE(record_id, order_index)
    );
    CREATE TABLE IF NOT EXISTS vocabulary_student_word_flags (
      user_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
      paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, student_id, program_id, entry_id),
      FOREIGN KEY(user_id, student_id) REFERENCES vocabulary_students(user_id, id) ON DELETE CASCADE
    );
  `)
  const taskColumns = new Set(
    db.prepare('PRAGMA table_info(vocabulary_dictation_tasks)').all().map((column) => column.name),
  )
  if (!taskColumns.has('task_date')) {
    db.exec("ALTER TABLE vocabulary_dictation_tasks ADD COLUMN task_date TEXT NOT NULL DEFAULT ''")
  }
  if (!taskColumns.has('material_layout')) {
    db.exec("ALTER TABLE vocabulary_dictation_tasks ADD COLUMN material_layout TEXT NOT NULL DEFAULT 'merged'")
  }
  const missingTaskDate = db.prepare(`
    SELECT 1 FROM vocabulary_dictation_tasks WHERE task_date = '' LIMIT 1
  `).get()
  if (missingTaskDate) {
    db.exec(`
      UPDATE vocabulary_dictation_tasks
      SET task_date = CASE
        WHEN substr(title, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND date(substr(title, 1, 10)) = substr(title, 1, 10)
          THEN substr(title, 1, 10)
        ELSE substr(created_at, 1, 10)
      END
      WHERE task_date = '';
    `)
  }
}

function ensureVocabularyMeaningRecallShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vocabulary_meaning_recall_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      title TEXT NOT NULL,
      order_mode TEXT NOT NULL CHECK (order_mode IN ('random', 'source')),
      status TEXT NOT NULL CHECK (status IN ('draft', 'completed', 'void')),
      recall_date TEXT NOT NULL,
      entry_count INTEGER NOT NULL CHECK (entry_count BETWEEN 1 AND 60),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      voided_at TEXT,
      FOREIGN KEY(user_id, student_id) REFERENCES vocabulary_students(user_id, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_vocabulary_meaning_recall_records_student
      ON vocabulary_meaning_recall_records(user_id, student_id, recall_date DESC, updated_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS vocabulary_meaning_recall_record_sources (
      record_id TEXT NOT NULL REFERENCES vocabulary_meaning_recall_records(id) ON DELETE CASCADE,
      set_id TEXT NOT NULL REFERENCES vocabulary_sets(id) ON DELETE RESTRICT,
      order_index INTEGER NOT NULL,
      PRIMARY KEY(record_id, set_id),
      UNIQUE(record_id, order_index)
    );
    CREATE TABLE IF NOT EXISTS vocabulary_meaning_recall_record_entries (
      record_id TEXT NOT NULL REFERENCES vocabulary_meaning_recall_records(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('correct', 'wrong', 'untested')),
      PRIMARY KEY(record_id, entry_id),
      UNIQUE(record_id, order_index)
    );
    CREATE TABLE IF NOT EXISTS vocabulary_meaning_recall_record_entry_sources (
      record_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      set_id TEXT NOT NULL REFERENCES vocabulary_sets(id) ON DELETE RESTRICT,
      PRIMARY KEY(record_id, entry_id, set_id),
      FOREIGN KEY(record_id, entry_id)
        REFERENCES vocabulary_meaning_recall_record_entries(record_id, entry_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS vocabulary_meaning_recall_dictation_tasks (
      record_id TEXT NOT NULL REFERENCES vocabulary_meaning_recall_records(id) ON DELETE RESTRICT,
      task_id TEXT NOT NULL UNIQUE REFERENCES vocabulary_dictation_tasks(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY(record_id, task_id)
    );
  `)
}

function ensureVocabularyShareHistoryShape(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vocabulary_share_history (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL REFERENCES vocabulary_sets(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      share_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vocabulary_share_history_public
      ON vocabulary_share_history(share_id, status);
  `)
  const missingHistory = db.prepare(`
    SELECT 1 FROM vocabulary_shares AS shares
    WHERE NOT EXISTS (
      SELECT 1 FROM vocabulary_share_history AS history WHERE history.share_id = shares.share_id
    )
    LIMIT 1
  `).get()
  if (missingHistory) {
    db.exec(`
      INSERT OR IGNORE INTO vocabulary_share_history
        (id, set_id, user_id, share_id, status, created_at, revoked_at)
      SELECT 'vocabulary-share-history:' || share_id, set_id, user_id, share_id, status, created_at, revoked_at
      FROM vocabulary_shares;
    `)
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
    ensureVocabularyShareHistoryShape(db)
    ensureVocabularyDictationShape(db)
    ensureVocabularyMeaningRecallShape(db)
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
    ensureVocabularyShareHistoryShape(db)
    ensureVocabularyDictationShape(db)
    ensureVocabularyMeaningRecallShape(db)
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
  ensureVocabularyShareHistoryShape(db)
  ensureVocabularyDictationShape(db)
  ensureVocabularyMeaningRecallShape(db)
}

function normalizeProgramEntry(entry, program) {
  const source = entry.source ?? {}
  const example = entry.example ?? entry.learning?.example ?? {}
  const pronunciation = entry.pronunciation ?? entry.learning?.pronunciationGuide ?? {}
  const visual = entry.visual ?? {}
  const audio = entry.audio ?? {}
  const syllables = entry.syllables ?? pronunciation.parts?.map((part) => part.spelling) ?? []
  const pronunciationMode = entry.pronunciationMode ?? pronunciation.mode
  const rawPhonetics = entry.phonetics
  const phonetics = rawPhonetics == null ? {} : {
    american: requireNonEmpty(rawPhonetics?.american, 'phonetics.american'),
    british: requireNonEmpty(rawPhonetics?.british, 'phonetics.british'),
  }
  const rawPronunciationParts = entry.pronunciationParts
  const pronunciationParts = rawPronunciationParts == null ? {} : Object.fromEntries(
    ['american', 'british'].map((accent) => {
      const parts = rawPronunciationParts?.[accent]
      if (!Array.isArray(parts) || !parts.length) {
        throw new VocabularyStoreError(`pronunciationParts.${accent}不能为空。`)
      }
      return [accent, parts.map((part, index) => ({
        spelling: requireNonEmpty(part?.spelling, `pronunciationParts.${accent}[${index}].spelling`),
        phonetic: requireNonEmpty(part?.phonetic, `pronunciationParts.${accent}[${index}].phonetic`),
      }))]
    }),
  )
  const rawTeachingSenses = Array.isArray(entry.teachingSenses) && entry.teachingSenses.length
    ? entry.teachingSenses
    : [entry.teachingSense]
  const teachingSenses = [...new Set(rawTeachingSenses.map((sense, index) => requireNonEmpty(sense, `teachingSenses[${index}]`)))]
  if (teachingSenses.length > 3) throw new VocabularyStoreError('teachingSenses 最多保留三个核心义。')
  const teachingSense = requireNonEmpty(entry.teachingSense ?? teachingSenses.join('；'), 'teachingSense')
  const fallbackExample = {
    english: requireNonEmpty(example.english, 'example.english'),
    chinese: requireNonEmpty(example.chinese, 'example.chinese'),
    highlight: requireNonEmpty(example.highlight, 'example.highlight'),
  }
  const exampleCandidates = normalizeExampleCandidates(entry.exampleCandidates, fallbackExample, teachingSenses)
  const visualBinding = normalizeVocabularyVisualBinding(visual.binding, exampleCandidates)
  const audioVariants = {}
  if (entry.audioVariants != null) {
    if (!entry.audioVariants || typeof entry.audioVariants !== 'object' || Array.isArray(entry.audioVariants)) {
      throw new VocabularyStoreError('audioVariants格式无效。')
    }
    for (const accent of ['american', 'british']) {
      const variant = entry.audioVariants[accent]
      if (!variant || typeof variant !== 'object' || Array.isArray(variant)) {
        throw new VocabularyStoreError(`audioVariants.${accent}不能为空。`)
      }
      audioVariants[accent] = {
        key: requireNonEmpty(variant.key, `audioVariants.${accent}.key`),
        version: requireNonEmpty(variant.version, `audioVariants.${accent}.version`),
        path: requireNonEmpty(variant.path, `audioVariants.${accent}.path`),
        voice: requireNonEmpty(variant.voice, `audioVariants.${accent}.voice`),
      }
    }
  }
  if (!Array.isArray(syllables) || syllables.length === 0) {
    throw new VocabularyStoreError(`${entry.id || entry.headword} 缺少音节或词形拆分。`)
  }
  return {
    id: requireNonEmpty(entry.id, 'Entry id'),
    programId: program.id,
    groupId: requireNonEmpty(entry.groupId ?? source.groupId, 'Vocabulary Group id'),
    headword: requireNonEmpty(entry.headword, 'headword'),
    phonetic: requireNonEmpty(entry.phonetic ?? phonetics.british, 'phonetic'),
    phonetics,
    partOfSpeech: requireNonEmpty(entry.partOfSpeech, 'partOfSpeech'),
    sourceMeanings: Array.isArray(entry.sourceMeanings) ? entry.sourceMeanings : [],
    teachingSense,
    teachingSenses,
    examFrequency: Number.isInteger(Number(entry.examFrequency)) ? Number(entry.examFrequency) : 0,
    pronunciationMode: requireNonEmpty(pronunciationMode, 'pronunciationMode'),
    syllables,
    pronunciationParts,
    exampleEnglish: fallbackExample.english,
    exampleChinese: fallbackExample.chinese,
    exampleHighlight: fallbackExample.highlight,
    exampleReviewStatus: example.reviewStatus ?? 'approved',
    exampleCandidates,
    visualKey: requireNonEmpty(visual.key ?? entry.visualKey, 'visual.key'),
    visualVersion: requireNonEmpty(visual.version, 'visual.version'),
    visualPath: requireNonEmpty(visual.path ?? visual.src, 'visual.path'),
    visualAlt: requireNonEmpty(visual.alt, 'visual.alt'),
    visualBinding,
    audioKey: requireNonEmpty(audio.key, 'audio.key'),
    audioVersion: requireNonEmpty(audio.version, 'audio.version'),
    audioPath: requireNonEmpty(audio.path, 'audio.path'),
    audioVoice: audio.voice ?? FORMAL_AUDIO_VOICE,
    audioVariants,
    sourceStage: source.stage,
    sourceDay: Number(source.day ?? source.group),
    sourceOrder: Number(source.sourceOrder ?? source.globalOrder),
    printedPage: Number(source.printedPage),
    sourceVerification: source.verification,
    sourceMetadata: source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
      ? source.metadata
      : {},
  }
}

export function replaceVocabularyProgram(db, input) {
  ensureSharedVocabularyShape(db)
  const structure = input?.structure && typeof input.structure === 'object' && !Array.isArray(input.structure)
    ? input.structure
    : {}
  const availability = input?.availability ?? 'available'
  if (!['available', 'hidden'].includes(availability)) {
    throw new VocabularyStoreError('Program availability 必须是 available 或 hidden。')
  }
  const program = {
    id: requireNonEmpty(input?.id, 'Program id'),
    version: requireNonEmpty(input?.version, 'Program version'),
    title: requireNonEmpty(input?.title, 'Program title'),
    subtitle: String(input?.subtitle ?? ''),
    sourceTitle: requireNonEmpty(input?.sourceTitle, 'sourceTitle'),
    sourceEdition: String(input?.sourceEdition ?? ''),
    totalPlannedEntries: Number(input?.totalPlannedEntries),
    structure,
    availability,
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
  const stageKeys = new Set(
    Array.isArray(structure.stages)
      ? structure.stages.map((stage) => requireNonEmpty(stage?.key, 'Stage key'))
      : [],
  )
  for (const group of groups) {
    const stage = requireNonEmpty(group.stage, 'Group stage')
    if (stageKeys.size && !stageKeys.has(stage)) {
      throw new VocabularyStoreError(`Vocabulary Group 引用了 Program 未定义的阶段：${stage}。`)
    }
  }
  for (const entry of entries) {
    if (stageKeys.size && !stageKeys.has(entry.sourceStage)) {
      throw new VocabularyStoreError(`Vocabulary Entry 引用了 Program 未定义的阶段：${entry.sourceStage}。`)
    }
  }

  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM vocabulary_programs WHERE id = ?').run(program.id)
    db.prepare(`
      INSERT INTO vocabulary_programs
        (id, version, title, subtitle, source_title, source_edition, total_planned_entries,
         structure_json, availability, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      program.id, program.version, program.title, program.subtitle, program.sourceTitle,
      program.sourceEdition, program.totalPlannedEntries, JSON.stringify(program.structure),
      program.availability, nowIso(),
    )
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
        id, program_id, group_id, headword, phonetic, phonetics_json, part_of_speech,
        source_meanings_json, teaching_sense, teaching_senses_json, exam_frequency, pronunciation_mode, syllables_json,
        pronunciation_parts_json,
        example_english, example_chinese, example_highlight, example_review_status, example_candidates_json,
        visual_key, visual_version, visual_path, visual_alt, visual_binding_json,
        audio_key, audio_version, audio_path, audio_voice, audio_variants_json,
        source_stage, source_day, source_order, printed_page, source_verification, source_metadata_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const entry of entries) {
      insertEntry.run(
        entry.id, entry.programId, entry.groupId, entry.headword, entry.phonetic, JSON.stringify(entry.phonetics), entry.partOfSpeech,
        JSON.stringify(entry.sourceMeanings), entry.teachingSense, JSON.stringify(entry.teachingSenses), entry.examFrequency, entry.pronunciationMode, JSON.stringify(entry.syllables),
        JSON.stringify(entry.pronunciationParts),
        entry.exampleEnglish, entry.exampleChinese, entry.exampleHighlight, entry.exampleReviewStatus, JSON.stringify(entry.exampleCandidates),
        entry.visualKey, entry.visualVersion, entry.visualPath, entry.visualAlt, JSON.stringify(entry.visualBinding ?? {}),
        entry.audioKey, entry.audioVersion, entry.audioPath, entry.audioVoice, JSON.stringify(entry.audioVariants),
        entry.sourceStage, entry.sourceDay, entry.sourceOrder, entry.printedPage, entry.sourceVerification, JSON.stringify(entry.sourceMetadata), nowIso(),
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
  const audioVariants = parseJson(row.audio_variants_json, {})
  const storedPhonetics = parseJson(row.phonetics_json, {})
  const storedPronunciationParts = parseJson(row.pronunciation_parts_json, {})
  const storedTeachingSenses = parseJson(row.teaching_senses_json, [row.teaching_sense])
  const storedExampleCandidates = normalizeExampleCandidates(
    parseJson(row.example_candidates_json, []),
    { english: row.example_english, chinese: row.example_chinese, highlight: row.example_highlight },
    storedTeachingSenses,
  )
  const storedVisualBinding = normalizeVocabularyVisualBinding(parseJson(row.visual_binding_json, {}), storedExampleCandidates)
  const hasStoredPronunciationParts = Array.isArray(storedPronunciationParts?.american)
    && storedPronunciationParts.american.length
    && Array.isArray(storedPronunciationParts?.british)
    && storedPronunciationParts.british.length
  const projected = applyAmericanVocabularyPhonetics({
    id: row.id,
    headword: row.headword,
    phonetic: row.phonetic,
    partOfSpeech: row.part_of_speech,
    sourceMeanings: parseJson(row.source_meanings_json, []),
    teachingSense: row.teaching_sense,
    teachingSenses: storedTeachingSenses,
    examFrequency: row.exam_frequency,
    pronunciationMode: row.pronunciation_mode,
    syllables: parseJson(row.syllables_json, []),
    ...(hasStoredPronunciationParts ? { pronunciationParts: storedPronunciationParts } : {}),
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
      ...(storedVisualBinding ? { binding: storedVisualBinding } : {}),
    },
    audio: {
      key: row.audio_key,
      version: row.audio_version,
      path: row.audio_path,
      voice: row.audio_voice,
    },
    ...(audioVariants?.american && audioVariants?.british ? { audioVariants } : {}),
    source: {
      title: sourceTitle,
      edition: sourceEdition,
      stage: row.source_stage,
      day: row.source_day,
      sourceOrder: row.source_order,
      printedPage: row.printed_page,
      verification: row.source_verification,
      metadata: parseJson(row.source_metadata_json, {}),
    },
  })
  const entry = {
    ...projected,
    example: {
      ...projected.example,
      candidateId: storedExampleCandidates[0].candidateId,
      version: storedExampleCandidates[0].version,
    },
    phonetics: storedPhonetics?.american && storedPhonetics?.british
      ? storedPhonetics
      : { american: projected.phonetic, british: row.phonetic },
  }
  if (includeExampleCandidates) {
    entry.exampleCandidates = storedExampleCandidates
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
    structure: parseJson(row.structure_json, {}),
    availability: row.availability ?? 'available',
    groups,
    entries,
  }
}

export function listVocabularyPrograms(db, { includeHidden = false } = {}) {
  const rows = db.prepare(`
    SELECT id, version, title, subtitle, source_title, source_edition,
           total_planned_entries, structure_json, availability
    FROM vocabulary_programs
    ${includeHidden ? '' : "WHERE availability = 'available'"}
    ORDER BY CASE availability WHEN 'available' THEN 0 ELSE 1 END, created_at, id
  `).all()
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    title: row.title,
    subtitle: row.subtitle,
    sourceTitle: row.source_title,
    sourceEdition: row.source_edition,
    totalPlannedEntries: row.total_planned_entries,
    structure: parseJson(row.structure_json, {}),
    availability: row.availability,
  }))
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

export function setVocabularyProgressStart({ userDb, bankDb }, userId, input = {}) {
  ensureUserVocabularyShape(userDb)
  const studentId = requireNonEmpty(input.studentId, '学生档案')
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const programId = requireNonEmpty(input.programId, 'programId')
  const entryId = requireNonEmpty(input.entryId, 'entryId')
  const program = bankDb.prepare('SELECT id, total_planned_entries FROM vocabulary_programs WHERE id = ?').get(programId)
  if (!program) throw new VocabularyStoreError('词汇课程不存在。', 404, 'program_not_found')
  const startEntry = bankDb.prepare(`
    SELECT id, headword, source_order FROM vocabulary_entries
    WHERE id = ? AND program_id = ?
  `).get(entryId, programId)
  if (!startEntry) {
    throw new VocabularyStoreError('起点单词不属于当前词汇课程。', 404, 'vocabulary_progress_entry_not_found')
  }
  if (!Number.isInteger(startEntry.source_order) || startEntry.source_order < 1 || startEntry.source_order > program.total_planned_entries) {
    throw new VocabularyStoreError('起点单词的课程位置无效。', 409, 'vocabulary_progress_entry_invalid')
  }

  const timestamp = nowIso()
  let discardedRunId = null
  let lastTarget = 15
  userDb.exec('BEGIN IMMEDIATE')
  try {
    const currentRun = userDb.prepare(`
      SELECT id FROM vocabulary_review_runs
      WHERE user_id = ? AND student_id = ? AND program_id = ? AND status <> 'frozen'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `).get(userId, studentId, programId)
    if (currentRun && input.replaceActiveRun !== true) {
      throw new VocabularyStoreError(
        '这位学生还有未结束的过词轮次。确认放弃本轮后再调整起点。',
        409,
        'vocabulary_progress_has_active_run',
      )
    }
    const existingProgress = userDb.prepare(`
      SELECT last_target FROM vocabulary_review_progress
      WHERE user_id = ? AND student_id = ? AND program_id = ?
    `).get(userId, studentId, programId)
    lastTarget = existingProgress?.last_target ?? 15
    if (currentRun) {
      discardedRunId = currentRun.id
      userDb.prepare('DELETE FROM vocabulary_review_runs WHERE id = ? AND user_id = ?').run(currentRun.id, userId)
    }
    const cursor = startEntry.source_order - 1
    userDb.prepare(`
      INSERT INTO vocabulary_review_progress (user_id, student_id, program_id, cursor, last_target, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, student_id, program_id) DO UPDATE SET
        cursor = excluded.cursor,
        updated_at = excluded.updated_at
    `).run(userId, studentId, programId, cursor, lastTarget, timestamp)
    userDb.exec('COMMIT')
  } catch (error) {
    userDb.exec('ROLLBACK')
    throw error
  }

  return {
    progress: {
      studentId,
      programId,
      cursor: startEntry.source_order - 1,
      lastTarget,
      updatedAt: timestamp,
    },
    startEntry: {
      id: startEntry.id,
      headword: startEntry.headword,
      sourceOrder: startEntry.source_order,
    },
    discardedRunId,
  }
}

export function createVocabularyReviewRun({ userDb, bankDb }, userId, input) {
  ensureUserVocabularyShape(userDb)
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
  if (temporaryStage && !bankDb.prepare(`
    SELECT 1 FROM vocabulary_groups WHERE program_id = ? AND stage = ? LIMIT 1
  `).get(programId, temporaryStage)) {
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
  const candidates = normalizeExampleCandidates(entry.exampleCandidates, entry.example, entry.teachingSenses ?? [entry.teachingSense])
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
    teachingSenses: entry.teachingSenses,
    pronunciationMode: entry.pronunciationMode,
    syllables: entry.syllables,
    pronunciationParts: entry.pronunciationParts,
    example: selectedExample.example,
    exampleSelection: selectedExample.exampleSelection,
    visual: entry.visual,
    audio: entry.audio,
    audioVariants: entry.audioVariants,
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

export function listVocabularySets(userDb, userId, studentId, programId) {
  ensureUserVocabularyShape(userDb)
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const normalizedProgramId = requireNonEmpty(programId, 'programId')
  return userDb.prepare(`
    SELECT id FROM vocabulary_sets
    WHERE user_id = ? AND student_id = ? AND program_id = ?
    ORDER BY created_at DESC LIMIT 20
  `).all(userId, studentId, normalizedProgramId).map((row) => readVocabularySetRows(userDb, userId, row.id))
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

function recordVocabularySetShareHistory(userDb, {
  setId,
  userId,
  shareId,
  status,
  createdAt,
  revokedAt = null,
}) {
  userDb.prepare(`
    INSERT INTO vocabulary_share_history
      (id, set_id, user_id, share_id, status, created_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(share_id) DO UPDATE SET
      status = excluded.status, revoked_at = excluded.revoked_at
  `).run(
    `vocabulary-share-history-${randomUUID()}`,
    setId,
    userId,
    shareId,
    status,
    createdAt,
    revokedAt,
  )
}

export function shareVocabularySet(userDb, userId, setId) {
  ensureUserVocabularyShape(userDb)
  readVocabularySetRows(userDb, userId, setId)
  const existing = userDb.prepare(`
    SELECT share_id, status, created_at, revoked_at
    FROM vocabulary_shares WHERE set_id = ? AND user_id = ?
  `).get(setId, userId)
  const timestamp = nowIso()
  if (existing) {
    if (existing.status === 'revoked') {
      recordVocabularySetShareHistory(userDb, {
        setId,
        userId,
        shareId: existing.share_id,
        status: 'revoked',
        createdAt: existing.created_at,
        revokedAt: existing.revoked_at ?? timestamp,
      })
      const shareId = createUniqueVocabularyShareId(userDb)
      userDb.prepare("UPDATE vocabulary_shares SET share_id = ?, status = 'active', created_at = ?, revoked_at = NULL WHERE set_id = ? AND user_id = ?")
        .run(shareId, timestamp, setId, userId)
      recordVocabularySetShareHistory(userDb, {
        setId,
        userId,
        shareId,
        status: 'active',
        createdAt: timestamp,
      })
      return { shareId, status: 'active' }
    }
    recordVocabularySetShareHistory(userDb, {
      setId,
      userId,
      shareId: existing.share_id,
      status: 'active',
      createdAt: existing.created_at,
    })
    return { shareId: existing.share_id, status: 'active' }
  }
  const shareId = createUniqueVocabularyShareId(userDb)
  userDb.prepare(`
    INSERT INTO vocabulary_shares (id, set_id, user_id, share_id, status, created_at)
    VALUES (?, ?, ?, ?, 'active', ?)
  `).run(`vocabulary-share-${randomUUID()}`, setId, userId, shareId, timestamp)
  recordVocabularySetShareHistory(userDb, {
    setId,
    userId,
    shareId,
    status: 'active',
    createdAt: timestamp,
  })
  return { shareId, status: 'active' }
}

export function revokeVocabularyShare(userDb, userId, setId) {
  ensureUserVocabularyShape(userDb)
  readVocabularySetRows(userDb, userId, setId)
  const share = userDb.prepare(`
    SELECT share_id, created_at FROM vocabulary_shares
    WHERE set_id = ? AND user_id = ?
  `).get(setId, userId)
  if (!share) throw new VocabularyStoreError('这个生词集还没有公开分享。', 404, 'vocabulary_share_not_found')
  const timestamp = nowIso()
  const result = userDb.prepare(`
    UPDATE vocabulary_shares SET status = 'revoked', revoked_at = ? WHERE set_id = ? AND user_id = ?
  `).run(timestamp, setId, userId)
  if (result.changes === 0) throw new VocabularyStoreError('这个生词集还没有公开分享。', 404, 'vocabulary_share_not_found')
  recordVocabularySetShareHistory(userDb, {
    setId,
    userId,
    shareId: share.share_id,
    status: 'revoked',
    createdAt: share.created_at,
    revokedAt: timestamp,
  })
  return { status: 'revoked' }
}

export function getPublicVocabularyShare(userDb, shareId) {
  ensureUserVocabularyShape(userDb)
  const share = userDb.prepare(`
    SELECT set_id, status FROM vocabulary_shares WHERE share_id = ?
  `).get(shareId)
  if (!share) {
    const historical = userDb.prepare('SELECT 1 FROM vocabulary_share_history WHERE share_id = ?').get(shareId)
    return { status: historical ? 'revoked' : 'not_found' }
  }
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

export function getPublicVocabularyListenResource(userDb, shareId) {
  ensureUserVocabularyShape(userDb)
  const share = userDb.prepare(`
    SELECT task_id, status FROM vocabulary_dictation_task_shares WHERE share_id = ?
  `).get(shareId)
  if (!share) {
    const historical = userDb.prepare(`
      SELECT status FROM vocabulary_dictation_task_share_history WHERE share_id = ?
    `).get(shareId)
    if (historical) return { status: 'revoked' }
    return getPublicVocabularyShare(userDb, shareId)
  }
  if (share.status !== 'active') return { status: 'revoked' }
  const task = userDb.prepare(`
    SELECT id, title, accent, entry_count, created_at
    FROM vocabulary_dictation_tasks WHERE id = ?
  `).get(share.task_id)
  if (!task) return { status: 'not_found' }
  const entries = userDb.prepare(`
    SELECT snapshot_json FROM vocabulary_dictation_task_entries
    WHERE task_id = ? ORDER BY order_index
  `).all(task.id).map((row) => projectPublicVocabularyEntry(parseJson(row.snapshot_json, null)))
  if (entries.length !== task.entry_count) {
    throw new VocabularyStoreError('这份听音任务的冻结快照不完整。', 500, 'vocabulary_share_snapshot_invalid')
  }
  return {
    status: 'active',
    set: {
      title: task.title,
      accent: task.accent,
      entryCount: task.entry_count,
      entries,
      createdAt: task.created_at,
    },
  }
}

export function getPublicVocabularyDictationShare(userDb, shareId) {
  ensureUserVocabularyShape(userDb)
  const share = userDb.prepare(`
    SELECT set_id, status FROM vocabulary_shares WHERE share_id = ?
  `).get(shareId)
  if (!share) {
    const historical = userDb.prepare('SELECT 1 FROM vocabulary_share_history WHERE share_id = ?').get(shareId)
    return { status: historical ? 'revoked' : 'not_found' }
  }
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

function readOwnedVocabularySetSnapshotRows(userDb, userId, setId) {
  const set = userDb.prepare(`
    SELECT * FROM vocabulary_sets WHERE id = ? AND user_id = ?
  `).get(setId, userId)
  if (!set) throw new VocabularyStoreError('生词组不存在。', 404, 'vocabulary_set_not_found')
  const rows = userDb.prepare(`
    SELECT entry_id, order_index, snapshot_json
    FROM vocabulary_set_entries WHERE set_id = ? ORDER BY order_index
  `).all(set.id)
  if (rows.length !== set.entry_count) {
    throw new VocabularyStoreError('这份生词组的冻结快照不完整。', 500, 'vocabulary_set_snapshot_invalid')
  }
  return {
    set,
    entries: rows.map((row, index) => {
      const snapshot = parseJson(row.snapshot_json, null)
      const entry = projectFrozenVocabularyEntry(snapshot)
      if (row.order_index !== index || entry.id !== row.entry_id) {
        throw new VocabularyStoreError('这份生词组的冻结快照已损坏。', 500, 'vocabulary_set_snapshot_invalid')
      }
      return { entryId: row.entry_id, orderIndex: row.order_index, snapshot, entry }
    }),
  }
}

function getOwnedDictationTaskRow(userDb, userId, taskId) {
  const task = userDb.prepare(`
    SELECT * FROM vocabulary_dictation_tasks WHERE id = ? AND user_id = ?
  `).get(taskId, userId)
  if (!task) throw new VocabularyStoreError('听写任务不存在。', 404, 'vocabulary_dictation_task_not_found')
  return task
}

function readDictationTaskRows(userDb, userId, taskId) {
  const task = getOwnedDictationTaskRow(userDb, userId, taskId)
  const rows = userDb.prepare(`
    SELECT entry_id, order_index, snapshot_json
    FROM vocabulary_dictation_task_entries WHERE task_id = ? ORDER BY order_index
  `).all(task.id)
  if (rows.length !== task.entry_count) {
    throw new VocabularyStoreError('听写任务的冻结快照不完整。', 500, 'vocabulary_dictation_task_snapshot_invalid')
  }
  const entries = rows.map((row, index) => {
    const snapshot = parseJson(row.snapshot_json, null)
    let entry
    try {
      entry = projectFrozenVocabularyEntry(snapshot)
    } catch {
      throw new VocabularyStoreError('听写任务的冻结快照已损坏。', 500, 'vocabulary_dictation_task_snapshot_invalid')
    }
    if (row.order_index !== index || entry.id !== row.entry_id) {
      throw new VocabularyStoreError('听写任务的冻结快照已损坏。', 500, 'vocabulary_dictation_task_snapshot_invalid')
    }
    return { entryId: row.entry_id, orderIndex: row.order_index, snapshot, entry }
  })
  const sources = userDb.prepare(`
    SELECT source.order_index, source.set_id, sets.title, sets.entry_count, sets.created_at
    FROM vocabulary_dictation_task_sources AS source
    JOIN vocabulary_sets AS sets ON sets.id = source.set_id
    WHERE source.task_id = ? ORDER BY source.order_index
  `).all(task.id).map((source) => ({
    setId: source.set_id,
    title: source.title,
    entryCount: source.entry_count,
    createdAt: source.created_at,
  }))
  const entrySources = userDb.prepare(`
    SELECT entry_sources.entry_id, entry_sources.set_id
    FROM vocabulary_dictation_task_entry_sources AS entry_sources
    JOIN vocabulary_dictation_task_sources AS task_sources
      ON task_sources.task_id = entry_sources.task_id AND task_sources.set_id = entry_sources.set_id
    WHERE entry_sources.task_id = ?
    ORDER BY task_sources.order_index
  `).all(task.id)
  const sourceIdsByEntry = new Map()
  for (const source of entrySources) {
    const ids = sourceIdsByEntry.get(source.entry_id) ?? []
    ids.push(source.set_id)
    sourceIdsByEntry.set(source.entry_id, ids)
  }
  const share = userDb.prepare(`
    SELECT share_id, status, created_at, revoked_at
    FROM vocabulary_dictation_task_shares WHERE task_id = ?
  `).get(task.id)
  const meaningRecallSource = userDb.prepare(`
    SELECT links.record_id, records.title, records.recall_date
    FROM vocabulary_meaning_recall_dictation_tasks AS links
    JOIN vocabulary_meaning_recall_records AS records ON records.id = links.record_id
    WHERE links.task_id = ?
  `).get(task.id)
  return {
    id: task.id,
    studentId: task.student_id,
    programId: task.program_id,
    title: task.title,
    accent: task.accent,
    materialLayout: task.material_layout === 'grouped' ? 'grouped' : 'merged',
    entryCount: task.entry_count,
    entries: entries.map(({ entry, entryId }) => ({
      ...entry,
      sourceSetIds: sourceIdsByEntry.get(entryId) ?? [],
    })),
    sourceSets: sources,
    share: share ? {
      shareId: share.share_id,
      status: share.status,
      createdAt: share.created_at,
      revokedAt: share.revoked_at,
    } : null,
    meaningRecallSource: meaningRecallSource ? {
      recordId: meaningRecallSource.record_id,
      title: meaningRecallSource.title,
      recallDate: meaningRecallSource.recall_date,
    } : null,
    taskDate: task.task_date,
    createdAt: task.created_at,
  }
}

function uniqueNonEmptyIds(value, label) {
  if (!Array.isArray(value)) throw new VocabularyStoreError(`${label}必须是列表。`)
  const seen = new Set()
  const ids = []
  for (const raw of value) {
    const id = requireNonEmpty(raw, label)
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function shuffledIds(ids) {
  const shuffled = [...ids]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomBytes(4).readUInt32BE(0) % (index + 1)
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function getOwnedMeaningRecallRecordRow(userDb, userId, recordId) {
  const record = userDb.prepare(`
    SELECT * FROM vocabulary_meaning_recall_records WHERE id = ? AND user_id = ?
  `).get(recordId, userId)
  if (!record) throw new VocabularyStoreError('词义抽查记录不存在。', 404, 'vocabulary_meaning_recall_record_not_found')
  return record
}

function readMeaningRecallRecordRows(userDb, userId, recordId) {
  const record = getOwnedMeaningRecallRecordRow(userDb, userId, recordId)
  const rows = userDb.prepare(`
    SELECT entry_id, order_index, snapshot_json, result
    FROM vocabulary_meaning_recall_record_entries WHERE record_id = ? ORDER BY order_index
  `).all(record.id)
  if (rows.length !== record.entry_count) {
    throw new VocabularyStoreError('词义抽查的冻结快照不完整。', 500, 'vocabulary_meaning_recall_snapshot_invalid')
  }
  const sources = userDb.prepare(`
    SELECT sources.order_index, sources.set_id, sets.title, sets.entry_count, sets.created_at
    FROM vocabulary_meaning_recall_record_sources AS sources
    JOIN vocabulary_sets AS sets ON sets.id = sources.set_id
    WHERE sources.record_id = ? ORDER BY sources.order_index
  `).all(record.id).map((source) => ({
    setId: source.set_id,
    title: source.title,
    entryCount: source.entry_count,
    createdAt: source.created_at,
  }))
  const sourceIdsByEntry = new Map()
  for (const source of userDb.prepare(`
    SELECT entry_sources.entry_id, entry_sources.set_id
    FROM vocabulary_meaning_recall_record_entry_sources AS entry_sources
    JOIN vocabulary_meaning_recall_record_sources AS record_sources
      ON record_sources.record_id = entry_sources.record_id AND record_sources.set_id = entry_sources.set_id
    WHERE entry_sources.record_id = ? ORDER BY record_sources.order_index
  `).all(record.id)) {
    const ids = sourceIdsByEntry.get(source.entry_id) ?? []
    ids.push(source.set_id)
    sourceIdsByEntry.set(source.entry_id, ids)
  }
  const entries = rows.map((row, index) => {
    const snapshot = parseJson(row.snapshot_json, null)
    let entry
    try {
      entry = projectFrozenVocabularyEntry(snapshot)
    } catch {
      throw new VocabularyStoreError('词义抽查的冻结快照已损坏。', 500, 'vocabulary_meaning_recall_snapshot_invalid')
    }
    if (row.order_index !== index || entry.id !== row.entry_id) {
      throw new VocabularyStoreError('词义抽查的冻结快照已损坏。', 500, 'vocabulary_meaning_recall_snapshot_invalid')
    }
    return {
      ...entry,
      result: row.result,
      sourceSetIds: sourceIdsByEntry.get(row.entry_id) ?? [],
      snapshot,
    }
  })
  const dictationTasks = userDb.prepare(`
    SELECT links.task_id, links.created_at, tasks.title
    FROM vocabulary_meaning_recall_dictation_tasks AS links
    JOIN vocabulary_dictation_tasks AS tasks ON tasks.id = links.task_id
    WHERE links.record_id = ? ORDER BY links.created_at, links.task_id
  `).all(record.id).map((task) => ({
    taskId: task.task_id,
    title: task.title,
    createdAt: task.created_at,
  }))
  return {
    id: record.id,
    studentId: record.student_id,
    programId: record.program_id,
    title: record.title,
    orderMode: record.order_mode,
    status: record.status,
    recallDate: record.recall_date,
    entryCount: record.entry_count,
    entries: entries.map(({ snapshot: _snapshot, ...entry }) => entry),
    sourceSets: sources,
    dictationTasks,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    completedAt: record.completed_at,
    voidedAt: record.voided_at,
    _entryRows: entries,
  }
}

function normalizeMeaningRecallResults(entryIds, rawResults, existingResults = null) {
  const providedByEntry = new Map()
  if (rawResults != null && !Array.isArray(rawResults)) {
    throw new VocabularyStoreError('词义抽查结果必须是列表。')
  }
  for (const raw of rawResults ?? []) {
    const entryId = requireNonEmpty(raw?.entryId, '词义抽查结果词条')
    if (providedByEntry.has(entryId)) throw new VocabularyStoreError('词义抽查结果不能包含重复词条。')
    if (!['correct', 'wrong', 'untested'].includes(raw?.result)) {
      throw new VocabularyStoreError('词义抽查结果状态无效。')
    }
    providedByEntry.set(entryId, raw.result)
  }
  const allowed = new Set(entryIds)
  for (const entryId of providedByEntry.keys()) {
    if (!allowed.has(entryId)) throw new VocabularyStoreError('词义抽查结果包含本轮以外的词。')
  }
  const existingByEntry = new Map((existingResults ?? []).map((row) => [row.entry_id, row.result]))
  return entryIds.map((entryId) => ({
    entryId,
    result: providedByEntry.get(entryId) ?? existingByEntry.get(entryId) ?? 'untested',
  }))
}

export function createVocabularyMeaningRecallRecord({ userDb }, userId, input = {}) {
  ensureUserVocabularyShape(userDb)
  const studentId = requireNonEmpty(input.studentId, '学生档案')
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const programId = requireNonEmpty(input.programId, '词汇课程')
  if (programId !== DICTATION_REVIEW_PROGRAM_ID) {
    throw new VocabularyStoreError('单词复习首版只支持万唯1600词。', 409, 'vocabulary_meaning_recall_program_not_supported')
  }
  const sourceSetIds = uniqueNonEmptyIds(input.sourceSetIds, '生词组 ID')
  if (!sourceSetIds.length) throw new VocabularyStoreError('词义抽查至少需要一个生词组。')
  const snapshotsByEntry = new Map()
  const sourceIdsByEntry = new Map()
  const sourceSets = sourceSetIds.map((setId) => {
    const source = readOwnedVocabularySetSnapshotRows(userDb, userId, setId)
    if (source.set.student_id !== studentId) {
      throw new VocabularyStoreError('所选生词组不属于当前学生。', 409, 'vocabulary_meaning_recall_student_mismatch')
    }
    if (source.set.program_id !== programId) {
      throw new VocabularyStoreError('所选生词组不属于当前词汇课程。', 409, 'vocabulary_meaning_recall_program_mismatch')
    }
    for (const item of source.entries) {
      if (!snapshotsByEntry.has(item.entryId)) snapshotsByEntry.set(item.entryId, item.snapshot)
      const ids = sourceIdsByEntry.get(item.entryId) ?? []
      ids.push(setId)
      sourceIdsByEntry.set(item.entryId, ids)
    }
    return source
  })
  const sourceOrderedEntryIds = [...new Set(sourceSets.flatMap((source) =>
    source.entries.map((entry) => entry.entryId)))]
  const explicitEntryIds = input.entryIds == null ? null : uniqueNonEmptyIds(input.entryIds, '词条 ID')
  const requestedEntryIds = explicitEntryIds ?? sourceOrderedEntryIds
  for (const entryId of requestedEntryIds) {
    if (!snapshotsByEntry.has(entryId)) {
      throw new VocabularyStoreError('词义抽查只能使用所选生词组中的词。', 409, 'vocabulary_meaning_recall_entry_outside_sources')
    }
  }
  const requestedEntryIdSet = new Set(requestedEntryIds)
  const orderMode = input.orderMode === 'source' ? 'source' : 'random'
  let orderedEntryIds = orderMode === 'source'
    ? sourceOrderedEntryIds.filter((entryId) => requestedEntryIdSet.has(entryId))
    : [...requestedEntryIds]
  if (orderedEntryIds.length < 1 || orderedEntryIds.length > 60) {
    throw new VocabularyStoreError('每次词义抽查必须包含 1–60 个去重后的词。')
  }
  if (orderMode === 'random') orderedEntryIds = shuffledIds(orderedEntryIds)
  const contributingSourceSetIds = sourceSetIds.filter((setId) =>
    orderedEntryIds.some((entryId) => (sourceIdsByEntry.get(entryId) ?? []).includes(setId)))
  const results = normalizeMeaningRecallResults(orderedEntryIds, input.results)
  const status = input.status === 'completed' ? 'completed' : 'draft'
  if (status === 'completed' && !results.some((result) => result.result !== 'untested')) {
    throw new VocabularyStoreError('至少要抽查一个词才能完成本轮。')
  }
  const recordId = `vocabulary-meaning-recall-record-${randomUUID()}`
  const timestamp = nowIso()
  const recallDate = normalizeMeaningRecallDate(input.recallDate)
  const title = normalizeMeaningRecallTitle(input.title, `${recallDate} 词义抽查`)
  userDb.exec('BEGIN')
  try {
    userDb.prepare(`
      INSERT INTO vocabulary_meaning_recall_records
        (id, user_id, student_id, program_id, title, order_mode, status, recall_date,
         entry_count, created_at, updated_at, completed_at, voided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      recordId, userId, studentId, programId, title, orderMode, status, recallDate,
      orderedEntryIds.length, timestamp, timestamp, status === 'completed' ? timestamp : null,
    )
    const insertSource = userDb.prepare(`
      INSERT INTO vocabulary_meaning_recall_record_sources (record_id, set_id, order_index) VALUES (?, ?, ?)
    `)
    contributingSourceSetIds.forEach((setId, index) => insertSource.run(recordId, setId, index))
    const resultByEntry = new Map(results.map((result) => [result.entryId, result.result]))
    const insertEntry = userDb.prepare(`
      INSERT INTO vocabulary_meaning_recall_record_entries
        (record_id, entry_id, order_index, snapshot_json, result)
      VALUES (?, ?, ?, ?, ?)
    `)
    const insertEntrySource = userDb.prepare(`
      INSERT INTO vocabulary_meaning_recall_record_entry_sources (record_id, entry_id, set_id)
      VALUES (?, ?, ?)
    `)
    orderedEntryIds.forEach((entryId, index) => {
      insertEntry.run(recordId, entryId, index, JSON.stringify(snapshotsByEntry.get(entryId)), resultByEntry.get(entryId))
      for (const setId of sourceIdsByEntry.get(entryId) ?? []) insertEntrySource.run(recordId, entryId, setId)
    })
    userDb.exec('COMMIT')
  } catch (error) {
    userDb.exec('ROLLBACK')
    throw error
  }
  const record = readMeaningRecallRecordRows(userDb, userId, recordId)
  const { _entryRows, ...publicRecord } = record
  return publicRecord
}

export function updateVocabularyMeaningRecallRecord(userDb, userId, recordId, input = {}) {
  ensureUserVocabularyShape(userDb)
  const record = getOwnedMeaningRecallRecordRow(userDb, userId, recordId)
  if (record.status === 'void') {
    throw new VocabularyStoreError('已作废的词义抽查需要先恢复。', 409, 'vocabulary_meaning_recall_record_void')
  }
  const existing = userDb.prepare(`
    SELECT entry_id, result FROM vocabulary_meaning_recall_record_entries
    WHERE record_id = ? ORDER BY order_index
  `).all(record.id)
  const results = normalizeMeaningRecallResults(existing.map((row) => row.entry_id), input.results, existing)
  const status = input.status === 'completed' ? 'completed' : input.status === 'draft' ? 'draft' : record.status
  if (status === 'completed' && !results.some((result) => result.result !== 'untested')) {
    throw new VocabularyStoreError('至少要抽查一个词才能完成本轮。')
  }
  const timestamp = nowIso()
  userDb.exec('BEGIN')
  try {
    userDb.prepare(`
      UPDATE vocabulary_meaning_recall_records
      SET title = ?, status = ?, recall_date = ?, updated_at = ?,
          completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE NULL END
      WHERE id = ? AND user_id = ?
    `).run(
      input.title == null ? record.title : normalizeMeaningRecallTitle(input.title),
      status,
      input.recallDate == null ? record.recall_date : normalizeMeaningRecallDate(input.recallDate),
      timestamp,
      status,
      timestamp,
      record.id,
      userId,
    )
    const updateResult = userDb.prepare(`
      UPDATE vocabulary_meaning_recall_record_entries SET result = ? WHERE record_id = ? AND entry_id = ?
    `)
    for (const result of results) updateResult.run(result.result, record.id, result.entryId)
    userDb.exec('COMMIT')
  } catch (error) {
    userDb.exec('ROLLBACK')
    throw error
  }
  const updated = readMeaningRecallRecordRows(userDb, userId, record.id)
  const { _entryRows, ...publicRecord } = updated
  return publicRecord
}

export function voidVocabularyMeaningRecallRecord(userDb, userId, recordId) {
  ensureUserVocabularyShape(userDb)
  const record = getOwnedMeaningRecallRecordRow(userDb, userId, recordId)
  if (record.status !== 'void') {
    const timestamp = nowIso()
    userDb.prepare(`
      UPDATE vocabulary_meaning_recall_records SET status = 'void', voided_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(timestamp, timestamp, record.id, userId)
  }
  const updated = readMeaningRecallRecordRows(userDb, userId, record.id)
  const { _entryRows, ...publicRecord } = updated
  return publicRecord
}

export function restoreVocabularyMeaningRecallRecord(userDb, userId, recordId) {
  ensureUserVocabularyShape(userDb)
  const record = getOwnedMeaningRecallRecordRow(userDb, userId, recordId)
  if (record.status === 'void') {
    userDb.prepare(`
      UPDATE vocabulary_meaning_recall_records
      SET status = ?, voided_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?
    `).run(record.completed_at ? 'completed' : 'draft', nowIso(), record.id, userId)
  }
  const updated = readMeaningRecallRecordRows(userDb, userId, record.id)
  const { _entryRows, ...publicRecord } = updated
  return publicRecord
}

export function getVocabularyMeaningRecallRecord(userDb, userId, recordId) {
  ensureUserVocabularyShape(userDb)
  const record = readMeaningRecallRecordRows(userDb, userId, recordId)
  const { _entryRows, ...publicRecord } = record
  return publicRecord
}

export function listVocabularyMeaningRecallRecords(userDb, userId, studentId, { limit = null } = {}) {
  ensureUserVocabularyShape(userDb)
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const safeLimit = limit == null ? null : Math.max(1, Math.min(5_000, Number(limit) || 100))
  const rows = safeLimit == null ? userDb.prepare(`
    SELECT id FROM vocabulary_meaning_recall_records
    WHERE user_id = ? AND student_id = ? ORDER BY recall_date DESC, updated_at DESC, id DESC
  `).all(userId, studentId) : userDb.prepare(`
    SELECT id FROM vocabulary_meaning_recall_records
    WHERE user_id = ? AND student_id = ? ORDER BY recall_date DESC, updated_at DESC, id DESC LIMIT ?
  `).all(userId, studentId, safeLimit)
  return rows.map((row) => getVocabularyMeaningRecallRecord(userDb, userId, row.id))
}

export function createVocabularyDictationTask({ userDb, bankDb }, userId, input = {}) {
  ensureUserVocabularyShape(userDb)
  const studentId = requireNonEmpty(input.studentId, '学生档案')
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const programId = requireNonEmpty(input.programId, '词汇课程')
  if (programId !== DICTATION_REVIEW_PROGRAM_ID) {
    throw new VocabularyStoreError('听写与复习首版只支持万唯1600词。', 409, 'vocabulary_dictation_program_not_supported')
  }
  const accent = input.accent === 'british' ? 'british' : input.accent === 'american' ? 'american' : null
  if (!accent) throw new VocabularyStoreError('听写任务必须选择美音或英音。')
  const materialLayout = normalizeDictationMaterialLayout(input.materialLayout)
  const meaningRecallRecordId = input.meaningRecallRecordId == null
    ? null
    : requireNonEmpty(input.meaningRecallRecordId, '来源词义抽查')
  const meaningRecall = meaningRecallRecordId
    ? readMeaningRecallRecordRows(userDb, userId, meaningRecallRecordId)
    : null
  if (meaningRecall) {
    if (meaningRecall.status !== 'completed') {
      throw new VocabularyStoreError('只能从已完成的词义抽查生成复习任务。', 409, 'vocabulary_meaning_recall_not_completed')
    }
    if (meaningRecall.studentId !== studentId || meaningRecall.programId !== programId) {
      throw new VocabularyStoreError('来源词义抽查不属于当前学生或课程。', 409, 'vocabulary_meaning_recall_task_mismatch')
    }
  }
  const explicitEntryIds = input.entryIds == null
    ? meaningRecall?.entries.map((entry) => entry.id) ?? null
    : uniqueNonEmptyIds(input.entryIds, '词条 ID')
  const requestedSourceSetIds = input.sourceSetIds == null ? [] : uniqueNonEmptyIds(input.sourceSetIds, '生词组 ID')
  const sourceTaskIds = input.sourceTaskIds == null ? [] : uniqueNonEmptyIds(input.sourceTaskIds, '来源听写任务 ID')
  const taskId = `vocabulary-dictation-task-${randomUUID()}`
  const snapshotsByEntry = new Map()
  const sourceIdsByEntry = new Map()
  const sourceTaskEntryOrder = []
  const sourceTaskEntryIds = new Set()
  const sourceTaskSetIds = []
  const selectedEntryIds = explicitEntryIds ? new Set(explicitEntryIds) : null
  const appendSourceId = (entryId, setId) => {
    const ids = sourceIdsByEntry.get(entryId) ?? []
    if (!ids.includes(setId)) ids.push(setId)
    sourceIdsByEntry.set(entryId, ids)
  }
  for (const sourceTaskId of sourceTaskIds) {
    const sourceTask = getOwnedDictationTaskRow(userDb, userId, sourceTaskId)
    if (sourceTask.student_id !== studentId) {
      throw new VocabularyStoreError('所选听写任务不属于当前学生。', 409, 'vocabulary_dictation_student_mismatch')
    }
    if (sourceTask.program_id !== programId) {
      throw new VocabularyStoreError('所选听写任务不属于当前词汇课程。', 409, 'vocabulary_dictation_program_mismatch')
    }
    const sourceRows = userDb.prepare(`
      SELECT entry_id, order_index, snapshot_json
      FROM vocabulary_dictation_task_entries WHERE task_id = ? ORDER BY order_index
    `).all(sourceTask.id)
    if (sourceRows.length !== sourceTask.entry_count) {
      throw new VocabularyStoreError('来源听写任务的冻结快照不完整。', 500, 'vocabulary_dictation_task_snapshot_invalid')
    }
    const sourceEntrySets = userDb.prepare(`
      SELECT entry_id, set_id FROM vocabulary_dictation_task_entry_sources WHERE task_id = ?
    `).all(sourceTask.id)
    const sourceSetsByEntry = new Map()
    for (const source of sourceEntrySets) {
      const ids = sourceSetsByEntry.get(source.entry_id) ?? []
      if (!ids.includes(source.set_id)) ids.push(source.set_id)
      sourceSetsByEntry.set(source.entry_id, ids)
    }
    sourceRows.forEach((row, index) => {
      if (row.order_index !== index) {
        throw new VocabularyStoreError('来源听写任务的冻结快照已损坏。', 500, 'vocabulary_dictation_task_snapshot_invalid')
      }
      if (selectedEntryIds && !selectedEntryIds.has(row.entry_id)) return
      const snapshot = parseJson(row.snapshot_json, null)
      let entry
      try {
        entry = projectFrozenVocabularyEntry(snapshot)
      } catch {
        throw new VocabularyStoreError('来源听写任务的冻结快照已损坏。', 500, 'vocabulary_dictation_task_snapshot_invalid')
      }
      if (entry.id !== row.entry_id) {
        throw new VocabularyStoreError('来源听写任务的冻结快照已损坏。', 500, 'vocabulary_dictation_task_snapshot_invalid')
      }
      if (!snapshotsByEntry.has(row.entry_id)) snapshotsByEntry.set(row.entry_id, snapshot)
      if (!sourceTaskEntryOrder.includes(row.entry_id)) sourceTaskEntryOrder.push(row.entry_id)
      sourceTaskEntryIds.add(row.entry_id)
      for (const setId of sourceSetsByEntry.get(row.entry_id) ?? []) {
        appendSourceId(row.entry_id, setId)
        if (!sourceTaskSetIds.includes(setId)) sourceTaskSetIds.push(setId)
      }
    })
  }
  const sourceSetIds = [...new Set([
    ...(requestedSourceSetIds.length
      ? requestedSourceSetIds
      : meaningRecall?.sourceSets.map((source) => source.setId) ?? []),
    ...sourceTaskSetIds,
  ])]
  const sourceSets = sourceSetIds.map((setId) => {
    const source = readOwnedVocabularySetSnapshotRows(userDb, userId, setId)
    if (source.set.student_id !== studentId) {
      throw new VocabularyStoreError('所选生词组不属于当前学生。', 409, 'vocabulary_dictation_student_mismatch')
    }
    if (source.set.program_id !== programId) {
      throw new VocabularyStoreError('所选生词组不属于当前词汇课程。', 409, 'vocabulary_dictation_program_mismatch')
    }
    for (const item of source.entries) {
      if (!snapshotsByEntry.has(item.entryId)) snapshotsByEntry.set(item.entryId, item.snapshot)
      appendSourceId(item.entryId, setId)
    }
    return source
  })

  if (meaningRecall) {
    const recallRowsByEntry = new Map(meaningRecall._entryRows.map((entry) => [entry.id, entry]))
    for (const entryId of explicitEntryIds ?? []) {
      const recallEntry = recallRowsByEntry.get(entryId)
      if (!recallEntry) {
        throw new VocabularyStoreError('复习任务只能使用来源词义抽查中的词。', 409, 'vocabulary_meaning_recall_task_entry_mismatch')
      }
      snapshotsByEntry.set(entryId, recallEntry.snapshot)
    }
  }

  let orderedEntryIds = explicitEntryIds
  if (!orderedEntryIds) {
    if (sourceTaskEntryOrder.length) {
      orderedEntryIds = sourceTaskEntryOrder
    } else {
      orderedEntryIds = []
      const seen = new Set()
      for (const source of sourceSets) {
        for (const item of source.entries) {
          if (seen.has(item.entryId)) continue
          seen.add(item.entryId)
          orderedEntryIds.push(item.entryId)
        }
      }
    }
  }
  if (sourceTaskIds.length) {
    for (const entryId of orderedEntryIds) {
      if (!sourceTaskEntryIds.has(entryId)) {
        throw new VocabularyStoreError('合并任务只能使用所选听写任务中的词。', 409, 'vocabulary_dictation_entry_outside_source_tasks')
      }
    }
  } else if (!sourceSets.length) {
    const program = getVocabularyProgram(bankDb, programId, { includeExampleCandidates: true })
    if (!program) throw new VocabularyStoreError('词汇课程不存在。', 404, 'program_not_found')
    const entriesById = new Map(program.entries.map((entry) => [entry.id, entry]))
    for (const entryId of orderedEntryIds) {
      const entry = entriesById.get(entryId)
      if (!entry) throw new VocabularyStoreError('听写任务包含词库中不存在的词条。', 404, 'vocabulary_entry_not_found')
      if (!snapshotsByEntry.has(entryId)) snapshotsByEntry.set(entryId, snapshotEntry(entry, taskId))
    }
  } else {
    for (const entryId of orderedEntryIds) {
      if (!snapshotsByEntry.has(entryId)) {
        throw new VocabularyStoreError('听写任务只能使用所选生词组中的词。', 409, 'vocabulary_dictation_entry_outside_sources')
      }
    }
  }
  if (orderedEntryIds.length < 1 || orderedEntryIds.length > 60) {
    throw new VocabularyStoreError('每份二维码听写必须包含 1–60 个去重后的词。')
  }
  const title = normalizeDictationTitle(input.title)
  const taskDate = normalizeDictationDate(input.taskDate)
  const timestamp = nowIso()
  userDb.exec('SAVEPOINT create_vocabulary_dictation_task')
  try {
    userDb.prepare(`
      INSERT INTO vocabulary_dictation_tasks
        (id, user_id, student_id, program_id, title, accent, entry_count, task_date, material_layout, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(taskId, userId, studentId, programId, title, accent, orderedEntryIds.length, taskDate, materialLayout, timestamp)
    const insertSource = userDb.prepare(`
      INSERT INTO vocabulary_dictation_task_sources (task_id, set_id, order_index) VALUES (?, ?, ?)
    `)
    sourceSetIds.forEach((setId, index) => insertSource.run(taskId, setId, index))
    const insertEntry = userDb.prepare(`
      INSERT INTO vocabulary_dictation_task_entries (task_id, entry_id, order_index, snapshot_json)
      VALUES (?, ?, ?, ?)
    `)
    const insertEntrySource = userDb.prepare(`
      INSERT INTO vocabulary_dictation_task_entry_sources (task_id, entry_id, set_id)
      VALUES (?, ?, ?)
    `)
    orderedEntryIds.forEach((entryId, index) => {
      insertEntry.run(taskId, entryId, index, JSON.stringify(snapshotsByEntry.get(entryId)))
      for (const setId of sourceIdsByEntry.get(entryId) ?? []) insertEntrySource.run(taskId, entryId, setId)
    })
    if (meaningRecall) {
      userDb.prepare(`
        INSERT INTO vocabulary_meaning_recall_dictation_tasks (record_id, task_id, created_at)
        VALUES (?, ?, ?)
      `).run(meaningRecall.id, taskId, timestamp)
    }
    if (input.share === true) {
      activateVocabularyDictationTaskShare(userDb, userId, taskId, timestamp)
    }
    userDb.exec('RELEASE SAVEPOINT create_vocabulary_dictation_task')
  } catch (error) {
    userDb.exec('ROLLBACK TO SAVEPOINT create_vocabulary_dictation_task')
    userDb.exec('RELEASE SAVEPOINT create_vocabulary_dictation_task')
    throw error
  }
  return readDictationTaskRows(userDb, userId, taskId)
}

export function createVocabularySetErrorTasks({ userDb, bankDb }, userId, input = {}) {
  ensureUserVocabularyShape(userDb)
  const studentId = requireNonEmpty(input.studentId, '学生档案')
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const programId = requireNonEmpty(input.programId ?? DICTATION_REVIEW_PROGRAM_ID, '词汇课程')
  if (programId !== DICTATION_REVIEW_PROGRAM_ID) {
    throw new VocabularyStoreError('错词资料首版只支持万唯1600词。', 409, 'vocabulary_set_errors_program_not_supported')
  }
  const sourceSetIds = uniqueNonEmptyIds(input.sourceSetIds, '生词组 ID')
  if (!sourceSetIds.length) throw new VocabularyStoreError('至少选择一个生词组。')
  const accent = input.accent === 'british' ? 'british' : input.accent === 'american' ? 'american' : null
  if (!accent) throw new VocabularyStoreError('错词资料必须选择美音或英音。')
  const materialLayout = normalizeDictationMaterialLayout(input.materialLayout)
  const taskDate = normalizeDictationDate(input.taskDate)

  const selectedSets = sourceSetIds.map((setId) => {
    const source = readOwnedVocabularySetSnapshotRows(userDb, userId, setId)
    if (source.set.student_id !== studentId) {
      throw new VocabularyStoreError('所选生词组不属于当前学生。', 409, 'vocabulary_set_errors_student_mismatch')
    }
    if (source.set.program_id !== programId) {
      throw new VocabularyStoreError('所选生词组不属于当前词汇课程。', 409, 'vocabulary_set_errors_program_mismatch')
    }
    return source
  })
  const selectedSetIdSet = new Set(sourceSetIds)
  const unresolvedByEntry = new Map()
  for (const state of [
    ...getStudentVocabularyMeaningStates(userDb, userId, studentId, programId),
    ...getStudentVocabularyReviewStates(userDb, userId, studentId, programId),
  ]) {
    if (state.status === 'improved' || state.paused) continue
    const relevantSourceIds = state.sourceSetIds.filter((setId) => selectedSetIdSet.has(setId))
    if (!relevantSourceIds.length) continue
    const current = unresolvedByEntry.get(state.id) ?? []
    unresolvedByEntry.set(state.id, [...new Set([...current, ...relevantSourceIds])])
  }

  const orderedEntryIds = []
  const seen = new Set()
  for (const source of selectedSets) {
    for (const item of source.entries) {
      if (seen.has(item.entryId) || !unresolvedByEntry.get(item.entryId)?.includes(source.set.id)) continue
      seen.add(item.entryId)
      orderedEntryIds.push(item.entryId)
    }
  }
  if (!orderedEntryIds.length) {
    throw new VocabularyStoreError('所选生词组暂无需要复习的错词。', 409, 'vocabulary_set_errors_empty')
  }

  const chunks = []
  for (let index = 0; index < orderedEntryIds.length; index += 60) {
    chunks.push(orderedEntryIds.slice(index, index + 60))
  }
  const taskTitle = `${taskDate} 错词复听写`
  const tasks = []
  userDb.exec('BEGIN')
  try {
    chunks.forEach((entryIds, index) => {
      const contributingSourceSetIds = selectedSets
        .filter((source) => entryIds.some((entryId) => unresolvedByEntry.get(entryId)?.includes(source.set.id)))
        .map((source) => source.set.id)
      const task = createVocabularyDictationTask({ userDb, bankDb }, userId, {
        studentId,
        programId,
        sourceSetIds: contributingSourceSetIds,
        entryIds,
        taskDate,
        title: chunks.length > 1 ? `${taskTitle}（${index + 1}/${chunks.length}）` : taskTitle,
        accent,
        materialLayout,
        share: true,
      })
      userDb.prepare('DELETE FROM vocabulary_dictation_task_entry_sources WHERE task_id = ?').run(task.id)
      const insertExactSource = userDb.prepare(`
        INSERT INTO vocabulary_dictation_task_entry_sources (task_id, entry_id, set_id)
        VALUES (?, ?, ?)
      `)
      for (const entryId of entryIds) {
        for (const setId of unresolvedByEntry.get(entryId) ?? []) {
          if (contributingSourceSetIds.includes(setId)) {
            insertExactSource.run(task.id, entryId, setId)
          }
        }
      }
      tasks.push(readDictationTaskRows(userDb, userId, task.id))
    })
    userDb.exec('COMMIT')
  } catch (error) {
    userDb.exec('ROLLBACK')
    throw error
  }
  return tasks
}

export function listVocabularyDictationTasks(userDb, userId, studentId, { limit = null } = {}) {
  ensureUserVocabularyShape(userDb)
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const safeLimit = limit == null ? null : Math.max(1, Math.min(5_000, Number(limit) || 50))
  const rows = safeLimit == null ? userDb.prepare(`
    SELECT id FROM vocabulary_dictation_tasks
    WHERE user_id = ? AND student_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(userId, studentId) : userDb.prepare(`
    SELECT id FROM vocabulary_dictation_tasks
    WHERE user_id = ? AND student_id = ?
    ORDER BY created_at DESC, id DESC LIMIT ?
  `).all(userId, studentId, safeLimit)
  return rows.map((row) => readDictationTaskRows(userDb, userId, row.id))
}

export function getVocabularyDictationTask(userDb, userId, taskId) {
  ensureUserVocabularyShape(userDb)
  return readDictationTaskRows(userDb, userId, taskId)
}

function createUniqueVocabularyShareId(userDb) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const shareId = randomBytes(24).toString('base64url')
    const exists = userDb.prepare(`
      SELECT 1 FROM vocabulary_shares WHERE share_id = ?
      UNION ALL
      SELECT 1 FROM vocabulary_share_history WHERE share_id = ?
      UNION ALL
      SELECT 1 FROM vocabulary_dictation_task_shares WHERE share_id = ?
      UNION ALL
      SELECT 1 FROM vocabulary_dictation_task_share_history WHERE share_id = ?
      LIMIT 1
    `).get(shareId, shareId, shareId, shareId)
    if (!exists) return shareId
  }
  throw new VocabularyStoreError('暂时无法生成听写链接，请重试。', 500, 'vocabulary_share_generation_failed')
}

function activateVocabularyDictationTaskShare(userDb, userId, taskId, timestamp = nowIso()) {
  const existing = userDb.prepare(`
    SELECT share_id, status, created_at, revoked_at FROM vocabulary_dictation_task_shares
    WHERE task_id = ? AND user_id = ?
  `).get(taskId, userId)
  const recordHistory = (shareId, status, createdAt, revokedAt = null) => userDb.prepare(`
    INSERT INTO vocabulary_dictation_task_share_history
      (id, task_id, user_id, share_id, status, created_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(share_id) DO UPDATE SET
      status = excluded.status, revoked_at = excluded.revoked_at
  `).run(
    `vocabulary-dictation-share-history-${randomUUID()}`,
    taskId,
    userId,
    shareId,
    status,
    createdAt,
    revokedAt,
  )
  if (existing?.status === 'active') {
    recordHistory(existing.share_id, 'active', existing.created_at, null)
    return { shareId: existing.share_id, status: 'active' }
  }
  const shareId = createUniqueVocabularyShareId(userDb)
  if (existing) {
    recordHistory(existing.share_id, 'revoked', existing.created_at, existing.revoked_at ?? timestamp)
    userDb.prepare(`
      UPDATE vocabulary_dictation_task_shares
      SET share_id = ?, status = 'active', created_at = ?, revoked_at = NULL
      WHERE task_id = ? AND user_id = ?
    `).run(shareId, timestamp, taskId, userId)
  } else {
    userDb.prepare(`
      INSERT INTO vocabulary_dictation_task_shares
        (id, task_id, user_id, share_id, status, created_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(`vocabulary-dictation-share-${randomUUID()}`, taskId, userId, shareId, timestamp)
  }
  recordHistory(shareId, 'active', timestamp, null)
  return { shareId, status: 'active' }
}

export function shareVocabularyDictationTask(userDb, userId, taskId) {
  ensureUserVocabularyShape(userDb)
  getOwnedDictationTaskRow(userDb, userId, taskId)
  return activateVocabularyDictationTaskShare(userDb, userId, taskId)
}

export function revokeVocabularyDictationTaskShare(userDb, userId, taskId) {
  ensureUserVocabularyShape(userDb)
  getOwnedDictationTaskRow(userDb, userId, taskId)
  const share = userDb.prepare(`
    SELECT share_id, created_at FROM vocabulary_dictation_task_shares
    WHERE task_id = ? AND user_id = ?
  `).get(taskId, userId)
  if (!share) throw new VocabularyStoreError('这份听写还没有公开分享。', 404, 'vocabulary_share_not_found')
  const timestamp = nowIso()
  const result = userDb.prepare(`
    UPDATE vocabulary_dictation_task_shares
    SET status = 'revoked', revoked_at = ? WHERE task_id = ? AND user_id = ?
  `).run(timestamp, taskId, userId)
  userDb.prepare(`
    INSERT INTO vocabulary_dictation_task_share_history
      (id, task_id, user_id, share_id, status, created_at, revoked_at)
    VALUES (?, ?, ?, ?, 'revoked', ?, ?)
    ON CONFLICT(share_id) DO UPDATE SET status = 'revoked', revoked_at = excluded.revoked_at
  `).run(
    `vocabulary-dictation-share-history-${randomUUID()}`,
    taskId,
    userId,
    share.share_id,
    share.created_at,
    timestamp,
  )
  if (!result.changes) throw new VocabularyStoreError('这份听写还没有公开分享。', 404, 'vocabulary_share_not_found')
  return { status: 'revoked' }
}

export function getPublicVocabularyDictationResource(userDb, shareId) {
  ensureUserVocabularyShape(userDb)
  const share = userDb.prepare(`
    SELECT task_id, status FROM vocabulary_dictation_task_shares WHERE share_id = ?
  `).get(shareId)
  if (!share) {
    const historical = userDb.prepare(`
      SELECT status FROM vocabulary_dictation_task_share_history WHERE share_id = ?
    `).get(shareId)
    if (historical) return { status: 'revoked' }
    return getPublicVocabularyDictationShare(userDb, shareId)
  }
  if (share.status !== 'active') return { status: 'revoked' }
  const task = userDb.prepare(`
    SELECT id, title, accent, entry_count, created_at
    FROM vocabulary_dictation_tasks WHERE id = ?
  `).get(share.task_id)
  if (!task) return { status: 'not_found' }
  const entries = userDb.prepare(`
    SELECT snapshot_json FROM vocabulary_dictation_task_entries
    WHERE task_id = ? ORDER BY order_index
  `).all(task.id).map((row) => projectPublicVocabularyDictationEntry(parseJson(row.snapshot_json, null)))
  if (entries.length !== task.entry_count) {
    throw new VocabularyStoreError('这份听写任务的冻结快照不完整。', 500, 'vocabulary_share_snapshot_invalid')
  }
  return {
    status: 'active',
    set: {
      title: task.title,
      accent: task.accent,
      entryCount: task.entry_count,
      entries,
      createdAt: task.created_at,
    },
  }
}

function normalizeDictationResults(taskRows, rawResults, mode, existingResults = null) {
  const provided = Array.isArray(rawResults) ? rawResults : null
  const providedByEntry = new Map()
  if (provided) {
    for (const raw of provided) {
      const entryId = requireNonEmpty(raw?.entryId, '听写结果词条')
      if (providedByEntry.has(entryId)) throw new VocabularyStoreError('听写结果不能包含重复词条。')
      const result = raw?.result
      if (!['correct', 'wrong', 'untested'].includes(result)) throw new VocabularyStoreError('听写结果状态无效。')
      providedByEntry.set(entryId, {
        result,
        wrongSpelling: result === 'wrong'
          ? normalizeOptionalText(raw?.wrongSpelling, '错误拼写', 80)
          : '',
      })
    }
  }
  const existingByEntry = new Map((existingResults ?? []).map((result) => [result.entry_id, {
    result: result.result,
    wrongSpelling: result.wrong_spelling,
  }]))
  const allowed = new Set(taskRows.map((row) => row.entryId))
  for (const entryId of providedByEntry.keys()) {
    if (!allowed.has(entryId)) throw new VocabularyStoreError('听写结果包含任务以外的词。')
  }
  return taskRows.map((row) => {
    const chosen = providedByEntry.get(row.entryId)
      ?? existingByEntry.get(row.entryId)
      ?? { result: mode === 'all' ? 'correct' : 'untested', wrongSpelling: '' }
    return {
      entryId: row.entryId,
      orderIndex: row.orderIndex,
      result: chosen.result,
      wrongSpelling: chosen.result === 'wrong' ? chosen.wrongSpelling : '',
    }
  })
}

function serializeDictationRecord(userDb, userId, recordId) {
  const record = userDb.prepare(`
    SELECT * FROM vocabulary_dictation_records WHERE id = ? AND user_id = ?
  `).get(recordId, userId)
  if (!record) throw new VocabularyStoreError('听写记录不存在。', 404, 'vocabulary_dictation_record_not_found')
  const task = readDictationTaskRows(userDb, userId, record.task_id)
  const results = userDb.prepare(`
    SELECT entry_id, order_index, result, wrong_spelling
    FROM vocabulary_dictation_record_results WHERE record_id = ? ORDER BY order_index
  `).all(record.id)
  const resultByEntry = new Map(results.map((result) => [result.entry_id, result]))
  return {
    id: record.id,
    studentId: record.student_id,
    taskId: record.task_id,
    taskTitle: task.title,
    mode: record.mode,
    status: record.status,
    dictationDate: record.dictation_date,
    note: record.note,
    entries: task.entries.map((entry, orderIndex) => {
      const result = resultByEntry.get(entry.id)
      if (!result || result.order_index !== orderIndex) {
        throw new VocabularyStoreError('听写记录结果不完整。', 500, 'vocabulary_dictation_record_invalid')
      }
      return {
        ...entry,
        result: result.result,
        wrongSpelling: result.wrong_spelling,
      }
    }),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    completedAt: record.completed_at,
    voidedAt: record.voided_at,
  }
}

function writeDictationRecordResults(userDb, recordId, results) {
  userDb.prepare('DELETE FROM vocabulary_dictation_record_results WHERE record_id = ?').run(recordId)
  const insert = userDb.prepare(`
    INSERT INTO vocabulary_dictation_record_results
      (record_id, entry_id, order_index, result, wrong_spelling)
    VALUES (?, ?, ?, ?, ?)
  `)
  for (const result of results) {
    insert.run(recordId, result.entryId, result.orderIndex, result.result, result.wrongSpelling)
  }
}

export function createVocabularyDictationRecord(userDb, userId, taskId, input = {}) {
  ensureUserVocabularyShape(userDb)
  const task = getOwnedDictationTaskRow(userDb, userId, taskId)
  requireOwnedVocabularyStudent(userDb, userId, task.student_id)
  const mode = input.mode === 'partial' ? 'partial' : 'all'
  const status = input.status === 'completed' ? 'completed' : 'draft'
  const rows = readDictationTaskRows(userDb, userId, taskId).entries.map((entry, orderIndex) => ({
    entryId: entry.id,
    orderIndex,
  }))
  const results = normalizeDictationResults(rows, input.results, mode)
  if (status === 'completed' && !results.some((result) => result.result !== 'untested')) {
    throw new VocabularyStoreError('至少要有一个实际听写过的词才能完成批改。')
  }
  const id = `vocabulary-dictation-record-${randomUUID()}`
  const timestamp = nowIso()
  const note = normalizeOptionalText(input.note, '教师备注', 300)
  userDb.exec('BEGIN')
  try {
    userDb.prepare(`
      INSERT INTO vocabulary_dictation_records
        (id, user_id, student_id, task_id, mode, status, dictation_date, note,
         created_at, updated_at, completed_at, voided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      id, userId, task.student_id, task.id, mode, status, normalizeDictationDate(input.dictationDate), note,
      timestamp, timestamp, status === 'completed' ? timestamp : null,
    )
    writeDictationRecordResults(userDb, id, results)
    userDb.exec('COMMIT')
  } catch (error) {
    userDb.exec('ROLLBACK')
    throw error
  }
  return serializeDictationRecord(userDb, userId, id)
}

export function updateVocabularyDictationRecord(userDb, userId, recordId, input = {}) {
  ensureUserVocabularyShape(userDb)
  const record = userDb.prepare(`
    SELECT * FROM vocabulary_dictation_records WHERE id = ? AND user_id = ?
  `).get(recordId, userId)
  if (!record) throw new VocabularyStoreError('听写记录不存在。', 404, 'vocabulary_dictation_record_not_found')
  if (record.status === 'void') throw new VocabularyStoreError('已作废的听写记录需要先恢复。', 409, 'vocabulary_dictation_record_void')
  const taskRows = readDictationTaskRows(userDb, userId, record.task_id).entries.map((entry, orderIndex) => ({
    entryId: entry.id,
    orderIndex,
  }))
  const existing = userDb.prepare(`
    SELECT entry_id, result, wrong_spelling FROM vocabulary_dictation_record_results WHERE record_id = ?
  `).all(record.id)
  const mode = input.mode === 'partial' ? 'partial' : input.mode === 'all' ? 'all' : record.mode
  const status = input.status === 'completed' ? 'completed' : input.status === 'draft' ? 'draft' : record.status
  const results = normalizeDictationResults(taskRows, input.results, mode, existing)
  if (status === 'completed' && !results.some((result) => result.result !== 'untested')) {
    throw new VocabularyStoreError('至少要有一个实际听写过的词才能完成批改。')
  }
  const timestamp = nowIso()
  userDb.exec('BEGIN')
  try {
    userDb.prepare(`
      UPDATE vocabulary_dictation_records
      SET mode = ?, status = ?, dictation_date = ?, note = ?, updated_at = ?,
          completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE NULL END
      WHERE id = ? AND user_id = ?
    `).run(
      mode,
      status,
      input.dictationDate == null ? record.dictation_date : normalizeDictationDate(input.dictationDate),
      input.note == null ? record.note : normalizeOptionalText(input.note, '教师备注', 300),
      timestamp,
      status,
      timestamp,
      record.id,
      userId,
    )
    writeDictationRecordResults(userDb, record.id, results)
    userDb.exec('COMMIT')
  } catch (error) {
    userDb.exec('ROLLBACK')
    throw error
  }
  return serializeDictationRecord(userDb, userId, record.id)
}

export function voidVocabularyDictationRecord(userDb, userId, recordId) {
  ensureUserVocabularyShape(userDb)
  const record = userDb.prepare(`
    SELECT status FROM vocabulary_dictation_records WHERE id = ? AND user_id = ?
  `).get(recordId, userId)
  if (!record) throw new VocabularyStoreError('听写记录不存在。', 404, 'vocabulary_dictation_record_not_found')
  if (record.status !== 'void') {
    userDb.prepare(`
      UPDATE vocabulary_dictation_records SET status = 'void', voided_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(nowIso(), nowIso(), recordId, userId)
  }
  return serializeDictationRecord(userDb, userId, recordId)
}

export function restoreVocabularyDictationRecord(userDb, userId, recordId) {
  ensureUserVocabularyShape(userDb)
  const record = userDb.prepare(`
    SELECT status, completed_at FROM vocabulary_dictation_records WHERE id = ? AND user_id = ?
  `).get(recordId, userId)
  if (!record) throw new VocabularyStoreError('听写记录不存在。', 404, 'vocabulary_dictation_record_not_found')
  if (record.status === 'void') {
    userDb.prepare(`
      UPDATE vocabulary_dictation_records
      SET status = ?, voided_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?
    `).run(record.completed_at ? 'completed' : 'draft', nowIso(), recordId, userId)
  }
  return serializeDictationRecord(userDb, userId, recordId)
}

export function listVocabularyDictationRecords(userDb, userId, studentId, { limit = null } = {}) {
  ensureUserVocabularyShape(userDb)
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const safeLimit = limit == null ? null : Math.max(1, Math.min(5_000, Number(limit) || 100))
  const rows = safeLimit == null ? userDb.prepare(`
    SELECT id FROM vocabulary_dictation_records
    WHERE user_id = ? AND student_id = ?
    ORDER BY dictation_date DESC, updated_at DESC, id DESC
  `).all(userId, studentId) : userDb.prepare(`
    SELECT id FROM vocabulary_dictation_records
    WHERE user_id = ? AND student_id = ?
    ORDER BY dictation_date DESC, updated_at DESC, id DESC LIMIT ?
  `).all(userId, studentId, safeLimit)
  return rows.map((row) => serializeDictationRecord(userDb, userId, row.id))
}

export function getVocabularyDictationRecord(userDb, userId, recordId) {
  ensureUserVocabularyShape(userDb)
  return serializeDictationRecord(userDb, userId, recordId)
}

function compareVocabularyReviewStates(left, right) {
  return right.currentConsecutiveWrong - left.currentConsecutiveWrong
    || right.recentWrongRate - left.recentWrongRate
    || right.totalWrong - left.totalWrong
    || String(right.lastWrongDate ?? '').localeCompare(String(left.lastWrongDate ?? ''))
    || left.headword.localeCompare(right.headword, 'en')
}

export function getStudentVocabularyReviewStates(userDb, userId, studentId, programId) {
  ensureUserVocabularyShape(userDb)
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const rows = userDb.prepare(`
    SELECT records.id AS record_id, records.dictation_date, records.completed_at,
      results.entry_id, results.result, results.wrong_spelling,
      entries.snapshot_json, tasks.id AS task_id
    FROM vocabulary_dictation_records AS records
    JOIN vocabulary_dictation_record_results AS results ON results.record_id = records.id
    JOIN vocabulary_dictation_tasks AS tasks ON tasks.id = records.task_id
    JOIN vocabulary_dictation_task_entries AS entries
      ON entries.task_id = tasks.id AND entries.entry_id = results.entry_id
    WHERE records.user_id = ? AND records.student_id = ? AND tasks.program_id = ?
      AND records.status = 'completed' AND results.result <> 'untested'
    ORDER BY results.entry_id, records.dictation_date, records.completed_at, records.id
  `).all(userId, studentId, programId)
  const flags = new Map(userDb.prepare(`
    SELECT entry_id, pinned, paused FROM vocabulary_student_word_flags
    WHERE user_id = ? AND student_id = ? AND program_id = ?
  `).all(userId, studentId, programId).map((row) => [row.entry_id, row]))
  const sourceIdsByEntry = new Map()
  for (const row of userDb.prepare(`
    SELECT DISTINCT sources.entry_id, sources.set_id
    FROM vocabulary_dictation_task_entry_sources AS sources
    JOIN vocabulary_dictation_tasks AS tasks ON tasks.id = sources.task_id
    WHERE tasks.user_id = ? AND tasks.student_id = ? AND tasks.program_id = ?
    ORDER BY sources.set_id
  `).all(userId, studentId, programId)) {
    const ids = sourceIdsByEntry.get(row.entry_id) ?? []
    ids.push(row.set_id)
    sourceIdsByEntry.set(row.entry_id, ids)
  }
  const histories = new Map()
  for (const row of rows) {
    const history = histories.get(row.entry_id) ?? []
    history.push(row)
    histories.set(row.entry_id, history)
  }
  const states = []
  for (const [entryId, history] of histories) {
    const latest = history.at(-1)
    const snapshot = projectFrozenVocabularyEntry(parseJson(latest.snapshot_json, null))
    const wrongRows = history.filter((row) => row.result === 'wrong')
    if (!wrongRows.length) continue
    let currentConsecutiveCorrect = 0
    let currentConsecutiveWrong = 0
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index].result !== 'correct') break
      currentConsecutiveCorrect += 1
    }
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index].result !== 'wrong') break
      currentConsecutiveWrong += 1
    }
    const recent = history.slice(-5)
    const recentWrong = recent.filter((row) => row.result === 'wrong').length
    const pending = currentConsecutiveCorrect < 2
    const wrongDates = new Set(wrongRows.map((row) => row.dictation_date))
    const flag = flags.get(entryId)
    states.push({
      ...snapshot,
      attempts: history.length,
      totalWrong: wrongRows.length,
      currentConsecutiveWrong,
      currentConsecutiveCorrect,
      recentAttempts: recent.length,
      recentWrong,
      recentWrongRate: recent.length ? recentWrong / recent.length : 0,
      wrongDateCount: wrongDates.size,
      lastWrongDate: wrongRows.at(-1)?.dictation_date ?? null,
      lastWrongSpelling: [...wrongRows].reverse().find((row) => row.wrong_spelling)?.wrong_spelling ?? '',
      latestResult: latest.result,
      status: pending && wrongDates.size >= 2 ? 'stubborn' : pending ? 'pending' : 'improved',
      pinned: flag?.pinned === 1,
      paused: flag?.paused === 1,
      sourceSetIds: sourceIdsByEntry.get(entryId) ?? [],
    })
  }
  return states.sort(compareVocabularyReviewStates)
}

export function updateStudentVocabularyWordFlag(userDb, userId, studentId, programId, entryId, input = {}) {
  ensureUserVocabularyShape(userDb)
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const pinned = input.pinned === true ? 1 : 0
  const paused = input.paused === true ? 1 : 0
  if (!pinned && !paused) {
    userDb.prepare(`
      DELETE FROM vocabulary_student_word_flags
      WHERE user_id = ? AND student_id = ? AND program_id = ? AND entry_id = ?
    `).run(userId, studentId, programId, entryId)
  } else {
    userDb.prepare(`
      INSERT INTO vocabulary_student_word_flags
        (user_id, student_id, program_id, entry_id, pinned, paused, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, student_id, program_id, entry_id) DO UPDATE SET
        pinned = excluded.pinned, paused = excluded.paused, updated_at = excluded.updated_at
    `).run(userId, studentId, programId, entryId, pinned, paused, nowIso())
  }
  return { studentId, programId, entryId, pinned: Boolean(pinned), paused: Boolean(paused) }
}

export function getSuggestedVocabularyReview(userDb, userId, studentId, programId, target = 20) {
  const safeTarget = normalizeTarget(target, 20)
  const states = getStudentVocabularyReviewStates(userDb, userId, studentId, programId)
  const activePending = states.filter((state) => state.status !== 'improved' && !state.paused)
  const pinned = activePending.filter((state) => state.pinned)
  const ordinary = activePending.filter((state) => !state.pinned)
  const chosen = [...pinned, ...ordinary].slice(0, safeTarget)
  const chosenIds = new Set(chosen.map((state) => state.id))
  const improvedLimit = Math.floor(safeTarget * 0.2)
  if (chosen.length < safeTarget && improvedLimit > 0) {
    const improvedCandidates = states.filter((state) => state.status === 'improved' && !state.paused && !chosenIds.has(state.id))
    const improved = [
      ...improvedCandidates.filter((state) => state.pinned),
      ...improvedCandidates.filter((state) => !state.pinned),
    ]
      .slice(0, Math.min(improvedLimit, safeTarget - chosen.length))
    chosen.push(...improved)
  }
  return chosen.map((state) => ({
    ...state,
    reason: state.pinned
      ? '老师重点关注'
      : state.status === 'stubborn'
        ? `至少 ${state.wrongDateCount} 天写错`
        : state.status === 'pending'
          ? '最近写错，尚未连续两次通过'
          : '已改善，安排抽查',
  }))
}

function compareVocabularyMeaningStates(left, right) {
  const rank = { repeated: 0, pending: 1, improved: 2 }
  return (rank[left.status] ?? 9) - (rank[right.status] ?? 9)
    || right.currentWrongDateCount - left.currentWrongDateCount
    || String(right.lastForgottenDate ?? '').localeCompare(String(left.lastForgottenDate ?? ''))
    || left.headword.localeCompare(right.headword, 'en')
}

export function getStudentVocabularyMeaningStates(userDb, userId, studentId, programId) {
  ensureUserVocabularyShape(userDb)
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const recallRows = userDb.prepare(`
    SELECT records.id AS record_id, records.recall_date AS evidence_date,
      COALESCE(records.completed_at, records.updated_at) AS occurred_at,
      entries.entry_id, entries.result, entries.snapshot_json
    FROM vocabulary_meaning_recall_records AS records
    JOIN vocabulary_meaning_recall_record_entries AS entries ON entries.record_id = records.id
    WHERE records.user_id = ? AND records.student_id = ? AND records.program_id = ?
      AND records.status = 'completed' AND entries.result <> 'untested'
  `).all(userId, studentId, programId).map((row) => ({ ...row, source: 'meaning_recall' }))
  const flags = new Map(userDb.prepare(`
    SELECT entry_id, pinned, paused FROM vocabulary_student_word_flags
    WHERE user_id = ? AND student_id = ? AND program_id = ?
  `).all(userId, studentId, programId).map((row) => [row.entry_id, row]))
  const sourceIdsByEntry = new Map()
  const addSource = (entryId, setId) => {
    const ids = sourceIdsByEntry.get(entryId) ?? []
    if (!ids.includes(setId)) ids.push(setId)
    sourceIdsByEntry.set(entryId, ids)
  }
  for (const row of userDb.prepare(`
    SELECT DISTINCT entry_sources.entry_id, entry_sources.set_id
    FROM vocabulary_meaning_recall_record_entry_sources AS entry_sources
    JOIN vocabulary_meaning_recall_records AS records ON records.id = entry_sources.record_id
    WHERE records.user_id = ? AND records.student_id = ? AND records.program_id = ?
    ORDER BY entry_sources.set_id
  `).all(userId, studentId, programId)) addSource(row.entry_id, row.set_id)
  const histories = new Map()
  for (const row of recallRows) {
    const history = histories.get(row.entry_id) ?? []
    history.push(row)
    histories.set(row.entry_id, history)
  }
  const states = []
  for (const [entryId, rawHistory] of histories) {
    const history = rawHistory.sort((left, right) =>
      left.evidence_date.localeCompare(right.evidence_date)
        || String(left.occurred_at).localeCompare(String(right.occurred_at))
        || left.record_id.localeCompare(right.record_id))
    const wrongRows = history.filter((row) => row.result === 'wrong')
    if (!wrongRows.length) continue
    const days = new Map()
    for (const row of history) {
      const day = days.get(row.evidence_date) ?? { hasWrong: false, hasCorrect: false }
      if (row.result === 'wrong') day.hasWrong = true
      if (row.result === 'correct') day.hasCorrect = true
      days.set(row.evidence_date, day)
    }
    let status = null
    let wrongDates = []
    let correctDates = []
    for (const [date, day] of [...days.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      if (day.hasWrong) {
        if (status === 'improved') wrongDates = []
        wrongDates.push(date)
        correctDates = []
        status = wrongDates.length >= 2 ? 'repeated' : 'pending'
      } else if (day.hasCorrect && status) {
        correctDates.push(date)
        if (correctDates.length >= 2) status = 'improved'
      }
    }
    const latest = history.at(-1)
    const snapshot = projectFrozenVocabularyEntry(parseJson(latest.snapshot_json, null))
    const flag = flags.get(entryId)
    states.push({
      ...snapshot,
      status: status ?? 'pending',
      attempts: history.length,
      meaningAttempts: history.length,
      totalWrong: wrongRows.length,
      currentWrongDateCount: wrongDates.length,
      currentCorrectDateCount: correctDates.length,
      lastForgottenDate: wrongRows.at(-1)?.evidence_date ?? null,
      lastCheckedDate: latest.evidence_date,
      latestEvidenceDate: latest.evidence_date,
      latestResult: latest.result,
      latestSource: latest.source,
      pinned: flag?.pinned === 1,
      paused: flag?.paused === 1,
      sourceSetIds: sourceIdsByEntry.get(entryId) ?? [],
    })
  }
  return states.sort(compareVocabularyMeaningStates)
}

export function getSuggestedVocabularyMeaningRecall(userDb, userId, studentId, programId, target = 20) {
  ensureUserVocabularyShape(userDb)
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const safeTarget = normalizeTarget(target, 20)
  const states = getStudentVocabularyMeaningStates(userDb, userId, studentId, programId)
  const statesByEntry = new Map(states.map((state) => [state.id, state]))
  const flags = new Map(userDb.prepare(`
    SELECT entry_id, pinned, paused FROM vocabulary_student_word_flags
    WHERE user_id = ? AND student_id = ? AND program_id = ?
  `).all(userId, studentId, programId).map((row) => [row.entry_id, row]))
  const latestRecallByEntry = new Map(userDb.prepare(`
    SELECT entries.entry_id, MAX(records.recall_date) AS latest_date
    FROM vocabulary_meaning_recall_records AS records
    JOIN vocabulary_meaning_recall_record_entries AS entries ON entries.record_id = records.id
    WHERE records.user_id = ? AND records.student_id = ? AND records.program_id = ?
      AND records.status = 'completed' AND entries.result <> 'untested'
    GROUP BY entries.entry_id
  `).all(userId, studentId, programId).map((row) => [row.entry_id, row.latest_date]))
  const candidatesByEntry = new Map()
  for (const row of userDb.prepare(`
    SELECT sets.id AS set_id, sets.created_at, entries.entry_id, entries.order_index, entries.snapshot_json
    FROM vocabulary_sets AS sets
    JOIN vocabulary_set_entries AS entries ON entries.set_id = sets.id
    WHERE sets.user_id = ? AND sets.student_id = ? AND sets.program_id = ?
    ORDER BY sets.created_at, sets.id, entries.order_index
  `).all(userId, studentId, programId)) {
    const existing = candidatesByEntry.get(row.entry_id)
    if (existing) {
      if (!existing.sourceSetIds.includes(row.set_id)) existing.sourceSetIds.push(row.set_id)
      continue
    }
    candidatesByEntry.set(row.entry_id, {
      ...projectFrozenVocabularyEntry(parseJson(row.snapshot_json, null)),
      sourceSetIds: [row.set_id],
    })
  }
  const candidates = [...candidatesByEntry.values()].map((entry) => {
    const meaningState = statesByEntry.get(entry.id)
    const flag = flags.get(entry.id)
    return {
      ...entry,
      meaningStatus: meaningState?.status ?? (latestRecallByEntry.has(entry.id) ? 'remembered' : 'unchecked'),
      dictationStatus: 'none',
      doublePending: false,
      lastCheckedDate: latestRecallByEntry.get(entry.id) ?? null,
      lastForgottenDate: meaningState?.lastForgottenDate ?? null,
      pinned: flag?.pinned === 1,
      paused: flag?.paused === 1,
    }
  }).filter((entry) => !entry.paused)
  const statusRank = { repeated: 0, pending: 1, unchecked: 2, remembered: 3, improved: 4 }
  candidates.sort((left, right) => Number(right.pinned) - Number(left.pinned)
    || (statusRank[left.meaningStatus] ?? 9) - (statusRank[right.meaningStatus] ?? 9)
    || String(left.lastCheckedDate ?? '').localeCompare(String(right.lastCheckedDate ?? ''))
    || left.headword.localeCompare(right.headword, 'en'))
  const ordinary = candidates.filter((entry) => entry.meaningStatus !== 'improved')
  const improvedLimit = Math.floor(safeTarget * 0.2)
  const chosen = ordinary.slice(0, safeTarget)
  if (chosen.length < safeTarget && improvedLimit > 0) {
    chosen.push(...candidates.filter((entry) => entry.meaningStatus === 'improved')
      .slice(0, Math.min(improvedLimit, safeTarget - chosen.length)))
  }
  return chosen.map((entry) => ({
    ...entry,
    reason: entry.pinned
      ? '老师重点关注'
      : entry.meaningStatus === 'repeated'
          ? '跨日反复忘记'
          : entry.meaningStatus === 'pending'
            ? '上次词义抽查忘记'
            : entry.meaningStatus === 'unchecked'
              ? '冻结后尚未抽查'
              : entry.meaningStatus === 'improved'
                ? '已恢复，安排少量抽查'
                : '距离上次抽查较久',
  }))
}

function vocabularySetDictationSummary(userDb, userId, studentId, programId, setId, meaningStates) {
  const recordCount = userDb.prepare(`
    SELECT COUNT(DISTINCT records.id) AS count
    FROM vocabulary_dictation_records AS records
    JOIN vocabulary_dictation_task_sources AS sources ON sources.task_id = records.task_id
    WHERE records.user_id = ? AND records.student_id = ?
      AND records.status = 'completed' AND sources.set_id = ?
  `).get(userId, studentId, setId).count
  const latestRecord = userDb.prepare(`
    SELECT records.id, records.dictation_date
    FROM vocabulary_dictation_records AS records
    JOIN vocabulary_dictation_task_sources AS sources ON sources.task_id = records.task_id
    WHERE records.user_id = ? AND records.student_id = ?
      AND records.status = 'completed' AND sources.set_id = ?
    ORDER BY records.dictation_date DESC, records.completed_at DESC, records.id DESC LIMIT 1
  `).get(userId, studentId, setId)
  const latestWrongCount = latestRecord ? userDb.prepare(`
    SELECT COUNT(*) AS count
    FROM vocabulary_dictation_record_results AS results
    JOIN vocabulary_dictation_task_entry_sources AS sources
      ON sources.task_id = (SELECT task_id FROM vocabulary_dictation_records WHERE id = results.record_id)
      AND sources.entry_id = results.entry_id
    WHERE results.record_id = ? AND sources.set_id = ? AND results.result = 'wrong'
  `).get(latestRecord.id, setId).count : 0
  const latestMeaningRecall = userDb.prepare(`
    SELECT records.recall_date
    FROM vocabulary_meaning_recall_records AS records
    JOIN vocabulary_meaning_recall_record_sources AS sources ON sources.record_id = records.id
    WHERE records.user_id = ? AND records.student_id = ? AND records.program_id = ?
      AND records.status = 'completed' AND sources.set_id = ?
    ORDER BY records.recall_date DESC, records.completed_at DESC, records.id DESC LIMIT 1
  `).get(userId, studentId, programId, setId)
  const meaningPendingCount = meaningStates.filter((state) =>
    state.status !== 'improved' && !state.paused && state.sourceSetIds.includes(setId)).length
  const repeatedMeaningCount = meaningStates.filter((state) =>
    state.status === 'repeated' && !state.paused && state.sourceSetIds.includes(setId)).length
  return {
    recordCount,
    latestWrongCount,
    latestDate: latestRecord?.dictation_date ?? null,
    pendingCount: 0,
    meaningRecall: {
      latestDate: latestMeaningRecall?.recall_date ?? null,
      pendingCount: meaningPendingCount,
      repeatedCount: repeatedMeaningCount,
    },
  }
}

export function listVocabularySetLibrary(userDb, userId, input = {}) {
  ensureUserVocabularyShape(userDb)
  const studentId = requireNonEmpty(input.studentId, '学生档案')
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const programId = requireNonEmpty(input.programId ?? 'wanwei-round-one-v1', '词汇课程')
  const page = Math.max(1, Number(input.page) || 1)
  const pageSize = Math.max(1, Math.min(50, Number(input.pageSize) || 20))
  const query = String(input.query ?? '').trim()
  const from = input.from ? normalizeDictationDate(input.from) : null
  const to = input.to ? normalizeDictationDate(input.to) : null
  const conditions = ['sets.user_id = ?', 'sets.student_id = ?', 'sets.program_id = ?']
  const values = [userId, studentId, programId]
  if (query) {
    conditions.push(`(sets.title LIKE ? ESCAPE '\\' OR EXISTS (
      SELECT 1 FROM vocabulary_set_entries AS search_entries
      WHERE search_entries.set_id = sets.id AND search_entries.snapshot_json LIKE ? ESCAPE '\\'
    ))`)
    const escaped = query.replace(/[\\%_]/gu, '\\$&')
    values.push(`%${escaped}%`, `%${escaped}%`)
  }
  if (from) {
    conditions.push('substr(sets.created_at, 1, 10) >= ?')
    values.push(from)
  }
  if (to) {
    conditions.push('substr(sets.created_at, 1, 10) <= ?')
    values.push(to)
  }
  const where = conditions.join(' AND ')
  const total = userDb.prepare(`SELECT COUNT(*) AS count FROM vocabulary_sets AS sets WHERE ${where}`).get(...values).count
  const ids = userDb.prepare(`
    SELECT sets.id FROM vocabulary_sets AS sets WHERE ${where}
    ORDER BY sets.created_at DESC, sets.id DESC LIMIT ? OFFSET ?
  `).all(...values, pageSize, (page - 1) * pageSize)
  const meaningStates = getStudentVocabularyMeaningStates(userDb, userId, studentId, programId)
  return {
    items: ids.map((row) => ({
      ...readVocabularySetRows(userDb, userId, row.id),
      dictationSummary: vocabularySetDictationSummary(
        userDb,
        userId,
        studentId,
        programId,
        row.id,
        meaningStates,
      ),
    })),
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  }
}

export function buildCombinedVocabularyPrintPayload(userDb, userId, input = {}) {
  ensureUserVocabularyShape(userDb)
  const studentId = requireNonEmpty(input.studentId, '学生档案')
  requireOwnedVocabularyStudent(userDb, userId, studentId)
  const programId = requireNonEmpty(input.programId ?? 'wanwei-round-one-v1', '词汇课程')
  const title = normalizeDictationTitle(input.title, '生词合集')
  const mode = input.mode === 'grouped' ? 'grouped' : 'dedupe'
  const sourceSetIds = input.sourceSetIds == null ? [] : uniqueNonEmptyIds(input.sourceSetIds, '生词组 ID')
  const entryIds = input.entryIds == null ? [] : uniqueNonEmptyIds(input.entryIds, '词条 ID')
  if (!sourceSetIds.length && !entryIds.length) throw new VocabularyStoreError('打印内容不能为空。')
  if (sourceSetIds.length && entryIds.length) throw new VocabularyStoreError('打印来源不能同时使用生词组和错词清单。')

  const entries = []
  const sections = []
  if (sourceSetIds.length) {
    const seen = new Set()
    for (const setId of sourceSetIds) {
      const source = readOwnedVocabularySetSnapshotRows(userDb, userId, setId)
      if (source.set.student_id !== studentId) {
        throw new VocabularyStoreError('所选生词组不属于当前学生。', 409, 'vocabulary_print_student_mismatch')
      }
      if (source.set.program_id !== programId) {
        throw new VocabularyStoreError('所选生词组不属于当前词汇课程。', 409, 'vocabulary_print_program_mismatch')
      }
      const sectionStart = entries.length
      for (const item of source.entries) {
        if (mode === 'dedupe' && seen.has(item.entryId)) continue
        seen.add(item.entryId)
        entries.push(item.entry)
      }
      if (entries.length > sectionStart) sections.push({ startIndex: sectionStart, title: source.set.title })
    }
  } else {
    const meaningStates = getStudentVocabularyMeaningStates(userDb, userId, studentId, programId)
    const stateById = new Map(meaningStates.map((state) => [state.id, state]))
    for (const entryId of entryIds) {
      const state = stateById.get(entryId)
      if (!state) throw new VocabularyStoreError('错词清单包含当前学生没有认词历史的词。', 409, 'vocabulary_print_review_state_missing')
      const {
        attempts: _attempts,
        meaningAttempts: _meaningAttempts,
        totalWrong: _totalWrong,
        currentConsecutiveWrong: _currentConsecutiveWrong,
        currentConsecutiveCorrect: _currentConsecutiveCorrect,
        currentWrongDateCount: _currentWrongDateCount,
        currentCorrectDateCount: _currentCorrectDateCount,
        recentAttempts: _recentAttempts,
        recentWrong: _recentWrong,
        recentWrongRate: _recentWrongRate,
        wrongDateCount: _wrongDateCount,
        lastWrongDate: _lastWrongDate,
        lastWrongSpelling: _lastWrongSpelling,
        lastForgottenDate: _lastForgottenDate,
        lastCheckedDate: _lastCheckedDate,
        latestEvidenceDate: _latestEvidenceDate,
        latestResult: _latestResult,
        latestSource: _latestSource,
        status: _status,
        pinned: _pinned,
        paused: _paused,
        sourceSetIds: _sourceSetIds,
        ...entry
      } = state
      entries.push(entry)
    }
    sections.push({ startIndex: 0, title })
  }
  if (!entries.length) throw new VocabularyStoreError('打印内容不能为空。')
  return {
    vocabularySet: {
      id: `vocabulary-print-${randomUUID()}`,
      studentId,
      programId,
      reviewRunId: null,
      title,
      entryCount: entries.length,
      entries,
      share: null,
      createdAt: nowIso(),
    },
    sections: mode === 'dedupe' ? [{ startIndex: 0, title }] : sections,
    shareKind: null,
  }
}

function findMeaningRecallRecordPrintShare(userDb, userId, recordId, entryIds, accent) {
  if (accent !== 'american' && accent !== 'british') return null
  const candidates = userDb.prepare(`
    SELECT tasks.id, shares.share_id, shares.status, shares.created_at, shares.revoked_at
    FROM vocabulary_meaning_recall_dictation_tasks AS links
    JOIN vocabulary_dictation_tasks AS tasks ON tasks.id = links.task_id
    JOIN vocabulary_dictation_task_shares AS shares ON shares.task_id = tasks.id
    WHERE links.record_id = ? AND tasks.user_id = ? AND tasks.accent = ? AND shares.status = 'active'
    ORDER BY tasks.created_at DESC, tasks.id DESC
  `).all(recordId, userId, accent)
  for (const candidate of candidates) {
    const taskEntryIds = userDb.prepare(`
      SELECT entry_id FROM vocabulary_dictation_task_entries
      WHERE task_id = ? ORDER BY order_index
    `).all(candidate.id).map((entry) => entry.entry_id)
    if (taskEntryIds.length !== entryIds.length || taskEntryIds.some((entryId, index) => entryId !== entryIds[index])) continue
    return {
      shareId: candidate.share_id,
      status: candidate.status,
      createdAt: candidate.created_at,
      revokedAt: candidate.revoked_at,
    }
  }
  return null
}

export function buildVocabularyMeaningRecallRecordPrintPayload(userDb, userId, recordId, { accent = null } = {}) {
  ensureUserVocabularyShape(userDb)
  const record = readMeaningRecallRecordRows(userDb, userId, recordId)
  if (record.status !== 'completed') {
    throw new VocabularyStoreError(
      record.status === 'void' ? '已作废的认词记录不能导出。' : '认词草稿完成后才能导出。',
      409,
      'vocabulary_meaning_recall_record_not_exportable',
    )
  }
  const wrongEntries = record._entryRows
    .filter((entry) => entry.result === 'wrong')
    .map(({ result: _result, sourceSetIds: _sourceSetIds, snapshot: _snapshot, ...entry }) => entry)
  if (!wrongEntries.length) {
    throw new VocabularyStoreError(
      '本轮没有错词，无需导出。',
      409,
      'vocabulary_meaning_recall_record_no_wrong_entries',
    )
  }
  const title = `${record.title}-本轮错词`
  const share = findMeaningRecallRecordPrintShare(
    userDb,
    userId,
    record.id,
    wrongEntries.map((entry) => entry.id),
    accent,
  )
  return {
    vocabularySet: {
      id: `vocabulary-meaning-record-print-${record.id}`,
      studentId: record.studentId,
      programId: record.programId,
      reviewRunId: null,
      title,
      entryCount: wrongEntries.length,
      entries: wrongEntries,
      share,
      createdAt: record.updatedAt,
    },
    sections: [{ startIndex: 0, title }],
    shareKind: null,
    materialLayout: 'dedupe',
  }
}

export function buildVocabularyDictationTaskPrintPayload(userDb, userId, taskId) {
  ensureUserVocabularyShape(userDb)
  const task = readDictationTaskRows(userDb, userId, taskId)
  const sections = []
  if (task.materialLayout === 'grouped') {
    const sourceTitleById = new Map(task.sourceSets.map((source) => [source.setId, source.title]))
    let previousSourceId = null
    task.entries.forEach((entry, index) => {
      const sourceId = task.sourceSets.find((source) => entry.sourceSetIds.includes(source.setId))?.setId ?? null
      if (sourceId === previousSourceId && sections.length) return
      sections.push({ startIndex: index, title: sourceTitleById.get(sourceId) ?? task.title })
      previousSourceId = sourceId
    })
  } else {
    sections.push({ startIndex: 0, title: task.title })
  }
  return {
    vocabularySet: {
      id: task.id,
      studentId: task.studentId,
      programId: task.programId,
      reviewRunId: null,
      title: task.title,
      entryCount: task.entryCount,
      entries: task.entries.map(({ sourceSetIds: _sourceSetIds, ...entry }) => entry),
      share: task.share,
      createdAt: task.createdAt,
    },
    sections,
    shareKind: null,
    accent: task.accent,
    materialLayout: task.materialLayout,
  }
}
