/**
 * Paper Asset V1 — Official TypeScript contract for the whole-paper asset schema.
 *
 * This file defines types only. It does NOT wire into runtime UI in C6a-1.
 * Import unit = whole paper. PaperSurface target = full English exam standard layout.
 */

// ─── Top-Level ──────────────────────────────────────────────────────────────────

export type PaperAssetV1 = {
  schemaVersion: 'paper-asset-v1'
  paper: PaperAssetPaper
  sources: PaperAssetSources
  layoutTree: PaperLayoutTree
  content: PaperContent
  answerKey: AnswerKey
  analysis: PaperAnalysis
}

// ─── Paper Metadata ─────────────────────────────────────────────────────────────

export type PaperAssetPaper = {
  paperId: string
  title: string
  subject: string
  source: string
  assetVersion: number
  status: 'draft' | 'published'
}

// ─── Sources ────────────────────────────────────────────────────────────────────

export type PaperAssetSources = {
  primarySourceType: 'docx' | 'pdf' | 'image'
  docx?: PaperSourceDocx
}

export type PaperSourceDocx = {
  fileName: string
  sha256: string
  sourcePath: string
  extractedTextSummary?: string
  sourceNote?: string
}

// ─── Layout Tree ────────────────────────────────────────────────────────────────

export type PaperLayoutTree = {
  parts: PaperLayoutPart[]
}

export type PaperLayoutPart = {
  partId: string
  title: string
  sections: PaperLayoutSection[]
}

export type PaperLayoutSection = {
  sectionId: string
  title: string
  groups: PaperLayoutGroupRef[]
}

export type PaperLayoutGroupRef = {
  groupId: string
  title?: string
}

// ─── Content ────────────────────────────────────────────────────────────────────

export type PaperContent = {
  blocks: PaperContentBlock[]
  groups: Record<string, PaperContentGroup>
  questions: Record<string, PaperContentQuestion>
  blanks?: Record<string, PaperContentBlank>
  writingTasks?: Record<string, PaperWritingTask>
}

// ─── Content Blocks (semantic paper-order blocks) ───────────────────────────────

export type PaperContentBlock =
  | PaperBlockNotice
  | PaperBlockPartHeading
  | PaperBlockSectionHeading
  | PaperBlockInstruction
  | PaperBlockExampleQuestion
  | PaperBlockQuestionRange
  | PaperBlockGroup
  | PaperBlockAnswerBox
  | PaperBlockPageBreakHint

export type PaperBlockNotice = {
  type: 'notice'
  text: string
}

export type PaperBlockPartHeading = {
  type: 'partHeading'
  partId: string
  text: string
}

export type PaperBlockSectionHeading = {
  type: 'sectionHeading'
  sectionId: string
  text: string
}

export type PaperBlockInstruction = {
  type: 'instruction'
  text: string
}

export type PaperBlockExampleQuestion = {
  type: 'exampleQuestion'
  text: string
}

export type PaperBlockQuestionRange = {
  type: 'questionRange'
  groupId: string
  startQuestion: number
  endQuestion: number
}

export type PaperBlockGroup = {
  type: 'group'
  groupId: string
}

export type PaperBlockAnswerBox = {
  type: 'answerBox'
  writingTaskId?: string
  label?: string
}

export type PaperBlockPageBreakHint = {
  type: 'pageBreakHint'
}

// ─── Content Group ──────────────────────────────────────────────────────────────

export type PaperContentGroup = {
  groupId: string
  groupType: 'reading' | 'cloze' | 'sevenChoices' | 'grammarFill' | 'listening' | 'writing'
  title: string
  questionIds: string[]
  blankIds?: string[]
  writingTaskId?: string
  passage?: PaperPassage
  optionBank?: PaperOptionBankItem[]
  clozeText?: string
  grammarText?: string
}

export type PaperPassage = {
  paragraphs: PaperParagraph[]
}

export type PaperParagraph = {
  paragraphId: string
  text: string
}

export type PaperOptionBankItem = {
  label: string
  text: string
}

// ─── Content Question ───────────────────────────────────────────────────────────

export type PaperContentQuestion = {
  questionId: string
  questionNo: number
  groupId: string
  stem: string
  options?: PaperQuestionOption[]
  blankId?: string
}

export type PaperQuestionOption = {
  label: string
  text: string
}

// ─── Content Blank ──────────────────────────────────────────────────────────────

export type PaperContentBlank = {
  blankId: string
  groupId: string
  questionId: string
  position?: string
  prompt?: string
}

// ─── Writing Task ───────────────────────────────────────────────────────────────

export type PaperWritingTask = {
  writingTaskId: string
  groupId: string
  taskType: 'application' | 'continuation'
  title: string
  instruction: string
  wordCountTarget?: number
  continuationStarters?: string[]
  materialText?: string
  // I7: application given 上下格式/title rendered inside the answer box — `top`
  // (salutation/opening or a given title) and `bottom` (closing/signature).
  // Absent when the paper gives no skeleton.
  applicationGiven?: { top: string[]; bottom: string[] }
}

// ─── Answer Key ─────────────────────────────────────────────────────────────────

export type AnswerKey = {
  answers: Record<string, AnswerKeyEntry>
}

