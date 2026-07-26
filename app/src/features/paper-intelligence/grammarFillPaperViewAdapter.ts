import { segmentPaperText } from '../../../../shared/papersurface/segmentPaperText.mjs'
import {
  buildCanonicalConsumptionSurfaceData,
  buildCanonicalPaperGroupSurfaceData,
} from '../../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { selectConsumerGroupMode } from '../../../../shared/paper-canonical/consumerProjection.mjs'
import type { PaperTextMap } from '../../../../shared/papersurface/types'
import type { PaperAssetV1 } from '../../domain/paperAsset.ts'
import { grammarFillBlankPattern } from '../../shared-ui/papersurface/grammarFillBlank.ts'
import type {
  AiInitialBand,
  LoadBar,
  PaperIntelligenceReport,
  PaperSurfaceData,
  PassageOutline,
  PassageReport,
  PassageStructure,
} from './paperIntelligenceTypes.ts'

export type GrammarFillPaperViewModel = {
  report: PaperIntelligenceReport
  passageStructures: Record<string, PassageStructure>
  surfaceData: PaperSurfaceData
  analysisByQuestionId: Record<string, null>
  defaultQuestionId: string | null
  normalization:
    | { status: 'ready'; semanticDigest: string }
    | {
        status: 'legacy'
        diagnostic:
          | { code: 'CANONICAL_COMPATIBILITY_NOT_ENABLED'; paperId: string; groupId: string }
          | {
              code: 'CANONICAL_NORMALIZATION_NEEDS_REVIEW'
              paperId: string
              groupId: string
              issues: ReadonlyArray<{ code: string; path: string; message: string }>
            }
          | {
              code: 'CANONICAL_CONSUMPTION_LEGACY_SELECTED'
              paperId: string
              groupId: string
            }
      }
}

const GRAMMAR_FILL_SECTION = '语法填空'

const ZERO_LOAD_BAR: LoadBar = { score: 0, label: '', shortReason: '', evidenceItems: [] }
const ZERO_INITIAL_BAND: AiInitialBand = { band: '', basis: '' }
const ZERO_OUTLINE: PassageOutline = { mainIdea: '', logicalLayers: [] }

