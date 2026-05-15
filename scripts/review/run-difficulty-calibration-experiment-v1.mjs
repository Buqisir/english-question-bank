#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const INPUT_PATH = path.join(ROOT, 'knowledge/difficulty/full-bcd-difficulty-calibration-v1.jsonl')
const REPORT_PATH = path.join(ROOT, 'reports/difficulty-calibration-experiment-v1.md')
const JSON_PATH = path.join(ROOT, 'reports/difficulty-calibration-experiment-v1.json')

const REASON_CODES = [
  'strict_low_score_gate',
  't2_hidden_blocker_audit',
  'answer_path_vocab',
  'topic_pressure',
  'location_instability',
  'strong_distractor',
  'abstract_mapping',
  'syntax_load',
  'word_meaning_context_load',
  'high_ceiling_watch',
  't10_possible_overestimate',
]

function clampScore(value) {
  return Math.max(1, Math.min(5, value))
}

function readJsonl(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`)
      }
    })
}

function getRawDeepSeekScore(row) {
  const mapped = Number(row.deepseekMappedDifficulty)
  if (Number.isInteger(mapped) && mapped >= 1 && mapped <= 5) return mapped

  const raw10 = Number(row.aiDifficultyScore)
  if (Number.isFinite(raw10)) return clampScore(Math.ceil(raw10 / 2))

  return 3
}

function hasAnyBlocker(row) {
  return Array.isArray(row.aiMainBlockers) && row.aiMainBlockers.length > 0
}

function hasBlocker(row, blocker) {
  return Array.isArray(row.aiMainBlockers) && row.aiMainBlockers.includes(blocker)
}

function isAbstractSurface(row) {
  return [
    'adjective_summary',
    'abstract_phrase_summary',
    'passage_main_idea',
    'paragraph_main_idea',
    'writing_technique',
    'author_purpose',
    'example_function',
    'inference_general',
  ].includes(row.surfaceType)
}

function isAbstractCard(row) {
  return ['T5', 'T6', 'T7', 'T8', 'T9', 'T10'].includes(row.tCardId)
}

function hasStrongBlocker(row) {
  return (row.aiMainBlockers || []).some((blocker) =>
    ['vocab', 'syntax', 'distractor', 'topic', 'info_span'].includes(blocker),
  )
}

function isAbstractMappingBanned(row) {
  return (
    ['attitude_tone', 'adjective_summary', 'abstract_phrase_summary'].includes(row.surfaceType) &&
    ['T9', 'T10'].includes(row.tCardId)
  )
}

function isWordMeaningContextLoad(row) {
  if (row.surfaceType !== 'word_meaning' && row.tCardId !== 'T3') return false
  const stem = String(row.stem || '').toLowerCase()
  return (
    /refer to/.test(stem) ||
    hasBlocker(row, 'syntax') ||
    hasBlocker(row, 'distractor') ||
    hasBlocker(row, 'topic') ||
    hasBlocker(row, 'info_span')
  )
}

function isHighCeilingWatch(row) {
  const blockers = row.aiMainBlockers || []
  const hasMeaningBlocker = blockers.some((blocker) =>
    ['vocab', 'syntax', 'distractor', 'abstraction', 'info_span', 'topic'].includes(blocker),
  )

  if (!hasMeaningBlocker) return false

  return (
    Number(row.aiDifficultyScore) >= 5 &&
    (['passage_main_idea', 'paragraph_main_idea', 'inference_general'].includes(row.surfaceType) ||
      ['coverage_test', 'minimal_inference'].includes(row.answeringMove))
  )
}

function isStrictLowCandidate(row, rawScore) {
  return (
    rawScore === 1 &&
    ['T1', 'T2'].includes(row.tCardId) &&
    row.surfaceType === 'single_detail_normal' &&
    row.answeringMove === 'direct_locating' &&
    !hasAnyBlocker(row)
  )
}

function detectCalibrationReasons(row) {
  const rawScore = getRawDeepSeekScore(row)
  const reasons = new Set()

  if (rawScore === 1 && !isStrictLowCandidate(row, rawScore)) {
    reasons.add('strict_low_score_gate')
  }

  const directOrLowSurface =
    row.tCardId === 'T2' ||
    row.answeringMove === 'direct_locating' ||
    row.surfaceType === 'why_did'

  if (
    directOrLowSurface &&
    hasStrongBlocker(row)
  ) {
    reasons.add('t2_hidden_blocker_audit')
  }

  if (hasBlocker(row, 'vocab')) reasons.add('answer_path_vocab')
  if (hasBlocker(row, 'syntax')) reasons.add('syntax_load')
  if (hasBlocker(row, 'distractor')) reasons.add('strong_distractor')
  if (hasBlocker(row, 'topic')) reasons.add('topic_pressure')

  if (['option_backtracking', 'multi_point_matching', 'minimal_inference'].includes(row.answeringMove)) {
    reasons.add('location_instability')
  }

  if (!isAbstractMappingBanned(row) && (isAbstractSurface(row) || isAbstractCard(row))) {
    reasons.add('abstract_mapping')
  }

  if (isWordMeaningContextLoad(row)) reasons.add('word_meaning_context_load')
  if (isHighCeilingWatch(row)) reasons.add('high_ceiling_watch')

  if (row.tCardId === 'T10' && rawScore >= 4) {
    const concreteBlockers = (row.aiMainBlockers || []).filter(
      (blocker) => !['abstraction', 'info_span'].includes(blocker),
    )
    if (concreteBlockers.length === 0) reasons.add('t10_possible_overestimate')
  }

  return [...reasons].filter((reason) => REASON_CODES.includes(reason))
}

function calibrateSoftV0(row) {
  const rawScore = getRawDeepSeekScore(row)
  const reasons = detectCalibrationReasons(row)
  let increase = 0

  if (rawScore === 1 && reasons.includes('strict_low_score_gate')) {
    increase += 1
  } else if (rawScore <= 2 && reasons.includes('t2_hidden_blocker_audit')) {
    increase += 1
  }

  const concreteReasonCount = [
    'answer_path_vocab',
    'syntax_load',
    'strong_distractor',
    'topic_pressure',
    'location_instability',
  ].filter((reason) => reasons.includes(reason)).length

  if (rawScore + increase <= 2 && concreteReasonCount >= 2) increase += 1

  if (rawScore + increase <= 2 && reasons.includes('word_meaning_context_load')) increase += 1

  return {
    score: clampScore(rawScore + Math.min(2, increase)),
    reasons,
  }
}

function calibrateSoftV0WithT10Watch(row) {
  const result = calibrateSoftV0(row)
  if (result.reasons.includes('t10_possible_overestimate')) {
    return {
      score: clampScore(result.score - 1),
      reasons: result.reasons,
    }
  }
  return result
}

function evaluate(rows, scoreOf) {
  const stats = {
    n: 0,
    exact: 0,
    under: 0,
    over: 0,
    offByTwoOrMore: 0,
    absoluteError: 0,
  }

  for (const row of rows) {
    const expected = Number(row.userFinalDifficulty)
    const predicted = Number(scoreOf(row))
    if (!Number.isInteger(expected)) continue

    const delta = predicted - expected
    stats.n += 1
    if (delta === 0) stats.exact += 1
    if (delta < 0) stats.under += 1
    if (delta > 0) stats.over += 1
    if (Math.abs(delta) >= 2) stats.offByTwoOrMore += 1
    stats.absoluteError += Math.abs(delta)
  }

  return {
    ...stats,
    mae: Number((stats.absoluteError / Math.max(1, stats.n)).toFixed(3)),
  }
}

function groupBy(rows, keyOf) {
  const grouped = new Map()
  for (const row of rows) {
    const key = keyOf(row) || 'unknown'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  }
  return [...grouped.entries()]
}

function evaluateBy(rows, keyOf, scoreOf) {
  return groupBy(rows, keyOf)
    .map(([key, groupRows]) => ({ key, ...evaluate(groupRows, scoreOf) }))
    .sort((a, b) => b.n - a.n || String(a.key).localeCompare(String(b.key)))
}

function distribution(rows, scoreOf) {
  const counts = new Map()
  for (const row of rows) {
    const score = scoreOf(row)
    counts.set(score, (counts.get(score) || 0) + 1)
  }
  return [1, 2, 3, 4, 5].map((score) => ({ score, count: counts.get(score) || 0 }))
}

function formatTable(headers, rows) {
  const line = `| ${headers.join(' | ')} |`
  const separator = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${row.map((cell) => String(cell ?? '')).join(' | ')} |`)
  return [line, separator, ...body].join('\n')
}

