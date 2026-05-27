import { segmentPaperText } from '../../../../shared/papersurface/segmentPaperText.mjs'
import type { PaperTextMap } from '../../../../shared/papersurface/types'
import type { PaperAssetV1 } from '../../domain/paperAsset.ts'
import type { PaperSurfaceData } from './adapter/index.ts'
import type {
  PaperIntelligenceReport,
  PassageStructure,
  QuestionAnalysis,
} from './paperIntelligenceTypes.ts'

export type ClozePaperViewModel = {
  report: PaperIntelligenceReport
  passageStructures: Record<string, PassageStructure>
  surfaceData: PaperSurfaceData
  analysisByQuestionId: Record<string, QuestionAnalysis | null>
  defaultQuestionId: string | null
}

const CLOZE_SECTION = '完形填空'

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
  const textMap = buildClozeTextMap(asset, group)
  const passageStructure: PassageStructure = {
    section: CLOZE_SECTION,
    paragraphs: (group.passage?.paragraphs ?? []).map((p, i) => ({
      id: p.paragraphId,
      label: i === 0 ? '标题' : `P${i}`,
      text: p.text,
    })),
  }

  const questions = questionIds.map((qid) => {
    const q = asset.content.questions[qid]
    return {
      id: qid,
      questionNo: q?.questionNo ?? 0,
      stem: q?.stem ?? '',
      groupId,
      options: q?.options ?? [],
    }
  })

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
        sourceName: asset.paper.title,
        subject: asset.paper.subject,
        paperYear: new Date().getFullYear(),
      },
      passages: [
        {
          section: CLOZE_SECTION,
          groupId,
          passageTitle: group.title || CLOZE_SECTION,
          questions: [] as never[],
          loads: { vocabularyLoad: null, grammarLoad: null, backgroundLoad: null, evidenceDifficulty: null },
        },
      ],
    },
    passageStructures: { [CLOZE_SECTION]: passageStructure },
    surfaceData: {
      textMap,
      questions,
      evidence: [],
    },
    analysisByQuestionId: Object.fromEntries(questionIds.map((qid) => [qid, null])),
    defaultQuestionId: questionIds[0] ?? null,
  }
}

function buildClozeTextMap(asset: PaperAssetV1, group: PaperAssetV1['content']['groups'][string]): PaperTextMap {
  return {
    paperId: asset.paper.paperId,
    paragraphs: (group.passage?.paragraphs ?? []).map((p) => ({
      id: p.paragraphId,
      section: CLOZE_SECTION,
      sentences: segmentPaperText(p.text, p.paragraphId),
    })),
  }
}
