import { segmentPaperText } from '../../../../shared/papersurface/segmentPaperText.mjs'
import {
  buildCanonicalConsumptionSurfaceData,
} from '../../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import type {
  PaperTextMap,
  PaperTextRange,
} from '../../../../shared/papersurface/types'
import type {
  PaperAssetV1,
  PaperContentGroup,
} from '../../domain/paperAsset.ts'
import type {
  LoadBar,
  PaperIntelligenceReport,
  PaperSurfaceData,
  PassageStructure,
  QuestionAnalysis,
} from './paperIntelligenceTypes.ts'

export type SevenChoicesSignalSide = 'context-before' | 'context-after' | 'option'

export type SevenChoicesMechanismSignal = {
  mechanismFacet: string
  signalText: string
  signalSide: SevenChoicesSignalSide
  targetText?: string
  relation: string
}

export type SevenChoicesMatchedClue = {
  contextSide: string
  optionSide: string
  relation: string
}

export type SevenChoicesQuestionAnalysis = {
  blankId: string
  positionFacet: string
  roleFacet: string
  primaryMechanismFacet?: string
  supportingMechanismFacets?: string[]
  topicClues: string[]
  contextEvidence: {
    paragraphId: string
    headingAnchor?: string
    beforeQuote?: string
    afterQuote?: string
  }
  mechanismSignals?: SevenChoicesMechanismSignal[]
  optionFit: {
    correctOptionLabel: string
    correctOptionText?: string
    fitSummary: string
    matchedClues: SevenChoicesMatchedClue[]
  }
  teachingNote: string
}

export type ReviewedSevenChoicesAnalysisV1 = {
  schemaVersion: 'seven-choices-analysis-v1'
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
        units?: Array<{
          unitId: string
          heading?: string
          paragraphIds: string[]
          summary: string
        }>
      }
    }
  >
  questions: Record<string, SevenChoicesQuestionAnalysis>
}

export type SevenChoicesHighlightKind = 'signal' | 'topic' | 'context'

export type SevenChoicesHighlightRange = {
  id: string
  questionId: string
  kind: SevenChoicesHighlightKind
  text: string
  range: PaperTextRange
}

export type SevenChoicesBlankRange = {
  questionId: string
  questionNo: string
  range: PaperTextRange
}

export type SevenChoicesChainView = {
  questionId: string
  questionNo: string
  blankId: string
  colorIndex: number
  positionLabel: string
  roleLabel: string
  primaryMechanismLabel: string | null
  supportingMechanismLabels: string[]
  correctOptionLabel: string
  correctOptionText: string
  fitSummary: string
  matchedClues: SevenChoicesMatchedClue[]
  topicClues: string[]
  contextSignals: SevenChoicesMechanismSignal[]
  optionSignals: SevenChoicesMechanismSignal[]
  allSignals: SevenChoicesMechanismSignal[]
  teachingNote: string
  leftHighlights: SevenChoicesHighlightRange[]
  blankRange: SevenChoicesBlankRange | null
  unresolvedClues: string[]
}

export type SevenChoicesOptionView = {
  optionId?: string
  label: string
  text: string
  chain: SevenChoicesChainView | null
}

export type SevenChoicesSurfaceModel = {
  report: PaperIntelligenceReport
  passageStructures: Record<string, PassageStructure>
  surfaceData: PaperSurfaceData
  paperSection: string
  options: SevenChoicesOptionView[]
  bankIdentity?: {
    bankId: string
    semanticSignature: string
    occurrenceSignature: string
  }
  chains: SevenChoicesChainView[]
  chainsByQuestionId: Record<string, SevenChoicesChainView>
  chainsByOptionLabel: Record<string, SevenChoicesChainView>
}

export type BuildSevenChoicesSurfaceModelInput = {
  asset: PaperAssetV1
  analysis?: ReviewedSevenChoicesAnalysisV1 | null
  groupId: string
  canonicalConsumption?: unknown
}

const POSITION_LABELS: Record<string, string> = {
  'seven-choices.position.paragraph-start': '段首',
  'seven-choices.position.paragraph-middle': '段中',
  'seven-choices.position.paragraph-end': '段尾',
}

