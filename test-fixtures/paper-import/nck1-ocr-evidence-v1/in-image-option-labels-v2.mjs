import { digestJson, sha256 } from '../../../shared/paper-canonical/stable.mjs'

// Synthetic geometry only. This helper never renders a PDF or claims raster
// replay. Heavy fixtures supply independently produced source bytes/descriptors.
export function bindInImageOptionLabelsV2({ raw, selection, evidence, confirmation, pageWidthPt, pageHeightPt }) {
  const question = raw.groups.find(group => group.groupId === selection.groupId).questions
    .find(question => question.questionId === selection.questionId)
  const document = raw.documents.find(document => document.documentId === selection.parentSource.documentId)
  const decision = {
    schemaVersion: 'reading-in-image-option-labels-v2', groupId: selection.groupId, questionId: selection.questionId,
    questionSource: structuredClone(question.source), anchorItemId: selection.anchorItemId,
    parentMediaId: selection.parentMediaId, parentRegionId: selection.parentRegionId,
    parentSource: structuredClone(selection.parentSource), sourceDocumentSha256: document.sha256,
    sourceSetDigest: evidence.sourceSetDigest, evidenceDigest: evidence.evidenceDigest,
    confirmationDigest: digestJson(confirmation), sourceReview: structuredClone(selection.sourceReview),
    layout: selection.layout, itemOwnership: structuredClone(selection.itemOwnership),
    sharedFigure: structuredClone(selection.sharedFigure), labels: structuredClone(selection.labels),
  }
  const measurementEvidenceBody = {
    schemaVersion: 'reading-source-layout-measurement-v2', questionId: question.questionId,
    sourcePdfSha256: document.sha256, sourcePage: question.source.page, pageWidthPt, pageHeightPt,
    coordinateSystem: 'question_page_top_left_pt',
    labels: selection.labels.map(({ label, labelRegion: r }) => ({
      label, leftPt: r.x * pageWidthPt, topPt: r.y * pageHeightPt,
      widthPt: r.width * pageWidthPt, heightPt: r.height * pageHeightPt,
    })),
    images: selection.labels.map(entry => ({ mediaId: entry.childMediaId, sha256: entry.childSha256 })),
    labelEvidence: { kind: 'confirmed_in_image_option_labels_v2', decisionDigest: digestJson(decision),
      pageRasterDigest: selection.sourceReview.reviewedPageRasterDigest },
  }
  const left = Math.min(...selection.labels.map(entry => entry.childRegion.x * pageWidthPt),
    ...measurementEvidenceBody.labels.map(label => label.leftPt))
  const top = Math.min(...selection.labels.map(entry => entry.childRegion.y * pageHeightPt))
  const placements = selection.labels.map((entry, i) => {
    const r = entry.childRegion, label = measurementEvidenceBody.labels[i]
    return { optionId: `option:${question.questionId}:${entry.label}`, label: entry.label,
      sourceSpanId: `source-span:synthetic-grid:${entry.label}`,
      sourcePlacementMatrix: [r.width * pageWidthPt, 0, 0, -r.height * pageHeightPt,
        r.x * pageWidthPt, (r.y + r.height) * pageHeightPt],
      labelLeftPt: label.leftPt - left, labelTopPt: label.topPt - top,
      imageLeftPt: r.x * pageWidthPt - left, imageTopPt: r.y * pageHeightPt - top,
      imageWidthPt: r.width * pageWidthPt, imageHeightPt: r.height * pageHeightPt }
  })
  const intent = {
    schemaVersion: 'reading-option-figure-source-layout-intent-v1', questionId: question.questionId,
    sourcePage: question.source.page, coordinateSystem: 'question_content_box_pt',
    measurementEvidence: { kind: 'digest_bound_external_evidence',
      evidenceSchemaVersion: measurementEvidenceBody.schemaVersion, evidenceDigest: digestJson(measurementEvidenceBody),
      sourceDocumentSha256: document.sha256 },
    rowStartPt: 0,
    rowWidthPt: Math.max(...placements.map(p => p.imageLeftPt + p.imageWidthPt)),
    bankHeightPt: Math.max(...placements.map(p => p.imageTopPt + p.imageHeightPt)),
    // Labels already live inside image pixels. Keep existing intent semantics;
    // zero-size additional labels avoid introducing a second visible A-D set.
    labelFontSizePt: 0, labelLineHeightPt: 0, stemToBankGapPt: 4.5, questionTailGapPt: 9, placements,
  }
  intent.intentDigest = digestJson(intent)
  question.figureLayout = { intent, measurementEvidenceBody }
  return decision
}

