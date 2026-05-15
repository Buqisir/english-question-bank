import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname)
const DB_PATH = path.join(ROOT, 'data/question-bank.sqlite')
const GOLDEN_PATH = path.join(ROOT, 'knowledge/difficulty/golden-question-difficulty-v1.jsonl')
const REPORT_PATH = path.join(ROOT, 'reports/difficulty-calibration-v1.md')
const CONFIRMED_AT = '2026-05-15T00:00:00.000Z'

const allowedTCards = new Set(Array.from({ length: 10 }, (_, index) => `T${index + 1}`))
const allowedBlockers = new Set(['vocab', 'syntax', 'distractor', 'abstraction', 'info_span', 'topic'])
const allowedReasons = new Set(['vocab', 'syntax', 'location', 'abstractness', 'distractor', 'topic', 'other'])

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

const samples = [
  {
    groupId: 'g-4acdbaa5-5eee-453f-a118-b93c80355d8e',
    questionNo: '2',
    teacherDifficulty: 3,
    overrideReason: 'vocab',
    teacherNote: '猜词题目标词本身不机械计入词汇阻断，但 decimate 对学生陌生，且上下文需理解数量骤减，整体为中等难度。'
  },
  {
    groupId: 'g-d9e30a1a-1ec8-4264-884c-bc39dc034681',
    questionNo: '1',
    teacherDifficulty: 3,
    overrideReason: 'abstractness',
    teacherNote: 'shine through 需要结合语境理解抽象含义，不是单纯词义替换，课堂上容易卡在短语语感。'
  },
  {
    groupId: 'g-81c2fba8-aebd-4340-839b-d8e85c480a8c',
    questionNo: '1',
    teacherDifficulty: 3,
    overrideReason: 'vocab',
    teacherNote: 'Eschewing 是明显陌生词，但猜词线索较集中；难点在上下文方向判断而不是目标词孤立难度。'
  },
  {
    groupId: 'g-4acdbaa5-5eee-453f-a118-b93c80355d8e',
    questionNo: '1',
    teacherDifficulty: 1,
    overrideReason: 'location',
    teacherNote: '定位明确，因果关系直接，适合作为基础低难控制题。'
  },
  {
    groupId: 'g-3c963eba-7526-4ce6-9dbc-70d5c9c75da6',
    questionNo: '4',
    teacherDifficulty: 2,
    overrideReason: 'location',
    teacherNote: 'learn from 需要回选项定位，但最后两段信息清楚，整合量有限。'
  },
  {
    groupId: 'g-3f80dd35-6ab5-4f56-8ab7-b455641843b8',
    questionNo: '3',
    teacherDifficulty: 3,
    overrideReason: 'vocab',
    teacherNote: '答案路径涉及 biases 等抽象学术词和研究语境，定位不难但词义负荷会影响学生判断。'
  },
  {
    groupId: 'g-6d8e85bb-8616-4304-b51b-309d0143f773',
    questionNo: '2',
    teacherDifficulty: 2,
    overrideReason: 'distractor',
    teacherNote: '需要逐项回文排除，但原文态度较清楚，干扰项不算强。'
  },
  {
    groupId: 'g-f15e3a81-dac8-418e-875d-77bcb85d6694',
    questionNo: '2',
    teacherDifficulty: 3,
    overrideReason: 'abstractness',
    teacherNote: 'why mention 题要从 doctor/cheater 例子回到作者论点，抽象层级高于普通细节题。'
  },
  {
    groupId: 'g-4889a8c9-0e35-4d55-9293-a241b2d31909',
    questionNo: '4',
    teacherDifficulty: 3,
    overrideReason: 'abstractness',
    teacherNote: '需判断组织名例子服务的论点，例子功能明确但学生要跨过表层实体信息。'
  },
  {
    groupId: 'g-cea6af3a-b2dc-4914-b8b3-9e57897361db',
    questionNo: '1',
    teacherDifficulty: 3,
    overrideReason: 'abstractness',
    teacherNote: '写作手法题要求识别段落展开方式，答案不在单个事实点上。'
  },
  {
    groupId: 'g-87253741-4d63-4af3-8dd5-dcaf81b13ace',
    questionNo: '3',
    teacherDifficulty: 4,
    overrideReason: 'topic',
    teacherNote: '龙卷风研究语境和例子功能叠加，话题背景陌生，学生容易只看事实不看论证目的。'
  },
  {
    groupId: 'g-f15e3a81-dac8-418e-875d-77bcb85d6694',
    questionNo: '4',
    teacherDifficulty: 3,
    overrideReason: 'abstractness',
    teacherNote: '段落主旨需覆盖整段关于 emotional intelligence 的论述，不是单句复现。'
  },
  {
    groupId: 'g-c4023ab1-5d3e-47fa-8950-cfe1db46e066',
    questionNo: '1',
    teacherDifficulty: 3,
    overrideReason: 'abstractness',
    teacherNote: '段落主旨题需要归纳研究过程/发现，抽象负荷中等。'
  },
  {
    groupId: 'g-81c2fba8-aebd-4340-839b-d8e85c480a8c',
    questionNo: '4',
    teacherDifficulty: 4,
    overrideReason: 'abstractness',
    teacherNote: '标题题需要全文覆盖并压缩园艺理念，抽象概括强，明显高于普通主旨题。'
  },
  {
    groupId: 'g-f15e3a81-dac8-418e-875d-77bcb85d6694',
    questionNo: '3',
    teacherDifficulty: 3,
    overrideReason: 'abstractness',
    teacherNote: '态度题需要从多处表述推断作者立场，干扰项容易借常识带偏。'
  },
  {
    groupId: 'g-e51920c4-4fb7-4543-a0cb-8d01baf49198',
    questionNo: '3',
    teacherDifficulty: 3,
    overrideReason: 'abstractness',
    teacherNote: '需要从让步关系推出运动效果有限，是典型最小推断。'
  },
  {
    groupId: 'g-e51920c4-4fb7-4543-a0cb-8d01baf49198',
    questionNo: '4',
    tCardId: 'T10',
    teacherDifficulty: 4,
    overrideReason: 'abstractness',
    teacherNote: 'Why the Rush? 是抽象标题压缩，不只是普通全文主旨；已按讨论校正为 T10。'
  },
  {
    groupId: 'g-81c2fba8-aebd-4340-839b-d8e85c480a8c',
    questionNo: '3',
    teacherDifficulty: 4,
    overrideReason: 'abstractness',
    teacherNote: '两个形容词压缩具体风格特征，选项抽象且干扰强，属于高阶概括。'
  },
  {
    groupId: 'g-66171c5f-4679-44e8-a0dc-f3f9a605cc1d',
    questionNo: '1',
    teacherDifficulty: 1,
    overrideReason: 'location',
    teacherNote: '实验规则直接定位，语言和干扰都低，作为基础低难控制题。'
  },
  {
    groupId: 'g-6d8e85bb-8616-4304-b51b-309d0143f773',
    questionNo: '3',
    teacherDifficulty: 1,
    overrideReason: 'location',
    teacherNote: '题干关键词明确，答案句直接，适合作为第二个基础低难控制题。'
  }
]

