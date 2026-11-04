import { digestJson, exactKeys, isRecordValue } from './stable.mjs'

export const SOURCE_INSTRUCTION_SLOTS = Object.freeze({
  'listening.short-dialogue': 'listening.short-dialogue.prompt',
  'listening.long-form': 'listening.long-form.prompt',
  'reading.a': 'reading.choice.prompt',
  'seven-choices': 'reading.seven-choices.prompt',
  cloze: 'language.cloze.prompt',
  'grammar-fill': 'language.grammar-fill.prompt',
})

const text = value => typeof value === 'string' && value.trim().length > 0

export function validSourceExample(example, evidenceKey) {
  if (!isRecordValue(example) || !['provided', 'not_supplied'].includes(example.state)) return false
  const provided = example.state === 'provided'
  return exactKeys(example, ['state', evidenceKey, ...(provided ? ['stem', 'options', 'answer'] : [])])
    && (!provided || (text(example.stem) && ['A', 'B', 'C'].includes(example.answer)
      && Array.isArray(example.options) && example.options.length === 3
      && example.options.every((option, index) => isRecordValue(option)
        && exactKeys(option, ['label', 'text']) && option.label === 'ABC'[index] && text(option.text))))
}

// This is semantic, source-backed chrome, not renderer-authored exam content.
// Source Capture validation remains responsible for resolving the references.
export function validCanonicalSourcePresentation(value) {
  if (isRecordValue(value) && (value.headings !== undefined || value.opening !== undefined)) {
    const { headings, opening, ...original } = value
    const instruction = Object.hasOwn(original, 'instruction')
    return (instruction ? validCanonicalSourcePresentation(original) : exactKeys(original, []))
      && (headings === undefined || (Array.isArray(headings) && headings.length > 0
        && headings.every(entry => isRecordValue(entry)
          && exactKeys(entry, ['instructionId', 'text', 'authorityObservationRef'])
          && /^(?:part|section)\./u.test(entry.instructionId)
          && text(entry.text) && text(entry.authorityObservationRef))))
      && (opening === undefined || (isRecordValue(opening)
        && exactKeys(opening, ['title', 'notices', 'transferNotice', 'authorityObservationRef'])
        && text(opening.title) && text(opening.transferNotice) && text(opening.authorityObservationRef)
        && Array.isArray(opening.notices) && opening.notices.every(text)))
  }
  return isRecordValue(value)
    && exactKeys(value, ['instruction', ...(value.example === undefined ? [] : ['example'])])
    && isRecordValue(value.instruction)
    && exactKeys(value.instruction, ['instructionId', 'text', 'authorityObservationRef'])
    && Object.values(SOURCE_INSTRUCTION_SLOTS).includes(value.instruction.instructionId)
    && text(value.instruction.text) && text(value.instruction.authorityObservationRef)
    && (value.example === undefined || (value.instruction.instructionId === 'listening.short-dialogue.prompt'
      && validSourceExample(value.example, 'authorityObservationRef') && text(value.example.authorityObservationRef)))
    && (value.instruction.instructionId !== 'listening.short-dialogue.prompt' || value.example !== undefined)
}

export function sourcePresentationMatchesCapture(value, capture) {
  if (!validCanonicalSourcePresentation(value)) return false
  return [...(value.instruction ? [[value.instruction, 'source_instruction']] : []),
    ...(value.example ? [[value.example, 'source_listening_example']] : []),
    ...(value.headings || []).map(entry => [entry, 'source_heading']),
    ...(value.opening ? [[value.opening, 'source_paper_opening']] : [])]
    .every(([entry, kind]) => {
      const { authorityObservationRef, ...expected } = entry
      const observation = capture.observations.find(item => item.observationId === authorityObservationRef)
      return observation?.kind === kind && digestJson(observation.value) === digestJson(expected)
    })
}
