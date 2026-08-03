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

export type GrammarFillScreenRuling = {
  readonly rhythmSchemaVersion:
    | 'grammar-fill-rhythm-v5'
    | 'grammar-fill-rhythm-v6'
    | 'grammar-fill-rhythm-v7'
  readonly blankWidth: string
  readonly screenRuleWidth: string
  readonly ruleAlignItems: 'flex-end'
  readonly baselineStep: string
  readonly promptGap: string
}

export function grammarFillBlankRulingForRhythm(rhythm: Readonly<{
  ruleVerticalGeometry: Readonly<{
    verticalAlignment?: 'blank-bottom'
    screenRuleThicknessPx: number
    printPdfRuleThicknessPt: number
  }>
}>): PaperBlankRuling

export function grammarFillScreenRulingForCanonicalConsumption(input: Readonly<{
  paperId: unknown
  authorityRef: unknown
}>): GrammarFillScreenRuling

export const paperBlankRuling: {
  readonly cloze: PaperBlankRuling
  readonly sevenChoices: PaperBlankRuling
}
