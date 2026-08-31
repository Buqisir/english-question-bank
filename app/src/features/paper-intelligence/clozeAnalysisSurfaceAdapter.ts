/**
 * I9 Cloze Analysis Surface Adapter.
 *
 * Consumes a `cloze-analysis-v1` JSON and a `PaperAssetV1` to produce
 * `ClozeAnalysisSurfaceModel` — the same neutral PaperSurface payload
 * the harness expects, plus per-blank analysis views for the right pad.
 *
 * Evidence location:
 *   - context-before / context-after / stem → exact substring search
 *     across ALL passage paragraphs (cloze has no paragraphId per blank).
 *     ALL occurrences are located (multi-occurrence = highlight all).
 *   - option → in-card <mark> only; NO passage anchor created.
 *
 * Uniform evidence kind = 'support' (PA MF-3.1 locked decision).
 *
 * Rules: no React, no DOM, no fetch, no router reads.
 */

import type {
  PaperEvidence,
  PaperTextMap,
  PaperTextRange,
} from '../../../../shared/papersurface/types'
import type { PaperAssetV1 } from '../../domain/paperAsset.ts'
import {
  buildClozePaperView,
  type ClozePaperViewModel,
} from './clozePaperViewAdapter.ts'
import type {
  PaperIntelligenceReport,
  PaperSurfaceData,
  PassageStructure,
} from './paperIntelligenceTypes.ts'

// ─── Contract types (mirrors cloze-analysis-v1.contract.md) ──────────────────

export type ClozeEvidenceType =
  | 'collocation-partner'
  | 'repetition-echo'
  | 'semantic-field'
  | 'affective-cue'
  | 'logical-connector'

export type ClozeSignalSide = 'context-before' | 'context-after' | 'stem' | 'option'

export type ClozeEvidenceItem = {
  type: ClozeEvidenceType
  signalText: string
  signalSide: ClozeSignalSide
  targetText?: string
  relation: string
}

export type ClozeDistractorGloss = {
  optionLabel: string
  optionText: string
  meaning: string
}

export type ClozeCorrectFit = {
  optionLabel?: string
  reason: string
}

export type ClozeBlankAnalysis = {
  blankId: string
  blankNo: number
  pos: string
  signatureFacet?: string
  correctFit: ClozeCorrectFit
  distractorGlosses: ClozeDistractorGloss[]
  evidence: ClozeEvidenceItem[]
  teachingNote: string
}

export type ClozeGroupAnalysis = {
  overview: string
  affectiveArc: string
}

export type ReviewedClozeAnalysisV1 = {
  schemaVersion: 'cloze-analysis-v1'
  paperId: string
  sourceAssetVersion: number
  targetGroups: string[]
  meta?: Record<string, unknown>
  groups: Record<string, ClozeGroupAnalysis>
  blanks: Record<string, ClozeBlankAnalysis>
}

// ─── Surface model view types ─────────────────────────────────────────────────

export type ClozeEvidenceRowView = {
  /** Unique id for data-pi-evidence-id; drives cross-column line. */
  evidenceId: string
  type: ClozeEvidenceType
  /** 2-4 字教学用语（cloze-panel-polish）；未映射的 type 原样兜底。 */
  typeLabel: string
  signalSide: ClozeSignalSide
  signalText: string
  targetText?: string
  relation: string
  /** Option-side evidence: signal text for in-card <mark>; no passage anchor. */
  isOptionSide: boolean
}

export type ClozeBlankAnalysisView = {
  questionId: string
  questionNo: string
  blankNo: number
  pos: string
  signatureLabel: string | null
  correctFit: ClozeCorrectFit
  distractorGlosses: ClozeDistractorGloss[]
  evidenceRows: ClozeEvidenceRowView[]
  teachingNote: string
  /** Option text keyed by label, for option-side <mark> rendering. */
  optionTextByLabel: Record<string, string>
}

export type ClozeGroupView = {
  overview: string
  affectiveArc: string
}

export type ClozeAnalysisSurfaceModel = {
  report: PaperIntelligenceReport
  passageStructures: Record<string, PassageStructure>
  surfaceData: PaperSurfaceData
  analysisByQuestionId: Record<string, ClozeBlankAnalysisView>
  groupView: ClozeGroupView | null
  defaultQuestionId: string | null
  normalization: ClozePaperViewModel['normalization']
}

// ─── Signature label map ──────────────────────────────────────────────────────

const SIGNATURE_LABELS: Record<string, string> = {
  'cloze.signature.verb.action-sequence': '动作顺序',
  'cloze.signature.noun.semantic-field': '前后呼应',
  'cloze.signature.adjective.affective-consistency': '语气照应',
  'cloze.signature.adverb.affective-consistency': '语气照应',
  'cloze.signature.phrase.contextual-composition': '结合语境',
}

