import { digestJson, exactKeys, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { validateNck1SourceMaterialization } from '../../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { LISTENING_SOURCE_DECISION_VERSION } from '../../shared/paper-canonical/listeningSourceDecision.mjs'
import { resolveConfirmedNck1OcrEvidence } from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { resolveListeningSourceDecision } from '../../server/paper-import/listeningSourceDecision.mjs'
import { produceNck1MaterializationFromStructures } from '../../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../../shared/paper-canonical/compiler.mjs'

const PLAN_VERSION = 'listening-source-plan-v1'
const parse = bytes => JSON.parse(new TextDecoder().decode(bytes))
const same = (a, b) => digestJson(a) === digestJson(b)
const encode = value => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`)
const fail = message => { throw new Error(`Listening source authoring: ${message}`) }
export const isListeningBoundaryIssue = issue => /_LISTENING_(?:CUE_BOUNDARY|TRANSCRIPT|ANNOUNCEMENT_RANGE|ANALYSIS_TAIL|SOURCE_LOCATOR|MIXED_CONTENT)_/u.test(issue.code)

function context(input, receiptBytes) {
  const materialization = parse(input.materializationBytes), evidence = parse(input.ocrSourceBytes?.evidenceBytes)
  const confirmation = parse(input.ocrSourceBytes?.confirmationBytes), receipt = parse(receiptBytes)
  if (!/^nck1-source-materialization-v(?:[1-9]|11|12)$/u.test(materialization.schemaVersion)
    || Object.hasOwn(materialization, 'listeningSourceDecision')
    || materialization.listening?.state !== 'captured'
    || !['nck1-ocr-source-confirmation-v2', 'nck1-ocr-source-confirmation-v3'].includes(confirmation.schemaVersion) || confirmation.confirmed !== true
    || !same(receipt.confirmation, confirmation) || receipt.paperId !== materialization.paperId
    || evidence.paperId !== materialization.paperId || confirmation.paperId !== materialization.paperId
    || receipt.reviewerKind !== 'import_agent' || !receipt.revisionId || !receipt.confirmationId
    || receipt.sourceSetDigest !== evidence.sourceSetDigest || receipt.evidenceDigest !== evidence.evidenceDigest) {
    fail('requires the retained import-agent receipt and one unselected confirmed OCR generation')
  }
  const documents = materialization.documents.map(document => {
    const entries = input.documents.filter(entry => entry.documentId === document.documentId)
    if (entries.length !== 1 || sha256(entries[0].bytes) !== document.sha256 || entries[0].bytes.length !== document.byteLength) fail('source PDF bytes changed')
    return { ...document, bytes: entries[0].bytes }
  })
  if (documents.length !== input.documents.length) fail('source document set changed')
  const resolved = resolveConfirmedNck1OcrEvidence({ paperId: materialization.paperId, documents, evidence, confirmation })
  if (resolved.issues.length) fail(resolved.issues[0].message)
  const question = documents.find(d => d.role === 'question_source'), answer = documents.find(d => d.role === 'official_answers')
  if (!question || !answer) fail('requires separate question and official-answer sources')
  const producerInput = { paperId: materialization.paperId, documents, question, answer, coverage: question,
    questionStructure: resolved.structures.get(question.documentId), answerStructure: resolved.structures.get(answer.documentId),
    sourceVisuals: resolved.sourceVisuals, mediaInventory: materialization.media, codePrefix: 'NCK1_OCR' }
  return { materialization, documents, evidence, confirmation, resolved, producerInput,
    confirmationBytes: input.ocrSourceBytes.confirmationBytes, binding: {
      materializationSha256: sha256(input.materializationBytes), evidenceSha256: sha256(input.ocrSourceBytes.evidenceBytes),
      confirmationSha256: sha256(input.ocrSourceBytes.confirmationBytes), receiptSha256: sha256(receiptBytes),
      sourceDocuments: documents.map(document => ({ documentId: document.documentId, sha256: sha256(document.bytes) })),
    } }
}

function makePlan(ctx, options) {
  const { documentId, headingItemId = null, startItemId, endItemId = null, roles = [], reason } = options
  if (typeof reason !== 'string' || !reason.trim()) fail('requires an original-page review reason')
  const source = ctx.confirmation.documents.find(d => d.documentId === documentId)
  if (!source) fail('source document not found')
  const items = new Map(source.pages.flatMap(page => page.orderedItems.map(item => [item.itemId, item])))
  const address = id => {
    if (id === null) return null
    const item = items.get(id)
    if (!item) fail(`missing item ${id}`)
    return { itemId: id, text: item.text }
  }
  const decision = {
    schemaVersion: LISTENING_SOURCE_DECISION_VERSION, documentId,
    sourceSetDigest: ctx.evidence.sourceSetDigest, evidenceDigest: ctx.evidence.evidenceDigest,
    confirmationSha256: ctx.binding.confirmationSha256,
    heading: address(headingItemId), start: address(startItemId), end: address(endItemId),
    roles: roles.map(role => ({ role: role.role, nextTextNumber: role.nextTextNumber ?? null,
      questionNumbers: role.questionNumbers ?? [], fragments: role.fragments.map(fragment => {
        const item = items.get(fragment.itemId)
        if (!item) fail(`missing item ${fragment.itemId}`)
        const start = fragment.start ?? 0, end = fragment.end ?? item.text.length
        return { itemId: fragment.itemId, start, end, text: item.text.slice(start, end) }
      }) })),
    sourceReview: { reviewedBy: 'import_agent', originalPagesReviewed: true, allSpeechRetained: true, reason },
  }
  const listeningSource = resolveListeningSourceDecision({ ...ctx, decision })
  const replay = produceNck1MaterializationFromStructures({ ...ctx.producerInput, listeningSource, issues: [] })
  if (replay.materialization.issues.some(isListeningBoundaryIssue)) fail(`unresolved authored source boundary: ${JSON.stringify(replay.materialization.issues)}`)
  const body = { schemaVersion: PLAN_VERSION, paperId: ctx.materialization.paperId, binding: ctx.binding,
    decision, transcriptBefore: ctx.materialization.listening.transcript,
    transcriptAfter: replay.materialization.listening.transcript, invalidatesFrom: 'spelling' }
  return { ...body, planDigest: digestJson(body) }
}

export function planMaterializationListeningSource(input, receiptBytes, options) {
  return makePlan(context(input, receiptBytes), options)
}

export function applyMaterializationListeningSourcePlan(input, receiptBytes, plan, { confirmed } = {}) {
  if (confirmed !== true) fail('requires explicit --agent-confirmed original-page review')
  const ctx = context(input, receiptBytes)
  if (!exactKeys(plan, ['schemaVersion', 'paperId', 'binding', 'decision', 'transcriptBefore', 'transcriptAfter', 'invalidatesFrom', 'planDigest'])
    || plan.schemaVersion !== PLAN_VERSION || plan.paperId !== ctx.materialization.paperId || plan.invalidatesFrom !== 'spelling'
    || !same(plan.binding, ctx.binding)) fail('stale plan or source generation')
  const { planDigest, ...body } = plan
  if (digestJson(body) !== planDigest) fail('invalid plan digest')
  const d = plan.decision
  const regenerated = makePlan(ctx, { documentId: d?.documentId, headingItemId: d?.heading?.itemId,
    startItemId: d?.start?.itemId, endItemId: d?.end?.itemId, reason: d?.sourceReview?.reason, roles: d?.roles })
  if (!same(plan, regenerated)) fail('plan differs from the bound original source')
  const materialization = structuredClone(ctx.materialization)
  if (!['nck1-source-materialization-v11', 'nck1-source-materialization-v12'].includes(materialization.schemaVersion)) {
    materialization.schemaVersion = 'nck1-source-materialization-v10'
  }
  materialization.listeningSourceDecision = structuredClone(d)
  // Keep all existing editorial work, answer/question/timing content and unrelated
  // blockers. Only the selected, re-derived transcript and its boundary issues change.
  materialization.listening.transcript = structuredClone(plan.transcriptAfter)
  materialization.issues = materialization.issues.filter(issue => !isListeningBoundaryIssue(issue))
  const invalid = validateNck1SourceMaterialization(materialization)
    .filter(issue => issue.code !== 'MATERIALIZATION_UNRESOLVED_ISSUES')
  // Existing independent blockers (e.g. unsupported Q6 options) remain visible;
  // partial outputs are authoring artifacts, never admission/publication receipts.
  const prior = validateNck1SourceMaterialization(ctx.materialization)
  if (invalid.some(issue => !prior.some(old => old.code === issue.code && old.path === issue.path && old.message === issue.message))) {
    fail(`invalid authored materialization: ${JSON.stringify(invalid)}`)
  }
  const materializationBytes = encode(materialization)
  const imported = importCanonicalCandidate({ ...input, materializationBytes })
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  return { materialization, materializationBytes, publicReplay: {
    admitted: imported.issues.length === 0, compiled: Boolean(preview.compilation),
    issues: imported.issues, unresolvedIssues: preview.unresolvedIssues,
  } }
}
