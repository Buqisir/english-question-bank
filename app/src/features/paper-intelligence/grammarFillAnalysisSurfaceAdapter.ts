/**
 * I14 Grammar-Fill Analysis Surface Adapter (GATE-1 + GATE-2).
 *
 * Consumes a `grammar-fill-analysis-v1` JSON and a `PaperAssetV1` to produce
 * `GrammarFillAnalysisSurfaceModel` — the same neutral PaperSurface payload
 * the harness expects, plus per-blank analysis views for the right pad.
 *
 * GATE-1 (MF-1 locked decision): evidence `signalText` is validated at parse
 * time against the pre-publish bytes, but the stored passage gets an extra
 * `normalizeGrammarFillText` pass at publish whose net divergence is whitespace
 * (double-spacing around blank markers `  56  ` + 3+-space collapse). The
 * tolerant locate function (`findAllTextRangesTolerant`) collapses whitespace
 * runs before matching and maps start/end back to stored offsets, so highlights
 * resolve even when the stored text diverges from the parse-time bytes.
 *
 * GATE-1 textMap consistency (PA MF-1): the adapter's `surfaceData.textMap`
 * and the locate function use ONE and the same per-paragraph construction with
 * sentenceId `${paragraphId}-s{i}` (the cloze adapter's convention), so every
 * located range.sentenceId is guaranteed to exist in the textMap.
 *
 * GATE-2: per-blank framework + labelZh resolved from the client-side
 * `FACET_FRAMEWORKS` registry (I14 Step 0).
 *
 * Evidence kind: uniform `'support'` (no distractor / option-side evidence in
 * grammar fill — there are no A–D options).
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
import { FACET_FRAMEWORKS, type FrameworkBody } from './grammarFillFacetRegistry.ts'
import {
  buildGrammarFillPaperView,
  type GrammarFillPaperViewModel,
} from './grammarFillPaperViewAdapter.ts'
import type {
  LoadBar,
  PaperIntelligenceReport,
  PaperSurfaceData,
  PassageStructure,
} from './paperIntelligenceTypes.ts'

// ─── Contract types (mirrors grammar-fill-analysis-v1.contract.md) ───────────

export type GrammarFillBlankType = 'given' | 'no-hint'

export type GrammarFillEvidenceType =
  | 'subject'
  | 'time-marker'
  | 'antecedent'
  | 'modified-word'
  | 'governing-word'
  | 'collocation'
  | 'comparison'
  | 'parallel'
  | 'connector'
  | 'clause-frame'
  | 'of-phrase'
  | 'determiner'

export type GrammarFillSignalSide = 'passage' | 'stem'

export type GrammarFillEvidenceItem = {
  type: GrammarFillEvidenceType
  signalText: string
  signalSide: GrammarFillSignalSide
  relation: string
}

export type GrammarFillRole =
  | 'subject'
  | 'predicative'
  | 'object'
  | 'attributive'
  | 'adverbial'
  | 'object-complement'
  | 'subject-complement'

export type GrammarFillPath = 'fast' | 'slow'

export type GrammarFillBlankAnalysis = {
  blankId: string
  blankNo: number
  blankType: GrammarFillBlankType
  hint: string | null
  facetKey: string
  answer: string
  role: GrammarFillRole | null
  path: GrammarFillPath | null
  reason: string
  evidence: GrammarFillEvidenceItem[]
  teachingNote: string
  // D1 (grammar-facets-v2): present on finite-verb blanks (tense/voice/
  // agreementSensitive) or non-finite blanks (form) — not yet surfaced in
  // this panel's UI (MF-3 boundary: registry data table only), declared
  // here so the adapter's input type matches the real on-disk v2 shape.
  tense?: string | null
  voice?: string | null
  agreementSensitive?: boolean | null
  form?: string | null
}

export type GrammarFillGroupAnalysis = {
  overview: string
}

export type ReviewedGrammarFillAnalysisV1 = {
  schemaVersion: 'grammar-fill-analysis-v2'
  paperId: string
  sourceAssetVersion: number
  targetGroups: string[]
  meta?: Record<string, unknown>
  groups: Record<string, GrammarFillGroupAnalysis>
  blanks: Record<string, GrammarFillBlankAnalysis>
}

// ─── Surface model view types ─────────────────────────────────────────────────

export type GrammarFillEvidenceRowView = {
  /** Unique id for data-pi-evidence-id; drives cross-column line. */
  evidenceId: string
  type: GrammarFillEvidenceType
  /** 2-4 字教学用语（cloze-panel-polish）；未映射的 type 原样兜底。 */
  typeLabel: string
  signalSide: GrammarFillSignalSide
  signalText: string
  relation: string
}

