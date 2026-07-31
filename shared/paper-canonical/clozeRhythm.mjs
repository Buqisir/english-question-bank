import contract from '../../standards/paper-canonical/rendering/cloze-rhythm-v3.json' with { type: 'json' }

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
