import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname)
const DB_PATH = path.join(ROOT, 'data/question-bank.sqlite')
const JSONL_PATH = path.join(ROOT, 'knowledge/difficulty/full-bcd-difficulty-calibration-v1.jsonl')
const CLAUDE_REVIEW_PATH = path.join(ROOT, 'knowledge/difficulty/full-bcd-difficulty-claude-review-v1.json')
const USER_REVIEW_PATH = path.join(ROOT, 'knowledge/difficulty/full-bcd-difficulty-user-review-v1.json')
const REPORT_PATH = path.join(ROOT, 'reports/full-bcd-difficulty-calibration-v1.md')
const GENERATED_AT = '2026-05-15T00:00:00.000Z'

const allowedBlockers = new Set(['vocab', 'syntax', 'distractor', 'abstraction', 'info_span', 'topic'])

const PASSAGE_LABEL_OVERRIDES = new Map([
  // 2022 新课标 I 答案版导入时阅读标题整体后移：官方 A/B/C 分别落到 B/C/D。
  // 官方 D 已用修正标题补入库；这里把误标的 A 排除出 B/C/D 池，并恢复 B/C 官方标签。
  ['g-cd2a43ac-1033-48c9-b590-5eb5b73f47a3', 'A'],
  ['g-bcefa05a-7631-464b-80cc-7f79b979fdc4', 'B'],
  ['g-3c963eba-7526-4ce6-9dbc-70d5c9c75da6', 'C'],
  // 2024 新课标 I 答案版导入时 B/C 篇标题错位：官方 B 是 Farber/acupuncture，官方 C 是 paper/digital reading。
  ['g-d9e30a1a-1ec8-4264-884c-bc39dc034681', 'C'],
  ['g-4889a8c9-0e35-4d55-9293-a241b2d31909', 'B']
])

function sqliteJson(sql) {
  const stdout = execFileSync('sqlite3', ['-json', DB_PATH, sql], {
    encoding: 'utf8',
    maxBuffer: 120 * 1024 * 1024
  })
  return JSON.parse(stdout || '[]')
}

function normalizeText(value) {
  return String(value || '').replace(/Ⅰ/g, 'I').replace(/Ⅱ/g, 'II').replace(/\s+/g, '')
}

function passageLetter(value) {
  return String(value || '').match(/阅读理解\s*([A-D])/)?.[1] || ''
}

function rawPassageLabelFor(row) {
  return passageLetter(row.passage_title) || passageLetter(row.group_title)
}

function passageLabelFor(row) {
  return PASSAGE_LABEL_OVERRIDES.get(row.group_id) || rawPassageLabelFor(row)
}

function passageLabelSourceFor(row) {
  return PASSAGE_LABEL_OVERRIDES.has(row.group_id) ? 'official_override' : 'title'
}

function validatePassageLabelOverrides(rows) {
  const rowsByGroupId = new Map(rows.map((row) => [row.group_id, row]))
  for (const [groupId, officialLabel] of PASSAGE_LABEL_OVERRIDES) {
    const row = rowsByGroupId.get(groupId)
    if (!row) throw new Error(`Passage label override points to missing group_id: ${groupId}`)
    const rawLabel = rawPassageLabelFor(row)
    if (!['A', 'B', 'C', 'D'].includes(officialLabel)) {
      throw new Error(`Invalid official passage label override for ${groupId}: ${officialLabel}`)
    }
    if (!rawLabel) throw new Error(`Cannot read raw passage label for override group_id: ${groupId}`)
  }
}

function isSourcePoolGroup(row) {
  const label = passageLabelFor(row)
  if (!['B', 'C', 'D'].includes(label)) return false
  const text = normalizeText(`${row.paper_name} ${row.passage_title} ${row.group_title}`)
  const isNewI = text.includes('新课标I') && !text.includes('新课标II') && row.year >= 2021 && row.year <= 2025
  const isZhejiangJan = text.includes('浙江') && text.includes('1月') && row.year >= 2023 && row.year <= 2026
  return isNewI || isZhejiangJan
}

function sourceKind(row) {
  return String(row.paper_name || '').includes('浙江') ? 'zhejiang_jan' : 'new_curriculum_i'
}

