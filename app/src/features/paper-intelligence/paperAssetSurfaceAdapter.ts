/**
 * C6a-4 paper-asset -> PaperSurface adapter.
 *
 * This is the official source=paper-asset bridge. It consumes the reviewed
 * paper-asset-v1 fixture and reviewed Reading Choice analysis JSON, then emits
 * the same neutral PaperSurface payload the legacy PI adapter emits.
 *
 * Rules:
 * - no React, no DOM, no fetch, no router reads
 * - no fallback to answerKey as explanation
 * - no fallback to legacy PI report or old RA module
 * - only the requested group is rendered in C6a-4
 */

import { segmentPaperText } from '../../../../shared/papersurface/segmentPaperText.mjs'
import type {
  PaperEvidence,
  PaperQuestion,
  PaperTextMap,
} from '../../../../shared/papersurface/types'
import type {
  PaperAssetV1,
  PaperContentGroup,
  PaperContentQuestion,
  ReadingChoiceAnalysis,
  OptionAnalysisItem,
  LocationParaphrase,
} from '../../domain/paperAsset.ts'
import type { PaperSurfaceData } from './adapter/index.ts'
import type {
  LoadBar,
  PaperIntelligenceReport,
  PassageStructure,
  QuestionAnalysis,
} from './paperIntelligenceTypes.ts'

export type ReviewedReadingChoiceAnalysisV1 = {
  schemaVersion: 'reading-choice-analysis-v1'
  paperId: string
  sourceAssetVersion: number
  targetGroups: string[]
  meta?: Record<string, unknown>
  groups: Record<
    string,
    {
      overview?: string
      discourseStructure?: {
        summary?: string
        paragraphs?: Array<{
          paragraphId: string
          summary: string
          function: string
        }>
      }
    }
  >
  questions: Record<string, ReadingChoiceAnalysis>
}

export type PaperAssetQuestionAnalysisView = {
  questionId: string
  questionNo: string
  skillLabel: string
  questionFocus: string
  stem: string
  stemTranslationZh: string
  answer: string
  supportEvidenceId: string | null
  supportEvidenceRows: Array<{
    evidenceId: string
    role: 'primary' | 'supporting'
    paragraphId: string
    quote: string
  }>
  options: Array<{
    label: string
    text: string
    translationZh: string
    status: 'correct' | 'wrong'
    trapLabel: string | null
    trapExplanation: string | null
  }>
  locationParaphrases: LocationParaphrase[]
}

export type PaperAssetSurfaceModel = {
  report: PaperIntelligenceReport
  passageStructures: Record<string, PassageStructure>
  surfaceData: PaperSurfaceData
  analysisByQuestionId: Record<string, PaperAssetQuestionAnalysisView>
  evidenceKindById: Record<string, 'support' | 'trap'>
  defaultQuestionId: string | null
}

export type BuildPaperAssetSurfaceModelInput = {
  asset: PaperAssetV1
  analysis: ReviewedReadingChoiceAnalysisV1
  groupId: string
}

const SECTION_BY_READING_GROUP_ID: Record<string, string> = {
  'group-2024-jslk-reading-a': 'A',
  'group-2024-jslk-reading-b': 'B',
  'group-2024-jslk-reading-c': 'C',
  'group-2024-jslk-reading-d': 'D',
}

const skillLabels: Record<string, string> = {
  detail: '细节理解',
  inference: '推理判断',
  mainIdea: '主旨大意',
  wordMeaning: '词义猜测',
  authorPurpose: '写作目的',
  attitude: '态度观点',
  title: '标题归纳',
  structure: '篇章结构',
}

const trapLabels: Record<string, string> = {
  sourceLexicalTrap: '原文词钩干扰',
  polarityReversal: '黑白颠倒',
  scopeShift: '范围偷换',
  entityMismatch: '对象错配',
  unsupportedClaim: '无中生有',
}

