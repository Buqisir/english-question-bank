import contract from '../../standards/paper-canonical/rendering/cloze-rhythm-v4.json' with { type: 'json' }
import { resolveConsumerContract } from './consumers.mjs'
import { authorityRefForManifestDigest, resolveCanonicalAuthority } from './authority.mjs'

function freezeRoleClasses(roleClasses) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(roleClasses).map(([className, roles]) => [
        className,
        Object.freeze([...roles]),
      ]),
    ),
  )
}

export const clozeRhythm = Object.freeze({
  paperTypographyDelegation: Object.freeze({
    ...contract.paperTypographyDelegation,
  }),
  semanticRoleClasses: freezeRoleClasses(contract.semanticRoleClasses),
  adjacencyGraph: Object.freeze(
    contract.adjacencyGraph.map((edge) => Object.freeze({ ...edge })),
  ),
  targets: Object.freeze({
    screen: Object.freeze({ ...contract.targets.screen }),
    printPdf: Object.freeze({ ...contract.targets.printPdf }),
  }),
  blankGeometry: Object.freeze({ ...contract.blankGeometry }),
  horizontalChoiceGeometry: Object.freeze({
    rowOccupancy: Object.freeze({
      ...contract.horizontalChoiceGeometry.rowOccupancy,
    }),
    strategy: Object.freeze({
      ...contract.horizontalChoiceGeometry.strategy,
    }),
    rendererMapping: Object.freeze({
      ...contract.horizontalChoiceGeometry.rendererMapping,
      columnStartsPt: Object.freeze([
        ...contract.horizontalChoiceGeometry.rendererMapping.columnStartsPt,
      ]),
      columnWidthsPt: Object.freeze([
        ...contract.horizontalChoiceGeometry.rendererMapping.columnWidthsPt,
      ]),
    }),
  }),
  goldenGeometryFramework: Object.freeze({
    ...contract.goldenGeometryFramework,
    axes: Object.freeze([...contract.goldenGeometryFramework.axes]),
  }),
  referenceMeasurement: Object.freeze({
    ...contract.referenceMeasurement,
  }),
})

function mappingFor(rhythm) {
  const mapping = rhythm.horizontalChoiceGeometry.rendererMapping
  return Object.freeze({
    ...mapping,
    ...(mapping.columnStartsPt ? { columnStartsPt: Object.freeze([...mapping.columnStartsPt]) } : {}),
    ...(mapping.columnWidthsPt ? { columnWidthsPt: Object.freeze([...mapping.columnWidthsPt]) } : {}),
    ...(mapping.columnWidthSharesPt ? { columnWidthSharesPt: Object.freeze([...mapping.columnWidthSharesPt]) } : {}),
    proportional: mapping.proportional === true,
  })
}

export function resolveConsumerClozeGeometry(ref) {
  if (!ref) return mappingFor(contract)
  const resolved = resolveConsumerContract(ref)
  if (!resolved.ok) {
    throw Object.assign(new Error('Invalid cloze consumer contract'), { code: 'CANONICAL_CONSUMPTION_REJECTED' })
  }
  const authority = resolveCanonicalAuthority(authorityRefForManifestDigest(resolved.contract.authorityManifestDigest))
  const rhythm = authority.closure.artifacts['renderer-cloze-rhythm']
  if (!rhythm) {
    throw Object.assign(new Error('Consumer has no cloze geometry'), { code: 'CANONICAL_CONSUMPTION_REJECTED' })
  }
  return mappingFor(rhythm)
}
