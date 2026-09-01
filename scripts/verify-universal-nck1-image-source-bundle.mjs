#!/usr/bin/env node
// verify-resource: browser-render

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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
  compileNck1MaterializationCandidatePreview,
  importCanonicalCandidate,
} from '../shared/paper-canonical/compiler.mjs'
import {
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
  assertNck1ImageBundlePageArtifacts,
  buildNck1ImageSourceBundle,
  inspectNck1SourceImage,
  parseNck1ImageSourceBundle,
} from '../server/paper-import/nck1ImageSourceBundle.mjs'
import {
  produceNck1OcrMaterialization,
} from '../server/paper-import/nck1OcrMaterializationProducer.mjs'
import {
  imageBundleConfirmation,
  imageBundleEvidence,
  makeSyntheticNck1ImageBundleFixture,
} from '../test-fixtures/paper-import/nck1-image-source-bundle-v1/fixture.mjs'

const root = path.resolve(import.meta.dirname, '..')
const cliPath = path.join(root, 'scripts/import-pipeline/universal-nck1.mjs')
const surfaceVerifierPath = path.join(
  root,
  'scripts/verify-universal-nck1-candidate-surfaces.mjs',
)
const paperId = `paper-synthetic-image-bundle-${process.pid}`
const cliPaperDir = path.join(root, 'scripts/import-pipeline/papers', paperId)
const fixture = await makeSyntheticNck1ImageBundleFixture({ paperId })

function throwsCode(operation, code) {
  assert.throws(operation, (error) => {
    assert.equal(error.code, code)
    return true
  })
}

function imported(produced, documents = fixture.sourceDocuments) {
  return importCanonicalCandidate({
    kind: 'nck1-source-materialization',
    materializationBytes: new TextEncoder().encode(JSON.stringify(produced.materialization)),
    documents: documents.map((document) => ({
      documentId: document.documentId,
      bytes: document.bytes,
    })),
    media: [],
  })
}

const firstPages = fixture.pageSets[0]
const descriptor = buildNck1ImageSourceBundle(firstPages)
const replayed = parseNck1ImageSourceBundle(descriptor)
assert.deepEqual(
  replayed.pages.map(({ page, mediaType, sha256, byteLength, pixelWidth, pixelHeight }) => ({
    page, mediaType, sha256, byteLength, pixelWidth, pixelHeight,
  })),
  firstPages.map(({ page, bytes }) => ({ page, ...inspectNck1SourceImage(bytes) })),
)
for (const [index, page] of replayed.pages.entries()) {
  assert.deepEqual(page.bytes, firstPages[index].bytes)
}
throwsCode(
  () => buildNck1ImageSourceBundle([
    { page: 1, bytes: firstPages[0].bytes },
    { page: 1, bytes: firstPages[1].bytes },
  ]),
  'NCK1_IMAGE_PAGE_DUPLICATE',
)
throwsCode(
  () => buildNck1ImageSourceBundle([
    { page: 1, bytes: firstPages[0].bytes },
    { page: 3, bytes: firstPages[1].bytes },
  ]),
  'NCK1_IMAGE_BUNDLE_ORDER_INVALID',
)
throwsCode(
  () => inspectNck1SourceImage(new Uint8Array(Buffer.from('GIF89a unsupported'))),
  'NCK1_IMAGE_MEDIA_TYPE_UNSUPPORTED',
)
throwsCode(
  () => assertNck1ImageBundlePageArtifacts(fixture.bundleDocuments[0], firstPages.map(
    (page, index) => ({
      page: page.page,
      ...inspectNck1SourceImage(page.bytes),
      bytes: index === 0 ? firstPages[1].bytes : page.bytes,
    }),
  )),
  'NCK1_IMAGE_PAGE_DIGEST_MISMATCH',
)

