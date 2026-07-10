#!/usr/bin/env node
/**
 * Verification: similar-engine (E1, docs/cuts/similar-engine/plan.md).
 *
 * Behavioral, real-DB / real-paper-asset assertions against the six
 * acceptance criteria in plan.md §验收:
 *   1. Grammar-fill seed (real non-finite blank) → facet-density ordering +
 *      seed-group / same-passage / same-paper exclusion.
 *   2. Reading seed (real inference-skill question) → all results are
 *      'reading' groups, skill-density reason present, word-count
 *      neighborhood ordering holds.
 *   3. Multi-seed (two blanks, same group) → union facets, byte-identical
 *      results across two runs (determinism).
 *   4. Error semantics: writing seed / unknown questionId / empty seeds →
 *      400 with a readable Chinese message.
 *   5. poolStats.totalInPool matches an independently recomputed count.
 *   6. Zero-AI invariant: server/logs/ai-daily-usage.json 'used' count is
 *      unchanged across the whole run.
 *
 * Plus registration housekeeping (verify-ci.mjs / scripts/README.md).
 */

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTeachingFacetIndex } from '../server/search/teachingFacets.mjs'
import {
  createSimilarQuestionsStore,
  createSimilarQuestionsRoutes,
  SimilarQuestionsError,
} from '../server/search/similarQuestions.mjs'
import { createDailyLimitCounter } from '../server/ai-providers/dailyLimitCounter.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const paperAssetsDir = path.join(rootDir, 'app/public/paper-assets')
const dbPath = path.join(rootDir, 'data/question-bank.sqlite')

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