function fmtMetricRow(label, stats) {
  return [
    label,
    stats.n,
    stats.exact,
    stats.mae.toFixed(3),
    stats.under,
    stats.over,
    stats.offByTwoOrMore,
  ]
}

function shortTitle(row) {
  return `${row.year} ${row.sourceKind === 'zhejiang_jan' ? '浙江1月' : '新I'} ${row.passageLabel} Q${row.questionNo}`
}

function main() {
  const rows = readJsonl(INPUT_PATH)
  const completed = rows.filter((row) => Number.isInteger(Number(row.userFinalDifficulty)))

  const baselineStats = evaluate(completed, getRawDeepSeekScore)
  const softStats = evaluate(completed, (row) => calibrateSoftV0(row).score)
  const t10WatchStats = evaluate(completed, (row) => calibrateSoftV0WithT10Watch(row).score)

  const details = completed.map((row) => {
    const raw = getRawDeepSeekScore(row)
    const soft = calibrateSoftV0(row)
    const t10Watch = calibrateSoftV0WithT10Watch(row)
    const teacher = Number(row.userFinalDifficulty)
    return {
      sourcePaper: row.sourcePaper,
      sourceKind: row.sourceKind,
      year: row.year,
      passageLabel: row.passageLabel,
      questionNo: row.questionNo,
      questionId: row.questionId,
      stem: row.stem,
      surfaceType: row.surfaceType,
      answeringMove: row.answeringMove,
      tCardId: row.tCardId,
      aiMainBlockers: row.aiMainBlockers || [],
      rawDeepSeekScore: raw,
      softCalibratedScore: soft.score,
      t10WatchScore: t10Watch.score,
      teacherDifficulty: teacher,
      softDelta: soft.score - teacher,
      rawDelta: raw - teacher,
      reasons: soft.reasons,
      userFinalNote: row.userFinalNote,
      evidenceExcerpt: row.evidenceExcerpt,
    }
  })

  const adjusted = details.filter((row) => row.rawDeepSeekScore !== row.softCalibratedScore)
  const improved = adjusted.filter((row) => Math.abs(row.softDelta) < Math.abs(row.rawDelta))
  const worsened = adjusted.filter((row) => Math.abs(row.softDelta) > Math.abs(row.rawDelta))
  const unchangedError = details.filter(
    (row) => row.rawDeepSeekScore === row.softCalibratedScore && row.rawDeepSeekScore !== row.teacherDifficulty,
  )

  const bySurface = evaluateBy(completed, (row) => row.surfaceType, (row) => calibrateSoftV0(row).score)
  const byCard = evaluateBy(completed, (row) => row.tCardId, (row) => calibrateSoftV0(row).score)

  const output = {
    version: 'difficulty-calibration-experiment-v1',
    generatedAt: new Date().toISOString(),
    inputPath: INPUT_PATH,
    reportPath: REPORT_PATH,
    jsonPath: JSON_PATH,
    metrics: {
      baselineDeepSeek: baselineStats,
      softV0: softStats,
      softV0WithT10Watch: t10WatchStats,
    },
    distributions: {
      teacherFinal: distribution(completed, (row) => Number(row.userFinalDifficulty)),
      baselineDeepSeek: distribution(completed, getRawDeepSeekScore),
      softV0: distribution(completed, (row) => calibrateSoftV0(row).score),
    },
    adjustmentSummary: {
      adjusted: adjusted.length,
      improved: improved.length,
      worsened: worsened.length,
      unchangedError: unchangedError.length,
    },
    bySurface,
    byCard,
    details,
  }

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(output, null, 2)}\n`)

  const topImproved = improved
    .sort((a, b) => Math.abs(b.rawDelta) - Math.abs(a.rawDelta))
    .slice(0, 14)
    .map((row) => [
      shortTitle(row),
      row.surfaceType,
      row.tCardId,
      `${row.rawDeepSeekScore} → ${row.softCalibratedScore}`,
      row.teacherDifficulty,
      row.reasons.join(', '),
    ])

  const topWorsened = worsened
    .sort((a, b) => Math.abs(b.softDelta) - Math.abs(a.softDelta))
    .slice(0, 14)
    .map((row) => [
      shortTitle(row),
      row.surfaceType,
      row.tCardId,
      `${row.rawDeepSeekScore} → ${row.softCalibratedScore}`,
      row.teacherDifficulty,
      row.reasons.join(', '),
    ])

  const remainingUnderestimates = details
    .filter((row) => row.softCalibratedScore < row.teacherDifficulty)
    .sort((a, b) => Math.abs(b.softDelta) - Math.abs(a.softDelta))
    .slice(0, 14)
    .map((row) => [
      shortTitle(row),
      row.surfaceType,
      row.tCardId,
      row.softCalibratedScore,
      row.teacherDifficulty,
      row.reasons.join(', '),
    ])

  const markdown = `# 小题难度校正实验 V1

