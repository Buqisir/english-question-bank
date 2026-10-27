#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  assertListeningAudioManifest,
  assertListeningAudioSource,
  listeningSegmentOrderRecall,
  minimumListeningSegmentOrderRecall,
  compareFirstListeningDialogue,
  firstListeningDialogue,
  listeningAudioAttachmentDescriptors,
} from '../server/paper-import/listeningAudioEvidence.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  compareListeningAudio,
  finalizeListeningAudio,
  stageListeningAudio,
} from './import-pipeline/listening-audio.mjs'
import { assertListeningPlaybackUi, firstListeningSectionRange } from '../shared/paper-canonical/listeningPlayback.mjs'
import { mockPaperCoverName } from '../shared/paper-canonical/listeningPresentation.mjs'
import { validateListeningReview, readListeningReview, reviewedPlaybackSegments } from '../server/paper-import/listeningReview.mjs'
import { productInputDigest } from '../server/paper-import/frozenProducts.mjs'
import { withListeningRuleFixture } from './lib/listeningRuleEvidenceFixture.mjs'

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
  const navigationRoot = path.join(tempRoot, 'navigation')
  mkdirSync(path.join(navigationRoot, 'listening-review-evidence'), { recursive: true })
  json(path.join(navigationRoot, 'listening-review-evidence/window.json'), { segments: ['fixture evidence'] })
  const evidenceBytes = readFileSync(path.join(navigationRoot, 'listening-review-evidence/window.json'))
  const navigationTranscript = [
    { segmentId: 'group-1', questionNumbers: [1], text: 'First dialogue', source: { paragraph: 1 } },
    { segmentId: 'group-2', questionNumbers: [2], text: 'Second dialogue', source: { paragraph: 2 } },
  ]
  const subject = { paperId, sourceDigest: `sha256:${'a'.repeat(64)}`, candidateDigest: `sha256:${'b'.repeat(64)}`,
    originalAudioSha256: `sha256:${'c'.repeat(64)}`, playbackAudioSha256: `sha256:${'d'.repeat(64)}`,
    durationSeconds: 90, timebase: 'normalized_playback_seconds', transcriptDigest: digestJson(navigationTranscript) }
  const navigationReview = {
    schemaVersion: 'listening-review-v2', subject, reviewedBy: 'import_agent', reviewedAt: '2026-10-16T00:00:00.000Z',
    method: 'asr_source_comparison', untrustedContentHandledAsData: true,
    scope: { purpose: 'teacher_navigation', verbatim: 'not_certified', wholeRecordingContent: 'not_certified' },
    evidence: [{ path: 'listening-review-evidence/window.json', sha256: sha256(evidenceBytes), byteLength: evidenceBytes.length,
      kind: 'asr_window', window: { startSeconds: 0, endSeconds: 90 },
      settings: { engine: 'fixture', model: 'fixture', language: 'en', vad: false, computeType: 'fixture' } }],
    groups: navigationTranscript.map((group, index) => ({ segmentId: group.segmentId, questionNumbers: group.questionNumbers,
      decision: 'usable', reason: 'Fixture review', limits: ['Not verbatim certification'],
      playback: { startSeconds: 3 + index * 40, endSeconds: 31 + index * 40 },
      occurrences: [{ startSeconds: 7 + index * 40, endSeconds: 28 + index * 40,
        evidencePaths: ['listening-review-evidence/window.json'] }] })),
  }
  assert.equal(readListeningReview(navigationRoot, subject, navigationTranscript), null)
  assert.deepEqual(reviewedPlaybackSegments(null), [], 'No positional fallback without review')
  const validateNavigation = review => validateListeningReview(navigationRoot,
    withListeningRuleFixture(navigationRoot, review, navigationTranscript), subject, navigationTranscript)
  const checkedNavigation = validateNavigation(navigationReview)
  assert.deepEqual(reviewedPlaybackSegments(checkedNavigation).map(group => [group.firstQuestionId, group.startSeconds, group.endSeconds]),
    [['question:listening:1', 3, 31], ['question:listening:2', 43, 71]])
  const partial = structuredClone(navigationReview)
  Object.assign(partial.groups[0], { decision: 'review_required', playback: null, occurrences: [] })
  assert.deepEqual(reviewedPlaybackSegments(validateNavigation(partial)).map(group => group.segmentId), ['group-2'])
  for (const mutate of [
    review => { review.subject.playbackAudioSha256 = `sha256:${'e'.repeat(64)}` },
    review => { review.groups.reverse() },
    review => { review.groups.pop() },
    review => { review.groups[1].playback.startSeconds = 30 },
    review => { review.groups[0].occurrences.push(structuredClone(review.groups[0].occurrences[0])) },
    review => { review.groups[0].playback.endSeconds = 27 },
    review => { review.groups[0].decision = 'review_required' },
    review => { review.evidence[0].window.endSeconds = 60 },
    review => { review.evidence[0].path = '../window.json' },
    review => { review.evidence[0].sha256 = `sha256:${'f'.repeat(64)}` },
    review => { review.instructionCorrection = { after: '读两遍' } },
  ]) {
    const invalid = structuredClone(navigationReview)
    mutate(invalid)
    assert.throws(() => validateNavigation(invalid))
  }
  json(path.join(navigationRoot, 'config.json'), { paperId })
  json(path.join(navigationRoot, 'listening-review-v1.json'), navigationReview)
  const printFiles = [{ path: 'config.json', role: 'config', mediaType: 'application/json' }]
  const originalPrintDigest = productInputDigest(navigationRoot, printFiles)
  assert.equal(productInputDigest(navigationRoot, [...printFiles, ...checkedNavigation.files], checkedNavigation), originalPrintDigest)
  json(path.join(navigationRoot, 'config.json'), { paperId, changed: true })
  assert.notEqual(productInputDigest(navigationRoot, [...printFiles, ...checkedNavigation.files], checkedNavigation), originalPrintDigest)
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
    true,
    'invalid ASR preserves original audio for diagnosis without automatic retry',
  )
  assert.ok(existsSync(path.join(badAsrPaperDir, 'materialization/listening-audio/failure.json')))

  // Version-independent regression for a decoder that logs an error but exits 0.
  const decoderBin = path.join(tempRoot, 'decoder-bin')
  const decoderErrorDir = path.join(tempRoot, 'decoder-error')
  execFileSync('mkdir', ['-p', decoderBin, decoderErrorDir])
  writeFileSync(path.join(decoderBin, 'ffmpeg'), '#!/bin/sh\nprintf "synthetic decoder failure\\n" >&2\nexit 0\n')
  execFileSync('chmod', ['+x', path.join(decoderBin, 'ffmpeg')])
  json(path.join(decoderErrorDir, 'universal-source-manifest.json'), sourceManifest(paperId))
  const originalPath = process.env.PATH
  try {
    process.env.PATH = `${decoderBin}:${originalPath}`
    assert.throws(() => stageListeningAudio({ paperDir: decoderErrorDir, paperId,
      sourcePath: sourceAudio, asrFixturePath: asrFixture }),
    (error) => error.code === 'LISTENING_AUDIO_DECODE_FAILED' && /synthetic decoder failure/.test(error.message))
  } finally {
    process.env.PATH = originalPath
  }
  assert.match(JSON.parse(readFileSync(path.join(decoderErrorDir, 'materialization/listening-audio/failure.json'))).message,
    /synthetic decoder failure/)
  assert.ok(!existsSync(path.join(decoderErrorDir, 'materialization/listening-audio/asr-v1.json')))

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
  // Reconstruct historical v1 bytes to exercise unchanged whole-file admission.
  const legacyAsr = JSON.parse(readFileSync(asrPath, 'utf8'))
  assert.equal(legacyAsr.schemaVersion, 'listening-audio-asr-v2')
  legacyAsr.schemaVersion = 'listening-audio-asr-v1'
  delete legacyAsr.scope
  json(asrPath, legacyAsr)
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

  const quickDir = path.join(tempRoot, 'quick')
  execFileSync('mkdir', ['-p', quickDir])
  json(path.join(quickDir, 'universal-source-manifest.json'), sourceManifest(paperId))
  const firstText = 'Where will you meet your sister tomorrow morning? I will meet her beside the central library before lunch.'
  const quickListening = { state: 'captured', transcript: [
    { segmentId: 'q1', questionNumbers: [1], text: firstText, source: { documentId: 'answers', paragraph: 4 } },
    { segmentId: 'q2', questionNumbers: [2], text: 'The second dialogue concerns a concert.', source: { documentId: 'answers', paragraph: 5 } },
  ] }
  const quickText = `Instructions and a practice example about trains. Now the test begins. Text one. ${firstText} Text two. Completely different later content.`
  const quickAsr = (text = quickText) => asr({
    schemaVersion: 'listening-audio-asr-v2', durationSeconds: 240,
    scope: { kind: 'first_dialogue', startSeconds: 0, endSeconds: 180, remainder: 'unchecked' },
    transcriptText: text, segments: [{ ...asr().segments[0], text, endSeconds: 60 }],
  })
  const dialogue = firstListeningDialogue(quickListening)
  const match = (text) => compareFirstListeningDialogue(quickAsr(text), dialogue)
  const misleadingExample = `Listen to this example before the test begins. Question one. ${firstText} Question two. This was only the example. Now the test begins. Text one. An unrelated formal dialogue. Text two.`
  assert.equal(match(quickText).verdict, 'partial_pass', 'different later content must never imply whole-file pass')
  assert.equal(match(quickText).summary, '首段快速匹配、后续内容未核对')
  const unlocalized = match(`第一题。${firstText} 第二题。`)
  assert.equal(unlocalized.verdict, 'review_required')
  assert.deepEqual(unlocalized.flaggedRanges.map(flag => flag.code), ['LISTENING_AUDIO_EXTENDED_CHECK_REQUIRED'],
    'An unrecognized announcement is a localization failure, not evidence of a different recording')
  assert.ok(match('Text one. A completely unrelated dialogue about a delayed flight. Text two.')
    .flaggedRanges.some(flag => flag.code === 'LISTENING_AUDIO_TRANSCRIPT_MISMATCH'))
  for (const text of [
    misleadingExample,
    `Example: ${firstText} Text one. A different topic. Text two.`,
    `Instructions: ${firstText}`,
    `Example question one. ${firstText} Question two.`,
    `Text one. ${firstText.slice(0, -20)}`,
    `Text one. ${firstText.slice(0, -20)} Text two.`,
    `Text one. Completely unrelated content. Text two.`,
  ]) assert.notEqual(match(text).verdict, 'partial_pass', text)
  const unclear = quickAsr()
  unclear.segments[0].avgLogProbability = -1.5
  assert.equal(compareFirstListeningDialogue(unclear, dialogue).verdict, 'review_required')
  assert.throws(() => firstListeningDialogue({ ...quickListening, transcript: [{ ...dialogue, questionNumbers: [0] }] }), /question 1/)

  const longAudio = path.join(tempRoot, 'long.mp3')
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=240', '-codec:a', 'libmp3lame', longAudio])
  const corruptTail = readFileSync(longAudio)
  const packets = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_packets',
    '-show_entries', 'packet=pos,size,pts_time', '-of', 'json', longAudio], { encoding: 'utf8' })).packets
  const latePacket = packets.find((packet) => Number(packet.pts_time) >= 210)
  assert.ok(latePacket, 'synthetic file contains an audio frame beyond the ASR sample')
  // Preserve the frame header but invalidate side information (big_values).
  // Zero-filled gaps may simply be skipped by newer FFmpeg demuxers.
  corruptTail.fill(0xff, Number(latePacket.pos) + 4, Number(latePacket.pos) + Number(latePacket.size))
  const corruptPath = path.join(tempRoot, 'corrupt-tail.mp3')
  writeFileSync(corruptPath, corruptTail)
  // The container and opening remain readable; only full-file decode catches it.
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', corruptPath])
  const corruptDir = path.join(tempRoot, 'corrupt')
  execFileSync('mkdir', ['-p', corruptDir])
  json(path.join(corruptDir, 'universal-source-manifest.json'), sourceManifest(paperId))
  assert.throws(() => stageListeningAudio({ paperDir: corruptDir, paperId, sourcePath: corruptPath, asrFixturePath: asrFixture }),
    (error) => error.code === 'LISTENING_AUDIO_DECODE_FAILED')
  assert.ok(!existsSync(path.join(corruptDir, 'materialization/listening-audio/asr-v1.json')))
  // Execute the real Python crop path with a model stub: no model download or
  // paid call, and fail if the model ever receives the full 240-second file.
  const pythonResult = execFileSync('python3', ['-c', `
import sys, types, runpy, wave, importlib.metadata
calls = []
class Model:
    def __init__(self, *args, **kwargs): pass
    def transcribe(self, audio, **kwargs):
        with wave.open(audio) as sample:
            assert sample.getnframes() / sample.getframerate() == 180
        calls.append(audio)
        return [], types.SimpleNamespace(language='en', language_probability=1)
sys.modules['faster_whisper'] = types.SimpleNamespace(WhisperModel=Model)
importlib.metadata.version = lambda name: 'fixture'
sys.argv = [sys.argv[1], sys.argv[2]]
runpy.run_path(sys.argv[0], run_name='__main__')
assert len(calls) == 1
`, path.join(import.meta.dirname, 'import-pipeline/transcribe-listening.py'), longAudio], { encoding: 'utf8' })
  assert.equal(JSON.parse(pythonResult).engine.version, 'fixture')
  json(asrFixture, quickAsr())
  const quickStage = stageListeningAudio({ paperDir: quickDir, paperId, sourcePath: longAudio, asrFixturePath: asrFixture })
  assert.ok(quickStage.durationSeconds >= 240, 'duration remains full playback duration')
  assert.equal(quickStage.scope.endSeconds, 180)
  json(path.join(quickDir, 'materialization/nck1-source-materialization-v1.json'), { listening: quickListening })
  const quickReview = { schemaVersion: 'listening-audio-content-review-v1', paperId,
    reviewedBy: 'import_agent', reviewedAt: '2026-09-01T00:00:00.000Z',
    reviewedTranscriptSha256: quickStage.asrSha256, untrustedContentHandledAsData: true,
    verdict: 'pass', scope: quickStage.scope, summary: 'Opening only; later audio unchecked.', flaggedRanges: [] }
  json(reviewPath, quickReview)
  assert.throws(() => finalizeListeningAudio({ paperDir: quickDir, paperId, reviewPath, referencePath }), /materialized question 1/)
  const quickAsrPath = path.join(quickDir, 'materialization/listening-audio/asr-v1.json')
  const goodAsrBytes = readFileSync(quickAsrPath)
  const truncated = JSON.parse(goodAsrBytes)
  truncated.segments[0].text = `Text one. ${firstText.slice(0, -20)}`
  truncated.transcriptText = truncated.segments[0].text
  json(quickAsrPath, truncated)
  json(reviewPath, { ...quickReview, reviewedTranscriptSha256: sha256(readFileSync(quickAsrPath)) })
  assert.throws(() => finalizeListeningAudio({ paperDir: quickDir, paperId, reviewPath }), /needs review/)
  const failedCheck = JSON.parse(readFileSync(path.join(quickDir, 'materialization/listening-audio/check-v1.json')))
  assert.ok(failedCheck.flaggedRanges.some((flag) => flag.code === 'LISTENING_AUDIO_EXTENDED_CHECK_REQUIRED'))
  assert.equal(JSON.parse(readFileSync(path.join(quickDir, 'universal-source-manifest.json'))).schemaVersion, 'universal-nck1-source-manifest-v1')
  const exampleAsr = JSON.parse(goodAsrBytes)
  exampleAsr.transcriptText = misleadingExample
  exampleAsr.segments[0].text = misleadingExample
  json(quickAsrPath, exampleAsr)
  json(reviewPath, { ...quickReview, reviewedTranscriptSha256: sha256(readFileSync(quickAsrPath)) })
  assert.throws(() => finalizeListeningAudio({ paperDir: quickDir, paperId, reviewPath }), /needs review/)
  const exampleCheckPath = path.join(quickDir, 'materialization/listening-audio/check-v1.json')
  const exampleCheck = JSON.parse(readFileSync(exampleCheckPath))
  assert.ok(exampleCheck.flaggedRanges.some((flag) => flag.code === 'LISTENING_AUDIO_EXAMPLE_NOT_DIALOGUE'))
  const unfinalized = JSON.parse(readFileSync(path.join(quickDir, 'universal-source-manifest.json')))
  assert.equal(unfinalized.schemaVersion, 'universal-nck1-source-manifest-v1')
  exampleCheck.comparison.verdict = 'partial_pass'
  exampleCheck.comparison.flaggedRanges = []
  exampleCheck.flaggedRanges = []
  delete exampleCheck.evidenceDigest
  exampleCheck.evidenceDigest = digestJson(exampleCheck)
  json(exampleCheckPath, exampleCheck)
  assert.throws(() => assertListeningAudioManifest(quickDir, {
    ...unfinalized, schemaVersion: 'universal-nck1-source-manifest-v2',
    attachments: listeningAudioAttachmentDescriptors(quickDir),
  }), /recomputed comparison/)
  writeFileSync(quickAsrPath, goodAsrBytes)
  json(reviewPath, quickReview)
  const quickResult = finalizeListeningAudio({ paperDir: quickDir, paperId, reviewPath })
  assert.equal(quickResult.comparisonVerdict, 'partial_pass')
  const quickManifest = JSON.parse(readFileSync(path.join(quickDir, 'universal-source-manifest.json')))
  const quickEvidence = assertListeningAudioManifest(quickDir, quickManifest)
  assert.equal(assertListeningAudioSource(quickEvidence, quickListening).durationSeconds, quickStage.durationSeconds)
  for (const field of ['text', 'segmentId', 'source', 'questionNumbers']) {
    const changed = structuredClone(quickListening)
    changed.transcript[0][field] = field === 'source' ? { documentId: 'other' }
      : field === 'questionNumbers' ? [2] : 'changed'
    assert.throws(() => assertListeningAudioSource(quickEvidence, changed), /source binding|question 1/)
  }
  const quickCheckPath = path.join(quickDir, 'materialization/listening-audio/check-v1.json')
  const quickCheck = JSON.parse(readFileSync(quickCheckPath))
  for (const mutate of [
    (receipt) => { delete receipt.scope },
    (receipt) => { receipt.scope.remainder = 'checked' },
    (receipt) => { receipt.comparison.verdict = 'pass' },
    (receipt) => { receipt.contentSafety.scope.endSeconds = 240 },
    (receipt) => { receipt.comparison.metrics.orderedBigramRecall = 0.99 },
    (receipt) => { receipt.schemaVersion = 'listening-audio-check-v1' },
  ]) {
    const changed = structuredClone(quickCheck)
    mutate(changed)
    delete changed.evidenceDigest
    changed.evidenceDigest = digestJson(changed)
    json(quickCheckPath, changed)
    const changedManifest = { ...quickManifest, attachments: listeningAudioAttachmentDescriptors(quickDir) }
    assert.throws(() => assertListeningAudioManifest(quickDir, changedManifest), /scope|comparison|not bound/)
  }
  json(quickCheckPath, { ...quickCheck, evidenceDigest: `sha256:${'0'.repeat(64)}` })
  assert.throws(() => assertListeningAudioManifest(quickDir, {
    ...quickManifest, attachments: listeningAudioAttachmentDescriptors(quickDir),
  }), /digest/)
  json(quickCheckPath, quickCheck)
  const changedAsr = JSON.parse(goodAsrBytes)
  assert.throws(() => compareListeningAudio({ asr: changedAsr,
    basis: 'authoritative_transcript', referenceText: firstText }), /Partial ASR/)
  changedAsr.scope.endSeconds = 240
  json(quickAsrPath, changedAsr)
  assert.throws(() => assertListeningAudioManifest(quickDir, {
    ...quickManifest, attachments: listeningAudioAttachmentDescriptors(quickDir),
  }), /scope/)
  const segments = [1, 2, 3, 4, 5].map((number, index) => ({
    segmentId: `segment:${number}`, questionNumbers: [number], firstQuestionId: `question:listening:${number}`,
    startSeconds: 0.12 + index * 0.3, endSeconds: 0.29 + index * 0.3,
  }))
  const range = firstListeningSectionRange([...segments].reverse(), [1, 2, 3, 4, 5])
  assert.equal(range.startSeconds, 0.12)
  assert.equal(range.endSeconds, 1.49)
  assert.equal(range.segments.length, 5, 'preserve four intervening pauses, do not concatenate question clips')
  assert.equal(firstListeningSectionRange(segments.slice(1), [1, 2, 3, 4, 5]), null)
  assert.equal(firstListeningSectionRange([...segments, segments[0]], [1, 2, 3, 4, 5]), null)
  assert.equal(firstListeningSectionRange(segments, [6, 7, 8, 9, 10]), null)
  assert.equal(firstListeningSectionRange([{ ...segments[0], endSeconds: .5 }, ...segments.slice(1)], [1, 2, 3, 4, 5]), null)
  const binding = { playbackAudioSha256: sha256(Buffer.from('playback fixture')), durationSeconds: 2.17 }
  for (const metadata of [binding, { waveform: { ...binding, peaks: [-1], reference: 0 } }]) {
    const ui = assertListeningPlaybackUi({ ...metadata, segments, url: '/untrusted', sha256: 'wrong' },
      binding.playbackAudioSha256, binding.durationSeconds)
    assert.deepEqual(ui, { segments }, 'only timing survives, including historical waveform containers')
    assert.throws(() => assertListeningPlaybackUi({ ...metadata, segments: [...segments, segments[0]] },
      binding.playbackAudioSha256, binding.durationSeconds))
    assert.throws(() => assertListeningPlaybackUi({ ...metadata, segments },
      sha256(Buffer.from('different playback')), binding.durationSeconds), /does not match audio/)
    assert.throws(() => assertListeningPlaybackUi({ ...metadata, segments },
      binding.playbackAudioSha256, 5), /does not match audio/)
  }
  assert.equal(existsSync(path.join(paperDir, 'materialization/listening-audio/waveform-v1.json')), false,
    'new audio preparation does not generate waveform files')
  assert.equal(mockPaperCoverName('模拟题', '不含模拟二字的卷名'), '不含模拟二字的卷名')
  assert.equal(mockPaperCoverName('真题', '名字恰好包含模拟二字'), null)
  assert.equal(mockPaperCoverName(undefined, '未知来源'), null)
  console.log('PASS audio evidence, independent timing with legacy/new audio binding, no waveform generation, first-section coverage/pauses, mock-name source classification')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