const unconfirmed = produceNck1OcrMaterialization({
  paperId,
  documents: fixture.sourceDocuments,
  evidence: fixture.evidence,
})
assert.equal(unconfirmed.disposition, 'needs_agent_review')
assert(unconfirmed.review.required.some((item) => item.code === 'NCK1_OCR_TEXT_LAYER_REQUIRED'))
assert.equal(imported(unconfirmed).candidate?.interpretation, null)

const confirmed = produceNck1OcrMaterialization({
  paperId,
  documents: fixture.sourceDocuments,
  evidence: fixture.evidence,
  confirmation: fixture.confirmation,
})
assert.equal(confirmed.disposition, 'ready_for_verification')
assert.deepEqual(confirmed.review.required, [])
assert.equal(confirmed.materialization.groups.length, 9)
assert.equal(confirmed.materialization.answers.length, 45)
assert.deepEqual(confirmed.materialization.media, [])
assert.equal(JSON.stringify(confirmed.materialization).includes('data:image'), false)
assert.equal(JSON.stringify(confirmed.materialization).includes('deliberately untrusted explanation'), false)
const firstReadingQuestion = confirmed.materialization.groups
  .find((group) => group.slotId === 'reading.a').questions[0]
assert.equal(firstReadingQuestion.stem, 'Which choice fits item 21?')
assert(firstReadingQuestion.options.every((option) =>
  !firstReadingQuestion.stem.includes(option.text)),
'image-source reading stems must not repeat their separately structured option text')
const canonical = imported(confirmed)
assert.deepEqual(canonical.issues, [])
const preview = compileNck1MaterializationCandidatePreview(canonical.candidate)
assert(preview.compilation, JSON.stringify(preview.unresolvedIssues, null, 2))
const captured = preview.compilation.artifacts.sourceCapture.documents
for (const pages of fixture.pageSets) {
  for (const page of pages) {
    const expected = inspectNck1SourceImage(page.bytes)
    assert(captured.some((document) =>
      document.mediaType === expected.mediaType
      && document.sha256 === expected.sha256
      && document.byteLength === expected.byteLength),
    'every original image page is an immutable Source Capture artifact')
  }
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-image-bundle-'))
const run = (...args) => execFileSync(process.execPath, [cliPath, ...args], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
function runFailure(...args) {
  try {
    run(...args)
    assert.fail(`Expected CLI failure: ${args.join(' ')}`)
  } catch (error) {
    return String(error.stderr || error.message)
  }
}

try {
  const pageArguments = []
  const sourcePagePaths = []
  for (const [documentIndex, pages] of fixture.pageSets.entries()) {
    const role = documentIndex === 0 ? 'question_source' : 'official_answers'
    for (const page of pages) {
      const extension = page.mediaType === 'image/jpeg'
        ? 'jpg'
        : page.mediaType.split('/')[1]
      const filePath = path.join(tempRoot, `${role}-${page.page}.${extension}`)
      writeFileSync(filePath, page.bytes)
      pageArguments.push('--source-page', `${role}:${page.page}=${filePath}`)
      sourcePagePaths.push({ role, page: page.page, filePath, bytes: page.bytes })
    }
  }
  assert.match(run(
    'init', paperId,
    '--paper-name', 'Synthetic ordered image bundle',
    '--provenance', 'anonymous synthetic fixture',
    ...pageArguments,
  ), /INITIALIZED/u)
  const manifestPath = path.join(cliPaperDir, 'universal-source-manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const bundleRecords = manifest.documents.filter((document) =>
    document.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE)
  assert.equal(bundleRecords.length, 2)
  assert.equal(manifest.documents.filter((document) => document.renditionOf).length, 2)
  for (const document of bundleRecords) {
    assert.equal(document.pages.length, document.pageCount)
    assert(document.pages.every((page, index) => page.page === index + 1))
    assert(document.pages.every((page) => page.dpi === undefined))
    const descriptorBytes = new Uint8Array(readFileSync(path.join(cliPaperDir, document.path)))
    const artifactPages = document.pages.map((page) => ({
      ...page,
      bytes: new Uint8Array(readFileSync(path.join(cliPaperDir, page.path))),
    }))
    assertNck1ImageBundlePageArtifacts({ ...document, bytes: descriptorBytes }, artifactPages)
  }
  for (const sourcePage of sourcePagePaths) {
    const document = bundleRecords.find((candidate) => candidate.role === sourcePage.role)
    const capturedPage = document.pages.find((candidate) => candidate.page === sourcePage.page)
    assert.equal(
      Buffer.compare(
        readFileSync(path.join(cliPaperDir, capturedPage.path)),
        Buffer.from(sourcePage.bytes),
      ),
      0,
    )
  }

  assert.match(run('materialize', paperId), /"disposition": "needs_agent_review"/u)
  assert.match(runFailure('verify', paperId), /MATERIALIZATION_UNRESOLVED_ISSUES/u)

  const driftPage = bundleRecords[0].pages[0]
  const driftPath = path.join(cliPaperDir, driftPage.path)
  const originalBytes = readFileSync(driftPath)
  writeFileSync(driftPath, fixture.pageSets[0][1].bytes)
  assert.match(
    runFailure('stage-ocr', paperId, path.join(tempRoot, 'not-written.json')),
    /NCK1_IMAGE_PAGE_DIGEST_MISMATCH/u,
  )
  writeFileSync(driftPath, originalBytes)

  const documents = manifest.documents.map((document) => ({
    ...document,
    bytes: new Uint8Array(readFileSync(path.join(cliPaperDir, document.path))),
  }))
  const evidence = imageBundleEvidence({
    paperId,
    documents,
    engineDocuments: fixture.engineDocuments,
  })
  const confirmation = imageBundleConfirmation(paperId, evidence)
  const evidencePath = path.join(tempRoot, 'evidence.json')
  const confirmationPath = path.join(tempRoot, 'confirmation.json')
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  writeFileSync(confirmationPath, `${JSON.stringify(confirmation, null, 2)}\n`)
  assert.match(run('stage-ocr', paperId, evidencePath), /"state": "written"/u)
  assert.match(run('materialize', paperId), /"disposition": "needs_agent_review"/u)
  assert.match(run('confirm-ocr', paperId, confirmationPath), /"confirmedItems":/u)
  assert.match(run('materialize', paperId), /"disposition": "ready_for_verification"/u)
  assert.match(run('verify', paperId), /"groups": 9/u)
  assert.match(run('verify', paperId), /"assertions": 45/u)
  assert.match(run('build', paperId), /BUILT CANDIDATE/u)
  assert.match(
    execFileSync(process.execPath, [surfaceVerifierPath, paperId], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        NCK1_SURFACE_OUTPUT_DIR: path.join(tempRoot, 'candidate-surfaces'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
    /PASS universal NCK1 Candidate surfaces/u,
  )

  const duplicatePaperId = `${paperId}-duplicate`
  const duplicatePaperDir = path.join(root, 'scripts/import-pipeline/papers', duplicatePaperId)
  try {
    assert.match(runFailure(
      'init', duplicatePaperId,
      '--paper-name', 'Synthetic duplicate image page',
      '--provenance', 'anonymous synthetic fixture',
      '--source-page', `question_source:1=${sourcePagePaths[0].filePath}`,
      '--source-page', `question_source:1=${sourcePagePaths[1].filePath}`,
      '--source-page', `official_answers:1=${sourcePagePaths.at(-1).filePath}`,
    ), /NCK1_IMAGE_PAGE_DUPLICATE/u)
  } finally {
    rmSync(duplicatePaperDir, { recursive: true, force: true })
  }
} finally {
  rmSync(cliPaperDir, { recursive: true, force: true })
  rmSync(tempRoot, { recursive: true, force: true })
}

assert.equal(existsSync(cliPaperDir), false)
console.log('verify-universal-nck1-image-source-bundle: PASS')