function sourceKey(row) {
  const paperKey = normalizeText(row.paper_name).replace(/-答案版|卷|\(1月\)|（1月）/g, '')
  return `${row.year}|${paperKey}|${passageLabelFor(row)}`
}

function groupQuality(row) {
  return (row.has_parse ? 1000 : 0) + (/^EVAL/.test(row.group_title) ? 0 : 100) + Number(row.question_count || 0)
}

function aiMappedDifficulty(score) {
  if (score <= 2) return 1
  if (score <= 4) return 2
  if (score <= 6) return 3
  if (score <= 8) return 4
  return 5
}

function readClaudeReviews() {
  if (!fs.existsSync(CLAUDE_REVIEW_PATH)) return new Map()
  const payload = JSON.parse(fs.readFileSync(CLAUDE_REVIEW_PATH, 'utf8'))
  const reviews = Array.isArray(payload.reviews) ? payload.reviews : []
  return new Map(reviews.map((review) => [review.questionId, review]))
}

function readUserReviews() {
  if (!fs.existsSync(USER_REVIEW_PATH)) return new Map()
  const payload = JSON.parse(fs.readFileSync(USER_REVIEW_PATH, 'utf8'))
  const reviews = Array.isArray(payload.reviews) ? payload.reviews : []
  return new Map(reviews.map((review) => [review.questionId, review]))
}

function sanitizeBlockers(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => allowedBlockers.has(item))
}

function categoryFor(record) {
  const type = record.surfaceType
  const stem = record.stem.toLowerCase()
  if (record.tCardId === 'T10' || type === 'abstract_phrase_summary' || type === 'adjective_summary') return '推断/抽象压缩'
  if (type === 'word_meaning') return '猜词/指代'
  if (type === 'example_function' || type === 'writing_technique' || type === 'author_purpose') return 'why mention/example/writing'
  if (type === 'paragraph_main_idea' || type === 'passage_main_idea') return '段落/文章主旨'
  if (type === 'inference_general' || type === 'attitude_tone') return '推断/抽象压缩'
  if (type === 'multi_detail_learn_from' || stem.includes('learn') || record.answeringMove === 'option_backtracking') return '细节/多细节/learn from'
  return '细节/多细节/learn from'
}

function evidenceFrom(parsedQuestion) {
  const difficulty = parsedQuestion.synonymDifficulty || {}
  const candidates = [
    difficulty.sourceExpression,
    parsedQuestion.answerSentence,
    parsedQuestion.locationSentence
  ]
  const found = candidates.find((item) => typeof item === 'string' && item.trim())
  return (found || '').replace(/\s+/g, ' ').trim().slice(0, 500)
}

function estimateTeacherDifficulty({ aiScore, cardId, surfaceType, answeringMove, blockers, stem }) {
  let score = aiMappedDifficulty(aiScore)

  if (aiScore <= 2 && cardId === 'T1') score = 1
  if (aiScore <= 2 && cardId === 'T2' && !blockers.length && answeringMove === 'direct_locating') score = 1

  if (cardId === 'T3') score = Math.max(score, 2)
  if (cardId === 'T4') score = Math.max(score, 2)
  if (['T5', 'T6', 'T7', 'T8', 'T9'].includes(cardId)) score = Math.max(score, 3)
  if (cardId === 'T10') score = Math.max(score, 4)

  if (surfaceType === 'word_meaning' && aiScore >= 4) score = Math.max(score, 3)
  if (surfaceType === 'writing_technique') score = Math.max(score, 3)
  if (surfaceType === 'adjective_summary' || surfaceType === 'abstract_phrase_summary') score = Math.max(score, 4)
  if (surfaceType === 'attitude_tone') score = Math.max(score, 3)

  if (answeringMove === 'option_backtracking') score = Math.max(score, 2)
  if (blockers.includes('topic')) score += 1
  if (blockers.includes('syntax') && blockers.includes('abstraction')) score += 1
  if (blockers.includes('abstraction') && blockers.includes('distractor')) score = Math.max(score, 4)
  if (blockers.includes('info_span') && blockers.includes('distractor')) score = Math.max(score, 4)

  if (/best title|suitable title|mainly about|main idea/i.test(stem) && aiScore >= 7) score = Math.max(score, 4)
  return Math.max(1, Math.min(5, score))
}

