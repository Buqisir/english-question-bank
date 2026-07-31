import contract from '../../standards/paper-canonical/rendering/continuation-writing-rhythm-v4.json' with { type: 'json' }

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

export const continuationWritingRhythm = Object.freeze({
  semanticRoleClasses: freezeRoleClasses(contract.semanticRoleClasses),
  adjacencyGraph: Object.freeze(
    contract.adjacencyGraph.map((edge) => Object.freeze({ ...edge })),
  ),
  targets: Object.freeze({
    screen: Object.freeze({ ...contract.targets.screen }),
    printPdf: Object.freeze({ ...contract.targets.printPdf }),
  }),
  responseGeometry: Object.freeze({ ...contract.responseGeometry }),
  starterGeometry: Object.freeze({ ...contract.starterGeometry }),
  rendererMapping: Object.freeze({
    screen: Object.freeze({ ...contract.rendererMapping.screen }),
    printPdf: Object.freeze({ ...contract.rendererMapping.printPdf }),
  }),
  goldenGeometryFramework: Object.freeze({
    ...contract.goldenGeometryFramework,
    axes: Object.freeze([...contract.goldenGeometryFramework.axes]),
  }),
  referenceMeasurement: Object.freeze({ ...contract.referenceMeasurement }),
  publicArtifactOracle: Object.freeze({ ...contract.publicArtifactOracle }),
  observedCoverageOracle: Object.freeze({
    ...contract.observedCoverageOracle,
  }),
})
