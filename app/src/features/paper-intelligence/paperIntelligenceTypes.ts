/**
 * TypeScript types for the Paper Intelligence V0 report JSON schema.
 * Read-only — these types are never written to any database.
 */

import type { PaperTextMap, PaperQuestion, PaperEvidence, PaperAnnotation } from '../../../../shared/papersurface/types'
import type { CanonicalSurfaceParagraph } from '../../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'

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
  /** Stable id linking this passage to a local question group. */
  questionGroupId?: string
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

/* ============================================================== *
 * Passage Structure — C5a confirmed paragraph anchors.
 *
 * `PassageStructure` is the authoritative paragraph source for the
 * official PaperSurface path. Each passage in `input.json` MUST
 * carry a `passageStructure` field when used by surface=paper.
 * The adapter MUST use these confirmed paragraphs — it MUST NOT
 * silently fall back to auto-segmentation.
 *
 * ID format: `{section}-P{n}` where n starts at 1.
 *   e.g. A-P1, A-P2, B-P1, B-P2, B-P3
 *
 * Label format: `P{n}` (human-facing short label).
 *   e.g. P1, P2, P3
 *
 * Normalization invariant:
 *   normalize(paragraphs.map(p => p.text).join(' ')) === normalize(passageBody)
 *   where normalize(s) = s.replace(/\s+/g, ' ').trim()
 * ============================================================== */

export type PassageParagraphStructure = {
  /** Stable paragraph id. Format: `{section}-P{n}` (1-indexed). */
  id: string
  /** Human-facing short label. Format: `P{n}`. */
  label: string
  /** The verbatim paragraph text. Non-empty. */
  text: string
}

export type PassageStructure = {
  /** The owning section id, must match the passage's paperSection. */
  section: string
  /** Confirmed paragraphs in document order. Non-empty. */
  paragraphs: PassageParagraphStructure[]
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

/**
 * PaperSurfaceData — the data-props shape the shared PaperSurface module
 * consumes (`textMap` / `questions` / `evidence`), independent of who builds
 * it. Migrated here from the retired `adapter/index.ts` barrel
 * (reading-analysis-retire, 2026-07-16): the barrel's only runtime function
 * (`buildPaperSurfaceDataFromPi`) was exercised solely by the retired
 * `PaperIntelligencePaperSurfaceHarness`, but this *type* is `import type`-ed
 * by the 7 live PaperSurface adapters below it (`paperAssetSurfaceAdapter.ts`
 * et al.) as the shape they each build and return. Depends only on the
 * shared PaperSurface contract types, not on any adapter/evidence runtime
 * module — so it moves cleanly without dragging retired code along.
 */
export type PaperSurfaceData = {
  textMap: PaperTextMap
  semanticParagraphs?: ReadonlyArray<CanonicalSurfaceParagraph>
  questions: ReadonlyArray<PaperQuestion>
  evidence: ReadonlyArray<PaperEvidence>
  annotations?: ReadonlyArray<PaperAnnotation>
}
