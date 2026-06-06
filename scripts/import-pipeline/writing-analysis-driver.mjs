// I18 — Writing analysis backfill driver (application writing groups only).
// Mirrors vp-driver.mjs: two modes driven by process.argv[2].
//
// Phase 1:  node writing-analysis-driver.mjs list
//   Scans 12 ALLOWED papers for un-analysed application writing groups.
//   For each group writes:
//     .scratch/import-pilot/wa/<paperId>__<groupId>.combined.txt
//     .scratch/import-pilot/wa/<paperId>__<groupId>.task.json
//   Plus a manifest.json summary.
//
// Phase 2:  node writing-analysis-driver.mjs persist
//   Reads agent-written <key>.out.json files, validates via
//   validateWritingAnalysisCandidate, and persists via persistWritingAnalysisGroup.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  listWritingAnalysisWork,
  validateWritingAnalysisCandidate,
  persistWritingAnalysisGroup,
} from '../../server/writing-analysis/writingAnalysisBackfillService.mjs'
import { buildWritingAnalysisMessages } from '../../server/paper-import-ai/analyzeWritingAnalysis.mjs'

const ROOT = process.cwd()
const PAPER_ASSETS = path.join(ROOT, 'app/public/paper-assets')
const WA_DIR = path.join(ROOT, '.scratch/import-pilot/wa')

// Same 12 papers as vp-driver; v1 only application groups
const ALLOWED = new Set([
  'paper-2020-i', 'paper-2020-ii',
  'paper-2021-i', 'paper-2021-ii',
  'paper-2022-i', 'paper-2022-ii',
  'paper-2023-i', 'paper-2023-ii',
  'paper-2024-i', 'paper-2024-ii',
  'paper-2025-i', 'paper-2025-ii',
])

const mode = process.argv[2]
mkdirSync(WA_DIR, { recursive: true })

const key = (w) => `${w.paperId}__${w.groupId}`

// List all un-analysed application groups across ALL paper-assets, then filter
const allWork = listWritingAnalysisWork({ paperAssetsDir: PAPER_ASSETS })
const work = allWork.filter((w) => ALLOWED.has(w.paperId))

if (mode === 'list') {
  const manifest = []

  for (const w of work) {
    const messages = buildWritingAnalysisMessages(w.writingTask)
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
    console.log(`  ${m.key}  taskId=${m.writingTaskId}`)
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
} else {
  console.error('usage: writing-analysis-driver.mjs list|persist')
  process.exit(2)
}