export function buildPaperAssetSurfaceModel(
  input: BuildPaperAssetSurfaceModelInput,
): PaperAssetSurfaceModel {
  const { asset, analysis, groupId } = input
  if (asset.schemaVersion !== 'paper-asset-v1') {
    throw new Error('[C6a-4] paper asset schemaVersion must be paper-asset-v1.')
  }
  if (analysis.schemaVersion !== 'reading-choice-analysis-v1') {
    throw new Error('[C6a-4] reviewed analysis schemaVersion must be reading-choice-analysis-v1.')
  }
  if (analysis.paperId !== asset.paper.paperId) {
    throw new Error('[C6a-4] reviewed analysis paperId does not match paper asset.')
  }

  const group = asset.content.groups[groupId]
  if (!group) {
    throw new Error(`[C6a-4] paper-asset group not found: ${groupId}`)
  }
  if (group.groupType !== 'reading') {
    throw new Error(`[C6a-4] source=paper-asset currently supports reading groups only: ${groupId}`)
  }
  if (!group.passage?.paragraphs?.length) {
    throw new Error(`[C6a-4] reading group has no confirmed passage paragraphs: ${groupId}`)
  }

  const paperSection = SECTION_BY_READING_GROUP_ID[groupId] ?? group.title.replace(/^Reading\s+/i, '').trim()
  if (!paperSection) {
    throw new Error(`[C6a-4] cannot derive paper section for group: ${groupId}`)
  }

  const groupAnalysis = analysis.groups[groupId]
  const passageStructure: PassageStructure = {
    section: paperSection,
    paragraphs: group.passage.paragraphs.map((paragraph, index) => ({
      id: paragraph.paragraphId,
      label: index === 0 ? '标题' : `P${index}`,
      text: paragraph.text,
    })),
  }

  const questions = buildQuestions(asset, analysis, group, paperSection)
  const textMap = buildTextMap(asset, group, paperSection)
  const evidence = buildEvidence(analysis, group, textMap)
  const analysisByQuestionId = buildAnalysisViews(asset, analysis, group, evidence)
  const evidenceKindById = Object.fromEntries(
    evidence.map((item) => [item.id, item.kind === 'trap' ? 'trap' : 'support'] as const),
  )

  return {
    report: buildShellReport({
      asset,
      group,
      groupId,
      paperSection,
      groupAnalysis,
      questions,
    }),
    passageStructures: { [paperSection]: passageStructure },
    surfaceData: {
      textMap,
      questions,
      evidence,
    },
    analysisByQuestionId,
    evidenceKindById,
    defaultQuestionId: group.questionIds[0] ?? null,
  }
}

function buildTextMap(
  asset: PaperAssetV1,
  group: PaperContentGroup,
  paperSection: string,
): PaperTextMap {
  return {
    paperId: asset.paper.paperId,
    paragraphs: (group.passage?.paragraphs ?? []).map((paragraph) => ({
      id: paragraph.paragraphId,
      section: paperSection,
      sentences: segmentSentencesForParagraph(paragraph.text, paragraph.paragraphId),
    })),
  }
}

function segmentSentencesForParagraph(
  text: string,
  paragraphId: string,
): Array<{ id: string; text: string; tokens: never[] }> {
  if (!text.trim()) return []
  const segmented = segmentPaperText(text, { sectionId: paragraphId })
  const first = segmented.paragraphs[0]
  if (!first) return []
  return first.sentences.map((sentence, index) => ({
    id: `${paragraphId}-s${index}`,
    text: sentence.text,
    tokens: [] as never[],
  }))
}

function buildQuestions(
  asset: PaperAssetV1,
  analysis: ReviewedReadingChoiceAnalysisV1,
  group: PaperContentGroup,
  paperSection: string,
): PaperQuestion[] {
  return group.questionIds.map((questionId, index) => {
    const question = readQuestion(asset, questionId)
    const questionAnalysis = analysis.questions[questionId]
    const options = (question.options ?? []).map((option) => {
      const optionAnalysis = questionAnalysis?.optionAnalysis?.find((item) => item.label === option.label)
      return {
        label: option.label,
        text: option.text,
        translation: optionAnalysis?.optionTranslationZh,
      }
    })
    return {
      id: question.questionId,
      section: paperSection,
      order: index,
      questionNo: String(question.questionNo),
      stem: question.stem,
      stemTranslation: questionAnalysis?.stemTranslationZh,
      options,
    }
  })
}