const ROLE_LABELS: Record<string, string> = {
  'seven-choices.role.topic': '主旨句',
  'seven-choices.role.summary': '概括句',
  'seven-choices.role.bridge': '承启句',
  'seven-choices.role.cohesion': '衔接句',
}

const MECHANISM_LABELS: Record<string, string> = {
  'seven-choices.cohesion.grammatical.referential-cohesion': '指代衔接',
  'seven-choices.cohesion.grammatical.logical-connector': '逻辑词衔接',
  'seven-choices.cohesion.lexical.topic-field-alignment': '话题场对应',
}

const SEVEN_CHOICES_SECTION = '七选五'
const SEVEN_CHOICES_BLANK_WRAPPER_RUN = String.raw`(?:[_＿]{3,}|\u00A0{3,}|[-‐‑‒–—―]{3,})`

export function buildSevenChoicesSurfaceModel(
  input: BuildSevenChoicesSurfaceModelInput,
): SevenChoicesSurfaceModel {
  const { asset, analysis, groupId, canonicalConsumption } = input
  if (asset.schemaVersion !== 'paper-asset-v1') {
    throw new Error('[I0-D] paper asset schemaVersion must be paper-asset-v1.')
  }
  if (!canonicalConsumption && !analysis) {
    throw new Error('[I0-D] reviewed seven choices analysis is unavailable.')
  }
  if (analysis && analysis.schemaVersion !== 'seven-choices-analysis-v1') {
    throw new Error('[I0-D] reviewed analysis schemaVersion must be seven-choices-analysis-v1.')
  }
  if (analysis && analysis.paperId !== asset.paper.paperId) {
    throw new Error('[I0-D] seven choices analysis paperId does not match paper asset.')
  }

  const group = asset.content.groups[groupId]
  if (!group) {
    throw new Error(`[I0-D] paper-asset group not found: ${groupId}`)
  }
  if (group.groupType !== 'sevenChoices') {
    throw new Error(`[I0-D] requested group is not sevenChoices: ${groupId}`)
  }
  if (!canonicalConsumption && !group.passage?.paragraphs?.length) {
    throw new Error(`[I0-D] sevenChoices group has no passage paragraphs: ${groupId}`)
  }
  if (!canonicalConsumption && !group.optionBank?.length) {
    throw new Error(`[I0-D] sevenChoices group has no optionBank: ${groupId}`)
  }

  const canonical = canonicalConsumption
    ? buildCanonicalConsumptionSurfaceData({
        consumption: canonicalConsumption,
        familyContractId: 'seven-choices',
        groupId,
      })
    : null
  const textMap = canonical
    ? canonical.surfaceData.textMap
    : buildSevenChoicesTextMap(asset, group)
  const passageStructure: PassageStructure = {
    section: SEVEN_CHOICES_SECTION,
    paragraphs: textMap.paragraphs.map((paragraph, index) => ({
      id: paragraph.id,
      label: index === 0 ? '标题' : `P${index}`,
      text: paragraph.sentences.map((sentence) => sentence.text).join(' '),
    })),
  }
  const optionSource = canonical
    ? canonical.optionBank?.options
    : group.optionBank
  if (!optionSource?.length) {
    throw new Error(`[I0-D] sevenChoices shared bank is unavailable: ${groupId}`)
  }
  const questionOrder = canonical
    ? canonical.surfaceData.questions.map((question) => ({
        questionId: question.id,
        questionNo: String(question.questionNo),
      }))
    : group.questionIds.flatMap((questionId) => {
        const questionNo = asset.content.questions[questionId]?.questionNo
        return questionNo === undefined || questionNo === null
          ? []
          : [{ questionId, questionNo: String(questionNo) }]
      })
  const chains = analysis
    ? buildChainViews({
        analysis,
        questionOrder,
        textMap,
        optionTextByLabel: new Map(
          optionSource.map((option) => [option.label, option.text]),
        ),
      })
    : []
  const chainsByQuestionId = Object.fromEntries(chains.map((chain) => [chain.questionId, chain]))
  const chainsByOptionLabel = Object.fromEntries(chains.map((chain) => [chain.correctOptionLabel, chain]))
  const options = optionSource.map((option): SevenChoicesOptionView => ({
    ...('optionId' in option ? { optionId: option.optionId } : {}),
    label: option.label,
    text: option.text,
    chain: chainsByOptionLabel[option.label] ?? null,
  }))

  return {
    report: buildShellReport({ asset, group, groupId, chains }),
    passageStructures: { [SEVEN_CHOICES_SECTION]: passageStructure },
    surfaceData: canonical?.surfaceData ?? {
      textMap,
      questions: [],
      evidence: [],
    },
    paperSection: SEVEN_CHOICES_SECTION,
    options,
    ...(canonical?.optionBank && canonical.occurrenceSignature
      ? {
          bankIdentity: {
            bankId: canonical.optionBank.bankId,
            semanticSignature: canonical.semanticDigest,
            occurrenceSignature: canonical.occurrenceSignature,
          },
        }
      : {}),
    chains,
    chainsByQuestionId,
    chainsByOptionLabel,
  }
}

