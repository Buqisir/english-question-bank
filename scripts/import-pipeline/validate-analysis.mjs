import { readFileSync } from 'node:fs'
import { validateNck1StagedAnalysis } from '../../server/import-review/nck1AnalysisProjection.mjs'

const [requestPath, analysisPath, ...extra] = process.argv.slice(2)
if (!requestPath || !analysisPath || extra.length) {
  console.error('Usage: node scripts/import-pipeline/validate-analysis.mjs <request.json> <analysis.json>')
  process.exitCode = 2
} else {
  try {
    const request = JSON.parse(readFileSync(requestPath, 'utf8'))
    const analysis = JSON.parse(readFileSync(analysisPath, 'utf8'))
    const result = validateNck1StagedAnalysis(request, analysis)
    for (const warning of result.warnings) console.warn('WARNING', JSON.stringify(warning))
    console.log(`PASS ${request.group}: formal single-group validation; no files written${request.group === 'grammar' ? '; derived grammar fields checked on an in-memory copy' : ''}`)
  } catch (error) {
    console.error(`FAIL: ${error.message}`)
    process.exitCode = 1
  }
}
