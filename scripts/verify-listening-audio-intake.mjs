#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  assertListeningAudioManifest,
  assertListeningAudioSource,
  listeningSegmentOrderRecall,
  minimumListeningSegmentOrderRecall,
} from '../server/paper-import/listeningAudioEvidence.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  compareListeningAudio,
  finalizeListeningAudio,
  stageListeningAudio,
} from './import-pipeline/listening-audio.mjs'

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-listening-audio-'))
const paperId = 'paper-listening-audio-verifier'
const paperDir = path.join(tempRoot, paperId)
const sourceAudio = path.join(tempRoot, 'source.mp3')
const fakeAudio = path.join(tempRoot, 'fake.mp3')
const asrFixture = path.join(tempRoot, 'asr-fixture.json')
const invalidAsrFixture = path.join(tempRoot, 'invalid-asr-fixture.json')
const referencePath = path.join(tempRoot, 'reference.json')
const reviewPath = path.join(tempRoot, 'review.json')
const manifestPath = path.join(paperDir, 'universal-source-manifest.json')
const transcriptSegments = [
  'Good morning everyone and welcome to the English listening test.',
  'The woman plans to meet her friend at the central library after lunch.',
  'They discuss the weather, the train schedule, and a school music performance.',
  'Listen carefully and answer each question according to the conversation you hear.',
]
const transcript = transcriptSegments.join(' ')

