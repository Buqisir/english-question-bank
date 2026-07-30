import contract from '../../standards/paper-canonical/rendering/grammar-fill-public-geometry-fixtures-v1.json' with { type: 'json' }

function freezeObject(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeObject))
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeObject(child)]),
    ))
  }
  return value
}

export const grammarFillPublicGeometryFixtures = freezeObject(contract)

export function resolveGrammarFillPublicGeometryFixture(
  variantId,
  expectedSurface,
) {
  if (variantId == null) return null
  const variant = grammarFillPublicGeometryFixtures.variants[variantId]
  if (!variant || variant.surface !== expectedSurface) {
    const error = new Error(
      `Canonical Grammar Fill geometry fixture is unavailable: ${variantId}`,
    )
    error.code = 'CANONICAL_GRAMMAR_FILL_GEOMETRY_FIXTURE_REJECTED'
    throw error
  }
  return variant
}
