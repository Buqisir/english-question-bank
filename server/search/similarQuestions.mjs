import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { defineRoute } from '../router/index.mjs'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'
import { analysisConfigs } from './teachingFacets.mjs'

/**
 * similar-engine v2 (E5, docs/cuts/similar-v2-engine/plan.md).
 *
 * Deterministic, zero-AI recipes for two related-but-distinct jobs, both
 * documented in docs/cuts/similar-questions/program.md §配方 v2:
 *
 *   - POST /api/similar-passages — "篇章相似" (whole-group/passage level,
 *     all four non-writing groupTypes): 同话题 hard gate → 篇位 (reading
 *     only) → 真题 > 模拟 → 年份 tie-break. Strictly layered
 *     (primary*10000 + secondary*100), never a weighted sum (program.md
 *     拍板：分层制不得退化为加权求和).
 *   - POST /api/similar-questions — "小题相似" (single-question level,
 *     reading + grammarFill only; cloze/sevenChoices retired to passages
 *     only): 题型专属维度命中入池 (hard gate) → 同话题加分 (secondary) →
 *     年份 tie-break. Density scoring is gone entirely (program.md: "空数
 *     密度是虚的，没用").
 *
 * Both reuse the pool-construction/exclusion plumbing from the v1 engine
 * (same passage / same source-paper / seed-group exclusion, poolStats
 * honesty) and the raw per-question facet index (buildRawFacetIndex) that
 * walks paper-asset analysis files once for per-blank granularity the
 * aggregated teachingFacets.mjs index doesn't carry.
 *
 * Data-contract lock (PA MF-2, similar-v2-engine/plan.md): the finite-verb
 * `tense` / `voice` / `agreementSensitive` fields have exactly one read
 * path — the grammar-fill-analysis blank entry, passed through verbatim by
 * buildRawFacetIndex's `...entry` spread below. No sidecar-merge logic is
 * added here; once D1 (grammar-facets-v2) lands those fields on the entry,
 * this module picks them up with zero code changes.
 */

// ─── groupType vocabulary bridge ──────────────────────────────────────────
// DB / paper-asset "group_type" (snake_case, e.g. 'grammar_cloze') vs.
// teachingFacets.mjs facet-index "groupType" (camelCase, e.g. 'grammarFill').
const DB_GROUP_TYPE_TO_FACET_TYPE = {
  grammar_cloze: 'grammarFill',
  seven_choices: 'sevenChoices',
  cloze: 'cloze',
  reading: 'reading',
}
const SUPPORTED_DB_GROUP_TYPES = new Set(Object.keys(DB_GROUP_TYPE_TO_FACET_TYPE))

// Small-question ("配相似" per题) recipe support shrank to reading + grammarFill
// in v2 — cloze/sevenChoices only have a passage-level recipe now (program.md
// §配方 v2: "完形/七选五：小题相似不做").
const SMALL_QUESTION_RETIRED_DB_GROUP_TYPES = new Set(['cloze', 'seven_choices'])

const GROUP_TYPE_LABELS = {
  reading: '阅读理解',
  cloze: '完形填空',
  seven_choices: '七选五',
  grammar_cloze: '语法填空',
  writing: '写作',
  continuation: '读后续写',
}

// facetKey values carry the 'grammar-fill.' prefix on disk (see
// grammarFillFacetRegistry.ts / analysis files) — kept verbatim here, not
// re-derived, so this module never drifts from the real on-disk key shape.
const FINITE_VERB_FACET_KEY = 'grammar-fill.given.verb.finite'
const NON_FINITE_VERB_FACET_KEY = 'grammar-fill.given.verb.non-finite'

// Non-finite role 七格终稿 (program.md §语法填空考点粒度终稿, 2026-07-15
// owner 补主补拍板). `predicative` and `subject-complement` do not exist in
// the current real DB yet (D1's role-correction step introduces them) —
// they are listed here regardless so the engine never silently drops a
// legitimate role once D1 lands (PA C-2 "防漏格假绿").
const NON_FINITE_ROLE_LABELS = {
  adverbial: '状语',
  attributive: '定语',
  subject: '主语',
  object: '宾语',
  predicative: '表语',
  'object-complement': '宾语补足语',
  'subject-complement': '主语补足语',
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export class SimilarQuestionsError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'SimilarQuestionsError'
    this.status = status
  }
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

// ─── Raw per-question facet index + paper metadata (lazy, cached) ─────────