function reviewPriority({ aiScore, codexReviewDifficulty, cardId, surfaceType, blockers, evidenceExcerpt }) {
  const reasons = []
  if (Math.abs(aiMappedDifficulty(aiScore) - codexReviewDifficulty) >= 2) reasons.push('AI与Codex初判差距≥2')
  if (['T9', 'T10'].includes(cardId)) reasons.push(`${cardId}高风险边界`)
  if (['word_meaning', 'adjective_summary', 'abstract_phrase_summary', 'writing_technique'].includes(surfaceType)) reasons.push(`${surfaceType}题型需复核`)
  if (blockers.includes('topic')) reasons.push('话题陌生度')
  if (blockers.includes('abstraction') && blockers.includes('distractor')) reasons.push('抽象+强干扰')
  if (!evidenceExcerpt) reasons.push('证据缺失')
  if (aiScore >= 7) reasons.push('AI高难分')

  if (reasons.length) return { priority: 'high', reasons }
  if (['T5', 'T6', 'T7', 'T8'].includes(cardId) || blockers.length >= 2 || aiScore >= 5) {
    return { priority: 'medium', reasons: ['中阶题或多阻断因素'] }
  }
  return { priority: 'low', reasons: ['直接定位或低阻断'] }
}

function codexNoteFor({ surfaceType, cardId, blockers, evidenceExcerpt, aiScore }) {
  const parts = []
  if (surfaceType === 'word_meaning') parts.push('猜词题不把目标词机械算作词汇阻断，重点看上下文线索与选项迷惑度')
  if (surfaceType === 'adjective_summary') parts.push('形容词压缩题需把具体描写抽象成评价词')
  if (surfaceType === 'abstract_phrase_summary') parts.push('抽象短语压缩题需把具体信息上升为概念标签')
  if (surfaceType === 'writing_technique') parts.push('写作手法题考查段落呈现方式而非事实定位')
  if (surfaceType === 'example_function') parts.push('例子功能题要从表层例子回到作者论点')
  if (surfaceType === 'attitude_tone') parts.push('态度题需综合语气与评价方向')
  if (cardId === 'T10') parts.push('T10 属高抽象边界，建议人工确认')
  if (blockers.includes('vocab')) parts.push('词汇负荷可能影响答案路径')
  if (blockers.includes('syntax')) parts.push('句法负荷可能影响定位句处理')
  if (blockers.includes('info_span')) parts.push('信息跨度增加定位/整合成本')
  if (blockers.includes('distractor')) parts.push('干扰项有一定迷惑性')
  if (blockers.includes('topic')) parts.push('话题背景陌生度可能拉高真实难度')
  if (!parts.length && aiScore <= 2) parts.push('定位和语言负荷较低，可作为低难控制题')
  if (!parts.length) parts.push('按 AI 解析和题型初步估计，等待人工校准')
  if (!evidenceExcerpt) parts.push('缺少可核验证据句')
  return parts.join('；')
}

function markdownEscape(value) {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim()
}

function countBy(items, keyFn) {
  const map = new Map()
  for (const item of items) {
    const key = keyFn(item)
    map.set(key, (map.get(key) || 0) + 1)
  }
  return map
}

function tableFromMap(map, columns) {
  return [
    `| ${columns[0]} | ${columns[1]} |`,
    '| --- | ---: |',
    ...[...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b), 'zh')).map(([key, value]) => `| ${key} | ${value} |`)
  ].join('\n')
}

function disagreementBreakdown(items, leftKey, rightKey) {
  const map = new Map([
    ['±1', 0],
    ['≥2', 0]
  ])
  for (const item of items) {
    const diff = Math.abs(item[leftKey] - item[rightKey])
    if (!diff) continue
    map.set(diff === 1 ? '±1' : '≥2', (map.get(diff === 1 ? '±1' : '≥2') || 0) + 1)
  }
  return map
}

