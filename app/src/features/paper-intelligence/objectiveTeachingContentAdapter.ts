import { resolveFigureTextRegion } from '../../../../shared/paper-canonical/richContent.mjs'
import type { CanonicalReadingSurfaceFigureBlock } from '../../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { assertAnalysisTextRanges, partitionAnalysisText } from '../../../../shared/analysis/analysisTextRanges.mjs'
import { canonicalizeVisibleEnglishTypography } from '../../../../shared/paper-canonical/visibleTypography.mjs'
import { formatCanonicalBlankVisibleText } from '../../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import type { CanonicalSurfaceParagraph } from '../../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
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

export type FigureTeachingRange = ({ figureId: string; mediaId?: never } | { mediaId: string; figureId?: never }) & {
  regionId: string
  quote?: string
}

export type FigureTeachingEvidence = {
  id: string
  questionId: string
  kind: 'support'
  target: FigureTeachingRange
  quote: string
}

export type TeachingAnnotation = {
  annotationId: string
  kind: 'answer-evidence' | 'answer-insertion' | 'sentence-structure'
  questionIds: string[]
  sourceRanges: Array<TeachingRange | FigureTeachingRange>
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
  unavailable?: boolean
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
  figureEvidence?: FigureTeachingEvidence[]
}

type SourceParagraph = { paragraphId?: string; id?: string; text: string }

function codePointToUtf16(text: string, offset: number): number {
  return Array.from(text).slice(0, offset).join('').length
}

// Align only the changed span; transport offsets always remain bound to raw text.
function typographyOffsets(before: string, after: string, start: number, end: number): number[] {
  if (before === after) return [start, end]
  let prefix = 0, rawEnd = before.length, visibleEnd = after.length
  while (before[prefix] === after[prefix] && prefix < rawEnd) prefix++
  while (rawEnd > prefix && visibleEnd > prefix && before[rawEnd - 1] === after[visibleEnd - 1]) { rawEnd--; visibleEnd-- }
  const raw = before.slice(prefix, rawEnd), visible = after.slice(prefix, visibleEnd)
  const costs = Array.from({ length: raw.length + 1 }, () => new Uint32Array(visible.length + 1))
  for (let i = 0; i <= raw.length; i++) costs[i][0] = i
  for (let j = 0; j <= visible.length; j++) costs[0][j] = j
  for (let i = 1; i <= raw.length; i++) {
    for (let j = 1; j <= visible.length; j++) {
      costs[i][j] = Math.min(costs[i - 1][j] + 1, costs[i][j - 1] + 1,
        costs[i - 1][j - 1] + Number(raw[i - 1] !== visible[j - 1]))
    }
  }
  const project = (offset: number, right: boolean) => {
    if (offset < prefix) return offset
    if (offset > rawEnd) return offset + after.length - before.length
    let i = raw.length, j = visible.length
    while (i > offset - prefix) {
      if (j > 0 && costs[i][j] === costs[i - 1][j - 1] + Number(raw[i - 1] !== visible[j - 1])) { i--; j-- }
      else if (j > 0 && costs[i][j] === costs[i][j - 1] + 1) j--
      else i--
    }
    // Inserted separators belong outside a quote ending at this boundary.
    if (!right) while (j > 0 && costs[i][j] === costs[i][j - 1] + 1) j--
    return prefix + j
  }
  return [project(start, true), project(end, false)]
}

