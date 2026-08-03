import v5Contract from '../../standards/paper-canonical/rendering/grammar-fill-rhythm-v5.json' with { type: 'json' }
import v6Contract from '../../standards/paper-canonical/rendering/grammar-fill-rhythm-v6.json' with { type: 'json' }
import v7Contract from '../../standards/paper-canonical/rendering/grammar-fill-rhythm-v7.json' with { type: 'json' }

function freezeObject(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeObject))
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeObject(child)]),
    ))
  }
  return value
}

export const grammarFillRhythm = freezeObject(v7Contract)

const paper2026IV43GrammarFillRhythm = freezeObject(v6Contract)
const paper2026IV44GrammarFillRhythm = grammarFillRhythm

export function grammarFillRhythmForPaperAuthority({ paperId, manifestVersion }) {
  if (paperId === 'paper-2026-i' && Number(manifestVersion) === 44) {
    return paper2026IV44GrammarFillRhythm
  }
  if (paperId === 'paper-2026-i' && Number(manifestVersion) === 43) {
    return paper2026IV43GrammarFillRhythm
  }
  return freezeObject(v5Contract)
}
