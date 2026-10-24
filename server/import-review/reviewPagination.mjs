import {
  canonicalConsumptionPrintPayload,
  paperAssetOfficialModelAnswers,
} from '../../scripts/import-pipeline/canonical-consumption-print-payload.mjs'
import {
  fixedPageLayoutPolicy,
  planFixedPagePdf,
  planLongPaperPdf,
  renderDiagnosticFixedPagePdf,
  renderExplicitFixedPagePdf,
} from '../draft-paper/fixedPagePdfPlanner.mjs'
import { renderPaginatedPaper } from '../draft-paper/paginationRenderer.mjs'
import { STUDENT_PRODUCT_EDITIONS, studentProductPolicy, planStudentProductPdf, renderExplicitStudentProductPdf } from '../draft-paper/studentProductPdf.mjs'
import { productPageLimitsForPlan, paginationPlanEdition } from '../paper-import/paginationPlan.mjs'
import { printConsumption } from './revisionProjection.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { assertCanonicalConsumptionVisibleStructure } from '../../shared/paper-canonical/visibleStructure.mjs'
import { requirePaperPdfEdition } from '../../shared/paperPdfProducts.mjs'
import { buildAnswerOnlyHtml } from '../answer-renderer.mjs'
import { frozenProductResult } from '../paper-import/frozenProducts.mjs'
import { sourceProductEditions } from '../paper-import/pdfProductSet.mjs'

export function reviewPrintHtml(projection, versionType, buildPrintHtml, { includeListening = true } = {}) {
  if (!['student', 'teacher'].includes(versionType)) {
    const error = new Error('version must be student or teacher')
    error.code = 'IMPORT_REVIEW_VERSION_INVALID'
    error.status = 400
    throw error
  }
  let consumption = printConsumption(projection.consumption)
  if (!includeListening) {
    assertCanonicalConsumptionVisibleStructure(consumption)
    const lastListeningIndex = consumption.visibleStructure.reduce((last, node, index) =>
      node.kind === 'group' && node.familyContractId === 'listening' ? index : last, -1)
    const visibleStructure = consumption.visibleStructure.slice(lastListeningIndex + 1)
    consumption = {
      ...consumption,
      selections: consumption.selections.filter((selection) =>
        selection.familyContractId !== 'listening'),
      visibleStructure,
      visibleStructureDigest: digestJson(visibleStructure),
    }
  }
  const answerByQuestionId = new Map(
    Object.entries(projection.paperAsset.answerKey?.answers || {})
      .map(([questionId, answer]) => [questionId, answer.answer]),
  )
  const payload = canonicalConsumptionPrintPayload(
    consumption,
    projection.paperName,
    answerByQuestionId,
    paperAssetOfficialModelAnswers(projection.paperAsset),
  )
  const items = payload.items.map((item) => ({
    detail: payload.details.get(item.questionGroupId),
    note: '',
    score: 0,
    sectionTitle: '',
  }))
  const includedGroupIds = new Set(items.map((item) => item.detail.id || item.detail.groupId))
  const blocks = payload.blocks.filter((block) =>
    !block.questionGroupId || includedGroupIds.has(block.questionGroupId))
  return buildPrintHtml({
    title: payload.title,
    versionType,
    printStyle: payload.printStyle,
    items,
    blocks,
    questionNumberStart: payload.questionNumberStart,
    canonicalConsumption: consumption,
  })
}

export function reviewPaginationMetadata(projection) {
  const listeningCount = projection.paginationSlotBindings.filter((entry) =>
    entry.familyContractId === 'listening').length
  const editions = projection.config?.pdfProductsRequired || projection.config?.listening !== undefined
    ? sourceProductEditions(projection.config, listeningCount)
    : [...(listeningCount === 2 ? ['largeComplete'] : []), 'largeNoListening', 'economy8', 'answerOnly']
  return {
    schemaVersion: 'import-review-pagination-metadata-v1',
    paperId: projection.paperId,
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    planDigest: projection.paginationPlanDigest,
    editions: editions.filter(edition => edition !== 'answerOnly').map((edition) => ({
      edition,
      ...studentProductPolicy(edition, listeningCount, productPageLimitsForPlan(projection.paginationPlan)),
      mode: projection.paginationPlan?.editions?.[edition] ? 'explicit' : 'bounded_auto',
      plan: projection.paginationPlan?.editions?.[edition] || null,
    })).concat([{ edition: 'answerOnly', mode: 'natural', available: Boolean(projection.sourceReferences),
      sourceReferencesDigest: projection.sourceReferencesDigest,
      unavailableReason: projection.sourceReferences ? null : '此精确 revision 尚无完整的源参考答案捕获' }]),
    slots: projection.paginationSlotBindings,
    answerOnly: { edition: 'answerOnly', mode: 'natural', available: Boolean(projection.sourceReferences),
      sourceReferencesDigest: projection.sourceReferencesDigest,
      unavailableReason: projection.sourceReferences ? null : '此精确 revision 尚无完整的源参考答案捕获' },
  }
}

