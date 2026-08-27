import metricsV1 from '../../standards/paper-canonical/rendering/times-compatible-metrics-v1.json' with { type: 'json' }
import metricsV2 from '../../standards/paper-canonical/rendering/times-compatible-metrics-v2.json' with { type: 'json' }
import rendererTypography from '../../standards/paper-canonical/rendering/paper-typography-v10.json' with { type: 'json' }

import { digestJson, sha256 } from './stable.mjs'

const LABELS = Object.freeze(['A', 'B', 'C', 'D'])

const SHAPING_IMPLEMENTATION = Object.freeze({
  id: 'pinned-times-glyph-and-kern-advance',
  version: '2',
  rounding: 'outward_to_integer_twip',
})

function rulesForMetrics(metrics) {
  return Object.freeze({
    rulesetId: 'abcd-option-layout-v1',
    shapingImplementation: `${SHAPING_IMPLEMENTATION.id}-v${SHAPING_IMPLEMENTATION.version}`,
    shapingImplementationDigest: digestJson(SHAPING_IMPLEMENTATION),
    fontMetricsDigest: digestJson(metrics),
    fontFaceId: metrics.fontFaceId,
    fontSizeHalfPoint: 21,
    optionRowWidthTwip: rendererTypography.optionAnchorFramework.rowWidthTwip,
    minimumGutterTwip: 420,
    fitSafetyTwip: 20,
    fourColumnPitchTwip:
      rendererTypography.optionAnchorFramework.reading.fourColumnStartsTwip[1],
    twoColumnSecondTabTwip:
      rendererTypography.optionAnchorFramework.reading.twoColumnStartsTwip[1],
    oneColumnHangingIndentTwip: 420,
    questionStemAndOuterOptionBlockStartTwip:
      rendererTypography.coordinates.questionStemAndOuterOptionBlockStartTwip,
    rendererTypographyDigest: digestJson(rendererTypography),
  })
}

function layoutContext(metrics) {
  const rules = rulesForMetrics(metrics)
  return Object.freeze({ metrics, rules, rulesetDigest: digestJson(rules) })
}

const LEGACY_CONTEXT = layoutContext(metricsV1)
const CURRENT_CONTEXT = layoutContext(metricsV2)
const CONTEXT_BY_RULESET_DIGEST = new Map([
  [LEGACY_CONTEXT.rulesetDigest, LEGACY_CONTEXT],
  [CURRENT_CONTEXT.rulesetDigest, CURRENT_CONTEXT],
])
const VERIFIED_FONT_CLOSURES = new WeakSet()
const FONT_CLOSURE_METRICS_DIGESTS = new WeakMap()

function deeplyFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deeplyFreeze(nested)
  return value
}

function expectedFontClosure(context) {
  const { metrics, rules } = context
  return deeplyFreeze({
    primary: {
      fontFaceId: metrics.fontFaceId,
      fontFileSha256: metrics.fontFileSha256,
      fontVersion: metrics.fontVersion,
    },
    fallbacks: metrics.fallbacks.map((fallback) => ({
      fontFaceId: fallback.fontFaceId,
      characters: fallback.characters,
      fontFileSha256: fallback.fontFileSha256,
      fontVersion: fallback.fontVersion,
    })),
    fontMetricsDigest: rules.fontMetricsDigest,
    shapingImplementationDigest: rules.shapingImplementationDigest,
  })
}

export const expectedLegacyAbcdRendererFontClosure = expectedFontClosure(LEGACY_CONTEXT)
export const expectedAbcdRendererFontClosure = expectedFontClosure(CURRENT_CONTEXT)
export const expectedAbcdRendererFontClosureV2 = expectedAbcdRendererFontClosure
const EXPECTED_FONT_CLOSURES_BY_DIGEST = new Map([
  [
    digestJson(expectedLegacyAbcdRendererFontClosure),
    expectedLegacyAbcdRendererFontClosure,
  ],
  [digestJson(expectedAbcdRendererFontClosureV2), expectedAbcdRendererFontClosureV2],
])

