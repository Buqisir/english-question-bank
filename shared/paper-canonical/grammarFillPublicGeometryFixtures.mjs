import contract from '../../standards/paper-canonical/rendering/grammar-fill-public-geometry-fixtures-v8.json' with { type: 'json' }

import { canonicalAuthorityRef } from './authority.mjs'
import { resolveCanonicalConsumerOccurrence } from './consumerProjection.mjs'
import { consumerContractRefs } from './consumers.mjs'

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
  consumption,
) {
  if (variantId == null) return null
  const variant = grammarFillPublicGeometryFixtures.variants[variantId]
  const expectedConsumerId =
    grammarFillPublicGeometryFixtures.compatibleConsumptionPlan
      .surfaceConsumerIds[expectedSurface]
  const expectedConsumerContract = consumerContractRefs[expectedConsumerId]
  const selection = consumption?.selections?.find(
    (candidate) => candidate.familyContractId === 'grammar-fill',
  )
  let occurrence = null
  try {
    occurrence = resolveCanonicalConsumerOccurrence({
      consumption,
      familyContractId: 'grammar-fill',
      groupId: variant?.groupId,
    })
  } catch {
    occurrence = null
  }
  const occurrenceDigest = selection?.projectedOccurrenceDigests?.find(
    (candidate) => candidate?.groupId === variant?.groupId,
  )?.digest
  if (
    !variant
    || variant.surface !== expectedSurface
    || consumption?.disposition !== 'ready'
    || consumption.authorityRef?.manifestId
      !== canonicalAuthorityRef.manifestId
    || consumption.authorityRef?.manifestVersion
      !== canonicalAuthorityRef.manifestVersion
    || consumption.authorityRef?.manifestDigest
      !== canonicalAuthorityRef.manifestDigest
    || grammarFillPublicGeometryFixtures.compatibleConsumptionPlan
      .authorityManifestId !== canonicalAuthorityRef.manifestId
    || grammarFillPublicGeometryFixtures.compatibleConsumptionPlan
      .authorityManifestVersion !== canonicalAuthorityRef.manifestVersion
    || consumption.paperId
      !== grammarFillPublicGeometryFixtures.compatibleConsumptionPlan.paperId
    || consumption.sourceAssetVersion
      !== grammarFillPublicGeometryFixtures.compatibleConsumptionPlan
        .sourceAssetVersion
    || !/^sha256:[a-f0-9]{64}$/.test(consumption.sourceAssetDigest || '')
    || !/^sha256:[a-f0-9]{64}$/.test(consumption.publicationDigest || '')
    || !expectedConsumerContract
    || consumption.consumerContractRef?.id
      !== expectedConsumerContract.id
    || consumption.consumerContractRef?.version
      !== expectedConsumerContract.version
    || consumption.consumerContractRef?.digest
      !== expectedConsumerContract.digest
    || selection?.mode !== 'canonical'
    || !selection.groupIds?.includes(variant.groupId)
    || occurrence?.groupId !== variant.groupId
    || occurrenceDigest !== variant.projectedOccurrenceDigest
  ) {
    const error = new Error(
      `Canonical Grammar Fill geometry fixture is unavailable: ${variantId}`,
    )
    error.code = 'CANONICAL_GRAMMAR_FILL_GEOMETRY_FIXTURE_REJECTED'
    throw error
  }
  return variant
}
