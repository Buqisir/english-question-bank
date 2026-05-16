/**
 * Barrel for the evidence-linking layer. Consumers should import from this
 * file rather than reaching into individual modules so that the public API
 * stays explicit and the internals can be reorganised without churn.
 */

export {
  ATTR_LINK_SOURCE,
  ATTR_OPTION_ANCHOR,
  ATTR_QUOTE_ANCHOR,
  ATTR_SENTENCE_ID,
  cssEscape,
  formatOptionSourceKey,
  formatQuoteTargetKey,
  formatSentenceTargetKey,
  formatStemSourceKey,
  optionBadgeSourceSelector,
  optionLegacySourceSelector,
  quoteTargetSelector,
  sentenceTargetSelector,
  stemSourceSelector,
} from './anchorKeys.ts'
export type { OptionKey } from './anchorKeys.ts'

export {
  layoutSentenceAnnotations,
  locateQuoteInSentence,
  normalizeQuoteOnly,
  normalizeWithMap,
  planSentenceRender,
} from './quoteAnchors.ts'
export type {
  LocatedAnnotation,
  QuoteRange,
  SentenceAnnotationLayout,
  SentenceRenderPlan,
  SentenceRenderSegment,
} from './quoteAnchors.ts'

export {
  advanceAnimationInstance,
  buildCubicPath,
  computeOverlayGeometry,
  createAnimationInstanceState,
  detectReducedMotion,
  findActiveLink,
  planScrollIntoView,
  rectsToEndpoints,
  resolveSource,
  resolveTarget,
  sourceSelectorsFor,
  targetSelectorsFor,
} from './evidenceLinking.ts'
export type {
  AnimationInstanceState,
  Geometry,
  LinkEndpoints,
  MatchMediaLike,
  RectLike,
  ResolvedTarget,
  ScrollPlan,
  ScrollPlanInput,
} from './evidenceLinking.ts'

export { useEvidenceLinkOverlay } from './useEvidenceLinkOverlay.ts'
export type {
  UseEvidenceLinkOverlayArgs,
  UseEvidenceLinkOverlayResult,
} from './useEvidenceLinkOverlay.ts'
