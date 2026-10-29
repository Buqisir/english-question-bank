import { validateReadingFigureLayout, validateInImageLabelMeasurementBinding } from './readingFigureLayout.mjs'
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
  if (!['nck1-source-materialization-v9', 'nck1-source-materialization-v10', 'nck1-source-materialization-v11', 'nck1-source-materialization-v12', 'nck1-source-materialization-v13'].includes(raw.schemaVersion)
    || !Array.isArray(raw.inImageOptionLabels) || !raw.inImageOptionLabels.length) reject('requires nonempty opt-in v9 decisions')
  const consumed = new Set()
  return raw.inImageOptionLabels.map(decision => {
    const v2 = decision?.schemaVersion === IN_IMAGE_OPTION_LABELS_VERSION_V2
    if (!exactKeys(decision, ['schemaVersion', 'groupId', 'questionId', 'questionSource', 'anchorItemId',
      'parentMediaId', 'parentRegionId', 'parentSource', 'sourceDocumentSha256', 'sourceSetDigest',
      'evidenceDigest', 'confirmationDigest', 'sourceReview', 'labels', ...(v2 ? ['layout', 'itemOwnership', 'sharedFigure'] : [])])
      || !(decision.schemaVersion === IN_IMAGE_OPTION_LABELS_VERSION || (v2 && raw.schemaVersion === 'nck1-source-materialization-v13'))
      || !['groupId', 'questionId', 'anchorItemId', 'parentMediaId', 'parentRegionId'].every(key => nonempty(decision[key]))
      || !['sourceDocumentSha256', 'sourceSetDigest', 'evidenceDigest', 'confirmationDigest'].every(key => digest(decision[key]))
      || !exactKeys(decision.sourceReview, ['reviewedBy', 'labelsInParentPixels', 'reason', ...(v2 ? ['allParentContentRetained', 'noOrdinaryProseConsumed', 'reviewedPageRasterDigest', ...(decision.sharedFigure !== null ? ['sharedContextForAllOptions'] : [])] : [])])
      || decision.sourceReview.reviewedBy !== 'import_agent' || decision.sourceReview.labelsInParentPixels !== true
      || (v2 && (decision.sourceReview.allParentContentRetained !== true || decision.sourceReview.noOrdinaryProseConsumed !== true || !digest(decision.sourceReview.reviewedPageRasterDigest)
        || (decision.sharedFigure !== null && decision.sourceReview.sharedContextForAllOptions !== true)))
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
    if (v2) validateV2(decision, question, raw, consumed)
    return { decision, question }
  })
}

export const IN_IMAGE_OPTION_LABELS_VERSION_V2 = 'reading-in-image-option-labels-v2'
const rejectV2 = message => { throw new Error(`In-image option labels v2: ${message}`) }
const overlaps = (a, b) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x)
  && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
const splitsSurrogate = (text, offset) => offset > 0 && offset < text.length
  && /[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset])

function validateV2(decision, question, raw, consumed) {
  if (decision.layout !== 'grid_2x2_row_major' || !Array.isArray(decision.itemOwnership)
    || !Object.hasOwn(decision, 'sharedFigure')) rejectV2('closed 2x2 layout and complete item ownership are required')
  const regions = decision.labels.map(label => label.childRegion)
  const [a, b, c, d] = regions
  const row = (left, right) => Math.max(left.y, right.y) < Math.min(left.y + left.height, right.y + right.height)
    && left.x + left.width <= right.x
  const column = (top, bottom) => Math.max(top.x, bottom.x) < Math.min(top.x + top.width, bottom.x + bottom.width)
  if (!row(a, b) || !row(c, d) || !column(a, c) || !column(b, d)
    || Math.max(a.y + a.height, b.y + b.height) > Math.min(c.y, d.y)) rejectV2('explicit A/B above C/D must form disjoint aligned rows and columns')
  const children = decision.labels.map(label => raw.media.find(media => media.mediaId === label.childMediaId))
  const shared = decision.sharedFigure
  if (shared !== null) {
    const media = raw.media.filter(media => media.mediaId === shared?.mediaId)
    const crop = media[0]?.extraction
    const source = { kind: 'page_region', documentId: decision.parentSource.documentId,
      page: decision.parentSource.page, region: shared?.region }
    if (!exactKeys(shared, ['role', 'mediaId', 'sha256', 'region', 'blockId'])
      || !['legend', 'stem_image'].includes(shared.role) || !nonempty(shared.blockId)
      || !digest(shared.sha256) || media.length !== 1 || media[0].sha256 !== shared.sha256
      || crop?.kind !== 'pdf_crop' || crop.documentId !== source.documentId || crop.page !== source.page
      || !same(crop.region, shared.region) || !regionContains(decision.parentSource.region, shared.region)
      || consumed.has(shared.mediaId) || regions.some(region => overlaps(region, shared.region))
      || !same(question.stemFigures, [{ kind: 'figure', blockId: shared.blockId,
        mediaId: shared.mediaId, caption: '', source }])) rejectV2('shared context must be one disjoint source crop actually displayed once as this question stem figure')
    consumed.add(shared.mediaId)
    children.push(media[0])
  } else if (question.stemFigures) rejectV2('unproved stem figures cannot accompany this image bank')
  if (children.some(media => media?.kind !== 'figure' || media.usage !== 'content'
    || media.publication?.selection !== 'source_crop' || media.publication.sourceSha256 !== media.sha256)) {
    rejectV2('only original source_crop media may retain option and shared image content')
  }
  if (!validateReadingFigureLayout(question.figureLayout, question.questionId, question.options,
    decision.sourceDocumentSha256, question.source, raw.media, { allowInImageLabelMeasurement: true })
    || !validateInImageLabelMeasurementBinding(question.figureLayout, decision)) rejectV2('source-bound measured figureLayout is required')
  const ids = new Set()
  for (const item of decision.itemOwnership) {
    if (!exactKeys(item, ['itemId', 'text', 'fragments']) || !nonempty(item.itemId) || ids.has(item.itemId)
      || typeof item.text !== 'string' || !item.text.length || !Array.isArray(item.fragments) || !item.fragments.length) {
      rejectV2('each sealed item needs its complete confirmed text and fragments')
    }
    ids.add(item.itemId)
    let cursor = 0
    const observations = new Set()
    for (const fragment of item.fragments) {
      const target = fragment?.target
      if (!exactKeys(fragment, ['start', 'end', 'observationIds', 'target'])
        || !Number.isInteger(fragment.start) || !Number.isInteger(fragment.end)
        || fragment.start !== cursor || fragment.end <= cursor || fragment.end > item.text.length
        || splitsSurrogate(item.text, fragment.start) || splitsSurrogate(item.text, fragment.end)
        || !Array.isArray(fragment.observationIds) || !fragment.observationIds.length
        || fragment.observationIds.some(id => !nonempty(id) || observations.has(id))
        || new Set(fragment.observationIds).size !== fragment.observationIds.length
        || !(target?.kind === 'option' ? exactKeys(target, ['kind', 'label']) && ['A', 'B', 'C', 'D'].includes(target.label)
          : target?.kind === 'shared' && exactKeys(target, ['kind', 'mediaId']) && shared !== null && target.mediaId === shared.mediaId)) {
        rejectV2('fragments must partition every UTF-16 unit and observation exactly once with an explicit retained target')
      }
      fragment.observationIds.forEach(id => observations.add(id))
      cursor = fragment.end
    }
    if (cursor !== item.text.length) rejectV2('fragments must retain the entire confirmed text including whitespace')
  }
}