export function resolveAbcdRendererFontClosure(candidate) {
  const primaryBytes = candidate?.primary?.fontBytes
  const fallbackCandidates = candidate?.fallbacks
  if (
    !(primaryBytes instanceof Uint8Array)
    || !Array.isArray(fallbackCandidates)
    || fallbackCandidates.some(({ fontBytes }) => !(fontBytes instanceof Uint8Array))
  ) {
    return {
      status: 'needs_review',
      reason: 'pinned_renderer_font_closure_unavailable',
    }
  }
  const measuredClosure = {
    primary: {
      fontFaceId: candidate.primary.fontFaceId,
      fontFileSha256: sha256(primaryBytes),
      fontVersion: candidate.primary.fontVersion,
    },
    fallbacks: fallbackCandidates.map((fallback) => ({
      fontFaceId: fallback.fontFaceId,
      characters: fallback.characters,
      fontFileSha256: sha256(fallback.fontBytes),
      fontVersion: fallback.fontVersion,
    })),
    fontMetricsDigest: candidate.fontMetricsDigest,
    shapingImplementationDigest: candidate.shapingImplementationDigest,
  }
  const expected = EXPECTED_FONT_CLOSURES_BY_DIGEST.get(
    digestJson(measuredClosure),
  )
  if (!expected) {
    return {
      status: 'needs_review',
      reason: 'pinned_renderer_font_closure_unavailable',
    }
  }
  const closure = deeplyFreeze(measuredClosure)
  VERIFIED_FONT_CLOSURES.add(closure)
  FONT_CLOSURE_METRICS_DIGESTS.set(closure, expected.fontMetricsDigest)
  return { status: 'ready', closure }
}

function notApplicable() {
  return {
    status: 'not_applicable',
    reason: 'selector_requires_one_question_owned_A_B_C_D_set',
  }
}

function optionText(option) {
  if (!Array.isArray(option?.content) || option.content.length === 0) return null
  const parts = []
  for (const node of option.content) {
    if (node?.kind !== 'text' || typeof node.text !== 'string') return null
    parts.push(node.text)
  }
  return parts.join('')
}

function advanceTwip(text, context) {
  const { metrics, rules } = context
  let units = 0
  const characters = [...text]
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]
    const advance = metrics.glyphAdvanceUnits[character]
    if (!Number.isInteger(advance)) return null
    units += advance
    if (index > 0) units += metrics.kerningAdjustmentUnits[
      `${characters[index - 1]}${character}`
    ] || 0
  }
  return Math.ceil((units * rules.fontSizeHalfPoint) / (metrics.unitsPerEm / 10))
}

function measureOption(option, context) {
  const text = optionText(option)
  if (text === null) return null
  const renderedText = `${option.label}. ${text}`
  const lines = renderedText.split('\n')
  const lineAdvancesTwip = lines.map((line) => advanceTwip(line, context))
  if (lineAdvancesTwip.some((advance) => advance === null)) return null
  const unbreakableAdvancesTwip = lines.flatMap((line) =>
    line.split(/\s+/u).filter(Boolean).map((part) => advanceTwip(part, context)))
  if (unbreakableAdvancesTwip.some((advance) => advance === null)) return null
  return {
    renderedText,
    hardBreaks: lines.length - 1,
    advanceTwip: Math.max(...lineAdvancesTwip),
    unbreakableAdvanceTwip: Math.max(0, ...unbreakableAdvancesTwip),
  }
}