function sqliteJson(sql) {
  const stdout = execFileSync('sqlite3', ['-json', DB_PATH, sql], {
    encoding: 'utf8',
    maxBuffer: 80 * 1024 * 1024
  })
  return JSON.parse(stdout || '[]')
}

function cleanPassageLabel(title) {
  const match = String(title || '').match(/阅读理解\s*([A-D])/)
  return match?.[1] || ''
}

function rawPassageLabelFor(row) {
  return cleanPassageLabel(row.passage_title) || cleanPassageLabel(row.group_title)
}

function passageLabelFor(row) {
  return PASSAGE_LABEL_OVERRIDES.get(row.group_id) || rawPassageLabelFor(row)
}

function validatePassageLabelOverrides(rows) {
  const rowsByGroupId = new Map(rows.map((row) => [row.group_id, row]))
  for (const [groupId, officialLabel] of PASSAGE_LABEL_OVERRIDES) {
    const row = rowsByGroupId.get(groupId)
    if (!row) continue
    const rawLabel = rawPassageLabelFor(row)
    if (!['A', 'B', 'C', 'D'].includes(officialLabel)) {
      throw new Error(`Invalid official passage label override for ${groupId}: ${officialLabel}`)
    }
    if (!rawLabel) throw new Error(`Cannot read raw passage label for override group_id: ${groupId}`)
  }
}

