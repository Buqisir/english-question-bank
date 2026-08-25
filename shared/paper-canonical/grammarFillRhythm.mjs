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

export const grammarFillRhythm = freezeObject(v5Contract)

const grammarFillRhythmV6 = freezeObject(v6Contract)
const grammarFillRhythmV7 = freezeObject(v7Contract)

export function grammarFillRhythmForPaperAuthority({ paperId, manifestVersion }) {
  if (Number(manifestVersion) === 46) {
    return grammarFillRhythmV7
  }
  if (
    paperId === 'paper-2026-i'
    && [44, 45].includes(Number(manifestVersion))
  ) {
    return grammarFillRhythmV7
  }
  if (paperId === 'paper-2026-i' && Number(manifestVersion) === 43) {
    return grammarFillRhythmV6
  }
  return grammarFillRhythm
}
