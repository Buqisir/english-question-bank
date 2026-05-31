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

import { segmentPaperText } from '../../../../shared/papersurface/segmentPaperText.mjs'
import type {
  PaperEvidence,
  PaperQuestion,
  PaperTextMap,
  PaperTextRange,
} from '../../../../shared/papersurface/types'
import type { PaperAssetV1 } from '../../domain/paperAsset.ts'
import type { PaperSurfaceData } from './adapter/index.ts'
import type {
  LoadBar,
  PaperIntelligenceReport,
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
}

// ─── Signature label map ──────────────────────────────────────────────────────

const SIGNATURE_LABELS: Record<string, string> = {
  'cloze.signature.verb.action-sequence': '动作顺序',
  'cloze.signature.noun.semantic-field': '语义场',
  'cloze.signature.adjective.affective-consistency': '情感一致',
  'cloze.signature.adverb.affective-consistency': '情感一致',
  'cloze.signature.phrase.contextual-composition': '语境合成义',
}

const CLOZE_SECTION = '完形填空'

// ─── Build entry point ────────────────────────────────────────────────────────

export function buildClozeAnalysisSurfaceModel(input: {
  asset: PaperAssetV1
  analysis: ReviewedClozeAnalysisV1
  groupId: string
}): ClozeAnalysisSurfaceModel {
  const { asset, analysis, groupId } = input

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

  // Build textMap (mirrors clozePaperViewAdapter but keeps per-paragraph ids)
  const textMap = buildClozeTextMap(asset, group)

  const passageStructure: PassageStructure = {
    section: CLOZE_SECTION,
    paragraphs: (group.passage?.paragraphs ?? []).map((p, i) => ({
      id: p.paragraphId,
      label: i === 0 ? '标题' : `P${i}`,
      text: p.text,
    })),
  }

  // Build questions for PaperSurface left column (plain — no analysis-derived options)
  const questions = buildQuestions(asset, questionIds)

  // Build passage-side evidence ranges from analysis.blanks
  const { evidence } = buildEvidence(analysis, questionIds, textMap)

  // Build per-blank analysis views
  const analysisByQuestionId = buildAnalysisViews(asset, analysis, questionIds)

  const groupAnalysis = analysis.groups[groupId] ?? null
  const groupView: ClozeGroupView | null = groupAnalysis
    ? { overview: groupAnalysis.overview, affectiveArc: groupAnalysis.affectiveArc }
    : null

  return {
    report: buildShellReport(asset, group, groupId),
    passageStructures: { [CLOZE_SECTION]: passageStructure },
    surfaceData: { textMap, questions, evidence },
    analysisByQuestionId,
    groupView,
    defaultQuestionId: questionIds[0] ?? null,
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildClozeTextMap(
  asset: PaperAssetV1,
  group: PaperAssetV1['content']['groups'][string],
): PaperTextMap {
  const rawParagraphs = group.passage?.paragraphs ?? []
  const paragraphs: PaperTextMap['paragraphs'] = rawParagraphs.map((p) => {
    if (!p.text.trim()) {
      return { id: p.paragraphId, section: CLOZE_SECTION, sentences: [] }
    }
    const segmented = segmentPaperText(p.text, { sectionId: p.paragraphId })
    const first = segmented.paragraphs[0]
    const sentences = first
      ? first.sentences.map((s, i) => ({
          id: `${p.paragraphId}-s${i}`,
          text: s.text,
          tokens: [] as never[],
        }))
      : []
    return { id: p.paragraphId, section: CLOZE_SECTION, sentences }
  })
  return { paperId: asset.paper.paperId, paragraphs }
}

function buildQuestions(
  asset: PaperAssetV1,
  questionIds: string[],
): PaperQuestion[] {
  return questionIds.map((qid, order) => {
    const q = asset.content.questions[qid]
    return {
      id: qid,
      section: CLOZE_SECTION,
      order,
      questionNo: String(q?.questionNo ?? ''),
      stem: q?.stem ?? '',
      options: q?.options ?? [],
    }
  })
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
      for (const range of ranges) {
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

// ─── Shell report (minimal; keeps adapter simple) ────────────────────────────

const ZERO_LOAD_BAR: LoadBar = { score: 0, label: '', shortReason: '', evidenceItems: [] }

function buildShellReport(
  asset: PaperAssetV1,
  group: PaperAssetV1['content']['groups'][string],
  groupId: string,
): PaperIntelligenceReport {
  return {
    schemaVersion: 'paper-asset-v1-as-paper-intelligence-shell',
    generatedAt: '',
    generator: {
      promptVersion: 'i9-cloze-analysis-surface',
      modelId: null,
      runId: 'cloze-analysis-surface',
    },
    sourcePaper: {
      paperId: asset.paper.paperId,
      paperName: asset.paper.title,
      year: 2024,
      region: '',
      section: CLOZE_SECTION,
    },
    passages: [
      {
        paperSection: CLOZE_SECTION,
        passageTitle: group.title || CLOZE_SECTION,
        questionGroupId: groupId,
        loads: {
          vocabularyChunkLoad: ZERO_LOAD_BAR,
          grammarLoad: ZERO_LOAD_BAR,
          discourseStructureLoad: ZERO_LOAD_BAR,
          topicBackgroundLoad: ZERO_LOAD_BAR,
          evidenceFindingLoad: ZERO_LOAD_BAR,
        },
        aiInitialBand: { band: '—', basis: 'cloze analysis source' },
        passageOutline: { mainIdea: group.title || CLOZE_SECTION, logicalLayers: [] },
        keyChunks: [],
        questions: [],
      },
    ],
  }
}