export function buildGrammarFillPaperView(input: {
  asset: PaperAssetV1
  groupId: string
  canonicalConsumption?: unknown
}): GrammarFillPaperViewModel {
  const { asset, groupId, canonicalConsumption } = input
  const group = asset.content.groups[groupId]
  if (!group || group.groupType !== 'grammarFill') {
    throw new Error(`[I4] group not found or not grammarFill: ${groupId}`)
  }

  const questionIds = group.questionIds ?? []
  const selectedMode = canonicalConsumption
    ? selectConsumerGroupMode({
        consumption: canonicalConsumption,
        familyContractId: 'grammar-fill',
        groupId,
      }).mode
    : null
  const canonicalResult = selectedMode === 'canonical'
    ? buildCanonicalConsumptionSurfaceData({
        consumption: canonicalConsumption,
        familyContractId: 'grammar-fill',
        groupId,
      })
    : selectedMode === 'legacy'
      ? {
          status: 'legacy' as const,
          diagnostic: {
            code: 'CANONICAL_CONSUMPTION_LEGACY_SELECTED' as const,
            paperId: asset.paper.paperId,
            groupId,
          },
        }
      : buildCanonicalPaperGroupSurfaceData({ asset, groupId })
  const legacyTextMap = canonicalResult.status === 'ready'
    ? null
    : buildGrammarFillTextMap(asset, group)
  const passageStructure: PassageStructure = {
    section: GRAMMAR_FILL_SECTION,
    paragraphs: (group.passage?.paragraphs ?? []).map((p, i) => ({
      id: p.paragraphId,
      label: i === 0 ? '标题' : `P${i}`,
      text: p.text,
    })),
  }

  const questions = questionIds.map((qid, order) => {
    const q = asset.content.questions[qid]
    const questionNo = String(q?.questionNo ?? '')
    const rawStem = q?.stem ?? ''
    return {
      id: qid,
      section: GRAMMAR_FILL_SECTION,
      order,
      questionNo,
      // Defensive: a grammar-fill stem that is just the bare question
      // number (matches its own questionNo) duplicates the rendered "56."
      // label — suppress it instead of showing "56. 56".
      stem: rawStem.trim() === questionNo && /^\d+$/.test(rawStem.trim()) ? '' : rawStem,
      // 提示词已随挖空渲在文中（`__56__ (hold)`），rail 里不再造
      // `label:'prompt'` 假选项——否则空题干同行策略会渲出「56. prompt. hold」
      // 噪音行（owner QA 2026-07-08）。语法填空的 rail 行应整体消失。
      options: [],
    }
  })

  const passageReport: PassageReport = {
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
    aiInitialBand: ZERO_INITIAL_BAND,
    passageOutline: ZERO_OUTLINE,
    keyChunks: [],
    questions: [],
  }

  if (canonicalResult.status === 'needs_review') {
    console.warn(
      '[paper-normalization] grammarFill compatibility kept legacy path',
      canonicalResult.diagnostic,
    )
  }

  return {
    report: {
      schemaVersion: 'paper-intelligence-report-v1',
      generatedAt: new Date().toISOString(),
      generator: {
        promptVersion: 'grammar-fill-paper-view-v1',
        modelId: null,
        runId: 'i4-grammar-fill-import',
      },
      sourcePaper: {
        paperId: asset.paper.paperId,
        paperName: asset.paper.title,
        year: new Date().getFullYear(),
        region: '',
        section: GRAMMAR_FILL_SECTION,
      },
      passages: [passageReport],
    },
    passageStructures: { [GRAMMAR_FILL_SECTION]: passageStructure },
    surfaceData:
      canonicalResult.status === 'ready'
        ? canonicalResult.surfaceData
        : {
            textMap: legacyTextMap!,
            questions,
            evidence: [],
          },
    analysisByQuestionId: Object.fromEntries(questionIds.map((qid) => [qid, null])),
    defaultQuestionId: questionIds[0] ?? null,
    normalization:
      canonicalResult.status === 'ready'
        ? { status: 'ready', semanticDigest: canonicalResult.semanticDigest }
        : { status: 'legacy', diagnostic: canonicalResult.diagnostic },
  }
}

// Display-only normalization: some stored grammar-fill passages carry the
// I15 in-passage-editor blank form (`56._____`, `57._____(absorb)`) instead
// of the `__NN__ (hint)` form `paperBlankPattern` (the rail-mode blank
// stylist shared with server/print-renderer.mjs) matches. This ONLY feeds
// the rail/lecture-mode textMap below — I15's clickable in-passage blank
// path (`blankFocusMode: 'in-passage'`) is built by a separate adapter
// (grammarFillAnalysisSurfaceAdapter.ts's buildGrammarFillAnalysisSurfaceModel)
// that never calls this function, so normalizing here cannot break it.
// Storage is untouched — this only reshapes the string fed to the renderer.
function normalizeGrammarFillBlanksForRail(text: string): string {
  grammarFillBlankPattern.lastIndex = 0
  return text.replace(grammarFillBlankPattern, (full, num: string) => {
    const hintMatch = full.match(/\(([^)]*)\)\s*$/)
    return hintMatch ? `__${num}__ (${hintMatch[1]})` : `__${num}__`
  })
}

function buildGrammarFillTextMap(asset: PaperAssetV1, group: PaperAssetV1['content']['groups'][string]): PaperTextMap {
  const rawParagraphs = (group.passage?.paragraphs ?? [])
  const paragraphs: PaperTextMap['paragraphs'] = rawParagraphs.length > 0
    ? segmentPaperText(
        normalizeGrammarFillBlanksForRail(rawParagraphs.map((p) => p.text).join('\n\n')),
        { sectionId: GRAMMAR_FILL_SECTION },
      ).paragraphs.map((p) => ({ id: p.id, section: GRAMMAR_FILL_SECTION, sentences: p.sentences }))
    : []
  return {
    paperId: asset.paper.paperId,
    paragraphs,
  }
}
