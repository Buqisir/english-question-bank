import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { stageSignalListeningAudio } from './import-pipeline/listening-audio.mjs'
import { assertListeningAudioManifest, assertListeningAudioSource, LISTENING_SIGNAL_ATTACHMENTS } from '../server/paper-import/listeningAudioEvidence.mjs'
import { sendListeningAudioFile } from '../server/paper-import/paperAssetStatic.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { makeFixture } from './verify-nck1-source-materialization.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'eqb-signal-audio-'))
const paperId = `paper-signal-verification-${process.pid}`
const cliPaperDir = path.join(import.meta.dirname, 'import-pipeline/papers', paperId)
let linked = false
const json = (file) => JSON.parse(readFileSync(file, 'utf8'))
const save = (file, value) => writeFileSync(file, JSON.stringify(value))
try {
  const source = path.join(root, 'input.mp3')
  // A single tone must NOT become ten question clips just to satisfy the pipeline.
  // No Xing header: decoding emits a real bitrate warning with a process address.
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=733:duration=12.3', '-write_xing', '0', source])
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
  assert.ok(!existsSync(path.join(root, 'materialization/listening-audio/waveform-v1.json')),
    'signal-only preparation retains timing candidates without generating a waveform')
  const manifestPath = path.join(root, 'universal-source-manifest.json')
  const manifest = json(manifestPath)
  assert.equal(manifest.schemaVersion, 'universal-nck1-source-manifest-v3')
  const evidence = assertListeningAudioManifest(root, manifest)
  assert.equal(evidence.segments.originalAudioSha256, sha256(readFileSync(source)))
  assert.ok(!Object.hasOwn(evidence, 'asr'))
  assert.equal(assertListeningAudioSource(evidence, { state: 'captured' }).durationSeconds, result.durationSeconds)
  assert.throws(() => assertListeningAudioSource(evidence, { state: 'not_supplied' }), /without Listening/)
  assert.throws(() => stageSignalListeningAudio({ paperDir: root, paperId, sourcePath: source }), /fresh/)

  const repeatRoot = path.join(root, 'repeat-stage')
  mkdirSync(repeatRoot)
  save(path.join(repeatRoot, 'universal-source-manifest.json'), {
    schemaVersion: 'universal-nck1-source-manifest-v1', paperId, documents: [],
  })
  stageSignalListeningAudio({ paperDir: repeatRoot, paperId, sourcePath: source })
  for (const paperDir of [root, repeatRoot]) {
    const raw = readFileSync(path.join(paperDir, 'materialization/listening-audio/signal-work/decode.log'), 'utf8')
    assert.match(raw, /\[[^\]\r\n]*mp3 @ 0x[\da-f]+\]/i, 'Preserve original FFmpeg diagnostics locally')
    const warnings = json(path.join(paperDir, LISTENING_SIGNAL_ATTACHMENTS[2].path)).decodeWarnings
    assert.match(warnings, /Estimating duration from bitrate, this may be inaccurate/)
  }
  assert.deepEqual(json(path.join(repeatRoot, 'universal-source-manifest.json')), manifest,
    'Identical source and runtime must not change Review attachment identity between stages')

  // Exercise recovery through the actual CLI, with a complete synthetic Source.
  const materialization = makeFixture({ listening: true })
  materialization.paperId = paperId
  manifest.documents = materialization.documents.map((document) => {
    const bytes = Buffer.from(`%PDF-1.7 synthetic ${document.documentId}`.padEnd(100, 'x'))
    Object.assign(document, { sha256: sha256(bytes), byteLength: bytes.length })
    const relativePath = `${document.documentId}.pdf`
    writeFileSync(path.join(root, relativePath), bytes)
    return { ...document, path: relativePath }
  })
  manifest.materializationPath = 'materialization/nck1-source-materialization-v1.json'
  save(path.join(root, manifest.materializationPath), materialization)
  save(manifestPath, manifest)
  save(path.join(root, 'config.json'), { paperId, format: 'universal-nck1' })
  symlinkSync(root, cliPaperDir)
  linked = true
  const cli = (...args) => execFileSync(process.execPath, [
    path.join(import.meta.dirname, 'import-pipeline/universal-nck1.mjs'), ...args,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.throws(() => cli('stage-listening-audio', paperId, '--audio', source, '--signal-only'), /fresh attachment-free/)
  const blockedPath = path.join(root, 'signals/blocked.json')
  const blockedBytes = readFileSync(blockedPath)
  assert.match(cli('verify', paperId), /"assertions": 65/)
  assert.equal(existsSync(blockedPath), false, 'successful audio-aware verify retires the recovered staging blocker')
  assert.deepEqual(readFileSync(path.join(root, 'signals/history', `blocked-${sha256(blockedBytes)}.json`)), blockedBytes)
  const unrelatedBlock = { code: 'source_incomplete', note: 'Waiting for source correction', at: new Date().toISOString() }
  save(blockedPath, unrelatedBlock)
  const unrelatedBytes = readFileSync(blockedPath)
  cli('verify', paperId)
  assert.deepEqual(readFileSync(blockedPath), unrelatedBytes, 'successful verify must preserve unrelated blockers')

  writeFileSync(blockedPath, blockedBytes)
  save(manifestPath, { ...manifest, schemaVersion: 'universal-nck1-source-manifest-v1', attachments: undefined })
  save(path.join(root, manifest.materializationPath), { ...materialization, listening: makeFixture().listening })
  assert.match(cli('verify', paperId), /"assertions": 45/)
  assert.deepEqual(readFileSync(blockedPath), blockedBytes, 'verification without signal evidence cannot retire an audio blocker')
  save(manifestPath, manifest)
  save(path.join(root, manifest.materializationPath), materialization)

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
  writeFileSync(blockedPath, blockedBytes)
  assert.throws(() => cli('verify', paperId), /bytes changed/)
  assert.equal(json(blockedPath).code, 'source_incomplete', 'failed audio validation must remain blocked')
  execFileSync('python3', [path.join(import.meta.dirname, 'verify-listening-signal.py')], { stdio: 'inherit' })
  console.log('PASS signal-only real encode/decode, no ASR, unsegmented fallback, source/playback binding, invalid bounds, immutable staging and byte-range playback')
} finally {
  if (linked) rmSync(cliPaperDir)
  rmSync(root, { recursive: true, force: true })
}
