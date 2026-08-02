import type {
  buildCanonicalApplicationWritingConsumptionSurfaceData,
  buildCanonicalContinuationWritingConsumptionSurfaceData,
} from '../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'

type ApplicationSurface = ReturnType<
  typeof buildCanonicalApplicationWritingConsumptionSurfaceData
>
type ContinuationSurface = ReturnType<
  typeof buildCanonicalContinuationWritingConsumptionSurfaceData
>

declare const application: ApplicationSurface
declare const continuation: ContinuationSurface

// @ts-expect-error a consumer must narrow writingMode before reading rich-only parts
application.answerRegion.givenTop
// @ts-expect-error a consumer must narrow writingMode before reading a rich-only ruling
continuation.wordCountRuling.target

if (application.writingMode === 'legacy_opaque') {
  const ownership: 'product' = application.answerRegion.ownership
  void ownership
  // @ts-expect-error opaque Application has no source-claimed fixed response parts
  application.answerRegion.givenTop
} else {
  const fixedTop = application.answerRegion.givenTop
  void fixedTop
}

if (continuation.writingMode === 'legacy_opaque') {
  const target: number = continuation.wordCountTarget
  void target
  // @ts-expect-error opaque Continuation has no rich word-count target member
  continuation.wordCountRuling.target
} else {
  const richTarget: number = continuation.wordCountRuling.target
  void richTarget
}
