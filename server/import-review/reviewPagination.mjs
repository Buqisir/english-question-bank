import {
  canonicalConsumptionPrintPayload,
  paperAssetOfficialModelAnswers,
} from '../../scripts/import-pipeline/canonical-consumption-print-payload.mjs'
import {
  fixedPageLayoutPolicy,
  planFixedPagePdf,
  renderDiagnosticFixedPagePdf,
  renderExplicitFixedPagePdf,
} from '../draft-paper/fixedPagePdfPlanner.mjs'
import { renderPaginatedPaper } from '../draft-paper/paginationRenderer.mjs'
import { paginationPlanEdition } from '../paper-import/paginationPlan.mjs'
import { printConsumption } from './revisionProjection.mjs'

export function reviewPrintHtml(projection, versionType, buildPrintHtml, { includeListening = true } = {}) {
  if (!['student', 'teacher'].includes(versionType)) {
    const error = new Error('version must be student or teacher')
    error.code = 'IMPORT_REVIEW_VERSION_INVALID'
    error.status = 400
    throw error
  }
  let consumption = printConsumption(projection.consumption)
  if (!includeListening) {
    const lastListeningIndex = consumption.visibleStructure.reduce((last, node, index) =>
      node.kind === 'group' && node.familyContractId === 'listening' ? index : last, -1)
    consumption = {
      ...consumption,
      selections: consumption.selections.filter((selection) =>
        selection.familyContractId !== 'listening'),
      visibleStructure: consumption.visibleStructure.slice(lastListeningIndex + 1),
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
  const sourceHasListening = projection.paginationSlotBindings.some((entry) =>
    entry.familyContractId === 'listening')
  return {
    schemaVersion: 'import-review-pagination-metadata-v1',
    paperId: projection.paperId,
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    planDigest: projection.paginationPlanDigest,
    editions: ['friendly8', ...(sourceHasListening ? ['friendly10'] : [])].map((edition) => ({
      edition,
      targetPages: edition === 'friendly8' ? 8 : 10,
      includeListening: edition === 'friendly10',
      mode: projection.paginationPlan?.editions?.[edition] ? 'explicit' : 'bounded_auto',
      plan: projection.paginationPlan?.editions?.[edition] || null,
    })),
    slots: projection.paginationSlotBindings,
  }
}

export async function renderReviewFixedEdition(projection, edition, buildPrintHtml, render = renderPaginatedPaper) {
  const listeningCount = projection.paginationSlotBindings.filter((entry) =>
    entry.familyContractId === 'listening').length
  const policy = fixedPageLayoutPolicy(edition, listeningCount, listeningCount === 2)
  const html = reviewPrintHtml(projection, 'student', buildPrintHtml, {
    includeListening: policy.includeListening,
  })
  const explicit = paginationPlanEdition(
    projection.paginationPlan,
    edition,
    projection.paginationSlotBindings,
  )
  const result = explicit
    ? await renderExplicitFixedPagePdf(html, { ...explicit, render })
    : await planFixedPagePdf(html, { ...policy, render })
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
  const coverGapsPt = policy.omitCover ? null : edition === 'friendly8' ? [0, 18] : [72, 72]
  const result = await renderDiagnosticFixedPagePdf(html, {
    ...policy,
    coverGapsPt,
    render,
  })
  return { ...result, edition, mode: 'diagnostic_natural', coverGapsPt }
}
