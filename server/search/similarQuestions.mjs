import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { defineRoute } from '../router/index.mjs'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'
import { analysisConfigs } from './teachingFacets.mjs'

/**
 * similar-engine (E1, docs/cuts/similar-engine/plan.md).
 *
 * Deterministic, zero-AI "find similar questions" engine. Given one or more
 * seed questionIds, it resolves the seed's teaching facets, scores every
 * other question group of the same groupType with a per-groupType recipe
 * (config object, not an if/else chain — see RECIPES below), and returns a
 * ranked, explainable result list.
 *
 * Read-only reuse of server/search/teachingFacets.mjs: the aggregated
 * per-group facet Sets come straight from its cached index
 * (context.getTeachingFacetIndex()). That index only stores per-GROUP
 * aggregates though (e.g. "every facetKey any blank in this group has"), and
 * scoring needs the SPECIFIC facet value of the seed's own blank/question
 * (e.g. "this exact blank's facetKey"). teachingFacets.mjs has no export for
 * that granularity, so this module walks the paper-asset analysis files once
 * more (buildRawFacetIndex, lazily cached) to get per-question raw entries.
 * This duplicates the *shape* of teachingFacets.mjs's directory walk but not
 * its logic (aggregation vs. raw passthrough are genuinely different jobs);
 * the only import from teachingFacets.mjs is its `analysisConfigs` table
 * (exported verbatim, zero logic change) so the two walks can never drift on
 * file names / schema versions.
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

const GROUP_TYPE_LABELS = {
  reading: '阅读理解',
  cloze: '完形填空',
  seven_choices: '七选五',
  grammar_cloze: '语法填空',
  writing: '写作',
  continuation: '读后续写',
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

// 阅读篇位 proxy 的邻域衰减窗口（词数）：候选与种子词数差 >= 300 时邻近度记 0，
// 差为 0 时记 1，中间线性衰减。300 取自"一篇阅读文章的常见篇幅浮动区间"，
// 不是从数据统计拟合出来的——v1 够用，调优留给后续数据反馈。
const READING_WORD_COUNT_DECAY_WINDOW = 300

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
        s.paper_name
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
    })
  }
  return byId
}

// 阅读篇位真值（R1-genre-truth 落库后）：DB 里一个 source 行 == 一篇独立
// passage（source_id 对每篇阅读文章各自成行，不是"一张试卷一个 source_id"），
// 所以"同卷"不能按 source_id 分组——同一张试卷的四篇阅读文章共享
// (year, region, paper_name) 三元组，这才是真正的"同卷"分组键（DEV 侦察时
// 对照真库验证：如 2020 新课标Ⅰ卷的 reading-a/b/c/d 四个 source_id 各不相同，
// 但 year/region/paper_name 三者全同）。窗口函数按这个键分区、display_order
// 排序出名次（1..n，对应 A..D），只在候选/种子确有 group_type='reading' 时
// 才需要这份数据。
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

// ─── score-term primitives (score and reason are always produced together —
// no term may contribute points without a matching reason chip) ───────────

function densityTerm({ matched, total, kind, label }) {
  if (!total || total <= 0 || matched <= 0) return { value: 0, reason: null }
  const density = matched / total
  const value = Math.min(99, Math.round(density * 100))
  if (value <= 0) return { value: 0, reason: null }
  return { value, reason: { kind, label } }
}

function booleanTerm({ matched, kind, label }) {
  if (!matched) return { value: 0, reason: null }
  return { value: 99, reason: { kind, label } }
}

// ─── per-groupType recipes (config objects — dispatch is a property lookup,
// never an if/else chain over groupType) ───────────────────────────────────

const RECIPES = {
  grammarFill: {
    primary(seedTargets, candidate) {
      const matched = intersectSize(seedTargets.facetKeys, candidate.facets.facetKeys)
      const total = candidate.facets.facetKeys.size
      return densityTerm({
        matched,
        total,
        kind: 'facet-density',
        label: `同考点密度 ${matched}/${total}`,
      })
    },
    secondary(seedTargets, candidate) {
      const matched = hasOverlap(seedTargets.blankTypes, candidate.facets.blankTypes)
      const label =
        seedTargets.blankTypes.size === 1
          ? seedTargets.blankTypes.has('given')
            ? '同为有提示词'
            : '同为无提示词'
          : '提示词类型一致'
      return booleanTerm({ matched, kind: 'secondary', label })
    },
    // 语法填空配方表加分列为"—"（program.md 拍板），本题型无加分项。
    bonus() {
      return { value: 0, reason: null }
    },
  },

  cloze: {
    primary(seedTargets, candidate) {
      const matched = intersectSize(seedTargets.topicLabels, candidate.topicLabels)
      const total = Math.max(seedTargets.topicLabels.size, 1)
      return densityTerm({
        matched,
        total,
        kind: 'topic-match',
        label: `话题重合 ${matched}/${seedTargets.topicLabels.size}`,
      })
    },
    secondary(seedTargets, candidate) {
      const matched = Boolean(candidate.dbMeta.discourseType) && seedTargets.discourseTypes.has(candidate.dbMeta.discourseType)
      return booleanTerm({ matched, kind: 'secondary', label: `同体裁 ${candidate.dbMeta.discourseType}` })
    },
    bonus(seedTargets, candidate) {
      // 加分项 = 种子错题所在空的词性(pos)密度：候选组里"这个词性"的空越集中，
      // 越值得用来巩固同一薄弱词性。
      const matched = intersectSize(seedTargets.posValues, candidate.facets.pos)
      const total = candidate.facets.pos.size
      return densityTerm({
        matched,
        total,
        kind: 'pos-density',
        label: `同词性密度 ${matched}/${total}`,
      })
    },
  },

  sevenChoices: {
    primary(seedTargets, candidate) {
      const matched =
        intersectSize(seedTargets.roleFacets, candidate.facets.roleFacets) +
        intersectSize(seedTargets.positionFacets, candidate.facets.positionFacets)
      const total = candidate.facets.roleFacets.size + candidate.facets.positionFacets.size
      return densityTerm({
        matched,
        total,
        kind: 'facet-density',
        label: `功能句角色+位置密度 ${matched}/${total}`,
      })
    },
    secondary(seedTargets, candidate) {
      const matched = hasOverlap(seedTargets.mechanismFacets, candidate.facets.mechanismFacets)
      return booleanTerm({ matched, kind: 'secondary', label: '同衔接机制' })
    },
    // 加分 = 话题密度 + 体裁弱加分（program.md 拍板）：体裁命中固定 +8，
    // 8 是严格 tie-break 权重——低于任何现实话题密度台阶（density 最小非零
    // 台阶取决于候选话题标签总数，实测从未低到 8 以内），所以体裁永远只是
    // "同话题密度时的加分项"，绝不会盖过话题密度本身的排序。
    bonus(seedTargets, candidate) {
      const matched = intersectSize(seedTargets.topicLabels, candidate.topicLabels)
      const total = Math.max(seedTargets.topicLabels.size, 1)
      const topic = densityTerm({
        matched,
        total,
        kind: 'topic-match',
        label: `话题重合 ${matched}/${seedTargets.topicLabels.size}`,
      })
      const discourseMatch =
        Boolean(candidate.dbMeta.discourseType) && seedTargets.discourseTypes.has(candidate.dbMeta.discourseType)
      const value = Math.min(99, topic.value + (discourseMatch ? 8 : 0))
      if (value <= 0) return { value: 0, reason: null }

      const discourseLabel = `同体裁${candidate.dbMeta.discourseType}`
      const label =
        topic.value > 0 && discourseMatch
          ? `${topic.reason.label} · ${discourseLabel}`
          : discourseMatch
            ? discourseLabel
            : topic.reason.label
      return { value, reason: { kind: 'topic-match', label } }
    },
  },

  reading: {
    primary(seedTargets, candidate) {
      const matched = intersectSize(seedTargets.skills, candidate.facets.skills)
      const total = candidate.facets.skills.size
      return densityTerm({
        matched,
        total,
        kind: 'facet-density',
        label: `小题题型密度 ${matched}/${total}`,
      })
    },
    // 篇位真值（R1-genre-truth 落库后，fetchReadingSlots 换真篇位名次）：
    // 分层为 tier（同篇位/相邻篇位/无关系），tier 决定 base 分，同 tier 内再用
    // word_count 邻域细排——tier 之间永不翻转（同篇位 [70,99] / 相邻 [35,64] /
    // 无 [0,29]，档间留有余量，任何一档的顶都压不过下一档的底减一）。
    // 体裁已彻底挪出阅读配方（program.md 拍板）：真值落库后体裁类目仍然
    // 稀疏、区分度不如篇位名次，阅读改用篇位真值作分层主轴。
    secondary(seedTargets, candidate) {
      const candidateSlot = candidate.dbMeta.readingSlot ?? null
      const seedSlots = seedTargets.readingSlots

      let tier = 'none'
      if (candidateSlot != null && seedSlots.size > 0) {
        if (seedSlots.has(candidateSlot)) {
          tier = 'same'
        } else {
          let minDiff = Infinity
          for (const slot of seedSlots) {
            const diff = Math.abs(candidateSlot - slot)
            if (diff < minDiff) minDiff = diff
          }
          if (minDiff === 1) tier = 'adjacent'
        }
      }

      const seedWordCount = seedTargets.wordCounts.length
        ? seedTargets.wordCounts.reduce((sum, value) => sum + value, 0) / seedTargets.wordCounts.length
        : null
      const candidateWordCount = candidate.dbMeta.wordCount

      let proximity = 0
      if (seedWordCount != null && candidateWordCount != null) {
        const delta = Math.abs(candidateWordCount - seedWordCount)
        proximity = Math.max(0, 1 - delta / READING_WORD_COUNT_DECAY_WINDOW)
      }

      const base = tier === 'same' ? 70 : tier === 'adjacent' ? 35 : 0
      const value = Math.min(99, base + Math.round(proximity * 29))
      if (value <= 0) return { value: 0, reason: null }

      const wordCountLabel =
        seedWordCount != null && candidateWordCount != null
          ? `词数相近(±${Math.round(Math.abs(candidateWordCount - seedWordCount))})`
          : '词数未知'

      let label
      if (tier === 'same') {
        label = `同为${slotLetter(candidateSlot)}篇 · ${wordCountLabel}`
      } else if (tier === 'adjacent') {
        label = `篇位相邻 · ${wordCountLabel}`
      } else {
        label = wordCountLabel
      }

      return { value, reason: { kind: 'position-slot', label } }
    },
    // 加分项方向与其余三型相反：话题**不同**加分（program.md 拍板 —— 阅读练习
    // 不需要复用同一话题，反而希望学生接触不同语境）。只在双方都有话题标签、
    // 且完全不重合时给固定加分（不是密度：话题要么"撞"要么"不撞"，没有中间态）。
    bonus(seedTargets, candidate) {
      if (seedTargets.topicLabels.size === 0 || candidate.topicLabels.size === 0) return { value: 0, reason: null }
      const overlap = intersectSize(seedTargets.topicLabels, candidate.topicLabels)
      if (overlap > 0) return { value: 0, reason: null }
      return { value: 20, reason: { kind: 'topic-diff', label: '话题不同，可拓展语境' } }
    },
  },
}

// score = primary*10000 + secondary*100 + bonus，每层都用 0-99 的整数密度，
// 保证严格分层（下一层的满分也压不过上一层的一个最小增量）。
function scoreCandidate(facetType, seedTargets, candidate) {
  const recipe = RECIPES[facetType]
  const primary = recipe.primary(seedTargets, candidate)
  const secondary = recipe.secondary(seedTargets, candidate)
  const bonus = recipe.bonus(seedTargets, candidate)
  const score = primary.value * 10000 + secondary.value * 100 + bonus.value
  const reasons = [primary.reason, secondary.reason, bonus.reason].filter(Boolean)
  return { score, reasons }
}

function computeMatchedQuestionIds(facetType, seedTargets, questionIds, questionFacetById) {
  const matched = []
  for (const qid of questionIds) {
    const raw = questionFacetById.get(qid)
    if (!raw) continue
    if (facetType === 'grammarFill') {
      if (raw.facetKey && seedTargets.facetKeys.has(raw.facetKey)) matched.push(qid)
    } else if (facetType === 'cloze') {
      if (raw.pos && seedTargets.posValues.has(raw.pos)) matched.push(qid)
    } else if (facetType === 'sevenChoices') {
      if (
        (raw.roleFacet && seedTargets.roleFacets.has(raw.roleFacet)) ||
        (raw.positionFacet && seedTargets.positionFacets.has(raw.positionFacet)) ||
        (raw.primaryMechanismFacet && seedTargets.mechanismFacets.has(raw.primaryMechanismFacet))
      ) {
        matched.push(qid)
      }
    } else if (facetType === 'reading') {
      const skillPrimary = raw.skill?.primary
      if (skillPrimary && seedTargets.skills.has(skillPrimary)) matched.push(qid)
    }
  }
  return matched
}

// ─── seed target assembly (per facetType, only the fields that recipe needs) ─

function buildSeedTargets(facetType, seedRows, rawIndex, dbMetaByGroupId, topicLabelsByGroupId) {
  const seedGroupIds = seedRows.map((row) => row.group_id)
  const seedRawEntries = seedRows.map((row) => rawIndex.questionFacetById.get(row.question_id)).filter(Boolean)

  const topicLabels = new Set()
  for (const gid of seedGroupIds) unionInto(topicLabels, topicLabelsByGroupId.get(gid) || [])

  const discourseTypes = new Set()
  for (const gid of seedGroupIds) {
    const meta = dbMetaByGroupId.get(gid)
    if (meta?.discourseType) discourseTypes.add(meta.discourseType)
  }

  if (facetType === 'grammarFill') {
    return {
      facetKeys: unionInto(new Set(), seedRawEntries.map((e) => e.facetKey)),
      blankTypes: unionInto(new Set(), seedRawEntries.map((e) => e.blankType)),
      topicLabels,
    }
  }
  if (facetType === 'cloze') {
    return {
      topicLabels,
      discourseTypes,
      posValues: unionInto(new Set(), seedRawEntries.map((e) => e.pos)),
    }
  }
  if (facetType === 'sevenChoices') {
    return {
      roleFacets: unionInto(new Set(), seedRawEntries.map((e) => e.roleFacet)),
      positionFacets: unionInto(new Set(), seedRawEntries.map((e) => e.positionFacet)),
      mechanismFacets: unionInto(new Set(), seedRawEntries.map((e) => e.primaryMechanismFacet)),
      topicLabels,
      discourseTypes,
    }
  }
  // reading — 体裁彻底挪出阅读配方（program.md 拍板），改用篇位真值分层。
  return {
    skills: unionInto(new Set(), seedRawEntries.map((e) => e.skill?.primary)),
    topicLabels,
    wordCounts: seedGroupIds
      .map((gid) => dbMetaByGroupId.get(gid)?.wordCount)
      .filter((value) => value != null),
    readingSlots: unionInto(new Set(), seedGroupIds.map((gid) => dbMetaByGroupId.get(gid)?.readingSlot)),
  }
}

function buildSeedProfileFacets(facetType, seedTargets) {
  const facets = []
  if (facetType === 'grammarFill') {
    if (seedTargets.facetKeys.size) facets.push({ key: 'facetKey', values: [...seedTargets.facetKeys] })
    if (seedTargets.blankTypes.size) facets.push({ key: 'blankType', values: [...seedTargets.blankTypes] })
  } else if (facetType === 'cloze') {
    if (seedTargets.posValues.size) facets.push({ key: 'pos', values: [...seedTargets.posValues] })
    if (seedTargets.discourseTypes.size) facets.push({ key: 'discourseType', values: [...seedTargets.discourseTypes] })
  } else if (facetType === 'sevenChoices') {
    if (seedTargets.roleFacets.size) facets.push({ key: 'roleFacet', values: [...seedTargets.roleFacets] })
    if (seedTargets.positionFacets.size) facets.push({ key: 'positionFacet', values: [...seedTargets.positionFacets] })
    if (seedTargets.mechanismFacets.size) facets.push({ key: 'mechanismFacet', values: [...seedTargets.mechanismFacets] })
  } else if (facetType === 'reading') {
    if (seedTargets.skills.size) facets.push({ key: 'skill', values: [...seedTargets.skills] })
    if (seedTargets.wordCounts.length) facets.push({ key: 'wordCount', values: seedTargets.wordCounts })
    if (seedTargets.readingSlots.size) facets.push({ key: 'readingSlot', values: [...seedTargets.readingSlots] })
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

  function findSimilar(db, input) {
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
      seedRows
        .map((row) => rawIndex.paperMetaByGroupId.get(row.group_id)?.paperId)
        .filter(Boolean),
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

    if (facetType === 'reading') {
      const readingSlotByGroupId = fetchReadingSlots(db, allGroupIds)
      for (const [groupId, slot] of readingSlotByGroupId) {
        const meta = dbMetaByGroupId.get(groupId)
        if (meta) meta.readingSlot = slot
      }
    }

    const seedTargets = buildSeedTargets(facetType, seedRows, rawIndex, dbMetaByGroupId, topicLabelsByGroupId)

    const candidates = poolEntries.filter((entry) => {
      if (seedGroupIds.has(entry.groupId)) return false
      const dbMeta = dbMetaByGroupId.get(entry.groupId)
      if (dbMeta && seedPassageIds.has(dbMeta.passageId)) return false
      const paperId = rawIndex.paperMetaByGroupId.get(entry.groupId)?.paperId
      if (paperId && seedPaperIds.has(paperId)) return false
      return true
    })

    const totalInPool = candidates.length

    const scored = candidates.map((entry) => {
      const dbMeta = dbMetaByGroupId.get(entry.groupId) || {}
      const topicLabels = topicLabelsByGroupId.get(entry.groupId) || new Set()
      const paperMeta = rawIndex.paperMetaByGroupId.get(entry.groupId) || {}
      const candidate = { facets: entry.facets, dbMeta, topicLabels }
      const { score, reasons } = scoreCandidate(facetType, seedTargets, candidate)
      const matchedQuestionIds = computeMatchedQuestionIds(
        facetType,
        seedTargets,
        paperMeta.questionIds || [],
        rawIndex.questionFacetById,
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
        facets: buildSeedProfileFacets(facetType, seedTargets),
        topicLabels: [...seedTargets.topicLabels],
      },
      results,
      poolStats: {
        totalInPool,
        returned: results.length,
      },
    }
  }

  return { findSimilar, invalidate }
}

// ─── route factory ──────────────────────────────────────────────────────────

function routeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Requires context to expose:
 *   - context.similarQuestionsStore.findSimilar(db, input)
 *   - context.openDatabase({ readOnly })
 *   - context.readJsonBody(request)
 *   - context.sendJson(response, status, body)
 *
 * Endpoint: POST /api/similar-questions (login-gated same as every other
 * non-public route — see api.mjs applyAuthGate; no ownerOnly here, matches
 * plan.md "登录态，与既有 API 同鉴权层").
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
  ]
}