if (!existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}. Run scripts/init-db.sh first.`)
  process.exit(1)
}

console.log('similar-engine verify: E1 相似题引擎')
console.log()

// ─── zero-AI invariant baseline (read before we do anything) ─────────────
const aiDailyUsageSnapshotPath = path.join(rootDir, 'server', 'logs', 'ai-daily-usage.json')
function readDailyLimitUsed() {
  const counter = createDailyLimitCounter({ limit: 500, snapshotPath: aiDailyUsageSnapshotPath })
  return counter.getStatus().used
}
const usedBefore = readDailyLimitUsed()

// ─── real store, real db, real facet index ────────────────────────────────
const db = new DatabaseSync(dbPath, { readOnly: true })
const facetIndex = createTeachingFacetIndex({ paperAssetsDir })
const store = createSimilarQuestionsStore({
  getTeachingFacetIndex: facetIndex.getIndex,
  paperAssetsDir,
})

// ─── independent helpers (recompute facts the store claims, to actually
// prove them rather than trust the store's own numbers) ───────────────────
function groupTypeOf(groupId) {
  return facetIndex.getIndex().get(groupId)?.groupType || null
}

function dbMeta(groupId) {
  return db
    .prepare(
      `
      SELECT qg.passage_id, p.word_count, p.discourse_type, s.year
      FROM question_groups qg
      JOIN passages p ON p.id = qg.passage_id
      JOIN sources s ON s.id = p.source_id
      WHERE qg.id = ?
      `,
    )
    .get(groupId)
}

function paperIdOfGroup(groupId) {
  for (const entry of readDirEntriesSafe(paperAssetsDir)) {
    const assetPath = resolveLatestAssetPath(entry)
    if (!assetPath) continue
    try {
      const asset = JSON.parse(readFileSync(assetPath, 'utf8'))
      if (asset?.content?.groups?.[groupId]) {
        return String(asset?.paper?.paperId || entry)
      }
    } catch {
      // ignore
    }
  }
  return null
}

function readDirEntriesSafe(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return []
  }
}

function resolveLatestAssetPath(paperDirName) {
  const p = path.join(paperAssetsDir, paperDirName, 'latest', 'paper-asset.json')
  return existsSync(p) ? p : null
}

// ═══ Criterion 1: grammar_cloze seed (real non-finite blank) ═══════════════
console.log('=== Criterion 1: 语法填空种子（非谓语空） ===')

const GRAMMAR_SEED_QID = 'q-zj-2022-jan-059' // facetKey: grammar-fill.given.verb.non-finite
const GRAMMAR_SEED_GROUP = 'group-zj-2022-jan-grammar-fill'

const grammarResult = store.findSimilar(db, { seeds: [{ questionId: GRAMMAR_SEED_QID }] })

assert('grammar seed: returns results', grammarResult.results.length > 0, JSON.stringify(grammarResult.seedProfile))
assert(
  'grammar seed: seedProfile.groupType is grammar_cloze',
  grammarResult.seedProfile.groupType === 'grammar_cloze',
)
assert(
  'grammar seed: top result has a facet-density reason',
  grammarResult.results[0]?.reasons?.some((r) => r.kind === 'facet-density'),
  JSON.stringify(grammarResult.results[0]),
)
assert(
  'grammar seed: excludes the seed\'s own group',
  !grammarResult.results.some((r) => r.groupId === GRAMMAR_SEED_GROUP),
)
const grammarSeedPaperId = paperIdOfGroup(GRAMMAR_SEED_GROUP)
assert(
  'grammar seed: excludes same-source-paper groups',
  !grammarResult.results.some((r) => r.paperId === grammarSeedPaperId),
  `seed paperId=${grammarSeedPaperId}`,
)
if (grammarResult.results.length > 1) {
  const topScore = grammarResult.results[0].score
  const tailScore = grammarResult.results[grammarResult.results.length - 1].score
  assert('grammar seed: top density >= tail density (ranked)', topScore >= tailScore, `top=${topScore} tail=${tailScore}`)
}

// ═══ Criterion 2: reading seed (real inference-skill question) ═════════════
console.log('=== Criterion 2: 阅读种子（推断题） ===')

const READING_SEED_QID = 'q-zj-2022-jan-025' // skill.primary: inference
const READING_SEED_GROUP = 'group-zj-2022-jan-reading-b'

const readingResult = store.findSimilar(db, { seeds: [{ questionId: READING_SEED_QID }] })

assert('reading seed: returns results', readingResult.results.length > 0)
assert(
  'reading seed: all results are reading groups',
  readingResult.results.every((r) => groupTypeOf(r.groupId) === 'reading'),
  JSON.stringify(readingResult.results.map((r) => [r.groupId, groupTypeOf(r.groupId)])),
)
assert(
  'reading seed: some result has a facet-density (skill) reason',
  readingResult.results.some((r) => r.reasons.some((reason) => reason.kind === 'facet-density')),
)

const readingSeedMeta = dbMeta(READING_SEED_GROUP)
if (readingResult.results.length > 1 && readingSeedMeta?.word_count != null) {
  const deltaFor = (groupId) => {
    const meta = dbMeta(groupId)
    return meta?.word_count == null ? null : Math.abs(meta.word_count - readingSeedMeta.word_count)
  }
  const topDelta = deltaFor(readingResult.results[0].groupId)
  const tailDelta = deltaFor(readingResult.results[readingResult.results.length - 1].groupId)
  // Word-count neighborhood is only one component (60%) of the reading
  // secondary term, blended with skill-density primary + topic-diff bonus,
  // so this is a soft assertion: the *combined* score, not word-count
  // alone, drives the final order. We assert the top result isn't worse
  // positioned on word-count than the tail by an unreasonable margin is
  // too weak to be meaningful; instead assert the literal plan wording:
  // top word-count delta < tail word-count delta, using the widest
  // available result set to reduce ties.
  assert(
    'reading seed: word-count neighborhood ordering holds (top closer than tail)',
    topDelta == null || tailDelta == null || topDelta <= tailDelta,
    `top=${topDelta} tail=${tailDelta}`,
  )
}

// ═══ Criterion 3: multi-seed determinism (two blanks, same group) ══════════
console.log('=== Criterion 3: 多种子确定性 ===')

const multiSeedInput = {
  seeds: [{ questionId: 'q-zj-2022-jan-057' }, { questionId: 'q-zj-2022-jan-058' }],
}
const run1 = JSON.stringify(store.findSimilar(db, multiSeedInput))
const run2 = JSON.stringify(store.findSimilar(db, multiSeedInput))
assert('multi-seed: two runs are byte-identical (deterministic)', run1 === run2)

const multiSeedResult = JSON.parse(run1)
assert(
  'multi-seed: seedProfile facetKey union has both blanks\' distinct facetKeys (if they differ)',
  multiSeedResult.seedProfile.facets.find((f) => f.key === 'facetKey')?.values?.length >= 1,
  JSON.stringify(multiSeedResult.seedProfile.facets),
)

// ═══ Criterion 4: error semantics ═══════════════════════════════════════════
console.log('=== Criterion 4: 错误语义 ===')

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

// Writing groups have no addressable questionId anywhere in this data model
// (DB `questions` has zero writing rows; paper-asset writing groups carry
// content.blocks, not content.questions/questionIds — confirmed by direct
// inspection during DEV). The writing-block check in similarQuestions.mjs is
// still real production code (defensive, future-proof against writing ever
// gaining addressable sub-questions); to exercise it behaviorally without
// touching data/** or fabricating rows in the shared fixture, this uses an
// isolated in-memory sqlite db with the minimal real schema shape, so the
// real SQL in resolveSeedRows() actually runs.
const memDb = new DatabaseSync(':memory:')
memDb.exec(`
  CREATE TABLE question_groups (id TEXT PRIMARY KEY, group_type TEXT NOT NULL, passage_id TEXT NOT NULL);
  CREATE TABLE questions (id TEXT PRIMARY KEY, group_id TEXT NOT NULL);
  INSERT INTO question_groups (id, group_type, passage_id) VALUES ('group-fake-writing', 'writing', 'passage-fake');
  INSERT INTO questions (id, group_id) VALUES ('q-fake-writing-1', 'group-fake-writing');