生成时间：${output.generatedAt}

## 实验边界

这是一份**只读实验报告**，不会改数据库，也不会改变线上 DeepSeek 阅读解析结果。

本轮目标不是证明“客观通用难度”，而是检验一件更小、更实用的事：

> 在 108 道高考真题 teacher-final 样本上，能否用可审计的软校正规则减少 DeepSeek 对低阶表面题的系统性低估？

## 总体指标

${formatTable(
  ['版本', 'n', '完全一致', 'MAE', '低估', '高估', '相差>=2'],
  [
    fmtMetricRow('DeepSeek 原始映射', baselineStats),
    fmtMetricRow('soft-calibrator V1.1', softStats),
    fmtMetricRow('soft-calibrator V1.1 + T10 watch', t10WatchStats),
  ],
)}

结论：

- soft-calibrator V1.1 把 MAE 从 ${baselineStats.mae.toFixed(3)} 降到 ${softStats.mae.toFixed(3)}。
- 低估从 ${baselineStats.under} 降到 ${softStats.under}，相差 >=2 从 ${baselineStats.offByTwoOrMore} 降到 ${softStats.offByTwoOrMore}。
- 代价是高估从 ${baselineStats.over} 增加到 ${softStats.over}，说明规则仍需收紧，尤其不能把所有“抽象/干扰”都机械升分。
- T10 watch 只是观察项，不建议直接上线，因为当前 T10 样本太少。