export type AnswerKeyEntry = {
  questionId: string
  questionNo: number
  answer: string
  score?: number
  note?: string
}

// ─── Analysis (future shape, kept empty/meta-only in C6a-1) ─────────────────────

export type PaperAnalysis = {
  meta?: AnalysisMeta
  groups?: Record<string, GroupAnalysis>
  questions?: Record<string, QuestionAnalysis>
}

export type AnalysisMeta = {
  generatedBy: 'external-ai' | 'human'
  model?: string
  promptVersion?: string
  reviewedBy?: string
  reviewedAt?: string
}

// ─── Writing Analysis ───────────────────────────────────────────────────────────

export type WritingAnalysis = {
  taskType: 'application'
  modelAnswer: string
  highlightExpressions: HighlightExpression[]
}

export type HighlightExpression = {
  text: string
  note: string
}

// ─── Group Analysis ─────────────────────────────────────────────────────────────

export type GroupAnalysis = {
  overview?: string
  discourseStructure?: DiscourseStructure
  writing?: WritingAnalysis
}

export type DiscourseStructure = {
  summary: string
  paragraphs: DiscourseStructureParagraph[]
}

export type DiscourseStructureParagraph = {
  paragraphId: string
  summary: string
  function: string
}

// ─── Question Analysis (Reading Choice) ─────────────────────────────────────────

export type QuestionAnalysis = ReadingChoiceAnalysis

export type ReadingChoiceAnalysis = {
  skill: SkillClassification
  questionFocus: string
  stemTranslationZh: string
  optionAnalysis: OptionAnalysisItem[]
  locationParaphrases: LocationParaphrase[]
}

export type SkillClassification = {
  primary: ReadingSkillPrimary
  secondary?: 'inference'
}

export type ReadingSkillPrimary =
  | 'detail'
  | 'inference'
  | 'mainIdea'
  | 'wordMeaning'
  | 'authorPurpose'
  | 'attitude'
  | 'title'
  | 'structure'

// ─── Option Analysis ────────────────────────────────────────────────────────────

export type OptionAnalysisItem = {
  label: string
  optionTranslationZh: string
  status: 'correct' | 'wrong'
  evidence?: CorrectOptionEvidence[]
  trap?: TrapDiagnosis
  trapEvidence?: TrapEvidenceItem[]
}

export type CorrectOptionEvidence = {
  role: 'primary' | 'supporting'
  paragraphId: string
  quote: string
  anchor?: string
}

// ─── Trap Diagnosis ─────────────────────────────────────────────────────────────

export type TrapDiagnosis =
  | SourceLexicalTrap
  | PolarityReversal
  | ScopeShift
  | EntityMismatch
  | UnsupportedClaim

export type TrapPrimaryType =
  | 'sourceLexicalTrap'
  | 'polarityReversal'
  | 'scopeShift'
  | 'entityMismatch'
  | 'unsupportedClaim'

export type SourceLexicalTrap = {
  primaryType: 'sourceLexicalTrap'
  secondaryType?: Exclude<TrapPrimaryType, 'sourceLexicalTrap'>
  sourceText: string
  optionText: string
  matchType: 'exact' | 'wordFamily'
  relationNote: string
}

export type PolarityReversalSubtype =
  | 'oppositeAction'
  | 'oppositeAttitude'
  | 'oppositeTrend'
  | 'causeEffectReversal'
  | 'timeOrderReversal'
  | 'negationReversal'

export type PolarityReversal = {
  primaryType: 'polarityReversal'
  secondaryType?: Exclude<TrapPrimaryType, 'polarityReversal'>
  subtype: PolarityReversalSubtype
  sourceQuote: string
  sourceHighlight: string
  optionText: string
  optionHighlight: string
  explanation: string
}

export type ScopeShiftSubtype =
  | 'overgeneralization'
  | 'overstatement'
  | 'understatement'
  | 'conditionRemoved'

export type ScopeShift = {
  primaryType: 'scopeShift'
  secondaryType?: Exclude<TrapPrimaryType, 'scopeShift'>
  subtype: ScopeShiftSubtype
  sourceQuote: string
  sourceHighlight: string
  optionText: string
  optionHighlight: string
  explanation: string
}

export type EntityMismatch = {
  primaryType: 'entityMismatch'
  secondaryType?: Exclude<TrapPrimaryType, 'entityMismatch'>
  sourceQuote: string
  sourceEntity: string
  optionText: string
  optionEntity: string
  explanation: string
}

export type UnsupportedClaim = {
  primaryType: 'unsupportedClaim'
  secondaryType?: Exclude<TrapPrimaryType, 'unsupportedClaim'>
  claim: string
  explanation: string
}

// ─── Trap Evidence ──────────────────────────────────────────────────────────────

export type TrapEvidenceItem = {
  paragraphId: string
  quote: string
  anchor?: string
}

// ─── Location Paraphrase ────────────────────────────────────────────────────────

export type LocationParaphrase = {
  sourceText: string
  sourceRole: 'stem' | 'correctOption'
  targetText: string
  targetParagraphId: string
  relationType: 'locationCue' | 'paraphrase' | 'wordFamily' | 'calculation'
  note: string
}
