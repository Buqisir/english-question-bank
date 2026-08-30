#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
} from '../server/paper-import/nck1ImageSourceBundle.mjs'
import {
  makeSyntheticNck1SourceOnlyFixture,
} from '../test-fixtures/paper-import/nck1-source-only-v1/fixture.mjs'

const root = path.resolve(import.meta.dirname, '..')
const cliPath = path.join(root, 'scripts/import-pipeline/universal-nck1.mjs')
const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-source-only-intake-'))
const fixture = makeSyntheticNck1SourceOnlyFixture(tempRoot)
const sourceSetIds = {
  docx: `source-set-fixture-docx-${process.pid}`,
  pdf: `source-set-fixture-pdf-${process.pid}`,
  images: `source-set-fixture-images-${process.pid}`,
}

function run(...args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}`)
  return result.stdout
}

function sourceOnlyDirectory(sourceSetId) {
  return path.join(root, 'imports', 'source-only', sourceSetId)
}

try {
  assert.match(run(
    'capture-source-only', sourceSetIds.docx,
    '--paper-name', 'Synthetic DOCX awaiting answers',
    '--provenance', 'anonymous synthetic fixture',
    '--source', `question_source=${fixture.questionDocxPath}`,
  ), /NCK1_AUTHORITATIVE_ANSWERS_AWAITED/u)
  assert.match(run(
    'capture-source-only', sourceSetIds.pdf,
    '--paper-name', 'Synthetic PDF awaiting answers',
    '--provenance', 'anonymous synthetic fixture',
    '--source', `question_source=${fixture.questionPdfPath}`,
  ), /NCK1_AUTHORITATIVE_ANSWERS_AWAITED/u)
  assert.match(run(
    'capture-source-only', sourceSetIds.images,
    '--paper-name', 'Synthetic image pages awaiting answers',
    '--provenance', 'anonymous synthetic fixture',
    '--source-page', `question_source:1=${fixture.questionImages[0]}`,
    '--source-page', `question_source:2=${fixture.questionImages[1]}`,
  ), /NCK1_AUTHORITATIVE_ANSWERS_AWAITED/u)

  for (const [carrier, sourceSetId] of Object.entries(sourceSetIds)) {
    const directory = sourceOnlyDirectory(sourceSetId)
    const capturePath = path.join(directory, 'capture.json')
    const captureBytes = readFileSync(capturePath)
    const status = JSON.parse(run('source-only-status', sourceSetId))
    assert.equal(status.schemaVersion, 'universal-nck1-source-only-capture-v1')
    assert.equal(status.sourceSetId, sourceSetId)
    assert.equal(status.state, 'awaiting_authoritative_answers')
    assert.equal(status.lifecycleState, 'awaiting_authoritative_answers')
    assert.equal(status.reasonCode, 'NCK1_AUTHORITATIVE_ANSWERS_AWAITED')
    assert.match(status.questionSetDigest, /^sha256:[a-f0-9]{64}$/u)
    assert.match(status.captureDigest, /^sha256:[a-f0-9]{64}$/u)
    assert.equal(status.successor, null)
    assert(status.documents.every((document) => document.role === 'question_source'))
    assert.equal('materializationPath' in status, false)
    assert.equal('canonicalRequestPath' in status, false)
    assert.equal(JSON.stringify(status).includes('official_answers'), false)
    assert.equal(JSON.stringify(status).includes('answerKey'), false)
    assert.equal(readFileSync(capturePath).equals(captureBytes), true)
    assert.equal(
      execFileSync('git', ['check-ignore', path.relative(root, directory)], {
        cwd: root,
        encoding: 'utf8',
      }).trim().length > 0,
      true,
      `${carrier} source-only intake must remain gitignored`,
    )
  }

  const imageStatus = JSON.parse(run('source-only-status', sourceSetIds.images))
  const imageBundle = imageStatus.documents.find((document) =>
    document.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE)
  assert(imageBundle)
  assert.deepEqual(imageBundle.pages.map((page) => page.page), [1, 2])
  assert(imageBundle.pages.every((page) =>
    page.pixelWidth === 96
    && page.pixelHeight === 144
    && /^sha256:[a-f0-9]{64}$/u.test(page.sha256)))
  assert.equal(
    Buffer.compare(
      readFileSync(path.join(sourceOnlyDirectory(sourceSetIds.images), imageBundle.pages[0].path)),
      readFileSync(fixture.questionImages[0]),
    ),
    0,
  )

  const listed = JSON.parse(run('list-source-only')).sourceOnly
  for (const sourceSetId of Object.values(sourceSetIds)) {
    assert(listed.some((item) =>
      item.sourceSetId === sourceSetId
      && item.lifecycleState === 'awaiting_authoritative_answers'))
  }
} finally {
  for (const sourceSetId of Object.values(sourceSetIds)) {
    rmSync(sourceOnlyDirectory(sourceSetId), { recursive: true, force: true })
  }
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('verify-universal-nck1-source-only-intake: PASS')