## 分数分布

${formatTable(
  ['分数', '教师最终', 'DeepSeek 原始', 'soft V1.1'],
  [1, 2, 3, 4, 5].map((score) => [
    score,
    output.distributions.teacherFinal.find((item) => item.score === score)?.count ?? 0,
    output.distributions.baselineDeepSeek.find((item) => item.score === score)?.count ?? 0,
    output.distributions.softV0.find((item) => item.score === score)?.count ?? 0,
  ]),
)}

DeepSeek 原始分明显集中在 1-2；教师最终分集中在 3。soft V1.1 的主要作用是把一部分“假低难”从 1-2 推回 2-3。

## Claude 复审后收紧项

本报告已吸收第二轮 reviewer 的核心意见：

- \`t2_hidden_blocker_audit\` 不再仅凭 \`T2 / why_did / direct_locating\` 身份触发，必须至少有一个结构化强阻断信号。
- \`attitude_tone / adjective_summary / abstract_phrase_summary\` 且 \`T9 / T10\` 时，不让 \`abstract_mapping\` 参与升分，避免把“看起来抽象”等同于“必然难”。
- 多规则叠加升分只在当前仍低于 3 分时发生，减少 3 分题被推成 4 分的误伤。
- 增加 \`word_meaning_context_load\`，专门处理猜词/指代题里“目标词之外”的语境负荷，如指代、句法、干扰项或上下文复杂度。
- 增加 \`high_ceiling_watch\`，只提示可能存在 5 分高天花板，不自动打 5 分。

## 调整效果

${formatTable(
  ['项目', '数量'],
  [
    ['被调整题目', output.adjustmentSummary.adjusted],
    ['调整后更接近教师分', output.adjustmentSummary.improved],
    ['调整后更远离教师分', output.adjustmentSummary.worsened],
    ['未调整但仍错误', output.adjustmentSummary.unchangedError],
  ],
)}

### 典型改善题

${formatTable(['题目', 'surfaceType', 'T卡', 'DeepSeek→校正', '教师', '触发原因'], topImproved)}

### 典型变差题

${formatTable(['题目', 'surfaceType', 'T卡', 'DeepSeek→校正', '教师', '触发原因'], topWorsened)}

### 校正后仍低估

${formatTable(['题目', 'surfaceType', 'T卡', '校正分', '教师', '触发原因'], remainingUnderestimates)}

## 按 surfaceType 看 soft V1.1

${formatTable(
  ['surfaceType', 'n', '完全一致', 'MAE', '低估', '高估', '相差>=2'],
  bySurface.map((row) => [row.key, row.n, row.exact, row.mae.toFixed(3), row.under, row.over, row.offByTwoOrMore]),
)}

## 按 T 卡看 soft V1.1

${formatTable(
  ['T卡', 'n', '完全一致', 'MAE', '低估', '高估', '相差>=2'],
  byCard.map((row) => [row.key, row.n, row.exact, row.mae.toFixed(3), row.under, row.over, row.offByTwoOrMore]),
)}

## 当前可采纳结论

1. “DeepSeek 低估低阶表面题”这个判断成立，且后处理校正确实能缓解。
2. 校正方向应该是软规则，不是硬地板：只做 +1/+2 审计，不强制 T2 或 direct locating 到某个固定分。
3. 只靠现有字段还不够，尤其是 strong distractor / location instability 的识别依赖 DeepSeek 自己的 blocker 输出，稳定性需要后续加强。
4. T10 过估存在苗头，但样本太少，只能放入 watch，不进入正式规则。
5. 5 分高难题目前不自动生成。V1.1 只用 \`high_ceiling_watch\` 标记，因为现有字段还不足以稳定判断“全文隐喻/核心概念重建”。
6. 下一步不应直接改线上分数；更合理的是把 soft-calibrator 作为“教师复核建议分”并保留 DeepSeek 原始分。

## 推荐下一步

- 在前端/数据层新增一个只读字段：\`calibratedDifficultyPreview\`，显示为“校正建议”，不要覆盖 \`teacherDifficulty\`。
- DeepSeek prompt 继续输出原始六维难度和 mainBlockers；后端 soft-calibrator 只根据结构化字段做透明调整。
- 增加人工复核 UI：当 \`rawDeepSeekScore !== calibratedScore\` 或 \`reasons.length > 0\` 时，把 reason 展示给老师确认。
- 对 \`high_ceiling_watch\` 题不显示自动 5 分，只显示“可能高天花板，需教师复核”。
- 对 \`T10\` 题降级显示校正建议：灰色、低置信、提示“抽象压缩样本不足，可能高估”。
- 对 \`reasons.length === 0\` 且校正分等于原始分的题，标注“未触发校正规则，仅为原始分”，避免老师误以为它已经被校正器充分审过。
- 2026 浙江 1 月 B/D 中 \`strong_distractor\` 触发的 3 道变差题需要专项复核；若确认是 DeepSeek 误标强干扰，后续要把 strong distractor 从单一 blocker 改成更细的干扰项枚举。
- 再补至少 40 道教师复核样本后，重新跑本实验；若 MAE 和 off-by-2 稳定改善，再进入生产实现。
`

  fs.writeFileSync(REPORT_PATH, markdown)

  console.log(`Wrote ${REPORT_PATH}`)
  console.log(`Wrote ${JSON_PATH}`)
  console.log(JSON.stringify(output.metrics, null, 2))
}

main()
