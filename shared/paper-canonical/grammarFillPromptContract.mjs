import { validateJsonSchema } from './authority.mjs'
import { exactKeys, isRecordValue } from './stable.mjs'

function issue(code, path, message) {
  return { code, path, message }
}

export function validateGrammarFillPromptContract({
  blankIds,
  content,
  variant,
  sourceCapture,
  promptProvisionSchema,
  sourceMap = null,
}) {
  if (variant?.family !== 'grammar-fill') return []
  const issues = []
  const bindings = Array.isArray(variant.promptBindings)
    ? variant.promptBindings
    : []
  const bindingByBlankId = new Map(
    bindings.map((binding) => [binding?.blankId, binding]),
  )
  const occurrenceByBlankId = new Map()
  for (const block of content?.blocks || []) {
    if (block?.kind !== 'paragraph') continue
    for (const [index, inline] of (block.inlines || []).entries()) {
      if (inline?.kind !== 'blank_ref') continue
      const occurrences = occurrenceByBlankId.get(inline.blankId) || []
      occurrences.push({ following: block.inlines[index + 1] })
      occurrenceByBlankId.set(inline.blankId, occurrences)
    }
  }
  if (
    bindings.length !== blankIds.length
    || bindingByBlankId.size !== blankIds.length
    || [...bindingByBlankId.keys()].some(
      (blankId) => !blankIds.includes(blankId),
    )
  ) {
    return [issue(
      'GRAMMAR_FILL_PROMPT_BINDING_COVERAGE',
      '$.groups.variant.promptBindings',
      'Grammar Fill prompt bindings must cover every Blank exactly once',
    )]
  }
  for (const blankId of blankIds) {
    const binding = bindingByBlankId.get(blankId)
    const occurrences = occurrenceByBlankId.get(blankId) || []
    const following = occurrences[0]?.following
    const sourcePrompt =
      following?.kind === 'text' && typeof following.text === 'string'
        ? following.text.match(
            /^ \(([^()\r\n]+)\)(?=\s|[.,;:!?])/u,
          )?.[1] ?? null
        : null
    const observation = sourceCapture?.observations?.find(
      (candidate) =>
        candidate.observationId === binding?.authorityObservationRef,
    )
    const observationValue = observation?.value
    const observationValid = (
      observation?.kind === 'grammar_fill_prompt_provision'
      && isRecordValue(promptProvisionSchema)
      && validateJsonSchema(
        observationValue,
        promptProvisionSchema,
        '$.sourceCapture.observations.promptProvision',
      ).length === 0
      && observationValue?.blankId === blankId
      && observationValue?.provision === binding?.provision
      && (
        binding?.provision !== 'source_prompt'
        || observationValue?.prompt === binding.prompt
      )
    )
    const prompted = (
      isRecordValue(binding)
      && exactKeys(binding, [
        'blankId',
        'provision',
        'prompt',
        'authorityObservationRef',
      ])
      && binding.blankId === blankId
      && binding.provision === 'source_prompt'
      && typeof binding.prompt === 'string'
      && binding.prompt.length > 0
      && !/[()\r\n]/u.test(binding.prompt)
      && sourcePrompt === binding.prompt
    )
    const unprompted = (
      isRecordValue(binding)
      && exactKeys(binding, [
        'blankId',
        'provision',
        'authorityObservationRef',
      ])
      && binding.blankId === blankId
      && binding.provision === 'source_proven_none'
      && sourcePrompt === null
    )
    const sourceMapValid = sourceMap == null || sourceMap.entries?.some(
      (entry) =>
        entry?.target?.kind === 'prompt_provision'
        && entry.target.id === blankId
        && entry.sourceSpanRefs?.includes(observation?.sourceSpanId),
    )
    if (
      occurrences.length !== 1
      || !observationValid
      || !sourceMapValid
      || (!prompted && !unprompted)
    ) {
      issues.push(issue(
        'GRAMMAR_FILL_PROMPT_SOURCE_DISAGREEMENT',
        '$.groups.variant.promptBindings',
        `Grammar Fill Blank ${blankId} prompt provision must exactly agree with source evidence and content`,
      ))
    }
  }
  return issues
}
