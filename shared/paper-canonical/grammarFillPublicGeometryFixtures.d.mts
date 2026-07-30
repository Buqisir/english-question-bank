// Keep this file byte-for-byte aligned with grammarFillPublicGeometryFixtures.d.ts.
export type GrammarFillPublicGeometrySurface =
  | 'screen'
  | 'print_html'
  | 'print_pdf'

export type GrammarFillPublicGeometryFixture = Readonly<{
  surface: GrammarFillPublicGeometrySurface
  groupId: string
  projectedOccurrenceDigest: string
  paragraphWidths: readonly Readonly<{
    paragraphId: string
    usableWidthEm: number
  }>[]
  pageBreakBeforeQuestionId: string | null
}>

export declare const grammarFillPublicGeometryFixtures: Readonly<{
  schemaVersion: 'grammar-fill-public-geometry-fixtures-v3'
  id: 'grammar-fill-public-geometry-fixtures'
  version: '3'
  owner: 'renderer_typography'
  paper: 'a4'
  sourceOracle: Readonly<{ path: string; sha256: string }>
  constructionBoundary:
    'fixture_selected_before_public_producer_and_output_rendered_unchanged'
  horizontalUnit: 'em'
  compatibleConsumptionPlan: Readonly<{
    paperId: 'paper-2026-i'
    sourceAssetVersion: 1
    authorityManifestId: 'paper-canonical'
    authorityManifestVersion: '24'
    surfaceConsumerIds: Readonly<{
      screen: 'screen'
      print_html: 'print_pdf'
      print_pdf: 'print_pdf'
    }>
  }>
  variants: Readonly<Record<string, GrammarFillPublicGeometryFixture>>
}>

export declare function resolveGrammarFillPublicGeometryFixture(
  variantId: string | null | undefined,
  expectedSurface: GrammarFillPublicGeometrySurface,
  consumption: unknown,
): GrammarFillPublicGeometryFixture | null
