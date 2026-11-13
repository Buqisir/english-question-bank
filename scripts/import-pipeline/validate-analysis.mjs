import { readFileSync } from 'node:fs'
import { projectNck1AnalysisSourceGroup, validateNck1StagedAnalysis } from '../../server/import-review/nck1AnalysisProjection.mjs'
import {
  buildCanonicalConsumptionSurfaceData,
  buildCanonicalReadingConsumptionSurfaceData,
} from '../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { projectObjectiveTeachingSource } from '../../app/src/features/paper-intelligence/objectiveTeachingContentAdapter.ts'

const [requestPath, analysisPath, ...extra] = process.argv.slice(2)
const consumptionPath = extra[0] === '--consumption' && extra.length === 2 ? extra[1] : null
if (!requestPath || !analysisPath || (extra.length && !consumptionPath)) {
  console.error('Usage: node scripts/import-pipeline/validate-analysis.mjs <request.json> <analysis.json> [--consumption <file>]')
  process.exitCode = 2
} else {
  try {
    const request = JSON.parse(readFileSync(requestPath, 'utf8'))
    const analysis = JSON.parse(readFileSync(analysisPath, 'utf8'))
    const result = validateNck1StagedAnalysis(request, analysis)
    const familyContractId = request.group.startsWith('reading-') ? 'reading'
      : { seven: 'seven-choices', cloze: 'cloze', grammar: 'grammar-fill' }[request.group]
    if (consumptionPath && familyContractId) {
      const consumption = JSON.parse(readFileSync(consumptionPath, 'utf8'))
      const { paper, group } = request.sourceGroup.material
      if (consumption.paperId !== paper.paperId || consumption.sourceAssetVersion !== paper.sourceAssetVersion) {
        throw new Error('Canonical consumption paper identity/sourceAssetVersion does not match request')
      }
      const input = { consumption, groupId: group.groupId, familyContractId }
      const { surfaceData } = familyContractId === 'reading'
        ? buildCanonicalReadingConsumptionSurfaceData(input)
        : buildCanonicalConsumptionSurfaceData(input)
      projectObjectiveTeachingSource(analysis.groups[group.groupId], projectNck1AnalysisSourceGroup(group).paragraphs,
        surfaceData.textMap, surfaceData.semanticParagraphs)
    }
    for (const warning of result.warnings) console.warn('WARNING', JSON.stringify(warning))
    console.log(`PASS ${request.group}: formal single-group validation; no files written${request.group === 'grammar' ? '; derived grammar fields checked on an in-memory copy' : ''}`)
  } catch (error) {
    console.error(`FAIL: ${error.message}`)
    process.exitCode = 1
  }
}
