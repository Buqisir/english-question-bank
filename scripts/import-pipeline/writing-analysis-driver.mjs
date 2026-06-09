// I18/I19 — Writing analysis backfill driver (application + continuation writing groups).
// Mirrors vp-driver.mjs: two modes driven by process.argv[2].
//
// Phase 1:  node writing-analysis-driver.mjs list [application|continuation|all]
//   Scans 12 ALLOWED papers for un-analysed writing groups of the given type.
//   For each group writes:
//     .scratch/import-pilot/wa/<paperId>__<groupId>.combined.txt
//     .scratch/import-pilot/wa/<paperId>__<groupId>.task.json
//   Plus a manifest.json summary.
//
// Phase 2:  node writing-analysis-driver.mjs persist [application|continuation|all]
//   Reads agent-written <key>.out.json files, validates via
//   validateWritingAnalysisCandidate, and persists via persistWritingAnalysisGroup.
//   For continuation groups, also runs the vocab gate (MF-2) before persisting.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  listWritingAnalysisWork,
  validateWritingAnalysisCandidate,
  persistWritingAnalysisGroup,
  runVocabGate,
} from '../../server/writing-analysis/writingAnalysisBackfillService.mjs'
import { buildWritingAnalysisMessages } from '../../server/paper-import-ai/analyzeWritingAnalysis.mjs'
import { buildContinuationAnalysisMessages } from '../../server/paper-import-ai/analyzeContinuationAnalysis.mjs'

const ROOT = process.cwd()
const PAPER_ASSETS = path.join(ROOT, 'app/public/paper-assets')
const WA_DIR = path.join(ROOT, '.scratch/import-pilot/wa')

// 12 新课标 papers + 浙江卷 1月 (zj real-exam import, 2026-06)
const ALLOWED = new Set([
  'paper-2020-i', 'paper-2020-ii',
  'paper-2021-i', 'paper-2021-ii',
  'paper-2022-i', 'paper-2022-ii',
  'paper-2023-i', 'paper-2023-ii',
  'paper-2024-i', 'paper-2024-ii',
  'paper-2025-i', 'paper-2025-ii',
  'paper-zj-2023-jan', 'paper-zj-2024-jan',
  'paper-zj-2025-jan', 'paper-zj-2026-jan',
])

const mode = process.argv[2]
const taskTypeArg = process.argv[3] || 'all'

if (!['list', 'persist'].includes(mode)) {
  console.error('usage: writing-analysis-driver.mjs list|persist [application|continuation|all]')
  process.exit(2)
}

if (!['application', 'continuation', 'all'].includes(taskTypeArg)) {
  console.error('task type filter must be: application|continuation|all')
  process.exit(2)
}

mkdirSync(WA_DIR, { recursive: true })

const key = (w) => `${w.paperId}__${w.groupId}`

// List all un-analysed groups across ALL paper-assets, then filter by ALLOWED + taskType
const allWork = listWritingAnalysisWork({ paperAssetsDir: PAPER_ASSETS, taskTypeFilter: taskTypeArg })
const work = allWork.filter((w) => ALLOWED.has(w.paperId))

if (mode === 'list') {
  const manifest = []

  for (const w of work) {
    let messages
    if (w.writingTask.taskType === 'continuation') {
      messages = buildContinuationAnalysisMessages(w.writingTask)
    } else {
      messages = buildWritingAnalysisMessages(w.writingTask)
    }
    const combined = [
      '=== SYSTEM ===',
      messages[0].content,
      '',
      '=== TASK ===',
      messages[1].content,
    ].join('\n')

    const k = key(w)
    writeFileSync(path.join(WA_DIR, `${k}.combined.txt`), combined, 'utf8')
    writeFileSync(path.join(WA_DIR, `${k}.task.json`), JSON.stringify(w, null, 2), 'utf8')

    manifest.push({
      key: k,
      paperId: w.paperId,
      groupId: w.groupId,
      writingTaskId: w.writingTask.writingTaskId,
      taskType: w.writingTask.taskType,
    })
  }

  writeFileSync(path.join(WA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  console.log(`work groups: ${work.length} (non-allowed or already done: ${allWork.length - work.length})`)
  for (const m of manifest) {
    console.log(`  ${m.key}  taskType=${m.taskType}  taskId=${m.writingTaskId}`)
  }
  console.log(`\nOutput dir: ${WA_DIR}`)
} else if (mode === 'persist') {
  let ok = 0
  let fail = 0

  for (const w of work) {
    const k = key(w)
    const outPath = path.join(WA_DIR, `${k}.out.json`)

    if (!existsSync(outPath)) {
      console.log(`MISSING ${k}`)
      fail++
      continue
    }

    let candidate
    try {
      candidate = JSON.parse(readFileSync(outPath, 'utf8'))
    } catch (e) {
      console.log(`PARSE_FAIL ${k}: ${e instanceof Error ? e.message : String(e)}`)
      fail++
      continue
    }

    try {
      // MF-2: For continuation, run vocab gate before structural validation.
      // allowlist = tracked paper-asset.json content (materialText + starters)
      if (candidate.taskType === 'continuation') {
        const wt = w.writingTask
        const allowlistText = [
          wt.materialText || '',
          ...(wt.continuationStarters || []),
        ].join(' ')

        // Build text to check: modelAnswer + all highlight texts
        const highlights = Array.isArray(candidate.highlightExpressions)
          ? candidate.highlightExpressions.map((h) => h.text || '').join(' ')
          : ''
        const textToCheck = [candidate.modelAnswer || '', highlights].join(' ')

        const gateResult = runVocabGate({ textToCheck, allowlistText })
        if (!gateResult.clean) {
          throw new Error(
            `[vocab-gate] GENUINE_OOV found — must replace with 课标词 before persisting:\n` +
            `  Words: ${gateResult.genuineOov.join(', ')}\n` +
            `  Raw output: ${gateResult.raw}`
          )
        }
        if (gateResult.suspect.length > 0) {
          console.warn(
            `[vocab-gate] SUSPECT words (review manually, likely OK): ${gateResult.suspect.join(', ')}`
          )
        }
        console.log(`[vocab-gate] CLEAN ✓ for ${k}`)
      }

      validateWritingAnalysisCandidate(candidate)
      const { filePath } = persistWritingAnalysisGroup({ paperAssetsDir: PAPER_ASSETS }, w, candidate)
      ok++
      console.log(`OK ${k} -> ${filePath}`)
    } catch (e) {
      fail++
      console.log(`FAIL ${k}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(`\npersist: ${ok} ok, ${fail} fail`)
}
