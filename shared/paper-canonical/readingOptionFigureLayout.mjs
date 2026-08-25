import {
  readingOptionFigureConsumerContractRefs,
  readingOptionFigureSourceLayoutExtension,
} from './consumers.mjs'
import {
  readingOptionFigureAuthorityRef,
  readingOptionFigureRenderingAuthorityRef,
  readingOptionFigureSourceLayoutSchemaAuthorityRef,
  resolveCanonicalAuthority,
  validateJsonSchema,
} from './authority.mjs'
import { digestJson } from './stable.mjs'

const LAYOUT_ARTIFACT_ID = 'renderer-reading-option-figure-layout'

function sameRef(left, right) {
  return left?.manifestId === right?.manifestId
    && left?.manifestVersion === right?.manifestVersion
    && left?.manifestDigest === right?.manifestDigest
}

function sameConsumerRef(left, right) {
  return left?.id === right?.id
    && left?.version === right?.version
    && left?.digest === right?.digest
}

function rejected(message) {
  const error = new Error(message)
  error.code = 'READING_OPTION_FIGURE_LAYOUT_REJECTED'
  throw error
}

function freezeTree(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeTree))
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeTree(child)]),
    ))
  }
  return value
}

function resolveLayout() {
  const resolved = resolveCanonicalAuthority(
    readingOptionFigureRenderingAuthorityRef,
  )
  const layout = resolved.ok
    ? resolved.closure.artifacts[LAYOUT_ARTIFACT_ID]
    : null
  if (
    !layout
    || layout.id !== 'reading-option-figure-layout'
    || layout.version !== '1'
    || !sameRef(
      layout.compatibleProjectionAuthority,
      readingOptionFigureAuthorityRef,
    )
  ) rejected('Reading Option Figure layout authority is unavailable')
  return freezeTree(structuredClone(layout))
}

export const readingOptionFigureLayout = resolveLayout()

export const readingOptionFigureLayoutRef = Object.freeze({
  id: readingOptionFigureLayout.id,
  version: readingOptionFigureLayout.version,
  digest: digestJson(readingOptionFigureLayout),
  authorityRef: readingOptionFigureRenderingAuthorityRef,
})

function validateQuestion(question, consumerId) {
  const labels = readingOptionFigureLayout.topology.orderedLabels
  const hasCorrectOptionId = Object.hasOwn(question || {}, 'correctOptionId')
  if (
    question?.optionMode !== 'figure'
    || !Array.isArray(question.options)
    || question.options.length !== readingOptionFigureLayout.topology.optionCount
    || question.options.some((option, index) => (
      option?.kind !== 'figure'
      || option.label !== labels[index]
      || typeof option.optionId !== 'string'
      || typeof option.figure?.mediaId !== 'string'
      || option.figure?.mediaArtifact?.mimeType !== 'image/png'
      || typeof option.figure.mediaArtifact.encodedBytes !== 'string'
      || typeof option.figure.mediaArtifact.sha256 !== 'string'
      || option.figure?.accessibility?.kind !== 'neutral_option_identity'
      || option.figure.accessibility.optionLabel !== option.label
    ))
    || (consumerId === 'screen' && hasCorrectOptionId)
    || (
      consumerId === 'print_pdf'
      && (
        !hasCorrectOptionId
        || typeof question.correctOptionId !== 'string'
        || !question.options.some(
          (option) => option.optionId === question.correctOptionId,
        )
      )
    )
  ) rejected('Reading Option Figure set is incompatible with layout v1')
}

function isFiniteNumber(value) {
  return Number.isFinite(value)
}

