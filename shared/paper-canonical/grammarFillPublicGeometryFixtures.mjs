import v15Contract from '../../standards/paper-canonical/rendering/grammar-fill-public-geometry-fixtures-v15.json' with { type: 'json' }
import v16Contract from '../../standards/paper-canonical/rendering/grammar-fill-public-geometry-fixtures-v16.json' with { type: 'json' }

import {
  canonicalAuthorityRef,
  paper2026ISuccessorCandidateAuthorityRef,
} from './authority.mjs'
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

export const grammarFillPublicGeometryFixtures = freezeObject(v16Contract)

const grammarFillFixtureBindings = Object.freeze([
  Object.freeze({
    authorityRef: canonicalAuthorityRef,
    fixtures: freezeObject(v15Contract),
  }),
  Object.freeze({
    authorityRef: paper2026ISuccessorCandidateAuthorityRef,
    fixtures: grammarFillPublicGeometryFixtures,
  }),
])

function fixtureBindingForConsumption(consumption) {
  return grammarFillFixtureBindings.find(({ authorityRef }) =>
    consumption?.authorityRef?.manifestId === authorityRef.manifestId
    && consumption.authorityRef?.manifestVersion === authorityRef.manifestVersion
    && consumption.authorityRef?.manifestDigest === authorityRef.manifestDigest,
  ) || null
}

export function resolveGrammarFillPublicGeometryFixture(
  variantId,
  expectedSurface,
  consumption,
) {
  if (variantId == null) return null
  const binding = fixtureBindingForConsumption(consumption)
  const fixtures = binding?.fixtures
  const authorityRef = binding?.authorityRef
  const variant = fixtures?.variants[variantId]
  const expectedConsumerId =
    fixtures?.compatibleConsumptionPlan
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
      !== authorityRef?.manifestId
    || consumption.authorityRef?.manifestVersion
      !== authorityRef?.manifestVersion
    || consumption.authorityRef?.manifestDigest
      !== authorityRef?.manifestDigest
    || fixtures?.compatibleConsumptionPlan
      .authorityManifestId
      !== authorityRef?.manifestId
    || fixtures?.compatibleConsumptionPlan
      .authorityManifestVersion
      !== authorityRef?.manifestVersion
    || consumption.paperId
      !== fixtures?.compatibleConsumptionPlan.paperId
    || consumption.sourceAssetVersion
      !== fixtures?.compatibleConsumptionPlan
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