const groupRows = sqliteJson(`
SELECT
  qg.id AS group_id,
  qg.title AS group_title,
  s.year,
  s.paper_name,
  p.title AS passage_title,
  COUNT(q.id) AS question_count,
  CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS has_parse
FROM question_groups qg
JOIN passages p ON p.id = qg.passage_id
JOIN sources s ON s.id = p.source_id
LEFT JOIN questions q ON q.group_id = qg.id
LEFT JOIN reading_parse_results r ON r.question_group_id = qg.id
WHERE s.source_type = 'real_exam' AND qg.group_type = 'reading'
GROUP BY qg.id
ORDER BY s.year, s.paper_name, p.title
`)

validatePassageLabelOverrides(groupRows)

const dedupedGroups = new Map()
for (const row of groupRows.filter(isSourcePoolGroup)) {
  const key = sourceKey(row)
  const previous = dedupedGroups.get(key)
  if (!previous || groupQuality(row) > groupQuality(previous)) dedupedGroups.set(key, row)
}

const selectedGroups = [...dedupedGroups.values()]
  .filter((row) => row.has_parse)
  .sort((a, b) => a.year - b.year || a.paper_name.localeCompare(b.paper_name, 'zh') || passageLabelFor(a).localeCompare(passageLabelFor(b)))

const selectedGroupIds = selectedGroups.map((row) => row.group_id)
if (!selectedGroupIds.length) throw new Error('No parsed source-pool groups found')

const quotedGroupIds = selectedGroupIds.map((id) => `'${id.replaceAll("'", "''")}'`).join(',')
const questionRows = sqliteJson(`
SELECT
  qg.id AS group_id,
  qg.title AS group_title,
  s.year,
  s.paper_name,
  p.title AS passage_title,
  q.id AS question_id,
  q.question_no,
  q.stem,
  q.answer,
  r.payload_json
FROM question_groups qg
JOIN passages p ON p.id = qg.passage_id
JOIN sources s ON s.id = p.source_id
JOIN questions q ON q.group_id = qg.id
JOIN reading_parse_results r ON r.question_group_id = qg.id
WHERE qg.id IN (${quotedGroupIds})
ORDER BY s.year, s.paper_name, p.title, q.display_order
`)

const payloadByGroup = new Map()
for (const row of questionRows) {
  if (!payloadByGroup.has(row.group_id)) payloadByGroup.set(row.group_id, JSON.parse(row.payload_json || '{}'))
}

const claudeReviews = readClaudeReviews()
const userReviews = readUserReviews()

const records = questionRows.map((row) => {
  const payload = payloadByGroup.get(row.group_id) || {}
  const parsedQuestion = (payload.questions || []).find((item) => String(item.questionNo) === String(row.question_no))
  if (!parsedQuestion) throw new Error(`Parsed question not found: ${row.group_id} Q${row.question_no}`)

  const surfaceQuestion = parsedQuestion.surfaceQuestion || {}
  const synonymDifficulty = parsedQuestion.synonymDifficulty || {}
  const difficultyProfile = parsedQuestion.difficultyProfile || {}
  const aiScore = Number(difficultyProfile.finalScore)
  if (!Number.isInteger(aiScore) || aiScore < 1 || aiScore > 10) {
    throw new Error(`Invalid AI score for ${row.group_id} Q${row.question_no}: ${difficultyProfile.finalScore}`)
  }

  const blockers = sanitizeBlockers(difficultyProfile.mainBlockers)
  const evidenceExcerpt = evidenceFrom(parsedQuestion)
  const codexReviewDifficulty = estimateTeacherDifficulty({
    aiScore,
    cardId: synonymDifficulty.cardId || '',
    surfaceType: surfaceQuestion.type || '',
    answeringMove: surfaceQuestion.answeringMove || '',
    blockers,
    stem: row.stem
  })
  const priority = reviewPriority({
    aiScore,
    codexReviewDifficulty,
    cardId: synonymDifficulty.cardId || '',
    surfaceType: surfaceQuestion.type || '',
    blockers,
    evidenceExcerpt
  })
  const claudeReview = claudeReviews.get(row.question_id) || null
  const userReview = userReviews.get(row.question_id) || null
  const codexReviewNote = codexNoteFor({
    surfaceType: surfaceQuestion.type || '',
    cardId: synonymDifficulty.cardId || '',
    blockers,
    evidenceExcerpt,
    aiScore
  })

  return {
    version: 'v1',
    split: 'current_parsed',
    calibrationStatus: 'draft',
    sourceKind: sourceKind(row),
    sourcePaper: row.paper_name,
    year: row.year,
    passageLabel: passageLabelFor(row),
    passageLabelSource: passageLabelSourceFor(row),
    groupId: row.group_id,
    questionId: row.question_id,
    questionNo: row.question_no,
    stem: row.stem,
    answer: row.answer,
    surfaceType: surfaceQuestion.type || '',
    answeringMove: surfaceQuestion.answeringMove || '',
    tCardId: synonymDifficulty.cardId || '',
    aiDifficultyScore: aiScore,
    deepseekMappedDifficulty: aiMappedDifficulty(aiScore),
    aiMainBlockers: blockers,
    codexReviewDifficulty,
    codexReviewNote,
    claudeReviewDifficulty: Number.isInteger(claudeReview?.difficulty) ? claudeReview.difficulty : null,
    claudeReviewNote: claudeReview?.note || '',
    claudeExperienceFit: claudeReview?.experienceFit || '',
    userFinalDifficulty: Number.isInteger(userReview?.difficulty) ? userReview.difficulty : null,
    userFinalNote: userReview?.note || '',
    reviewPriority: priority.priority,
    reviewReasons: priority.reasons,
    evidenceExcerpt,
    parseMeta: {
      provider: payload.provider || '',
      model: payload.model || '',
      thinkingMode: Boolean(payload.thinkingMode),
      requestId: payload.requestId || '',
      parseSchema: 'reading-parse-current'
    },
    generatedAt: GENERATED_AT
  }
})

