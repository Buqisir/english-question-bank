import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {measureListeningSilence, remeasureListeningReplaySilence} from './listening-segment.mjs'

function audio(t) {
  const scratch = path.resolve('.scratch')
  mkdirSync(scratch, {recursive: true})
  const dir = mkdtempSync(path.join(scratch, 'silence-replay-test-'))
  t.after(() => rmSync(dir, {recursive: true, force: true}))
  const rate = 8000, samples = rate * 2, bytes = Buffer.alloc(44 + samples * 2)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28)
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40)
  for (let i = rate / 2; i < rate * 1.5; i++) {
    bytes.writeInt16LE(Math.round(4000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2)
  }
  const file = path.join(dir, 'synthetic.wav')
  writeFileSync(file, bytes)
  return file
}
test('replay remeasures the same audio and parameters without any ASR runner', t => {
  const file = audio(t), saved = measureListeningSilence(file, 2)
  assert.equal(saved.status, 0)
  assert.equal(saved.pauses.length, 2)
  assert.deepEqual(remeasureListeningReplaySilence(file, 2, saved).pauses, saved.pauses)
  const legacy = {...saved}; delete legacy.pauses
  assert.deepEqual(remeasureListeningReplaySilence(file, 2, legacy).pauses, saved.pauses)
})
test('replay rejects changed saved pauses, changed detection settings and failed evidence', t => {
  const file = audio(t), saved = measureListeningSilence(file, 2), changed = structuredClone(saved)
  changed.pauses[0].endSeconds += 0.2
  assert.throws(() => remeasureListeningReplaySilence(file, 2, changed), /LISTENING_REPLAY_SILENCE_CHANGED/)
  const legacy = {...saved, stderr: 'silence_start: 0\nsilence_end: 0.1'}; delete legacy.pauses
  assert.throws(() => remeasureListeningReplaySilence(file, 2, legacy), /LISTENING_REPLAY_SILENCE_CHANGED/)
  assert.throws(() => remeasureListeningReplaySilence(file, 2, {...saved, status: 1}), /LISTENING_REPLAY_SILENCE_CHANGED/)
  assert.throws(() => remeasureListeningReplaySilence(file, 2, {...saved,
    method: {...saved.method, noiseDb: -20}}), /LISTENING_REPLAY_SILENCE_SETTINGS_CHANGED/)
})
