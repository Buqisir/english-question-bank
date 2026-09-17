import { assertAnalysisTextRanges } from '../../shared/analysis/analysisTextRanges.mjs'
import { answerCompletedSentence } from './analyzerProviderShell.mjs'

// Explicit preparation of unaccepted AI output, never a validator fallback.
// Preserve a valid occurrence selection. Otherwise only a unique exact quote
// may determine new offsets; text, identities and relationships never change.
function deriveRange(text, range, location) {
  if (typeof text !== 'string' || typeof range?.quote !== 'string' || !range.quote) {
    throw new Error(`${location}: missing exact text or quote`)
  }
  try {
    assertAnalysisTextRanges(text, [{ start: range.start, end: range.end, quote: range.quote }])
    return
  } catch {
    const index = text.indexOf(range.quote)
    if (index < 0 || index !== text.lastIndexOf(range.quote)) {
      throw new Error(`${location}: quote must match exactly once, or have valid explicit offsets`)
    }
    range.start = Array.from(text.slice(0, index)).length
    range.end = range.start + Array.from(range.quote).length
  }
}

export function deriveReadingAnalysisRanges(analysis, group) {
  return deriveRanges(analysis, group, false)
}

// A preparation draft may omit mechanically derived text and offsets. The
// original source, quotes, paragraph identities and semantic links remain fixed.
export function prepareObjectiveAnalysis(analysis, group) {
  return deriveRanges(analysis, group, true)
}

function deriveRanges(analysis, group, completeAnswers) {
  const result = structuredClone(analysis)
  const value = result.groups[group.groupId]
  const annex = value.teachingContent
  const translation = annex.translation
  const texts = new Map()
  function addText(textId, paragraphId, text) {
    const key = JSON.stringify([textId, paragraphId])
    if (texts.has(key)) throw new Error('Duplicate textId/paragraphId pair')
    texts.set(key, text)
  }
  for (const paragraph of group.paragraphs) addText(annex.sourceTextId, paragraph.id, paragraph.text)
  const insertions = new Map()
  if (completeAnswers) {
    for (const completed of annex.completedSourceTexts) {
      const paragraph = group.paragraphs.find(({ id }) => id === completed.paragraphId)
      if (!paragraph) throw new Error('Unknown completed source paragraph')
      const ranges = []
      completed.text = answerCompletedSentence(paragraph.text, group, {
        onInsertion: (range) => ranges.push(range),
      })
      addText(completed.textId, completed.paragraphId, completed.text)
      insertions.set(JSON.stringify([completed.textId, completed.paragraphId]), ranges)
    }
  }
  for (const paragraph of translation.paragraphs) {
    deriveRange(value.fullTranslationZh, paragraph, `translation paragraph ${paragraph.paragraphId}`)
    addText(translation.textId, paragraph.paragraphId, paragraph.quote)
  }
  for (const annotation of annex.annotations) {
    for (const field of ['sourceRanges', 'translationRanges']) {
      for (const range of annotation[field]) {
        if (completeAnswers && annotation.kind === 'answer-insertion' && field === 'sourceRanges') {
          const matches = (insertions.get(JSON.stringify([range.textId, range.paragraphId])) || [])
            .filter((entry) => annotation.questionIds.length === 1
              && entry.questionId === annotation.questionIds[0] && entry.blankId === annotation.blankId)
          if (matches.length !== 1 || matches[0].quote !== range.quote) {
            throw new Error(`${annotation.annotationId}: insertion identity or authoritative quote mismatch`)
          }
          range.start = matches[0].start
          range.end = matches[0].end
          continue
        }
        const text = texts.get(JSON.stringify([range.textId, range.paragraphId]))
        deriveRange(text, range, `${annotation.annotationId}.${field}`)
      }
    }
  }
  for (const sentence of value.selectedLongSentences) {
    if (completeAnswers) {
      const paragraph = group.paragraphs.find(({ id }) => id === sentence.paragraphId)
      if (!sentence.sourceText || !paragraph?.text.includes(sentence.sourceText)) {
        throw new Error('Selected sentence must belong to its source paragraph')
      }
      const displayText = answerCompletedSentence(sentence.sourceText, group)
      if (sentence.underlineTexts !== undefined) {
        if (sentence.underlineRanges !== undefined) throw new Error('Mixed underline representations')
        sentence.underlineRanges = sentence.underlineTexts.map((quote) => ({ quote }))
        delete sentence.underlineTexts
      }
      // Old offsets bind the old display, not the newly completed sentence.
      if (sentence.displayText !== displayText) {
        for (const range of sentence.underlineRanges) {
          delete range.start
          delete range.end
        }
      }
      sentence.displayText = displayText
    }
    for (const range of sentence.underlineRanges) {
      deriveRange(sentence.displayText, range, `${sentence.sentenceId}.underlineRanges`)
    }
  }
  return result
}