export function makeInImageOptionLabelsV2ShapeFixture({ shared = false } = {}) {
  const digest = `sha256:${'a'.repeat(64)}`
  const parentSource = { kind: 'page_region', documentId: 'question-source', page: 1,
    region: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 } }
  const regions = [{ x: .1, y: .2, width: .35, height: .2 }, { x: .5, y: .2, width: .35, height: .2 },
    { x: .1, y: .4, width: .35, height: .2 }, { x: .5, y: .4, width: .35, height: .2 }]
  const media = regions.map((region, i) => ({
    mediaId: `child-${'ABCD'[i]}`, sha256: digest, kind: 'figure', usage: 'content',
    extraction: { kind: 'pdf_crop', documentId: 'question-source', page: 1, density: 144, region },
    publication: { selection: 'source_crop', sourceSha256: digest },
  }))
  const question = { questionId: 'question-grid', source: { ...parentSource, region: { x: .1, y: .1, width: .8, height: .05 } },
    options: media.map((m, i) => ({ label: 'ABCD'[i], figure: { mediaId: m.mediaId } })) }
  const raster = { recipe: { kind: 'pdf_page_region_v1', density: 144, region: { x: 0, y: 0, width: 1, height: 1 } },
    sha256: digest, pixelWidth: 1200, pixelHeight: 1600 }
  const observations = [{ observationId: 'word-bubble', region: { x: .6, y: .5, width: .1, height: .02 } },
    { observationId: 'word-c', region: { x: .11, y: .42, width: .02, height: .02 } },
    { observationId: 'word-d', region: { x: .51, y: .42, width: .02, height: .02 } }]
  const confirmation = { schemaVersion: 'nck1-ocr-source-confirmation-v3', confirmed: true, paperId: 'paper-grid',
    sourceSetDigest: digest, evidenceDigest: digest, documents: [{ documentId: 'question-source', pages: [{
      page: 1, orderedItems: [{ itemId: 'item-spanning-c-d', text: 'Bubble C. D.', observationIds: observations.map(o => o.observationId) }],
      visualClassifications: [{ regionId: 'parent-region', classification: 'content_media', afterItemId: 'anchor',
        itemIds: ['item-spanning-c-d'] }],
    }] }] }
  const evidence = { paperId: 'paper-grid', sourceSetDigest: digest, evidenceDigest: digest,
    documents: [{ documentId: 'question-source', pages: [{ page: 1, raster, observations,
      regions: [{ regionId: 'parent-region', region: parentSource.region }] }] }] }
  const selection = { schemaVersion: 'reading-in-image-option-labels-selection-v2',
    groupId: 'group-grid', questionId: question.questionId, parentMediaId: 'parent-media', parentRegionId: 'parent-region',
    parentSource, anchorItemId: 'anchor', layout: 'grid_2x2_row_major', sharedFigure: null,
    labels: media.map((m, i) => ({ label: 'ABCD'[i], childMediaId: m.mediaId, childSha256: m.sha256,
      childRegion: m.extraction.region, labelRegion: { ...observations[i === 2 ? 1 : 2].region,
        x: m.extraction.region.x, y: m.extraction.region.y } })),
    itemOwnership: [{ itemId: 'item-spanning-c-d', text: 'Bubble C. D.', fragments: [
      { start: 0, end: 7, observationIds: ['word-bubble'], target: { kind: 'option', label: 'D' } },
      { start: 7, end: 10, observationIds: ['word-c'], target: { kind: 'option', label: 'C' } },
      { start: 10, end: 12, observationIds: ['word-d'], target: { kind: 'option', label: 'D' } },
    ] }],
    reason: 'Synthetic structural review; no raster admission is claimed.',
    sourceReview: { reviewedBy: 'import_agent', labelsInParentPixels: true, allParentContentRetained: true,
      noOrdinaryProseConsumed: true, reviewedPageRasterDigest: digestJson(raster),
      reason: 'Synthetic structural review; no raster admission is claimed.' },
  }
  if (shared) {
    const region = { x: .1, y: .65, width: .7, height: .1 }
    media.push({ ...structuredClone(media[0]), mediaId: 'shared-legend', extraction: { ...media[0].extraction, region } })
    selection.sharedFigure = { role: 'legend', mediaId: 'shared-legend', sha256: digest, region, blockId: 'shared-block' }
    selection.sourceReview.sharedContextForAllOptions = true
    question.stemFigures = [{ kind: 'figure', blockId: 'shared-block', mediaId: 'shared-legend', caption: '',
      source: { ...parentSource, region } }]
  }
  const raw = { schemaVersion: 'nck1-source-materialization-v13', paperId: 'paper-grid',
    documents: [{ documentId: 'question-source', role: 'question_source', mediaType: 'application/pdf', sha256: digest, pageCount: 1 }],
    groups: [{ groupId: 'group-grid', family: 'reading', questions: [question] }], media }
  const decision = bindInImageOptionLabelsV2({ raw, selection, evidence, confirmation, pageWidthPt: 600, pageHeightPt: 800 })
  raw.inImageOptionLabels = [decision]
  return { raw, decision, selection, question, evidence, confirmation }
}

// Bytes are deliberately NOT PDFs/images. Use only with native plan (which is
// structural); never pass this fixture to apply/admission/raster consumers.
export function makeInImageOptionLabelsV2PlanFixture(options) {
  const fixture = makeInImageOptionLabelsV2ShapeFixture(options)
  const documents = [{ documentId: fixture.raw.documents[0].documentId,
    bytes: Buffer.from('synthetic source identity; not a PDF') }]
  fixture.raw.documents[0].sha256 = sha256(documents[0].bytes)
  const media = fixture.raw.media.map(m => {
    const bytes = Buffer.from(`synthetic media identity ${m.mediaId}; not an image`)
    m.sha256 = m.publication.sourceSha256 = sha256(bytes)
    const label = fixture.selection.labels.find(label => label.childMediaId === m.mediaId)
    if (label) label.childSha256 = m.sha256
    if (fixture.selection.sharedFigure?.mediaId === m.mediaId) fixture.selection.sharedFigure.sha256 = m.sha256
    return { mediaId: m.mediaId, bytes }
  })
  fixture.decision = bindInImageOptionLabelsV2({ ...fixture, raw: fixture.raw, pageWidthPt: 600, pageHeightPt: 800 })
  delete fixture.raw.inImageOptionLabels
  fixture.input = { kind: 'nck1-source-materialization', materializationBytes: Buffer.from(JSON.stringify(fixture.raw)),
    documents, media, ocrSourceBytes: {
      evidenceBytes: Buffer.from(JSON.stringify(fixture.evidence)), confirmationBytes: Buffer.from(JSON.stringify(fixture.confirmation)),
    } }
  return fixture
}