function capacities(rules) {
  return {
    four: [
      rules.fourColumnPitchTwip - rules.minimumGutterTwip - rules.fitSafetyTwip,
      rules.fourColumnPitchTwip - rules.minimumGutterTwip - rules.fitSafetyTwip,
      rules.fourColumnPitchTwip - rules.minimumGutterTwip - rules.fitSafetyTwip,
      rules.optionRowWidthTwip - rules.fourColumnPitchTwip * 3 - rules.fitSafetyTwip,
    ],
    two: [
      rules.twoColumnSecondTabTwip - rules.minimumGutterTwip - rules.fitSafetyTwip,
      rules.optionRowWidthTwip - rules.twoColumnSecondTabTwip - rules.fitSafetyTwip,
      rules.twoColumnSecondTabTwip - rules.minimumGutterTwip - rules.fitSafetyTwip,
      rules.optionRowWidthTwip - rules.twoColumnSecondTabTwip - rules.fitSafetyTwip,
    ],
    one: rules.optionRowWidthTwip - rules.oneColumnHangingIndentTwip - rules.fitSafetyTwip,
  }
}

function placementFor(mode, option, measured, index, rules) {
  if (mode === 'four_columns') {
    return {
      optionId: option.optionId,
      label: option.label,
      row: 0,
      column: index,
      startTwip: index * rules.fourColumnPitchTwip,
      continuationStartTwip: null,
      hardBreaks: measured.hardBreaks,
      advanceTwip: measured.advanceTwip,
      unbreakableAdvanceTwip: measured.unbreakableAdvanceTwip,
      renderedText: measured.renderedText,
    }
  }
  if (mode === 'two_by_two') {
    return {
      optionId: option.optionId,
      label: option.label,
      row: Math.floor(index / 2),
      column: index % 2,
      startTwip: (index % 2) * rules.twoColumnSecondTabTwip,
      continuationStartTwip: null,
      hardBreaks: measured.hardBreaks,
      advanceTwip: measured.advanceTwip,
      unbreakableAdvanceTwip: measured.unbreakableAdvanceTwip,
      renderedText: measured.renderedText,
    }
  }
  return {
    optionId: option.optionId,
    label: option.label,
    row: index,
    column: 0,
    startTwip: 0,
    continuationStartTwip: rules.oneColumnHangingIndentTwip,
    hardBreaks: measured.hardBreaks,
    advanceTwip: measured.advanceTwip,
    unbreakableAdvanceTwip: measured.unbreakableAdvanceTwip,
    renderedText: measured.renderedText,
  }
}

function selectedPlan(mode, optionSet, measured, context) {
  const { rules, rulesetDigest } = context
  const placements = optionSet.options.map((option, index) =>
    placementFor(mode, option, measured[index], index, rules))
  const plan = {
    status: 'selected',
    mode,
    rowCount: mode === 'four_columns' ? 1 : mode === 'two_by_two' ? 2 : 4,
    columnCount: mode === 'four_columns' ? 4 : mode === 'two_by_two' ? 2 : 1,
    rulesetRef: {
      id: rules.rulesetId,
      digest: rulesetDigest,
      shapingImplementationDigest: rules.shapingImplementationDigest,
      fontMetricsDigest: rules.fontMetricsDigest,
      rendererTypographyDigest: rules.rendererTypographyDigest,
    },
    rowWidthTwip: rules.optionRowWidthTwip,
    questionStemAndOuterOptionBlockStartTwip:
      rules.questionStemAndOuterOptionBlockStartTwip,
    placements,
  }
  return {
    ...plan,
    placementSignature: abcdPlacementSignature(plan),
  }
}

/**
 * The sole renderer-typography seam for one Question-owned exact A-D set.
 * Canonical content enters by value; selected layout never mutates or returns
 * into canonical semantics.
 */
