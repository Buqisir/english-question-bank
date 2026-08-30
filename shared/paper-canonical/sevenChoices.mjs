import { forEachRichInline } from './richContent.mjs'
import { resolvePassageBlockRoles } from './passageBlockRoles.mjs'
import { exactKeys, isRecordValue } from './stable.mjs'

function issue(code, disposition, path, message) {
  return { code, disposition, path, message }
}

function orderedBlankRefs(content) {
  const refs = []
  let rawMarker = false
  forEachRichInline(content, (inline) => {
    if (inline?.kind === 'blank_ref') refs.push(inline.blankId)
    if (inline?.kind === 'text' && /_+\d+_+|\([1-5]\)/u.test(inline.text)) rawMarker = true
  })
  return { refs, rawMarker }
}

export function validateSevenChoicesContract({
  groupId,
  questionIds,
  blankIds,
  content,
  variant,
  assertions,
  allowPassageBlockRoles = false,
}) {
  const issues = []
  if (questionIds.length !== 5 || blankIds.length !== 5) {
    issues.push(issue(
      'SEVEN_CHOICES_PAIR_CARDINALITY',
      questionIds.length < 5 || blankIds.length < 5 ? 'incomplete_source' : 'needs_review',
      '$.groups',
      'Seven Choices requires exactly five Question and Blank identities',
    ))
  }
  if (new Set(questionIds).size !== questionIds.length || new Set(blankIds).size !== blankIds.length) {
    issues.push(issue('SEVEN_CHOICES_PAIR_IDENTITY_AMBIGUOUS', 'needs_review', '$.groups', 'Seven Choices Question and Blank identities must be unique'))
  }
  const variantKeys = allowPassageBlockRoles
    ? ['family', 'passageBlockRoles', 'members', 'choiceOwnership']
    : ['family', 'members', 'choiceOwnership']
  if (!isRecordValue(variant) || !exactKeys(variant, variantKeys) || variant.family !== 'seven-choices' || !Array.isArray(variant.members)) {
    return [...issues, issue('SEVEN_CHOICES_VARIANT_INVALID', 'needs_review', '$.groups.variant', 'Seven Choices has one closed members and shared-bank variant')]
  }
  if (
    allowPassageBlockRoles
    && !resolvePassageBlockRoles(content?.blocks, variant.passageBlockRoles).ok
  ) {
    issues.push(issue(
      'SEVEN_CHOICES_ROLE_MAP_INVALID',
      'needs_review',
      '$.groups.variant.passageBlockRoles',
      'Seven Choices roles must uniquely bind top-level paragraphs, serialize by nodeId, and admit at most one title',
    ))
  }
  if (variant.members.length !== 5) {
    issues.push(issue(
      'SEVEN_CHOICES_MEMBER_CARDINALITY',
      variant.members.length < 5 ? 'incomplete_source' : 'needs_review',
      '$.groups.variant.members',
      'Seven Choices requires exactly five ordered Question and Blank pairs',
    ))
  }
  const assertionById = new Map((assertions || []).map((assertion) => [assertion.assertionId, assertion]))
  const choice = variant.choiceOwnership
  if (!isRecordValue(choice) || !exactKeys(choice, ['ownership', 'bankId', 'options']) || choice.ownership !== 'shared_bank' || choice.bankId !== `bank:${groupId}` || !Array.isArray(choice.options)) {
    issues.push(issue('SEVEN_CHOICES_SHARED_BANK_INVALID', 'incomplete_source', '$.groups.variant.choiceOwnership', 'Seven Choices requires one Group-owned A-G bank'))
    return issues
  }
  if (choice.options.length !== 7) {
    issues.push(issue(
      'SEVEN_CHOICES_SHARED_BANK_CARDINALITY',
      choice.options.length < 7 ? 'incomplete_source' : 'needs_review',
      '$.groups.variant.choiceOwnership.options',
      'Seven Choices requires exactly seven bank Options',
    ))
  }
  const optionIds = new Set()
  const optionById = new Map()
  for (const [index, option] of choice.options.entries()) {
    const expectedLabel = 'ABCDEFG'[index]
    const validContent = Array.isArray(option?.content)
      && option.content.length > 0
      && option.content.every((node) => isRecordValue(node) && exactKeys(node, ['kind', 'nodeId', 'text']) && node.kind === 'text' && typeof node.nodeId === 'string' && typeof node.text === 'string' && node.text.length > 0)
    if (!isRecordValue(option) || !exactKeys(option, ['optionId', 'label', 'content']) || typeof option.optionId !== 'string' || option.label !== expectedLabel || !validContent || optionIds.has(option.optionId)) {
      issues.push(issue('SEVEN_CHOICES_OPTION_IDENTITY_AMBIGUOUS', 'needs_review', `$.groups.variant.choiceOwnership.options[${index}]`, 'Bank Options require unique stable identities and ordered non-empty A-G labels'))
      continue
    }
    optionIds.add(option.optionId)
    optionById.set(option.optionId, option)
  }
  for (const [index, member] of variant.members.entries()) {
    const validShape = isRecordValue(member)
      && exactKeys(member, ['questionId', 'blankId', 'answer'])
      && isRecordValue(member.answer)
      && exactKeys(member.answer, ['optionId', 'authorityAssertionRef'])
    if (!validShape || member.questionId !== questionIds[index] || member.blankId !== blankIds[index]) {
      issues.push(issue('SEVEN_CHOICES_PAIR_IDENTITY_AMBIGUOUS', 'needs_review', `$.groups.variant.members[${index}]`, 'Member order must exactly couple the declared Question and Blank identities'))
      continue
    }
    const option = optionById.get(member.answer.optionId)
    const assertion = assertionById.get(member.answer.authorityAssertionRef)
    if (!option) {
      issues.push(issue('SEVEN_CHOICES_ANSWER_OPTION_UNRESOLVED', 'needs_review', `$.groups.variant.members[${index}].answer`, 'Answer must join one stable Option identity in the shared bank'))
    }
    if (!assertion || assertion.authority !== 'official' || assertion.questionId !== member.questionId) {
      issues.push(issue('SEVEN_CHOICES_ANSWER_EVIDENCE_MISSING', 'incomplete_source', `$.groups.variant.members[${index}].answer`, 'Answer join requires one matching provenance-bearing official assertion'))
    } else if (option && assertion.answer !== option.label) {
      issues.push(issue('SEVEN_CHOICES_ANSWER_JOIN_CONFLICT', 'answer_conflict', `$.groups.variant.members[${index}].answer`, 'Official answer does not resolve to the joined shared-bank Option'))
    }
  }
  const semanticBlanks = orderedBlankRefs(content)
  if (semanticBlanks.rawMarker) issues.push(issue('SEVEN_CHOICES_RAW_MARKER_AMBIGUOUS', 'needs_review', '$.groups.content', 'Canonical content cannot retain a raw marker or source-local ordinal'))
  if (semanticBlanks.refs.length !== blankIds.length || semanticBlanks.refs.some((blankId, index) => blankId !== blankIds[index])) {
    issues.push(issue('SEVEN_CHOICES_BLANK_OCCURRENCE', 'needs_review', '$.groups.content', 'Each Seven Choices Blank must occur exactly once in member order'))
  }
  return issues
}
