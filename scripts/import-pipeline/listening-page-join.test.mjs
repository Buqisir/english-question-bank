import assert from 'node:assert/strict'
import { test } from 'node:test'
import { joinListeningTranscriptPages } from '../../server/paper-import/nck1DocxMaterializationProducer.mjs'

test('joins an unfinished English turn across adjacent source pages', () => {
  assert.equal(joinListeningTranscriptPages([
    { page: 9, text: 'M: We were planning.\nBut my sister\n' },
    { page: 10, text: '\ninsisted that we see Darjeeling.\nW: Really?' },
  ]), 'M: We were planning.\nBut my sister insisted that we see Darjeeling.\nW: Really?')
})

test('preserves sentence and colon boundaries, including closing quotes and brackets', () => {
  for (const ending of ['.', '?', '!', '。', '？', '！', ':', '：', '.”', '?”)', "!')", '。】']) {
    assert.equal(joinListeningTranscriptPages([
      { page: 1, text: `An ending${ending}` }, { page: 2, text: 'another line' },
    ]), `An ending${ending}\nanother line`)
  }
})

test('preserves capitalized openings and Chinese text', () => {
  for (const text of ['Insisted on it.', 'W: A new turn.', '这是另一行。']) {
    assert.equal(joinListeningTranscriptPages([
      { page: 1, text: 'An unfinished line' }, { page: 2, text },
    ]), `An unfinished line\n${text}`)
  }
})

test('preserves same-page, missing-page and nonadjacent-page separators', () => {
  for (const page of [1, null, 3]) {
    assert.equal(joinListeningTranscriptPages([
      { page: 1, text: 'But my sister' }, { page, text: 'insisted on it.' },
    ]), 'But my sister\ninsisted on it.')
  }
})