function sourceRangeToTextMapRanges(
  source: SourceParagraph,
  textMap: PaperTextMap,
  startCodePoint: number,
  endCodePoint: number,
  semanticParagraphs?: ReadonlyArray<CanonicalSurfaceParagraph>,
): PaperTextRange[] {
  const paragraphId = source.paragraphId ?? source.id
  if (!paragraphId) return []
  const paragraph = textMap.paragraphs.find((item) => item.id === paragraphId)
  if (!paragraph) return []
  let start = codePointToUtf16(source.text, startCodePoint)
  let end = codePointToUtf16(source.text, endCodePoint)
  let displayText = source.text
  // Canonical blank labels are not source bytes: __36__ becomes 36, and
  // __56__ (hint) becomes 56(hint). Bind transformations to real semantic blanks,
  // never to an evidence quote or an arbitrary occurrence of the same answer.
  const blanks = semanticParagraphs?.find((item) => item.id === paragraphId)
    ?.sentences.flatMap((sentence) => sentence.nodes.filter((node) => node.type === 'blank')) ?? []
  const replacements = blanks.map((blank) => {
    const escapedNo = blank.questionNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(?<!_)_{5}${escapedNo}_{5}(?!_)|(?<!_)__${escapedNo}__(?!_)(?: \\([^()\\r\\n]*\\))?|(?<![\\p{L}\\p{N}.])${escapedNo}\\._____(?:\\([^()\\r\\n]*\\))?`, 'gu')
    const matches = [...source.text.matchAll(pattern)]
    if (matches.length !== 1) throw new Error(`teachingContent blank ${blank.blankId} does not match source paragraph ${paragraphId}`)
    const match = matches[0]
    const sourceHint = /\(([^()\r\n]*)\)$/.exec(match[0])?.[1]
    if (sourceHint !== undefined && sourceHint !== blank.hint) {
      throw new Error(`teachingContent blank ${blank.blankId} hint does not match source paragraph ${paragraphId}`)
    }
    return { start: match.index, end: match.index + match[0].length, text: formatCanonicalBlankVisibleText(blank.questionNo, blank.hint) }
  }).sort((a, b) => a.start - b.start)
  // Work backwards so every source offset remains in the original coordinate space.
  for (const replacement of replacements.toReversed()) {
    const delta = replacement.text.length - (replacement.end - replacement.start)
    start = start >= replacement.end ? start + delta : start > replacement.start ? replacement.start : start
    end = end >= replacement.end ? end + delta : end > replacement.start ? replacement.start + replacement.text.length : end
    displayText = displayText.slice(0, replacement.start) + replacement.text + displayText.slice(replacement.end)
  }
  // Historical TextMaps that already match keep their original coordinates.
  let matchCursor = 0
  const matches = paragraph.sentences.every(({ text }) => {
    while (/\s/u.test(displayText[matchCursor] ?? '')) matchCursor++
    if (!displayText.startsWith(text, matchCursor)) return false
    matchCursor += text.length
    return true
  })
  if (!matches) {
    // Match the compiler's text-inline boundaries around canonical blanks.
    let sourceCursor = 0
    const normalized = replacements.map((replacement) => {
      const text = canonicalizeVisibleEnglishTypography(source.text.slice(sourceCursor, replacement.start), '4')
      sourceCursor = replacement.end
      return text + replacement.text
    }).join('') + canonicalizeVisibleEnglishTypography(source.text.slice(sourceCursor), '4')
    ;[start, end] = typographyOffsets(displayText, normalized, start, end)
    displayText = normalized
  }
  const result: PaperTextRange[] = []
  let cursor = 0
  for (const sentence of paragraph.sentences) {
    while (/\s/u.test(displayText[cursor] ?? '')) cursor += 1
    if (!displayText.startsWith(sentence.text, cursor)) {
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
  semanticParagraphs?: ReadonlyArray<CanonicalSurfaceParagraph>,
  figures: ReadonlyArray<CanonicalReadingSurfaceFigureBlock> = [],
): ObjectiveTeachingSourceProjection {
  const teaching = group?.teachingContent
  if (teaching?.schemaVersion !== 'objective-teaching-content-v1') {
    return { annotations: [], evidence: [], figureEvidence: [] }
  }
  const sourceById = new Map(sourceParagraphs.flatMap((paragraph) => {
    const paragraphId = paragraph.paragraphId ?? paragraph.id
    return paragraphId ? [[paragraphId, paragraph] as const] : []
  }))
  const annotations: PaperAnnotation[] = []
  const evidence: PaperEvidence[] = []
  const figureEvidence: FigureTeachingEvidence[] = []
  for (const relationship of teaching.annotations) {
    relationship.sourceRanges.forEach((sourceRange, sourceRangeIndex) => {
      if ('regionId' in sourceRange) {
        if (relationship.kind !== 'answer-evidence') throw new Error('Figure regions require answer evidence')
        const region = resolveFigureTextRegion(sourceRange, figures)
        relationship.questionIds.forEach(questionId => figureEvidence.push({
          id: `${relationship.annotationId}:region:${sourceRangeIndex}:${questionId}`,
          questionId, kind: 'support', target: sourceRange, quote: sourceRange.quote ?? region.text,
        }))
        return
      }
      // Completed-source answer insertions are intentionally absent from the
      // original exam TextMap. Their relationship remains visible in the
      // teaching panel and companion output, without rewriting a blank.
      if (sourceRange.textId !== teaching.sourceTextId) return
      const source = sourceById.get(sourceRange.paragraphId)
      if (!source) return
      const { start, end, quote } = sourceRange
      const ranges = sourceRangeToTextMapRanges(source, textMap, start, end, semanticParagraphs)
      assertAnalysisTextRanges(source.text, [{ start, end, quote }], 'teachingContent sourceRanges')
      ranges
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
  return { annotations, evidence, figureEvidence }
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
