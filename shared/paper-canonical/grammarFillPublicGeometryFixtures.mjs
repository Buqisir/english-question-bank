import contract from '../../standards/paper-canonical/rendering/grammar-fill-public-geometry-fixtures-v16.json' with { type: 'json' }

import { paper2026ISuccessorCandidateAuthorityRef } from './authority.mjs'
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
      !== paper2026ISuccessorCandidateAuthorityRef.manifestId
    || consumption.authorityRef?.manifestVersion
      !== paper2026ISuccessorCandidateAuthorityRef.manifestVersion
    || consumption.authorityRef?.manifestDigest
      !== paper2026ISuccessorCandidateAuthorityRef.manifestDigest
    || grammarFillPublicGeometryFixtures.compatibleConsumptionPlan
      .authorityManifestId
      !== paper2026ISuccessorCandidateAuthorityRef.manifestId
    || grammarFillPublicGeometryFixtures.compatibleConsumptionPlan
      .authorityManifestVersion
      !== paper2026ISuccessorCandidateAuthorityRef.manifestVersion
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
      `Canonical Grammar Fill geometry fixture is unavailable: ${variantId} (expected occurrence ${variant?.projectedOccurrenceDigest ?? 'missing'}, observed ${occurrenceDigest ?? 'missing'})`,
    )
    error.code = 'CANONICAL_GRAMMAR_FILL_GEOMETRY_FIXTURE_REJECTED'
    throw error
  }
  return variant
}