function buildSevenChoicesTextMap(
  asset: PaperAssetV1,
  group: PaperContentGroup,
): PaperTextMap {
  const blankQuestionNos = group.questionIds
    .map((questionId) => asset.content.questions[questionId]?.questionNo)
    .filter((questionNo) => questionNo !== undefined && questionNo !== null)
    .map((questionNo) => String(questionNo))

  return {
    paperId: asset.paper.paperId,
    paragraphs: (group.passage?.paragraphs ?? []).map((paragraph) => ({
      id: paragraph.paragraphId,
      section: SEVEN_CHOICES_SECTION,
      sentences: segmentSentencesForParagraph(
        paragraph.text,
        paragraph.paragraphId,
        blankQuestionNos,
      ),
    })),
  }
}

function segmentSentencesForParagraph(
  text: string,
  paragraphId: string,
  blankQuestionNos: string[],
): Array<{ id: string; text: string; tokens: never[] }> {
  if (!text.trim()) return []
  const segmented = segmentPaperText(text, { sectionId: paragraphId })
  const first = segmented.paragraphs[0]
  if (!first) return []
  return first.sentences.map((sentence, index) => ({
    id: `${paragraphId}-s${index}`,
    text: formatSevenChoicesBlankMarkers(sentence.text, blankQuestionNos),
    tokens: [] as never[],
  }))
}

