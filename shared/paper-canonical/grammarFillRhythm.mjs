import v5Contract from '../../standards/paper-canonical/rendering/grammar-fill-rhythm-v5.json' with { type: 'json' }
import v6Contract from '../../standards/paper-canonical/rendering/grammar-fill-rhythm-v6.json' with { type: 'json' }

function freezeObject(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeObject))
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeObject(child)]),
    ))
  }
  return value
}

export const grammarFillRhythm = freezeObject(v5Contract)

const paper2026ISuccessorGrammarFillRhythm = freezeObject(v6Contract)

export function grammarFillRhythmForPaperAuthority({ paperId, manifestVersion }) {
  return paperId === 'paper-2026-i' && Number(manifestVersion) === 43
    ? paper2026ISuccessorGrammarFillRhythm
    : grammarFillRhythm
}