function layoutAbcdOptionSetWithContext(optionSet, context) {
  if (
    optionSet?.owner !== 'question'
    || !Array.isArray(optionSet.options)
    || optionSet.options.length !== LABELS.length
    || optionSet.options.some((option, index) =>
      option?.label !== LABELS[index] || typeof option.optionId !== 'string')
  ) return notApplicable()

  const measured = optionSet.options.map((option) => measureOption(option, context))
  if (measured.some((value) => value === null)) {
    return {
      status: 'needs_review',
      reason: 'one_column_contains_unrenderable_unbreakable_content',
    }
  }

  const cap = capacities(context.rules)
  const hasHardBreak = measured.some(({ hardBreaks }) => hardBreaks > 0)
  if (!hasHardBreak && measured.every(({ advanceTwip }, index) => advanceTwip <= cap.four[index])) {
    return selectedPlan('four_columns', optionSet, measured, context)
  }
  if (!hasHardBreak && measured.every(({ advanceTwip }, index) => advanceTwip <= cap.two[index])) {
    return selectedPlan('two_by_two', optionSet, measured, context)
  }
  if (measured.some(({ unbreakableAdvanceTwip }) => unbreakableAdvanceTwip > cap.one)) {
    return {
      status: 'needs_review',
      reason: 'one_column_contains_unrenderable_unbreakable_content',
    }
  }
  return selectedPlan('one_column', optionSet, measured, context)
}

export function layoutAbcdOptionSet(optionSet) {
  return layoutAbcdOptionSetWithContext(optionSet, CURRENT_CONTEXT)
}

export function layoutAbcdOptionSetV1(optionSet) {
  return layoutAbcdOptionSetWithContext(optionSet, LEGACY_CONTEXT)
}

export function layoutAbcdOptionSetV2(optionSet) {
  return layoutAbcdOptionSetWithContext(optionSet, CURRENT_CONTEXT)
}

/**
 * Cloze's digest-bound golden family uses one fixed A/B/C/D track strategy.
 * Soft-wrapping content may continue inside its own track, but a hard break,
 * unsupported glyph, or unbreakable token wider than that track fails closed.
 */
function layoutFixedFourColumnClozeOptionSetWithContext(optionSet, context) {
  if (
    optionSet?.owner !== 'question'
    || !Array.isArray(optionSet.options)
    || optionSet.options.length !== LABELS.length
    || optionSet.options.some((option, index) =>
      option?.label !== LABELS[index] || typeof option.optionId !== 'string')
  ) return notApplicable()

  const measured = optionSet.options.map((option) => measureOption(option, context))
  if (measured.some((value) => value === null)) {
    return {
      status: 'needs_review',
      reason: 'fixed_four_column_contains_unrenderable_content',
    }
  }
  const cap = capacities(context.rules).four
  if (
    measured.some(
      ({ hardBreaks, unbreakableAdvanceTwip }, index) =>
        hardBreaks > 0 || unbreakableAdvanceTwip > cap[index],
    )
  ) {
    return {
      status: 'needs_review',
      reason: 'fixed_four_column_contains_unrenderable_content',
    }
  }
  return selectedPlan('four_columns', optionSet, measured, context)
}

export function layoutFixedFourColumnClozeOptionSet(optionSet) {
  return layoutFixedFourColumnClozeOptionSetWithContext(
    optionSet,
    CURRENT_CONTEXT,
  )
}

export function layoutFixedFourColumnClozeOptionSetV1(optionSet) {
  return layoutFixedFourColumnClozeOptionSetWithContext(
    optionSet,
    LEGACY_CONTEXT,
  )
}

export function layoutFixedFourColumnClozeOptionSetV2(optionSet) {
  return layoutFixedFourColumnClozeOptionSetWithContext(
    optionSet,
    CURRENT_CONTEXT,
  )
}

