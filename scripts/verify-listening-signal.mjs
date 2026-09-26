import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { stageSignalListeningAudio } from './import-pipeline/listening-audio.mjs'
import { assertListeningAudioManifest, assertListeningAudioSource, LISTENING_SIGNAL_ATTACHMENTS } from '../server/paper-import/listeningAudioEvidence.mjs'
import { sendListeningAudioFile } from '../server/paper-import/paperAssetStatic.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'eqb-signal-audio-'))
const paperId = 'paper-signal-verification'
const json = (file) => JSON.parse(readFileSync(file, 'utf8'))
const save = (file, value) => writeFileSync(file, JSON.stringify(value))
try {
  const source = path.join(root, 'input.mp3')
  // A single tone must NOT become ten question clips just to satisfy the pipeline.
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=733:duration=12.3', source])
  const bytes = readFileSync(source)
  const server = createServer((request, response) => {
    sendListeningAudioFile(request, response, source, { cacheControl: 'private, no-store' })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const url = `http://127.0.0.1:${server.address().port}/audio`
    for (const [range, start, end] of [
      ['bytes=137-509', 137, 509],
      ['bytes=-19', bytes.length - 19, bytes.length - 1],
      [`bytes=${bytes.length - 7}-`, bytes.length - 7, bytes.length - 1],
    ]) {
      const response = await fetch(url, { headers: { range } })
      assert.equal(response.status, 206)
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1))
    }
    for (const range of [`bytes=${bytes.length}-`, 'bytes=9-3', 'bytes=0-1,4-5']) {
      const response = await fetch(url, { headers: { range } })
      assert.equal(response.status, 416)
      assert.equal(response.headers.get('content-range'), `bytes */${bytes.length}`)
      assert.equal((await response.arrayBuffer()).byteLength, 0)
    }
    const head = await fetch(url, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(Number(head.headers.get('content-length')), bytes.length)
    assert.equal((await head.arrayBuffer()).byteLength, 0)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
  save(path.join(root, 'universal-source-manifest.json'), {
    schemaVersion: 'universal-nck1-source-manifest-v1', paperId, documents: [],
  })
  // If signal staging ever invokes the ASR subprocess, the test must fail.
  process.env.QUESTION_BANK_LISTENING_ASR_PYTHON = '/nonexistent/no-asr-allowed'
  const result = stageSignalListeningAudio({ paperDir: root, paperId, sourcePath: source })
  assert.equal(result.state, 'unsegmented')
  assert.equal(result.contentValidation, 'not_performed')
  assert.equal(result.candidateCount, 0)
  assert.ok(Math.abs(result.durationSeconds - 12.3) < .1)
  assert.ok(!existsSync(path.join(root, 'materialization/listening-audio/asr-v1.json')))
  const manifestPath = path.join(root, 'universal-source-manifest.json')
  const manifest = json(manifestPath)
  assert.equal(manifest.schemaVersion, 'universal-nck1-source-manifest-v3')
  const evidence = assertListeningAudioManifest(root, manifest)
  assert.equal(evidence.segments.originalAudioSha256, sha256(readFileSync(source)))
  assert.ok(!Object.hasOwn(evidence, 'asr'))
  assert.equal(assertListeningAudioSource(evidence, { state: 'captured' }).durationSeconds, result.durationSeconds)
  assert.throws(() => assertListeningAudioSource(evidence, { state: 'not_supplied' }), /without Listening/)
  assert.throws(() => stageSignalListeningAudio({ paperDir: root, paperId, sourcePath: source }), /fresh/)

  const segmentsPath = path.join(root, LISTENING_SIGNAL_ATTACHMENTS[2].path)
  const baseline = json(segmentsPath)
  const changed = (update) => {
    const value = structuredClone(baseline)
    update(value)
    save(segmentsPath, value)
    const bytes = readFileSync(segmentsPath)
    const copy = structuredClone(manifest)
    Object.assign(copy.attachments[2], { sha256: sha256(bytes), byteLength: bytes.length })
    return copy
  }
  // Rehashing cannot turn invalid boundaries or another paper into valid evidence.
  for (const mutate of [
    (s) => { s.paperId = 'paper-other' },
    (s) => { s.playbackAudioSha256 = s.originalAudioSha256 },
    (s) => { s.contentValidation = 'pass' },
    (s) => { s.candidates = [{ candidate: 1, startSeconds: -1, endSeconds: 4 }] },
    (s) => { s.candidates = [{ candidate: 1, startSeconds: 2, endSeconds: 13 }] },
    (s) => { s.candidates = [{ candidate: 1, startSeconds: 2, endSeconds: 5 }, { candidate: 2, startSeconds: 4, endSeconds: 8 }] },
    (s) => { s.state = 'candidate_segments' },
  ]) assert.throws(() => assertListeningAudioManifest(root, changed(mutate)), { code: 'LISTENING_AUDIO_EVIDENCE_INVALID' })
  save(segmentsPath, baseline)
  writeFileSync(path.join(root, 'materialization/listening-audio/playback.mp3'), 'different audio')
  assert.throws(() => assertListeningAudioManifest(root, manifest), /bytes changed/)
  console.log('PASS signal-only real encode/decode, no ASR, unsegmented fallback, source/playback binding, invalid bounds, immutable staging and byte-range playback')
} finally {
  rmSync(root, { recursive: true, force: true })
}