export type GrammarFillBlankAnalysisView = {
  questionId: string
  questionNo: string
  blankNo: number
  blankType: GrammarFillBlankType
  hint: string | null
  facetKey: string
  labelZh: string
  framework: FrameworkBody
  answer: string
  role: GrammarFillRole | null
  path: GrammarFillPath | null
  reason: string
  evidenceRows: GrammarFillEvidenceRowView[]
  teachingNote: string
}

export type GrammarFillGroupView = {
  overview: string
}

export type GrammarFillAnalysisSurfaceModel = {
  report: PaperIntelligenceReport
  passageStructures: Record<string, PassageStructure>
  surfaceData: PaperSurfaceData
  analysisByQuestionId: Record<string, GrammarFillBlankAnalysisView>
  groupView: GrammarFillGroupView | null
  defaultQuestionId: string | null
  normalization: GrammarFillPaperViewModel['normalization']
}

// ─── Role / path label maps ────────────────────────────────────────────────────

const ROLE_LABELS: Record<GrammarFillRole, string> = {
  'subject': '主语',
  'predicative': '表语',
  'object': '宾语',
  'attributive': '定语',
  'adverbial': '状语',
  'object-complement': '宾补',
  'subject-complement': '主补',
}

const PATH_LABELS: Record<GrammarFillPath, string> = {
  fast: '快路',
  slow: '慢路',
}

// Exported for use in panel rendering.
export { ROLE_LABELS, PATH_LABELS }

// cloze-panel-polish: 2-4 字教学用语，供折叠区证据类型 chip 显示。
// 映射不到的 type 原样兜底显示（见 buildAnalysisViews 的 ?? 回退）。
const GRAMMAR_FILL_EVIDENCE_TYPE_LABELS: Record<GrammarFillEvidenceType, string> = {
  subject: '主语线索',
  'time-marker': '时间标志',
  antecedent: '先行词',
  'modified-word': '被修饰词',
  'governing-word': '支配词',
  collocation: '搭配',
  comparison: '比较结构',
  parallel: '并列结构',
  connector: '连接词',
  'clause-frame': '从句框架',
  'of-phrase': 'of短语',
  determiner: '限定词',
}

const GRAMMAR_FILL_SECTION = '语法填空'

// ─── Build entry point ────────────────────────────────────────────────────────

