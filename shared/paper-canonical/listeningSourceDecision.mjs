import { exactKeys } from './stable.mjs'

export const LISTENING_SOURCE_DECISION_VERSION = 'listening-source-decision-v1'
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const digest = value => /^sha256:[a-f0-9]{64}$/u.test(value || '')
export const listeningDecisionFailure = message => { throw new Error(`Listening source decision: ${message}`) }

// A closed source-reader decision, not a second transcript/Canonical model.
export function validateListeningSourceDecision(value) {
  const fail = listeningDecisionFailure
  if (!exactKeys(value, ['schemaVersion', 'documentId', 'sourceSetDigest', 'evidenceDigest',
    'confirmationSha256', 'heading', 'start', 'end', 'roles', 'sourceReview',
    ...(Object.hasOwn(value ?? {}, 'markers') ? ['markers'] : [])])
    || value.schemaVersion !== LISTENING_SOURCE_DECISION_VERSION || !nonempty(value.documentId)
    || ![value.sourceSetDigest, value.evidenceDigest, value.confirmationSha256].every(digest)
    || !exactKeys(value.sourceReview, ['reviewedBy', 'originalPagesReviewed', 'allSpeechRetained', 'reason'])
    || value.sourceReview.reviewedBy !== 'import_agent' || value.sourceReview.originalPagesReviewed !== true
    || value.sourceReview.allSpeechRetained !== true || !nonempty(value.sourceReview.reason)
    || !Array.isArray(value.roles) || value.roles.length > 256) fail('invalid closed decision or original-page review')
  for (const [key, address] of [['heading', value.heading], ['start', value.start], ['end', value.end]]) {
    if (key !== 'start' && address === null) continue
    if (!exactKeys(address, ['itemId', 'text']) || !nonempty(address.itemId) || !nonempty(address.text)) {
      fail(`${key} needs one complete source item`)
    }
  }
  if (Object.hasOwn(value, 'markers')) {
    if (!Array.isArray(value.markers) || value.markers.length !== 10
      || value.markers.some((marker, index) => !exactKeys(marker, ['number', 'itemId', 'page', 'text'])
        || marker.number !== index + 1 || !nonempty(marker.itemId) || !nonempty(marker.text)
        || !Number.isInteger(marker.page) || marker.page < 1)) fail('invalid declared Text 1–10 markers')
  }
  for (const role of value.roles) {
    if (!exactKeys(role, ['role', 'nextTextNumber', 'questionNumbers', 'fragments'])
      || !['example', 'cue', 'speech'].includes(role.role)
      || !(role.nextTextNumber === null || Number.isInteger(role.nextTextNumber) && role.nextTextNumber >= 1 && role.nextTextNumber <= 10)
      || !Array.isArray(role.questionNumbers)
      || role.questionNumbers.some(number => !Number.isInteger(number) || number < 1 || number > 20)
      || new Set(role.questionNumbers).size !== role.questionNumbers.length
      || role.role !== 'cue' && (role.nextTextNumber !== null || role.questionNumbers.length)
      || !Array.isArray(role.fragments) || !role.fragments.length || role.fragments.length > 256) fail('invalid source role')
    for (const fragment of role.fragments) {
      if (!exactKeys(fragment, ['itemId', 'start', 'end', 'text']) || !nonempty(fragment.itemId)
        || !Number.isInteger(fragment.start) || !Number.isInteger(fragment.end) || fragment.start < 0
        || fragment.end <= fragment.start || typeof fragment.text !== 'string'
        || fragment.text.length !== fragment.end - fragment.start) fail('invalid UTF-16 fragment')
    }
  }
  return value
}
