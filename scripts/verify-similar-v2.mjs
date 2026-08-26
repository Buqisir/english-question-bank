#!/usr/bin/env node
/**
 * Verification: similar-v2-engine (E5, docs/cuts/similar-v2-engine/plan.md).
 *
 * Fully fixture-driven (self-built in-memory sqlite + a self-built
 * paper-assets temp dir) — deliberately does NOT depend on the real repo DB
 * or on D1 (grammar-facets-v2) having landed. Plan requirement: "新 verify
 * 必须在当前真库状态下就能全绿" — D1 hasn't merged yet (schemaVersion for
 * grammarFill is still 'grammar-fill-analysis-v1' in the real repo), so this
 * script reads the CURRENT `analysisConfigs` export (real, unmodified) to
 * discover the live schemaVersion/fileName/entryMapKey rather than
 * hardcoding 'v2' anywhere — once D1 bumps analysisConfigs, this fixture
 * generator picks the new schemaVersion up for free, no edit required here.
 *
 * Everything scored here reads tense/voice/agreementSensitive/role/form
 * straight off the fixture blank entries via buildRawFacetIndex's `...entry`
 * spread (server/search/similarQuestions.mjs) — the data-contract lock from
 * docs/cuts/similar-v2-engine/plan.md (PA MF-2): no sidecar-merge logic
 * exists anywhere in this engine.
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTeachingFacetIndex, analysisConfigs } from '../server/search/teachingFacets.mjs'
import {
  createSimilarQuestionsStore,
  createSimilarQuestionsRoutes,
  SimilarQuestionsError,
} from '../server/search/similarQuestions.mjs'
import { createDailyLimitCounter } from '../server/ai-providers/dailyLimitCounter.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`)
  }
}

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

console.log('similar-v2-engine verify: E5 相似引擎 v2（篇章相似 + 语法填空/阅读小题相似）')
console.log()

// ─── zero-AI invariant baseline (read before we do anything) ─────────────
const aiDailyUsageSnapshotPath = path.join(rootDir, 'server', 'logs', 'ai-daily-usage.json')
function readDailyLimitUsed() {
  const counter = createDailyLimitCounter({ limit: 500, snapshotPath: aiDailyUsageSnapshotPath })
  return counter.getStatus().used
}
const usedBefore = readDailyLimitUsed()

// ═══════════════════════════════════════════════════════════════════════
// Fixture builder
// ═══════════════════════════════════════════════════════════════════════

const CONFIG_BY_GROUP_TYPE = Object.fromEntries(analysisConfigs.map((c) => [c.groupType, c]))
const FINITE_VERB_FACET_KEY = 'grammar-fill.given.verb.finite'
const NON_FINITE_VERB_FACET_KEY = 'grammar-fill.given.verb.non-finite'
const DB_GROUP_TYPE_TO_FACET_TYPE = {
  grammar_cloze: 'grammarFill',
  seven_choices: 'sevenChoices',
  cloze: 'cloze',
  reading: 'reading',
}

const paperAssetsDir = mkdtempSync(path.join(tmpdir(), 'similar-v2-fixture-'))
const assetsByPaperId = new Map()

function ensurePaper(paperId) {
  if (!assetsByPaperId.has(paperId)) assetsByPaperId.set(paperId, { groups: {}, analyses: {} })
  return assetsByPaperId.get(paperId)
}

function addGroup(paperId, groupId, groupType, questionIds, title = '') {
  ensurePaper(paperId).groups[groupId] = { groupType, questionIds, title }
}

function addAnalysisEntries(paperId, facetType, entriesById) {
  const config = CONFIG_BY_GROUP_TYPE[facetType]
  const paper = ensurePaper(paperId)
  if (!paper.analyses[config.fileName]) {
    paper.analyses[config.fileName] = { schemaVersion: config.schemaVersion, paperId, [config.entryMapKey]: {} }
  }
  Object.assign(paper.analyses[config.fileName][config.entryMapKey], entriesById)
}

function flushAssets() {
  for (const [paperId, paper] of assetsByPaperId) {
    const paperDir = path.join(paperAssetsDir, paperId)
    mkdirSync(paperDir, { recursive: true })
    writeFileSync(
      path.join(paperDir, 'paper-asset.json'),
      JSON.stringify({ paper: { paperId, title: paperId }, content: { groups: paper.groups } }),
    )
    if (Object.keys(paper.analyses).length) {
      mkdirSync(path.join(paperDir, 'analyses'), { recursive: true })
      for (const [fileName, analysisJson] of Object.entries(paper.analyses)) {
        writeFileSync(path.join(paperDir, 'analyses', fileName), JSON.stringify(analysisJson))
      }
    }
  }
}

// ─── DB fixture (minimal shape covering exactly the columns the engine's
// SQL selects — same convention as the retired file's isolated writing memDb) ─
const db = new DatabaseSync(':memory:')
db.exec(`
  CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    year INTEGER,
    region TEXT NOT NULL DEFAULT '',
    paper_name TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE passages (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    discourse_type TEXT,
    word_count INTEGER
  );
  CREATE TABLE question_groups (
    id TEXT PRIMARY KEY,
    passage_id TEXT NOT NULL,
    group_type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE questions (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL
  );
  CREATE TABLE question_group_topic_labels (
    question_group_id TEXT NOT NULL,
    label TEXT NOT NULL
  );
`)

function insertSource(id, { sourceType, year = 2024, region = 'FX', paperName = id }) {
  db.prepare('INSERT INTO sources (id, source_type, year, region, paper_name) VALUES (?,?,?,?,?)').run(
    id,
    sourceType,
    year,
    region,
    paperName,
  )
}
function insertPassage(id, { sourceId, discourseType = null, wordCount = null }) {
  db.prepare('INSERT INTO passages (id, source_id, discourse_type, word_count) VALUES (?,?,?,?)').run(
    id,
    sourceId,
    discourseType,
    wordCount,
  )
}
function insertGroup(id, { passageId, groupType, title = '', displayOrder = 0 }) {
  db.prepare(
    'INSERT INTO question_groups (id, passage_id, group_type, title, display_order) VALUES (?,?,?,?,?)',
  ).run(id, passageId, groupType, title, displayOrder)
}
function insertQuestion(id, { groupId }) {
  db.prepare('INSERT INTO questions (id, group_id) VALUES (?,?)').run(id, groupId)
}
function insertTopicLabel(groupId, label) {
  db.prepare('INSERT INTO question_group_topic_labels (question_group_id, label) VALUES (?,?)').run(groupId, label)
}

// Convenience: build one full group (source+passage+group+N questions+paper-asset
// entries) in one call. `dbGroupType` is the snake_case DB value; `blanks`/`questions`
// keys the analysis entryMap per question id.
let autoId = 0
function nextId(prefix) {
  autoId += 1
  return `${prefix}-${autoId}`
}

function buildGroup({
  paperId,
  groupId,
  dbGroupType,
  sourceType = 'real_exam',
  year = 2024,
  region = 'FX',
  paperName = paperId,
  displayOrder = 0,
  topics = [],
  entries, // { questionId: entryObject }
}) {
  const sourceId = nextId('src')
  const passageId = nextId('pas')
  insertSource(sourceId, { sourceType, year, region, paperName })
  insertPassage(passageId, { sourceId })
  insertGroup(groupId, { passageId, groupType: dbGroupType, displayOrder })
  const questionIds = Object.keys(entries)
  for (const qid of questionIds) insertQuestion(qid, { groupId })
  for (const label of topics) insertTopicLabel(groupId, label)
  // 'writing' (and any other DB group_type with no facetType/analysisConfig,
  // matching production: writing has no teachingFacets entry) only needs to
  // exist in the DB — it never participates in the facetIndex/paper-asset walk.
  const facetType = DB_GROUP_TYPE_TO_FACET_TYPE[dbGroupType]
  if (facetType) {
    addGroup(paperId, groupId, facetType, questionIds)
    addAnalysisEntries(paperId, facetType, entries)
  }
  return { sourceId, passageId, questionIds }
}

// ═══════════════════════════════════════════════════════════════════════
// Fixture data — passages endpoint: reading tier sweep + real>mock + topic gate
// ═══════════════════════════════════════════════════════════════════════

// Seed's own exam (2 reading passages, slot 1/2) — seed is slot 2 (B篇).
buildGroup({
  paperId: 'px-seed-exam',
  groupId: 'group-px-seed-a',
  dbGroupType: 'reading',
  sourceType: 'real_exam',
  year: 2024,
  paperName: 'PX-SEED',
  displayOrder: 1,
  topics: ['topic-travel'],
  entries: { 'q-px-seed-a-1': { skill: { primary: 'detail' } } },
})
const SEED_PASSAGE_GROUP = 'group-px-seed-b'
buildGroup({
  paperId: 'px-seed-exam',
  groupId: SEED_PASSAGE_GROUP,
  dbGroupType: 'reading',
  sourceType: 'real_exam',
  year: 2024,
  paperName: 'PX-SEED',
  displayOrder: 2,
  topics: ['topic-travel'],
  entries: { 'q-px-seed-b-1': { skill: { primary: 'inference' } } },
})

// Candidate exam sharing the same topic: slots 1-4 (A adjacent, B same, C
// adjacent, D none) — B is mock_exam (secondary=0), A/C are real_exam
// (secondary=99), to prove tier (primary) dominates authentic-source
// (secondary) regardless of which one "should" win on the lower layer.
const CAND_SAME_TIER_GROUP = 'group-px-cand-b'
buildGroup({
  paperId: 'px-cand-exam',
  groupId: 'group-px-cand-a',
  dbGroupType: 'reading',
  sourceType: 'real_exam',
  year: 2019,
  paperName: 'PX-CAND',
  displayOrder: 1,
  topics: ['topic-travel'],
  entries: { 'q-px-cand-a-1': { skill: { primary: 'detail' } } },
})
buildGroup({
  paperId: 'px-cand-exam',
  groupId: CAND_SAME_TIER_GROUP,
  dbGroupType: 'reading',
  sourceType: 'mock_exam',
  year: 2019,
  paperName: 'PX-CAND',
  displayOrder: 2,
  topics: ['topic-travel'],
  entries: { 'q-px-cand-b-1': { skill: { primary: 'inference' } } },
})
buildGroup({
  paperId: 'px-cand-exam',
  groupId: 'group-px-cand-c',
  dbGroupType: 'reading',
  sourceType: 'real_exam',
  year: 2019,
  paperName: 'PX-CAND',
  displayOrder: 3,
  topics: ['topic-travel'],
  entries: { 'q-px-cand-c-1': { skill: { primary: 'main-idea' } } },
})
buildGroup({
  paperId: 'px-cand-exam',
  groupId: 'group-px-cand-d',
  dbGroupType: 'reading',
  sourceType: 'real_exam',
  year: 2019,
  paperName: 'PX-CAND',
  displayOrder: 4,
  topics: ['topic-travel'],
  entries: { 'q-px-cand-d-1': { skill: { primary: 'vocabulary' } } },
})

// Off-topic reading candidate: must be excluded from the pool entirely (hard gate).
buildGroup({
  paperId: 'px-offtopic-exam',
  groupId: 'group-px-offtopic',
  dbGroupType: 'reading',
  sourceType: 'real_exam',
  year: 2024,
  paperName: 'PX-OFFTOPIC',
  displayOrder: 1,
  topics: ['topic-unrelated'],
  entries: { 'q-px-offtopic-1': { skill: { primary: 'detail' } } },
})

// Seed with zero topic labels → honest empty state (PA SF-3).
const ZERO_TOPIC_SEED_GROUP = 'group-px-zero-topic'
buildGroup({
  paperId: 'px-zero-topic-exam',
  groupId: ZERO_TOPIC_SEED_GROUP,
  dbGroupType: 'reading',
  sourceType: 'real_exam',
  year: 2024,
  paperName: 'PX-ZEROTOPIC',
  displayOrder: 1,
  topics: [],
  entries: { 'q-px-zero-topic-1': { skill: { primary: 'detail' } } },
})

// Non-reading passages fixtures (grammarFill/cloze/sevenChoices): prove the
// shared recipe (topic gate → real>mock → year) applies uniformly, and that
// non-reading candidates never get a position-slot chip (primary always 0).
// Keyed by the real snake_case DB `group_type` values (NOT the camelCase
// facetType) — must match SUPPORTED_DB_GROUP_TYPES in similarQuestions.mjs.
const NONREADING_SEED = { grammar_cloze: 'group-px-gf-seed', cloze: 'group-px-cz-seed', seven_choices: 'group-px-7c-seed' }
for (const [dbGroupType, seedGroupId] of Object.entries(NONREADING_SEED)) {
  buildGroup({
    paperId: `px-${dbGroupType}-seed-exam`,
    groupId: seedGroupId,
    dbGroupType,
    sourceType: 'real_exam',
    year: 2024,
    paperName: `PX-${dbGroupType}-SEED`,
    topics: ['topic-nonreading'],
    entries: { [`q-px-${dbGroupType}-seed-1`]: dbGroupType === 'grammar_cloze' ? { facetKey: 'grammar-fill.no-hint.preposition' } : {} },
  })
  buildGroup({
    paperId: `px-${dbGroupType}-cand-real-exam`,
    groupId: `group-px-${dbGroupType}-cand-real`,
    dbGroupType,
    sourceType: 'real_exam',
    year: 2020,
    paperName: `PX-${dbGroupType}-CAND-REAL`,
    topics: ['topic-nonreading'],
    entries: { [`q-px-${dbGroupType}-cand-real-1`]: {} },
  })
  buildGroup({
    paperId: `px-${dbGroupType}-cand-mock-exam`,
    groupId: `group-px-${dbGroupType}-cand-mock`,
    dbGroupType,
    sourceType: 'mock_exam',
    year: 2023,
    paperName: `PX-${dbGroupType}-CAND-MOCK`,
    topics: ['topic-nonreading'],
    entries: { [`q-px-${dbGroupType}-cand-mock-1`]: {} },
  })
  buildGroup({
    paperId: `px-${dbGroupType}-cand-real2-exam`,
    groupId: `group-px-${dbGroupType}-cand-real2`,
    dbGroupType,
    sourceType: 'real_exam',
    year: 2022,
    paperName: `PX-${dbGroupType}-CAND-REAL2`,
    topics: ['topic-nonreading'],
    entries: { [`q-px-${dbGroupType}-cand-real2-1`]: {} },
  })
}

// ═══════════════════════════════════════════════════════════════════════
// Fixture data — small-question endpoint: reading skill hit
// ═══════════════════════════════════════════════════════════════════════

const READING_SQ_SEED_GROUP = 'group-sq-reading-seed'
buildGroup({
  paperId: 'sq-reading-seed-exam',
  groupId: READING_SQ_SEED_GROUP,
  dbGroupType: 'reading',
  topics: ['topic-sq-reading'],
  entries: { 'q-sq-reading-seed-1': { skill: { primary: 'inference' } } },
})
buildGroup({
  paperId: 'sq-reading-cand-hit-exam',
  groupId: 'group-sq-reading-cand-hit',
  dbGroupType: 'reading',
  topics: ['topic-sq-reading'],
  entries: { 'q-sq-reading-cand-hit-1': { skill: { primary: 'inference' } }, 'q-sq-reading-cand-hit-2': { skill: { primary: 'detail' } } },
})
buildGroup({
  paperId: 'sq-reading-cand-miss-exam',
  groupId: 'group-sq-reading-cand-miss',
  dbGroupType: 'reading',
  topics: ['topic-sq-reading'],
  entries: { 'q-sq-reading-cand-miss-1': { skill: { primary: 'main-idea' } } },
})

// ═══════════════════════════════════════════════════════════════════════
// Fixture data — small-question endpoint: grammarFill finite-verb vector
// ═══════════════════════════════════════════════════════════════════════

const FINITE_SEED_GROUP = 'group-sq-finite-seed'
buildGroup({
  paperId: 'sq-finite-seed-exam',
  groupId: FINITE_SEED_GROUP,
  dbGroupType: 'grammar_cloze',
  topics: ['topic-finite'],
  entries: {
    'q-sq-finite-seed-1': {
      facetKey: FINITE_VERB_FACET_KEY,
      tense: 'past-simple',
      voice: 'active',
      agreementSensitive: true,
    },
  },
})
const finiteCandidates = [
  { key: 'score7', tense: 'past-simple', voice: 'active', agreementSensitive: true, expected: 7 },
  { key: 'score6', tense: 'past-simple', voice: 'active', agreementSensitive: false, expected: 6 },
  { key: 'score4', tense: 'past-simple', voice: 'passive', agreementSensitive: false, expected: 4 },
  { key: 'score2', tense: 'present-perfect', voice: 'active', agreementSensitive: false, expected: 2 },
  { key: 'score1', tense: 'present-perfect', voice: 'passive', agreementSensitive: true, expected: 1 },
  { key: 'score0', tense: 'future-simple', voice: 'passive', agreementSensitive: false, expected: 0 },
]
for (const cand of finiteCandidates) {
  buildGroup({
    paperId: `sq-finite-cand-${cand.key}-exam`,
    groupId: `group-sq-finite-cand-${cand.key}`,
    dbGroupType: 'grammar_cloze',
    topics: ['topic-finite'],
    entries: {
      [`q-sq-finite-cand-${cand.key}-1`]: {
        facetKey: FINITE_VERB_FACET_KEY,
        tense: cand.tense,
        voice: cand.voice,
        agreementSensitive: cand.agreementSensitive,
      },
    },
  })
}
// Group with TWO finite blanks — must take the max, not the first/average.
buildGroup({
  paperId: 'sq-finite-cand-multi-blank-exam',
  groupId: 'group-sq-finite-cand-multi-blank',
  dbGroupType: 'grammar_cloze',
  topics: ['topic-finite'],
  entries: {
    'q-sq-finite-multi-1': { facetKey: FINITE_VERB_FACET_KEY, tense: 'present-perfect', voice: 'passive', agreementSensitive: false },
    'q-sq-finite-multi-2': { facetKey: FINITE_VERB_FACET_KEY, tense: 'past-simple', voice: 'active', agreementSensitive: true },
  },
})
// A finite-branch candidate that ALSO carries a topic overlap, to test the
// secondary (topic) layer breaking a tie between two equal-vector candidates.
buildGroup({
  paperId: 'sq-finite-cand-topic-exam',
  groupId: 'group-sq-finite-cand-topic',
  dbGroupType: 'grammar_cloze',
  topics: ['topic-finite'],
  entries: {
    'q-sq-finite-cand-topic-1': { facetKey: FINITE_VERB_FACET_KEY, tense: 'past-simple', voice: 'active', agreementSensitive: true },
  },
})
buildGroup({
  paperId: 'sq-finite-cand-notopic-exam',
  groupId: 'group-sq-finite-cand-notopic',
  dbGroupType: 'grammar_cloze',
  topics: [],
  entries: {
    'q-sq-finite-cand-notopic-1': { facetKey: FINITE_VERB_FACET_KEY, tense: 'past-simple', voice: 'active', agreementSensitive: true },
  },
})

// ═══════════════════════════════════════════════════════════════════════
// Fixture data — small-question endpoint: grammarFill non-finite role (7 格全含)
// ═══════════════════════════════════════════════════════════════════════

const ROLE_LABELS = {
  adverbial: '状语',
  attributive: '定语',
  subject: '主语',
  object: '宾语',
  predicative: '表语',
  'object-complement': '宾语补足语',
  'subject-complement': '主语补足语',
}
const ALL_SEVEN_ROLES = Object.keys(ROLE_LABELS)
const roleSeedGroupByRole = {}
const roleCandGroupByRole = {}
for (const role of ALL_SEVEN_ROLES) {
  const seedGroupId = `group-sq-role-seed-${role}`
  const candGroupId = `group-sq-role-cand-${role}`
  roleSeedGroupByRole[role] = seedGroupId
  roleCandGroupByRole[role] = candGroupId
  buildGroup({
    paperId: `sq-role-seed-${role}-exam`,
    groupId: seedGroupId,
    dbGroupType: 'grammar_cloze',
    topics: [],
    entries: { [`q-sq-role-seed-${role}-1`]: { facetKey: NON_FINITE_VERB_FACET_KEY, role } },
  })
  buildGroup({
    paperId: `sq-role-cand-${role}-exam`,
    groupId: candGroupId,
    dbGroupType: 'grammar_cloze',
    topics: [],
    entries: { [`q-sq-role-cand-${role}-1`]: { facetKey: NON_FINITE_VERB_FACET_KEY, role, form: 'doing' } },
  })
}
// Non-matching role must be excluded from the pool entirely (hard gate).
buildGroup({
  paperId: 'sq-role-cand-mismatch-exam',
  groupId: 'group-sq-role-cand-mismatch',
  dbGroupType: 'grammar_cloze',
  topics: [],
  entries: { 'q-sq-role-cand-mismatch-1': { facetKey: NON_FINITE_VERB_FACET_KEY, role: 'object', form: 'to-do' } },
})
// A candidate whose matched blank has no `form` — chip must omit the form
// segment gracefully (pre-D1 real data never has `form` at all).
buildGroup({
  paperId: 'sq-role-cand-noform-exam',
  groupId: 'group-sq-role-cand-noform',
  dbGroupType: 'grammar_cloze',
  topics: [],
  entries: { 'q-sq-role-cand-noform-1': { facetKey: NON_FINITE_VERB_FACET_KEY, role: 'attributive' } },
})

// ═══════════════════════════════════════════════════════════════════════
// Fixture data — small-question endpoint: grammarFill "other" facetKey branch
// ═══════════════════════════════════════════════════════════════════════

const OTHER_SEED_GROUP = 'group-sq-other-seed'
buildGroup({
  paperId: 'sq-other-seed-exam',
  groupId: OTHER_SEED_GROUP,
  dbGroupType: 'grammar_cloze',
  topics: ['topic-other'],
  entries: { 'q-sq-other-seed-1': { facetKey: 'grammar-fill.given.noun.number' } },
})
buildGroup({
  paperId: 'sq-other-cand-hit-exam',
  groupId: 'group-sq-other-cand-hit',
  dbGroupType: 'grammar_cloze',
  topics: ['topic-other'],
  entries: { 'q-sq-other-cand-hit-1': { facetKey: 'grammar-fill.given.noun.number' } },
})
buildGroup({
  paperId: 'sq-other-cand-miss-exam',
  groupId: 'group-sq-other-cand-miss',
  dbGroupType: 'grammar_cloze',
  topics: ['topic-other'],
  entries: { 'q-sq-other-cand-miss-1': { facetKey: 'grammar-fill.given.noun.genitive' } },
})

// ═══════════════════════════════════════════════════════════════════════
// Fixture data — mixed-branch (SF-4) and retired-groupType (cloze/sevenChoices)
// and writing seeds
// ═══════════════════════════════════════════════════════════════════════

// Reuse FINITE_SEED_GROUP's finite blank + roleSeedGroupByRole.attributive's
// non-finite blank as the two mismatched-branch seeds.
const MIXED_FINITE_QID = 'q-sq-finite-seed-1'
const MIXED_NONFINITE_QID = 'q-sq-role-seed-attributive-1'

const WRITING_SEED_GROUP = 'group-sq-writing-seed'
buildGroup({
  paperId: 'sq-writing-seed-exam',
  groupId: WRITING_SEED_GROUP,
  dbGroupType: 'writing',
  topics: [],
  entries: { 'q-sq-writing-seed-1': {} },
})

flushAssets()

// ═══════════════════════════════════════════════════════════════════════
// Wire the real store against the fixture
// ═══════════════════════════════════════════════════════════════════════

const facetIndex = createTeachingFacetIndex({ paperAssetsDir })
const store = createSimilarQuestionsStore({ getTeachingFacetIndex: facetIndex.getIndex, paperAssetsDir })
const canonicalGroupId = 'group-canonical-reading-seed'
const canonicalQuestionId = 'question-canonical-reading-seed-1'
const canonicalSnapshot = {
  papersById: { 'paper-canonical-reading-seed': { paperId: 'paper-canonical-reading-seed' } },
  groupsById: {
    [canonicalGroupId]: {
      paperId: 'paper-canonical-reading-seed',
      groupId: canonicalGroupId,
      groupType: 'reading',
      questionIds: [canonicalQuestionId],
      card: {
        title: 'Canonical Reading Seed',
        paperName: 'Canonical Reading Seed',
        year: 2025,
        region: 'Canonical Region',
        sourceType: 'real_exam',
      },
      detail: { sourceDetail: { id: 'canonical-source' } },
    },
  },
  questionsById: {
    [canonicalQuestionId]: {
      paperId: 'paper-canonical-reading-seed',
      groupId: canonicalGroupId,
      groupType: 'reading',
      detail: { id: canonicalQuestionId },
    },
  },
  analysisSources: [{
    paperId: 'paper-canonical-reading-seed',
    schemaVersion: CONFIG_BY_GROUP_TYPE.reading.schemaVersion,
    groupType: 'reading',
    entryMapKey: 'questions',
    groupIds: [canonicalGroupId],
    entryIdsByGroupId: { [canonicalGroupId]: [canonicalQuestionId] },
    questionIdByEntryId: { [canonicalQuestionId]: canonicalQuestionId },
    analysis: {
      schemaVersion: CONFIG_BY_GROUP_TYPE.reading.schemaVersion,
      paperId: 'paper-canonical-reading-seed',
      questions: {
        [canonicalQuestionId]: { skill: { primary: 'inference' } },
      },
    },
  }],
}
const emptyCanonicalSnapshot = {
  papersById: {},
  groupsById: {},
  questionsById: {},
  analysisSources: [],
}
let currentCanonicalSnapshot = emptyCanonicalSnapshot
let canonicalSnapshotReads = 0
const getCanonicalCompatibilitySnapshot = () => {
  canonicalSnapshotReads += 1
  return currentCanonicalSnapshot
}
const canonicalFacetIndex = createTeachingFacetIndex({
  paperAssetsDir,
  getCanonicalCompatibilitySnapshot,
})
const canonicalStore = createSimilarQuestionsStore({
  getTeachingFacetIndex: canonicalFacetIndex.getIndex,
  paperAssetsDir,
  getCanonicalCompatibilitySnapshot,
})

function reasonKinds(result) {
  return result.reasons.map((r) => r.kind)
}
function reasonLabels(result) {
  return result.reasons.map((r) => r.label)
}
function findResult(response, groupId) {
  return response.results.find((r) => r.groupId === groupId)
}

let prePublicationSimilarError = null
try {
  canonicalStore.findSimilar(db, {
    seeds: [{ questionId: canonicalQuestionId }],
  })
} catch (error) {
  prePublicationSimilarError = error
}
assert(
  'pre-publication similar query does not retain an invented Canonical seed',
  prePublicationSimilarError instanceof SimilarQuestionsError
    && prePublicationSimilarError.message.includes('未找到题目'),
  prePublicationSimilarError?.message || '',
)
currentCanonicalSnapshot = canonicalSnapshot
const canonicalSnapshotReadsBeforePublicationQuery = canonicalSnapshotReads
const canonicalQuestionResult = canonicalStore.findSimilar(db, {
  seeds: [{ questionId: canonicalQuestionId }],
})
assert(
  'Canonical-only question seed participates through the one compatibility snapshot',
  canonicalQuestionResult.seedProfile.groupType === 'reading'
    && canonicalQuestionResult.results.some((result) => result.groupId === 'group-sq-reading-cand-hit'),
  JSON.stringify(canonicalQuestionResult),
)
assert(
  'similar obtains one exact current compatibility snapshot per operation after publication',
  canonicalSnapshotReads === canonicalSnapshotReadsBeforePublicationQuery + 1,
  `reads=${canonicalSnapshotReads - canonicalSnapshotReadsBeforePublicationQuery}`,
)
const canonicalPassageResult = canonicalStore.findSimilarPassages(db, {
  groupId: canonicalGroupId,
})
assert(
  'Canonical-only passage seed keeps the existing honest empty state without topic labels',
  canonicalPassageResult.results.length === 0
    && canonicalPassageResult.poolStats.totalInPool === 0
    && canonicalPassageResult.notice?.includes('暂无话题标签'),
  JSON.stringify(canonicalPassageResult),
)

// ═══ §1: /api/similar-passages ═══════════════════════════════════════════
console.log('=== §1 /api/similar-passages ===')

const passagesReadingResult = store.findSimilarPassages(db, { groupId: SEED_PASSAGE_GROUP, limit: 50 })

assert(
  '篇章相似(reading): same-tier candidate (B篇) present with position-slot 同为B篇 chip',
  reasonLabels(findResult(passagesReadingResult, CAND_SAME_TIER_GROUP) || { reasons: [] }).some((l) => l === '同为B篇'),
  JSON.stringify(findResult(passagesReadingResult, CAND_SAME_TIER_GROUP)),
)
assert(
  '篇章相似(reading): adjacent-tier candidate (A篇) present with 篇位相邻 chip',
  reasonLabels(findResult(passagesReadingResult, 'group-px-cand-a') || { reasons: [] }).includes('篇位相邻'),
)
assert(
  '篇章相似(reading): far candidate (D篇, diff=2) present but with NO position-slot reason',
  Boolean(findResult(passagesReadingResult, 'group-px-cand-d')) &&
    !reasonKinds(findResult(passagesReadingResult, 'group-px-cand-d')).includes('position-slot'),
)
assert(
  '篇章相似(reading): off-topic candidate excluded from pool entirely (hard gate)',
  !findResult(passagesReadingResult, 'group-px-offtopic'),
)
assert(
  '篇章相似(reading): 分层不翻转 — worst same-tier (mock_exam) still outranks best adjacent-tier (real_exam)',
  (() => {
    const sameTier = findResult(passagesReadingResult, CAND_SAME_TIER_GROUP)
    const adjacentA = findResult(passagesReadingResult, 'group-px-cand-a')
    const adjacentC = findResult(passagesReadingResult, 'group-px-cand-c')
    return sameTier.score > adjacentA.score && sameTier.score > adjacentC.score
  })(),
  JSON.stringify(passagesReadingResult.results.map((r) => [r.groupId, r.score])),
)
assert(
  '篇章相似(reading): totalInPool matches independently recomputed pool size (seed exam excluded, off-topic excluded)',
  passagesReadingResult.poolStats.totalInPool === 4, // cand a/b/c/d, seed's own exam sibling + off-topic excluded
  JSON.stringify(passagesReadingResult.poolStats),
)

const zeroTopicResult = store.findSimilarPassages(db, { groupId: ZERO_TOPIC_SEED_GROUP })
assert(
  '篇章相似: 种子零话题 → 诚实空态（空结果 + notice 文案，不静默兜底）',
  zeroTopicResult.results.length === 0 && zeroTopicResult.poolStats.totalInPool === 0 && typeof zeroTopicResult.notice === 'string' && zeroTopicResult.notice.length > 0,
  JSON.stringify(zeroTopicResult),
)
assert('篇章相似: 正常路径 notice 为 null（不误报空态）', passagesReadingResult.notice === null)

for (const dbGroupType of ['grammar_cloze', 'cloze', 'seven_choices']) {
  const seedGroupId = NONREADING_SEED[dbGroupType]
  const r = store.findSimilarPassages(db, { groupId: seedGroupId, limit: 50 })
  const real1 = findResult(r, `group-px-${dbGroupType}-cand-real`) // year 2020
  const real2 = findResult(r, `group-px-${dbGroupType}-cand-real2`) // year 2022
  const mock = findResult(r, `group-px-${dbGroupType}-cand-mock`) // year 2023, mock
  assert(
    `篇章相似(${dbGroupType}): 非 reading 无篇位档 — 所有候选都无 position-slot reason`,
    [real1, real2, mock].every((res) => res && !reasonKinds(res).includes('position-slot')),
    JSON.stringify(r.results),
  )
  assert(
    `篇章相似(${dbGroupType}): 真题(2020) > 模拟(2023，年份更新) — 真题>模拟不看年份`,
    real1.score > mock.score,
    `real1=${real1.score} mock=${mock.score}`,
  )
  assert(
    `篇章相似(${dbGroupType}): 同为真题时年份新旧尾序 — real2(2022) > real1(2020)`,
    real2.score === real1.score && r.results.indexOf(real2) < r.results.indexOf(real1),
  )
}

// source_type enum domain — self-contained: assert our own fixture only used
// the two real-world values, and the recipe's judgement is strictly binary
// (`=== 'real_exam'`), never a broader "class" (PA SF-2).
{
  const distinctSourceTypes = db.prepare('SELECT DISTINCT source_type FROM sources').all().map((r) => r.source_type)
  assert(
    'source_type 枚举域：fixture 内恰为 {real_exam, mock_exam} 二值',
    distinctSourceTypes.length === 2 &&
      distinctSourceTypes.includes('real_exam') &&
      distinctSourceTypes.includes('mock_exam'),
    JSON.stringify(distinctSourceTypes),
  )
}
// Opportunistic corroboration against the real repo DB when present (not
// required for this script to pass — CI/off-repo envs won't have it).
{
  const realDbPath = path.join(rootDir, 'data/question-bank.sqlite')
  if (existsSync(realDbPath)) {
    const realDb = new DatabaseSync(realDbPath, { readOnly: true })
    const rows = realDb.prepare('SELECT DISTINCT source_type FROM sources').all().map((r) => r.source_type)
    realDb.close()
    assert(
      '(bonus, 真库) source_type 枚举域恰为 {real_exam, mock_exam} — 出新值即红',
      rows.length === 2 && rows.includes('real_exam') && rows.includes('mock_exam'),
      JSON.stringify(rows),
    )
  } else {
    console.log('SKIP (bonus): 真库 data/question-bank.sqlite 不在盘上，跳过真库枚举域 corroboration')
  }
}

// writing seed on /api/similar-passages → 400
{
  let threw = null
  try {
    store.findSimilarPassages(db, { groupId: WRITING_SEED_GROUP })
  } catch (error) {
    threw = error
  }
  assert(
    '篇章相似: 写作题组 → 400 写作题型暂不支持配相似篇章',
    threw instanceof SimilarQuestionsError && threw.status === 400 && threw.message.includes('写作题型暂不支持配相似篇章'),
    String(threw?.message),
  )
}
// unknown groupId / empty groupId
{
  let threw = null
  try {
    store.findSimilarPassages(db, { groupId: 'group-does-not-exist-xyz' })
  } catch (error) {
    threw = error
  }
  assert('篇章相似: 未知 groupId → 400', threw instanceof SimilarQuestionsError && threw.status === 400)
}
{
  let threw = null
  try {
    store.findSimilarPassages(db, {})
  } catch (error) {
    threw = error
  }
  assert('篇章相似: 空 groupId → 400', threw instanceof SimilarQuestionsError && threw.status === 400)
}

// ═══ §2: /api/similar-questions — reading ════════════════════════════════
console.log('=== §2 /api/similar-questions（阅读） ===')

const readingSqResult = store.findSimilar(db, { seeds: [{ questionId: 'q-sq-reading-seed-1' }] })
assert(
  '小题相似(reading): skill 命中候选入池且带 facet-hit reason',
  Boolean(findResult(readingSqResult, 'group-sq-reading-cand-hit')) &&
    reasonKinds(findResult(readingSqResult, 'group-sq-reading-cand-hit')).includes('facet-hit'),
)
assert(
  '小题相似(reading): skill 不命中候选整组不入池（硬门槛，不是打 0 分留池）',
  !findResult(readingSqResult, 'group-sq-reading-cand-miss'),
)
assert(
  '小题相似(reading): matchedQuestionIds 只含命中的那道题，不含未命中的同组题',
  (() => {
    const r = findResult(readingSqResult, 'group-sq-reading-cand-hit')
    return r.matchedQuestionIds.includes('q-sq-reading-cand-hit-1') && !r.matchedQuestionIds.includes('q-sq-reading-cand-hit-2')
  })(),
)

// ═══ §2: grammarFill — finite verb vector 7>6>4>2>1>0 ═════════════════════
console.log('=== §2 /api/similar-questions（语法填空·谓语向量） ===')

const finiteSqResult = store.findSimilar(db, { seeds: [{ questionId: 'q-sq-finite-seed-1' }], limit: 50 })
for (const cand of finiteCandidates) {
  const r = findResult(finiteSqResult, `group-sq-finite-cand-${cand.key}`)
  assert(
    `谓语向量(${cand.key}): 组存在于池中（谓语向量分支门槛=有谓语空即入池，非向量值）`,
    Boolean(r),
    `missing group-sq-finite-cand-${cand.key}`,
  )
  if (r) {
    const decodedPrimary = Math.floor(r.score / 10000)
    assert(`谓语向量(${cand.key}): 解码 primary = ${cand.expected}`, decodedPrimary === cand.expected, `score=${r.score}`)
  }
}
{
  const scores = finiteCandidates.map((c) => Math.floor(findResult(finiteSqResult, `group-sq-finite-cand-${c.key}`).score / 10000))
  assert(
    '谓语向量: 7>6>4>2>1>0 排序保持（不翻转）',
    scores[0] > scores[1] && scores[1] > scores[2] && scores[2] > scores[3] && scores[3] > scores[4] && scores[4] > scores[5],
    JSON.stringify(scores),
  )
}
assert(
  '谓语向量: 组内多空取最高分空（不是第一个/不是平均）',
  Math.floor(findResult(finiteSqResult, 'group-sq-finite-cand-multi-blank').score / 10000) === 7,
)
assert(
  '谓语向量: 同话题加分作 secondary 打破同向量分候选的顺序',
  (() => {
    const withTopic = findResult(finiteSqResult, 'group-sq-finite-cand-topic')
    const withoutTopic = findResult(finiteSqResult, 'group-sq-finite-cand-notopic')
    return withTopic.score > withoutTopic.score && Math.floor(withTopic.score / 10000) === Math.floor(withoutTopic.score / 10000)
  })(),
)

// ═══ §2: grammarFill — non-finite role (全七格，含 predicative/subject-complement) ═
console.log('=== §2 /api/similar-questions（语法填空·非谓语 role 七格） ===')

for (const role of ALL_SEVEN_ROLES) {
  const r = store.findSimilar(db, { seeds: [{ questionId: `q-sq-role-seed-${role}-1` }] })
  const cand = findResult(r, roleCandGroupByRole[role])
  assert(
    `非谓语 role 白名单: '${role}' (${ROLE_LABELS[role]}) 命中候选并带正确 Chinese 文案 + form`,
    Boolean(cand) && reasonLabels(cand).some((l) => l === `同款：非谓语作${ROLE_LABELS[role]} · doing`),
    JSON.stringify(cand),
  )
  // Exclusion check uses a DIFFERENT role's candidate group (round-robin,
  // never the same role) — using the shared 'object'-role mismatch fixture
  // would be a false negative for the 'object' role's own iteration (it
  // would legitimately match, not be excluded).
  const otherRole = ALL_SEVEN_ROLES[(ALL_SEVEN_ROLES.indexOf(role) + 1) % ALL_SEVEN_ROLES.length]
  assert(
    `非谓语 role: '${role}' 种子排除 '${otherRole}' 候选（角色不匹配整组不入池）`,
    !findResult(r, roleCandGroupByRole[otherRole]),
  )
}
{
  // Generic role-mismatch fixture check, independent of the round-robin above.
  const r = store.findSimilar(db, { seeds: [{ questionId: 'q-sq-role-seed-attributive-1' }] })
  assert(
    "非谓语 role: 'attributive' 种子排除专门构造的不匹配候选（role='object'）",
    !findResult(r, 'group-sq-role-cand-mismatch'),
  )
}
{
  const r = store.findSimilar(db, { seeds: [{ questionId: 'q-sq-role-seed-attributive-1' }] })
  const noFormCand = findResult(r, 'group-sq-role-cand-noform')
  assert(
    '非谓语 role: 候选无 form 字段时 chip 优雅省略 form 段（不崩溃、不显示 undefined）',
    Boolean(noFormCand) && reasonLabels(noFormCand).some((l) => l === '同款：非谓语作定语'),
    JSON.stringify(noFormCand),
  )
}

// ═══ §2: grammarFill — other facetKey branch ═════════════════════════════
console.log('=== §2 /api/similar-questions（语法填空·其余考点 facetKey） ===')

const otherSqResult = store.findSimilar(db, { seeds: [{ questionId: 'q-sq-other-seed-1' }] })
assert(
  '其余考点: 同 facetKey 候选命中入池',
  Boolean(findResult(otherSqResult, 'group-sq-other-cand-hit')),
)
assert(
  '其余考点: 不同 facetKey 候选整组不入池',
  !findResult(otherSqResult, 'group-sq-other-cand-miss'),
)

// ═══ §2: 400 error semantics ═════════════════════════════════════════════
console.log('=== §2 错误语义（400） ===')

function expectError(label, fn, expectedSubstring) {
  try {
    fn()
    assert(label, false, 'did not throw')
  } catch (error) {
    const isSimilarError = error instanceof SimilarQuestionsError
    const messageOk = expectedSubstring ? error.message.includes(expectedSubstring) : true
    assert(label, isSimilarError && messageOk && error.status === 400, `error=${error?.message}`)
  }
}

expectError('empty seeds → 400', () => store.findSimilar(db, { seeds: [] }), 'seeds')
expectError(
  'unknown questionId → 400',
  () => store.findSimilar(db, { seeds: [{ questionId: 'q-does-not-exist-xyz-999' }] }),
  '未找到题目',
)
expectError(
  'writing seed → 400 写作题型暂不支持配相似',
  () => store.findSimilar(db, { seeds: [{ questionId: 'q-sq-writing-seed-1' }] }),
  '写作题型暂不支持配相似',
)
expectError(
  'cloze 种子 → 400 该题型走篇章相似（小题相似已下线）',
  () => store.findSimilar(db, { seeds: [{ questionId: `q-px-cloze-seed-1` }] }),
  '走篇章相似',
)
expectError(
  'sevenChoices 种子 → 400 该题型走篇章相似（小题相似已下线）',
  () => store.findSimilar(db, { seeds: [{ questionId: `q-px-seven_choices-seed-1` }] }),
  '走篇章相似',
)
expectError(
  'grammarFill 混类多种子（finite + non-finite）→ 400（PA SF-4）',
  () => store.findSimilar(db, { seeds: [{ questionId: MIXED_FINITE_QID }, { questionId: MIXED_NONFINITE_QID }] }),
  '一次只能按一个考点',
)

// ═══ Determinism (multi-seed, same branch) ═══════════════════════════════
console.log('=== 多种子确定性 ===')

const multiSeedInput = {
  seeds: [{ questionId: 'q-sq-finite-multi-1' }, { questionId: 'q-sq-finite-multi-2' }],
}
const run1 = JSON.stringify(store.findSimilar(db, multiSeedInput))
const run2 = JSON.stringify(store.findSimilar(db, multiSeedInput))
assert('多种子(同分支): 两次跑逐字节确定性一致', run1 === run2)

// ═══ poolStats honesty (small-question, independently recomputed) ════════
console.log('=== poolStats 池子诚实 ===')

{
  // Independent recompute for the finite-verb pool: every grammarFill group
  // with >= 1 finite blank, minus same-passage/-paper/-seed-group exclusion.
  let expected = 0
  for (const [gid, facets] of facetIndex.getIndex()) {
    if (facets.groupType !== 'grammarFill') continue
    if (gid === FINITE_SEED_GROUP) continue
    if (!facets.facetKeys.has(FINITE_VERB_FACET_KEY)) continue
    expected += 1
  }
  assert(
    'poolStats.totalInPool(谓语向量分支) 与独立重算一致',
    finiteSqResult.poolStats.totalInPool === expected,
    `store=${finiteSqResult.poolStats.totalInPool} recomputed=${expected}`,
  )
  assert('poolStats.returned 等于 results.length', finiteSqResult.poolStats.returned === finiteSqResult.results.length)
}

// ═══ Zero-AI invariant ════════════════════════════════════════════════════
console.log('=== 零 AI 不变量 ===')

const usedAfter = readDailyLimitUsed()
assert('AI daily-limit used count unchanged across the whole run', usedAfter === usedBefore, `before=${usedBefore} after=${usedAfter}`)

// ═══ Route wiring: both routes ════════════════════════════════════════════
console.log('=== 路由接线：两个 route 的真实 request/response 往返 ===')

function createFakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      this.headers = headers
    },
    end(body) {
      this.body = body
    },
  }
}

const routes = createSimilarQuestionsRoutes()
const questionsRoute = routes.find((r) => r.method === 'POST' && '/api/similar-questions'.match(r.pattern))
const passagesRoute = routes.find((r) => r.method === 'POST' && '/api/similar-passages'.match(r.pattern))
assert('route: POST /api/similar-questions is registered', Boolean(questionsRoute))
assert('route: POST /api/similar-passages is registered', Boolean(passagesRoute))

// The route handler calls `db.close()` in its `finally` block. The shared
// fixture `db` is still needed by assertions after this round-trip test, so
// this hands the route a manual delegate — NOT a spread/Proxy over the real
// DatabaseSync (native internal slots don't survive either: a spread loses
// them, and a Proxy calls methods with the Proxy as `this`, not the real
// instance) — whose `close` is a no-op and whose `prepare` forwards to the
// real connection with correct `this` binding (called directly on `db`).
function wrapDbForRouteRoundTrip(realDb) {
  return {
    prepare: (...args) => realDb.prepare(...args),
    close: () => {},
  }
}

async function roundTrip(route, url, body) {
  const fakeContext = {
    openDatabase: () => wrapDbForRouteRoundTrip(db),
    readJsonBody: async () => body,
    sendJson(response, status, respBody) {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(respBody))
    },
    similarQuestionsStore: {
      findSimilar: (d, i) => store.findSimilar(d, i),
      findSimilarPassages: (d, i) => store.findSimilarPassages(d, i),
    },
  }
  const fakeResponse = createFakeResponse()
  await route.handle({ request: {}, response: fakeResponse, url: new URL(url), context: fakeContext })
  return fakeResponse
}

if (questionsRoute) {
  const resp = await roundTrip(questionsRoute, 'http://x/api/similar-questions', { seeds: [{ questionId: 'q-sq-reading-seed-1' }] })
  assert('route round-trip (/api/similar-questions): 200 status', resp.statusCode === 200)
  const parsed = resp.body ? JSON.parse(resp.body) : null
  assert('route round-trip (/api/similar-questions): body has results array', Array.isArray(parsed?.results))
}
if (passagesRoute) {
  const resp = await roundTrip(passagesRoute, 'http://x/api/similar-passages', { groupId: SEED_PASSAGE_GROUP })
  assert('route round-trip (/api/similar-passages): 200 status', resp.statusCode === 200)
  const parsed = resp.body ? JSON.parse(resp.body) : null
  assert('route round-trip (/api/similar-passages): body has results array + poolStats', Array.isArray(parsed?.results) && typeof parsed?.poolStats?.totalInPool === 'number')
}

// ═══ Housekeeping / Forbidden-boundary protection ═══════════════════════
console.log('=== housekeeping + Forbidden 边界保护 ===')

assert(
  'analysisConfigs (real export) still has exactly the 4 known groupTypes',
  analysisConfigs.length === 4 && ['reading', 'sevenChoices', 'cloze', 'grammarFill'].every((t) => analysisConfigs.some((c) => c.groupType === t)),
  JSON.stringify(analysisConfigs.map((c) => c.groupType)),
)
const teachingFacetsSource = read('server/search/teachingFacets.mjs')
assert(
  'teachingFacets.mjs GET /api/teaching-facets route text unchanged (Forbidden: 不动 teachingFacets 检索层对外契约)',
  teachingFacetsSource.includes("defineRoute('GET', /^\\/api\\/teaching-facets$/"),
)

const apiSource = read('server/api.mjs')
assert('api.mjs still imports createSimilarQuestionsStore', apiSource.includes('createSimilarQuestionsStore'))
assert('api.mjs still imports createSimilarQuestionsRoutes', apiSource.includes('createSimilarQuestionsRoutes'))
assert(
  'api.mjs still adds createSimilarQuestionsRoutes() to serverRoutes composition (zero api.mjs touch — both routes live inside the one factory)',
  /serverRoutes\s*=\s*\[[\s\S]*createSimilarQuestionsRoutes\(\)/.test(apiSource),
)
assert('api.mjs still exposes similarQuestionsStore on serverContext', /similarQuestionsStore,/.test(apiSource))

const verifyCiSource = read('scripts/verify-ci.mjs')
assert(
  'verify-ci.mjs registers scripts/verify-similar-v2.mjs',
  verifyCiSource.includes("'scripts/verify-similar-v2.mjs'"),
)
assert(
  'verify-ci.mjs no longer registers the retired scripts/verify-similar-questions.mjs',
  !verifyCiSource.includes("'scripts/verify-similar-questions.mjs'"),
)

const readmeSource = read('scripts/README.md')
assert('scripts/README.md documents verify-similar-v2.mjs', readmeSource.includes('verify-similar-v2.mjs'))

// ─── cleanup ────────────────────────────────────────────────────────────
db.close()
rmSync(paperAssetsDir, { recursive: true, force: true })

console.log()
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
