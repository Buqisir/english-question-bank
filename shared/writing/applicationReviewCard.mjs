export const APPLICATION_REVIEW_CARD_V2 = 'application-review-card-v2'

const LEGACY_SCALAR_FIELDS = Object.freeze([
  'form', 'topic', 'reader', 'person', 'tense', 'type',
  'readerWho', 'readerCares', 'readerWants', 'value',
])
const V2_SCALAR_FIELDS = Object.freeze([
  'schemaVersion', 'form', 'topic', 'purpose', 'person', 'tense',
  'reader', 'relationship', 'readerNeeds', 'value',
])
const FORBIDDEN_TEXT = /[\r\n\u0085\u000B\u000C\u2028\u2029<>*_`~#[\]]/
const MARKDOWN_LIST = /^(?:[-+*]|\d+[.)])\s/
const MARKDOWN_THEMATIC_BREAK = /^-{3,}$/

function isReviewCardText(value) {
  return (
    typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && !FORBIDDEN_TEXT.test(value)
    && !MARKDOWN_LIST.test(value)
    && !MARKDOWN_THEMATIC_BREAK.test(value)
    && [...value].length <= 80
  )
}

function hasExactFields(value, fields) {
  const expected = new Set([...fields, 'points'])
  return Object.keys(value).length === expected.size
    && Object.keys(value).every((field) => expected.has(field))
}

function hasValidPoints(value, expectedLength) {
  return Array.isArray(value.points)
    && value.points.length === expectedLength
    && value.points.every(isReviewCardText)
}

export function isLegacyApplicationReviewCard(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && hasExactFields(value, LEGACY_SCALAR_FIELDS)
    && LEGACY_SCALAR_FIELDS.every((field) => isReviewCardText(value[field]))
    && hasValidPoints(value, 2),
  )
}

export function isApplicationReviewCardV2(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.schemaVersion === APPLICATION_REVIEW_CARD_V2
    && hasExactFields(value, V2_SCALAR_FIELDS)
    && V2_SCALAR_FIELDS
      .filter((field) => field !== 'schemaVersion')
      .every((field) => isReviewCardText(value[field]))
    && Array.isArray(value.points)
    && value.points.length >= 1
    && value.points.every(isReviewCardText),
  )
}

export function isCompleteApplicationReviewCard(value) {
  return isApplicationReviewCardV2(value) || isLegacyApplicationReviewCard(value)
}

export function projectApplicationReviewCardDisplay(value) {
  if (isApplicationReviewCardV2(value)) {
    return {
      sourceVersion: APPLICATION_REVIEW_CARD_V2,
      form: value.form,
      topicPurpose: [value.topic, value.purpose],
      person: value.person,
      tense: value.tense,
      points: [...value.points],
      readerRelationship: [value.reader, value.relationship],
      readerNeeds: [value.readerNeeds],
      value: value.value,
    }
  }
  if (isLegacyApplicationReviewCard(value)) {
    return {
      sourceVersion: 'legacy',
      form: value.form,
      topicPurpose: [value.topic],
      person: value.person,
      tense: value.tense,
      points: [...value.points],
      // Keep the historical identity/context text verbatim. It is not a new
      // inferred relationship, but dropping it would lose task-specific facts.
      readerRelationship: [...new Set([value.reader, value.readerWho])],
      readerNeeds: [value.readerCares, value.readerWants],
      value: value.value,
    }
  }
  return null
}
