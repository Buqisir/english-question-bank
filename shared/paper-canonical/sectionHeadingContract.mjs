import rendererTypography from '../../standards/paper-canonical/rendering/paper-typography-v9.json' with { type: 'json' }

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

function requireNumber(value, field) {
  if (!Number.isFinite(value)) {
    throw new Error(`Section heading contract lacks ${field}`)
  }
  return value
}

export function sectionHeadingRuntimeFromContract(contract) {
  const anchors = contract?.horizontalAnchors
  const typography = contract?.typography
  if (
    !anchors
    || !typography
    || typeof typography.fontStack !== 'string'
  ) {
    throw new Error('Section heading contract is unavailable')
  }
  const fontSizePt = requireNumber(typography.fontSizePt, 'fontSizePt')
  const lineHeightPt = requireNumber(typography.lineHeightPt, 'lineHeightPt')
  const shared = {
    fontStack: typography.fontStack,
    partHeadingIndentEm:
      requireNumber(anchors.partHeadingIndentEm, 'partHeadingIndentEm'),
    sectionHeadingIndentEm:
      requireNumber(anchors.sectionHeadingIndentEm, 'sectionHeadingIndentEm'),
    groupInstructionFirstLineIndentEm:
      requireNumber(
        anchors.groupInstructionFirstLineIndentEm,
        'groupInstructionFirstLineIndentEm',
      ),
    passageFirstLineIndentEm:
      requireNumber(
        anchors.passageFirstLineIndentEm,
        'passageFirstLineIndentEm',
      ),
    passageContinuationIndentEm:
      requireNumber(
        anchors.passageContinuationIndentEm,
        'passageContinuationIndentEm',
      ),
    numericRunBaselineShiftEm:
      requireNumber(
        typography.numericRunBaselineShiftEm,
        'numericRunBaselineShiftEm',
      ),
  }
  return freeze({
    screen: {
      ...shared,
      fontSizePx: fontSizePt * 4 / 3,
      lineHeightPx: lineHeightPt * 4 / 3,
    },
    printPdf: {
      ...shared,
      fontSizePt,
      lineHeightPt,
    },
  })
}

export const sectionHeadingContract =
  freeze(structuredClone(rendererTypography.sectionHeadingContract))

export const sectionHeadingRuntime =
  sectionHeadingRuntimeFromContract(sectionHeadingContract)

function requireVisibleWeight(value, field) {
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    throw new Error(`Paper Typography authority lacks a valid ${field} weight`)
  }
  return value
}

/**
 * Keeps every visible public-paper weight tied to one renderer-typography
 * authority input. The factory is deliberately exported so the actual
 * consumer seams can be exercised against a distinguishable authority
 * mutation without creating a browser-default or inherited-weight escape.
 */
export function paperTypographyRuntimeFromAuthority(authority) {
  const visibleWeight = authority?.optionAnchorFramework?.visibleWeight
  if (!visibleWeight || authority?.schemaVersion !== 'renderer-typography-v9') {
    throw new Error('Paper Typography v9 authority is unavailable')
  }
  return freeze({
    coordinates: structuredClone(authority.coordinates),
    visibleWeight: {
      questionNumber: requireVisibleWeight(
        visibleWeight.questionNumber,
        'questionNumber',
      ),
      optionLabel: requireVisibleWeight(visibleWeight.optionLabel, 'optionLabel'),
      optionText: requireVisibleWeight(visibleWeight.optionText, 'optionText'),
      sectionHeading: requireVisibleWeight(
        visibleWeight.sectionHeading,
        'sectionHeading',
      ),
      instruction: requireVisibleWeight(
        visibleWeight.instruction,
        'instruction',
      ),
    },
    partToFirstSectionGeometry: structuredClone(
      authority.partToFirstSectionGeometry,
    ),
    footerContract: structuredClone(authority.footerContract),
  })
}

export const paperTypographyRuntime =
  paperTypographyRuntimeFromAuthority(rendererTypography)

export function sectionHeadingTextRuns(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Section heading text must be a string')
  }
  return freeze(
    text
      .split(/(\d+(?:\.\d+)?)/u)
      .filter((value) => value.length > 0)
      .map((value) => ({
        kind: /^\d+(?:\.\d+)?$/u.test(value) ? 'numeric' : 'text',
        text: value,
      })),
  )
}
