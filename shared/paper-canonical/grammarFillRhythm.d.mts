export type GrammarFillRhythm = Readonly<{
  schemaVersion: 'grammar-fill-rhythm-v1'
  id: 'grammar-fill-rhythm'
  version: '1'
  adjacencyGraph: ReadonlyArray<Readonly<Record<string, unknown>>>
  targets: Readonly<Record<string, Readonly<Record<string, number>>>>
  blankGeometry: Readonly<Record<string, string | number | boolean>>
  promptGeometry: Readonly<Record<string, string | number>>
  rendererMapping: Readonly<{
    screen: Readonly<{
      baselineStepPx: number
      instructionMarginBottomPx: number
      followingSectionMarginTopPx: number
      writingCardMarginTopPx: Readonly<{
        plain: number
        lecture: number
      }>
    }>
    printPdf: Readonly<{
      baselineStepPt: number
      instructionMarginBottomPt: number
      followingSectionMarginTopPt: number
    }>
  }>
  publicArtifactOracle: Readonly<{
    paperId: string
    sourceAssetVersion: number
    expectedProjectedOccurrenceDigest: string
    adversarialProjectedOccurrenceDigests: Readonly<Record<string, string>>
    sourceBindings: Readonly<Record<string, Readonly<Record<string, string | number>>>>
    grammarFill: Readonly<{
      groupId: string
      paragraphIds: ReadonlyArray<string>
      questionIds: ReadonlyArray<string>
      blankIds: ReadonlyArray<string>
      prompts: Readonly<Record<string, string | null>>
      answers: Readonly<Record<string, string>>
    }>
  }>
}>

export declare const grammarFillRhythm: GrammarFillRhythm
