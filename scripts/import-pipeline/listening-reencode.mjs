#!/usr/bin/env node
// Pure re-encoding: no inference, silence measurement, rule evaluation, active
// sidecar installation or submission. Old attempts and Owner receipts stay exact.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { LISTENING_REVIEW_VERSION, assertListeningUploadBudget } from '../../shared/paper-canonical/listeningRuleEvidence.mjs'
import { validateListeningReview } from '../../server/paper-import/listeningReview.mjs'
import { assertListeningDiskSpace } from './listening-segment.mjs'
import { expectedListeningReadings } from './lib-listening-segment-rule.mjs'
import { loadListeningResult, writeListeningEvidence } from './lib-listening-evidence.mjs'

const json = file => JSON.parse(readFileSync(file, 'utf8'))
const write = (file, value) => writeFileSync(file, `${JSON.stringify(value)}\n`, { flag: 'wx' })
const fail = detail => { throw new Error(`LISTENING_REENCODE_BINDING_INVALID: ${detail}`) }
const inside = (parent, child) => {
  const relative = path.relative(parent, child)
  return !relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}
const physical = file => existsSync(file) ? realpathSync(file)
  : path.join(physical(path.dirname(file)), path.basename(file))

export function reencodeListeningAttempt({ paperDir, attempt: oldAttempt, output, request, ownerReview = null }) {
  if ([oldAttempt, paperDir].some(parent => inside(realpathSync(parent), physical(path.resolve(output))))) {
    fail('output must be outside the retained attempt and active paper')
  }
  const oldInput = json(path.join(oldAttempt, 'input.json'))
  const previous = json(path.join(oldAttempt, 'review.json'))
  const reviewFile = ownerReview || path.join(oldAttempt, 'review.json')
  const reviewBytes = readFileSync(reviewFile), review = JSON.parse(reviewBytes)
  const manifest = json(path.join(paperDir, 'universal-source-manifest.json'))
  const sourceBytes = readFileSync(path.resolve(paperDir, manifest.materializationPath))
  const source = JSON.parse(sourceBytes), transcript = request.transcript || source.listening.transcript
  const instructions = request.sourceInstructions || source.sourcePresentation?.instructions || []
  if (digestJson(oldInput.subject) !== digestJson(request.report.subject)
    || digestJson(previous.subject) !== digestJson(oldInput.subject)
    || digestJson(review.subject) !== digestJson(oldInput.subject)
    || digestJson(transcript) !== oldInput.subject.transcriptDigest
    || sha256(Buffer.from(JSON.stringify(transcript))) !== oldInput.sourceTextSha256
    || sha256(sourceBytes) !== oldInput.materializationSha256
    || sha256(readFileSync(path.join(paperDir, 'materialization/listening-audio/playback.mp3'))) !== oldInput.audioSha256
    || sha256(readFileSync(path.join(oldAttempt, 'silence.json'))) !== oldInput.silenceSha256) fail('input changed')
  const apple = loadListeningResult(path.join(oldAttempt, 'apple-rule.json'))
  const resolved = loadListeningResult(path.join(oldAttempt, 'rule-result.json'))
  if (transcript.some(group => {
    const old = apple.groups.find(item => item.segmentId === group.segmentId)
    return !old || old.sourceText !== group.text
      || digestJson(old.sources) !== digestJson(expectedListeningReadings(group, instructions).sources)
  })) fail('instructions changed')
  const retained = []
  // Validate both the original attempt and the optional Owner override. We never
  // authorize a new revision merely because an old local JSON was parseable.
  const all = new Map()
  for (const file of [...previous.evidence, ...review.evidence]) {
    if (all.has(file.path) && digestJson(all.get(file.path)) !== digestJson(file)) fail(`conflicting descriptor: ${file.path}`)
    all.set(file.path, file)
  }
  for (const file of all.values()) {
    if (!/^listening-review-evidence\/[a-zA-Z0-9._-]+\.json$/u.test(file.path)) fail('evidence path')
    const sourceFile = path.join(oldAttempt, file.path)
    const from = existsSync(sourceFile) ? sourceFile : path.join(paperDir, file.path)
    const bytes = readFileSync(from)
    if (sha256(bytes) !== file.sha256 || bytes.length !== file.byteLength) fail(`evidence changed: ${file.path}`)
    const record = JSON.parse(bytes)
    if (file.kind === 'review_notes' && record.rule && record.groups) continue
    // Full diagnostics still refer to the original observations even when an
    // Owner override only lists its own human comparison notes.
    retained.push({ file, from })
  }
  mkdirSync(output, { recursive: true })
  assertListeningDiskSpace(output)
  const attempt = path.join(output, `attempt-reencoded-${randomUUID()}`)
  mkdirSync(attempt)
  mkdirSync(path.join(attempt, 'listening-review-evidence'))
  for (const { file, from } of retained) copyFileSync(from, path.join(attempt, file.path))
  copyFileSync(path.join(oldAttempt, 'silence.json'), path.join(attempt, 'silence.json'))
  // The Owner locator also consumes these raw, timestamped fallback streams.
  for (const directory of readdirSync(oldAttempt).filter(name => /^whisper-\d+$/u.test(name))) {
    for (const name of readdirSync(path.join(oldAttempt, directory)).filter(name => /^metadata-.*\.json$/u.test(name))) {
      mkdirSync(path.join(attempt, directory), { recursive: true })
      copyFileSync(path.join(oldAttempt, directory, name), path.join(attempt, directory, name))
    }
  }
  const input = { ...oldInput, instructionsSha256: digestJson(instructions),
    questionsSha256: digestJson(source.listening.questions || []),
    reencodedFrom: { attempt: path.resolve(oldAttempt),
      inputSha256: sha256(readFileSync(path.join(oldAttempt, 'input.json'))),
      attemptReviewSha256: sha256(readFileSync(path.join(oldAttempt, 'review.json'))),
      navigationReviewSha256: sha256(reviewBytes), navigationReviewPath: path.resolve(reviewFile),
      inference: 'not_run', ruleEvaluation: 'not_run' } }
  write(path.join(attempt, 'input.json'), input)
  const summary = writeListeningEvidence({ attempt, apple, resolved, input,
    rawEvidence: retained.map(item => item.file) })
  const relative = `listening-review-evidence/reencoded-${randomUUID()}-rule.json`
  write(path.join(attempt, relative), summary)
  const bytes = readFileSync(path.join(attempt, relative))
  const next = { ...review, schemaVersion: LISTENING_REVIEW_VERSION,
    evidence: [...retained.map(item => item.file), { path: relative, sha256: sha256(bytes), byteLength: bytes.length,
      kind: 'review_notes', window: null, settings: null }] }
  assertListeningUploadBudget(next.evidence)
  validateListeningReview(attempt, next, request.report.subject, transcript)
  write(path.join(attempt, 'review.json'), next)
  return { attempt, review: path.join(attempt, 'review.json'), summaryBytes: bytes.length,
    navigationUnchanged: digestJson(next.groups) === digestJson(review.groups), inference: 'not_run', ruleEvaluation: 'not_run' }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = name => process.argv[process.argv.indexOf(name) + 1]
  if (['--paper-dir', '--attempt', '--output', '--request'].some(name => !process.argv.includes(name))) {
    throw new Error('Required: --paper-dir --attempt --output --request [--owner-review]')
  }
  console.log(JSON.stringify(reencodeListeningAttempt({ paperDir: path.resolve(option('--paper-dir')),
    attempt: path.resolve(option('--attempt')), output: path.resolve(option('--output')),
    request: json(option('--request')),
    ownerReview: process.argv.includes('--owner-review') ? path.resolve(option('--owner-review')) : null })))
}
