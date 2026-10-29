// This is a binding and contradiction check, not a machine finding of absence.
// The independent import agent must inspect every source page.
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { resolveConfirmedNck1OcrEvidence } from './nck1OcrSourceEvidence.mjs'
import { prepareSourceReferenceWritingItems, sourceReferenceWritingLifecycle } from './sourceReferenceWritingTask.mjs'
import { firstLineRole, matchesLineRole } from '../../scripts/import-pipeline/ocr-line-roles.mjs'
import { computeLineFacts } from '../../scripts/import-pipeline/ocr-line-facts.mjs'
import { isSourceReferenceSampleLabel, explicitWritingHeading, applicationStanceLabel, continuationScoringLabel } from './sourceReferenceWritingRules.mjs'
import { assertSourceReferences } from './sourceReferences.mjs'

export const WHOLE_DOCUMENT_ABSENCE_KIND = 'both_writing_tasks_absent_from_whole_answer_document'
const reject = message => { throw Object.assign(new Error(`Whole answer document absence: ${message}`), { code: 'SOURCE_REFERENCES_WHOLE_ABSENCE_INVALID' }) }
const norm = text => String(text).normalize('NFKC').replace(/\s+/gu, ' ').trim()

// Builds the exact independently reviewable subject, also checking the source
// closure and known contradictions for both prepare and final admission.
export function wholeDocumentAbsenceSubject({ sidecar, materialization, sourceInput, sourceDigest, candidateDigest, requireReview = true }) {
  const claim = sidecar?.wholeDocumentWritingAbsence
  if (!['ocr-source-references-producer-v24', 'ocr-source-references-producer-v25', 'ocr-source-references-producer-v26'].includes(sidecar?.producerVersion)
    || sidecar?.alternateAnswerScope || !claim
    || claim.kind !== WHOLE_DOCUMENT_ABSENCE_KIND) reject('v24 declaration required')
  if (!sourceDigest || !candidateDigest || sidecar.sourceDigest !== sourceDigest || sidecar.candidateDigest !== candidateDigest) reject('source or candidate binding changed')
  if (requireReview) assertSourceReferences({ sidecar, materialization, sourceDigest, candidateDigest,
    sourceDocuments: sourceInput?.documents, sourceInput })
  const docs = materialization.documents
  const answers = docs.filter(doc => ['official_answers', 'question_and_answers'].includes(doc.role))
  if (answers.length !== 1 || answers[0].role !== 'official_answers' || answers[0].mediaType !== 'application/pdf') reject('requires one separate official answer PDF')
  const doc = answers[0]
  const ocr = sourceInput?.ocrSourceBytes
  if (!ocr?.evidenceBytes || !ocr?.confirmationBytes) reject('exact OCR evidence and confirmation bytes are required')
  const evidence = JSON.parse(Buffer.from(ocr.evidenceBytes).toString('utf8'))
  const confirmation = JSON.parse(Buffer.from(ocr.confirmationBytes).toString('utf8'))
  const documents = docs.map(item => ({ ...item, bytes: sourceInput.documents.find(d => d.documentId === item.documentId)?.bytes }))
  if (documents.some(item => !item.bytes || sha256(item.bytes) !== item.sha256)) reject('source document bytes changed')
  const resolved = resolveConfirmedNck1OcrEvidence({ paperId: materialization.paperId, documents, evidence, confirmation })
  if (resolved.issues.length) reject(`OCR closure invalid: ${resolved.issues[0].message}`)
  if (claim.sourceSetDigest !== evidence.sourceSetDigest || claim.evidenceSha256 !== sha256(ocr.evidenceBytes)
    || claim.confirmationSha256 !== sha256(ocr.confirmationBytes)) reject('OCR byte bindings changed')
  if (!claim.authorSessionId?.trim() || claim.authorSessionId.length > 256) reject('author session required')
  const tasks = materialization.groups.filter(group => group.writingTask)
  if (tasks.length !== 2 || new Set(tasks.map(group => group.writingTask.taskType)).size !== 2
    || !tasks.some(g => g.writingTask.taskType === 'application') || !tasks.some(g => g.writingTask.taskType === 'continuation')) reject('exactly two writing tasks required')
  const ep = evidence.documents.find(item => item.documentId === doc.documentId)?.pages
  const cp = confirmation.documents.find(item => item.documentId === doc.documentId)?.pages
  if (!ep || !cp || ep.length !== doc.pageCount || cp.length !== doc.pageCount) reject('incomplete source page inventory')
  if (cp.some(page => page.visualClassifications.some(visual => ['content_media', 'semantic_table'].includes(visual.classification)))) reject('answer source contains content media or semantic table')
  const source = prepareSourceReferenceWritingItems(materialization, evidence, confirmation, { producerVersion: sidecar.producerVersion })
  const lifecycle = sourceReferenceWritingLifecycle(source.lines, source)
  if (lifecycle.sections.size || [...source.scoringScopes.values()].some(Boolean)) reject('writing or scoring scope exists')
  const titles = tasks.flatMap(group => group.writingTask.givenSkeleton ?? []).filter(item => item.role === 'title').map(item => norm(item.text)).filter(Boolean)
  const starters = tasks.flatMap(group => group.writingTask.starters ?? []).map(text => norm(text).replace(/^Paragraph\s*[12]\s*[:：]\s*/iu, '')).filter(Boolean)
  for (const page of cp) {
    const observations = new Map(ep[page.page - 1].observations.map(item => [item.observationId, item]))
    const texts = [...page.orderedItems.map(item => item.text),
      ...page.furnitureObservationIds.map(id => observations.get(id)?.text ?? '')]
    for (const text of texts.flatMap(value => [value, ...value.split(/\r?\n/u)])) {
      const facts = computeLineFacts({ text })
      const normalized = norm(text)
      if (isSourceReferenceSampleLabel(text, sidecar.producerVersion) || explicitWritingHeading(text, sidecar.producerVersion)
        || firstLineRole('writing-section', facts, { producerVersion: sidecar.producerVersion })
        || firstLineRole('scoring-section', facts, { producerVersion: sidecar.producerVersion })
        || firstLineRole('scoring-overview', facts, { producerVersion: sidecar.producerVersion })
        || matchesLineRole('entry.scoring-label', facts, { producerVersion: sidecar.producerVersion })
        || matchesLineRole('entry.arabic-numbered', facts)
        || applicationStanceLabel(text, 'application') || continuationScoringLabel(text, 'continuation')
        || matchesLineRole('entry.scoring-label', computeLineFacts({ text: normalized.replace(/^\(\s*\d+\s*\)\s*/u, '') }),
          { producerVersion: sidecar.producerVersion })
        || matchesLineRole('writing.part', facts) || matchesLineRole('writing.bare-fourth-part', facts)
        || matchesLineRole('writing.continuation-prompt', facts)
        || matchesLineRole('paragraph.salutation', facts) || matchesLineRole('paragraph.numbered', facts)
        || /^Dear\s+\p{L}/iu.test(normalized)
        || titles.some(title => normalized === title)
        || starters.some(starter => normalized.includes(starter)
          || (starter.length >= 24 && normalized.includes(starter.slice(0, 24))))) reject(`writing contradiction on page ${page.page}`)
    }
  }
  const pages = ep.map(page => ({ documentId: doc.documentId, page: page.page, rasterSha256: page.raster.sha256 }))
  for (const owner of tasks) {
    const group = sidecar.groups.find(g => g.groupId === owner.groupId && g.taskType === owner.writingTask.taskType)
    if (!group || sidecar.groups.length !== 2) reject('group binding changed')
    for (const kind of ['essays', 'scoring']) {
      const section = group[kind]
      const expected = pages.map(page => ({ documentSha256: doc.sha256, locator: { kind: 'page_region',
        documentId: doc.documentId, page: page.page, region: { x: 0, y: 0, width: 1, height: 1 } } }))
      if (section?.state !== 'not_supplied' || section.entries.length || digestJson(section.evidence) !== digestJson(expected)) reject('all four sections require exact full-page evidence')
    }
  }
  const inventory = [{ documentId: doc.documentId, role: doc.role, mediaType: doc.mediaType,
    sha256: doc.sha256, pageCount: doc.pageCount, pages }]
  const subject = { producerVersion: sidecar.producerVersion, paperId: sidecar.paperId,
    sourceDigest: sidecar.sourceDigest, candidateDigest: sidecar.candidateDigest,
    materializationDigest: sidecar.materializationDigest, groups: sidecar.groups,
    kind: claim.kind, sourceSetDigest: claim.sourceSetDigest, evidenceSha256: claim.evidenceSha256,
    confirmationSha256: claim.confirmationSha256, authorSessionId: claim.authorSessionId, inventory }
  if (sidecar.paperId !== materialization.paperId || sidecar.materializationDigest !== digestJson(materialization)) reject('materialization binding changed')
  if (requireReview) {
    const review = claim.review
    if (!review || review.reviewedBy !== 'import_agent' || review.verdict !== 'confirmed_absent'
      || !review.reviewerSessionId?.trim() || review.reviewerSessionId === claim.authorSessionId
      || review.reviewedSubjectDigest !== digestJson(subject) || !Array.isArray(review.pages)
      || review.pages.length !== pages.length || review.pages.some((page, index) =>
        page.documentId !== pages[index].documentId || page.page !== pages[index].page
        || page.rasterSha256 !== pages[index].rasterSha256 || !page.finding?.trim())) reject('independent review or page binding is incomplete')
  }
  return { subject, subjectDigest: digestJson(subject), lifecycle }
}