function sourceMeasuredIntent(consumption, question) {
  const hasIntents = Object.hasOwn(consumption || {}, 'figureLayoutIntents')
  const requirement = question.figureLayoutIntentRequirement
  const matches = Array.isArray(consumption?.figureLayoutIntents)
    ? consumption.figureLayoutIntents.filter(
    (intent) => intent?.questionId === question.questionId,
      )
    : []
  if (requirement == null) {
    if (matches.length > 0) {
      rejected('Reading Option Figure source layout intent is unbound')
    }
    return null
  }
  const schemaAuthority = resolveCanonicalAuthority(
    readingOptionFigureSourceLayoutSchemaAuthorityRef,
  )
  const requirementSchema = schemaAuthority.ok
    ? schemaAuthority.closure.schemas[
        readingOptionFigureSourceLayoutExtension.requirementSchemaRef.schemaId
      ]
    : null
  const intentSchema = schemaAuthority.ok
    ? schemaAuthority.closure.schemas[
        readingOptionFigureSourceLayoutExtension.intentSchemaRef.schemaId
      ]
    : null
  if (
    !hasIntents
    || !Array.isArray(consumption.figureLayoutIntents)
    || matches.length !== 1
    || !requirementSchema
    || validateJsonSchema(
      requirement,
      requirementSchema,
      '$.question.figureLayoutIntentRequirement',
    ).length > 0
    || digestJson(requirement.intentSchemaRef)
      !== digestJson(readingOptionFigureSourceLayoutExtension.intentSchemaRef)
    || !intentSchema
  ) {
    rejected('Reading Option Figure source layout intent is ambiguous')
  }
  const intent = matches[0]
  const { intentDigest, ...body } = intent
  const validPlacement = (placement, index) => (
    placement?.optionId === question.options[index].optionId
    && placement.label === question.options[index].label
    && typeof placement.sourceSpanId === 'string'
    && Array.isArray(placement.sourcePlacementMatrix)
    && placement.sourcePlacementMatrix.length === 6
    && placement.sourcePlacementMatrix.every(isFiniteNumber)
    && isFiniteNumber(placement.labelLeftPt)
    && isFiniteNumber(placement.labelTopPt)
    && isFiniteNumber(placement.imageLeftPt)
    && isFiniteNumber(placement.imageTopPt)
    && isFiniteNumber(placement.imageWidthPt)
    && placement.imageWidthPt > 0
    && isFiniteNumber(placement.imageHeightPt)
    && placement.imageHeightPt > 0
    && placement.labelLeftPt >= 0
    && placement.labelTopPt >= 0
    && placement.imageLeftPt >= 0
    && placement.imageTopPt >= 0
    && placement.imageLeftPt + placement.imageWidthPt <= intent.rowWidthPt + 0.001
    && placement.imageTopPt + placement.imageHeightPt <= intent.bankHeightPt + 0.001
  )
  if (
    validateJsonSchema(
      intent,
      intentSchema,
      '$.consumption.figureLayoutIntents',
    ).length > 0
    || intent.schemaVersion
      !== readingOptionFigureLayout.sourceMeasured.intentSchemaVersion
    || intent.coordinateSystem
      !== readingOptionFigureLayout.sourceMeasured.coordinateSystem
    || typeof intent.questionId !== 'string'
    || !Number.isInteger(intent.sourcePage)
    || intent.sourcePage < 1
    || !isFiniteNumber(intent.rowStartPt)
    || intent.rowStartPt < 0
    || !isFiniteNumber(intent.rowWidthPt)
    || intent.rowWidthPt <= 0
    || !isFiniteNumber(intent.bankHeightPt)
    || intent.bankHeightPt <= 0
    || !isFiniteNumber(intent.labelFontSizePt)
    || intent.labelFontSizePt <= 0
    || !isFiniteNumber(intent.labelLineHeightPt)
    || intent.labelLineHeightPt <= 0
    || !isFiniteNumber(intent.stemToBankGapPt)
    || intent.stemToBankGapPt < 0
    || !isFiniteNumber(intent.questionTailGapPt)
    || intent.questionTailGapPt < 0
    || !Array.isArray(intent.placements)
    || intent.placements.length !== question.options.length
    || intent.placements.some((placement, index) => !validPlacement(placement, index))
    || typeof intentDigest !== 'string'
    || digestJson(body) !== intentDigest
    || requirement.intentDigest !== intentDigest
  ) {
    rejected('Reading Option Figure source layout intent is invalid')
  }
  return intent
}

