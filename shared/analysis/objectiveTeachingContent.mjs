import { assertAnalysisTextRanges } from './analysisTextRanges.mjs'

const KINDS = new Set(['answer-evidence', 'answer-insertion', 'sentence-structure'])

function exactKeys(value, keys, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${location}: expected object`)
  }
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${location}: expected exactly ${expected.join(', ')}`)
  }
}

function nonBlank(value, location) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\u0000')) throw new Error(`${location}: expected non-blank string without NUL`)
  return value
}

function assertLocatedRanges(ranges, texts, location) {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw new Error(`${location}: expected non-empty ranges`)
  }
  for (const [index, range] of ranges.entries()) {
    const label = `${location}/${index}`
    exactKeys(range, ['textId', 'paragraphId', 'start', 'end', 'quote'], label)
    const key = `${range.textId}\u0000${range.paragraphId}`
    const text = texts.get(key)
    if (text === undefined) throw new Error(`${label}: unknown textId/paragraphId pair`)
    assertAnalysisTextRanges(text, [
      { start: range.start, end: range.end, quote: range.quote },
    ], label)
  }
}

/**
 * Validates the group-local, version-bound annotation annex shared by raw AI
 * output, analyzed-package admission, Paper teaching UI and companion export.
 * Original passage text is referenced, never copied. Translation paragraphs
 * are exact slices of the one legacy fullTranslationZh value.
 */