function aiMappedDifficulty(score) {
  if (score <= 2) return 1
  if (score <= 4) return 2
  if (score <= 6) return 3
  if (score <= 8) return 4
  return 5
}

function sanitizeBlockers(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => allowedBlockers.has(item))
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

function sourcePoolName(row) {
  if (String(row.paper_name).includes('浙江')) return '2023-2026 浙江卷（1月）BCD'
  return '2021-2025 新课标 I 卷 BCD'
}

function categoryFor(row) {
  const type = row.surfaceType
  const stem = row.stem.toLowerCase()
  if (row.tCardId === 'T10' || type === 'abstract_phrase_summary' || type === 'adjective_summary') return '推断/抽象压缩'
  if (type === 'word_meaning') return '猜词/指代'
  if (type === 'example_function' || type === 'writing_technique' || type === 'author_purpose') return 'why mention/example/writing'
  if (type === 'paragraph_main_idea' || type === 'passage_main_idea') return '段落/文章主旨'
  if (type === 'inference_general' || type === 'attitude_tone') return '推断/抽象压缩'
  if (type === 'multi_detail_learn_from' || stem.includes('learn') || row.answeringMove === 'option_backtracking') return '细节/多细节/learn from'
  return '细节/多细节/learn from'
}

function assertValid(record) {
  const required = [
    'version',
    'split',
    'sourcePaper',
    'year',
    'passageLabel',
    'groupId',
    'questionId',
    'questionNo',
    'stem',
    'answer',
    'surfaceType',
    'answeringMove',
    'tCardId',
    'aiDifficultyScore',
    'aiMainBlockers',
    'teacherDifficulty',
    'overrideReason',
    'teacherNote',
    'evidenceExcerpt',
    'confirmedAt'
  ]
  for (const field of required) {
    if (!(field in record)) throw new Error(`Missing field ${field} for ${record.groupId} Q${record.questionNo}`)
  }
  if (!allowedTCards.has(record.tCardId)) throw new Error(`Invalid tCardId ${record.tCardId}`)
  if (!Array.isArray(record.aiMainBlockers)) throw new Error(`aiMainBlockers must be array`)
  for (const blocker of record.aiMainBlockers) {
    if (!allowedBlockers.has(blocker)) throw new Error(`Invalid blocker ${blocker}`)
  }
  if (!allowedReasons.has(record.overrideReason)) throw new Error(`Invalid overrideReason ${record.overrideReason}`)
  if (!Number.isInteger(record.aiDifficultyScore) || record.aiDifficultyScore < 1 || record.aiDifficultyScore > 10) {
    throw new Error(`Invalid aiDifficultyScore ${record.aiDifficultyScore}`)
  }
  if (!Number.isInteger(record.teacherDifficulty) || record.teacherDifficulty < 1 || record.teacherDifficulty > 5) {
    throw new Error(`Invalid teacherDifficulty ${record.teacherDifficulty}`)
  }
  if (Number.isNaN(Date.parse(record.confirmedAt)) || new Date(record.confirmedAt).toISOString() !== record.confirmedAt) {
    throw new Error(`confirmedAt must be ISO-8601: ${record.confirmedAt}`)
  }
}

