import measurementV2Schema from '../../schemas/paper-canonical/reading-source-layout-measurement-v2.schema.json' with { type: 'json' }
import intentSchema from '../../schemas/paper-canonical/reading-option-figure-source-layout-intent-v1.schema.json' with { type: 'json' }
import measurementSchema from '../../schemas/paper-canonical/reading-source-layout-measurement-v1.schema.json' with { type: 'json' }
import { validateJsonSchema } from './authority.mjs'
import { digestJson, exactKeys, withoutKey } from './stable.mjs'


// Structural binding only. The adapter must still replay PDF metadata, crops,
// and the complete sealed OCR generation before consuming its private pending.
export function validateInImageLabelMeasurementBinding(layout, decision) {
  const m = layout?.measurementEvidenceBody
  const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.01
  if (decision?.schemaVersion !== 'reading-in-image-option-labels-v2'
    || m?.schemaVersion !== 'reading-source-layout-measurement-v2'
    || m.questionId !== decision.questionId || m.sourcePage !== decision.parentSource?.page
    || m.sourcePdfSha256 !== decision.sourceDocumentSha256
    || m.labelEvidence?.decisionDigest !== digestJson(decision)
    || m.labelEvidence.pageRasterDigest !== decision.sourceReview?.reviewedPageRasterDigest
    || !Array.isArray(decision.labels) || decision.labels.length !== 4
    || !Array.isArray(m.labels) || m.labels.length !== 4 || !Array.isArray(m.images) || m.images.length !== 4) return false
  return decision.labels.every((entry, i) => {
    const label = m.labels[i], image = m.images[i], region = entry.labelRegion
    return entry.label === 'ABCD'[i] && label?.label === entry.label
      && image?.mediaId === entry.childMediaId && image.sha256 === entry.childSha256
      && close(label.leftPt, region?.x * m.pageWidthPt) && close(label.topPt, region?.y * m.pageHeightPt)
      && close(label.widthPt, region?.width * m.pageWidthPt) && close(label.heightPt, region?.height * m.pageHeightPt)
  })
}
// This is source evidence, not a per-paper CSS override. Both consumers receive
// the same checked geometry through the canonical Question and its digest.
export function validateReadingFigureLayout(layout, questionId, options, sourceSha256, source, media, { allowInImageLabelMeasurement = false } = {}) {
  const intent = layout?.intent
  const measurement = layout?.measurementEvidenceBody
  const v2 = measurement?.schemaVersion === 'reading-source-layout-measurement-v2'
  if (v2 && (!allowInImageLabelMeasurement
    || !exactKeys(measurement, measurementV2Schema.required)
    || !exactKeys(measurement.labelEvidence, ['kind', 'decisionDigest', 'pageRasterDigest'])
    || measurement.labelEvidence.kind !== 'confirmed_in_image_option_labels_v2'
    || ![measurement.labelEvidence.decisionDigest, measurement.labelEvidence.pageRasterDigest]
      .every(value => /^sha256:[a-f0-9]{64}$/u.test(value || '')))) return false
  if (!exactKeys(layout, ['intent', 'measurementEvidenceBody'])
    || validateJsonSchema(intent, intentSchema).length
    || intent.intentDigest !== digestJson(withoutKey(intent, 'intentDigest'))
    || intent.questionId !== questionId
    || !Array.isArray(options) || options.length !== 4
    || options.some((option, index) => !option?.figure || option.label !== 'ABCD'[index])
    || validateJsonSchema(measurement, v2 ? measurementV2Schema : measurementSchema).length
    || measurement.labels.length !== 4 || measurement.images.length !== 4
    || measurement.pageWidthPt <= 0 || measurement.pageHeightPt <= 0
    || !/^sha256:[a-f0-9]{64}$/.test(measurement.sourcePdfSha256)
    || measurement.images.some((image) => !image.mediaId || !/^sha256:[a-f0-9]{64}$/.test(image.sha256))
    || measurement.labels.some((label) => label.widthPt <= 0 || label.heightPt <= 0)
    || measurement.questionId !== questionId
    || measurement.sourcePage !== intent.sourcePage
    || measurement.schemaVersion !== intent.measurementEvidence.evidenceSchemaVersion
    || digestJson(measurement) !== intent.measurementEvidence.evidenceDigest
    || measurement.sourcePdfSha256 !== intent.measurementEvidence.sourceDocumentSha256
    || (sourceSha256 && measurement.sourcePdfSha256 !== sourceSha256)
    || intent.placements.length !== 4
    || (source && (source.kind !== 'page_region' || source.page !== intent.sourcePage))) return false
  const boxes = intent.placements.map((placement) => {
    const [a, b, c, d, e, f] = placement.sourcePlacementMatrix
    // PDF image placements are measured in source page top-left coordinates.
    if (placement.sourcePlacementMatrix.length !== 6 || b !== 0 || c !== 0 || a <= 0 || d >= 0) return null
    return { x: Math.min(e, e + a), y: Math.min(f, f + d), width: Math.abs(a), height: Math.abs(d) }
  })
  if (boxes.some((box) => !box)) return false
  const top = Math.min(...boxes.map((box) => box.y))
  // V2 labels lie inside complete crops; any crop (including C) may extend
  // left of A's label. Both images and labels use the same enclosing origin.
  const left = v2
    ? Math.min(...boxes.map((box) => box.x), ...measurement.labels.map((label) => label.leftPt))
    : measurement.labels[0]?.leftPt
  const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.01
  return intent.placements.every((placement, index) => {
    const label = measurement.labels[index]
    const box = boxes[index]
    const image = measurement.images[index]
    if (media) {
      const captured = media.find((item) => item?.mediaId === image.mediaId)
      const crop = captured?.extraction
      if (captured?.sha256 !== image.sha256 || crop?.kind !== 'pdf_crop'
        || crop.documentId !== source?.documentId || crop.page !== intent.sourcePage
        || !close(crop.region?.x * measurement.pageWidthPt, box.x)
        || !close(crop.region?.y * measurement.pageHeightPt, box.y)
        || !close(crop.region?.width * measurement.pageWidthPt, box.width)
        || !close(crop.region?.height * measurement.pageHeightPt, box.height)) return false
    }
    return placement.optionId === (options[index].optionId || `option:${questionId}:${options[index].label}`)
      && options[index].figure.mediaId === image.mediaId
      && placement.label === options[index].label && label.label === placement.label
      && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0
      && box.x + box.width <= measurement.pageWidthPt
      && box.y + box.height <= measurement.pageHeightPt
      && label.leftPt + label.widthPt <= measurement.pageWidthPt
      && label.topPt + label.heightPt <= measurement.pageHeightPt
      && close(placement.imageLeftPt, box.x - left)
      && close(placement.imageTopPt, box.y - top)
      && close(placement.imageWidthPt, box.width)
      && close(placement.imageHeightPt, box.height)
      && close(placement.labelLeftPt, label.leftPt - left)
      && close(placement.labelTopPt, label.topPt - top)
      && placement.imageLeftPt + box.width <= intent.rowWidthPt + 0.01
      && placement.imageTopPt + box.height <= intent.bankHeightPt + 0.01
      && placement.labelTopPt + intent.labelLineHeightPt <= intent.bankHeightPt + 0.01
  })
}