function assertAuthoritativePlan(plan) {
  if (plan?.status !== 'selected') {
    throw new TypeError('A selected A-D layout plan is required')
  }
  const context = CONTEXT_BY_RULESET_DIGEST.get(plan.rulesetRef?.digest)
  const rules = context?.rules
  if (
    !context
    || plan.rulesetRef?.id !== rules.rulesetId
    || plan.rulesetRef?.shapingImplementationDigest
      !== rules.shapingImplementationDigest
    || plan.rulesetRef?.fontMetricsDigest !== rules.fontMetricsDigest
    || plan.rulesetRef?.rendererTypographyDigest
      !== rules.rendererTypographyDigest
    || plan.questionStemAndOuterOptionBlockStartTwip
      !== rules.questionStemAndOuterOptionBlockStartTwip
    || plan.placementSignature !== abcdPlacementSignature(plan)
  ) {
    const error = new Error(
      'The A-D layout plan differs from its renderer-typography authority',
    )
    error.code = 'ABCD_LAYOUT_AUTHORITY_MISMATCH'
    throw error
  }
  return context
}

function assertTranslatable(plan, fontClosure) {
  const context = assertAuthoritativePlan(plan)
  if (
    !VERIFIED_FONT_CLOSURES.has(fontClosure)
    || FONT_CLOSURE_METRICS_DIGESTS.get(fontClosure)
      !== context.rules.fontMetricsDigest
  ) {
    const error = new Error('The pinned renderer font closure is unavailable')
    error.code = 'ABCD_RENDERER_FONT_CLOSURE_UNAVAILABLE'
    throw error
  }
  return context
}

export function abcdPlacementSignature(plan) {
  return digestJson({
    mode: plan.mode,
    rowWidthTwip: plan.rowWidthTwip,
    questionStemAndOuterOptionBlockStartTwip:
      plan.questionStemAndOuterOptionBlockStartTwip,
    placements: plan.placements.map((placement) => ({
      label: placement.label,
      row: placement.row,
      column: placement.column,
      startTwip: placement.startTwip,
      continuationStartTwip: placement.continuationStartTwip,
    })),
  })
}

function pointPlacements(plan) {
  return plan.placements.map((placement) => ({
    ...placement,
    startPt: placement.startTwip / 20,
    continuationStartPt:
      placement.continuationStartTwip === null
        ? null
        : placement.continuationStartTwip / 20,
  }))
}

export function translateAbcdPlanToPointPlacement(plan) {
  assertAuthoritativePlan(plan)
  const columnStartsTwip = [...new Set(
    plan.placements.map(({ startTwip }) => startTwip),
  )].sort((left, right) => left - right)
  const columnStartsPt = columnStartsTwip.map((startTwip) => startTwip / 20)
  const rowWidthPt = plan.rowWidthTwip / 20
  return {
    mode: plan.mode,
    placementSignature: plan.placementSignature,
    questionStemStartTwip:
      plan.questionStemAndOuterOptionBlockStartTwip,
    questionStemStartPt:
      plan.questionStemAndOuterOptionBlockStartTwip / 20,
    rowWidthPt,
    columnStartsPt,
    columnWidthsPt: columnStartsTwip.map(
      (startTwip, index) =>
        ((columnStartsTwip[index + 1] ?? plan.rowWidthTwip) - startTwip) / 20,
    ),
    placements: pointPlacements(plan),
  }
}

function translateAbcdPlanToPointSurface(plan, fontClosure, renderer) {
  const { rules } = assertTranslatable(plan, fontClosure)
  const placement = translateAbcdPlanToPointPlacement(plan)
  return {
    renderer,
    ...placement,
    fontSizeHalfPoint: rules.fontSizeHalfPoint,
    denseWhiteSpace: plan.mode === 'one_column' ? 'normal' : 'nowrap',
    clipping: 'forbidden',
    shrinkToFit: false,
  }
}

export function translateAbcdPlanToPaperSurface(plan, fontClosure) {
  return translateAbcdPlanToPointSurface(plan, fontClosure, 'paper_surface')
}

export function translateAbcdPlanToPrintPdf(plan, fontClosure) {
  return translateAbcdPlanToPointSurface(plan, fontClosure, 'print_pdf')
}

export const abcdLayoutRules = CURRENT_CONTEXT.rules