export function translateReadingOptionFigureLayout({
  consumerId,
  consumption,
  question,
}) {
  const expectedConsumer = readingOptionFigureConsumerContractRefs[consumerId]
  if (
    !expectedConsumer
    || !sameRef(consumption?.authorityRef, readingOptionFigureAuthorityRef)
    || !sameConsumerRef(consumption?.consumerContractRef, expectedConsumer)
    || !sameConsumerRef(
      readingOptionFigureLayout.compatibleConsumerContracts[consumerId],
      expectedConsumer,
    )
  ) rejected('Reading Option Figure consumption is incompatible with layout v1')
  validateQuestion(question, consumerId)

  const { topology, label, imageBox, rhythm, responsive, pagination } =
    readingOptionFigureLayout
  const sourceIntent = sourceMeasuredIntent(consumption, question)
  if (sourceIntent) {
    const placement = {
      mode: readingOptionFigureLayout.sourceMeasured.mode,
      layoutId: readingOptionFigureLayout.id,
      layoutVersion: readingOptionFigureLayout.version,
      layoutDigest: readingOptionFigureLayoutRef.digest,
      layoutAuthorityRef: readingOptionFigureRenderingAuthorityRef,
      sourceIntentDigest: sourceIntent.intentDigest,
      sourceMatrixScalePolicy:
        readingOptionFigureLayout.sourceMeasured.matrixScaling,
      consumerTransformPolicy:
        readingOptionFigureLayout.sourceMeasured.consumerTransform,
      rowStartPt: sourceIntent.rowStartPt,
      rowWidthPt: sourceIntent.rowWidthPt,
      bankHeightPt: sourceIntent.bankHeightPt,
      trackCount: topology.trackCount,
      trackWidthPt: topology.trackWidthPt,
      labelFontSizePt: sourceIntent.labelFontSizePt,
      labelLineHeightPt: sourceIntent.labelLineHeightPt,
      imageBoxWidthPt: imageBox.widthPt,
      imageBoxHeightPt: imageBox.heightPt,
      objectFit: 'fill',
      objectPosition: imageBox.objectPosition,
      stemToBankGapPt: sourceIntent.stemToBankGapPt,
      labelToBoxGapPt: 0,
      questionTailGapPt: sourceIntent.questionTailGapPt,
      minTrackWidthPt: responsive.minTrackWidthPt,
      responsivePolicy: responsive.policy,
      extremeOverflow: responsive.extremeOverflow,
      paginationPolicy: pagination.policy,
      placements: sourceIntent.placements.map((sourcePlacement) => ({
        ...structuredClone(sourcePlacement),
        neutralAlt: `Option ${sourcePlacement.label}`,
      })),
    }
    return freezeTree({
      ...placement,
      placementSignature: digestJson(placement),
    })
  }
  const placement = {
    mode: 'figure_four_equal_tracks',
    layoutId: readingOptionFigureLayout.id,
    layoutVersion: readingOptionFigureLayout.version,
    layoutDigest: readingOptionFigureLayoutRef.digest,
    layoutAuthorityRef: readingOptionFigureRenderingAuthorityRef,
    rowStartPt: topology.rowStartPt,
    rowWidthPt: topology.rowWidthPt,
    trackCount: topology.trackCount,
    trackWidthPt: topology.trackWidthPt,
    labelFontSizePt: label.fontSizePt,
    labelLineHeightPt: label.lineHeightPt,
    imageBoxWidthPt: imageBox.widthPt,
    imageBoxHeightPt: imageBox.heightPt,
    objectFit: imageBox.objectFit,
    objectPosition: imageBox.objectPosition,
    stemToBankGapPt: rhythm.stemToBankGapPt,
    labelToBoxGapPt: rhythm.labelToBoxGapPt,
    questionTailGapPt: rhythm.questionTailGapPt,
    minTrackWidthPt: responsive.minTrackWidthPt,
    responsivePolicy: responsive.policy,
    extremeOverflow: responsive.extremeOverflow,
    paginationPolicy: pagination.policy,
    placements: question.options.map((option, trackIndex) => ({
      optionId: option.optionId,
      label: option.label,
      trackIndex,
      neutralAlt: `Option ${option.figure.accessibility.optionLabel}`,
    })),
  }
  return freezeTree({
    ...placement,
    placementSignature: digestJson(placement),
  })
}