// Shared by native planning and the full adapter. This validates sealed source
// identities and regions, never equates raw OCR words with confirmed text.
export function verifyInImageOptionLabelsV2Ownership(decision, confirmation, evidence) {
  const source = decision.parentSource
  const pages = confirmation.documents?.filter(document => document.documentId === source.documentId)
    .flatMap(document => document.pages.filter(page => page.page === source.page)) || []
  const evidencePages = evidence.documents?.filter(document => document.documentId === source.documentId)
    .flatMap(document => document.pages.filter(page => page.page === source.page)) || []
  const page = pages[0], observed = evidencePages[0]
  const visuals = page?.visualClassifications.filter(visual => visual.regionId === decision.parentRegionId) || []
  const visual = visuals[0]
  const parents = observed?.regions.filter(region => region.regionId === decision.parentRegionId) || []
  if (pages.length !== 1 || evidencePages.length !== 1 || visuals.length !== 1 || parents.length !== 1
    || visual.classification !== 'content_media' || visual.afterItemId !== decision.anchorItemId
    || !same(parents[0].region, source.region)
    || decision.sourceSetDigest !== evidence.sourceSetDigest || decision.evidenceDigest !== evidence.evidenceDigest
    || decision.confirmationDigest !== digestJson(confirmation)
    || !same(decision.itemOwnership.map(item => item.itemId), visual.itemIds)) rejectV2('ownership must bind the exact sealed parent, anchor, generation and ordered item IDs')
  const targets = decision.labels.map(label => ({ kind: 'option', label: label.label, region: label.childRegion }))
  if (decision.sharedFigure) targets.push({ kind: 'shared', mediaId: decision.sharedFigure.mediaId, region: decision.sharedFigure.region })
  if (decision.sourceReview.reviewedPageRasterDigest !== digestJson(observed.raster)) {
    rejectV2('source review must acknowledge the exact sealed RGBA raster descriptor')
  }
  const seen = new Set()
  for (const ownership of decision.itemOwnership) {
    const items = page.orderedItems.filter(item => item.itemId === ownership.itemId)
    const item = items[0]
    const ids = ownership.fragments.flatMap(fragment => fragment.observationIds)
    if (items.length !== 1 || ownership.text !== item.text || !same(ids, item.observationIds)) {
      rejectV2('ownership must retain exact confirmed text and the ordered observation partition')
    }
    for (const fragment of ownership.fragments) {
      const target = targets.find(target => target.kind === fragment.target.kind
        && (target.kind === 'option' ? target.label === fragment.target.label : target.mediaId === fragment.target.mediaId))
      for (const id of fragment.observationIds) {
        const matches = observed.observations.filter(observation => observation.observationId === id)
        const observation = matches[0]
        if (seen.has(id) || matches.length !== 1 || !target
          || !regionContains(target.region, observation.region)
          || targets.filter(value => regionContains(value.region, observation.region)).length !== 1) {
          rejectV2('every observation must belong exactly once and wholly to its declared child/shared crop')
        }
        seen.add(id)
      }
    }
  }
}