function buildEvidence(
  analysis: ReviewedReadingChoiceAnalysisV1,
  group: PaperContentGroup,
  textMap: PaperTextMap,
): PaperEvidence[] {
  const evidence: PaperEvidence[] = []
  for (const questionId of group.questionIds) {
    const questionAnalysis = analysis.questions[questionId]
    if (!questionAnalysis) continue
    const correct = questionAnalysis.optionAnalysis.find((item) => item.status === 'correct')
    for (let index = 0; index < (correct?.evidence ?? []).length; index++) {
      const item = correct?.evidence?.[index]
      if (!item?.quote) continue
      const range = resolveQuoteInTextMap(item.paragraphId, item.quote, textMap)
      if (!range) continue
      evidence.push({
        id: `${questionId}-support-${index + 1}`,
        questionId,
        kind: 'support',
        range,
      })
    }
  }
  return evidence
}

function resolveQuoteInTextMap(
  paragraphId: string,
  quote: string,
  textMap: PaperTextMap,
): { sentenceId: string; start: number; end: number } | null {
  const paragraphs = textMap.paragraphs.filter((paragraph) => paragraph.id === paragraphId)
  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.sentences) {
      const index = sentence.text.indexOf(quote)
      if (index !== -1) {
        return {
          sentenceId: sentence.id,
          start: index,
          end: index + quote.length,
        }
      }
    }
  }

  // Some reviewed evidence spans cross sentence boundaries after sentence
  // segmentation. C6a-4 keeps PaperSurface evidence conservative: if the
  // quote cannot be anchored to one sentence, the line is skipped rather
  // than guessed.
  return null
}

function buildAnalysisViews(
  asset: PaperAssetV1,
  analysis: ReviewedReadingChoiceAnalysisV1,
  group: PaperContentGroup,
  evidence: PaperEvidence[],
): Record<string, PaperAssetQuestionAnalysisView> {
  const evidenceIdsByQuestion = new Map<string, string[]>()
  for (const item of evidence) {
    const ids = evidenceIdsByQuestion.get(item.questionId) ?? []
    ids.push(item.id)
    evidenceIdsByQuestion.set(item.questionId, ids)
  }

  const out: Record<string, PaperAssetQuestionAnalysisView> = {}
  for (const questionId of group.questionIds) {
    const question = readQuestion(asset, questionId)
    const questionAnalysis = analysis.questions[questionId]
    if (!questionAnalysis) continue

    const supportEvidenceIds = evidenceIdsByQuestion.get(questionId) ?? []
    const correct = questionAnalysis.optionAnalysis.find((item) => item.status === 'correct')
    const supportEvidenceRows = (correct?.evidence ?? []).map((item, index) => ({
      evidenceId: supportEvidenceIds[index] ?? '',
      role: item.role,
      paragraphId: item.paragraphId,
      quote: item.quote,
    })).filter((item) => item.evidenceId)

    out[questionId] = {
      questionId,
      questionNo: String(question.questionNo),
      skillLabel: skillLabels[questionAnalysis.skill?.primary] ?? questionAnalysis.skill?.primary ?? '阅读理解',
      questionFocus: questionAnalysis.questionFocus,
      stem: question.stem,
      stemTranslationZh: questionAnalysis.stemTranslationZh,
      answer: asset.answerKey.answers[questionId]?.answer ?? '',
      supportEvidenceId: supportEvidenceRows[0]?.evidenceId ?? null,
      supportEvidenceRows,
      options: (question.options ?? []).map((option) => {
        const row = questionAnalysis.optionAnalysis.find((item) => item.label === option.label)
        return {
          label: option.label,
          text: option.text,
          translationZh: row?.optionTranslationZh ?? '',
          status: row?.status ?? 'wrong',
          trapLabel: row && row.status === 'wrong' && row.trap
            ? trapLabels[row.trap.primaryType] ?? row.trap.primaryType
            : null,
          trapExplanation: row && row.status === 'wrong' && row.trap
            ? describeTrap(row)
            : null,
        }
      }),
      locationParaphrases: questionAnalysis.locationParaphrases,
    }
  }
  return out
}

