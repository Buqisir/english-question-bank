import { digestJson, exactKeys } from './stable.mjs'

export const IN_IMAGE_OPTION_LABELS_VERSION = 'reading-in-image-option-labels-v1'
const same = (a, b) => digestJson(a) === digestJson(b)
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const digest = value => /^sha256:[a-f0-9]{64}$/u.test(value || '')
const region = value => value && exactKeys(value, ['x', 'y', 'width', 'height'])
  && Object.values(value).every(Number.isFinite) && value.x >= 0 && value.y >= 0
  && value.width > 0 && value.height > 0 && value.x + value.width <= 1 && value.y + value.height <= 1
export const regionContains = (outer, inner) => region(outer) && region(inner)
  // Match the existing OCR crop proof's normalized-coordinate rounding budget.
  && inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6
  && inner.x + inner.width <= outer.x + outer.width + 1e-6
  && inner.y + inner.height <= outer.y + outer.height + 1e-6

// Geometry locates the author's proof. It never recognizes a letter or assigns
// labels from coordinates. The OCR reader separately proves immutable ownership.
export function resolveInImageOptionLabels(raw) {
  if (!Object.hasOwn(raw, 'inImageOptionLabels')) return []
  const reject = message => { throw new Error(`In-image option labels: ${message}`) }
  if (raw.schemaVersion !== 'nck1-source-materialization-v9'
    || !Array.isArray(raw.inImageOptionLabels) || !raw.inImageOptionLabels.length) reject('requires nonempty opt-in v9 decisions')
  const consumed = new Set()
  return raw.inImageOptionLabels.map(decision => {
    if (!exactKeys(decision, ['schemaVersion', 'groupId', 'questionId', 'questionSource', 'anchorItemId',
      'parentMediaId', 'parentRegionId', 'parentSource', 'sourceDocumentSha256', 'sourceSetDigest',
      'evidenceDigest', 'confirmationDigest', 'sourceReview', 'labels'])
      || decision.schemaVersion !== IN_IMAGE_OPTION_LABELS_VERSION
      || !['groupId', 'questionId', 'anchorItemId', 'parentMediaId', 'parentRegionId'].every(key => nonempty(decision[key]))
      || !['sourceDocumentSha256', 'sourceSetDigest', 'evidenceDigest', 'confirmationDigest'].every(key => digest(decision[key]))
      || !exactKeys(decision.sourceReview, ['reviewedBy', 'labelsInParentPixels', 'reason'])
      || decision.sourceReview.reviewedBy !== 'import_agent' || decision.sourceReview.labelsInParentPixels !== true
      || !nonempty(decision.sourceReview.reason)) reject('closed decision and explicit original-image review are required')
    const groups = raw.groups.filter(group => group.groupId === decision.groupId && group.family === 'reading')
    const questions = groups[0]?.questions.filter(question => question.questionId === decision.questionId) || []
    const question = questions[0], source = decision.parentSource
    const document = raw.documents.find(document => document.documentId === source?.documentId)
    if (groups.length !== 1 || questions.length !== 1 || !same(question.source, decision.questionSource)
      || !source || !exactKeys(source, ['kind', 'documentId', 'page', 'region']) || source.kind !== 'page_region'
      || !Number.isInteger(source.page) || source.page < 1 || !region(source.region)
      || document?.role !== 'question_source' || document.mediaType !== 'application/pdf'
      || document.sha256 !== decision.sourceDocumentSha256 || source.page > document.pageCount
      || question.source.documentId !== source.documentId || question.source.page !== source.page
      || consumed.has(decision.questionId) || consumed.has(decision.parentMediaId)) reject('Reading question, PDF, parent and anchor must bind uniquely')
    consumed.add(decision.questionId)
    consumed.add(decision.parentMediaId)
    if (!Array.isArray(decision.labels) || decision.labels.length !== 4 || question.options.length !== 4) reject('requires every explicit A-D label')
    for (const [index, entry] of decision.labels.entries()) {
      const option = question.options[index]
      const children = raw.media.filter(media => media.mediaId === entry?.childMediaId)
      const child = children[0], crop = child?.extraction
      if (!exactKeys(entry, ['label', 'childMediaId', 'childSha256', 'childRegion', 'labelRegion'])
        || entry.label !== 'ABCD'[index] || option.label !== entry.label
        || option.figure?.mediaId !== entry.childMediaId || children.length !== 1
        || consumed.has(entry.childMediaId) || child.sha256 !== entry.childSha256
        || crop?.kind !== 'pdf_crop' || crop.documentId !== source.documentId || crop.page !== source.page
        || !same(crop.region, entry.childRegion) || !regionContains(source.region, entry.childRegion)
        || !regionContains(entry.childRegion, entry.labelRegion)) reject('each A-D label must identify its exact child and a label region inside that child and parent')
      consumed.add(entry.childMediaId)
    }
    return { decision, question }
  })
}
