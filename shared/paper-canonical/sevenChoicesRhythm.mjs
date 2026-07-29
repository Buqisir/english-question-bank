import contract from '../../standards/paper-canonical/rendering/seven-choices-rhythm-v2.json' with { type: 'json' }

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

function freezeEdge(edge) {
  return Object.freeze({
    ...edge,
    ...(edge.repeatForbiddenRoles
      ? {
          repeatForbiddenRoles: Object.freeze([
            ...edge.repeatForbiddenRoles,
          ]),
        }
      : {}),
  })
}

export const sevenChoicesRhythm = Object.freeze({
  semanticRoleClasses: freezeRoleClasses(contract.semanticRoleClasses),
  adjacencyGraph: Object.freeze(contract.adjacencyGraph.map(freezeEdge)),
  targets: Object.freeze({
    screen: Object.freeze({ ...contract.targets.screen }),
    printPdf: Object.freeze({ ...contract.targets.printPdf }),
  }),
  goldenGeometryFramework: Object.freeze({
    ...contract.goldenGeometryFramework,
    axes: Object.freeze([...contract.goldenGeometryFramework.axes]),
  }),
  horizontalBankGeometry: Object.freeze({
    ...contract.horizontalBankGeometry,
    rowOccupancy: Object.freeze({
      ...contract.horizontalBankGeometry.rowOccupancy,
    }),
    strategy: Object.freeze({
      ...contract.horizontalBankGeometry.strategy,
    }),
    normalizedMeasurements: Object.freeze({
      ...contract.horizontalBankGeometry.normalizedMeasurements,
    }),
    rendererMapping: Object.freeze({
      screen: Object.freeze({
        ...contract.horizontalBankGeometry.rendererMapping.screen,
      }),
      printPdf: Object.freeze({
        ...contract.horizontalBankGeometry.rendererMapping.printPdf,
      }),
    }),
  }),
  referenceMeasurement: Object.freeze({
    ...contract.referenceMeasurement,
  }),
})
