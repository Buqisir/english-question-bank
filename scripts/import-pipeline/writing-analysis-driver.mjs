// I18/I19 — Writing analysis backfill driver (application + continuation writing groups).
// Two modes driven by process.argv[2].
//
// Phase 1:  node writing-analysis-driver.mjs list [application|continuation|all]
//   Scans ALLOWED papers for un-analysed writing groups of the given type.
//   Application writes the V4 prompt (V4 + complete task text) as
//   <key>.analysis-v4.prompt.txt; continuation writes the V3 prompt (V3 body +
//   structured task input) as <key>.analysis-v3.prompt.txt. Each also writes a
//   task record, and the run writes a manifest summary.
//
// Phase 2:  node writing-analysis-driver.mjs persist [application|continuation|all]
//   Reads the agent-written result (<key>.analysis-v4.json for application,
//   <key>.analysis-v3.json for continuation) and the independent review
//   <key>.review.json. Persist runs the program checks, refuses anything but a
//   PASS review, and sets modelAnswer to the standard essay
//   (application-writing-v4 and continuation-writing-v3 spec D4).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  listWritingAnalysisWork,
  validateWritingAnalysisCandidate,
  persistWritingAnalysisGroup,
} from '../../server/writing-analysis/writingAnalysisBackfillService.mjs'
import {
  buildNarrativeContinuationAnalysisMessages,
  validateContinuationAnalysisV3,
} from '../../server/paper-import-ai/analyzeNarrativeContinuation.mjs'
import {
  buildApplicationModelAnswerMessages,
  validateApplicationAnalysisV4,
  validateWritingReview,
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
const RESULT_FILE = { application: 'analysis-v4', continuation: 'analysis-v3' }

// List all un-analysed groups across ALL paper-assets, then filter by ALLOWED + taskType
const allWork = listWritingAnalysisWork({ paperAssetsDir: PAPER_ASSETS, taskTypeFilter: taskTypeArg })
const work = allWork.filter((w) => ALLOWED.has(w.paperId))

if (mode === 'list') {
  const manifest = []

  for (const w of work) {
    const messages = w.writingTask.taskType === 'continuation'
      ? buildNarrativeContinuationAnalysisMessages({ writingTask: w.writingTask })
      : buildApplicationModelAnswerMessages(w.writingTask, w.groupPassage)

    const k = key(w)
    const resultFile = RESULT_FILE[w.writingTask.taskType]
    writeFileSync(path.join(WA_DIR, `${k}.${resultFile}.prompt.txt`), messages[0].content, 'utf8')
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
    const taskType = w.writingTask.taskType

    try {
      const resultFile = RESULT_FILE[taskType]
      const analysisPath = path.join(WA_DIR, `${k}.${resultFile}.json`)
      const reviewPath = path.join(WA_DIR, `${k}.review.json`)
      const officialModelAnswerPath = path.join(WA_DIR, `${k}.official-model-answer.txt`)
      for (const [label, filePath] of [
        [`${resultFile} result`, analysisPath],
        ['independent review', reviewPath],
      ]) {
        if (!existsSync(filePath)) throw new Error(`MISSING ${label} work file for ${k}`)
      }
      let analysis
      let review
      try {
        analysis = JSON.parse(readFileSync(analysisPath, 'utf8'))
        review = JSON.parse(readFileSync(reviewPath, 'utf8'))
      } catch (error) {
        throw new Error(`PARSE_FAIL ${k}: ${error instanceof Error ? error.message : String(error)}`)
      }
      const { writing, warnings } = taskType === 'continuation'
        ? validateContinuationAnalysisV3({ analysis, writingTask: w.writingTask })
        : validateApplicationAnalysisV4({
          analysis,
          writingTask: w.writingTask,
          groupPassage: w.groupPassage,
        })
      for (const warning of warnings) console.warn(`WARN ${k}: ${warning}`)
      validateWritingReview(review, taskType)
      if (review.verdict !== 'PASS') {
        throw new Error(`independent review verdict is ${review.verdict}; persist is blocked`)
      }
      const candidate = {
        ...writing,
        ...(existsSync(officialModelAnswerPath)
          ? { officialModelAnswer: readFileSync(officialModelAnswerPath, 'utf8') }
          : {}),
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
  // Both writing workflows are release gates: a missing result, a failed
  // program check or a missing or failing independent review fails the run.
  if (fail > 0) process.exitCode = 1
}
