export type GrammarFillPublicGeometrySurface =
  | 'screen'
  | 'print_html'
  | 'print_pdf'

export type GrammarFillPublicGeometryFixture = Readonly<{
  surface: GrammarFillPublicGeometrySurface
  groupId: string
  paragraphWidths: readonly Readonly<{
    paragraphId: string
    usableWidthEm: number
  }>[]
  pageBreakBeforeQuestionId: string | null
}>

export declare const grammarFillPublicGeometryFixtures: Readonly<{
  schemaVersion: 'grammar-fill-public-geometry-fixtures-v1'
  id: 'grammar-fill-public-geometry-fixtures'
  version: '1'
  owner: 'renderer_typography'
  paper: 'a4'
  sourceOracle: Readonly<{ path: string; sha256: string }>
  constructionBoundary:
    'fixture_selected_before_public_producer_and_output_rendered_unchanged'
  horizontalUnit: 'em'
  variants: Readonly<Record<string, GrammarFillPublicGeometryFixture>>
}>

export declare function resolveGrammarFillPublicGeometryFixture(
  variantId: string | null | undefined,
  expectedSurface: GrammarFillPublicGeometrySurface,
): GrammarFillPublicGeometryFixture | null