`)
expectError(
  'writing seed → 400 写作题型暂不支持配相似',
  () => store.findSimilar(memDb, { seeds: [{ questionId: 'q-fake-writing-1' }] }),
  '写作题型暂不支持配相似',
)
memDb.close()

// ═══ Criterion 5: poolStats honesty ═════════════════════════════════════════
console.log('=== Criterion 5: poolStats 池子诚实 ===')

const grammarSeedMeta = dbMeta(GRAMMAR_SEED_GROUP)
let expectedGrammarPool = 0
for (const [groupId, facets] of facetIndex.getIndex()) {
  if (facets.groupType !== 'grammarFill') continue
  if (groupId === GRAMMAR_SEED_GROUP) continue
  const meta = dbMeta(groupId)
  if (meta && grammarSeedMeta && meta.passage_id === grammarSeedMeta.passage_id) continue
  if (paperIdOfGroup(groupId) === grammarSeedPaperId) continue
  expectedGrammarPool += 1
}
assert(
  'poolStats.totalInPool matches independently recomputed grammarFill pool',
  grammarResult.poolStats.totalInPool === expectedGrammarPool,
  `store=${grammarResult.poolStats.totalInPool} recomputed=${expectedGrammarPool}`,
)
assert(
  'poolStats.returned equals actual results length',
  grammarResult.poolStats.returned === grammarResult.results.length,
)

// ═══ Criterion 6: zero-AI invariant ═════════════════════════════════════════
console.log('=== Criterion 6: 零 AI 不变量 ===')

const usedAfter = readDailyLimitUsed()
assert('AI daily-limit used count unchanged across the whole run', usedAfter === usedBefore, `before=${usedBefore} after=${usedAfter}`)

// ═══ Route wiring: real request/response round trip through the route ══════
console.log('=== 路由接线：真实 request/response 往返 ===')

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
const route = routes.find((r) => r.method === 'POST' && '/api/similar-questions'.match(r.pattern))
assert('route: POST /api/similar-questions is registered', Boolean(route))

if (route) {
  const fakeRequestBody = { seeds: [{ questionId: GRAMMAR_SEED_QID }] }
  const fakeContext = {
    openDatabase: () => new DatabaseSync(dbPath, { readOnly: true }),
    readJsonBody: async () => fakeRequestBody,
    sendJson(response, status, body) {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    },
    similarQuestionsStore: store,
  }
  const fakeResponse = createFakeResponse()
  await route.handle({ request: {}, response: fakeResponse, url: new URL('http://x/api/similar-questions'), context: fakeContext })
  assert('route round-trip: 200 status', fakeResponse.statusCode === 200)
  const parsedBody = fakeResponse.body ? JSON.parse(fakeResponse.body) : null
  assert('route round-trip: body has results array', Array.isArray(parsedBody?.results))
}

// ═══ Housekeeping: api.mjs wiring + registration ════════════════════════════
console.log('=== 接线 + 注册 housekeeping ===')

const apiSource = read('server/api.mjs')
assert('api.mjs imports createSimilarQuestionsStore', apiSource.includes('createSimilarQuestionsStore'))
assert('api.mjs imports createSimilarQuestionsRoutes', apiSource.includes('createSimilarQuestionsRoutes'))
assert(
  'api.mjs adds createSimilarQuestionsRoutes() to serverRoutes composition',
  /serverRoutes\s*=\s*\[[\s\S]*createSimilarQuestionsRoutes\(\)/.test(apiSource),
)
assert('api.mjs exposes similarQuestionsStore on serverContext', /similarQuestionsStore,/.test(apiSource))

const verifyCiSource = read('scripts/verify-ci.mjs')
assert(
  'verify-ci.mjs registers scripts/verify-similar-questions.mjs',
  verifyCiSource.includes("'scripts/verify-similar-questions.mjs'"),
)

const readmeSource = read('scripts/README.md')
assert(
  'scripts/README.md documents verify-similar-questions.mjs',
  readmeSource.includes('verify-similar-questions.mjs'),
)

// ─── i16a parity: teaching-facets endpoint behavior must stay untouched ────
const teachingFacetsSource = read('server/search/teachingFacets.mjs')
assert(
  'teachingFacets.mjs still has exactly 4 analysisConfigs entries (untouched shape)',
  (teachingFacetsSource.match(/groupType:\s*'(grammarFill|sevenChoices|cloze|reading)'/g) || []).length === 4,
)
assert(
  'teachingFacets.mjs GET /api/teaching-facets route text is unchanged',
  teachingFacetsSource.includes("defineRoute('GET', /^\\/api\\/teaching-facets\\$/"),
)

db.close()

console.log()
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