function buildRawFacetIndex(paperAssetsDir) {
  const questionFacetById = new Map()
  const paperMetaByGroupId = new Map()

  if (!existsSync(paperAssetsDir)) return { questionFacetById, paperMetaByGroupId }

  for (const entry of readdirSync(paperAssetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const { assetPath, baseDir } = resolvePaperAssetReadPaths(paperAssetsDir, entry.name)
    if (!existsSync(assetPath)) continue

    try {
      const asset = readJsonFile(assetPath)
      const paperId = String(asset?.paper?.paperId || entry.name)
      const paperTitle = String(asset?.paper?.title || '').trim()

      const questionToGroup = new Map()
      const groups = asset?.content?.groups
      if (groups && typeof groups === 'object') {
        for (const [groupId, group] of Object.entries(groups)) {
          const gid = String(groupId)
          const questionIds = Array.isArray(group?.questionIds) ? group.questionIds.map(String) : []
          paperMetaByGroupId.set(gid, {
            paperId,
            paperTitle,
            groupTitle: String(group?.title || '').trim(),
            questionIds,
          })
          for (const qid of questionIds) {
            questionToGroup.set(qid, { groupId: gid, groupType: group.groupType })
          }
        }
      }

      for (const config of analysisConfigs) {
        const analysisPath = path.join(baseDir, 'analyses', config.fileName)
        if (!existsSync(analysisPath)) continue
        const analysis = readJsonFile(analysisPath)
        if (analysis?.paperId !== paperId) continue
        if (analysis?.schemaVersion !== config.schemaVersion) continue

        const entryMap = analysis?.[config.entryMapKey]
        if (!entryMap || typeof entryMap !== 'object') continue

        for (const [questionId, entry] of Object.entries(entryMap)) {
          const qidStr = String(questionId)
          const groupEntry = questionToGroup.get(qidStr)
          if (!groupEntry) continue
          if (groupEntry.groupType !== config.groupType) continue

          // Data-contract lock (PA MF-2): whatever fields D1 adds to the
          // blank entry (tense/voice/agreementSensitive/role/form/facetKey/
          // ...) flow through untouched via this spread. No sidecar merge.
          questionFacetById.set(qidStr, { groupId: groupEntry.groupId, groupType: config.groupType, ...entry })
        }
      }
    } catch {
      // Ignore invalid paper-asset dirs — import validation owns that error,
      // this engine just skips what it cannot read (mirrors teachingFacets.mjs).
    }
  }

  return { questionFacetById, paperMetaByGroupId }
}

// ─── DB metadata (batched per request; small pools, cheap) ────────────────

function fetchGroupDbMeta(db, groupIds) {
  const ids = Array.from(new Set(groupIds)).filter(Boolean)
  const byId = new Map()
  if (ids.length === 0) return byId

  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `
      SELECT
        qg.id AS group_id,
        qg.title,
        qg.passage_id,
        qg.group_type,
        p.discourse_type,
        p.word_count,
        p.source_id,
        s.year,
        s.region,
        s.paper_name,
        s.source_type
      FROM question_groups qg
      JOIN passages p ON p.id = qg.passage_id
      JOIN sources s ON s.id = p.source_id
      WHERE qg.id IN (${placeholders})
      `,
    )
    .all(...ids)

  for (const row of rows) {
    byId.set(row.group_id, {
      title: row.title,
      passageId: row.passage_id,
      groupType: row.group_type,
      discourseType: row.discourse_type || '',
      wordCount: row.word_count == null ? null : Number(row.word_count),
      sourceId: row.source_id,
      year: row.year == null ? null : Number(row.year),
      region: row.region || '',
      paperName: row.paper_name || '',
      sourceType: row.source_type || '',
    })
  }
  return byId
}

// 阅读篇位真值（R1-genre-truth 落库后）：DB 里一个 source 行 == 一篇独立
// passage（source_id 对每篇阅读文章各自成行，不是"一张试卷一个 source_id"），
// 所以"同卷"不能按 source_id 分组——同一张试卷的四篇阅读文章共享
// (year, region, paper_name) 三元组，这才是真正的"同卷"分组键。窗口函数
// 按这个键分区、display_order 排序出名次（1..n，对应 A..D）。
function fetchReadingSlots(db, groupIds) {
  const ids = Array.from(new Set(groupIds)).filter(Boolean)
  const byId = new Map()
  if (ids.length === 0) return byId

  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `
      WITH reading_groups AS (
        SELECT qg.id AS group_id, qg.display_order, s.year, s.region, s.paper_name
        FROM question_groups qg
        JOIN passages p ON p.id = qg.passage_id
        JOIN sources s ON s.id = p.source_id
        WHERE qg.group_type = 'reading'
      ),
      ranked AS (
        SELECT group_id,
          ROW_NUMBER() OVER (
            PARTITION BY year, region, paper_name ORDER BY display_order
          ) AS slot
        FROM reading_groups
      )
      SELECT group_id, slot FROM ranked WHERE group_id IN (${placeholders})
      `,
    )
    .all(...ids)

  for (const row of rows) {
    byId.set(row.group_id, row.slot)
  }
  return byId
}

