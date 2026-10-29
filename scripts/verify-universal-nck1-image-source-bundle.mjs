#!/usr/bin/env node
// verify-resource: browser-render
import './lib/reviewTestLockRoot.mjs'

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  compileNck1MaterializationCandidatePreview,
  importCanonicalCandidate,
} from '../shared/paper-canonical/compiler.mjs'
import { validateInlineBlankTextBoundaries } from '../shared/paper-canonical/inlineBlankBoundaries.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { nck1MaterializationHistoricalAuthorityRef66 } from '../shared/paper-canonical/authority.mjs'
import { buildNck1ReviewProjection, buildNck1SealedReviewProjection, loadNck1ReviewSource,
  reviewBundleFilePaths, PARAGRAPH_SUMMARIES_FILE_NAME, PUBLIC_SEARCH_METADATA_FILE_NAME } from '../server/import-review/revisionProjection.mjs'
import { SOURCE_REFERENCES_FILE } from '../server/paper-import/sourceReferences.mjs'
import { reviewBuildIdentityProvider } from '../server/import-review/reviewBuildIdentity.mjs'
import { NCK1_OCR_EVIDENCE_FILE_NAME, NCK1_OCR_CONFIRMATION_FILE_NAME } from '../server/paper-import/nck1OcrSourceEvidence.mjs'
import { freezeReviewFixture, finalizeReviewFixture, reviewFixtureManifest } from './lib/reviewPublicationFixture.mjs'
import { prepareSpellingReview, SPELLING_REVIEW_FILE, TEXT_REVIEW_POLICY } from '../server/paper-import/spellingReview.mjs'
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
const reviewPath = path.join(root, 'scripts/import-pipeline/review.mjs')
const surfaceVerifierPath = path.join(
  root,
  'scripts/verify-universal-nck1-candidate-surfaces.mjs',
)

