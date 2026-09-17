#!/usr/bin/env node
// verify-resource: source-only-import-ledger

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  makeSyntheticNck1SourceOnlyFixture,
} from '../test-fixtures/paper-import/nck1-source-only-v1/fixture.mjs'

const root = path.resolve(import.meta.dirname, '..')
const cliPath = path.join(root, 'scripts/import-pipeline/universal-nck1.mjs')
const reviewPath = path.join(root, 'scripts/import-pipeline/review.mjs')
const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-source-only-boundaries-'))
const fixture = makeSyntheticNck1SourceOnlyFixture(tempRoot)
const pdfSourceSetId = `source-set-boundary-pdf-${process.pid}`
const imageSourceSetId = `source-set-boundary-images-${process.pid}`
const pdfPaperId = `paper-source-only-pdf-${process.pid}`
const imagePaperId = `paper-source-only-images-${process.pid}`
const duplicatePaperId = `paper-source-only-duplicate-${process.pid}`
const mismatchPaperId = `paper-source-only-mismatch-${process.pid}`

function invoke(scriptPath, args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      QUESTION_BANK_IMPORT_OPS_ORIGIN: '',
      QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: '',
    },
  })
}

function run(...args) {
  const result = invoke(cliPath, args)
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}`)
  return result.stdout
}

function expectFailure(scriptPath, args, code) {
  const result = invoke(scriptPath, args)
  assert.notEqual(result.status, 0, `Expected failure: ${args.join(' ')}`)
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(code, 'u'))
}

function sourceOnlyDirectory(sourceSetId) {
  return path.join(root, 'imports', 'source-only', sourceSetId)
}

function paperDirectory(paperId) {
  return path.join(root, 'scripts/import-pipeline/papers', paperId)
}

try {
  run(
    'capture-source-only', pdfSourceSetId,
    '--paper-name', 'Synthetic PDF waiting for a key',
    '--provenance', 'anonymous synthetic question fixture',
    '--source', `question_source=${fixture.questionPdfPath}`,
  )
  run(
    'capture-source-only', imageSourceSetId,
    '--paper-name', 'Synthetic image pages waiting for a key',
    '--provenance', 'anonymous synthetic image fixture',
    '--source-page', `question_source:1=${fixture.questionImages[0]}`,
    '--source-page', `question_source:2=${fixture.questionImages[1]}`,
  )

  for (const operation of ['materialize', 'verify', 'build']) {
    expectFailure(
      cliPath,
      [operation, pdfSourceSetId],
      'NCK1_SOURCE_ONLY_MATERIALIZATION_FORBIDDEN',
    )
  }
  for (const operation of ['stage-ocr', 'confirm-ocr']) {
    expectFailure(
      cliPath,
      [operation, pdfSourceSetId, path.join(tempRoot, 'absent.json')],
      'NCK1_AUTHORITATIVE_ANSWERS_AWAITED',
    )
  }
  for (const operation of ['push', 'push-ocr', 'accept']) {
    expectFailure(
      reviewPath,
      [operation, pdfSourceSetId],
      'NCK1_AUTHORITATIVE_ANSWERS_AWAITED',
    )
  }
  expectFailure(
    reviewPath,
    ['publish', pdfSourceSetId],
    'NCK1_SOURCE_ONLY_PUBLICATION_FORBIDDEN',
  )
  assert.equal(existsSync(paperDirectory(pdfSourceSetId)), false)
  assert.equal(existsSync(path.join(sourceOnlyDirectory(pdfSourceSetId), 'materialization')), false)
  assert.equal(existsSync(path.join(sourceOnlyDirectory(pdfSourceSetId), 'canonical-evidence')), false)

  const pdfCapturePath = path.join(sourceOnlyDirectory(pdfSourceSetId), 'capture.json')
  const pdfCaptureBefore = readFileSync(pdfCapturePath)
  const pdfCapture = JSON.parse(pdfCaptureBefore)
  const pdfQuestion = pdfCapture.documents.find((document) =>
    document.role === 'question_source' && !document.renditionOf)
  const pdfQuestionPath = path.join(sourceOnlyDirectory(pdfSourceSetId), pdfQuestion.path)
  const pdfQuestionBefore = readFileSync(pdfQuestionPath)

  expectFailure(cliPath, [
    'attach-answers', pdfSourceSetId, mismatchPaperId,
    '--question-set-digest', `sha256:${'0'.repeat(64)}`,
    '--answer-provenance', 'synthetic mismatched key',
    '--source', `official_answers=${fixture.answerPdfPath}`,
  ], 'NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH')
  assert.equal(existsSync(paperDirectory(mismatchPaperId)), false)

  writeFileSync(pdfQuestionPath, Buffer.concat([pdfQuestionBefore, Buffer.from('drift')]))
  expectFailure(cliPath, [
    'attach-answers', pdfSourceSetId, mismatchPaperId,
    '--question-set-digest', pdfCapture.questionSetDigest,
    '--answer-provenance', 'synthetic key against drifted question',
    '--source', `official_answers=${fixture.answerPdfPath}`,
  ], 'NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH')
  writeFileSync(pdfQuestionPath, pdfQuestionBefore)
  assert.equal(existsSync(paperDirectory(mismatchPaperId)), false)

  assert.match(run(
    'attach-answers', pdfSourceSetId, pdfPaperId,
    '--question-set-digest', pdfCapture.questionSetDigest,
    '--answer-provenance', 'anonymous synthetic compact key',
    '--source', `official_answers=${fixture.answerPdfPath}`,
  ), /complete_source_set_created/u)
  assert.equal(readFileSync(pdfCapturePath).equals(pdfCaptureBefore), true)
  assert.equal(readFileSync(pdfQuestionPath).equals(pdfQuestionBefore), true)
  const pdfManifest = JSON.parse(readFileSync(
    path.join(paperDirectory(pdfPaperId), 'universal-source-manifest.json'),
    'utf8',
  ))
  assert.deepEqual(
    pdfManifest.documents.filter((document) => !document.renditionOf)
      .map((document) => document.role),
    ['question_source', 'official_answers'],
  )
  assert.equal(
    pdfManifest.documents.find((document) => document.role === 'question_source').sha256,
    pdfQuestion.sha256,
  )
  assert.equal(existsSync(path.join(paperDirectory(pdfPaperId), 'canonical-evidence')), false)
  assert.equal(
    existsSync(path.join(
      paperDirectory(pdfPaperId),
      'materialization/nck1-source-materialization-v1.json',
    )),
    false,
  )
  const pdfStatus = JSON.parse(run('source-only-status', pdfSourceSetId))
  assert.equal(pdfStatus.state, 'awaiting_authoritative_answers')
  assert.equal(pdfStatus.lifecycleState, 'complete_source_set_created')
  assert.equal(pdfStatus.successor.completeSourceSet.paperId, pdfPaperId)

  expectFailure(cliPath, [
    'attach-answers', pdfSourceSetId, duplicatePaperId,
    '--question-set-digest', pdfCapture.questionSetDigest,
    '--answer-provenance', 'duplicate synthetic key',
    '--source', `official_answers=${fixture.answerPdfPath}`,
  ], 'NCK1_ANSWER_ATTACHMENT_DUPLICATE')
  assert.equal(existsSync(paperDirectory(duplicatePaperId)), false)

  const imageCapturePath = path.join(sourceOnlyDirectory(imageSourceSetId), 'capture.json')
  const imageCaptureBefore = readFileSync(imageCapturePath)
  const imageCapture = JSON.parse(imageCaptureBefore)
  assert.match(run(
    'attach-answers', imageSourceSetId, imagePaperId,
    '--question-set-digest', imageCapture.questionSetDigest,
    '--answer-provenance', 'anonymous synthetic answer image',
    '--source-page', `official_answers:1=${fixture.answerImages[0]}`,
  ), /complete_source_set_created/u)
  assert.equal(readFileSync(imageCapturePath).equals(imageCaptureBefore), true)
  const imageManifest = JSON.parse(readFileSync(
    path.join(paperDirectory(imagePaperId), 'universal-source-manifest.json'),
    'utf8',
  ))
  assert.deepEqual(
    imageManifest.documents.filter((document) => !document.renditionOf)
      .map((document) => document.role),
    ['question_source', 'official_answers'],
  )
  assert.deepEqual(
    imageManifest.documents.find((document) => document.role === 'question_source')
      .pages.map((page) => page.page),
    [1, 2],
  )
  assert.equal(existsSync(path.join(sourceOnlyDirectory(imageSourceSetId), 'successor.json')), true)
} finally {
  for (const sourceSetId of [pdfSourceSetId, imageSourceSetId]) {
    rmSync(sourceOnlyDirectory(sourceSetId), { recursive: true, force: true })
  }
  for (const paperId of [
    pdfPaperId,
    imagePaperId,
    duplicatePaperId,
    mismatchPaperId,
  ]) {
    rmSync(paperDirectory(paperId), { recursive: true, force: true })
  }
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('verify-universal-nck1-source-only-boundaries: PASS')
