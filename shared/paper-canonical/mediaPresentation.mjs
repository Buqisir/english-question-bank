import { digestJson, exactKeys } from './stable.mjs'

export const MEDIA_PRESENTATION_ALIGNMENTS = Object.freeze([
  'left',
  'center',
  'right',
])

export const MEDIA_PRESENTATION_SPACING_TOKENS = Object.freeze([
  'none',
  'compact',
  'normal',
])

export const MEDIA_PUBLICATION_SELECTIONS = Object.freeze([
  'source_crop',
  'deterministic_enhancement',
  'human_confirmed_ai_candidate',
])

export const MEDIA_AI_CONFIRMATION_CHECKS = Object.freeze([
  'text',
  'numbers',
  'units',
  'arrows',
  'legend',
  'colorAndLineStyle',
  'nodeCountAndOrder',
  'curvesIntersectionsAndScale',
  'layoutIntent',
  'sourceAuthorization',
  'watermarkIntegrity',
])

const digestPattern = /^sha256:[a-f0-9]{64}$/
const idPattern = /^[a-z0-9][a-z0-9._:-]*$/

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function validateMediaPresentation(value) {
  return Boolean(
    isRecord(value)
    && exactKeys(value, [
      'alignment',
      'widthRatio',
      'spacingBefore',
      'spacingAfter',
    ])
    && MEDIA_PRESENTATION_ALIGNMENTS.includes(value.alignment)
    && typeof value.widthRatio === 'number'
    && Number.isFinite(value.widthRatio)
    && value.widthRatio > 0
    && value.widthRatio <= 1
    && MEDIA_PRESENTATION_SPACING_TOKENS.includes(value.spacingBefore)
    && MEDIA_PRESENTATION_SPACING_TOKENS.includes(value.spacingAfter)
  )
}

export function mediaPresentationDigest(value) {
  if (!validateMediaPresentation(value)) {
    const error = new Error('Media presentation intent is invalid')
    error.code = 'MATERIALIZATION_MEDIA_PRESENTATION_INVALID'
    throw error
  }
  return digestJson(value)
}

function validateCandidate(candidate) {
  if (!isRecord(candidate) || ![
    'deterministic_enhancement',
    'ai_assisted_redraw',
  ].includes(candidate.kind)) return false
  const commonKeys = [
    'kind',
    'mimeType',
    'sha256',
    'pixelWidth',
    'pixelHeight',
    'tool',
    'toolVersion',
  ]
  const expectedKeys = candidate.kind === 'deterministic_enhancement'
    ? [...commonKeys, 'preset']
    : [...commonKeys, 'promptSummarySha256']
  return Boolean(
    exactKeys(candidate, expectedKeys)
    && ['image/png', 'image/jpeg', 'image/webp'].includes(candidate.mimeType)
    && digestPattern.test(candidate.sha256 || '')
    && Number.isInteger(candidate.pixelWidth)
    && candidate.pixelWidth > 0
    && Number.isInteger(candidate.pixelHeight)
    && candidate.pixelHeight > 0
    && typeof candidate.tool === 'string'
    && candidate.tool.length > 0
    && typeof candidate.toolVersion === 'string'
    && candidate.toolVersion.length > 0
    && (
      candidate.kind !== 'deterministic_enhancement'
      || candidate.preset === 'document-light-cleanup-v1'
    )
    && (
      candidate.kind !== 'ai_assisted_redraw'
      || digestPattern.test(candidate.promptSummarySha256 || '')
    )
  )
}

function validateConfirmation(confirmation, publication, presentation) {
  if (
    !isRecord(confirmation)
    || !exactKeys(confirmation, [
      'receiptId',
      'reviewMethod',
      'sourceSha256',
      'candidateSha256',
      'presentationDigest',
      'checklist',
    ])
    || !idPattern.test(confirmation.receiptId || '')
    || confirmation.reviewMethod !== 'side_by_side_overlay'
    || confirmation.sourceSha256 !== publication.sourceSha256
    || confirmation.candidateSha256 !== publication.candidate?.sha256
    || confirmation.presentationDigest !== digestJson(presentation)
    || !isRecord(confirmation.checklist)
    || !exactKeys(confirmation.checklist, MEDIA_AI_CONFIRMATION_CHECKS)
    || MEDIA_AI_CONFIRMATION_CHECKS.some((key) => confirmation.checklist[key] !== true)
  ) return false
  return true
}

export function validateMediaPublication(value, presentation) {
  if (
    !isRecord(value)
    || !validateMediaPresentation(presentation)
    || !MEDIA_PUBLICATION_SELECTIONS.includes(value.selection)
    || !digestPattern.test(value.sourceSha256 || '')
  ) return false
  if (value.selection === 'source_crop') {
    return exactKeys(value, ['selection', 'sourceSha256'])
      || (
        exactKeys(value, ['selection', 'sourceSha256', 'candidate'])
        && validateCandidate(value.candidate)
        && value.candidate.kind === 'ai_assisted_redraw'
      )
  }
  if (
    !exactKeys(value, [
      'selection',
      'sourceSha256',
      'candidate',
      ...(value.selection === 'human_confirmed_ai_candidate'
        ? ['confirmation']
        : []),
    ])
    || !validateCandidate(value.candidate)
  ) return false
  if (value.selection === 'deterministic_enhancement') {
    return value.candidate.kind === 'deterministic_enhancement'
  }
  return value.candidate.kind === 'ai_assisted_redraw'
    && validateConfirmation(value.confirmation, value, presentation)
}

export function mediaPresentationById(sourceCapture) {
  const presentations = new Map()
  for (const observation of sourceCapture?.observations || []) {
    if (observation?.kind !== 'source_media') continue
    const { mediaId, presentation } = observation.value || {}
    if (presentation === undefined) continue
    if (!validateMediaPresentation(presentation) || presentations.has(mediaId)) {
      const error = new Error(`Source media presentation is invalid or ambiguous: ${mediaId || 'unknown'}`)
      error.code = 'CANONICAL_MEDIA_PRESENTATION_INVALID'
      throw error
    }
    presentations.set(mediaId, structuredClone(presentation))
  }
  return presentations
}

export function decorateProjectedMediaPresentation(projectedOccurrences, sourceCapture) {
  const presentations = mediaPresentationById(sourceCapture)
  if (presentations.size === 0) return projectedOccurrences
  return projectedOccurrences.map((occurrence) => {
    if (occurrence?.kind !== 'group' || !Array.isArray(occurrence.media)) {
      return occurrence
    }
    const media = occurrence.media.map((entry) => {
      const presentation = presentations.get(entry.mediaId)
      if (!presentation) {
        const error = new Error(`Projected media has no source presentation intent: ${entry.mediaId}`)
        error.code = 'CANONICAL_MEDIA_PRESENTATION_MISSING'
        throw error
      }
      return { ...entry, presentation }
    })
    return { ...occurrence, media }
  })
}
