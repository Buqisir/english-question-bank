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
  readonly ruleVerticalAlignment: 'blank-bottom'
  readonly whiteSpace: 'nowrap'
  readonly hintPlacement: 'immediately-after'
}

export function grammarFillBlankRulingForRhythm(rhythm: Readonly<{
  ruleVerticalGeometry: Readonly<{
    verticalAlignment?: 'blank-bottom'
    screenRuleThicknessPx: number
    printPdfRuleThicknessPt: number
  }>
}>): PaperBlankRuling

export const paperBlankRuling: {
  readonly cloze: PaperBlankRuling
  readonly sevenChoices: PaperBlankRuling
}
