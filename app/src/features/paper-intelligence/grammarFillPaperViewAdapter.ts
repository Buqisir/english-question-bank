import { segmentPaperText } from '../../../../shared/papersurface/segmentPaperText.mjs'
import type { PaperTextMap } from '../../../../shared/papersurface/types'
import type { PaperAssetV1 } from '../../domain/paperAsset.ts'
import type { PaperSurfaceData } from './adapter/index.ts'
import type {
  AiInitialBand,
  LoadBar,
  PaperIntelligenceReport,
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
}

const GRAMMAR_FILL_SECTION = '语法填空'

const ZERO_LOAD_BAR: LoadBar = { score: 0, label: '', shortReason: '', evidenceItems: [] }
const ZERO_INITIAL_BAND: AiInitialBand = { band: '', basis: '' }
const ZERO_OUTLINE: PassageOutline = { mainIdea: '', logicalLayers: [] }

export function buildGrammarFillPaperView(input: {
  asset: PaperAssetV1
  groupId: string
}): GrammarFillPaperViewModel {
  const { asset, groupId } = input
  const group = asset.content.groups[groupId]
  if (!group || group.groupType !== 'grammarFill') {
    throw new Error(`[I4] group not found or not grammarFill: ${groupId}`)
  }

  const questionIds = group.questionIds ?? []
  const textMap = buildGrammarFillTextMap(asset, group)
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
    surfaceData: {
      textMap,
      questions,
      evidence: [],
    },
    analysisByQuestionId: Object.fromEntries(questionIds.map((qid) => [qid, null])),
    defaultQuestionId: questionIds[0] ?? null,
  }
}

function buildGrammarFillTextMap(asset: PaperAssetV1, group: PaperAssetV1['content']['groups'][string]): PaperTextMap {
  const rawParagraphs = (group.passage?.paragraphs ?? [])
  const paragraphs: PaperTextMap['paragraphs'] = rawParagraphs.length > 0
    ? segmentPaperText(rawParagraphs.map((p) => p.text).join('\n\n'), { sectionId: GRAMMAR_FILL_SECTION }).paragraphs
        .map((p) => ({ id: p.id, section: GRAMMAR_FILL_SECTION, sentences: p.sentences }))
    : []
  return {
    paperId: asset.paper.paperId,
    paragraphs,
  }
}