const expectedGroups = []
for (const year of [2021, 2022, 2023, 2024, 2025]) {
  for (const label of ['B', 'C', 'D']) expectedGroups.push({ kind: 'new_curriculum_i', year, passageLabel: label })
}
for (const year of [2023, 2024, 2025, 2026]) {
  for (const label of ['B', 'C', 'D']) expectedGroups.push({ kind: 'zhejiang_jan', year, passageLabel: label })
}

const availableGroupKeys = new Set(
  [...dedupedGroups.values()].map((row) => `${sourceKind(row)}|${row.year}|${passageLabelFor(row)}`)
)
const missingGroups = expectedGroups
  .filter((item) => !availableGroupKeys.has(`${item.kind}|${item.year}|${item.passageLabel}`))
  .map((item) => ({
    ...item,
    reason: '当前数据库未导入',
    nextAction: item.year === 2026 && item.kind === 'zhejiang_jan'
      ? '从题目版与答案图导入后校验'
      : '从答案版/解析版导入后校验'
  }))

const passageKeys = countBy(records, (record) => `${record.sourcePaper} ${record.passageLabel}`)
const priorityCounts = countBy(records, (record) => record.reviewPriority)
const categoryCounts = countBy(records, categoryFor)
const yearCounts = countBy(records, (record) => record.year)
const cardCounts = countBy(records, (record) => record.tCardId)
const codexCounts = countBy(records, (record) => record.codexReviewDifficulty)
const claudeReviewedRecords = records.filter((record) => Number.isInteger(record.claudeReviewDifficulty))
const claudeCounts = countBy(claudeReviewedRecords, (record) => record.claudeReviewDifficulty)
const userReviewedRecords = records.filter((record) => Number.isInteger(record.userFinalDifficulty))
const userCounts = countBy(userReviewedRecords, (record) => record.userFinalDifficulty)
const modelCounts = countBy(records, (record) => `${record.parseMeta.provider}/${record.parseMeta.model}/thinking=${record.parseMeta.thinkingMode}`)
const deepseekCodexDisagreements = records.filter((record) => record.deepseekMappedDifficulty !== record.codexReviewDifficulty)
const codexClaudeDisagreements = claudeReviewedRecords.filter((record) => record.codexReviewDifficulty !== record.claudeReviewDifficulty)
const deepseekCodexDiffBreakdown = disagreementBreakdown(records, 'deepseekMappedDifficulty', 'codexReviewDifficulty')
const codexClaudeDiffBreakdown = disagreementBreakdown(claudeReviewedRecords, 'codexReviewDifficulty', 'claudeReviewDifficulty')

