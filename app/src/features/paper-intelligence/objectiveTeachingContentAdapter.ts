import { partitionAnalysisText } from '../../../../shared/analysis/analysisTextRanges.mjs'
import type {
  PaperAnnotation,
  PaperEvidence,
  PaperTextMap,
  PaperTextRange,
} from '../../../../shared/papersurface/types'

export type TeachingRange = {
  textId: string
  paragraphId: string
  start: number
  end: number
  quote: string
}

export type TeachingAnnotation = {
  annotationId: string
  kind: 'answer-evidence' | 'answer-insertion' | 'sentence-structure'
  questionIds: string[]
  sourceRanges: TeachingRange[]
  translationRanges: TeachingRange[]
  blankId?: string
  selectedSentenceId?: string
}

export type SelectedLongSentence = {
  sentenceId?: string
  displayText: string
  relatedQuestionIds: string[]
  translationZh: string
  analysisZh: string
  underlineRanges?: Array<{ start: number; end: number; quote: string }>
}

export type ObjectiveTeachingGroup = {
  fullTranslationZh?: string
  selectedLongSentences?: SelectedLongSentence[]
  teachingContent?: {
    schemaVersion: 'objective-teaching-content-v1'
    sourceTextId: string
    translation: {
      textId: string
      paragraphs: Array<{
        paragraphId: string
        quote: string
      }>
    }
    completedSourceTexts: Array<{
      textId: string
      paragraphId: string
      text: string
    }>
    annotations: TeachingAnnotation[]
  }
  discourseStructure?: {
    summary?: string
    paragraphs?: Array<{ paragraphId: string; summary: string; function: string }>
    units?: Array<{ unitId: string; heading?: string; summary: string }>
  }
}

export type ObjectiveTeachingView = {
  discourseSummary: string
  discourseItems: Array<{ id: string; label: string; summary: string; functionText: string }>
  translationParagraphs: Array<{
    paragraphId: string
    segments: Array<{
      text: string
      questionNos: string[]
      kinds: TeachingAnnotation['kind'][]
    }>
  }>
  longSentences: Array<{
    sentenceId: string
    segments: Array<{ text: string; underlined: boolean }>
    questionNos: string[]
    translationZh: string
    analysisZh: string
  }>
}

export type ObjectiveTeachingSourceProjection = {
  annotations: PaperAnnotation[]
  evidence: PaperEvidence[]
}

type SourceParagraph = { paragraphId?: string; id?: string; text: string }

function codePointToUtf16(text: string, offset: number): number {
  return Array.from(text).slice(0, offset).join('').length
}

function sourceRangeToTextMapRanges(
  source: SourceParagraph,
  textMap: PaperTextMap,
  startCodePoint: number,
  endCodePoint: number,
): PaperTextRange[] {
  const paragraphId = source.paragraphId ?? source.id
  if (!paragraphId) return []
  const paragraph = textMap.paragraphs.find((item) => item.id === paragraphId)
  if (!paragraph) return []
  const start = codePointToUtf16(source.text, startCodePoint)
  const end = codePointToUtf16(source.text, endCodePoint)
  const result: PaperTextRange[] = []
  let cursor = 0
  for (const sentence of paragraph.sentences) {
    while (/\s/u.test(source.text[cursor] ?? '')) cursor += 1
    if (!source.text.startsWith(sentence.text, cursor)) {
      throw new Error(`teachingContent source paragraph ${paragraphId} does not match TextMap`)
    }
    const sentenceStart = cursor
    const sentenceEnd = sentenceStart + sentence.text.length
    const overlapStart = Math.max(start, sentenceStart)
    const overlapEnd = Math.min(end, sentenceEnd)
    if (overlapEnd > overlapStart) {
      result.push({
        sentenceId: sentence.id,
        start: overlapStart - sentenceStart,
        end: overlapEnd - sentenceStart,
      })
    }
    cursor = sentenceEnd
  }
  return result
}

/** Projects validated code-point ranges onto the existing TextMap's UTF-16
 * sentence coordinates. It never searches for the quote and never substitutes
 * answer-completed text into the original exam surface. */