export async function renderReviewPdfProduct(projection, edition, buildPrintHtml, render = renderPaginatedPaper) {
  requirePaperPdfEdition(edition)
  if (projection.frozenProducts) return frozenProductResult(projection.frozenProducts, edition)
  if (edition !== 'answerOnly') return renderReviewFixedEdition(projection, edition, buildPrintHtml, render)
  if (!projection.sourceReferences) throw new Error('此精确 revision 尚无完整的源参考答案捕获；不能以教师卷替代')
  const html = buildAnswerOnlyHtml({ paperName: projection.paperName, materialization: projection.materialization,
    sourceReferences: projection.sourceReferences, sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest, sourceDocuments: projection.sourceInput.documents })
  return { ...await render(html), edition, mode: 'natural' }
}

export async function renderReviewFixedEdition(projection, edition, buildPrintHtml, render = renderPaginatedPaper, {
  economyPageLimit = productPageLimitsForPlan(projection.paginationPlan).economyPageLimit,
  largeCompletePageLimit = productPageLimitsForPlan(projection.paginationPlan).largeCompletePageLimit,
  largeNoListeningPageLimit = productPageLimitsForPlan(projection.paginationPlan).largeNoListeningPageLimit,
  restoreAnswerBoxes = false,
} = {}) {
  const listeningCount = projection.paginationSlotBindings.filter((entry) =>
    entry.familyContractId === 'listening').length
  const product = STUDENT_PRODUCT_EDITIONS.includes(edition)
  const policy = product ? studentProductPolicy(edition, listeningCount, { economyPageLimit, largeCompletePageLimit, largeNoListeningPageLimit })
    : fixedPageLayoutPolicy(edition, listeningCount, listeningCount === 2)
  const html = reviewPrintHtml(projection, 'student', buildPrintHtml, {
    includeListening: policy.includeListening,
  })
  const explicit = paginationPlanEdition(
    projection.paginationPlan,
    edition,
    projection.paginationSlotBindings,
  )
  const result = explicit
    ? await (product ? renderExplicitStudentProductPdf : renderExplicitFixedPagePdf)(html, { ...explicit, economyPageLimit, largeCompletePageLimit, largeNoListeningPageLimit, restoreAnswerBoxes, render })
    : await (product ? planStudentProductPdf : edition === 'long10' || edition === 'long12' ? planLongPaperPdf : planFixedPagePdf)(html, { ...policy, edition, economyPageLimit, largeCompletePageLimit, largeNoListeningPageLimit, render })
  return { ...result, edition, mode: explicit ? 'explicit' : 'bounded_auto' }
}

export async function renderReviewDiagnosticEdition(
  projection,
  edition,
  buildPrintHtml,
  render = renderPaginatedPaper,
) {
  const listeningCount = projection.paginationSlotBindings.filter((entry) =>
    entry.familyContractId === 'listening').length
  const policy = fixedPageLayoutPolicy(edition, listeningCount, listeningCount === 2)
  const html = reviewPrintHtml(projection, 'student', buildPrintHtml, {
    includeListening: policy.includeListening,
  })
  const coverGapsPt = policy.omitCover ? null : policy.targetPages === 8 ? [0, 18] : [72, 72]
  const result = await renderDiagnosticFixedPagePdf(html, {
    ...policy,
    coverGapsPt,
    render,
  })
  return { ...result, edition, mode: 'diagnostic_natural', coverGapsPt }
}
