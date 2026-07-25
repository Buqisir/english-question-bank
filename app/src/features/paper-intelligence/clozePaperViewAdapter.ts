import { segmentPaperText } from '../../../../shared/papersurface/segmentPaperText.mjs'
import { buildCanonicalClozeSurfaceData } from '../../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import type { PaperTextMap } from '../../../../shared/papersurface/types'
import type { PaperAssetV1 } from '../../domain/paperAsset.ts'
import type {
  AiInitialBand,
  LoadBar,
  PaperIntelligenceReport,
  PaperSurfaceData,
  PassageOutline,
  PassageReport,
  PassageStructure,
} from './paperIntelligenceTypes.ts'

export type ClozePaperViewModel = {
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
      }
}

const CLOZE_SECTION = '完形填空'

const ZERO_LOAD_BAR: LoadBar = { score: 0, label: '', shortReason: '', evidenceItems: [] }
const ZERO_INITIAL_BAND: AiInitialBand = { band: '', basis: '' }
const ZERO_OUTLINE: PassageOutline = { mainIdea: '', logicalLayers: [] }

export function buildClozePaperView(input: {
  asset: PaperAssetV1
  groupId: string
}): ClozePaperViewModel {
  const { asset, groupId } = input
  const group = asset.content.groups[groupId]
  if (!group || group.groupType !== 'cloze') {
    throw new Error(`[I3] group not found or not cloze: ${groupId}`)
  }

  const questionIds = group.questionIds ?? []
  const canonicalResult = buildCanonicalClozeSurfaceData({ asset, groupId })
  const textMap = buildClozeTextMap(asset, group)
  const passageStructure: PassageStructure = {
    section: CLOZE_SECTION,
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
      section: CLOZE_SECTION,
      order,
      questionNo,
      // Defensive: a cloze/grammar-fill stem that is just the bare question
      // number (matches its own questionNo) duplicates the rendered "56."
      // label — suppress it instead of showing "56. 56".
      stem: rawStem.trim() === questionNo && /^\d+$/.test(rawStem.trim()) ? '' : rawStem,
      options: q?.options ?? [],
    }
  })

  const passageReport: PassageReport = {
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
    aiInitialBand: ZERO_INITIAL_BAND,
    passageOutline: ZERO_OUTLINE,
    keyChunks: [],
    questions: [],
  }

  if (canonicalResult.status === 'needs_review') {
    console.warn('[paper-normalization] cloze compatibility kept legacy path', canonicalResult.diagnostic)
  }

  return {
    report: {
      schemaVersion: 'paper-intelligence-report-v1',
      generatedAt: new Date().toISOString(),
      generator: {
        promptVersion: 'cloze-paper-view-v1',
        modelId: null,
        runId: 'i3-cloze-import',
      },
      sourcePaper: {
        paperId: asset.paper.paperId,
        paperName: asset.paper.title,
        year: new Date().getFullYear(),
        region: '',
        section: CLOZE_SECTION,
      },
      passages: [passageReport],
    },
    passageStructures: { [CLOZE_SECTION]: passageStructure },
    surfaceData:
      canonicalResult.status === 'ready'
        ? canonicalResult.surfaceData
        : {
            textMap,
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

function buildClozeTextMap(asset: PaperAssetV1, group: PaperAssetV1['content']['groups'][string]): PaperTextMap {
  const rawParagraphs = (group.passage?.paragraphs ?? [])
  const paragraphs: PaperTextMap['paragraphs'] = rawParagraphs.length > 0
    ? segmentPaperText(rawParagraphs.map((p) => p.text).join('\n\n'), { sectionId: CLOZE_SECTION }).paragraphs
        .map((p) => ({ id: p.id, section: CLOZE_SECTION, sentences: p.sentences }))
    : []
  return {
    paperId: asset.paper.paperId,
    paragraphs,
  }
}
