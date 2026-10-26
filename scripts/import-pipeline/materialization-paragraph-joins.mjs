import { digestJson, exactKeys, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { validateNck1SourceMaterialization } from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { CROSS_PAGE_PARAGRAPH_JOIN_VERSION, paragraphFragmentText } from '../../shared/paper-canonical/crossPageParagraphJoin.mjs'

export const PARAGRAPH_JOIN_PLAN_VERSION = 'cross-page-paragraph-join-plan-v1'
const parse = bytes => JSON.parse(new TextDecoder().decode(bytes))
const same = (a, b) => digestJson(a) === digestJson(b)
const bytes = value => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`)

function context(input, receiptBytes) {
  const materialization = parse(input.materializationBytes)
  const evidence = parse(input.ocrSourceBytes?.evidenceBytes)
  const confirmation = parse(input.ocrSourceBytes?.confirmationBytes)
  const receipt = parse(receiptBytes)
  if (!/^nck1-source-materialization-v(?:[1-9]|10)$/u.test(materialization.schemaVersion)
    || confirmation.schemaVersion !== 'nck1-ocr-source-confirmation-v3' || confirmation.confirmed !== true
    || materialization.paperId !== evidence.paperId || materialization.paperId !== confirmation.paperId
    || materialization.paperId !== receipt.paperId || receipt.reviewerKind !== 'import_agent'
    || !receipt.revisionId || !receipt.confirmationId
    || !same(confirmation, receipt.confirmation)
    || receipt.sourceSetDigest !== evidence.sourceSetDigest || confirmation.sourceSetDigest !== evidence.sourceSetDigest
    || receipt.evidenceDigest !== evidence.evidenceDigest || confirmation.evidenceDigest !== evidence.evidenceDigest) {
    throw new Error('Paragraph join requires the exact retained import-agent OCR receipt and confirmed source generation')
  }
  return { materialization, evidence, confirmation, binding: {
    materializationSha256: sha256(input.materializationBytes),
    evidenceSha256: sha256(input.ocrSourceBytes.evidenceBytes),
    confirmationSha256: sha256(input.ocrSourceBytes.confirmationBytes),
    receiptSha256: sha256(receiptBytes),
    sourceDocuments: input.documents.map(document => ({ documentId: document.documentId, sha256: sha256(document.bytes) })),
  } }
}

export function planMaterializationParagraphJoin(input, receiptBytes, { groupId, itemIds, reason }) {
  const { materialization, evidence, confirmation, binding } = context(input, receiptBytes)
  if (!Array.isArray(itemIds) || itemIds.length !== 2 || itemIds[0] === itemIds[1]
    || typeof reason !== 'string' || !reason.trim()) throw new Error('Specify two distinct complete item IDs and the original-page review reason')
  const groups = materialization.groups.filter(group => group.groupId === groupId)
  if (groups.length !== 1 || groups[0].family !== 'reading') throw new Error('Select exactly one Reading group')
  const fragments = itemIds.map(itemId => {
    const items = confirmation.documents.flatMap(document => document.pages.flatMap(page =>
      page.orderedItems.filter(item => item.itemId === itemId).map(item => ({ document, page, item }))))
    if (items.length !== 1) throw new Error(`Confirmed item is missing or ambiguous: ${itemId}`)
    const { document, page, item } = items[0]
    const blocks = groups[0].blocks.filter(block => block.kind === 'paragraph'
      && block.source?.documentId === document.documentId && block.source?.page === page.page
      && paragraphFragmentText(block) === item.text)
    if (blocks.length !== 1) throw new Error(`Complete source item must resolve to one body block: ${itemId}`)
    return { blockId: blocks[0].blockId, itemId, observationIds: [...item.observationIds], source: structuredClone(blocks[0].source) }
  })
  const relation = {
    schemaVersion: CROSS_PAGE_PARAGRAPH_JOIN_VERSION,
    joinId: `paragraph-join:${digestJson([groupId, fragments.map(fragment => fragment.itemId)]).slice(7, 31)}`,
    groupId, sourceSetDigest: evidence.sourceSetDigest, evidenceDigest: evidence.evidenceDigest,
    confirmationSha256: binding.confirmationSha256, separator: ' ',
    sourceReview: { reviewedBy: 'import_agent', sameNaturalParagraph: true, continuationLineUnindented: true, reason },
    fragments,
  }
  const plan = { schemaVersion: PARAGRAPH_JOIN_PLAN_VERSION, paperId: materialization.paperId,
    binding, relation, before: fragments.map(fragment => paragraphFragmentText(groups[0].blocks.find(block => block.blockId === fragment.blockId))),
    invalidatesFrom: 'spelling' }
  return { ...plan, planDigest: digestJson(plan) }
}

export function applyMaterializationParagraphJoinPlan(input, receiptBytes, plan, { confirmed } = {}) {
  if (confirmed !== true) throw new Error('Paragraph join requires explicit --agent-confirmed original-page review')
  const { materialization, binding } = context(input, receiptBytes)
  if (!exactKeys(plan, ['schemaVersion', 'paperId', 'binding', 'relation', 'before', 'invalidatesFrom', 'planDigest'])
    || plan.schemaVersion !== PARAGRAPH_JOIN_PLAN_VERSION || plan.paperId !== materialization.paperId
    || plan.invalidatesFrom !== 'spelling' || !same(plan.binding, binding)) throw new Error('Paragraph join plan is stale or belongs to another source generation')
  const { planDigest, ...body } = plan
  if (planDigest !== digestJson(body)) throw new Error('Paragraph join plan digest is invalid')
  // Recompute the proposed identity from the bound originals; do not trust a
  // caller-edited plan to silently change the requested items, target or text.
  const regenerated = planMaterializationParagraphJoin(input, receiptBytes, {
    groupId: plan.relation?.groupId, itemIds: plan.relation?.fragments?.map(fragment => fragment.itemId),
    reason: plan.relation?.sourceReview?.reason,
  })
  if (!same(plan, regenerated)) throw new Error('Paragraph join plan differs from its bound complete source fragments')
  const result = structuredClone(materialization)
  if (!['nck1-source-materialization-v9', 'nck1-source-materialization-v10'].includes(result.schemaVersion)) {
    result.schemaVersion = 'nck1-source-materialization-v8'
  }
  result.paragraphJoins = [...(result.paragraphJoins || []), structuredClone(plan.relation)]
  const issues = validateNck1SourceMaterialization(result)
  if (issues.length) throw new Error(`Paragraph join Materialization is invalid: ${JSON.stringify(issues)}`)
  return { materialization: result, materializationBytes: bytes(result) }
}
