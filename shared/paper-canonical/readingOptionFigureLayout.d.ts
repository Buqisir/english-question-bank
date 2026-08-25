// Keep the TypeScript and ESM declaration surfaces byte-identical.

export type ReadingOptionFigureConsumerId = 'screen' | 'print_pdf'

export type ReadingOptionFigureSourceLayoutSchemaRef = Readonly<{
  authorityManifestId: 'paper-canonical'
  authorityManifestVersion: '47'
  authorityManifestDigest: string
  schemaId: 'reading-option-figure-source-layout-intent-v1'
  schemaDigest: string
}>

export type ReadingOptionFigureSourceLayoutRequirement = Readonly<{
  schemaVersion: 'reading-option-figure-source-layout-requirement-v1'
  intentSchemaRef: ReadingOptionFigureSourceLayoutSchemaRef
  intentDigest: string
}>

export type ReadingOptionFigureSourceLayoutIntent = Readonly<{
  schemaVersion: 'reading-option-figure-source-layout-intent-v1'
  questionId: string
  sourcePage: number
  coordinateSystem: 'question_content_box_pt'
  measurementEvidence: Readonly<{
    kind: 'digest_bound_external_evidence'
    evidenceSchemaVersion: string
    evidenceDigest: string
    sourceDocumentSha256: string
  }>
  rowStartPt: number
  rowWidthPt: number
  bankHeightPt: number
  labelFontSizePt: number
  labelLineHeightPt: number
  stemToBankGapPt: number
  questionTailGapPt: number
  placements: ReadonlyArray<Readonly<{
    optionId: string
    label: 'A' | 'B' | 'C' | 'D'
    sourceSpanId: string
    sourcePlacementMatrix: ReadonlyArray<number>
    labelLeftPt: number
    labelTopPt: number
    imageLeftPt: number
    imageTopPt: number
    imageWidthPt: number
    imageHeightPt: number
  }>>
  intentDigest: string
}>

export type ReadingOptionFigureProjectedOption<Label extends 'A' | 'B' | 'C' | 'D'> = {
  readonly optionId: string
  readonly label: Label
  readonly kind: 'figure'
  readonly figure: {
    readonly mediaId: string
    readonly mediaArtifact: {
      readonly mimeType: 'image/png'
      readonly encodedBytes: string
      readonly sha256: string
    }
    readonly accessibility: {
      readonly kind: 'neutral_option_identity'
      readonly optionLabel: Label
    }
  }
}

export type ReadingOptionFigureProjectedQuestion<
  ConsumerId extends ReadingOptionFigureConsumerId = ReadingOptionFigureConsumerId,
> = {
  readonly questionId: string
  readonly optionMode: 'figure'
  readonly figureLayoutIntentRequirement?: ReadingOptionFigureSourceLayoutRequirement
  readonly options: readonly [
    ReadingOptionFigureProjectedOption<'A'>,
    ReadingOptionFigureProjectedOption<'B'>,
    ReadingOptionFigureProjectedOption<'C'>,
    ReadingOptionFigureProjectedOption<'D'>,
  ]
} & (ConsumerId extends 'print_pdf'
  ? { readonly correctOptionId: string }
  : { readonly correctOptionId?: never })

export type ReadingOptionFigurePlacement = {
  readonly mode: 'figure_four_equal_tracks' | 'figure_source_measured'
  readonly layoutId: 'reading-option-figure-layout'
  readonly layoutVersion: '1'
  readonly layoutDigest: string
  readonly layoutAuthorityRef: Readonly<Record<string, string>>
  readonly placementSignature: string
  readonly sourceIntentDigest?: string
  readonly rowStartPt: number
  readonly rowWidthPt: number
  readonly bankHeightPt?: number
  readonly trackCount: 4
  readonly trackWidthPt: 109.55
  readonly labelFontSizePt: number
  readonly labelLineHeightPt: number
  readonly imageBoxWidthPt: 96
  readonly imageBoxHeightPt: 60
  readonly objectFit: 'contain' | 'fill'
  readonly objectPosition: 'center'
  readonly stemToBankGapPt: number
  readonly labelToBoxGapPt: number
  readonly questionTailGapPt: number
  readonly sourceMatrixScalePolicy?: 'reproduce_source_authored_xy_scale'
  readonly consumerTransformPolicy?: 'no_additional_crop_or_stretch'
  readonly minTrackWidthPt: 48
  readonly responsivePolicy: 'fit_down_then_overflow'
  readonly extremeOverflow: 'horizontal'
  readonly paginationPolicy: 'move_whole_question_to_next_page'
  readonly placements: readonly {
    readonly optionId: string
    readonly label: 'A' | 'B' | 'C' | 'D'
    readonly trackIndex?: number
    readonly neutralAlt: string
    readonly sourceSpanId?: string
    readonly sourcePlacementMatrix?: ReadonlyArray<number>
    readonly labelLeftPt?: number
    readonly labelTopPt?: number
    readonly imageLeftPt?: number
    readonly imageTopPt?: number
    readonly imageWidthPt?: number
    readonly imageHeightPt?: number
  }[]
}

export const readingOptionFigureLayout: Readonly<Record<string, unknown>>
export const readingOptionFigureLayoutRef: Readonly<{
  id: 'reading-option-figure-layout'
  version: '1'
  digest: string
  authorityRef: Readonly<Record<string, string>>
}>
export function translateReadingOptionFigureLayout<
  ConsumerId extends ReadingOptionFigureConsumerId,
>(input: {
  consumerId: ConsumerId
  consumption: {
    readonly authorityRef: Readonly<Record<string, string>>
    readonly consumerContractRef: Readonly<Record<string, string>>
    readonly figureLayoutIntents?: ReadonlyArray<ReadingOptionFigureSourceLayoutIntent>
  }
  question: ReadingOptionFigureProjectedQuestion<ConsumerId>
}): ReadingOptionFigurePlacement
