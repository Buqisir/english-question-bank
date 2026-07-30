/**
 * Type declarations for `shared/papersurface/blankRuling.mjs`.
 * Keep this file in sync with `blankRuling.d.ts`.
 */

export type PaperBlankRuling = {
  readonly width: string
  readonly numberSuffix: ''
  readonly numberAlignment: 'center'
  readonly lineStyle: 'single-thin'
  readonly screenLineWidthPx: number
  readonly printLineWidthPt: number
  readonly whiteSpace: 'nowrap'
  readonly hintPlacement: 'immediately-after'
}

export const paperBlankRuling: {
  readonly cloze: PaperBlankRuling
  readonly grammarFill: PaperBlankRuling
  readonly sevenChoices: PaperBlankRuling
}
