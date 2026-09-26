import { createHash } from 'node:crypto'
import { SEGMENTATION_VERSION, SOURCE_PROJECTION_VERSION } from '../paper-selection/constants.mjs'
import { splitSentences } from '../paper-selection/segmentation.mjs'
import { classifyCompleteEnglishWord } from '../paper-dictionary/wordToken.mjs'
import { NOTEBOOK_SENTENCE_LIMIT } from './constants.mjs'

const FRAGMENT_ROLES = new Set([
  'option',
  'option-bank',
  'table-cell',
  'question-stem',
  'figure-caption',
  'instruction',
])

function fail(code, message, status = 400) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

export function extractNotebookOccurrence(stream, start, end) {
  if (!stream?.groupId) {
    throw fail('NOTEBOOK_NO_GROUP', '此处暂不支持加入生词本')
  }
  const word = classifyCompleteEnglishWord(stream.text, start, end)
  if (!word) throw fail('NOTEBOOK_NOT_A_WORD', '请选择一个完整的英文单词')
  const sentences = splitSentences(stream.text)
  const covered = sentences.filter((sentence) => sentence.end > word.start && sentence.start < word.end)
  if (covered.length > 1) throw fail('NOTEBOOK_CROSSES_SENTENCE', '一次只能加入一个句子里的单词')
  const sentence = covered[0] || { start: 0, end: stream.text.length, text: stream.text }
  if (sentence.text.length > NOTEBOOK_SENTENCE_LIMIT) {
    throw fail('NOTEBOOK_SENTENCE_TOO_LONG', '这句话太长，不能加入生词本', 413)
  }
  const sourceKind = FRAGMENT_ROLES.has(stream.role) || covered.length === 0 ? 'fragment' : 'sentence'
  return {
    surface: word.surface,
    wordStart: word.start,
    wordEnd: word.end,
    sentenceStart: sentence.start,
    sentenceEnd: sentence.end,
    sentenceText: sentence.text,
    sentenceDigest: createHash('sha256').update(sentence.text).digest('hex'),
    selectionInSentence: {
      start: word.start - sentence.start,
      end: word.end - sentence.start,
    },
    sourceKind,
    role: stream.role || 'passage-body',
    groupId: stream.groupId,
    segmentationVersion: SEGMENTATION_VERSION,
    sourceProjectionVersion: SOURCE_PROJECTION_VERSION,
  }
}