if (records.length !== selectedGroups.reduce((sum, group) => sum + Number(group.question_count || 0), 0)) {
  throw new Error('Question count mismatch')
}
if (records.some((record) => !['B', 'C', 'D'].includes(record.passageLabel))) {
  throw new Error('Non-BCD passage detected')
}

fs.mkdirSync(path.dirname(JSONL_PATH), { recursive: true })
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
fs.writeFileSync(JSONL_PATH, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`)

const highRecords = records.filter((record) => record.reviewPriority === 'high')
const gapSummary = missingGroups.length
  ? `- 当前缺口：${missingGroups.length} 篇，约 ${missingGroups.length * 4} 题。`
  : '- 当前缺口：0 篇，B/C/D 目标样本池已补齐。'
const claudeCoverageNote = claudeReviewedRecords.length === records.length
  ? `- Claude 覆盖：${claudeReviewedRecords.length}/${records.length} 题。`
  : `- Claude 覆盖：${claudeReviewedRecords.length}/${records.length} 题；新补题仍需批量 Claude 复核。`
const calibrationStatusNote = userReviewedRecords.length === records.length
  ? '- 校准状态：teacher-confirmed。DeepSeek 原始分、Codex/Claude 复核与用户最终分已全部写入。'
  : '- 校准状态：draft。DeepSeek 是解析模型原始分；Codex/Claude 是两路大模型经验复核；最终仍等你确认。'
const nextStepForGaps = missingGroups.length
  ? '3. 之后补导入剩余缺口，并加 import-validation gate 后再重建全量表。'
  : claudeReviewedRecords.length < records.length
    ? '3. 缺口已清零；下一步优先补新题 Claude 复核与用户最终分。'
    : userReviewedRecords.length < records.length
      ? '3. 缺口已清零且 Claude 复核已补齐；下一步只剩用户最终分确认。'
      : '3. 缺口、Claude 复核、用户最终分均已完成；下一步沉淀难度规则。'
const missingGroupRows = missingGroups.length
  ? missingGroups.map((item) => `| ${item.kind === 'new_curriculum_i' ? '新课标 I' : '浙江1月'} | ${item.year} | ${item.passageLabel} | ${item.reason} | ${item.nextAction} |`).join('\n')
  : '| 无 | - | - | - | - |'
const nextSteps = userReviewedRecords.length === records.length
  ? [
      '1. 基于 108 题对比 DeepSeek / Codex / Claude / 用户最终分，提取 AI 易偏差模式。',
      '2. 把高频 override reason 沉淀为小题难度 rubric，优先处理词汇、定位、抽象和干扰项。',
      '3. 再决定哪些规则回写 prompt，哪些放进后端难度公式。'
    ]
  : [
      '1. 你先只看 high 题，对照 DeepSeek / Codex / Claude 三方分数，确认最终分。',
      '2. 我再根据你的修改同步 JSONL 和报告。',
      nextStepForGaps
    ]
const report = `# 全量 B/C/D 小题难度校准表 V1

生成时间：${GENERATED_AT}

## 结论

- 当前阶段：已导入且已有 DeepSeek 阅读解析的 B/C/D 全量校准。
- 当前覆盖：${selectedGroups.length} 篇 / ${records.length} 题。
- 理论目标：27 篇 / 约 108 题。
${gapSummary}
${calibrationStatusNote}
${claudeCoverageNote}

## 缺口

| 来源 | 年份 | 篇 | 缺口原因 | 下一步 |
| --- | ---: | --- | --- | --- |
${missingGroupRows}

## reviewPriority 规则

- high：T9/T10；word_meaning / adjective_summary / abstract_phrase_summary / writing_technique；含 topic；含 abstraction+distractor；AI 1-10 分先映射到 1-5 后与 Codex 初判差距 >= 2；证据缺失；AI 原始分 >= 7。
- medium：T5/T6/T7/T8；多个 blocker；AI 分 >= 5。
- low：直接定位或低阻断题。

AI 映射断点：1-2→1，3-4→2，5-6→3，7-8→4，9-10→5。

## 复核量

${tableFromMap(priorityCounts, ['优先级', '题数'])}

## 题型覆盖

${tableFromMap(categoryCounts, ['类别', '题数'])}

## 年份覆盖

${tableFromMap(yearCounts, ['年份', '题数'])}

## T 卡覆盖

${tableFromMap(cardCounts, ['T卡', '题数'])}

## 三方分布

DeepSeek 映射分布：

${tableFromMap(countBy(records, (record) => record.deepseekMappedDifficulty), ['DeepSeek映射 1-5', '题数'])}

Codex/超老师经验分布：

${tableFromMap(codexCounts, ['Codex经验分 1-5', '题数'])}

Claude 经验分布：

${claudeReviewedRecords.length ? tableFromMap(claudeCounts, ['Claude经验分 1-5', '题数']) : 'Claude 尚未完成批量复核。'}

你已确认分布：

${userReviewedRecords.length ? tableFromMap(userCounts, ['你最终分 1-5', '题数']) : '你还没有确认任何题。'}

## 三方分歧

- DeepSeek 映射分 与 Codex 经验分不一致：${deepseekCodexDisagreements.length} 题。
- Codex 经验分 与 Claude 经验分不一致：${codexClaudeDisagreements.length} 题。

DeepSeek vs Codex 分歧幅度：

${tableFromMap(deepseekCodexDiffBreakdown, ['分歧幅度', '题数'])}

Codex vs Claude 分歧幅度：

${claudeReviewedRecords.length ? tableFromMap(codexClaudeDiffBreakdown, ['分歧幅度', '题数']) : 'Claude 尚未完成批量复核。'}

## DeepSeek 解析元信息

${tableFromMap(modelCounts, ['provider/model/thinking', '题数'])}

## 你优先看的 high 题

| 来源 | 篇 | 题号 | surfaceType | T卡 | DeepSeek 10 | DeepSeek档 | Codex | Claude | 你最终 | 复核原因 | stem | 三方备注 |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
${highRecords.map((record) => `| ${record.year} ${markdownEscape(record.sourcePaper)} | ${record.passageLabel} | ${record.questionNo} | ${record.surfaceType} | ${record.tCardId} | ${record.aiDifficultyScore} | ${record.deepseekMappedDifficulty} | ${record.codexReviewDifficulty} | ${record.claudeReviewDifficulty ?? ''} | ${record.userFinalDifficulty ?? ''} | ${markdownEscape(record.reviewReasons.join('；'))} | ${markdownEscape(record.stem)} | Codex：${markdownEscape(record.codexReviewNote)}${record.claudeReviewNote ? `<br>Claude：${markdownEscape(record.claudeReviewNote)}` : ''}${record.userFinalNote ? `<br>你：${markdownEscape(record.userFinalNote)}` : ''} |`).join('\n')}

## 全量表

| 优先级 | 来源 | 篇 | 题号 | surfaceType | answeringMove | T卡 | DeepSeek 10 | DeepSeek档 | Codex | Claude | 你最终 | blockers | stem | 三方备注 |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
${records.map((record) => `| ${record.reviewPriority} | ${record.year} ${markdownEscape(record.sourcePaper)} | ${record.passageLabel} | ${record.questionNo} | ${record.surfaceType} | ${record.answeringMove} | ${record.tCardId} | ${record.aiDifficultyScore} | ${record.deepseekMappedDifficulty} | ${record.codexReviewDifficulty} | ${record.claudeReviewDifficulty ?? ''} | ${record.userFinalDifficulty ?? ''} | ${record.aiMainBlockers.join(', ')} | ${markdownEscape(record.stem)} | Codex：${markdownEscape(record.codexReviewNote)}${record.claudeReviewNote ? `<br>Claude：${markdownEscape(record.claudeReviewNote)}` : ''}${record.userFinalNote ? `<br>你：${markdownEscape(record.userFinalNote)}` : ''} |`).join('\n')}

## 下一步

${nextSteps.join('\n')}
`

fs.writeFileSync(REPORT_PATH, report)

console.log(JSON.stringify({
  jsonlPath: JSONL_PATH,
  reportPath: REPORT_PATH,
  groups: selectedGroups.length,
  records: records.length,
  missingGroups,
  reviewPriority: Object.fromEntries(priorityCounts),
  categories: Object.fromEntries(categoryCounts)
}, null, 2))