export function projectObjectiveTeachingSource(
  group: ObjectiveTeachingGroup | null | undefined,
  sourceParagraphs: ReadonlyArray<SourceParagraph>,
  textMap: PaperTextMap,
): ObjectiveTeachingSourceProjection {
  const teaching = group?.teachingContent
  if (teaching?.schemaVersion !== 'objective-teaching-content-v1') {
    return { annotations: [], evidence: [] }
  }
  const sourceById = new Map(sourceParagraphs.flatMap((paragraph) => {
    const paragraphId = paragraph.paragraphId ?? paragraph.id
    return paragraphId ? [[paragraphId, paragraph] as const] : []
  }))
  const annotations: PaperAnnotation[] = []
  const evidence: PaperEvidence[] = []
  for (const relationship of teaching.annotations) {
    relationship.sourceRanges.forEach((sourceRange, sourceRangeIndex) => {
      // Completed-source answer insertions are intentionally absent from the
      // original exam TextMap. Their relationship remains visible in the
      // teaching panel and companion output, without rewriting a blank.
      if (sourceRange.textId !== teaching.sourceTextId) return
      const source = sourceById.get(sourceRange.paragraphId)
      if (!source) return
      sourceRangeToTextMapRanges(source, textMap, sourceRange.start, sourceRange.end)
        .forEach((range, sentenceRangeIndex) => {
          const owners = relationship.questionIds.length > 0 ? relationship.questionIds : [null]
          owners.forEach((questionId) => {
            const id = `${relationship.annotationId}:source:${sourceRangeIndex}:${sentenceRangeIndex}${questionId ? `:${questionId}` : ''}`
            annotations.push(questionId ? {
              id,
              kind: relationship.kind === 'answer-evidence' ? 'evidence-support' : 'long-sentence',
              range,
              scope: 'question',
              questionId,
              importance: 'core',
              teachingPriority: relationship.kind === 'answer-evidence' ? 0 : 1,
              sourceOrder: annotations.length,
            } : {
              id,
              kind: 'long-sentence',
              range,
              scope: 'passage',
              importance: 'core',
              teachingPriority: 1,
              sourceOrder: annotations.length,
            })
            if (questionId) evidence.push({
              id,
              questionId,
              kind: relationship.kind === 'answer-evidence' ? 'support' : 'context',
              range,
            })
          })
        })
    })
  }
  return { annotations, evidence }
}

export function buildObjectiveTeachingView(
  group: ObjectiveTeachingGroup | null | undefined,
  questionNoById: Readonly<Record<string, string>>,
): ObjectiveTeachingView | null {
  if (!group) return null
  const teaching = group.teachingContent
  const translationParagraphs = teaching?.schemaVersion === 'objective-teaching-content-v1'
    ? teaching.translation.paragraphs.map((paragraph) => {
        const ranges = teaching.annotations.flatMap((annotation) =>
          annotation.translationRanges
            .filter((range) => range.textId === teaching.translation.textId
              && range.paragraphId === paragraph.paragraphId)
            .map((range) => ({ range, annotation })))
        const parts = ranges.length > 0
          ? partitionAnalysisText(paragraph.quote, ranges.map(({ range: { start, end, quote } }) => ({ start, end, quote })))
          : [{ text: paragraph.quote, rangeIndices: [] as number[] }]
        return {
          paragraphId: paragraph.paragraphId,
          segments: parts.map((part) => {
            const annotations = part.rangeIndices.map((index) => ranges[index].annotation)
            return {
              text: part.text,
              questionNos: [...new Set(annotations.flatMap(({ questionIds }) =>
                questionIds.map((id) => questionNoById[id]).filter(Boolean)))],
              kinds: [...new Set(annotations.map(({ kind }) => kind))],
            }
          }),
        }
      })
    : group.fullTranslationZh?.trim()
      ? [{ paragraphId: 'legacy-full-translation', segments: [{
          text: group.fullTranslationZh,
          questionNos: [],
          kinds: [],
        }] }]
      : []

  const longSentences = (group.selectedLongSentences ?? []).map((sentence, index) => ({
    sentenceId: sentence.sentenceId ?? `legacy-sentence-${index + 1}`,
    segments: sentence.underlineRanges?.length
      ? partitionAnalysisText(sentence.displayText, sentence.underlineRanges).map((part) => ({
          text: part.text,
          underlined: part.rangeIndices.length > 0,
        }))
      : [{ text: sentence.displayText, underlined: false }],
    questionNos: sentence.relatedQuestionIds.map((id) => questionNoById[id]).filter(Boolean),
    translationZh: sentence.translationZh,
    analysisZh: sentence.analysisZh,
  }))
  if (translationParagraphs.length === 0 && longSentences.length === 0) return null
  const discourseItems = (group.discourseStructure?.paragraphs ?? []).map((paragraph) => ({
    id: paragraph.paragraphId,
    label: paragraph.paragraphId,
    summary: paragraph.summary,
    functionText: paragraph.function,
  })).concat((group.discourseStructure?.units ?? []).map((unit) => ({
    id: unit.unitId,
    label: unit.heading || unit.unitId,
    summary: unit.summary,
    functionText: '',
  })))
  return {
    discourseSummary: group.discourseStructure?.summary ?? '',
    discourseItems,
    translationParagraphs,
    longSentences,
  }
}
