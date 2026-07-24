// I18/I19 — Writing analysis backfill driver (application + continuation writing groups).
// Two modes driven by process.argv[2].
//
// Phase 1:  node writing-analysis-driver.mjs list [application|continuation|all]
//   Scans ALLOWED papers for un-analysed writing groups of the given type.
//   Application writes a locked pure-text prompt plus a task record; continuation
//   retains its combined prompt and task record. Both add a manifest summary.
//
// Phase 2:  node writing-analysis-driver.mjs persist [application|continuation|all]
//   Application reads reviewed separated work files; continuation keeps its
//   agent-written <key>.out.json flow and vocab gate (MF-2).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  listWritingAnalysisWork,
  validateWritingAnalysisCandidate,
  persistWritingAnalysisGroup,
  runVocabGate,
} from '../../server/writing-analysis/writingAnalysisBackfillService.mjs'
import { buildContinuationAnalysisMessages } from '../../server/paper-import-ai/analyzeContinuationAnalysis.mjs'
import {
  buildApplicationModelAnswerMessages,
  validateApplicationModelAnswer,
  validateApplicationReview,
} from '../../server/paper-import-ai/applicationWritingWorkflow.mjs'

const ROOT = process.cwd()
const PAPER_ASSETS = process.env.WRITING_ANALYSIS_PAPER_ASSETS_DIR || path.join(ROOT, 'app/public/paper-assets')
const WA_DIR = process.env.WRITING_ANALYSIS_WORK_DIR || path.join(ROOT, '.scratch/import-pilot/wa')

// 12 新课标 + 浙江1月(2026-06) + 浙江老卷 2020–2022 1月/6月/7月(#219/#220)
const DEFAULT_ALLOWED = [
  'paper-2020-i', 'paper-2020-ii',
  'paper-2021-i', 'paper-2021-ii',
  'paper-2022-i', 'paper-2022-ii',
  'paper-2023-i', 'paper-2023-ii',
  'paper-2024-i', 'paper-2024-ii',
  'paper-2025-i', 'paper-2025-ii',
  'paper-zj-2023-jan', 'paper-zj-2024-jan',
  'paper-zj-2025-jan', 'paper-zj-2026-jan',
  'paper-zj-2020-jan', 'paper-zj-2020-jul',
  'paper-zj-2021-jan', 'paper-zj-2021-jun',
  'paper-zj-2022-jan', 'paper-zj-2022-jun',
]
const ALLOWED = new Set((process.env.WRITING_ANALYSIS_ALLOWED_PAPERS || DEFAULT_ALLOWED.join(','))
  .split(',')
  .map((paperId) => paperId.trim())
  .filter(Boolean))

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
      messages = buildApplicationModelAnswerMessages(w.writingTask, w.groupPassage)
    }

    const k = key(w)
    if (w.writingTask.taskType === 'continuation') {
      const combined = [
        '=== SYSTEM ===',
        messages[0].content,
        '',
        '=== TASK ===',
        messages[1].content,
      ].join('\n')
      writeFileSync(path.join(WA_DIR, `${k}.combined.txt`), combined, 'utf8')
    } else {
      writeFileSync(path.join(WA_DIR, `${k}.model-answer.prompt.txt`), messages[0].content, 'utf8')
    }
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
  let applicationFailure = false

  for (const w of work) {
    const k = key(w)

    try {
      if (w.writingTask.taskType === 'application') {
        const modelAnswerPath = path.join(WA_DIR, `${k}.model-answer.txt`)
        const reviewCardPath = path.join(WA_DIR, `${k}.review-card.json`)
        const reviewPath = path.join(WA_DIR, `${k}.review.json`)
        const officialModelAnswerPath = path.join(WA_DIR, `${k}.official-model-answer.txt`)
        for (const [label, filePath] of [
          ['model answer', modelAnswerPath],
          ['review card', reviewCardPath],
          ['independent review', reviewPath],
        ]) {
          if (!existsSync(filePath)) throw new Error(`MISSING ${label} work file for ${k}`)
        }
        let reviewCard
        let review
        try {
          reviewCard = JSON.parse(readFileSync(reviewCardPath, 'utf8'))
          review = JSON.parse(readFileSync(reviewPath, 'utf8'))
        } catch (error) {
          throw new Error(`PARSE_FAIL ${k}: ${error instanceof Error ? error.message : String(error)}`)
        }
        validateApplicationModelAnswer({
          modelAnswer: readFileSync(modelAnswerPath, 'utf8'),
          writingTask: w.writingTask,
          groupPassage: w.groupPassage,
        })
        validateApplicationReview(review)
        if (review.verdict !== 'PASS') {
          throw new Error(`independent review verdict is ${review.verdict}; persist is blocked`)
        }
        const candidate = {
          taskType: 'application',
          modelAnswer: readFileSync(modelAnswerPath, 'utf8'),
          reviewCard,
          ...(existsSync(officialModelAnswerPath)
            ? { officialModelAnswer: readFileSync(officialModelAnswerPath, 'utf8') }
            : {}),
        }
        validateWritingAnalysisCandidate(candidate)
        const { filePath } = persistWritingAnalysisGroup({ paperAssetsDir: PAPER_ASSETS }, w, candidate)
        ok++
        console.log(`OK ${k} -> ${filePath}`)
        continue
      }

      const outPath = path.join(WA_DIR, `${k}.out.json`)
      if (!existsSync(outPath)) throw new Error(`MISSING ${k}`)
      let candidate
      try {
        candidate = JSON.parse(readFileSync(outPath, 'utf8'))
      } catch (error) {
        throw new Error(`PARSE_FAIL ${k}: ${error instanceof Error ? error.message : String(error)}`)
      }

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
      if (w.writingTask.taskType === 'application') applicationFailure = true
      console.log(`FAIL ${k}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(`\npersist: ${ok} ok, ${fail} fail`)
  // The new application workflow is a release gate: a missing or failing
  // independent review must make an application persist invocation fail.
  // Continuation retains its historical report-only exit behavior.
  if (applicationFailure) process.exitCode = 1
}