export function buildGrammarFillAnalysisSurfaceModel(input: {
  asset: PaperAssetV1
  analysis: ReviewedGrammarFillAnalysisV1
  groupId: string
  canonicalConsumption?: unknown
}): GrammarFillAnalysisSurfaceModel {
  const { asset, analysis, groupId, canonicalConsumption } = input

  if (analysis.schemaVersion !== 'grammar-fill-analysis-v2') {
    throw new Error('[I14] analysis schemaVersion must be grammar-fill-analysis-v2.')
  }
  if (analysis.paperId !== asset.paper.paperId) {
    throw new Error('[I14] grammar-fill analysis paperId does not match paper asset.')
  }

  const group = asset.content.groups[groupId]
  if (!group || group.groupType !== 'grammarFill') {
    throw new Error(`[I14] group not found or not grammarFill: ${groupId}`)
  }

  const questionIds = group.questionIds ?? []
  const plainModel = buildGrammarFillPaperView({
    asset,
    groupId,
    canonicalConsumption,
  })
  const canonicalReady = plainModel.normalization.status === 'ready'
  const planBound = canonicalConsumption !== undefined
  const useSelectedSurface = planBound || canonicalReady

  // A whole-paper Consumption Plan owns the selected canonical-or-legacy
  // surface. Analysis may add evidence to that surface, but cannot rebuild it
  // from the source asset and replace its semantics or placement identity.
  const textMap = useSelectedSurface
    ? plainModel.surfaceData.textMap
    : buildGrammarFillAnalysisTextMap(asset, group)

  const passageStructure: PassageStructure = {
    section: GRAMMAR_FILL_SECTION,
    paragraphs: (group.passage?.paragraphs ?? []).map((p, i) => ({
      id: p.paragraphId,
      label: i === 0 ? '标题' : `P${i}`,
      text: p.text,
    })),
  }

  // Build questions for PaperSurface left column.
  const questions = useSelectedSurface
    ? [...plainModel.surfaceData.questions]
    : buildQuestions(asset, questionIds)

  if (useSelectedSurface) {
    for (const questionId of questionIds) {
      const expectedBlankId = asset.content.questions[questionId]?.blankId
      const analysisBlankId = analysis.blanks[questionId]?.blankId
      if (analysisBlankId && analysisBlankId !== expectedBlankId) {
        throw new Error(
          `[GRAMMAR_FILL_ANALYSIS_ANCHOR_MISMATCH] ${questionId} analysis blank is `
          + `${analysisBlankId}; canonical blank is ${expectedBlankId}.`,
        )
      }
    }
  }

  // Build passage-side evidence ranges from analysis.blanks using tolerant match.
  const { evidence } = buildEvidence(
    analysis,
    questionIds,
    textMap,
    useSelectedSurface,
  )

  // Build per-blank analysis views.
  const analysisByQuestionId = buildAnalysisViews(asset, analysis, questionIds)

  const groupAnalysis = analysis.groups[groupId] ?? null
  const groupView: GrammarFillGroupView | null = groupAnalysis
    ? { overview: groupAnalysis.overview }
    : null

  return {
    report: buildShellReport(asset, group, groupId),
    passageStructures: { [GRAMMAR_FILL_SECTION]: passageStructure },
    surfaceData: useSelectedSurface
      ? { ...plainModel.surfaceData, evidence }
      : { textMap, questions, evidence },
    analysisByQuestionId,
    groupView,
    defaultQuestionId: questionIds[0] ?? null,
    normalization: plainModel.normalization,
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build the per-paragraph textMap for grammar-fill analysis.
 *
 * GATE-1 MF-1: uses the SAME per-paragraph construction as cloze
 * (`clozeAnalysisSurfaceAdapter.ts:205-226`) with sentenceId `${paragraphId}-s{i}`.
 * This ensures that every sentenceId emitted by the locate function also exists
 * in the rendered textMap — preventing the I11 silent-fail mode.
 *
 * Critically: does NOT use the plain-view `\n\n`-join
 * (`grammarFillPaperViewAdapter.ts:110-120`), which produces different paragraph
 * ids and breaks the cross-column evidence line.
 */
function buildGrammarFillAnalysisTextMap(
  asset: PaperAssetV1,
  group: PaperAssetV1['content']['groups'][string],
): PaperTextMap {
  const rawParagraphs = group.passage?.paragraphs ?? []
  const paragraphs: PaperTextMap['paragraphs'] = rawParagraphs.map((p) => {
    if (!p.text.trim()) {
      return { id: p.paragraphId, section: GRAMMAR_FILL_SECTION, sentences: [] }
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
    return { id: p.paragraphId, section: GRAMMAR_FILL_SECTION, sentences }
  })
  return { paperId: asset.paper.paperId, paragraphs }
}

function buildQuestions(
  asset: PaperAssetV1,
  questionIds: string[],
): PaperQuestion[] {
  return questionIds.map((qid, order) => {
    const q = asset.content.questions[qid]
    const blank = asset.content.blanks?.[q?.blankId ?? '']
    return {
      id: qid,
      section: GRAMMAR_FILL_SECTION,
      order,
      questionNo: String(q?.questionNo ?? ''),
      stem: q?.stem ?? '',
      options: blank?.prompt
        ? [{ label: 'prompt', text: blank.prompt }]
        : [],
    }
  })
}

function buildEvidence(
  analysis: ReviewedGrammarFillAnalysisV1,
  questionIds: string[],
  textMap: PaperTextMap,
  failOnUnresolved: boolean,
): { evidence: PaperEvidence[] } {
  const evidence: PaperEvidence[] = []

  for (const questionId of questionIds) {
    const blankAnalysis = analysis.blanks[questionId]
    if (!blankAnalysis) continue

    for (let i = 0; i < blankAnalysis.evidence.length; i++) {
      const item = blankAnalysis.evidence[i]
      // Grammar fill has no option side (no A–D options).
      // Both 'passage' and 'stem' signals are searched in the passage text.
      const evidenceId = `${questionId}-evidence-${i + 1}`
      const ranges = findAllTextRangesTolerant(textMap, item.signalText)
      if (failOnUnresolved && ranges.length === 0) {
        throw new Error(
          `[GRAMMAR_FILL_EVIDENCE_UNRESOLVED] ${evidenceId} has no range in canonical visible text.`,
        )
      }
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
  analysis: ReviewedGrammarFillAnalysisV1,
  questionIds: string[],
): Record<string, GrammarFillBlankAnalysisView> {
  const out: Record<string, GrammarFillBlankAnalysisView> = {}

  for (let qi = 0; qi < questionIds.length; qi++) {
    const questionId = questionIds[qi]
    const blankAnalysis = analysis.blanks[questionId]
    if (!blankAnalysis) continue

    const q = asset.content.questions[questionId]

    const facetEntry = FACET_FRAMEWORKS[blankAnalysis.facetKey]
    if (!facetEntry) {
      throw new Error(
        `[I14] Unknown facetKey '${blankAnalysis.facetKey}' for blank ${questionId}. Check grammarFillFacetRegistry.ts.`,
      )
    }

    const evidenceRows: GrammarFillEvidenceRowView[] = blankAnalysis.evidence.map((item, i) => ({
      evidenceId: `${questionId}-evidence-${i + 1}`,
      type: item.type,
      typeLabel: GRAMMAR_FILL_EVIDENCE_TYPE_LABELS[item.type] ?? item.type,
      signalSide: item.signalSide,
      signalText: item.signalText,
      relation: item.relation,
    }))

    out[questionId] = {
      questionId,
      questionNo: String(q?.questionNo ?? blankAnalysis.blankNo),
      blankNo: blankAnalysis.blankNo,
      blankType: blankAnalysis.blankType,
      hint: blankAnalysis.hint,
      facetKey: blankAnalysis.facetKey,
      labelZh: facetEntry.labelZh,
      framework: facetEntry.framework,
      answer: blankAnalysis.answer,
      role: blankAnalysis.role ?? null,
      path: blankAnalysis.path ?? null,
      reason: blankAnalysis.reason,
      evidenceRows,
      teachingNote: blankAnalysis.teachingNote,
    }
  }

  return out
}

// ─── GATE-1: Whitespace-tolerant text range locate ────────────────────────────

/**
 * Find ALL whitespace-tolerant occurrences of `needle` in the textMap.
 *
 * Algorithm:
 *   1. For each sentence, build a normalized projection by collapsing every
 *      run of whitespace to a single space.  Maintain a parallel `indexMap`
 *      array: indexMap[normalizedOffset] = storedOffset.
 *   2. Normalize the needle the same way.
 *   3. Find all occurrences of the normalized needle in the normalized text.
 *   4. Map each [normalizedStart, normalizedStart+len) back to stored offsets
 *      via indexMap.
 *   5. Return `{sentenceId, start, end}` in stored offsets.
 *
 * Empty/whitespace-only needle → no ranges.
 * Unlocatable needle → no ranges (no throw).
 */
export function findAllTextRangesTolerant(
  textMap: PaperTextMap,
  needle: string,
): PaperTextRange[] {
  const normalizedNeedle = collapseWhitespace(needle).trim()
  if (!normalizedNeedle) return []

  const ranges: PaperTextRange[] = []

  for (const paragraph of textMap.paragraphs) {
    for (const sentence of paragraph.sentences) {
      const { normalized, indexMap } = buildNormalizedProjection(sentence.text)

      let searchFrom = 0
      while (searchFrom <= normalized.length - normalizedNeedle.length) {
        const matchStart = normalized.indexOf(normalizedNeedle, searchFrom)
        if (matchStart === -1) break

        const matchEnd = matchStart + normalizedNeedle.length

        // Map normalized offsets back to stored offsets.
        const storedStart = indexMap[matchStart] ?? sentence.text.length
        // The end offset in stored text: if matchEnd is within bounds, use
        // indexMap[matchEnd]; otherwise storedEnd = text length.
        const storedEnd =
          matchEnd < indexMap.length
            ? indexMap[matchEnd]
            : sentence.text.length

        ranges.push({
          sentenceId: sentence.id,
          start: storedStart,
          end: storedEnd,
        })

        // Advance past this match (in normalized space) to find next.
        searchFrom = matchStart + normalizedNeedle.length
      }
    }
  }

  return ranges
}

/**
 * Build a normalized projection of a stored sentence text.
 *
 * Returns:
 *   - `normalized`: the text with every whitespace run collapsed to a single
 *     space (including leading/trailing, preserving).
 *   - `indexMap`: an array of length `normalized.length + 1` where
 *     `indexMap[i]` is the index in the original `text` that corresponds to
 *     position `i` in `normalized`. The extra entry at [normalized.length]
 *     maps to `text.length` so storedEnd can be derived for a match that
 *     ends at the last normalized character.
 */
function buildNormalizedProjection(text: string): {
  normalized: string
  indexMap: number[]
} {
  const normalizedChars: string[] = []
  const indexMap: number[] = []

  let i = 0
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      // Consume the entire whitespace run.
      const runStart = i
      while (i < text.length && /\s/.test(text[i])) {
        i++
      }
      // Emit a single space in normalized; map it to the start of the run.
      normalizedChars.push(' ')
      indexMap.push(runStart)
    } else {
      normalizedChars.push(text[i])
      indexMap.push(i)
      i++
    }
  }

  // Sentinel: end-of-string in normalized maps to end-of-string in stored.
  indexMap.push(text.length)

  return {
    normalized: normalizedChars.join(''),
    indexMap,
  }
}

/** Collapse any run of whitespace characters to a single space. */
function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ')
}

// ─── Shell report ────────────────────────────────────────────────────────────

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
      promptVersion: 'i14-grammar-fill-analysis-surface',
      modelId: null,
      runId: 'grammar-fill-analysis-surface',
    },
    sourcePaper: {
      paperId: asset.paper.paperId,
      paperName: asset.paper.title,
      year: 2024,
      region: '',
      section: GRAMMAR_FILL_SECTION,
    },
    passages: [
      {
        paperSection: GRAMMAR_FILL_SECTION,
        passageTitle: group.title || GRAMMAR_FILL_SECTION,
        questionGroupId: groupId,
        loads: {
          vocabularyChunkLoad: ZERO_LOAD_BAR,
          grammarLoad: ZERO_LOAD_BAR,
          discourseStructureLoad: ZERO_LOAD_BAR,
          topicBackgroundLoad: ZERO_LOAD_BAR,
          evidenceFindingLoad: ZERO_LOAD_BAR,
        },
        aiInitialBand: { band: '—', basis: 'grammar-fill analysis source' },
        passageOutline: { mainIdea: group.title || GRAMMAR_FILL_SECTION, logicalLayers: [] },
        keyChunks: [],
        questions: [],
      },
    ],
  }
}