function buildChainViews(input: {
  analysis: ReviewedSevenChoicesAnalysisV1
  questionOrder: ReadonlyArray<{
    questionId: string
    questionNo: string
  }>
  textMap: PaperTextMap
  optionTextByLabel: ReadonlyMap<string, string>
}): SevenChoicesChainView[] {
  const { analysis, questionOrder, textMap, optionTextByLabel } = input

  return questionOrder.flatMap(({ questionId, questionNo }, index): SevenChoicesChainView[] => {
    const item = analysis.questions[questionId]
    if (!item) return []
    const correctOptionLabel = item.optionFit.correctOptionLabel
    const correctOptionText = optionTextByLabel.get(correctOptionLabel) ?? item.optionFit.correctOptionText ?? ''
    const contextSignals = (item.mechanismSignals ?? []).filter((signal) => signal.signalSide === 'context-before' || signal.signalSide === 'context-after')
    const optionSignals = (item.mechanismSignals ?? []).filter((signal) => signal.signalSide === 'option')
    const unresolvedClues: string[] = []
    const leftHighlights: SevenChoicesHighlightRange[] = []

    const blankParagraphId = item.contextEvidence.paragraphId || undefined

    for (const [signalIndex, signal] of contextSignals.entries()) {
      const ranges = findAllTextRanges(textMap, signal.signalText, blankParagraphId)
      if (ranges.length === 0) {
        unresolvedClues.push(`mechanism:${signal.signalText}`)
      }
      ranges.forEach((range, rangeIndex) => {
        leftHighlights.push({
          id: `${questionId}-signal-${signalIndex + 1}-${rangeIndex + 1}`,
          questionId,
          kind: 'signal',
          text: signal.signalText,
          range,
        })
      })
    }

    for (const [clueIndex, clue] of (item.topicClues ?? []).entries()) {
      const ranges = findAllTextRanges(textMap, clue, blankParagraphId)
      if (ranges.length === 0) {
        unresolvedClues.push(`topic:${clue}`)
      }
      ranges.forEach((range, rangeIndex) => {
        leftHighlights.push({
          id: `${questionId}-topic-${clueIndex + 1}-${rangeIndex + 1}`,
          questionId,
          kind: 'topic',
          text: clue,
          range,
        })
      })
    }

    if (leftHighlights.length === 0) {
      const fallbackText = item.contextEvidence.beforeQuote || item.contextEvidence.afterQuote || ''
      const fallbackRanges = fallbackText ? findAllTextRanges(textMap, fallbackText, blankParagraphId) : []
      fallbackRanges.forEach((range, rangeIndex) => {
        leftHighlights.push({
          id: `${questionId}-context-${rangeIndex + 1}`,
          questionId,
          kind: 'context',
          text: fallbackText,
          range,
        })
      })
      if (fallbackText && fallbackRanges.length === 0) {
        unresolvedClues.push(`contextEvidence:${fallbackText}`)
      }
    }

    return [{
      questionId,
      questionNo,
      blankId: item.blankId,
      colorIndex: index,
      positionLabel: POSITION_LABELS[item.positionFacet] ?? item.positionFacet,
      roleLabel: ROLE_LABELS[item.roleFacet] ?? item.roleFacet,
      primaryMechanismLabel: item.primaryMechanismFacet
        ? MECHANISM_LABELS[item.primaryMechanismFacet] ?? item.primaryMechanismFacet
        : null,
      supportingMechanismLabels: (item.supportingMechanismFacets ?? []).map(
        (facet) => MECHANISM_LABELS[facet] ?? facet,
      ),
      correctOptionLabel,
      correctOptionText,
      fitSummary: item.optionFit.fitSummary,
      matchedClues: item.optionFit.matchedClues ?? [],
      topicClues: item.topicClues ?? [],
      contextSignals,
      optionSignals,
      allSignals: item.mechanismSignals ?? [],
      teachingNote: item.teachingNote,
      leftHighlights,
      blankRange: findBlankRange(textMap, questionId, questionNo, item.contextEvidence.paragraphId) ?? findBlankRange(textMap, questionId, questionNo),
      unresolvedClues,
    }]
  })
}

function findAllTextRanges(textMap: PaperTextMap, needle: string, paragraphId?: string): PaperTextRange[] {
  const trimmed = needle.trim()
  if (!trimmed) return []
  const ranges: PaperTextRange[] = []
  const paragraphs = paragraphId
    ? textMap.paragraphs.filter((p) => p.id === paragraphId)
    : textMap.paragraphs
  for (const paragraph of paragraphs) {
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

function findBlankRange(
  textMap: PaperTextMap,
  questionId: string,
  questionNo: string,
  preferredParagraphId?: string,
): SevenChoicesBlankRange | null {
  const paragraphs = preferredParagraphId
    ? [
        ...textMap.paragraphs.filter((paragraph) => paragraph.id === preferredParagraphId),
        ...textMap.paragraphs.filter((paragraph) => paragraph.id !== preferredParagraphId),
      ]
    : textMap.paragraphs
  const pattern = new RegExp(`(^|\\D)(${escapeRegExp(questionNo)})(?=\\D|$)`)
  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.sentences) {
      const match = pattern.exec(sentence.text)
      if (!match || match.index < 0) continue
      const prefixLength = match[1]?.length ?? 0
      const start = match.index + prefixLength
      return {
        questionId,
        questionNo,
        range: {
          sentenceId: sentence.id,
          start,
          end: start + questionNo.length,
        },
      }
    }
  }
  return null
}

