import intentSchema from '../../schemas/paper-canonical/reading-option-figure-source-layout-intent-v1.schema.json' with { type: 'json' }
import measurementSchema from '../../schemas/paper-canonical/reading-source-layout-measurement-v1.schema.json' with { type: 'json' }
import { validateJsonSchema } from './authority.mjs'
import { digestJson, exactKeys, withoutKey } from './stable.mjs'

// This is source evidence, not a per-paper CSS override. Both consumers receive
// the same checked geometry through the canonical Question and its digest.
export function validateReadingFigureLayout(layout, questionId, options, sourceSha256, source, media) {
  const intent = layout?.intent
  const measurement = layout?.measurementEvidenceBody
  if (!exactKeys(layout, ['intent', 'measurementEvidenceBody'])
    || validateJsonSchema(intent, intentSchema).length
    || intent.intentDigest !== digestJson(withoutKey(intent, 'intentDigest'))
    || intent.questionId !== questionId
    || !Array.isArray(options) || options.length !== 4
    || options.some((option, index) => !option?.figure || option.label !== 'ABCD'[index])
    || validateJsonSchema(measurement, measurementSchema).length
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
  const left = measurement.labels[0]?.leftPt
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
