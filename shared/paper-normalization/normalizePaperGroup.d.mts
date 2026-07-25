/**
 * Type declarations for `shared/paper-normalization/normalizePaperGroup.mjs`.
 * Keep this file in sync with `normalizePaperGroup.d.ts`.
 */

export type PaperGroupNormalizationIssueCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_GROUP_TYPE'
  | 'INVALID_GROUP'
  | 'QUESTION_SLICE_MISMATCH'
  | 'BLANK_ID_CONFLICT'
  | 'DUPLICATE_QUESTION_ID'
  | 'DUPLICATE_BLANK_ID'
  | 'MISSING_QUESTION'
  | 'QUESTION_ID_MISMATCH'
  | 'INVALID_QUESTION'
  | 'DUPLICATE_QUESTION_NO'
  | 'BLANK_COUNT_MISMATCH'
  | 'INVALID_PARAGRAPH'
  | 'ANCHOR_UNRESOLVED'
  | 'UNSUPPORTED_MARKER'
  | 'OVERLAPPING_SOURCE_SPAN'
  | 'AMBIGUOUS_MARKER'
  | 'MISSING_MARKER'
  | 'MARKER_COUNT_MISMATCH'
  | 'DUPLICATE_MARKER'
  | 'MARKER_NUMBER_MISMATCH'
  | 'CANONICAL_VALIDATION_FAILED'
  | 'SOURCE_FINGERPRINT_UNRESOLVED'

export type PaperGroupNormalizationIssue = {
  code: PaperGroupNormalizationIssueCode
  path: string
  message: string
}

export type PaperGroupSourceSpan = {
  sourcePath: string
  start: number
  end: number
}

export type CanonicalPaperTextNodeV1 = {
  type: 'text'
  text: string
  sourceSpan: PaperGroupSourceSpan
}

export type CanonicalPaperBlankNodeV1 = {
  type: 'blank'
  questionId: string
  blankId: string
  hint: string | null
  sourceSpan: PaperGroupSourceSpan
}

export type CanonicalPaperGroupV1 = {
  schemaVersion: 'canonical-paper-group-v1'
  groupId: string
  groupType: 'cloze' | 'grammarFill'
  title: string
  paragraphs: Array<{
    paragraphId: string
    nodes: Array<CanonicalPaperTextNodeV1 | CanonicalPaperBlankNodeV1>
    sourceSpan: PaperGroupSourceSpan
  }>
  questions: Array<{
    questionId: string
    questionNo: number
    groupId: string
    blankId: string
    stem: string | null
    options: Array<{ label: string; text: string }>
  }>
}

export type PaperGroupNormalizationInput = {
  paperId: string
  sourceAssetVersion: string | number
  group: {
    groupId: string
    groupType: 'cloze' | 'grammarFill'
    title: string
    questionIds: string[]
    blankIds: string[]
    passage?: {
      paragraphs: Array<{ paragraphId: string; text: string }>
    }
    grammarText?: string
  }
  questions: Record<
    string,
    {
      questionId: string
      questionNo: number
      groupId: string
      stem: string
      blankId: string
      options?: Array<{ label: string; text: string }>
    }
  >
  blanks?: Record<
    string,
    {
      blankId: string
      groupId: string
      questionId: string
      prompt?: string
    }
  >
}

export type PaperGroupNormalizationResult =
  | {
      status: 'ready'
      group: CanonicalPaperGroupV1
      sourceMap: {
        group: { sourcePath: string }
        paragraphs: Record<string, PaperGroupSourceSpan>
        questions: Record<string, { sourcePath: string }>
        blanks: Record<string, PaperGroupSourceSpan>
      }
      sourceFingerprint: string
      semanticDigest: string
    }
  | {
      status: 'needs_review'
      issues: PaperGroupNormalizationIssue[]
    }

export function normalizePaperGroup(
  input: PaperGroupNormalizationInput,
): PaperGroupNormalizationResult