function describeTrap(option: OptionAnalysisItem): string {
  const trap = option.trap
  if (!trap) return ''
  switch (trap.primaryType) {
    case 'sourceLexicalTrap':
      return trap.relationNote
    case 'polarityReversal':
    case 'scopeShift':
    case 'entityMismatch':
      return trap.explanation
    case 'unsupportedClaim':
      return trap.explanation
  }
}

function buildShellReport(input: {
  asset: PaperAssetV1
  group: PaperContentGroup
  groupId: string
  paperSection: string
  groupAnalysis: ReviewedReadingChoiceAnalysisV1['groups'][string] | undefined
  questions: PaperQuestion[]
}): PaperIntelligenceReport {
  const { asset, group, groupId, paperSection, groupAnalysis, questions } = input
  const outlineParagraphs = groupAnalysis?.discourseStructure?.paragraphs ?? []
  return {
    schemaVersion: 'paper-asset-v1-as-paper-intelligence-shell',
    generatedAt: '',
    generator: {
      promptVersion: 'c6a-4-paper-asset-loader',
      modelId: null,
      runId: 'paper-asset-loader',
    },
    sourcePaper: {
      paperId: asset.paper.paperId,
      paperName: asset.paper.title,
      year: 2024,
      region: '九省联考',
      section: '阅读理解',
      sourceFile: asset.sources.docx?.fileName,
    },
    passages: [
      {
        paperSection,
        passageTitle: group.title,
        questionGroupId: groupId,
        loads: emptyLoads(),
        aiInitialBand: {
          band: '—',
          basis: 'paper-asset source',
        },
        passageOutline: {
          mainIdea: groupAnalysis?.discourseStructure?.summary ?? groupAnalysis?.overview ?? group.title,
          logicalLayers: outlineParagraphs.map((paragraph) => paragraph.summary),
        },
        keyChunks: [],
        questions: questions.map((question, index): QuestionAnalysis => ({
          questionNo: question.questionNo,
          paperSection,
          questionIndexInPassage: index,
          stem: question.stem,
          stemTranslation: question.stemTranslation ?? '',
          answer: asset.answerKey.answers[question.id]?.answer ?? '',
          teacherQuestionType: '',
          keywords: [],
          locatingSentence: '',
          answerSentence: '',
          answerEvidence: {
            quote: '',
            explanationZh: '',
          },
          distractorAnalysis: [],
          synonymSummary: '',
          surfaceType: '',
          answeringMove: '',
          tCard: '',
          boundaryFlags: [],
          reviewNeeded: false,
          options: question.options.map((option) => ({
            label: option.label,
            content: option.text,
          })),
        })),
      },
    ],
  }
}

function emptyLoads(): PaperIntelligenceReport['passages'][number]['loads'] {
  const bar = (label: string): LoadBar => ({
    label,
    score: 0,
    shortReason: '',
    evidenceItems: [],
  })
  return {
    vocabularyChunkLoad: bar('词汇词块'),
    grammarLoad: bar('语法'),
    discourseStructureLoad: bar('语篇结构'),
    topicBackgroundLoad: bar('话题背景'),
    evidenceFindingLoad: bar('证据定位'),
  }
}

function readQuestion(asset: PaperAssetV1, questionId: string): PaperContentQuestion {
  const question = asset.content.questions[questionId]
  if (!question) {
    throw new Error(`[C6a-4] paper-asset question not found: ${questionId}`)
  }
  return question
}