function verifyImageProcessTimeouts() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-image-timeout-'))
  const pidPath = path.join(tempRoot, 'magick.pid')
  const modulePath = path.join(root, 'server/paper-import/nck1ImageSourceBundle.mjs')
  const probe = `
    import assert from 'node:assert/strict'
    import childProcess from 'node:child_process'
    import { syncBuiltinESMExports } from 'node:module'
    const execFileSync = childProcess.execFileSync
    // Assert the production deadline before shortening only this isolated probe.
    childProcess.execFileSync = (file, args, options) => {
      assert.equal(options.timeout, 30_000)
      assert.equal(options.killSignal, 'SIGKILL')
      return execFileSync(file, args, { ...options, timeout: 1_000 })
    }
    syncBuiltinESMExports()
    const {
      inspectNck1SourceImage, nck1ImagePageRgba, cropNck1SourceImage,
    } = await import(${JSON.stringify(modulePath)})
    const bytes = Buffer.alloc(1024 * 1024)
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes)
    const operations = {
      identify: () => inspectNck1SourceImage(bytes),
      rgba: () => nck1ImagePageRgba({ bytes, pixelWidth: 2, pixelHeight: 2 }),
      crop: () => cropNck1SourceImage(bytes, { x: 0, y: 0, width: 1, height: 1 }),
    }
    const start = performance.now()
    try {
      operations[process.env.EQB_IMAGE_TEST_OPERATION]()
      throw new Error('Hung ImageMagick unexpectedly returned output')
    } catch (error) {
      console.log(JSON.stringify({
        name: error.name, code: error.code, elapsedMs: performance.now() - start,
      }))
    }
  `
  // No shell/sleep descendants: the fake executable itself must be killed.
  // A full pipe reproduces stdin backpressure; ignoring SIGTERM requires SIGKILL.
  writeFileSync(path.join(tempRoot, 'magick'), `#!${process.execPath}
import { writeFileSync } from 'node:fs'
if (process.argv[2] === 'identify' && process.env.EQB_IMAGE_TEST_OPERATION !== 'identify') {
  process.stdin.resume()
  process.stdin.once('end', () => process.stdout.write('2,2'))
} else {
  process.on('SIGTERM', () => {})
  process.stdin.pause()
  writeFileSync(process.env.EQB_IMAGE_TEST_PID_PATH, String(process.pid))
  setInterval(() => {}, 1000)
}
`, { mode: 0o755 })
  try {
    for (const operation of ['identify', 'rgba', 'crop']) {
      try {
        // The outer watchdog also bounds this verifier against the unfixed code.
        const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', probe], {
          cwd: root,
          encoding: 'utf8',
          timeout: 5_000,
          killSignal: 'SIGKILL',
          env: {
            ...process.env,
            PATH: `${tempRoot}${path.delimiter}${process.env.PATH}`,
            EQB_IMAGE_TEST_OPERATION: operation,
            EQB_IMAGE_TEST_PID_PATH: pidPath,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        }))
        assert.equal(result.name, 'Nck1ImageSourceBundleError', operation)
        assert.equal(result.code, 'NCK1_IMAGE_PROCESS_TIMEOUT', operation)
        assert(result.elapsedMs >= 1_000 && result.elapsedMs < 5_000,
          `${operation} must fail at the shortened 1-second process deadline: ${result.elapsedMs}ms`)
        const pid = Number(readFileSync(pidPath, 'utf8'))
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' },
          `${operation} must leave no ImageMagick process behind`)
        console.log(`ImageMagick ${operation} timeout: PASS (${Math.round(result.elapsedMs)}ms, child ${pid} reaped)`)
      } finally {
        if (existsSync(pidPath)) {
          const pid = Number(readFileSync(pidPath, 'utf8'))
          try {
            process.kill(pid, 'SIGKILL')
          } catch (error) {
            if (error.code !== 'ESRCH') throw error
          }
          rmSync(pidPath)
        }
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

verifyImageProcessTimeouts()
if (process.argv.includes('--timeout-only')) {
  console.log('verify-universal-nck1-image-source-bundle: timeout checks PASS')
  process.exit(0)
}

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

function authoredPublicSearchMetadata(request) {
  return {
    groups: request.sourceGroups.map((group) => {
      let metadata
      if (group.family === 'reading') {
        metadata = {
          slot: group.slotId.split('.')[1].toUpperCase(),
          questions: group.questions.map(({ questionId }) => ({
            questionId,
            similarityProfile: {
              family: 'detail',
              subtype: 'general-detail',
              detailScope: 'single',
              technique: null,
            },
          })),
        }
      }
      if (group.family === 'seven-choices') {
        metadata = {
          questions: group.questions.map(({ questionId }) => ({
            questionId,
            positionFacet: 'seven-choices.position.paragraph-middle',
            roleFacet: 'seven-choices.role.cohesion',
            primaryMechanismFacet: 'seven-choices.cohesion.grammatical.logical-connector',
          })),
        }
      }
      if (group.family === 'cloze') {
        metadata = {
          questions: group.questions.map(({ questionId }) => ({
            questionId,
            pos: 'verb',
            signatureFacet: 'cloze.signature.verb.action-sequence',
          })),
        }
      }
      if (group.family === 'grammar-fill') {
        const paragraphIds = request.deterministic
          .find(({ groupId }) => groupId === group.groupId).paragraphIds
        metadata = {
          questions: group.questions.map(({ questionId, prompt }) => ({
            questionId,
            facetKey: prompt
              ? 'grammar-fill.given.conversion.noun-to-noun'
              : 'grammar-fill.no-hint.article',
            role: null,
            similarityProfile: {
              route: prompt ? 'derived-noun' : 'the-anaphoric',
              features: [],
            },
            contextParagraphIds: paragraphIds,
          })),
        }
      }
      if (group.family === 'application-writing') {
        metadata = {
          writingTaskId: `writing-task:${group.groupId}`,
          form: 'email',
          function: 'communicate',
        }
      }
      if (group.family === 'continuation-writing') {
        metadata = {
          writingTaskId: `writing-task:${group.groupId}`,
          situation: 'A situation develops.',
          conflict: 'A problem is resolved.',
          relationships: [],
        }
      }
      assert(metadata, `unsupported public search metadata family: ${group.family}`)
      return {
        groupId: group.groupId,
        family: group.family,
        topicLabels: ['人与社会-社会服务与人际沟通-合作'],
        genre: '记叙',
        metadata,
      }
    }),
  }
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
assert.equal(preview.compilation.artifacts.canonicalPaper.questionGroups
  .filter(group => group.contractRef.familyContractId === 'listening').length, 0)
assert.deepEqual(validateInlineBlankTextBoundaries(preview.compilation.artifacts.canonicalPaper.questionGroups), [], 'OCR source separators survive materialization across all three blank families')
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

const tempRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'eqb-nck1-image-bundle-')))
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
    '--year', '2025', '--month', '12',
    ...pageArguments,
  ), /INITIALIZED/u)
  // This synthetic source starts at reading q21 and supplies no listening.
  // Its product-required Review workspace must declare that source contract.
  const configPath = path.join(cliPaperDir, 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  assert.equal(config.pdfProductsRequired, true)
  config.listening = 'absent-by-exam-design'
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
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
  assert.match(runFailure('verify', paperId), /SPELLING_REVIEW_INVALID/u)

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
  const spellingReview = prepareSpellingReview(new Uint8Array(readFileSync(path.join(cliPaperDir, manifest.materializationPath))), TEXT_REVIEW_POLICY)
  spellingReview.reviewedBy = 'import_agent'
  spellingReview.reviewedAt = '2026-09-21T00:00:00Z'
  spellingReview.targets.forEach(target => { target.decision = 'unchanged' })
  writeFileSync(path.join(cliPaperDir, SPELLING_REVIEW_FILE), JSON.stringify(spellingReview))
  // Retained v1 stays outside Canonical input. Capture/bind/finalize current
  // references before the first projection instead of upgrading OCR to v2.
  const loadedBeforeReferences = loadNck1ReviewSource(cliPaperDir)
  assert.equal(loadedBeforeReferences.sourceInput.ocrSourceBytes, undefined)
  const retainedBefore = importCanonicalCandidate(loadedBeforeReferences.sourceInput, undefined,
    { materializationAuthorityRef: nck1MaterializationHistoricalAuthorityRef66 }).candidate
  assert(retainedBefore)
  const retainedPreviewBefore = compileNck1MaterializationCandidatePreview(retainedBefore)
  assert(retainedPreviewBefore.compilation)
  const captureWork = path.join(tempRoot, 'references')
  execFileSync(process.execPath, [path.join(root, 'scripts/import-pipeline/ocr-proofread.mjs'),
    'references', paperId, '--work', captureWork], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  const preparedPath = path.join(tempRoot, 'references-prepared.json')
  const productsCli = path.join(root, 'scripts/import-pipeline/answer-products.mjs')
  execFileSync(process.execPath, [productsCli, 'prepare', '--paper-dir', cliPaperDir,
    '--output', preparedPath], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  const referenceDraftPath = path.join(captureWork, 'source-references-draft.json')
  const referenceDraft = JSON.parse(readFileSync(referenceDraftPath))
  const preparedReferences = JSON.parse(readFileSync(preparedPath)).template
  for (const key of ['sourceDigest', 'candidateDigest', 'materializationDigest']) referenceDraft[key] = preparedReferences[key]
  assert.equal(referenceDraft.producerVersion, 'ocr-source-references-producer-v27')
  writeFileSync(referenceDraftPath, JSON.stringify(referenceDraft))
  assert.match(execFileSync(process.execPath, [productsCli, 'finalize', '--paper-dir', cliPaperDir,
    '--input', referenceDraftPath, '--output', path.join(cliPaperDir, SOURCE_REFERENCES_FILE)],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /local_capture_finalized/u)
  assert.match(execFileSync(process.execPath, [productsCli, 'verify', '--paper-dir', cliPaperDir,
    '--references', path.join(cliPaperDir, SOURCE_REFERENCES_FILE)],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /local_capture_verified/u)
  const retainedAfter = importCanonicalCandidate(loadNck1ReviewSource(cliPaperDir).sourceInput, undefined,
    { materializationAuthorityRef: nck1MaterializationHistoricalAuthorityRef66 }).candidate
  assert.deepEqual(retainedAfter, retainedBefore)
  assert.deepEqual(compileNck1MaterializationCandidatePreview(retainedAfter).compilation, retainedPreviewBefore.compilation)
  for (const [file, original] of [[NCK1_OCR_EVIDENCE_FILE_NAME, evidence], [NCK1_OCR_CONFIRMATION_FILE_NAME, confirmation]]) {
    assert.equal(readFileSync(path.join(cliPaperDir, 'materialization', file), 'utf8'), `${JSON.stringify(original, null, 2)}\n`)
  }
  const blockedPath = path.join(cliPaperDir, 'signals/blocked.json')
  const historicalBlock = `${JSON.stringify({
    code: 'source_incomplete',
    at: '2026-09-21T00:00:00Z',
    note: 'Spelling review: required review is missing; run prepare-spelling',
  })}\n`
  writeFileSync(blockedPath, historicalBlock)
  assert.match(run('verify', paperId), /"groups": 9/u)
  assert.equal(existsSync(blockedPath), false, 'successful verify retires its recovered spelling blocker')
  const archivedBlockPath = path.join(cliPaperDir, 'signals/history',
    `blocked-${sha256(Buffer.from(historicalBlock))}.json`)
  assert.equal(readFileSync(archivedBlockPath, 'utf8'), historicalBlock,
    'recovered blocker evidence remains byte-identical in history')
  assert.match(run('verify', paperId), /"assertions": 45/u)
  assert.match(run('build', paperId), /BUILT CANDIDATE/u)
  const summaryRequestPath = path.join(tempRoot, 'paragraph-summaries-request.json')
  execFileSync(process.execPath, [
    reviewPath,
    'prepare-summaries', paperId,
    '--output', summaryRequestPath,
  ], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const summaryRequest = JSON.parse(readFileSync(summaryRequestPath, 'utf8'))
  writeFileSync(
    path.join(cliPaperDir, summaryRequest.outputFile),
    `${JSON.stringify({
      schemaVersion: 'paragraph-summaries-v1',
      paperId: summaryRequest.paperId,
      sourceDigest: summaryRequest.sourceDigest,
      candidateDigest: summaryRequest.candidateDigest,
      groups: summaryRequest.groups.map(({ groupId, targets }) => ({
        groupId,
        paragraphs: targets.map(({ paragraphId }) => ({
          paragraphId,
          summary: `Synthetic fixture summary for ${paragraphId}.`,
        })),
      })),
    }, null, 2)}\n`,
  )
  assert.match(
    execFileSync(process.execPath, [reviewPath, 'verify-summaries', paperId], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
    /"status": "summaries_verified"/u,
  )
  const searchMetadataRequestPath = path.join(tempRoot, 'public-search-metadata-request.json')
  execFileSync(process.execPath, [
    reviewPath,
    'prepare-search-metadata', paperId,
    '--output', searchMetadataRequestPath,
  ], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const searchMetadataRequest = JSON.parse(readFileSync(searchMetadataRequestPath, 'utf8'))
  const authoredSearchMetadataPath = path.join(tempRoot, 'authored-public-search-metadata.json')
  writeFileSync(
    authoredSearchMetadataPath,
    `${JSON.stringify(authoredPublicSearchMetadata(searchMetadataRequest), null, 2)}\n`,
  )
  assert.match(
    execFileSync(process.execPath, [
      reviewPath,
      'finalize-search-metadata', paperId,
      '--input', authoredSearchMetadataPath,
    ], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
    /"status": "search_metadata_finalized"/u,
  )
  assert.match(
    execFileSync(process.execPath, [reviewPath, 'verify-search-metadata', paperId], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
    /"status": "search_metadata_verified"/u,
  )
  // A new v26 capture can retain Canonical v66, including its downstream
  // bindings. This creates no historical receipt or approval. Restore every
  // original draft byte before the default-authority public CLI case continues.
  const identityKeys = ['sourceDigest', 'candidateDigest', 'visibleStructureDigest',
    'paragraphSummariesDigest', 'publicSearchMetadataDigest']
  const reboundFiles = [SOURCE_REFERENCES_FILE, PARAGRAPH_SUMMARIES_FILE_NAME, PUBLIC_SEARCH_METADATA_FILE_NAME]
    .map(file => ({ file: path.join(cliPaperDir, file), bytes: readFileSync(path.join(cliPaperDir, file)) }))
  let retainedBindings
  try {
    for (const { file, bytes } of reboundFiles) {
      writeFileSync(file, JSON.stringify({ ...JSON.parse(bytes), candidateDigest: retainedBefore.candidateDigest }))
    }
    const retainedProjection = freezeReviewFixture(cliPaperDir,
      { expectedCandidateDigest: retainedBefore.candidateDigest })
    retainedBindings = Object.fromEntries(identityKeys.map(key => [key, retainedProjection[key]]))
    assert.equal(retainedBindings.sourceDigest, retainedBefore.source.sha256)
    assert.equal(retainedBindings.candidateDigest, retainedBefore.candidateDigest)
    const retainedManifest = reviewFixtureManifest(cliPaperDir, retainedProjection)
    const retainedRoot = path.join(tempRoot, 'retained-v66-current-capture')
    for (const file of retainedManifest.files) {
      const destination = path.join(retainedRoot, file.path)
      mkdirSync(path.dirname(destination), { recursive: true })
      writeFileSync(destination, readFileSync(path.join(cliPaperDir, file.path)))
    }
    const retainedTransport = buildNck1ReviewProjection(retainedRoot,
      { expectedCandidateDigest: retainedBefore.candidateDigest })
    for (const key of identityKeys) assert.equal(retainedTransport[key], retainedBindings[key], `retained-v66 ${key}`)
  } finally {
    for (const { file, bytes } of reboundFiles) writeFileSync(file, bytes)
  }
  const beforeTransport = freezeReviewFixture(cliPaperDir)
  const bundleManifest = reviewFixtureManifest(cliPaperDir, beforeTransport)
  const ocrFiles = bundleManifest.files.filter(file => file.role === 'ocr_source_evidence')
  assert.equal(ocrFiles.length, 2)
  const unpackedRoot = path.join(tempRoot, 'unpacked-review')
  for (const file of bundleManifest.files) {
    const bytes = readFileSync(path.join(cliPaperDir, file.path))
    mkdirSync(path.dirname(path.join(unpackedRoot, file.path)), { recursive: true })
    writeFileSync(path.join(unpackedRoot, file.path), bytes)
    assert.equal(sha256(bytes), file.sha256)
  }
  // Public boundaries must reject manifest relationship damage on transported
  // retained-v1 inputs, before any PDF can disappear from the OCR inventory.
  const transportedManifestPath = path.join(unpackedRoot, 'universal-source-manifest.json')
  const transportedManifestBytes = readFileSync(transportedManifestPath)
  const renditionCases = [
    ['same-role-without-relation', manifest => { delete manifest.documents.find(doc => doc.renditionOf).renditionOf }],
    ['dangling-target', manifest => { manifest.documents.find(doc => doc.renditionOf).renditionOf = 'missing-original' }],
    ['pdf-target', manifest => {
      const copy = manifest.documents.find(doc => doc.renditionOf); copy.renditionOf = copy.documentId
    }],
    ['wrong-role', manifest => { manifest.documents.find(doc => doc.renditionOf).role = 'unbound-role' }],
    ['wrong-page-count', manifest => { manifest.documents.find(doc => doc.renditionOf).pageCount++ }],
    ['missing-original', manifest => {
      const copy = manifest.documents.find(doc => doc.renditionOf)
      manifest.documents = manifest.documents.filter(doc => doc.documentId !== copy.renditionOf)
    }],
    ...['scoring', 'alternate'].map(kind => [`extra-${kind}-pdf`, manifest => {
      const copy = manifest.documents.find(doc => doc.renditionOf)
      const { renditionOf, ...independent } = copy
      manifest.documents.push({ ...independent, documentId: `independent-${kind}-pdf` })
    }]),
  ]
  try {
    for (const [label, mutate] of renditionCases) {
      const altered = JSON.parse(transportedManifestBytes); mutate(altered)
      writeFileSync(transportedManifestPath, JSON.stringify(altered))
      assert.throws(() => buildNck1ReviewProjection(unpackedRoot),
        /rendition|Materialized document is unavailable/iu, `projection ${label}`)
      const rejectedOutput = path.join(tempRoot, `rejected-${label}.json`)
      assert.throws(() => execFileSync(process.execPath, [productsCli, 'finalize', '--paper-dir', unpackedRoot,
        '--input', path.join(unpackedRoot, SOURCE_REFERENCES_FILE), '--output', rejectedOutput],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), error =>
        /rendition|Materialized document is unavailable/iu.test(String(error.stderr)), `finalize ${label}`)
      assert.equal(existsSync(rejectedOutput), false, label)
    }
  } finally { writeFileSync(transportedManifestPath, transportedManifestBytes) }
  console.log(`Public finalize/projection rendition negatives: PASS (${renditionCases.length} cases each)`)
  const afterTransport = buildNck1ReviewProjection(unpackedRoot)
  for (const key of identityKeys) assert.equal(afterTransport[key], beforeTransport[key], key)
  for (const file of ocrFiles) {
    const located = path.join(unpackedRoot, file.path)
    const bytes = readFileSync(located)
    rmSync(located)
    assert.throws(() => buildNck1ReviewProjection(unpackedRoot), /Reference OCR|ENOENT/u)
    writeFileSync(located, bytes)
  }
  await reviewBuildIdentityProvider().ready()
  const sealed = finalizeReviewFixture({ directory: unpackedRoot, output: path.join(tempRoot, 'sealed-review'),
    projection: afterTransport, approve: false })
  const sealedRoot = sealed.store.revisionDirectory(sealed.revision.id)
  const replayed = buildNck1SealedReviewProjection(sealedRoot, sealed.revision)
  assert.equal(replayed.candidateDigest, beforeTransport.candidateDigest)
  const sealedReferences = path.join(sealedRoot, SOURCE_REFERENCES_FILE)
  const sealedBytes = readFileSync(sealedReferences)
  writeFileSync(sealedReferences, Buffer.concat([sealedBytes, Buffer.from(' ')]))
  assert.throws(() => buildNck1SealedReviewProjection(sealedRoot, sealed.revision), /sealed revision|sealed|digest/iu)
  writeFileSync(sealedReferences, sealedBytes)
  assert.deepEqual(reviewFixtureManifest(cliPaperDir, beforeTransport), bundleManifest)
  assert.deepEqual(reviewBundleFilePaths(cliPaperDir), reviewBundleFilePaths(unpackedRoot))
  console.log(JSON.stringify({ referenceOnlyV1: 'PASS', retainedAuthority: retainedBefore.authority,
    retainedBindings,
    retainedSourceDigest: retainedBefore.source.sha256, retainedCandidateDigest: retainedBefore.candidateDigest,
    retainedCanonicalDigest: digestJson(retainedPreviewBefore.compilation),
    sourceDigest: beforeTransport.sourceDigest, candidateDigest: beforeTransport.candidateDigest,
    visibleStructureDigest: beforeTransport.visibleStructureDigest,
    paragraphSummariesDigest: beforeTransport.paragraphSummariesDigest,
    publicSearchMetadataDigest: beforeTransport.publicSearchMetadataDigest,
    bundleDigest: bundleManifest.bundleDigest,
    ocrFiles: ocrFiles.map(({ path, sha256 }) => ({ path, sha256 })) }))
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
// Keep supplemental-OCR closure/identity negatives in this existing CI lane.
await import('../server/paper-import/sourceReferenceAdmissionReferenceOcr.test.mjs')
console.log('verify-universal-nck1-image-source-bundle: PASS')
