/**
 * TypeScript types for the Paper Intelligence V0 report JSON schema.
 * Read-only — these types are never written to any database.
 */

export type LoadEvidence = {
  quote: string
  note?: string
  paragraph?: number
}

export type LoadBar = {
  score: number
  label: string
  shortReason: string
  evidenceItems: LoadEvidence[]
}

export type PassageLoads = {
  vocabularyChunkLoad: LoadBar
  grammarLoad: LoadBar
  discourseStructureLoad: LoadBar
  topicBackgroundLoad: LoadBar
  evidenceFindingLoad: LoadBar
}

export type AiInitialBand = {
  band: string
  basis: string
  overrideExplanation?: string
}

export type PassageOutline = {
  mainIdea: string
  logicalLayers: string[]
}

export type KeyChunk = {
  surface: string
  kind: 'word' | 'phrase' | 'chunk'
  ipa?: string
  pos?: string
  meaning: string
  usageNote?: string
}

export type DistractorItem = {
  optionLabel: string
  category: string
  subtype: string | null
  shortReason: string
  quote?: string
}

export type AnswerEvidence = {
  quote: string
  explanationZh: string
}

/**
 * One option on a multiple-choice question (`A` / `B` / `C` / `D`).
 *
 * The V0 schema does not formally require `options` on
 * `QuestionAnalysis` (it lives on the input side, and was historically
 * read through an `unknown` cast in the preview model). The Paper
 * Intelligence pipeline DOES emit it on the output report in practice,
 * so the field is typed here as an optional array — present for new
 * reports, gracefully absent for legacy ones.
 */
export type QuestionOption = {
  label: string
  content: string
}

export type QuestionAnalysis = {
  questionNo: string
  paperSection: string
  questionIndexInPassage: number
  stem: string
  stemTranslation: string
  answer: string
  teacherQuestionType: string
  keywords: string[]
  locatingSentence: string
  answerSentence: string
  answerEvidence: AnswerEvidence
  distractorAnalysis: DistractorItem[]
  synonymSummary: string
  surfaceType: string
  answeringMove: string
  tCard: string
  boundaryFlags: string[]
  reviewNeeded: boolean
  confidence?: number
  /**
   * The displayable A/B/C/D options. Optional because legacy reports
   * may not have this field. Reader must always handle the absent case.
   * The order in this array is whatever the report producer used —
   * downstream UI is expected to sort by `label` for display.
   */
  options?: QuestionOption[]
}

export type PassageReport = {
  paperSection: string
  passageTitle?: string
  loads: PassageLoads
  aiInitialBand: AiInitialBand
  passageOutline: PassageOutline
  keyChunks: KeyChunk[]
  keyChunksNote?: string
  questions: QuestionAnalysis[]
}

export type SourcePaperMeta = {
  paperId: string
  paperName: string
  year: number
  region: string
  section: string
  sourceFile?: string
}

export type PaperIntelligenceReport = {
  schemaVersion: string
  generatedAt: string
  generator: {
    promptVersion: string
    modelId: string | null
    runId: string
  }
  sourcePaper: SourcePaperMeta
  passages: PassageReport[]
  paperLevelNotes?: string
}
