import contract from '../../standards/paper-canonical/rendering/grammar-fill-rhythm-v2.json' with { type: 'json' }

function freezeObject(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeObject))
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeObject(child)]),
    ))
  }
  return value
}

export const grammarFillRhythm = freezeObject(contract)
