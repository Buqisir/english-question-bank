import { readingOptionFigureConsumerContractRefs } from './consumers.mjs'
import {
  readingOptionFigureAuthorityRef,
  readingOptionFigureRenderingAuthorityRef,
  resolveCanonicalAuthority,
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
