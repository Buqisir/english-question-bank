import { exactKeys, isRecordValue } from './stable.mjs'

function issue(code, disposition, path, message) {
  return { code, disposition, path, message }
}

function literalInlinesValid(inlines) {
  return Array.isArray(inlines)
    && inlines.length > 0
    && inlines.every((inline) =>
      isRecordValue(inline)
      && exactKeys(inline, ['kind', 'nodeId', 'text'])
      && inline.kind === 'text'
      && typeof inline.nodeId === 'string'
      && inline.nodeId.length > 0
      && typeof inline.text === 'string'
      && inline.text.length > 0)
}

export function collectListeningTargets(variant) {
  if (variant?.family !== 'listening') return []
  return [
    ...(variant.questions || []).flatMap((question) => [
      ...(question.stem || []).map((inline) => ({
        kind: 'content_node',
        id: inline.nodeId,
      })),
    ]),
    ...(variant.choiceOwnership?.sets || []).flatMap((set) =>
      (set.options || []).flatMap((option) => [
        { kind: 'option', id: option.optionId },
        ...(option.content || []).map((inline) => ({
          kind: 'content_node',
          id: inline.nodeId,
        })),
      ])),
    ...(variant.transcriptSegments || []).flatMap((segment) => [
      { kind: 'transcript_segment', id: segment.segmentId },
      ...(segment.content || []).map((inline) => ({
        kind: 'content_node',
        id: inline.nodeId,
      })),
    ]),
  ]
}

export function validateListeningContract({
  questionIds,
  blankIds,
  content,
  variant,
  assertions,
}) {
  const issues = []
  if (
    !isRecordValue(variant)
    || !exactKeys(variant, [
      'family',
      'questions',
      'transcriptSegments',
      'choiceOwnership',
    ])
    || variant.family !== 'listening'
    || !Array.isArray(variant.questions)
    || !Array.isArray(variant.transcriptSegments)
  ) {
    return [issue(
      'LISTENING_VARIANT_INVALID',
      'needs_review',
      '$.variant',
      'Listening requires closed ordered Questions, transcripts, and choices',
    )]
  }
  if (blankIds.length !== 0 || !Array.isArray(content?.blocks) || content.blocks.length !== 0) {
    issues.push(issue(
      'LISTENING_CONTENT_INVALID',
      'needs_review',
      '$.content',
      'Listening Questions and transcripts belong to the Listening variant',
    ))
  }
  if (
    variant.questions.length !== questionIds.length
    || variant.questions.some((question, index) =>
      !isRecordValue(question)
      || !exactKeys(question, ['questionId', 'stem', 'correctOptionId'])
      || question.questionId !== questionIds[index]
      || !literalInlinesValid(question.stem)
      || typeof question.correctOptionId !== 'string')
  ) {
    issues.push(issue(
      'LISTENING_QUESTIONS_INVALID',
      'incomplete_source',
      '$.variant.questions',
      'Listening Questions must close the ordered Profile membership and literal stems',
    ))
  }
  const choiceSets = variant.choiceOwnership?.ownership === 'per_question'
    && exactKeys(variant.choiceOwnership, ['ownership', 'sets'])
    && Array.isArray(variant.choiceOwnership.sets)
      ? variant.choiceOwnership.sets
      : null
  if (
    !choiceSets
    || choiceSets.length !== questionIds.length
    || choiceSets.some((set, index) =>
      !isRecordValue(set)
      || !exactKeys(set, ['questionId', 'options'])
      || set.questionId !== questionIds[index]
      || !Array.isArray(set.options)
      || set.options.length !== 3
      || set.options.map((option) => option?.label).join('') !== 'ABC'
      || new Set(set.options.map((option) => option?.optionId)).size !== 3
      || set.options.some((option) =>
        !isRecordValue(option)
        || !exactKeys(option, ['optionId', 'label', 'content'])
        || typeof option.optionId !== 'string'
        || !literalInlinesValid(option.content)))
  ) {
    issues.push(issue(
      'LISTENING_CHOICES_INVALID',
      'incomplete_source',
      '$.variant.choiceOwnership',
      'Every Listening Question requires one ordered A-C option set',
    ))
  } else {
    for (const [index, question] of variant.questions.entries()) {
      const set = choiceSets[index]
      const answer = assertions.find((assertion) => assertion.questionId === question.questionId)
      const correct = set.options.find((option) => option.optionId === question.correctOptionId)
      if (!correct || answer?.answer !== correct.label) {
        issues.push(issue(
          'LISTENING_ANSWER_MISMATCH',
          'answer_conflict',
          `$.variant.questions[${index}].correctOptionId`,
          'Listening correct Option must agree with the official answer assertion',
        ))
      }
    }
  }
  const coverage = new Map(questionIds.map((questionId) => [questionId, 0]))
  if (
    variant.transcriptSegments.length !== 5
    || new Set(variant.transcriptSegments.map((segment) => segment?.segmentId)).size !== 5
    || variant.transcriptSegments.some((segment) =>
      !isRecordValue(segment)
      || !exactKeys(segment, ['segmentId', 'content', 'questionIds'])
      || typeof segment.segmentId !== 'string'
      || !literalInlinesValid(segment.content)
      || !Array.isArray(segment.questionIds)
      || segment.questionIds.length === 0
      || segment.questionIds.some((questionId) => !coverage.has(questionId)))
  ) {
    issues.push(issue(
      'LISTENING_TRANSCRIPT_INVALID',
      'incomplete_source',
      '$.variant.transcriptSegments',
      'Listening requires five source-bound transcript segments',
    ))
  } else {
    for (const segment of variant.transcriptSegments) {
      for (const questionId of segment.questionIds) {
        coverage.set(questionId, coverage.get(questionId) + 1)
      }
    }
    if ([...coverage.values()].some((count) => count !== 1)) {
      issues.push(issue(
        'LISTENING_TRANSCRIPT_COVERAGE_INVALID',
        'incomplete_source',
        '$.variant.transcriptSegments',
        'Every Listening Question must be covered by exactly one transcript segment',
      ))
    }
  }
  const targetIds = collectListeningTargets(variant).map(({ id }) => id)
  if (new Set(targetIds).size !== targetIds.length) {
    issues.push(issue(
      'LISTENING_IDENTITY_DUPLICATE',
      'needs_review',
      '$.variant',
      'Listening Options, transcripts, and literal nodes require unique identities',
    ))
  }
  return issues
}
