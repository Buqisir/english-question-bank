#!/usr/bin/env node
/**
 * trap-audit-scan.mjs — r2-trap-audit Scope 步骤 1 (docs/cuts/r2-trap-audit/plan.md).
 *
 * Deterministic, zero-AI full scan of every published reading-choice trap
 * (all `app/public/paper-assets/<paperId>/latest/analyses/
 * reading-choice-analysis-v1.json`, versions/ untouched — this cut only
 * reads/writes `latest/`). Four checks, defined once in trap-audit-lib.mjs so
 * this script and trap-audit-apply-suspension.mjs can never disagree on what
 * "found" means:
 *
 *   1. rogueType                      — primaryType outside the controlled
 *                                        five-type word list.
 *   2. labelExplanationContradiction  — "unsupportedClaim" (无中生有) trap
 *                                        whose own explanation quotes real
 *                                        source wording (a self-contradiction:
 *                                        claims nothing supports the option,
 *                                        yet the explanation cites the text).
 *   3. structuralIncompleteness       — per-type required field/enum gaps.
 *   4. evidenceFieldLeak              — "unsupportedClaim" trap whose sibling
 *                                        evidence fields are nonetheless
 *                                        populated with a real quote.
 *
 * This script is read-only: it never writes into app/public/paper-assets.
 * Output: docs/cuts/r2-trap-audit/scan-findings.json (machine, drives step 3
 * + the second-段 judgment battle) and docs/cuts/r2-trap-audit/scan-report.md
 * (human — counts + the judgment definitions verbatim, so the numbers are
 * auditable without re-reading this file).
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CHECK_IDS,
  CONTROLLED_TRAP_TYPES,
  evaluateOption,
} from './trap-audit-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const paperAssetsDir = path.join(rootDir, 'app', 'public', 'paper-assets')
const cutDir = path.join(rootDir, 'docs', 'cuts', 'r2-trap-audit')
const findingsPath = path.join(cutDir, 'scan-findings.json')
const reportPath = path.join(cutDir, 'scan-report.md')
const adjudicationsPath = path.join(cutDir, 'adjudications.json')

// 已判白名单（rulings.md 判例战役产物）：一条机审命中若在这里挂了号，说明
// owner 已经过目裁过它是假阳/合法对比论证，不是真贴错——扫描器跳过上报，
// 不再进 scan-findings.json（该命中仍会被 evaluateOption 判定为"命中"，
// 白名单只影响这里的报告产出，不影响 trap-audit-lib.mjs 的判据本身）。
const adjudications = existsSync(adjudicationsPath) ? JSON.parse(readFileSync(adjudicationsPath, 'utf8')) : []
function isAdjudicated(finding) {
  return adjudications.some((item) => item.paperId === finding.paperId
    && item.questionId === finding.questionId
    && item.optionLabel === finding.optionLabel
    && item.checkId === finding.checkId)
}

function listPaperIds() {
  return readdirSync(paperAssetsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function readAnalysis(paperId) {
  const analysisPath = path.join(paperAssetsDir, paperId, 'latest', 'analyses', 'reading-choice-analysis-v1.json')
  if (!existsSync(analysisPath)) return null
  try {
    return JSON.parse(readFileSync(analysisPath, 'utf8'))
  } catch (error) {
    return { __parseError: String(error) }
  }
}

const findings = []
const adjudicatedFindings = []
const parseErrors = []
let totalTraps = 0
const byPrimaryType = {}

for (const paperId of listPaperIds()) {
  const analysis = readAnalysis(paperId)
  if (!analysis) continue
  if (analysis.__parseError) {
    parseErrors.push({ paperId, error: analysis.__parseError })
    continue
  }
  for (const [questionId, question] of Object.entries(analysis.questions || {})) {
    for (const option of question.optionAnalysis || []) {
      if (option?.status !== 'wrong' || !option.trap) continue
      totalTraps += 1
      byPrimaryType[option.trap.primaryType] = (byPrimaryType[option.trap.primaryType] || 0) + 1

      const hits = evaluateOption(option)
      for (const hit of hits) {
        const finding = {
          paperId,
          questionId,
          optionLabel: option.label,
          primaryType: option.trap.primaryType,
          checkId: hit.checkId,
          level: hit.level,
          ...(hit.missing ? { missing: hit.missing } : {}),
        }
        if (isAdjudicated(finding)) {
          adjudicatedFindings.push(finding)
        } else {
          findings.push(finding)
        }
      }
    }
  }
}

// ─── Report aggregates ───────────────────────────────────────────────────────

const countsByCheck = {}
for (const finding of findings) {
  countsByCheck[finding.checkId] = (countsByCheck[finding.checkId] || 0) + 1
}

const unsupportedClaimTotal = byPrimaryType.unsupportedClaim || 0
const contradictionCount = countsByCheck[CHECK_IDS.LABEL_EXPLANATION_CONTRADICTION] || 0
const contradictionPct = unsupportedClaimTotal > 0
  ? ((contradictionCount / unsupportedClaimTotal) * 100).toFixed(1)
  : '0.0'

const badgeCount = findings.filter((f) => f.level === 'badge').length
const rowCount = findings.filter((f) => f.level === 'row').length
const ownerReviewCount = findings.filter((f) => f.level === null).length

writeFileSync(findingsPath, `${JSON.stringify(findings, null, 2)}\n`)

const lines = []
lines.push('# r2-trap-audit — scan-report')
lines.push('')
lines.push(`生成时间：${new Date().toISOString()}（重跑 \`node scripts/trap-audit-scan.mjs\` 复算）`)
lines.push('')
lines.push('## 规模真相')
lines.push('')
lines.push(`- 全库 trap 总数（wrong 选项且带 \`trap\` 字段）：**${totalTraps}**`)
lines.push(`- 按 primaryType 分布：${Object.entries(byPrimaryType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${type}=${count}`).join('，')}`)
if (parseErrors.length > 0) {
  lines.push(`- ⚠️ ${parseErrors.length} 个卷解析失败：${parseErrors.map((e) => e.paperId).join('，')}`)
}
lines.push('')
lines.push('## 四类检查命中计数')
lines.push('')
lines.push('| checkId | 命中数 | 摘牌档位 |')
lines.push('| --- | --- | --- |')
lines.push(`| \`${CHECK_IDS.ROGUE_TYPE}\` | ${countsByCheck[CHECK_IDS.ROGUE_TYPE] || 0} | 按结构可否安全取解释分 badge/row |`)
lines.push(`| \`${CHECK_IDS.LABEL_EXPLANATION_CONTRADICTION}\` | ${countsByCheck[CHECK_IDS.LABEL_EXPLANATION_CONTRADICTION] || 0} | badge |`)
lines.push(`| \`${CHECK_IDS.STRUCTURAL_INCOMPLETENESS}\` | ${countsByCheck[CHECK_IDS.STRUCTURAL_INCOMPLETENESS] || 0} | row |`)
lines.push(`| \`${CHECK_IDS.EVIDENCE_FIELD_LEAK}\` | ${countsByCheck[CHECK_IDS.EVIDENCE_FIELD_LEAK] || 0} | 不摘牌——待第二段 owner 判例 |`)
lines.push('')
lines.push(`「无中生有」懒人桶里实锤贴错占比：**${contradictionCount} / ${unsupportedClaimTotal} = ${contradictionPct}%**（labelExplanationContradiction 命中数 / unsupportedClaim 总数）`)
lines.push('')
lines.push('## 判据原文（DEV 按数据实况定义，程序在 `scripts/trap-audit-lib.mjs`）')
lines.push('')
lines.push('1. **rogueType**：`trap.primaryType` 不在受控词表 `' + JSON.stringify(CONTROLLED_TRAP_TYPES) + '` 内。')
lines.push('2. **labelExplanationContradiction**：`primaryType === \'unsupportedClaim\'` 且（`sourceQuote`/`sourceText` 任一非空的窜入字段 或 `explanation` 文本中含引号包裹的英文原词钩，正则 `/["\'"“\']([a-zA-Z][a-zA-Z0-9 ,.\'-]{2,})["\'"”\']/`）。判据收紧到「引号里是英文原词」而非任意中文引号使用——后者是「原文未提及…」这类合法的对比性论证，若不收紧会把 566 条里 144 条正常表述误伤成矛盾。')
lines.push('3. **structuralIncompleteness**：按 `primaryType` 对应子 schema 逐字段查空值/非法枚举（`sourceLexicalTrap` 用 `sourceText/optionText/relationNote` + `matchType` 枚举；`polarityReversal`/`scopeShift` 用 `sourceQuote/sourceHighlight/optionText/optionHighlight/explanation` + 各自 `subtype` 枚举；`entityMismatch` 用 `sourceQuote/sourceEntity/optionText/optionEntity/explanation`；`unsupportedClaim` 用 `claim/explanation`）。')
lines.push('4. **evidenceFieldLeak**：`primaryType === \'unsupportedClaim\'` 且选项自身的 `trapEvidence`/`evidence` 字段仍带非空 `quote`（本次全库实测命中 0 条——语料里「无中生有」桶目前没有通过这条证据字段路径泄漏，真正的矛盾路径是上面第 2 条的引号钩子）。')
lines.push('')
lines.push('## 自动摘牌批（步骤 3，仅 rogueType + labelExplanationContradiction + structuralIncompleteness）')
lines.push('')
lines.push(`- badge（标签贴错、解释仍显）：**${badgeCount}** 条`)
lines.push(`- row（子结构坏死、整行不显）：**${rowCount}** 条`)
lines.push(`- evidenceFieldLeak 不摘牌，留待第二段 owner 判例：**${ownerReviewCount}** 条`)
lines.push('')
lines.push('## 复算')
lines.push('')
lines.push('本报告的每个数字都可以由 `scan-findings.json` 用一行 `jq`/`node` 重新数出来——例如 `node -e "console.log(require(\'./scan-findings.json\').filter(f=>f.checkId===\'rogueType\').length)"`。')
lines.push('')

// ─── 判后状态（rulings.md 判例战役收官后追加，本节内容不改写上面的历史扫描
//     记录——上面各节仍是第一段落刀完工时的机审真相）─────────────────────────
let liveSuspensionCount = 0
for (const paperId of listPaperIds()) {
  const analysis = readAnalysis(paperId)
  if (!analysis || analysis.__parseError) continue
  for (const question of Object.values(analysis.questions || {})) {
    for (const option of question.optionAnalysis || []) {
      if (option?.trap?.suspension) liveSuspensionCount += 1
    }
  }
}

lines.push('## 判后状态（rulings.md 判例战役收官，2026-07-16）')
lines.push('')
lines.push('- **R6 修复**：`labelExplanationContradiction`（`trap-audit-lib.mjs`）新增排除条件——引号钩命中的英文短语若是选项自身 `claim` 文本的子串（大小写不敏感），判定为「解释复述选项自身文本以驳斥之」的合法论证，不算自相矛盾。修复后 `paper-zj-2020-jul` q029-D（命中串 `introducing a concept` 即选项 `claim` 子串）不再命中，findings 从 7 降到 2。')
lines.push(`- **已判白名单**（\`docs/cuts/r2-trap-audit/adjudications.json\`，R6 修后仍会被启发式抓的边界例——owner 已裁合法，扫描器跳过上报）：**${adjudications.length}** 条`)
for (const item of adjudications) {
  lines.push(`  - ${item.paperId}/${item.questionId}/${item.optionLabel}（${item.checkId}，判例 ${item.ruling}）：${item.note}`)
}
lines.push('- **本批处置清单（8/8，rulings.md 判例 CL-1~CL-7）**：')
lines.push('  - 回牌 ×3（撤 suspension，标签/内容不动）：2022甲 q028-D、2024-II q032-A（CL-1）；浙江20-7月 q029-D（CL-6，R6 修后机器已不再命中）')
lines.push('  - 改判 sourceLexicalTrap ×3（重铸子 schema + 撤 suspension）：2023乙 q024-D、2025-II q032-D、960d0f8d q026-C（CL-2/CL-3/CL-4）')
lines.push('  - 改判 entityMismatch ×1（重铸子 schema + 撤 suspension）：浙江20-1月 q021-C（CL-5）')
lines.push('  - 改判 unsupportedClaim ×1（重铸子 schema、explanation 不含英文引号钩 + 撤 suspension）：2023-I q025-B（CL-7，`timeOrderReversal` 单例不转正）')
lines.push(`- **当前库 suspension 计数：${liveSuspensionCount}**（8 条摘牌全部经 owner 裁后撤销——回牌 3 条撤 suspension 标签维持，改判 5 条撤 suspension 重铸子 schema；摘牌机制本身保留，等下一批机器可证伪的实锤命中）`)
lines.push(`- **scan-findings.json 判后状态：${findings.length} 条**（白名单生效后剩余的未处理命中——本批全部 8 条已落判，故为 0；已判的 ${adjudicatedFindings.length} 条命中未消失于 evaluateOption()，只是被扫描器按白名单跳过上报，机审判据本身不因白名单而改变判定）`)
lines.push('')

writeFileSync(reportPath, `${lines.join('\n')}\n`)

console.log(`trap-audit-scan: ${totalTraps} traps scanned, ${findings.length} findings written to ${path.relative(rootDir, findingsPath)}`)
console.log(`report: ${path.relative(rootDir, reportPath)}`)
