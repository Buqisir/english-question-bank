import rendererTypography from '../../standards/paper-canonical/rendering/paper-typography-v9.json' with { type: 'json' }
import { canonicalAuthorityRef, resolveCanonicalAuthority } from './authority.mjs'
import { digestJson } from './stable.mjs'

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

const canonicalAuthority = resolveCanonicalAuthority(canonicalAuthorityRef)
if (!canonicalAuthority.ok) {
  throw new Error('Paper Typography v9 authority cannot resolve the current manifest')
}
const canonicalTypographyAuthority =
  canonicalAuthority.closure.artifacts['renderer-typography']
const canonicalTypographyDescriptor = canonicalAuthority.closure.manifest.artifacts.find(
  (artifact) => artifact.id === 'renderer-typography',
)
if (!canonicalTypographyAuthority || !canonicalTypographyDescriptor) {
  throw new Error('Paper Typography v9 authority is absent from the current manifest closure')
}

const PAPER_TYPOGRAPHY_BINDING_IDENTITY = Object.freeze({
  id: canonicalTypographyDescriptor.id,
  authorityId: canonicalTypographyAuthority.id,
  owner: canonicalTypographyDescriptor.owner,
  path: canonicalTypographyDescriptor.path,
  schemaId: canonicalTypographyDescriptor.schemaId,
  schemaVersion: canonicalTypographyAuthority.schemaVersion,
  version: canonicalTypographyAuthority.version,
  source: canonicalTypographyAuthority.provenance.source,
  producer: canonicalTypographyAuthority.provenance.producer,
  manifestId: canonicalAuthorityRef.manifestId,
  manifestVersion: canonicalAuthorityRef.manifestVersion,
  manifestDigest: canonicalAuthorityRef.manifestDigest,
})

export const paperTypographyAuthorityBinding = Object.freeze({
  ...PAPER_TYPOGRAPHY_BINDING_IDENTITY,
  sha256: canonicalTypographyDescriptor.sha256,
})

function assertPaperTypographyAuthorityBinding(authority, binding) {
  if (!binding || typeof binding !== 'object') {
    throw new Error('Paper Typography v9 authority binding is unavailable')
  }
  for (const [field, expected] of Object.entries(
    PAPER_TYPOGRAPHY_BINDING_IDENTITY,
  )) {
    if (binding[field] !== expected) {
      throw new Error(`Paper Typography v9 authority binding has invalid ${field}`)
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(binding.sha256 || '')) {
    throw new Error('Paper Typography v9 authority binding lacks a valid hash')
  }
  if (
    authority?.schemaVersion !== binding.schemaVersion
    || authority?.id !== binding.authorityId
    || authority?.version !== binding.version
    || authority?.owner !== binding.owner
    || authority?.provenance?.source !== binding.source
    || authority?.provenance?.producer !== binding.producer
  ) {
    throw new Error('Paper Typography v9 authority metadata does not match its binding')
  }
  if (digestJson(authority) !== binding.sha256) {
    throw new Error('Paper Typography v9 authority hash does not match its binding')
  }
}

function paperTypographyRuntimeFromBoundAuthority(
  authority,
  binding,
  { allowNonCanonicalMutation = false } = {},
) {
  assertPaperTypographyAuthorityBinding(authority, binding)
  if (!allowNonCanonicalMutation
    && binding.sha256 !== paperTypographyAuthorityBinding.sha256) {
    throw new Error('Paper Typography v9 authority hash is not the current Manifest v34 artifact')
  }
  const visibleWeight = authority?.optionAnchorFramework?.visibleWeight
  if (!visibleWeight) {
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

/**
 * Keeps every visible public-paper weight tied to one renderer-typography
 * authority input. The factory is deliberately exported so the actual
 * consumer seams can be exercised against a distinguishable authority
 * mutation without creating a browser-default or inherited-weight escape.
 */
export function paperTypographyRuntimeFromAuthority(
  authority,
  binding = paperTypographyAuthorityBinding,
) {
  return paperTypographyRuntimeFromBoundAuthority(authority, binding)
}

/**
 * Test-only seam for a fully bound, distinguishable authority mutation. The
 * production factory above remains pinned to the current Manifest v34 hash.
 */
export function paperTypographyRuntimeFromAuthorityForTest(authority, binding) {
  return paperTypographyRuntimeFromBoundAuthority(
    authority,
    binding,
    { allowNonCanonicalMutation: true },
  )
}

export const paperTypographyRuntime =
  paperTypographyRuntimeFromAuthority(
    rendererTypography,
    paperTypographyAuthorityBinding,
  )

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
