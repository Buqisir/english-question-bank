import {
  CONTEXT_POLICY,
  SEGMENTATION_VERSION,
  TASK_FRAGMENT,
  TASK_SELECTED_TEXT,
} from './constants.mjs'
import { assertHalfOpenUtf16Range, sliceUtf16 } from './utf16.mjs'

let sentenceSegmenter

function getSentenceSegmenter() {
  if (!sentenceSegmenter) {
    if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
      const error = new Error('Intl.Segmenter is required for adjacent-v1')
      error.code = 'SELECTION_SEGMENTER_UNAVAILABLE'
      throw error
    }
    sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
  }
  return sentenceSegmenter
}

export function splitSentences(text) {
  if (typeof text !== 'string' || text.length === 0) return []
  const sentences = []
  for (const { segment, index } of getSentenceSegmenter().segment(text)) {
    const end = index + segment.length
    if (index === end) continue
    sentences.push({
      start: index,
      end,
      text: text.slice(index, end),
    })
  }
  return sentences
}

function coveringSentenceIndexes(sentences, start, end) {
  const indexes = []
  for (let i = 0; i < sentences.length; i += 1) {
    const sentence = sentences[i]
    if (sentence.end <= start || sentence.start >= end) continue
    indexes.push(i)
  }
  return indexes
}

export function buildAdjacentContext(streamText, start, end) {
  assertHalfOpenUtf16Range(streamText, start, end, 'selection')
  const selectedText = sliceUtf16(streamText, start, end)
  const sentences = splitSentences(streamText)
  if (sentences.length === 0) {
    return {
      contextPolicy: CONTEXT_POLICY,
      segmentationVersion: SEGMENTATION_VERSION,
      contextText: streamText,
      selectionInContext: { start, end },
      beforeSelection: streamText.slice(0, start),
      selectedText,
      afterSelection: streamText.slice(end),
      contextCoverage: 'boundary-limited',
      taskMode: TASK_FRAGMENT,
      coveredSentenceCount: 0,
    }
  }

  const covered = coveringSentenceIndexes(sentences, start, end)
  const first = covered[0] ?? 0
  const last = covered.length > 0 ? covered[covered.length - 1] : 0
  const windowStartIndex = Math.max(0, first - 1)
  const windowEndIndex = Math.min(sentences.length - 1, last + 1)
  const windowStart = sentences[windowStartIndex].start
  const windowEnd = sentences[windowEndIndex].end
  const contextText = streamText.slice(windowStart, windowEnd)
  const selectionInContext = {
    start: start - windowStart,
    end: end - windowStart,
  }
  const coversCompleteSentences = covered.length > 0
    && start === sentences[first].start
    && end === sentences[last].end
  const atBoundary = windowStartIndex === 0 || windowEndIndex === sentences.length - 1
  const missingNeighbor = (first === 0 && sentences.length > 1)
    || (last === sentences.length - 1 && sentences.length > 1)
    || sentences.length === 1

  return {
    contextPolicy: CONTEXT_POLICY,
    segmentationVersion: SEGMENTATION_VERSION,
    contextText,
    selectionInContext,
    beforeSelection: contextText.slice(0, selectionInContext.start),
    selectedText,
    afterSelection: contextText.slice(selectionInContext.end),
    contextCoverage: atBoundary && missingNeighbor ? 'boundary-limited' : 'adjacent-complete',
    taskMode: coversCompleteSentences ? TASK_SELECTED_TEXT : TASK_FRAGMENT,
    coveredSentenceCount: covered.length,
  }
}

export { SEGMENTATION_VERSION, CONTEXT_POLICY }
