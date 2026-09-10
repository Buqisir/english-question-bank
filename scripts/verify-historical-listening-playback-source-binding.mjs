import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  enrichSourceBoundListeningPlayback,
  sourceBoundFirstSectionPlayback,
} from '../server/paper-canonical/listeningPlaybackSourceBinding.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = path.join(
  root,
  'test-fixtures/paper-import/paper-2024-jslk-english/paper-asset.json',
)
const bytes = readFileSync(fixturePath)
const digest = (value) => createHash('sha256').update(value).digest('hex')
const before = digest(bytes)
const historicalAsset = JSON.parse(bytes)

assert.equal(
  sourceBoundFirstSectionPlayback(historicalAsset),
  'once_explicit',
  'the real 2024 JSLK immutable Paper Asset preserves 仅读一遍',
)
assert.equal(digest(readFileSync(fixturePath)), before, 'source bytes and digest remain unchanged')

const legacyQuestions = {
  schemaVersion: 'paper-listening-questions-v1',
  section1: { instruction: '每段对话仅读一遍。', questions: [] },
  section2: { questions: [] },
}
const capture = {
  schemaVersion: 'source-capture-v1',
  documents: [{
    mediaType: 'application/vnd.eqb.listening-questions+json',
    encodedBytes: Buffer.from(JSON.stringify(legacyQuestions)).toString('base64'),
  }],
}
assert.equal(
  sourceBoundFirstSectionPlayback(capture),
  'once_explicit',
  'legacy listening/questions.json section1.instruction preserves 仅读一遍',
)
assert.equal(sourceBoundFirstSectionPlayback({ content: { blocks: [] } }), 'twice_default')
assert.equal(sourceBoundFirstSectionPlayback({
  content: { blocks: [{ type: 'instruction', text: '每段录音播放两遍。' }] },
}), 'twice_default')

const occurrence = {
  familyContractId: 'listening',
  slotId: 'listening.short-dialogue',
  groupId: 'group-2024-jslk-listening-s1',
}
const screen = enrichSourceBoundListeningPlayback(occurrence, 'once_explicit')
const print = enrichSourceBoundListeningPlayback(occurrence, 'once_explicit')
assert.equal(screen.firstSectionPlayback, 'once_explicit')
assert.deepEqual(print, screen, 'Screen and Print receive the same consumer occurrence field')
assert.equal(Object.hasOwn(occurrence, 'firstSectionPlayback'), false, 'canonical occurrence is not mutated')
assert.equal(enrichSourceBoundListeningPlayback({
  ...occurrence,
  slotId: 'listening.long-form',
}, 'once_explicit').firstSectionPlayback, undefined, 'audio/long-form occurrences are unaffected')

console.log('PASS historical Listening playback source binding')
