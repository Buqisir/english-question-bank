export type ReadingOptionFigureConsumerId = 'screen' | 'print_pdf'

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
  readonly optionMode: 'figure'
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
  readonly mode: 'figure_four_equal_tracks'
  readonly layoutId: 'reading-option-figure-layout'
  readonly layoutVersion: '1'
  readonly layoutDigest: string
  readonly layoutAuthorityRef: Readonly<Record<string, string>>
  readonly placementSignature: string
  readonly rowStartPt: 17.3
  readonly rowWidthPt: 438.2
  readonly trackCount: 4
  readonly trackWidthPt: 109.55
  readonly labelFontSizePt: 10.5
  readonly labelLineHeightPt: 18
  readonly imageBoxWidthPt: 96
  readonly imageBoxHeightPt: 60
  readonly objectFit: 'contain'
  readonly objectPosition: 'center'
  readonly stemToBankGapPt: 4.5
  readonly labelToBoxGapPt: 4.5
  readonly questionTailGapPt: 9
  readonly minTrackWidthPt: 48
  readonly responsivePolicy: 'fit_down_then_overflow'
  readonly extremeOverflow: 'horizontal'
  readonly paginationPolicy: 'move_whole_question_to_next_page'
  readonly placements: readonly {
    readonly optionId: string
    readonly label: 'A' | 'B' | 'C' | 'D'
    readonly trackIndex: number
    readonly neutralAlt: string
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
  }
  question: ReadingOptionFigureProjectedQuestion<ConsumerId>
}): ReadingOptionFigurePlacement