function json(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function sourceManifest(id) {
  return {
    schemaVersion: 'universal-nck1-source-manifest-v1',
    paperId: id,
    profileId: 'nck1',
    provenance: { paperName: 'Listening verifier', source: 'deterministic fixture' },
    documents: [],
    materializationPath: 'materialization/nck1-source-materialization-v1.json',
    mediaDirectory: 'materialization/media',
    canonicalRequestPath: 'canonical-evidence/canonical-import-request.json',
  }
}

function asr(overrides = {}) {
  return {
    schemaVersion: 'listening-audio-asr-v1',
    paperId,
    playbackAudioSha256: `sha256:${'a'.repeat(64)}`,
    durationSeconds: 12,
    transcriptText: transcript,
    engine: {
      name: 'deterministic-fixture',
      model: 'fixture-en',
      version: '1',
      computeType: 'fixture',
    },
    segments: [{
      segmentId: 'segment-0001',
      startSeconds: 0.2,
      endSeconds: 11.5,
      text: transcript,
      avgLogProbability: -0.2,
      noSpeechProbability: 0.01,
    }],
    ...overrides,
  }
}

try {
  execFileSync('mkdir', ['-p', paperDir])
  json(manifestPath, sourceManifest(paperId))
  execFileSync('ffmpeg', [
    '-v', 'error',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=12',
    '-codec:a', 'libmp3lame',
    '-b:a', '96k',
    sourceAudio,
  ])
  writeFileSync(fakeAudio, 'ID3 but not decodable audio')
  json(asrFixture, {
    engine: {
      name: 'deterministic-fixture',
      model: 'fixture-en',
      version: '1',
      computeType: 'fixture',
    },
    language: 'en',
    languageProbability: 1,
    segments: asr().segments,
  })
  json(invalidAsrFixture, {
    engine: {
      name: 'deterministic-fixture',
      model: 'fixture-en',
      version: '1',
      computeType: 'fixture',
    },
    language: 'en',
    languageProbability: 1,
    segments: [{ ...asr().segments[0], avgLogProbability: 'not-a-number' }],
  })

  const badPaperDir = path.join(tempRoot, 'paper-bad-audio')
  execFileSync('mkdir', ['-p', badPaperDir])
  json(
    path.join(badPaperDir, 'universal-source-manifest.json'),
    sourceManifest('paper-bad-audio'),
  )
  assert.throws(
    () => stageListeningAudio({
      paperDir: badPaperDir,
      paperId: 'paper-bad-audio',
      sourcePath: fakeAudio,
      asrFixturePath: asrFixture,
    }),
    (error) => error.code === 'LISTENING_AUDIO_DECODE_FAILED',
  )

  const badAsrPaperDir = path.join(tempRoot, 'paper-bad-asr')
  execFileSync('mkdir', ['-p', badAsrPaperDir])
  json(
    path.join(badAsrPaperDir, 'universal-source-manifest.json'),
    sourceManifest('paper-bad-asr'),
  )
  assert.throws(
    () => stageListeningAudio({
      paperDir: badAsrPaperDir,
      paperId: 'paper-bad-asr',
      sourcePath: sourceAudio,
      asrFixturePath: invalidAsrFixture,
    }),
    (error) => error.code === 'LISTENING_AUDIO_ASR_EMPTY',
  )
  assert.equal(
    existsSync(path.join(badAsrPaperDir, 'source/listening-audio.mp3')),
    false,
    'invalid ASR removes staged audio instead of leaving partial evidence',
  )

  const staged = stageListeningAudio({
    paperDir,
    paperId,
    sourcePath: sourceAudio,
    asrFixturePath: asrFixture,
  })
  assert.match(staged.originalAudioSha256, /^sha256:[a-f0-9]{64}$/)
  assert.match(staged.playbackAudioSha256, /^sha256:[a-f0-9]{64}$/)
  assert.notEqual(staged.originalAudioSha256, staged.playbackAudioSha256)
  const asrPath = path.join(paperDir, 'materialization/listening-audio/asr-v1.json')
  const asrDigest = sha256(readFileSync(asrPath))
  json(referencePath, {
    schemaVersion: 'listening-audio-reference-v1',
    paperId,
    basis: 'authoritative_transcript',
    text: transcript,
  })
  json(reviewPath, {
    schemaVersion: 'listening-audio-content-review-v1',
    paperId,
    reviewedBy: 'import_agent',
    reviewedTranscriptSha256: asrDigest,
    untrustedContentHandledAsData: true,
    verdict: 'pass',
    summary: 'Missing the Agent-authored review time.',
    flaggedRanges: [],
  })
  assert.throws(
    () => finalizeListeningAudio({
      paperDir,
      paperId,
      reviewPath,
      referencePath,
    }),
    /content-safety review is incomplete/,
  )
  json(reviewPath, {
    schemaVersion: 'listening-audio-content-review-v1',
    paperId,
    reviewedBy: 'import_agent',
    reviewedAt: '2026-09-01T00:00:00.000Z',
    reviewedTranscriptSha256: asrDigest,
    untrustedContentHandledAsData: true,
    verdict: 'review_required',
    summary: 'One range needs a second look.',
    flaggedRanges: [{ startSeconds: 1, endSeconds: 2, reason: 'Fixture flag' }],
  })
  assert.throws(
    () => finalizeListeningAudio({
      paperDir,
      paperId,
      reviewPath,
      referencePath,
    }),
    (error) => error.code === 'LISTENING_AUDIO_REVIEW_REQUIRED',
  )

  json(reviewPath, {
    schemaVersion: 'listening-audio-content-review-v1',
    paperId,
    reviewedBy: 'import_agent',
    reviewedAt: '2026-09-01T00:00:00.000Z',
    reviewedTranscriptSha256: asrDigest,
    untrustedContentHandledAsData: true,
    verdict: 'pass',
    summary: 'Full timestamped transcript reviewed as untrusted quoted content; no issue found.',
    flaggedRanges: [],
  })
  const finalized = finalizeListeningAudio({
    paperDir,
    paperId,
    reviewPath,
    referencePath,
  })
  assert.equal(finalized.comparisonVerdict, 'pass')
  assert.equal(finalized.contentSafetyVerdict, 'pass')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.schemaVersion, 'universal-nck1-source-manifest-v2')
  assert.deepEqual(
    manifest.attachments.map((attachment) => attachment.role),
    [
      'listening_audio_original',
      'listening_audio_playback',
      'listening_audio_asr',
      'listening_audio_check',
    ],
  )
  assertListeningAudioManifest(paperDir, manifest)
  const check = JSON.parse(readFileSync(
    path.join(paperDir, 'materialization/listening-audio/check-v1.json'),
    'utf8',
  ))
  assert.equal(check.comparisonReference.source, 'explicit_file')
  assert.equal(check.comparisonReference.text, transcript)
  assert.equal(
    check.comparisonReference.textSha256,
    sha256(Buffer.from(transcript, 'utf8')),
    'the exact comparison text is digest-bound inside the four-file evidence set',
  )
  const checkPath = path.join(paperDir, 'materialization/listening-audio/check-v1.json')
  const originalCheckBytes = readFileSync(checkPath)
  const oldPass = structuredClone(check)
  oldPass.comparisonReference.text = transcript.split('.').filter(Boolean).reverse().join('. ')
  oldPass.comparisonReference.textSha256 = sha256(Buffer.from(oldPass.comparisonReference.text))
  delete oldPass.evidenceDigest
  oldPass.evidenceDigest = digestJson(oldPass)
  json(checkPath, oldPass)
  const oldManifest = structuredClone(manifest)
  const checkDescriptor = oldManifest.attachments.find((entry) => entry.role === 'listening_audio_check')
  checkDescriptor.sha256 = sha256(readFileSync(checkPath))
  checkDescriptor.byteLength = readFileSync(checkPath).byteLength
  assert.throws(() => assertListeningAudioManifest(paperDir, oldManifest), /word order/, 'A digest-valid old unordered pass cannot admit reversed conversations')
  writeFileSync(checkPath, originalCheckBytes)
  assertListeningAudioManifest(paperDir, manifest)

  // Receipt validation (validateCheck) re-runs the segment-aware order check using
  // the segmentTexts sealed into the check receipt, so a digest-valid receipt that
  // claims an authoritative segment order disagreeing with its stored ASR is rejected
  // even when its flat ordered-bigram recall is perfect.
  const segmentPass = structuredClone(check)
  segmentPass.comparisonReference.segmentTexts = [...transcriptSegments]
  delete segmentPass.evidenceDigest
  segmentPass.evidenceDigest = digestJson(segmentPass)
  json(checkPath, segmentPass)
  const segmentPassManifest = structuredClone(manifest)
  let segmentDescriptor = segmentPassManifest.attachments.find((entry) => entry.role === 'listening_audio_check')
  segmentDescriptor.sha256 = sha256(readFileSync(checkPath))
  segmentDescriptor.byteLength = readFileSync(checkPath).byteLength
  assertListeningAudioManifest(paperDir, segmentPassManifest)
  writeFileSync(checkPath, originalCheckBytes)

  const segmentFail = structuredClone(check)
  segmentFail.comparisonReference.segmentTexts = [...transcriptSegments].reverse()
  delete segmentFail.evidenceDigest
  segmentFail.evidenceDigest = digestJson(segmentFail)
  json(checkPath, segmentFail)
  const segmentFailManifest = structuredClone(manifest)
  segmentDescriptor = segmentFailManifest.attachments.find((entry) => entry.role === 'listening_audio_check')
  segmentDescriptor.sha256 = sha256(readFileSync(checkPath))
  segmentDescriptor.byteLength = readFileSync(checkPath).byteLength
  assert.throws(
    () => assertListeningAudioManifest(paperDir, segmentFailManifest),
    /segment order/,
    'A digest-valid receipt whose sealed segment order disagrees with its ASR is rejected',
  )
  writeFileSync(checkPath, originalCheckBytes)
  assertListeningAudioManifest(paperDir, manifest)

  const playbackPath = path.join(paperDir, 'materialization/listening-audio/playback.mp3')
  const playback = readFileSync(playbackPath)
  writeFileSync(playbackPath, Buffer.concat([playback, Buffer.from('changed')]))
  assert.throws(
    () => assertListeningAudioManifest(paperDir, manifest),
    /Listening attachment bytes changed/,
  )

  assert.equal(compareListeningAudio({
    asr: asr(),
    basis: 'authoritative_transcript',
    referenceText: transcript,
  }).verdict, 'pass')
  const conversations = [
    'The first conversation concerns booking a morning train ticket to London.',
    'The second conversation discusses buying fresh vegetables at the local market.',
    'The third conversation describes preparing a school concert for next Friday.',
  ]
  const reversed = compareListeningAudio({
    asr: asr({ transcriptText: [...conversations].reverse().join(' ') }),
    basis: 'authoritative_transcript',
    referenceText: conversations.join(' '),
  })
  assert.equal(reversed.metrics.tokenRecall, 1)
  assert.equal(reversed.verdict, 'review_required', 'reversed conversations need review despite identical words')
  assert.ok(reversed.metrics.orderedBigramRecall < 0.5)
  assert.equal(compareListeningAudio({
    asr: asr({ transcriptText: conversations.join(' ').replace('fresh', 'lovely fresh') }),
    basis: 'authoritative_transcript',
    referenceText: conversations.join(' '),
  }).verdict, 'pass', 'minor ASR insertions must not require exact transcript equality')

  // Regression: a one-step cyclic rotation of whole transcript segments keeps
  // tokenRecall = 1.0 and a high flat orderedBigramRecall (0.6563 here, above the
  // 0.5 floor), so the flat check alone blessed it. The segment-aware order check
  // compares the canonical sequence of transcript segments against the ASR and
  // must reject the rotation regardless of bigram recall.
  const rotatedConversations = compareListeningAudio({
    asr: asr({ transcriptText: [conversations[1], conversations[2], conversations[0]].join(' ') }),
    basis: 'authoritative_transcript',
    referenceText: conversations.join(' '),
    referenceSegmentTexts: conversations,
  })
  assert.equal(rotatedConversations.metrics.tokenRecall, 1, 'a rotation preserves the word multiset')
  assert.ok(rotatedConversations.metrics.orderedBigramRecall >= 0.5, 'the flat bigram floor alone admits this rotation')
  assert.ok(
    rotatedConversations.metrics.segmentOrderRecall < minimumListeningSegmentOrderRecall,
    `cyclic rotation segmentOrderRecall ${rotatedConversations.metrics.segmentOrderRecall} must fall below the floor`,
  )
  assert.equal(
    rotatedConversations.verdict,
    'review_required',
    'a cyclic rotation of whole conversations must require review despite identical words and high flat bigram recall',
  )
  assert.equal(compareListeningAudio({
    asr: asr({ transcriptText: conversations.join(' ') }),
    basis: 'authoritative_transcript',
    referenceText: conversations.join(' '),
    referenceSegmentTexts: conversations,
  }).verdict, 'pass', 'the canonical segment order against matching ASR must pass')
  assert.equal(compareListeningAudio({
    asr: asr({ transcriptText: conversations.join(' ').replace('fresh', 'lovely fresh') }),
    basis: 'authoritative_transcript',
    referenceText: conversations.join(' '),
    referenceSegmentTexts: conversations,
  }).verdict, 'pass', 'intra-segment ASR insertions must not trip the segment-aware order check')

  // Regression on the real NCK1 shape (10 transcript segments): a one-step cyclic
  // rotation scores orderedBigramRecall = 0.9533 (far above 0.5) yet segmentOrderRecall
  // collapses, so the segment-aware gate rejects it.
  const tenSegments = Array.from({ length: 10 }, (_, index) => {
    const words = ['the', 'and', 'a', 'of', 'to', 'in', 'is', 'that', 'it', 'for']
    const fill = `conversation ${index + 1} about ${words[index]} topics discussed here in detail`
    return `${fill} ${fill} marker${index + 1}`.repeat(index + 1).trim()
  })
  const rotate = (array, k) => array.slice(k).concat(array.slice(0, k))
  const rotatedTen = compareListeningAudio({
    asr: asr({ transcriptText: rotate(tenSegments, 1).join(' '), durationSeconds: 90 }),
    basis: 'authoritative_transcript',
    referenceText: tenSegments.join(' '),
    referenceSegmentTexts: tenSegments,
  })
  assert.ok(rotatedTen.metrics.orderedBigramRecall >= 0.5, 'the real-shape rotation stays above the flat bigram floor')
  assert.ok(
    rotatedTen.metrics.segmentOrderRecall < minimumListeningSegmentOrderRecall,
    `10-segment rotation segmentOrderRecall ${rotatedTen.metrics.segmentOrderRecall} must fall below the floor`,
  )
  assert.equal(rotatedTen.verdict, 'review_required', 'a real NCK1-shape rotation must not be blessed')

  assert.equal(compareListeningAudio({
    asr: asr({
      transcriptText: 'A completely unrelated recording about cooking rice and repairing bicycles.',
    }),
    basis: 'authoritative_transcript',
    referenceText: transcript,
  }).verdict, 'review_required')
  assert.equal(compareListeningAudio({
    asr: asr({
      durationSeconds: 1_000,
      segments: [{
        ...asr().segments[0],
        endSeconds: 500,
      }],
    }),
    basis: 'authoritative_transcript',
    referenceText: transcript,
  }).verdict, 'review_required')
  assert.equal(compareListeningAudio({
    asr: asr({
      segments: [{ ...asr().segments[0], avgLogProbability: -1.5 }],
    }),
    basis: 'authoritative_transcript',
    referenceText: transcript,
  }).verdict, 'review_required')
  assert.equal(compareListeningAudio({
    asr: asr(),
    basis: 'listening_questions',
    referenceText: [
      'Where does the woman plan to meet her friend?',
      'What do they discuss about the train schedule and music performance?',
    ].join(' '),
  }).verdict, 'pass')

  // Publication anchor (assertListeningAudioSource): the canonical transcript
  // segment order from the live materialization is bound against the stored ASR, so
  // an old unordered-overlap receipt (or any stored ASR rotated relative to the
  // canonical questions) cannot bless a reordered recording. This is the
  // tamper-proof anchor because the segment order comes from the live
  // materialization, not the check receipt.
  const playbackDescriptor = { sha256: `sha256:${'c'.repeat(64)}`, byteLength: 1 }
  const capturedListening = (transcript) => ({
    state: 'captured',
    transcript: transcript.map((text) => ({ text })),
    questions: [],
    answers: [],
    timing: [],
  })
  const canonicalEvidence = (asrTranscriptText) => ({
    descriptors: new Map([['listening_audio_playback', playbackDescriptor]]),
    asr: { transcriptText: asrTranscriptText, durationSeconds: 12 },
    check: { comparisonReference: { basis: 'authoritative_transcript', text: transcriptSegments.join('\n') } },
  })
  assertListeningAudioSource(
    canonicalEvidence(transcriptSegments.join(' ')),
    capturedListening(transcriptSegments),
  )
  assert.throws(
    () => assertListeningAudioSource(
      canonicalEvidence([...transcriptSegments].reverse().join(' ')),
      capturedListening(transcriptSegments),
    ),
    /segment order/,
    'A stored ASR rotated against the canonical materialization segments must not be blessed at publication',
  )

  console.log('PASS listening MP3 decode, normalization, ASR comparison, safety receipt, and digest binding')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