// cloze-panel-polish: 2-4 字教学用语，供折叠区证据类型 chip 显示。
// 映射不到的 type 原样兜底显示（见 buildAnalysisViews 的 ?? 回退）。
const CLOZE_EVIDENCE_TYPE_LABELS: Record<ClozeEvidenceType, string> = {
  'collocation-partner': '搭配线索',
  'repetition-echo': '复现呼应',
  'semantic-field': '前后呼应',
  'affective-cue': '语气线索',
  'logical-connector': '逻辑连接',
}

// ─── Build entry point ────────────────────────────────────────────────────────

export function buildClozeAnalysisSurfaceModel(input: {
  asset: PaperAssetV1
  analysis: ReviewedClozeAnalysisV1
  groupId: string
  canonicalConsumption?: unknown
}): ClozeAnalysisSurfaceModel {
  const { asset, analysis, groupId, canonicalConsumption } = input

  if (analysis.schemaVersion !== 'cloze-analysis-v1') {
    throw new Error('[I9] analysis schemaVersion must be cloze-analysis-v1.')
  }
  if (analysis.paperId !== asset.paper.paperId) {
    throw new Error('[I9] cloze analysis paperId does not match paper asset.')
  }

  const group = asset.content.groups[groupId]
  if (!group || group.groupType !== 'cloze') {
    throw new Error(`[I9] group not found or not cloze: ${groupId}`)
  }

  const questionIds = group.questionIds ?? []
  const canonicalSurface = buildClozePaperView({
    asset,
    groupId,
    canonicalConsumption,
  })
  if (
    canonicalConsumption === undefined
    && canonicalSurface.normalization.status !== 'ready'
  ) {
    throw new Error(
      `[CLOZE_CANONICAL_SURFACE_UNAVAILABLE] ${asset.paper.paperId}/${groupId} `
      + 'cannot layer analysis onto an unresolved canonical group.',
    )
  }
  if (canonicalSurface.surfaceData.semanticParagraphs) {
    assertCanonicalAnalysisAnchors(
      analysis,
      questionIds,
      canonicalSurface.surfaceData.semanticParagraphs,
    )
  } else {
    assertLegacyAnalysisAnchors(asset, analysis, questionIds)
  }

  // Build passage-side evidence ranges from analysis.blanks
  const { evidence } = buildEvidence(
    analysis,
    questionIds,
    canonicalSurface.surfaceData.textMap,
  )

  // Build per-blank analysis views
  const analysisByQuestionId = buildAnalysisViews(asset, analysis, questionIds)

  const groupAnalysis = analysis.groups[groupId] ?? null
  const groupView: ClozeGroupView | null = groupAnalysis
    ? { overview: groupAnalysis.overview, affectiveArc: groupAnalysis.affectiveArc }
    : null

  return {
    report: canonicalSurface.report,
    passageStructures: canonicalSurface.passageStructures,
    surfaceData: { ...canonicalSurface.surfaceData, evidence },
    analysisByQuestionId,
    groupView,
    defaultQuestionId: canonicalSurface.defaultQuestionId,
    normalization: canonicalSurface.normalization,
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function assertLegacyAnalysisAnchors(
  asset: PaperAssetV1,
  analysis: ReviewedClozeAnalysisV1,
  questionIds: string[],
): void {
  for (const questionId of questionIds) {
    const selectedBlankId = asset.content.questions[questionId]?.blankId
    const analysisBlankId = analysis.blanks[questionId]?.blankId
    if (!selectedBlankId || !analysisBlankId) {
      throw new Error(
        `[CLOZE_ANALYSIS_ANCHOR_MISSING] ${questionId} has no selected legacy/analysis blank pair.`,
      )
    }
    if (analysisBlankId !== selectedBlankId) {
      throw new Error(
        `[CLOZE_ANALYSIS_ANCHOR_MISMATCH] ${questionId} references `
        + `${analysisBlankId}; selected legacy blank is ${selectedBlankId}.`,
      )
    }
  }
}

function assertCanonicalAnalysisAnchors(
  analysis: ReviewedClozeAnalysisV1,
  questionIds: string[],
  semanticParagraphs: PaperSurfaceData['semanticParagraphs'],
): void {
  if (!semanticParagraphs) {
    throw new Error(
      '[CLOZE_CANONICAL_ANCHOR_MISSING] canonical semantic paragraphs are unavailable.',
    )
  }

  const blankIdByQuestionId = new Map<string, string>()
  for (const node of semanticParagraphs
    .flatMap((paragraph) => paragraph.sentences)
    .flatMap((sentence) => sentence.nodes)) {
    if (node.type !== 'blank') continue
    if (blankIdByQuestionId.has(node.questionId)) {
      throw new Error(
        `[CLOZE_CANONICAL_ANCHOR_DUPLICATE] ${node.questionId} has multiple blank anchors.`,
      )
    }
    blankIdByQuestionId.set(node.questionId, node.blankId)
  }

  for (const questionId of questionIds) {
    const canonicalBlankId = blankIdByQuestionId.get(questionId)
    const analysisBlank = analysis.blanks[questionId]
    if (!canonicalBlankId || !analysisBlank) {
      throw new Error(
        `[CLOZE_ANALYSIS_ANCHOR_MISSING] ${questionId} has no canonical/analysis blank pair.`,
      )
    }
    if (analysisBlank.blankId !== canonicalBlankId) {
      throw new Error(
        `[CLOZE_ANALYSIS_ANCHOR_MISMATCH] ${questionId} references `
        + `${analysisBlank.blankId}; canonical blank is ${canonicalBlankId}.`,
      )
    }
  }
}

function buildEvidence(
  analysis: ReviewedClozeAnalysisV1,
  questionIds: string[],
  textMap: PaperTextMap,
): { evidence: PaperEvidence[] } {
  const evidence: PaperEvidence[] = []

  for (const questionId of questionIds) {
    const blankAnalysis = analysis.blanks[questionId]
    if (!blankAnalysis) continue

    for (let i = 0; i < blankAnalysis.evidence.length; i++) {
      const item = blankAnalysis.evidence[i]
      // Option-side signals: in-card <mark> only — no passage anchor.
      if (item.signalSide === 'option') continue

      const evidenceId = `${questionId}-evidence-${i + 1}`
      const ranges = findAllTextRanges(textMap, item.signalText)
      if (ranges.length === 0) {
        // One unresolved passage highlight must not hide the rest of the cloze lecture.
        continue
      }
      for (const range of ranges) {
        assertResolvedEvidenceRange(textMap, range, evidenceId)
        evidence.push({
          id: evidenceId,
          questionId,
          kind: 'support',
          range,
        })
      }
    }
  }

  return { evidence }
}

function assertResolvedEvidenceRange(
  textMap: PaperTextMap,
  range: PaperTextRange,
  evidenceId: string,
): void {
  const sentence = textMap.paragraphs
    .flatMap((paragraph) => paragraph.sentences)
    .find((candidate) => candidate.id === range.sentenceId)
  if (!sentence) {
    throw new Error(
      `[CLOZE_EVIDENCE_ANCHOR_MISSING] ${evidenceId} references ${range.sentenceId}.`,
    )
  }
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end <= range.start ||
    range.end > sentence.text.length
  ) {
    throw new Error(
      `[CLOZE_EVIDENCE_RANGE_OUT_OF_BOUNDS] ${evidenceId} references `
      + `${range.sentenceId}[${range.start},${range.end}) with length ${sentence.text.length}.`,
    )
  }
}

function buildAnalysisViews(
  asset: PaperAssetV1,
  analysis: ReviewedClozeAnalysisV1,
  questionIds: string[],
): Record<string, ClozeBlankAnalysisView> {
  const out: Record<string, ClozeBlankAnalysisView> = {}

  for (let qi = 0; qi < questionIds.length; qi++) {
    const questionId = questionIds[qi]
    const blankAnalysis = analysis.blanks[questionId]
    if (!blankAnalysis) continue

    const q = asset.content.questions[questionId]
    const optionTextByLabel: Record<string, string> = {}
    for (const opt of q?.options ?? []) {
      optionTextByLabel[opt.label] = opt.text
    }

    const evidenceRows: ClozeEvidenceRowView[] = blankAnalysis.evidence.map((item, i) => {
      const evidenceId = `${questionId}-evidence-${i + 1}`
      const isOptionSide = item.signalSide === 'option'
      return {
        evidenceId,
        type: item.type,
        typeLabel: CLOZE_EVIDENCE_TYPE_LABELS[item.type] ?? item.type,
        signalSide: item.signalSide,
        signalText: item.signalText,
        targetText: item.targetText,
        relation: item.relation,
        isOptionSide,
      }
    })

    const signatureLabel = blankAnalysis.signatureFacet
      ? (SIGNATURE_LABELS[blankAnalysis.signatureFacet] ?? blankAnalysis.signatureFacet)
      : null

    out[questionId] = {
      questionId,
      questionNo: String(q?.questionNo ?? blankAnalysis.blankNo),
      blankNo: blankAnalysis.blankNo,
      pos: blankAnalysis.pos,
      signatureLabel,
      correctFit: blankAnalysis.correctFit,
      distractorGlosses: blankAnalysis.distractorGlosses,
      evidenceRows,
      teachingNote: blankAnalysis.teachingNote,
      optionTextByLabel,
    }
  }

  return out
}

/**
 * Find ALL exact-substring occurrences of `needle` in the text map,
 * searching across all paragraphs (cloze evidence has no paragraphId hint).
 * Returns empty if needle is empty or whitespace-only.
 */
export function findAllTextRanges(textMap: PaperTextMap, needle: string): PaperTextRange[] {
  const trimmed = needle.trim()
  if (!trimmed) return []
  const ranges: PaperTextRange[] = []
  for (const paragraph of textMap.paragraphs) {
    for (const sentence of paragraph.sentences) {
      let start = sentence.text.indexOf(trimmed)
      while (start !== -1) {
        ranges.push({
          sentenceId: sentence.id,
          start,
          end: start + trimmed.length,
        })
        start = sentence.text.indexOf(trimmed, start + trimmed.length)
      }
    }
  }
  return ranges
}