export function assertObjectiveTeachingContent(groupAnalysis, group, {
  sourceAssetVersion,
  completeParagraph,
  answerForQuestion,
  insertionRangesForParagraph,
  requireAnswerInsertions = false,
} = {}) {
  const annex = groupAnalysis?.teachingContent
  exactKeys(annex, [
    'schemaVersion', 'sourceTextId', 'sourceAssetVersion', 'translation',
    'completedSourceTexts', 'annotations',
  ], 'teachingContent')
  if (annex.schemaVersion !== 'objective-teaching-content-v1') {
    throw new Error('teachingContent.schemaVersion: unsupported version')
  }
  if (!Number.isSafeInteger(annex.sourceAssetVersion)
    || annex.sourceAssetVersion !== Number(sourceAssetVersion)) {
    throw new Error('teachingContent.sourceAssetVersion: stale source revision')
  }
  const sourceTextId = nonBlank(annex.sourceTextId, 'teachingContent.sourceTextId')
  const paragraphs = new Map((group.paragraphs || []).map((paragraph) => [paragraph.id, paragraph.text]))
  const questions = new Map((group.questions || []).map((question) => [question.id, question]))
  if (paragraphs.size !== (group.paragraphs || []).length || questions.size !== (group.questions || []).length) {
    throw new Error('teachingContent: duplicate source paragraph or question identity')
  }
  const texts = new Map([...paragraphs].map(([paragraphId, text]) => [
    `${sourceTextId}\u0000${paragraphId}`,
    text,
  ]))

  exactKeys(annex.translation, ['textId', 'legacyField', 'paragraphs'], 'teachingContent.translation')
  if (annex.translation.legacyField !== 'fullTranslationZh') {
    throw new Error('teachingContent.translation.legacyField must be fullTranslationZh')
  }
  const translationTextId = nonBlank(annex.translation.textId, 'teachingContent.translation.textId')
  if (translationTextId === sourceTextId) throw new Error('teachingContent: text identities must be distinct')
  const translation = groupAnalysis.fullTranslationZh
  if (typeof translation !== 'string' || !translation.trim()) {
    throw new Error('teachingContent translation requires the exact fullTranslationZh value')
  }
  if (!Array.isArray(annex.translation.paragraphs) || annex.translation.paragraphs.length === 0) {
    throw new Error('teachingContent.translation.paragraphs: expected non-empty array')
  }
  let previousEnd = 0
  const translationParagraphIds = new Set()
  for (const [index, paragraph] of annex.translation.paragraphs.entries()) {
    const label = `teachingContent.translation.paragraphs/${index}`
    exactKeys(paragraph, ['paragraphId', 'sourceParagraphIds', 'start', 'end', 'quote'], label)
    nonBlank(paragraph.paragraphId, `${label}.paragraphId`)
    if (translationParagraphIds.has(paragraph.paragraphId)) throw new Error(`${label}: duplicate paragraphId`)
    translationParagraphIds.add(paragraph.paragraphId)
    if (!Array.isArray(paragraph.sourceParagraphIds) || paragraph.sourceParagraphIds.length === 0
      || new Set(paragraph.sourceParagraphIds).size !== paragraph.sourceParagraphIds.length
      || paragraph.sourceParagraphIds.some((id) => !paragraphs.has(id))) {
      throw new Error(`${label}.sourceParagraphIds: must reference source paragraphs`)
    }
    assertAnalysisTextRanges(translation, [{
      start: paragraph.start, end: paragraph.end, quote: paragraph.quote,
    }], label)
    const gap = Array.from(translation).slice(previousEnd, paragraph.start).join('')
    if (index === 0 ? paragraph.start !== 0 : !/^\r?\n(?:\r?\n)*$/u.test(gap)) {
      throw new Error(`${label}: translation paragraphs must exactly cover fullTranslationZh in order`)
    }
    previousEnd = paragraph.end
    texts.set(`${translationTextId}\u0000${paragraph.paragraphId}`, paragraph.quote)
  }
  if (previousEnd !== Array.from(translation).length) {
    throw new Error('teachingContent.translation.paragraphs: trailing translation text is not bound')
  }

  if (!Array.isArray(annex.completedSourceTexts)) {
    throw new Error('teachingContent.completedSourceTexts: expected array')
  }
  const completedIds = new Set()
  for (const [index, completed] of annex.completedSourceTexts.entries()) {
    const label = `teachingContent.completedSourceTexts/${index}`
    exactKeys(completed, ['textId', 'paragraphId', 'text'], label)
    const source = paragraphs.get(completed.paragraphId)
    if (source === undefined) throw new Error(`${label}.paragraphId: unknown source paragraph`)
    nonBlank(completed.textId, `${label}.textId`)
    if (completedIds.has(completed.textId) || [sourceTextId, translationTextId].includes(completed.textId)) {
      throw new Error(`${label}.textId: text identities must be distinct`)
    }
    completedIds.add(completed.textId)
    if (typeof completeParagraph !== 'function' || completed.text !== completeParagraph(source)) {
      throw new Error(`${label}.text: not the authoritative answer-completed source`)
    }
    texts.set(`${completed.textId}\u0000${completed.paragraphId}`, completed.text)
  }

  if (!Array.isArray(annex.annotations) || annex.annotations.length === 0) {
    throw new Error('teachingContent.annotations: expected non-empty array')
  }
  const annotationIds = new Set()
  const insertionCounts = new Map()
  const sentences = new Map((groupAnalysis.selectedLongSentences || []).map((sentence) => [sentence.sentenceId, sentence]))
  if (sentences.size !== (groupAnalysis.selectedLongSentences || []).length) {
    throw new Error('teachingContent: duplicate selected sentence identity')
  }
  const sentenceIds = new Set(sentences.keys())
  const structureSentenceIds = new Set()
  for (const [index, annotation] of annex.annotations.entries()) {
    const label = `teachingContent.annotations/${index}`
    const kindKeys = annotation?.kind === 'answer-insertion'
      ? ['annotationId', 'kind', 'questionIds', 'blankId', 'sourceRanges', 'translationRanges']
      : annotation?.kind === 'sentence-structure'
        ? ['annotationId', 'kind', 'questionIds', 'selectedSentenceId', 'sourceRanges', 'translationRanges']
        : ['annotationId', 'kind', 'questionIds', 'sourceRanges', 'translationRanges']
    exactKeys(annotation, kindKeys, label)
    nonBlank(annotation.annotationId, `${label}.annotationId`)
    if (annotationIds.has(annotation.annotationId)) throw new Error(`${label}.annotationId: duplicate`)
    annotationIds.add(annotation.annotationId)
    if (!KINDS.has(annotation.kind)) throw new Error(`${label}.kind: unsupported annotation kind`)
    if (!Array.isArray(annotation.questionIds)
      || (annotation.kind !== 'sentence-structure' && annotation.questionIds.length === 0)
      || new Set(annotation.questionIds).size !== annotation.questionIds.length
      || annotation.questionIds.some((id) => !questions.has(id))) {
      throw new Error(`${label}.questionIds: must reference current group questions`)
    }
    assertLocatedRanges(annotation.sourceRanges, texts, `${label}.sourceRanges`)
    assertLocatedRanges(annotation.translationRanges, texts, `${label}.translationRanges`)
    if (annotation.translationRanges.some((range) => range.textId !== translationTextId)) {
      throw new Error(`${label}.translationRanges: must reference the declared translation text`)
    }
    if (annotation.kind === 'answer-evidence') {
      if (annotation.sourceRanges.some((range) => range.textId !== sourceTextId)) {
        throw new Error(`${label}.sourceRanges: answer evidence must reference original exam text`)
      }
    } else if (annotation.kind === 'answer-insertion') {
      if (annotation.questionIds.length !== 1
        || annotation.sourceRanges.some((range) => !completedIds.has(range.textId))) {
        throw new Error(`${label}: answer insertion must bind one question to completed source text`)
      }
      const question = questions.get(annotation.questionIds[0])
      if (!question?.blankId || annotation.blankId !== question.blankId) {
        throw new Error(`${label}.blankId: does not match the authoritative question blank`)
      }
      const authoritativeAnswer = typeof answerForQuestion === 'function'
        ? answerForQuestion(question)
        : ''
      if (!authoritativeAnswer
        || annotation.sourceRanges.some((range) => {
          const insertions = insertionRangesForParagraph?.(paragraphs.get(range.paragraphId)) || []
          return !insertions.some((insertion) => insertion.questionId === question.id
            && insertion.blankId === question.blankId && insertion.start === range.start
            && insertion.end === range.end && insertion.quote === range.quote
            && range.quote === authoritativeAnswer)
        })) {
        throw new Error(`${label}.sourceRanges: must exactly locate the authoritative inserted answer`)
      }
      insertionCounts.set(
        annotation.questionIds[0],
        (insertionCounts.get(annotation.questionIds[0]) || 0) + 1,
      )
    } else {
      if (!sentenceIds.has(annotation.selectedSentenceId)) {
        throw new Error(`${label}.selectedSentenceId: unknown selected long sentence`)
      }
      const sentence = sentences.get(annotation.selectedSentenceId)
      if (JSON.stringify([...annotation.questionIds].sort()) !== JSON.stringify([...(sentence.relatedQuestionIds || [])].sort())) {
        throw new Error(`${label}.questionIds: must match the selected sentence relations`)
      }
      for (const range of annotation.sourceRanges) {
        if (range.paragraphId !== sentence.paragraphId
          || (range.textId !== sourceTextId && !completedIds.has(range.textId))) {
          throw new Error(`${label}.sourceRanges: must locate the selected source sentence`)
        }
        const paragraph = texts.get(`${range.textId}\u0000${range.paragraphId}`)
        const selectedText = range.textId === sourceTextId ? sentence.sourceText : sentence.displayText
        let contained = false
        if (typeof selectedText === 'string' && selectedText.length > 0) {
          for (let offset = paragraph.indexOf(selectedText); offset >= 0; offset = paragraph.indexOf(selectedText, offset + 1)) {
            const start = Array.from(paragraph.slice(0, offset)).length
            if (range.start >= start && range.end <= start + Array.from(selectedText).length) contained = true
          }
        }
        if (!contained) throw new Error(`${label}.sourceRanges: outside the selected source sentence`)
      }
      structureSentenceIds.add(annotation.selectedSentenceId)
    }
  }
  for (const questionId of questions.keys()) {
    // Text annotations supplement the existing question evidence contracts.
    // Figure/table evidence stays on those object references, never fake offsets.
    if (requireAnswerInsertions && insertionCounts.get(questionId) !== 1) {
      throw new Error(`teachingContent.annotations: ${questionId} must have exactly one answer-insertion relationship`)
    }
  }
  for (const sentenceId of sentenceIds) {
    if (!sentenceId || !structureSentenceIds.has(sentenceId)) {
      throw new Error('teachingContent.annotations: every selected sentence needs a sentence-structure relationship')
    }
  }
  return annex
}
