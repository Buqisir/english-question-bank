import { digestJson, exactKeys } from '../../shared/paper-canonical/stable.mjs'
import { sourceReferenceFigureIdentity, sourceReferenceScoringScopes } from './sourceReferenceScoringScope.mjs'
import { sourceReferenceEssayTaskStates } from './sourceReferenceWritingTask.mjs'
import { isSourceReferenceSampleLabel } from './sourceReferenceWritingRules.mjs'

const keys = ['figureId', 'figureIdentitySha256', 'anchorItemId', 'sourceDocumentSha256',
  'evidenceDigest', 'confirmationDigest', 'reason', 'confirmed']
const reject = message => { throw new Error(`Invalid explanation figure exclusion: ${message}`) }

// These are authored source-role decisions, carried by the existing reference
// sidecar. Never infer them from wording, coordinates or the current task.
export function sourceReferenceExplanationFigures(materialization, evidence, confirmation, figures, exclusions = []) {
  if (!Array.isArray(exclusions) || exclusions.length > 128) reject('expected a bounded declaration list')
  const excluded = new Set()
  if (!exclusions.length) return excluded
  const answerIds = new Set(materialization.documents.filter(document => document.role === 'official_answers')
    .map(document => document.documentId))
  const scoring = sourceReferenceScoringScopes(confirmation, answerIds)
  const essays = sourceReferenceEssayTaskStates(confirmation, answerIds, materialization, evidence)
  const confirmedItems = new Map(confirmation.documents.filter(document => answerIds.has(document.documentId))
    .flatMap(document => document.pages.flatMap(page => page.orderedItems))
    .map(item => [item.itemId, item]))
  for (const declaration of exclusions) {
    if (!declaration || !exactKeys(declaration, keys) || declaration.confirmed !== true
      || typeof declaration.reason !== 'string' || !declaration.reason.trim() || declaration.reason.length > 2000) {
      reject('requires an explicit confirmed original-page reading reason')
    }
    const matches = figures.filter(figure => figure.sourceRegionId === declaration.figureId)
    if (matches.length !== 1) reject('figureId must resolve uniquely')
    const [figure] = matches
    const identity = sourceReferenceFigureIdentity(figure)
    const document = materialization.documents.find(document => document.documentId === figure.source.documentId)
    if (!answerIds.has(document?.documentId) || document.sha256 !== declaration.sourceDocumentSha256
      || identity !== declaration.figureIdentitySha256 || figure.afterItem.itemId !== declaration.anchorItemId
      || digestJson(evidence) !== declaration.evidenceDigest || digestJson(confirmation) !== declaration.confirmationDigest) {
      reject('source PDF, figure identity, anchor or sealed OCR binding changed')
    }
    if (excluded.has(identity)) reject('duplicate figure declaration')
    // Essay projection removes picture items. Their sealed OCR still supplies
    // independent sample labels and scoring ownership, which confirmation
    // cannot override by declaring the image to be explanation.
    const consumedReference = figure.itemIds.some(itemId => scoring.get(itemId)
      || confirmedItems.get(itemId)?.text.split(/\r?\n/u).some(isSourceReferenceSampleLabel))
    if (scoring.get(figure.afterItem.itemId) || essays.get(figure.afterItem.itemId)?.capturing
      || consumedReference) {
      reject('a surviving essay or explicit scoring figure cannot be excluded as explanation')
    }
    excluded.add(identity)
  }
  return excluded
}

export function confirmSourceReferenceFigureExclusion(materialization, evidence, confirmation, figures, {
  figureId, figureIdentitySha256, anchorItemId, reason, confirmed,
}) {
  const figure = figures.find(figure => figure.sourceRegionId === figureId)
  const declaration = { figureId, figureIdentitySha256, anchorItemId,
    sourceDocumentSha256: materialization.documents.find(document => document.documentId === figure?.source.documentId)?.sha256,
    evidenceDigest: digestJson(evidence), confirmationDigest: digestJson(confirmation), reason, confirmed }
  sourceReferenceExplanationFigures(materialization, evidence, confirmation, figures, [declaration])
  return declaration
}