// 篇位名次 → 字母（1 → A, 2 → B, ...），只用于 chip 文案展示。
function slotLetter(slot) {
  return slot == null ? null : String.fromCharCode(64 + slot)
}

function fetchTopicLabels(db, groupIds) {
  const ids = Array.from(new Set(groupIds)).filter(Boolean)
  const byId = new Map(ids.map((id) => [id, new Set()]))
  if (ids.length === 0) return byId

  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT question_group_id, label FROM question_group_topic_labels WHERE question_group_id IN (${placeholders})`,
    )
    .all(...ids)

  for (const row of rows) {
    const set = byId.get(row.question_group_id) || new Set()
    if (row.label) set.add(row.label)
    byId.set(row.question_group_id, set)
  }
  return byId
}

function resolveSeedRows(db, questionIds) {
  const placeholders = questionIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `
      SELECT q.id AS question_id, q.group_id, qg.group_type, qg.passage_id
      FROM questions q
      JOIN question_groups qg ON qg.id = q.group_id
      WHERE q.id IN (${placeholders})
      `,
    )
    .all(...questionIds)
  const byId = new Map(rows.map((row) => [row.question_id, row]))
  return questionIds.map((id) => byId.get(id) || null)
}

function resolvePassageSeedGroupRow(db, groupId) {
  const row = db
    .prepare(
      `
      SELECT qg.id AS group_id, qg.group_type, qg.passage_id
      FROM question_groups qg
      WHERE qg.id = ?
      `,
    )
    .get(groupId)
  return row || null
}

// ─── small set helpers ─────────────────────────────────────────────────────

function intersectSize(a, b) {
  if (!a || !b || a.size === 0 || b.size === 0) return 0
  let count = 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const value of small) {
    if (large.has(value)) count += 1
  }
  return count
}

function hasOverlap(a, b) {
  return intersectSize(a, b) > 0
}

function unionInto(target, values) {
  for (const value of values) {
    if (value != null && value !== '') target.add(value)
  }
  return target
}

function matchedValues(seedSet, candidateSet) {
  return [...candidateSet].filter((value) => seedSet.has(value))
}

// ─── score-term primitive (score and reason are always produced together —
// no term may contribute points without a matching reason chip). `densityTerm`
// is gone in v2 (program.md: "空数密度是虚的，没用") — every remaining term
// is either this boolean hit or a bespoke bounded-tier term (position-slot,
// verb-vector) defined next to its recipe. ───────────────────────────────
function booleanTerm({ matched, kind, label }) {
  if (!matched) return { value: 0, reason: null }
  return { value: 99, reason: { kind, label } }
}

function stripFacetKeyPrefix(facetKey) {
  return facetKey.startsWith('grammar-fill.') ? facetKey.slice('grammar-fill.'.length) : facetKey
}

function classifyGrammarFillBranch(facetKey) {
  if (facetKey === FINITE_VERB_FACET_KEY) return 'finite'
  if (facetKey === NON_FINITE_VERB_FACET_KEY) return 'non-finite'
  return 'other'
}

// 时态4 / 语态2 / 一致1，取组内最高分空（program.md §语法填空考点粒度终稿）。
// 三特征全部从 answer 推导，D1 落库前 raw.tense/voice/agreementSensitive
// 均为 undefined → 向量恒 0（"谓语向量取不到值属预期"，联调等 D1 落库）。
function verbVectorScore(seedTargets, raw) {
  let score = 0
  if (raw.tense && seedTargets.tenses.has(raw.tense)) score += 4
  if (raw.voice && seedTargets.voices.has(raw.voice)) score += 2
  if (seedTargets.agreementSensitive && raw.agreementSensitive === true) score += 1
  return score
}

function decodeVerbVectorLabel(score) {
  const parts = []
  if (score & 4) parts.push('时态')
  if (score & 2) parts.push('语态')
  if (score & 1) parts.push('一致')
  return parts.join('+')
}

// ═══════════════════════════════════════════════════════════════════════
// §1 — POST /api/similar-passages ("篇章相似"，四题型统一)
// ═══════════════════════════════════════════════════════════════════════

function passagePositionTerm(seedSlots, candidateSlot) {
  if (candidateSlot == null || seedSlots.size === 0) return { value: 0, reason: null }
  if (seedSlots.has(candidateSlot)) {
    return { value: 70, reason: { kind: 'position-slot', label: `同为${slotLetter(candidateSlot)}篇` } }
  }
  let minDiff = Infinity
  for (const slot of seedSlots) {
    const diff = Math.abs(candidateSlot - slot)
    if (diff < minDiff) minDiff = diff
  }
  if (minDiff === 1) {
    return { value: 35, reason: { kind: 'position-slot', label: '篇位相邻' } }
  }
  return { value: 0, reason: null }
}

function passageAuthenticSourceTerm(sourceType) {
  return booleanTerm({ matched: sourceType === 'real_exam', kind: 'authentic-source', label: '真题' })
}

// 话题是硬门槛（每个候选进池前已保证重合），这条 reason 只是把匹配到的
// 标签亮出来当 chip，不参与 score（program.md：分层制下同话题不是加分项，
// 是资格）。
function passageTopicReason(seedTopics, candidateTopics) {
  const matched = matchedValues(seedTopics, candidateTopics)
  if (matched.length === 0) return null
  return { kind: 'topic-match', label: `同话题·${matched.join('/')}` }
}

function parseGroupIdInput(input) {
  const groupId = typeof input?.groupId === 'string' ? input.groupId.trim() : ''
  if (!groupId) {
    throw new SimilarQuestionsError('groupId 不能为空：请提供要找相似篇章的题组')
  }
  return groupId
}

function findSimilarPassages(db, input, { getTeachingFacetIndex, getRawIndex }) {
  const groupId = parseGroupIdInput(input)
  const limit = parseLimit(input)

  const seedRow = resolvePassageSeedGroupRow(db, groupId)
  if (!seedRow) {
    throw new SimilarQuestionsError(`未找到题组 ${groupId}`)
  }
  if (seedRow.group_type === 'writing') {
    throw new SimilarQuestionsError('写作题型暂不支持配相似篇章')
  }
  if (!SUPPORTED_DB_GROUP_TYPES.has(seedRow.group_type)) {
    const label = GROUP_TYPE_LABELS[seedRow.group_type] || seedRow.group_type
    throw new SimilarQuestionsError(`${label}题型暂不支持配相似篇章`)
  }
  const facetType = DB_GROUP_TYPE_TO_FACET_TYPE[seedRow.group_type]

  const facetIndex = getTeachingFacetIndex()
  if (!facetIndex.get(groupId)) {
    throw new SimilarQuestionsError('该篇暂无教学维度解析数据，无法配相似篇章')
  }

  const rawIndex = getRawIndex()
  const seedPaperId = rawIndex.paperMetaByGroupId.get(groupId)?.paperId || null

  const seedTopicLabels = fetchTopicLabels(db, [groupId]).get(groupId) || new Set()

  // 种子零话题 → 诚实空态（PA SF-3）：硬门槛下这类种子零候选入池，直接
  // 返回空结果 + 明示文案，不构建池子、不假装有候选。
  if (seedTopicLabels.size === 0) {
    return {
      seedProfile: { groupType: seedRow.group_type, topicLabels: [] },
      results: [],
      poolStats: { totalInPool: 0, returned: 0 },
      notice: '该篇暂无话题标签，暂时无法找相似篇章',
    }
  }

  const poolEntries = []
  for (const [gid, facets] of facetIndex) {
    if (facets.groupType !== facetType) continue
    poolEntries.push({ groupId: gid, facets })
  }

  const allGroupIds = [...new Set([groupId, ...poolEntries.map((entry) => entry.groupId)])]
  const dbMetaByGroupId = fetchGroupDbMeta(db, allGroupIds)
  const topicLabelsByGroupId = fetchTopicLabels(db, allGroupIds)

  if (facetType === 'reading') {
    const readingSlotByGroupId = fetchReadingSlots(db, allGroupIds)
    for (const [gid, slot] of readingSlotByGroupId) {
      const meta = dbMetaByGroupId.get(gid)
      if (meta) meta.readingSlot = slot
    }
  }

  const seedMeta = dbMetaByGroupId.get(groupId) || {}
  const seedSlots = new Set(seedMeta.readingSlot != null ? [seedMeta.readingSlot] : [])

  const candidates = poolEntries.filter((entry) => {
    if (entry.groupId === groupId) return false
    const meta = dbMetaByGroupId.get(entry.groupId)
    if (meta && seedMeta.passageId != null && meta.passageId === seedMeta.passageId) return false
    const paperId = rawIndex.paperMetaByGroupId.get(entry.groupId)?.paperId
    if (paperId && seedPaperId && paperId === seedPaperId) return false
    // 同话题 = 门槛（program.md：话题不同的直接不进池，不是降权）。
    const candidateTopics = topicLabelsByGroupId.get(entry.groupId) || new Set()
    return hasOverlap(seedTopicLabels, candidateTopics)
  })

  const totalInPool = candidates.length

  const scored = candidates.map((entry) => {
    const dbMeta = dbMetaByGroupId.get(entry.groupId) || {}
    const candidateTopics = topicLabelsByGroupId.get(entry.groupId) || new Set()
    const paperMeta = rawIndex.paperMetaByGroupId.get(entry.groupId) || {}

    // tier→槽位映射（PA C-3）：篇位进 primary、真题进 secondary、年份
    // tie-break——真题永在篇位之下一层，非 reading 无篇位档、真题即最高档。
    const position = passagePositionTerm(seedSlots, dbMeta.readingSlot ?? null)
    const source = passageAuthenticSourceTerm(dbMeta.sourceType)
    const topicReason = passageTopicReason(seedTopicLabels, candidateTopics)

    const score = position.value * 10000 + source.value * 100
    const reasons = [position.reason, source.reason, topicReason].filter(Boolean)

    return {
      groupId: entry.groupId,
      paperId: paperMeta.paperId || null,
      title: dbMeta.title || paperMeta.groupTitle || entry.groupId,
      sourceLabel:
        [dbMeta.year, dbMeta.region, dbMeta.paperName].filter(Boolean).join(' ') || paperMeta.paperTitle || '',
      score,
      reasons,
      _year: dbMeta.year ?? -Infinity,
    }
  })

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b._year !== a._year) return b._year - a._year
    return a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 : 0
  })

  const results = scored.slice(0, limit).map(({ _year, ...rest }) => rest)

  return {
    seedProfile: { groupType: seedRow.group_type, topicLabels: [...seedTopicLabels] },
    results,
    poolStats: { totalInPool, returned: results.length },
    notice: null,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// §2 — POST /api/similar-questions ("小题相似"，仅阅读 + 语法填空)
// ═══════════════════════════════════════════════════════════════════════

function readingSmallQuestionPrimary(seedTargets, candidate) {
  const matched = matchedValues(seedTargets.skills, candidate.facets.skills)
  return booleanTerm({ matched: matched.length > 0, kind: 'facet-hit', label: `同小题题型：${matched.join('/')}` })
}

function nonFiniteRolePrimary(seedTargets, candidate) {
  const matchedRoles = matchedValues(seedTargets.roles, candidate.facets.roles)
  if (matchedRoles.length === 0) return { value: 0, reason: null }

  // form 只进 chip 当解释，不进匹配（program.md：形态降级当解释）。D1 落库
  // 前 raw.form 恒 undefined → chip 省略 form 段，不崩溃。
  let form = null
  for (const qid of candidate.questionIds) {
    const raw = candidate.rawIndex.questionFacetById.get(qid)
    if (raw?.facetKey === NON_FINITE_VERB_FACET_KEY && raw.role && matchedRoles.includes(raw.role) && raw.form) {
      form = raw.form
      break
    }
  }
  const roleLabel = matchedRoles.map((role) => NON_FINITE_ROLE_LABELS[role] || role).join('/')
  const label = form ? `同款：非谓语作${roleLabel} · ${form}` : `同款：非谓语作${roleLabel}`
  return booleanTerm({ matched: true, kind: 'facet-hit', label })
}

function otherFacetKeyPrimary(seedTargets, candidate) {
  const matchedKeys = matchedValues(seedTargets.facetKeys, candidate.facets.facetKeys)
  return booleanTerm({
    matched: matchedKeys.length > 0,
    kind: 'facet-hit',
    label: `同考点：${matchedKeys.map(stripFacetKeyPrefix).join('/')}`,
  })
}

function finiteVerbVectorPrimary(seedTargets, candidate) {
  let max = 0
  for (const qid of candidate.questionIds) {
    const raw = candidate.rawIndex.questionFacetById.get(qid)
    if (!raw || raw.facetKey !== FINITE_VERB_FACET_KEY) continue
    const score = verbVectorScore(seedTargets, raw)
    if (score > max) max = score
  }
  if (max <= 0) return { value: 0, reason: null }
  return { value: max, reason: { kind: 'verb-vector', label: `谓语相似：${decodeVerbVectorLabel(max)}` } }
}

function grammarFillSmallQuestionPrimary(seedTargets, candidate) {
  if (seedTargets.branch === 'finite') return finiteVerbVectorPrimary(seedTargets, candidate)
  if (seedTargets.branch === 'non-finite') return nonFiniteRolePrimary(seedTargets, candidate)
  return otherFacetKeyPrimary(seedTargets, candidate)
}

function grammarFillPoolPredicate(seedTargets, facets) {
  if (seedTargets.branch === 'finite') return facets.facetKeys.has(FINITE_VERB_FACET_KEY)
  if (seedTargets.branch === 'non-finite') return hasOverlap(seedTargets.roles, facets.roles)
  return hasOverlap(seedTargets.facetKeys, facets.facetKeys)
}

// 题型专属维度命中入池 → 同话题加分（secondary）→ 年份尾序 — the shared
// small-question skeleton (program.md §v2 共同骨架). Pool membership itself
// IS the primary-term gate (poolPredicate below); scoring only re-derives
// the same hit so it can carry a reason chip (finite branch is the one
// exception — presence-only gate, vector score varies 0-7 inside the pool).
const SMALL_QUESTION_POOL_PREDICATES = {
  reading: (seedTargets, facets) => hasOverlap(seedTargets.skills, facets.skills),
  grammarFill: grammarFillPoolPredicate,
}

const SMALL_QUESTION_PRIMARY_SCORERS = {
  reading: readingSmallQuestionPrimary,
  grammarFill: grammarFillSmallQuestionPrimary,
}

function topicSecondaryTerm(seedTargets, candidate) {
  const matched = matchedValues(seedTargets.topicLabels, candidate.topicLabels)
  return booleanTerm({ matched: matched.length > 0, kind: 'topic-match', label: `同话题·${matched.join('/')}` })
}

function computeSmallQuestionMatchedIds(facetType, seedTargets, questionIds, rawIndex) {
  const matched = []
  for (const qid of questionIds) {
    const raw = rawIndex.questionFacetById.get(qid)
    if (!raw) continue

    if (facetType === 'reading') {
      const skillPrimary = raw.skill?.primary
      if (skillPrimary && seedTargets.skills.has(skillPrimary)) matched.push(qid)
      continue
    }

    // grammarFill
    if (seedTargets.branch === 'finite') {
      if (raw.facetKey === FINITE_VERB_FACET_KEY && verbVectorScore(seedTargets, raw) > 0) matched.push(qid)
    } else if (seedTargets.branch === 'non-finite') {
      if (raw.facetKey === NON_FINITE_VERB_FACET_KEY && raw.role && seedTargets.roles.has(raw.role)) matched.push(qid)
    } else if (raw.facetKey && seedTargets.facetKeys.has(raw.facetKey)) {
      matched.push(qid)
    }
  }
  return matched
}

// ─── seed target assembly (per facetType, only the fields the recipe needs) ─

function buildSmallQuestionSeedTargets(facetType, seedRows, rawIndex, topicLabelsByGroupId) {
  const seedGroupIds = seedRows.map((row) => row.group_id)
  const seedRawEntries = seedRows.map((row) => rawIndex.questionFacetById.get(row.question_id)).filter(Boolean)

  const topicLabels = new Set()
  for (const gid of seedGroupIds) unionInto(topicLabels, topicLabelsByGroupId.get(gid) || [])

  if (facetType === 'reading') {
    return {
      skills: unionInto(new Set(), seedRawEntries.map((entry) => entry.skill?.primary)),
      topicLabels,
    }
  }

  // grammarFill — 混类多种子 → 400（PA SF-4）：分支判定按 facetKey
  // given.verb.finite / given.verb.non-finite（PA C-2），其余考点统一归
  // 'other' 桶，彼此之间允许混（同一个 'other' 桶内可以是不同 facetKey）。
  const branches = new Set(seedRawEntries.map((entry) => classifyGrammarFillBranch(entry.facetKey)))
  if (branches.size > 1) {
    throw new SimilarQuestionsError('语法填空一次只能按一个考点找相似，请分开提交种子')
  }
  const branch = [...branches][0] || 'other'

  if (branch === 'finite') {
    return {
      branch,
      topicLabels,
      tenses: unionInto(new Set(), seedRawEntries.map((entry) => entry.tense)),
      voices: unionInto(new Set(), seedRawEntries.map((entry) => entry.voice)),
      agreementSensitive: seedRawEntries.some((entry) => entry.agreementSensitive === true),
    }
  }
  if (branch === 'non-finite') {
    return {
      branch,
      topicLabels,
      roles: unionInto(new Set(), seedRawEntries.map((entry) => entry.role)),
    }
  }
  return {
    branch,
    topicLabels,
    facetKeys: unionInto(new Set(), seedRawEntries.map((entry) => entry.facetKey)),
  }
}

function buildSmallQuestionSeedProfileFacets(facetType, seedTargets) {
  const facets = []
  if (facetType === 'reading') {
    if (seedTargets.skills.size) facets.push({ key: 'skill', values: [...seedTargets.skills] })
    return facets
  }
  if (seedTargets.branch === 'finite') {
    if (seedTargets.tenses.size) facets.push({ key: 'tense', values: [...seedTargets.tenses] })
    if (seedTargets.voices.size) facets.push({ key: 'voice', values: [...seedTargets.voices] })
    facets.push({ key: 'agreementSensitive', values: [seedTargets.agreementSensitive] })
  } else if (seedTargets.branch === 'non-finite') {
    if (seedTargets.roles.size) facets.push({ key: 'role', values: [...seedTargets.roles] })
  } else if (seedTargets.facetKeys.size) {
    facets.push({ key: 'facetKey', values: [...seedTargets.facetKeys] })
  }
  return facets
}

// ─── request validation ────────────────────────────────────────────────────

function parseSeedQuestionIds(input) {
  const seeds = input?.seeds
  if (!Array.isArray(seeds) || seeds.length === 0) {
    throw new SimilarQuestionsError('seeds 不能为空：请至少提供一个种子题目')
  }
  const questionIds = []
  for (const seed of seeds) {
    const questionId = typeof seed?.questionId === 'string' ? seed.questionId.trim() : ''
    if (!questionId) {
      throw new SimilarQuestionsError('seeds 中存在缺少 questionId 的种子')
    }
    questionIds.push(questionId)
  }
  return Array.from(new Set(questionIds))
}

function parseLimit(input) {
  const raw = input?.limit
  if (raw == null) return DEFAULT_LIMIT
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new SimilarQuestionsError('limit 必须是正数')
  }
  return Math.min(Math.floor(value), MAX_LIMIT)
}

function findSimilar(db, input, { getTeachingFacetIndex, getRawIndex }) {
  const seedQuestionIds = parseSeedQuestionIds(input)
  const limit = parseLimit(input)

  const seedRows = resolveSeedRows(db, seedQuestionIds)
  seedRows.forEach((row, index) => {
    if (!row) throw new SimilarQuestionsError(`未找到题目 ${seedQuestionIds[index]}`)
  })

  const dbGroupTypes = new Set(seedRows.map((row) => row.group_type))
  if (dbGroupTypes.has('writing')) {
    throw new SimilarQuestionsError('写作题型暂不支持配相似')
  }
  if (dbGroupTypes.size > 1) {
    throw new SimilarQuestionsError('多个种子题目的题型不一致，暂不支持跨题型配相似')
  }
  const dbGroupType = [...dbGroupTypes][0]
  if (SMALL_QUESTION_RETIRED_DB_GROUP_TYPES.has(dbGroupType)) {
    const label = GROUP_TYPE_LABELS[dbGroupType] || dbGroupType
    throw new SimilarQuestionsError(`${label}的小题相似已下线，该题型走篇章相似`)
  }
  if (!SUPPORTED_DB_GROUP_TYPES.has(dbGroupType)) {
    const label = GROUP_TYPE_LABELS[dbGroupType] || dbGroupType
    throw new SimilarQuestionsError(`${label}题型暂不支持配相似`)
  }
  const facetType = DB_GROUP_TYPE_TO_FACET_TYPE[dbGroupType]

  const facetIndex = getTeachingFacetIndex()
  for (const row of seedRows) {
    if (!facetIndex.get(row.group_id)) {
      throw new SimilarQuestionsError(`题目所在题组暂无教学维度解析数据，无法配相似`)
    }
  }

  const rawIndex = getRawIndex()

  const seedGroupIds = new Set(seedRows.map((row) => row.group_id))
  const seedPassageIds = new Set(seedRows.map((row) => row.passage_id))
  const seedPaperIds = new Set(
    seedRows.map((row) => rawIndex.paperMetaByGroupId.get(row.group_id)?.paperId).filter(Boolean),
  )

  // Pool = every group of this facetType in the analyzed index ("硬池=同 groupType").
  const poolEntries = []
  for (const [groupId, facets] of facetIndex) {
    if (facets.groupType !== facetType) continue
    poolEntries.push({ groupId, facets })
  }

  const allGroupIds = [...new Set([...seedGroupIds, ...poolEntries.map((entry) => entry.groupId)])]
  const dbMetaByGroupId = fetchGroupDbMeta(db, allGroupIds)
  const topicLabelsByGroupId = fetchTopicLabels(db, allGroupIds)

  // buildSmallQuestionSeedTargets may throw SimilarQuestionsError (grammarFill
  // branch mismatch, PA SF-4) — let it propagate to the route's catch.
  const seedTargets = buildSmallQuestionSeedTargets(facetType, seedRows, rawIndex, topicLabelsByGroupId)

  const poolPredicate = SMALL_QUESTION_POOL_PREDICATES[facetType]
  const primaryScorer = SMALL_QUESTION_PRIMARY_SCORERS[facetType]

  const candidates = poolEntries.filter((entry) => {
    if (seedGroupIds.has(entry.groupId)) return false
    const dbMeta = dbMetaByGroupId.get(entry.groupId)
    if (dbMeta && seedPassageIds.has(dbMeta.passageId)) return false
    const paperId = rawIndex.paperMetaByGroupId.get(entry.groupId)?.paperId
    if (paperId && seedPaperIds.has(paperId)) return false
    // 题型专属维度命中入池：不命中的候选整个不进池（不是打 0 分留在池里）。
    return poolPredicate(seedTargets, entry.facets)
  })

  const totalInPool = candidates.length

  const scored = candidates.map((entry) => {
    const dbMeta = dbMetaByGroupId.get(entry.groupId) || {}
    const topicLabels = topicLabelsByGroupId.get(entry.groupId) || new Set()
    const paperMeta = rawIndex.paperMetaByGroupId.get(entry.groupId) || {}
    const candidate = {
      facets: entry.facets,
      dbMeta,
      topicLabels,
      questionIds: paperMeta.questionIds || [],
      rawIndex,
    }

    const primary = primaryScorer(seedTargets, candidate)
    const secondary = topicSecondaryTerm(seedTargets, candidate)
    const score = primary.value * 10000 + secondary.value * 100
    const reasons = [primary.reason, secondary.reason].filter(Boolean)

    const matchedQuestionIds = computeSmallQuestionMatchedIds(
      facetType,
      seedTargets,
      paperMeta.questionIds || [],
      rawIndex,
    )

    return {
      groupId: entry.groupId,
      paperId: paperMeta.paperId || null,
      title: dbMeta.title || paperMeta.groupTitle || entry.groupId,
      sourceLabel:
        [dbMeta.year, dbMeta.region, dbMeta.paperName].filter(Boolean).join(' ') || paperMeta.paperTitle || '',
      score,
      reasons,
      matchedQuestionIds,
      _year: dbMeta.year ?? -Infinity,
    }
  })

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b._year !== a._year) return b._year - a._year
    return a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 : 0
  })

  const results = scored.slice(0, limit).map(({ _year, ...rest }) => rest)

  return {
    seedProfile: {
      groupType: dbGroupType,
      facets: buildSmallQuestionSeedProfileFacets(facetType, seedTargets),
      topicLabels: [...seedTargets.topicLabels],
    },
    results,
    poolStats: {
      totalInPool,
      returned: results.length,
    },
  }
}

// ─── store factory ──────────────────────────────────────────────────────────

export function createSimilarQuestionsStore({ getTeachingFacetIndex, paperAssetsDir }) {
  let rawIndexCache = null

  function getRawIndex() {
    if (rawIndexCache === null) {
      rawIndexCache = buildRawFacetIndex(paperAssetsDir)
    }
    return rawIndexCache
  }

  function invalidate() {
    rawIndexCache = null
  }

  return {
    findSimilar: (db, input) => findSimilar(db, input, { getTeachingFacetIndex, getRawIndex }),
    findSimilarPassages: (db, input) => findSimilarPassages(db, input, { getTeachingFacetIndex, getRawIndex }),
    invalidate,
  }
}

// ─── route factory ──────────────────────────────────────────────────────────

function routeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Requires context to expose:
 *   - context.similarQuestionsStore.findSimilar(db, input)
 *   - context.similarQuestionsStore.findSimilarPassages(db, input)
 *   - context.openDatabase({ readOnly })
 *   - context.readJsonBody(request)
 *   - context.sendJson(response, status, body)
 *
 * Endpoints: POST /api/similar-questions, POST /api/similar-passages (login-
 * gated same as every other non-public route — see api.mjs applyAuthGate; no
 * ownerOnly here, matches plan.md "登录态，与既有 API 同鉴权层").
 */
export function createSimilarQuestionsRoutes() {
  return [
    defineRoute('POST', /^\/api\/similar-questions$/, async ({ request, response, context }) => {
      let input
      try {
        input = await context.readJsonBody(request)
      } catch (error) {
        context.sendJson(response, 400, { error: routeErrorMessage(error) })
        return
      }

      const db = context.openDatabase({ readOnly: true })
      try {
        const result = context.similarQuestionsStore.findSimilar(db, input)
        context.sendJson(response, 200, result)
      } catch (error) {
        const status = error instanceof SimilarQuestionsError ? error.status : 400
        context.sendJson(response, status, { error: routeErrorMessage(error) })
      } finally {
        db.close()
      }
    }),
    defineRoute('POST', /^\/api\/similar-passages$/, async ({ request, response, context }) => {
      let input
      try {
        input = await context.readJsonBody(request)
      } catch (error) {
        context.sendJson(response, 400, { error: routeErrorMessage(error) })
        return
      }

      const db = context.openDatabase({ readOnly: true })
      try {
        const result = context.similarQuestionsStore.findSimilarPassages(db, input)
        context.sendJson(response, 200, result)
      } catch (error) {
        const status = error instanceof SimilarQuestionsError ? error.status : 400
        context.sendJson(response, status, { error: routeErrorMessage(error) })
      } finally {
        db.close()
      }
    }),
  ]
}
