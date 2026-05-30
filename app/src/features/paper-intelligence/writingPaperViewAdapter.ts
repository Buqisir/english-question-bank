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

export type { WritingChromeBlock, WritingPageModel } from './writingPageModel'
import { buildWritingPageModel } from './writingPageModel.mjs'
import type { WritingPageModel } from './writingPageModel'

export type WritingPaperViewModel = {
  report: PaperIntelligenceReport
  passageStructures: Record<string, PassageStructure>
  surfaceData: PaperSurfaceData
  analysisByQuestionId: Record<string, null>
  defaultQuestionId: string | null
  pageModel: WritingPageModel
}

const ZERO_LOAD_BAR: LoadBar = { score: 0, label: '', shortReason: '', evidenceItems: [] }
const ZERO_INITIAL_BAND: AiInitialBand = { band: '', basis: '' }
const ZERO_OUTLINE: PassageOutline = { mainIdea: '', logicalLayers: [] }

export function buildWritingPaperView(input: {
  asset: PaperAssetV1
  groupId: string
}): WritingPaperViewModel {
  const { asset, groupId } = input
  const group = asset.content.groups[groupId]
  if (!group || group.groupType !== 'writing') {
    throw new Error(`[I5] group not found or not writing: ${groupId}`)
  }

  const writingTaskId = group.writingTaskId
  const task = writingTaskId ? asset.content.writingTasks?.[writingTaskId] : null
  const taskType = task?.taskType
  const section = taskType === 'continuation' ? '读后续写' : '应用文写作'

  const pageModel = buildWritingPageModel(asset, group, task ?? null)

  const textMap = buildWritingTextMap(asset, group, section)
  const passageStructure: PassageStructure = {
    section,
    paragraphs: (group.passage?.paragraphs ?? []).map((p, i) => ({
      id: p.paragraphId,
      label: i === 0 ? '标题' : `P${i}`,
      text: p.text,
    })),
  }

  const passageReport: PassageReport = {
    paperSection: section,
    passageTitle: group.title || section,
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
        promptVersion: 'writing-paper-view-v1',
        modelId: null,
        runId: 'i5-writing-import',
      },
      sourcePaper: {
        paperId: asset.paper.paperId,
        paperName: asset.paper.title,
        year: new Date().getFullYear(),
        region: '',
        section,
      },
      passages: [passageReport],
    },
    passageStructures: { [section]: passageStructure },
    surfaceData: {
      textMap,
      questions: [],
      evidence: [],
    },
    analysisByQuestionId: {},
    defaultQuestionId: null,
    pageModel,
  }
}

function buildWritingTextMap(
  asset: PaperAssetV1,
  group: PaperAssetV1['content']['groups'][string],
  section: string,
): PaperTextMap {
  const rawParagraphs = group.passage?.paragraphs ?? []
  const paragraphs: PaperTextMap['paragraphs'] = rawParagraphs.length > 0
    ? segmentPaperText(rawParagraphs.map((p) => p.text).join('\n\n'), { sectionId: section }).paragraphs
        .map((p) => ({ id: p.id, section, sentences: p.sentences }))
    : []
  return {
    paperId: asset.paper.paperId,
    paragraphs,
  }
}
