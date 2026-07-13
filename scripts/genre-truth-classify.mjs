#!/usr/bin/env node
/**
 * r1-genre-truth — genre classification batch driver.
 *
 * Produces docs/cuts/r1-genre-truth/genre-decisions.json (audit artifact,
 * 273 rows: passageId/groupType/decision/confidence/rationale/batch/source)
 * and docs/cuts/r1-genre-truth/genre-needs-ruling.json (low-confidence subset).
 *
 * READ-ONLY on the DB. Never writes discourse_type. The apply step
 * (genre-truth-apply.mjs) is a separate script, gated on owner sign-off
 * (R1-DP1) — this script only produces the audit artifact.
 *
 * Modes:
 *   node scripts/genre-truth-classify.mjs rules
 *     Deterministic batch — 48 writing passages, title-based rule, zero AI.
 *
 *   node scripts/genre-truth-classify.mjs ai <batchId> [--force]
 *     AI batch — one of: reading-1 reading-2 reading-3 cloze seven-choices grammar-fill
 *     Calls DeepSeek per passage (own message, not multi-passage batching) with
 *     a controlled 5-way enum hard gate + retry. Skips passages already decided
 *     unless --force. Writes after every passage (checkpoint-friendly).
 *
 *   node scripts/genre-truth-classify.mjs report
 *     Prints five-class distribution + needs-ruling count; regenerates
 *     genre-needs-ruling.json from the current decisions.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { callDeepSeekJson } from '../server/ai-providers/deepseek.mjs'
import { extractFirstJsonObject } from '../server/paper-import-ai/extractJson.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const DB_PATH = path.join(projectRoot, 'data/question-bank.sqlite')
const CUT_DIR = path.join(projectRoot, 'docs/cuts/r1-genre-truth')
const DECISIONS_PATH = path.join(CUT_DIR, 'genre-decisions.json')
const NEEDS_RULING_PATH = path.join(CUT_DIR, 'genre-needs-ruling.json')

export const GENRE_ENUM = ['记叙', '说明', '议论', '应用', '新闻']

// ─── judicial precedent set (owner 裁决 2026-07-13, plan.md — embedded verbatim in the AI prompt) ───
const SYSTEM_PROMPT = `你是高考英语阅读语料的体裁标注员。给定一篇文章正文，从下面的受控五类枚举中选出唯一最贴合的体裁：

记叙 / 说明 / 议论 / 应用 / 新闻

## 五类定义
- 记叙：以人物经历或事件发展的时间线/情节为骨架的叙事文本（含游记、随笔、故事、第一人称体验、人物传记片段）。
- 说明：以解释事物、原理、数据、现象、操作方法为目的的客观介绍文本（含说明书、指南、攻略、贴士、百科式介绍、数据解读）。
- 议论：提出明确论点，并通过论证逐层推进、层层证明该论点的说理文。
- 应用：具有固定实用格式与明确交际目的的应用型文本（书信、通知、演讲稿、广告、说明性告示等）。
- 新闻：以具体日期 + 机构/官员引语 + 第三人称播报腔为骨架的事件播报体。

## 元原则（owner 裁决）
判文体看结构骨架，不看表面信号——报道背景、时效性引子（如 "first official data has shown"）、劝导语气均不改判。

## 判例集（owner 裁决 2026-07-13）
1. 人物经历时间线为骨架的纪实文 → 记叙（主人公是记者、有报道背景不改判）。新闻收窄为事件播报体：具体日期 + 机构/官员引语 + 第三人称播报腔。（判例源：passage-2020-i-reading-c，Bissell/咸海）
2. 解释因果/分析数据为主体 → 说明（"first official data has shown" 类时效引子不改变文体）。（判例源：passage-2022-yi-reading-d，糖税）
3. 贴士/指南/攻略体 → 说明（带劝导语气不改判）。议论收窄为：明确论点 + 论证层层推进的说理文。（判例源：passage-2020-jia-seven-choices，减塑）
4. 第一人称体验/感受为主线 → 记叙（事件性弱、描写成分重不改判；游记/食记/随笔同此）。（判例源：passage-2023-i-grammar-fill，小笼包）

## 输出要求
只返回一个 JSON 对象，形如：
{"type": "记叙", "confidence": "high", "rationale": "一句话依据（20-60字，中文）"}

- type 必须是五类枚举中的一个字符，不得输出枚举外的值，不得输出多个类型。
- confidence 只能是 "high" 或 "low"。样本明显贴合某一类判 high；结构骨架模糊、多类都沾边、或判例集未覆盖的边界情形判 low（不代表你不判——依然要按最贴合的一类给出 type，只是标记这条需要人工复核）。
- rationale 一句话说清判断依据，指出结构骨架（不是表面信号）。
- 只返回 JSON，不要 markdown 围栏，不要解释性前后缀文字。`

function buildUserMessage(passage) {
  return [
    `标题：${passage.title}`,
    `字数：${passage.wordCount}`,
    '正文：',
    passage.materialText,
  ].join('\n')
}

function ensureCutDir() {
  mkdirSync(CUT_DIR, { recursive: true })
}

function loadDecisions() {
  if (!existsSync(DECISIONS_PATH)) return []
  return JSON.parse(readFileSync(DECISIONS_PATH, 'utf8'))
}

function saveDecisions(decisions) {
  ensureCutDir()
  const sorted = [...decisions].sort((a, b) => a.passageId.localeCompare(b.passageId))
  writeFileSync(DECISIONS_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8')
  return sorted
}

function regenerateNeedsRuling(decisions) {
  const needsRuling = decisions
    .filter((d) => d.confidence === 'low')
    .map(({ passageId, groupType, decision, rationale, batch }) => ({ passageId, groupType, decision, rationale, batch }))
  ensureCutDir()
  writeFileSync(NEEDS_RULING_PATH, JSON.stringify(needsRuling, null, 2) + '\n', 'utf8')
  return needsRuling
}

function openDb() {
  return new DatabaseSync(DB_PATH, { readOnly: true })
}

function listPassagesByGroupType(db, groupType) {
  const rows = db
    .prepare(
      `
      SELECT p.id AS passageId, p.title AS title, p.material_text AS materialText, p.word_count AS wordCount
      FROM passages p
      JOIN question_groups qg ON qg.passage_id = p.id
      WHERE qg.group_type = ?
      ORDER BY p.id
      `,
    )
    .all(groupType)
  return rows
}

// ─── rules mode ──────────────────────────────────────────────────────────────

function runRules() {
  const db = openDb()
  let rows
  try {
    rows = listPassagesByGroupType(db, 'writing')
  } finally {
    db.close()
  }

  const decisions = loadDecisions()
  const byId = new Map(decisions.map((d) => [d.passageId, d]))

  let applied = 0
  for (const row of rows) {
    let decision
    let rationale
    if (row.title === '应用文写作') {
      decision = '应用'
      rationale = '规则批：title=应用文写作 → 应用（写作材料本身的体裁，非答题体裁）。'
    } else if (row.title === '读后续写') {
      decision = '记叙'
      rationale = '规则批：title=读后续写 → 记叙（续写材料延续故事情节骨架）。'
    } else {
      console.error(`SKIP (unrecognized writing title) ${row.passageId}: title=${row.title}`)
      continue
    }
    byId.set(row.passageId, {
      passageId: row.passageId,
      groupType: 'writing',
      decision,
      confidence: 'high',
      rationale,
      batch: 'rule-writing',
      source: 'rule',
    })
    applied++
  }

  const saved = saveDecisions([...byId.values()])
  regenerateNeedsRuling(saved)
  console.log(`rules: ${applied} writing passages decided (of ${rows.length} scanned). Total decisions on file: ${saved.length}.`)
}

// ─── ai mode ─────────────────────────────────────────────────────────────────

const BATCH_DEFS = {
  'reading-1': { groupType: 'reading', slice: [0, 42] },
  'reading-2': { groupType: 'reading', slice: [42, 84] },
  'reading-3': { groupType: 'reading', slice: [84, 126] },
  cloze: { groupType: 'cloze', slice: [0, 33] },
  'seven-choices': { groupType: 'seven_choices', slice: [0, 33] },
  'grammar-fill': { groupType: 'grammar_cloze', slice: [0, 33] },
}

function isValidEnumOutput(parsed) {
  if (!parsed || typeof parsed !== 'object') return false
  if (!GENRE_ENUM.includes(parsed.type)) return false
  if (parsed.confidence !== 'high' && parsed.confidence !== 'low') return false
  if (typeof parsed.rationale !== 'string' || !parsed.rationale.trim()) return false
  return true
}

async function classifyOnePassage(passage, { maxAttempts = 3 } = {}) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserMessage(passage) },
  ]

  let lastError = ''
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      messages.push({
        role: 'user',
        content: `上一次输出不合法（${lastError}）。请重新只输出一个 JSON 对象，type 必须是「记叙/说明/议论/应用/新闻」五者之一，confidence 必须是 "high" 或 "low"。`,
      })
    }
    let result
    try {
      result = await callDeepSeekJson({ messages, model: 'deepseek-v4-pro' })
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      continue
    }
    const parsed = extractFirstJsonObject(result.rawText)
    if (isValidEnumOutput(parsed)) {
      return { type: parsed.type, confidence: parsed.confidence, rationale: parsed.rationale.trim() }
    }
    lastError = `枚举硬 gate 拒收，原始输出：${String(result.rawText || '').slice(0, 200)}`
  }
  throw new Error(`分类失败（${maxAttempts} 次尝试后仍不合法）：${lastError}`)
}

async function runAiBatch(batchId, { force = false } = {}) {
  const def = BATCH_DEFS[batchId]
  if (!def) {
    console.error(`unknown batch id: ${batchId}. valid: ${Object.keys(BATCH_DEFS).join(', ')}`)
    process.exit(2)
  }

  const db = openDb()
  let rows
  try {
    rows = listPassagesByGroupType(db, def.groupType)
  } finally {
    db.close()
  }
  const [start, end] = def.slice
  const work = rows.slice(start, end)

  const decisions = loadDecisions()
  const byId = new Map(decisions.map((d) => [d.passageId, d]))

  let done = 0
  let skipped = 0
  const failed = []

  for (const passage of work) {
    if (!force && byId.has(passage.passageId)) {
      skipped++
      continue
    }
    try {
      const { type, confidence, rationale } = await classifyOnePassage(passage)
      byId.set(passage.passageId, {
        passageId: passage.passageId,
        groupType: def.groupType,
        decision: type,
        confidence,
        rationale,
        batch: batchId,
        source: 'ai',
      })
      done++
      console.log(`OK ${passage.passageId} -> ${type} (${confidence})`)
      // checkpoint after every passage
      const saved = saveDecisions([...byId.values()])
      regenerateNeedsRuling(saved)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failed.push({ passageId: passage.passageId, error: message })
      console.error(`FAIL ${passage.passageId}: ${message}`)
    }
  }

  console.log(`\nbatch ${batchId}: ${done} classified, ${skipped} skipped (already decided), ${failed.length} failed (of ${work.length} in batch).`)
  if (failed.length) {
    console.log('failed passageIds:', failed.map((f) => f.passageId).join(', '))
  }
}

// ─── report mode ───────────────────────────────────────────────────────────

function runReport() {
  const decisions = loadDecisions()
  const needsRuling = regenerateNeedsRuling(decisions)

  const byType = new Map()
  for (const type of GENRE_ENUM) byType.set(type, 0)
  for (const d of decisions) byType.set(d.decision, (byType.get(d.decision) || 0) + 1)

  console.log(`total decisions: ${decisions.length} / 273`)
  for (const [type, count] of byType) {
    const pct = decisions.length ? ((count / decisions.length) * 100).toFixed(1) : '0.0'
    console.log(`  ${type}: ${count} (${pct}%)`)
  }
  console.log(`needs-ruling (confidence=low): ${needsRuling.length}`)

  const byBatch = new Map()
  for (const d of decisions) byBatch.set(d.batch, (byBatch.get(d.batch) || 0) + 1)
  console.log('by batch:')
  for (const [batch, count] of byBatch) console.log(`  ${batch}: ${count}`)
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
// Guarded so other scripts (e.g. genre-truth-apply.mjs) can import GENRE_ENUM
// without triggering this module's own CLI dispatch as a side effect.

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2]
  const arg3 = process.argv[3]
  const force = process.argv.includes('--force')

  if (mode === 'rules') {
    runRules()
  } else if (mode === 'ai') {
    if (!arg3) {
      console.error(`usage: genre-truth-classify.mjs ai <batchId> [--force]\nvalid batchId: ${Object.keys(BATCH_DEFS).join(', ')}`)
      process.exit(2)
    }
    await runAiBatch(arg3, { force })
  } else if (mode === 'report') {
    runReport()
  } else {
    console.error('usage: genre-truth-classify.mjs rules|ai <batchId> [--force]|report')
    process.exit(2)
  }
}
