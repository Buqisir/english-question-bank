import rendererTypography from '../../standards/paper-canonical/rendering/paper-typography-v6.json' with { type: 'json' }

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
