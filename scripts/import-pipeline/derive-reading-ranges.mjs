import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { deriveReadingAnalysisRanges } from '../../server/paper-import-ai/deriveReadingAnalysisRanges.mjs'
import { validateNck1StagedAnalysis } from '../../server/import-review/nck1AnalysisProjection.mjs'

// Local preparation only: retain raw model output and write a new file only
// after the unchanged schema, semantic and answer checks all succeed.
const [requestPath, inputPath, outputPath, ...extra] = process.argv.slice(2)
assert(requestPath && inputPath && outputPath && extra.length === 0,
  'Usage: node scripts/import-pipeline/derive-reading-ranges.mjs <request.json> <analysis.json> <--check|new-output.json>')
const checkOnly = outputPath === '--check'
const request = JSON.parse(readFileSync(requestPath, 'utf8'))
assert(/^reading-[a-d]$/u.test(request.group) && request.sourceGroup.groupKey === request.group,
  'Expected a single reading group request')
const { group } = request.sourceGroup.material
const rawAnalysis = JSON.parse(readFileSync(inputPath, 'utf8'))
const analysis = checkOnly ? rawAnalysis : deriveReadingAnalysisRanges(rawAnalysis, group)
validateNck1StagedAnalysis(request, analysis)
if (!checkOnly) writeFileSync(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, { flag: 'wx' })
console.log(checkOnly
  ? 'PASS original reading analysis; unchanged schema, source, answer and teaching-content validators passed; no files written'
  : 'PASS reading ranges derived; unchanged schema, source, answer and teaching-content validators passed')