function formatSevenChoicesBlankMarkers(text: string, questionNos: string[]): string {
  return questionNos.reduce((nextText, questionNo) => {
    return formatSingleSevenChoicesBlankMarker(nextText, questionNo)
  }, text)
}

function formatSingleSevenChoicesBlankMarker(text: string, questionNo: string): string {
  const pattern = new RegExp(
    `(?:${SEVEN_CHOICES_BLANK_WRAPPER_RUN})?[ \\t\\u00A0]*${escapeRegExp(questionNo)}[ \\t\\u00A0]*(?:${SEVEN_CHOICES_BLANK_WRAPPER_RUN})?`,
    'g',
  )
  let output = ''
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length
    const prev = start > 0 ? text[start - 1] : ''
    const next = end < text.length ? text[end] : ''
    if (isDigit(prev) || isDigit(next)) continue

    const prefix = text.slice(cursor, start)
    const prefixTrimmed = prefix.replace(/[ \t\u00A0]+$/g, '')
    output += prefixTrimmed
    if (prefixTrimmed && !/[\s([{'"“‘-]$/.test(prefixTrimmed)) {
      output += ' '
    }

    output += formatSevenChoicesBlank(questionNo)

    let nextCursor = end
    while (nextCursor < text.length && /[ \t\u00A0]/.test(text[nextCursor])) {
      nextCursor += 1
    }

    if (nextCursor < text.length && /[,.;:?!]/.test(text[nextCursor])) {
      output += text[nextCursor]
      nextCursor += 1
      while (nextCursor < text.length && /[ \t\u00A0]/.test(text[nextCursor])) {
        nextCursor += 1
      }
      if (nextCursor < text.length && /\S/.test(text[nextCursor])) {
        output += ' '
      }
    } else if (nextCursor < text.length && /\S/.test(text[nextCursor])) {
      output += ' '
    }

    cursor = nextCursor
  }

  output += text.slice(cursor)
  return output
}

function formatSevenChoicesBlank(questionNo: string): string {
  return `${'\u00A0'.repeat(3)}${questionNo}${'\u00A0'.repeat(3)}`
}

function isDigit(value: string): boolean {
  return /^[0-9]$/.test(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildShellReport(input: {
  asset: PaperAssetV1
  group: PaperContentGroup
  groupId: string
  chains: SevenChoicesChainView[]
}): PaperIntelligenceReport {
  const { asset, group, groupId, chains } = input
  return {
    schemaVersion: 'paper-asset-v1-as-paper-intelligence-shell',
    generatedAt: '',
    generator: {
      promptVersion: 'i0d-seven-choices-surface',
      modelId: null,
      runId: 'seven-choices-surface',
    },
    sourcePaper: {
      paperId: asset.paper.paperId,
      paperName: asset.paper.title,
      year: 2024,
      region: '九省联考',
      section: '七选五',
      sourceFile: asset.sources.docx?.fileName,
    },
    passages: [
      {
        paperSection: SEVEN_CHOICES_SECTION,
        passageTitle: group.title,
        questionGroupId: groupId,
        loads: emptyLoads(),
        aiInitialBand: {
          band: '—',
          basis: 'paper-asset seven choices source',
        },
        passageOutline: {
          mainIdea: group.title,
          logicalLayers: [],
        },
        keyChunks: [],
        questions: chains.map((chain, index): QuestionAnalysis => ({
          questionNo: chain.questionNo,
          paperSection: SEVEN_CHOICES_SECTION,
          questionIndexInPassage: index,
          stem: chain.questionNo,
          stemTranslation: '',
          answer: chain.correctOptionLabel,
          teacherQuestionType: '七选五',
          keywords: chain.topicClues,
          locatingSentence: '',
          answerSentence: '',
          answerEvidence: {
            quote: chain.fitSummary,
            explanationZh: chain.teachingNote,
          },
          distractorAnalysis: [],
          synonymSummary: '',
          surfaceType: '',
          answeringMove: '',
          tCard: '',
          boundaryFlags: chain.unresolvedClues,
          reviewNeeded: chain.unresolvedClues.length > 0,
          options: [],
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
