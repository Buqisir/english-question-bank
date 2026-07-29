import rendererTypography from '../../standards/paper-canonical/rendering/paper-typography-v3.json' with { type: 'json' }

const contract = rendererTypography.readingPassageLetters

export const readingPassageLetterBySlotId = Object.freeze(
  Object.fromEntries(
    contract.slotIdentity.map(({ slotId, letter }) => [slotId, letter]),
  ),
)

const geometryByPrecedingKind = Object.freeze({
  reading_heading: Object.freeze(contract.precedingGeometry.readingHeading),
  prior_content: Object.freeze(contract.precedingGeometry.priorContent),
})

const precedingKindByConsumerAndLetter = Object.freeze(
  Object.fromEntries(
    contract.slotIdentity.map(({ letter, precedingKindByConsumer }) => [
      letter,
      Object.freeze({ ...precedingKindByConsumer }),
    ]),
  ),
)

export function readingPassageLetterGeometryForLetter(letter, consumerId) {
  const precedingKind =
    precedingKindByConsumerAndLetter[letter]?.[consumerId]
  const geometry = geometryByPrecedingKind[precedingKind]
  if (!geometry) {
    const error = new Error(
      `Unsupported canonical Reading passage-letter geometry ${consumerId}:${letter}`,
    )
    error.code = 'CANONICAL_READING_COMPANION_REJECTED'
    throw error
  }
  return Object.freeze({
    precedingKind,
    ...geometry,
  })
}

export function assertCanonicalReadingCompanion({ blocks, passageLetter }) {
  if ((blocks !== undefined) !== (passageLetter !== undefined)) {
    const error = new Error(
      'Canonical Reading blocks and passage letter must be provided together',
    )
    error.code = 'CANONICAL_READING_COMPANION_REJECTED'
    throw error
  }
}

export const readingPassageLetterTypography = Object.freeze({
  horizontalPlacement: contract.horizontalPlacement,
  fontSizePt: contract.fontSizePt,
  lineHeightPt: contract.lineHeightPt,
  fontWeight: contract.fontWeight,
  marginBeforePt: contract.marginBeforePt,
  marginAfterPt: contract.marginAfterPt,
  precedingGeometry: Object.freeze({
    normalizationRule: contract.precedingGeometry.normalizationRule,
    readingHeading: geometryByPrecedingKind.reading_heading,
    priorContent: geometryByPrecedingKind.prior_content,
  }),
  followingGeometry: Object.freeze({ ...contract.followingGeometry }),
  referenceMeasurement: Object.freeze({ ...contract.referenceMeasurement }),
})
