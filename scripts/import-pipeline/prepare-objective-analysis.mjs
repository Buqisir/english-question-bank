import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { prepareObjectiveAnalysis } from '../../server/paper-import-ai/deriveReadingAnalysisRanges.mjs'
import { validateNck1StagedAnalysis } from '../../server/import-review/nck1AnalysisProjection.mjs'

const [requestPath, inputPath, outputPath, ...extra] = process.argv.slice(2)
assert(requestPath && inputPath && outputPath && !extra.length,
  'Usage: node scripts/import-pipeline/prepare-objective-analysis.mjs <request.json> <draft.json> <new-output.json>')
const request = JSON.parse(readFileSync(requestPath, 'utf8'))
assert(['cloze', 'grammar'].includes(request.group) && request.sourceGroup.groupKey === request.group,
  'Expected a single cloze or grammar request')
const draft = JSON.parse(readFileSync(inputPath, 'utf8'))
const prepared = prepareObjectiveAnalysis(draft, request.sourceGroup.material.group)
validateNck1StagedAnalysis(request, prepared)
writeFileSync(outputPath, `${JSON.stringify(prepared, null, 2)}\n`, { flag: 'wx' })
console.log(`PASS ${request.group}: deterministic completion/ranges prepared; unchanged formal validators passed; raw draft retained`)
