import rendererTypography from '../../standards/paper-canonical/rendering/paper-typography-v6.json' with { type: 'json' }

const contract = rendererTypography.readingPassageLetters

export const readingPassageLetterBySlotId = Object.freeze(
  Object.fromEntries(
    contract.slotIdentity.map(({ slotId, letter }) => [slotId, letter]),
  ),
)

const geometryByPrecedingKind = Object.freeze({
  reading_heading: Object.freeze(contract.precedingGeometry.readingHeading),
  prior_question_tail: Object.freeze(
    contract.precedingGeometry.priorQuestionTail,
  ),
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
    priorQuestionTail: geometryByPrecedingKind.prior_question_tail,
  }),
  followingGeometry: Object.freeze({ ...contract.followingGeometry }),
  verticalRhythm: Object.freeze({
    semanticRoleClasses: Object.freeze(
      Object.fromEntries(
        Object.entries(contract.verticalRhythm.semanticRoleClasses).map(
          ([className, roles]) => [className, Object.freeze([...roles])],
        ),
      ),
    ),
    adjacencyGraph: Object.freeze(
      contract.verticalRhythm.adjacencyGraph.map((edge) =>
        Object.freeze({
          ...edge,
          ...(edge.repeatForbiddenRoles
            ? {
                repeatForbiddenRoles: Object.freeze([
                  ...edge.repeatForbiddenRoles,
                ]),
              }
            : {}),
        })),
    ),
    targets: Object.freeze({
      screen: Object.freeze({ ...contract.verticalRhythm.targets.screen }),
      printPdf: Object.freeze({
        ...contract.verticalRhythm.targets.printPdf,
      }),
    }),
  }),
  referenceMeasurement: Object.freeze({ ...contract.referenceMeasurement }),
})
