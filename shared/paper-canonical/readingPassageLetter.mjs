import rendererTypography from '../../standards/paper-canonical/rendering/paper-typography-v3.json' with { type: 'json' }

const contract = rendererTypography.readingPassageLetters

export const readingPassageLetterBySlotId = Object.freeze(
  Object.fromEntries(
    contract.slotIdentity.map(({ slotId, letter }) => [slotId, letter]),
  ),
)

export const readingPassageLetterTypography = Object.freeze({
  horizontalPlacement: contract.horizontalPlacement,
  fontSizePt: contract.fontSizePt,
  lineHeightPt: contract.lineHeightPt,
  fontWeight: contract.fontWeight,
  marginBeforePt: contract.marginBeforePt,
  marginAfterPt: contract.marginAfterPt,
  referenceMeasurement: Object.freeze({ ...contract.referenceMeasurement }),
})