const groupIds = [...new Set(samples.map((sample) => sample.groupId))]
const placeholders = groupIds.map((id) => `'${id.replaceAll("'", "''")}'`).join(',')
const rows = sqliteJson(`
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
  q.ai_difficulty_score,
  r.payload_json
FROM question_groups qg
JOIN passages p ON p.id = qg.passage_id
JOIN sources s ON s.id = p.source_id
JOIN questions q ON q.group_id = qg.id
JOIN reading_parse_results r ON r.question_group_id = qg.id
WHERE qg.id IN (${placeholders})
ORDER BY s.year, p.title, q.display_order
`)

validatePassageLabelOverrides(rows)

const rowByKey = new Map(rows.map((row) => [`${row.group_id}::${row.question_no}`, row]))
const payloadByGroup = new Map()
for (const row of rows) {
  if (!payloadByGroup.has(row.group_id)) {
    payloadByGroup.set(row.group_id, JSON.parse(row.payload_json || '{}'))
  }
}

const records = samples.map((sample) => {
  const row = rowByKey.get(`${sample.groupId}::${sample.questionNo}`)
  if (!row) throw new Error(`Question not found: ${sample.groupId} Q${sample.questionNo}`)
  const payload = payloadByGroup.get(sample.groupId)
  const parsedQuestion = (payload.questions || []).find((item) => String(item.questionNo) === String(sample.questionNo))
  if (!parsedQuestion) throw new Error(`Parsed question not found: ${sample.groupId} Q${sample.questionNo}`)

  const surfaceQuestion = parsedQuestion.surfaceQuestion || {}
  const synonymDifficulty = parsedQuestion.synonymDifficulty || {}
  const difficultyProfile = parsedQuestion.difficultyProfile || {}
  const aiDifficultyScore = Number(difficultyProfile.finalScore ?? row.ai_difficulty_score)
  const record = {
    version: 'v1',
    split: 'main',
    sourcePaper: row.paper_name,
    year: row.year,
    passageLabel: passageLabelFor(row),
    groupId: row.group_id,
    questionId: row.question_id,
    questionNo: row.question_no,
    stem: row.stem,
    answer: row.answer,
    surfaceType: sample.surfaceType || surfaceQuestion.type || '',
    answeringMove: sample.answeringMove || surfaceQuestion.answeringMove || '',
    tCardId: sample.tCardId || synonymDifficulty.cardId || '',
    aiDifficultyScore,
    aiMainBlockers: sanitizeBlockers(difficultyProfile.mainBlockers),
    teacherDifficulty: sample.teacherDifficulty,
    overrideReason: sample.overrideReason,
    teacherNote: sample.teacherNote,
    evidenceExcerpt: evidenceFrom(parsedQuestion),
    confirmedAt: CONFIRMED_AT
  }
  assertValid(record)
  return record
})

if (records.length !== 20) throw new Error(`Expected 20 main records, got ${records.length}`)
if (new Set(records.map((record) => record.questionId)).size !== records.length) {
  throw new Error('Duplicate questionId in golden set')
}

const passageKeys = new Map()
for (const record of records) {
  const key = `${record.sourcePaper} ${record.passageLabel}`
  passageKeys.set(key, (passageKeys.get(key) || 0) + 1)
}
if (passageKeys.size < 5) throw new Error(`Expected at least 5 passages, got ${passageKeys.size}`)
if (new Set(records.map((record) => record.year)).size < 3) {
  throw new Error('Expected at least 3 years')
}
for (const [key, count] of passageKeys) {
  if (count > 4) throw new Error(`Passage ${key} has ${count} records`)
}

const sourcePoolViolations = records.filter((record) => {
  const isNewI = record.year >= 2021 && record.year <= 2025 && /新课标[ⅠI]/.test(record.sourcePaper)
  const isZhejiang = record.year >= 2023 && record.year <= 2026 && record.sourcePaper.includes('浙江') && record.sourcePaper.includes('1月')
  return !isNewI && !isZhejiang
})
if (sourcePoolViolations.length) {
  throw new Error(`Records outside source pool: ${sourcePoolViolations.map((record) => record.questionId).join(', ')}`)
}

fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true })
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
fs.writeFileSync(GOLDEN_PATH, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`)

const byCategory = new Map()
const byYear = new Map()
const byCard = new Map()
const byTeacher = new Map()
const divergences = []

for (const record of records) {
  const category = categoryFor(record)
  byCategory.set(category, (byCategory.get(category) || 0) + 1)
  byYear.set(record.year, (byYear.get(record.year) || 0) + 1)
  byCard.set(record.tCardId, (byCard.get(record.tCardId) || 0) + 1)
  byTeacher.set(record.teacherDifficulty, (byTeacher.get(record.teacherDifficulty) || 0) + 1)
  const mapped = aiMappedDifficulty(record.aiDifficultyScore)
  if (mapped !== record.teacherDifficulty) {
    divergences.push({ record, mapped })
  }
}

function tableFromMap(map, columns) {
  return [
    `| ${columns[0]} | ${columns[1]} |`,
    '| --- | ---: |',
    ...[...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b), 'zh')).map(([key, value]) => `| ${key} | ${value} |`)
  ].join('\n')
}

const report = `# 高考真题小题难度黄金校准集 V1

生成时间：${CONFIRMED_AT}

## 结论

- 主样本：${records.length} 题
- 来源池：2021-2025 新课标 I 卷 B/C/D；2023-2026 浙江卷（1月）B/C/D
- 实际覆盖：${passageKeys.size} 篇，${new Set(records.map((record) => record.year)).size} 个年份
- 同一 passage 最大题数：${Math.max(...passageKeys.values())}
- 2026 浙江卷（1月）：当前数据库未纳入主样本；本轮覆盖已足够，按计划不强行导入。

## 题型覆盖

${tableFromMap(byCategory, ['类别', '题数'])}

## 年份覆盖

${tableFromMap(byYear, ['年份', '题数'])}

## T 卡覆盖

${tableFromMap(byCard, ['T卡', '题数'])}

## 老师难度分布

${tableFromMap(byTeacher, ['老师难度 1-5', '题数'])}

## AI/老师分歧

AI 1-10 分仅作参考，本报告临时映射为：1-2→1，3-4→2，5-6→3，7-8→4，9-10→5。

| 题目 | AI分 | AI映射 | 老师分 | 原因 | 说明 |
| --- | ---: | ---: | ---: | --- | --- |
${divergences.map(({ record, mapped }) => `| ${record.year} ${record.sourcePaper} ${record.passageLabel} Q${record.questionNo} | ${record.aiDifficultyScore} | ${mapped} | ${record.teacherDifficulty} | ${record.overrideReason} | ${record.teacherNote} |`).join('\n')}

## 样本清单

| 来源 | 篇 | 题号 | surfaceType | answeringMove | T卡 | AI分 | 老师分 | stem |
| --- | --- | --- | --- | --- | --- | ---: | ---: | --- |
${records.map((record) => `| ${record.year} ${record.sourcePaper} | ${record.passageLabel} | ${record.questionNo} | ${record.surfaceType} | ${record.answeringMove} | ${record.tCardId} | ${record.aiDifficultyScore} | ${record.teacherDifficulty} | ${record.stem.replaceAll('|', '\\|')} |`).join('\n')}

## 后续建议

- 不把 T 卡直接映射为难度公式；T 卡只描述考查形式和同义替换/抽象跨度。
- 下一轮应重点复核 AI 与老师分歧项，尤其是猜词题、抽象标题压缩、形容词压缩和话题背景陌生题。
- 若继续扩容，优先导入并评估 2026 浙江卷（1月）B/C/D，以补足最新浙江首考样本。
`

fs.writeFileSync(REPORT_PATH, report)

console.log(JSON.stringify({
  goldenPath: GOLDEN_PATH,
  reportPath: REPORT_PATH,
  records: records.length,
  passages: passageKeys.size,
  years: [...new Set(records.map((record) => record.year))].sort(),
  categories: Object.fromEntries(byCategory),
  divergences: divergences.length
}, null, 2))
