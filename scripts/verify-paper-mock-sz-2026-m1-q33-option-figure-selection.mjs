import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import {
  confirmVisualImportCandidate,
  createVisualImportCandidate,
} from '../server/paper-canonical/visualCandidate.mjs'
import { inspectPng } from '../shared/paper-canonical/png.mjs'
import {
  readingOptionFigureLayout,
  readingOptionFigureLayoutRef,
} from '../shared/paper-canonical/readingOptionFigureLayout.mjs'
import {
  digestJson,
  sha256,
  withoutKey,
} from '../shared/paper-canonical/stable.mjs'

const rootDir = process.cwd()
const paperRoot = path.join(
  rootDir,
  'scripts/import-pipeline/papers/paper-mock-sz-2026-m1',
)
const evidenceRoot = path.join(paperRoot, 'visual-candidates/q33')
const sourcePdfPath = '/Users/huangxuewei/Desktop/试卷题库/05_真题模拟与试卷库/各地模拟/2026年3月高三试卷/26年3月高三试卷/26.3广东深圳高三一模英语试卷.pdf'
const labels = ['A', 'B', 'C', 'D']
const methods = ['source_crop', 'vector_authored', 'reference_restored']
const groupId = 'group-mock-sz-2026-m1-reading-d'
const questionId = 'q-mock-sz-2026-m1-033'
const expectedRaw = {
  A: { object: '58 0', xobject: '/IM58', sha256: 'sha256:64232bdcd07269a4690781b11f3cf9fee884fad9e2a8633738c49d2566a90935', bytes: 2813, width: 43, height: 105, command: 'q 20.52 0 0 -51.48 74.64 658.56 cm /IM58 Do Q' },
  B: { object: '59 0', xobject: '/IM59', sha256: 'sha256:6b3208d53a474bc5e5758c17fb09ef4fc75d97677c97d5413b08da0c2275962d', bytes: 2235, width: 49, height: 105, command: 'q 24.6 0 0 -51.96 194.04 658.56 cm /IM59 Do Q' },
  C: { object: '60 0', xobject: '/IM60', sha256: 'sha256:0ba857a99f636f4535d8387c9684816575b28f28c9f681741c583c45fa61c7db', bytes: 1949, width: 45, height: 105, command: 'q 22.08 0 0 -51.96 314.04 657.84 cm /IM60 Do Q' },
  D: { object: '61 0', xobject: '/IM61', sha256: 'sha256:3c667a48c3a75fb8929252f80478a282e3ac98211911f8b620ccf90d40c750dc', bytes: 1898, width: 40, height: 105, command: 'q 19.56 0 0 -51.96 410.16 659.52 cm /IM61 Do Q' },
}
const canonicalBaseline = {
  'canonical/canonical-paper-plan-v1.json': 'sha256:5c431f90bf7eff8e1b8ebb00e1febd0aac3f90f0855a976410fb2da6d337fbb3',
  'canonical/canonical-paper-publication-v37.json': 'sha256:d9c5c192b29823dadcca5ebce18e99b2c14dae3a690b5d66300ba120ad1be482',
  'canonical/canonical-question-groups-v1.json': 'sha256:4b9cdbde9fd2d5ba98cf5c2073066de66b2d675c0157ce00144de5551d95675f',
  'canonical/normalization-report-v37.json': 'sha256:b99a3a0011eb77baab2075d99cce9961787a4d33a4d8b74d7e46c6db1847c44e',
  'canonical/source-asset.bin': 'sha256:df0c4e0a0d1aee4557f122591e3b778d7b48f2f324d75dba120343bb00926c80',
  'canonical/source-capture-v1.json': 'sha256:5356b6763c861c050b96e6440a86c069092b1311b5a2c2f78789c02fc7352824',
  'canonical-paper-publication-ref-v1.json': 'sha256:5476d183136427a06ae52eafd9be4c09b62d7ea7d20b91418aecc4c7fe3cc4b2',
}

async function readBytes(filePath) {
  return new Uint8Array(await fs.readFile(filePath))
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function jpegDimensions(bytes) {
  assert.equal(bytes[0], 0xff)
  assert.equal(bytes[1], 0xd8)
  let offset = 2
  while (offset + 9 < bytes.byteLength) {
    assert.equal(bytes[offset], 0xff)
    const marker = bytes[offset + 1]
    offset += 2
    if (marker === 0xd9 || marker === 0xda) break
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    assert.ok(length >= 2 && offset + length <= bytes.byteLength)
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      }
    }
    offset += length
  }
  return null
}

function assertCode(operation, code, message) {
  assert.throws(operation, (error) => error?.code === code, message)
}

function rebindPackage(candidate) {
  const rebound = structuredClone(candidate)
  rebound.packageDigest = digestJson(withoutKey(rebound, 'packageDigest'))
  return rebound
}

function rebindCandidate(candidate, index) {
  const rebound = structuredClone(candidate)
  rebound.candidates[index].candidateDigest = digestJson(
    withoutKey(rebound.candidates[index], 'candidateDigest'),
  )
  return rebindPackage(rebound)
}

function keysNamed(value, keyName, found = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => keysNamed(entry, keyName, found))
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === keyName) found.push(child)
      keysNamed(child, keyName, found)
    }
  }
  return found
}

const packagePath = path.join(evidenceRoot, 'visual-import-candidate-v1.json')
const sourceCapturePath = path.join(evidenceRoot, 'source-capture-v1.json')
const comparisonManifestPath = path.join(evidenceRoot, 'comparison-manifest.json')
const confirmationTemplatePath = path.join(evidenceRoot, 'visual-teacher-confirmation-template.json')
const comparisonHtmlPath = path.join(evidenceRoot, 'comparison.html')
const candidatePackage = await readJson(packagePath)
const sourceCapture = await readJson(sourceCapturePath)
const comparisonManifest = await readJson(comparisonManifestPath)
const confirmationTemplate = await readJson(confirmationTemplatePath)
const comparisonHtml = await fs.readFile(comparisonHtmlPath, 'utf8')

assert.equal(sha256(await readBytes(sourcePdfPath)), 'sha256:df0c4e0a0d1aee4557f122591e3b778d7b48f2f324d75dba120343bb00926c80')
assert.equal((await readBytes(sourcePdfPath)).byteLength, 505330)

const pipelineStrip = await readBytes(path.join(paperRoot, 'figures/reading-d-q33.png'))
const publicStrip = await readBytes(path.join(
  rootDir,
  'app/public/paper-assets/paper-mock-sz-2026-m1/latest/figures/reading-d-q33.png',
))
assert.deepEqual(pipelineStrip, publicStrip, 'both tracked full strips must remain byte-identical')
assert.equal(sha256(pipelineStrip), 'sha256:60f02d3ac7194ac22d52137f0e64801d348818548d3e385bf6200c025aa8702d')
assert.equal(pipelineStrip.byteLength, 64006)
assert.deepEqual(inspectPng(pipelineStrip), { width: 1380, height: 220 })

for (const [relativePath, digest] of Object.entries(canonicalBaseline)) {
  assert.equal(
    sha256(await readBytes(path.join(
      rootDir,
      'app/public/paper-assets/paper-mock-sz-2026-m1/latest',
      relativePath,
    ))),
    digest,
    `${relativePath} must remain at the pre-selection publication baseline`,
  )
}
assert.equal(
  sha256(await readBytes(path.join(paperRoot, 'figures/writing-application-lamp.png'))),
  'sha256:9346f47e4ae61541a9e8e3bd59f8b1bd3f665400928c9ef325d039f4e61b0e81',
)

const currentGroups = await readJson(path.join(
  rootDir,
  'app/public/paper-assets/paper-mock-sz-2026-m1/latest/canonical/canonical-question-groups-v1.json',
))
const readingA = currentGroups.groups.find((group) => group.identity.groupId === 'group-mock-sz-2026-m1-reading-a')
const readingD = currentGroups.groups.find((group) => group.identity.groupId === groupId)
assert.equal(readingA.semanticDigest, 'sha256:156279ad4653048ad5f1112f0776aaff969a1cc235372c8273b390a1e705c6d4')
assert.equal(readingD.semanticDigest, 'sha256:b5ba924837e39da1d74ac42af9ab40c9b4707c17e95ff0036dbd255f64aa329f')
assert.deepEqual(readingD.media, [])
assert.ok(JSON.stringify(readingD).includes('[Fig.]'), 'Stop A must not migrate the historical Q33 placeholders')

const pageStream = execFileSync('qpdf', [
  '--show-object=57',
  '--filtered-stream-data',
  sourcePdfPath,
], { encoding: 'utf8' }).replace(/\s+/gu, ' ')
const imageInventory = execFileSync('pdfimages', [
  '-f', '4', '-l', '4', '-list', sourcePdfPath,
], { encoding: 'utf8' })
for (const label of labels) {
  const expected = expectedRaw[label]
  assert.ok(pageStream.includes(expected.command), `Option ${label} must retain its exact PDF placement command`)
  assert.match(
    imageInventory,
    new RegExp(`\\s${expected.width}\\s+${expected.height}\\s+rgb.+${expected.object.replace(' ', '\\s+')}\\s+`),
    `Option ${label} must retain its page-4 PDF image object`,
  )
  const rawBytes = await readBytes(path.join(evidenceRoot, `source-objects/${label}.jpg`))
  assert.equal(rawBytes.byteLength, expected.bytes)
  assert.equal(sha256(rawBytes), expected.sha256)
  assert.deepEqual(jpegDimensions(rawBytes), { width: expected.width, height: expected.height })
}

assert.deepEqual(candidatePackage.sourceCapture, sourceCapture)
assert.equal(sourceCapture.digest, digestJson(withoutKey(withoutKey(sourceCapture, 'captureId'), 'digest')))
assert.equal(sourceCapture.captureId, `source-capture:${sourceCapture.digest.slice('sha256:'.length, 28)}`)
assert.deepEqual(sourceCapture.assertions, [], 'selection evidence must carry no answer assertions')
assert.equal(sourceCapture.observations.length, 4)
assert.equal(sourceCapture.sourceSpans.length, 4)
assert.equal(sourceCapture.documents.length, 6)

const documentsByInput = new Map(sourceCapture.documents.map((document) => [document.inputKey, document]))
const questionDocument = documentsByInput.get('q33_question_pdf')
const stripDocument = documentsByInput.get('q33_full_strip_baseline')
assert.equal(questionDocument.sha256, 'sha256:df0c4e0a0d1aee4557f122591e3b778d7b48f2f324d75dba120343bb00926c80')
assert.equal(stripDocument.sha256, sha256(pipelineStrip))
assert.equal(stripDocument.byteLength, pipelineStrip.byteLength)
assert.deepEqual(
  new Uint8Array(Buffer.from(stripDocument.encodedBytes, 'base64')),
  pipelineStrip,
  'Source Capture must retain exact full-strip baseline bytes',
)

for (const [index, label] of labels.entries()) {
  const expectedOwner = {
    kind: 'reading_option',
    groupId,
    questionId,
    optionId: `option:${questionId}:${label}`,
  }
  const observationId = `observation:paper-mock-sz-2026-m1:q33:option:${label}`
  const sourceObservation = sourceCapture.observations[index]
  const persistedObservation = candidatePackage.observations[index]
  assert.equal(sourceObservation.observationId, observationId)
  assert.equal(sourceObservation.order, index, 'A-D authority must be source placement order')
  assert.equal(sourceObservation.value.sourcePosition, index)
  assert.equal(sourceObservation.value.sourcePositionRule, 'pdf_page_4_xobject_placement_left_to_right')
  assert.deepEqual(sourceObservation.value.targetOwner, expectedOwner)
  assert.equal(sourceObservation.value.sourcePage, 4)
  assert.equal(sourceObservation.value.pdfXObject, expectedRaw[label].xobject)
  assert.equal(sourceObservation.value.pdfObject, expectedRaw[label].object)
  assert.equal(sourceObservation.value.placementCommand, expectedRaw[label].command)
  assert.deepEqual(sourceObservation.value.rawImageDocumentRef, {
    documentId: documentsByInput.get(`q33_pdf_xobject_${label}`).documentId,
    inputKey: `q33_pdf_xobject_${label}`,
    sha256: expectedRaw[label].sha256,
    byteLength: expectedRaw[label].bytes,
    pixelWidth: expectedRaw[label].width,
    pixelHeight: expectedRaw[label].height,
  })
  assert.equal(sourceObservation.value.fullStripBaselineRef.sha256, sha256(pipelineStrip))
  assert.deepEqual(persistedObservation.owner, expectedOwner)
  assert.equal(persistedObservation.source.coordinate.kind, 'page_region')
  assert.equal(persistedObservation.source.coordinate.page, 4)
}

assert.equal(candidatePackage.schemaVersion, 'visual-import-candidate-v1')
assert.equal(candidatePackage.status, 'awaiting_teacher_confirmation')
assert.equal(candidatePackage.packageDigest, digestJson(withoutKey(candidatePackage, 'packageDigest')))
assert.equal(candidatePackage.observations.length, 4)
assert.equal(candidatePackage.candidates.length, 12)
assert.equal(keysNamed(candidatePackage, 'correctOptionId').length, 0)
assert.equal(keysNamed(candidatePackage, 'answer').length, 0)
assert.ok(candidatePackage.unresolvedIssues.every((issue) => issue.code === 'VISUAL_CONFIRMATION_REQUIRED'))

const rebuilt = createVisualImportCandidate({
  sourceCapture: candidatePackage.sourceCapture,
  observations: candidatePackage.observations.map((observation) => ({
    observationId: observation.observationId,
    owner: observation.owner,
    sourceCrop: observation.sourceCrop,
  })),
  candidates: candidatePackage.candidates.map((candidate) => withoutKey(candidate, 'candidateDigest')),
})
assert.deepEqual(rebuilt, candidatePackage, 'Ticket 01 create seam must reproduce the exact persisted package')

for (const label of labels) {
  const observationId = `observation:paper-mock-sz-2026-m1:q33:option:${label}`
  const candidates = candidatePackage.candidates.filter((candidate) => candidate.observationId === observationId)
  assert.deepEqual(candidates.map((candidate) => candidate.method), methods)
  assert.equal(new Set(candidates.map((candidate) => candidate.candidateDigest)).size, 3)
  const sourceCrop = candidates.find((candidate) => candidate.method === 'source_crop')
  const observation = candidatePackage.observations.find((entry) => entry.observationId === observationId)
  assert.deepEqual(sourceCrop.artifact, observation.sourceCrop, 'source_crop must remain the exact equal-authority fallback')
  for (const candidate of candidates) {
    const bytes = new Uint8Array(Buffer.from(candidate.artifact.encodedBytes, 'base64'))
    assert.equal(candidate.artifact.mimeType, 'image/png')
    assert.equal(candidate.artifact.byteLength, bytes.byteLength)
    assert.equal(candidate.artifact.sha256, sha256(bytes))
    assert.deepEqual(inspectPng(bytes), {
      width: candidate.artifact.pixelWidth,
      height: candidate.artifact.pixelHeight,
    })
    assert.equal(candidate.candidateDigest, digestJson(withoutKey(candidate, 'candidateDigest')))
    const relationships = candidate.sourceTruthChecklist.map((entry) => entry.relationship)
    assert.deepEqual(relationships.sort(), [
      'aspect_ratio',
      'connectivity',
      'containment',
      'count',
      'dark_light_topology',
      'gaps',
      'independent_option_relationship',
      'internal_whitespace',
      'labels',
      'order',
      'orientation',
    ])
    if (candidate.method === 'vector_authored') {
      assert.match(candidate.reproducibility.editableVector, new RegExp(`vector-evidence/${label}\\.svg sha256:[0-9a-f]{64}`))
      assert.match(candidate.reproducibility.tool, /rsvg-convert 2\.62\.1/)
    }
    if (candidate.method === 'reference_restored') {
      assert.match(candidate.reproducibility.prompt, /Use case: scientific-educational\. Edit mode: precise preservation\./)
      assert.match(candidate.reproducibility.tool, /built-in image_gen\.imagegen default edit path/)
      assert.match(candidate.reproducibility.tool, /no CLI or API fallback/)
    }
  }
}

assert.equal(confirmationTemplate.schemaVersion, 'visual-teacher-confirmation-v1')
assert.equal(confirmationTemplate.packageDigest, candidatePackage.packageDigest)
assert.deepEqual(confirmationTemplate.decisions, [], 'Stop A template must default to no selection')
const unresolved = confirmVisualImportCandidate(candidatePackage, confirmationTemplate)
assert.equal(unresolved.status, 'unresolved')
assert.equal(unresolved.confirmedSelections.length, 0)
assert.equal(unresolved.unresolvedIssues.length, 4)
assert.equal(keysNamed(unresolved, 'canonicalPaper').length, 0)
assert.equal(keysNamed(unresolved, 'canonicalMediaRef').length, 0)

const exactSourceCropConfirmation = {
  schemaVersion: 'visual-teacher-confirmation-v1',
  packageDigest: candidatePackage.packageDigest,
  decisions: candidatePackage.observations.map((observation) => ({
    observationId: observation.observationId,
    owner: observation.owner,
    disposition: 'confirmed',
    selectedCandidateDigest: candidatePackage.candidates.find((candidate) => (
      candidate.observationId === observation.observationId
      && candidate.method === 'source_crop'
    )).candidateDigest,
  })),
}
const exactSourceCropSelection = confirmVisualImportCandidate(candidatePackage, exactSourceCropConfirmation)
assert.equal(exactSourceCropSelection.status, 'confirmed')
assert.ok(exactSourceCropSelection.confirmedSelections.every((selection) => selection.method === 'source_crop'))
assert.equal(keysNamed(exactSourceCropSelection, 'canonicalPaper').length, 0)
assert.equal(keysNamed(exactSourceCropSelection, 'correctOptionId').length, 0)

const staleConfirmation = structuredClone(exactSourceCropConfirmation)
staleConfirmation.packageDigest = `sha256:${'0'.repeat(64)}`
assertCode(
  () => confirmVisualImportCandidate(candidatePackage, staleConfirmation),
  'VISUAL_CONFIRMATION_PACKAGE_MISMATCH',
  'confirmation must bind the exact package digest',
)
const swappedOwner = structuredClone(exactSourceCropConfirmation)
swappedOwner.decisions[0].owner.optionId = `option:${questionId}:B`
assertCode(
  () => confirmVisualImportCandidate(candidatePackage, swappedOwner),
  'VISUAL_CONFIRMATION_OWNER_MISMATCH',
  'confirmation must repeat the complete exact owner',
)
const wrongObservationCandidate = structuredClone(exactSourceCropConfirmation)
wrongObservationCandidate.decisions[0].selectedCandidateDigest = exactSourceCropConfirmation.decisions[1].selectedCandidateDigest
assertCode(
  () => confirmVisualImportCandidate(candidatePackage, wrongObservationCandidate),
  'VISUAL_CONFIRMATION_CANDIDATE_MISMATCH',
  'a digest from another observation must fail closed',
)
const changedPngDigest = structuredClone(candidatePackage)
changedPngDigest.candidates[0].artifact.sha256 = candidatePackage.candidates[1].artifact.sha256
assertCode(
  () => confirmVisualImportCandidate(rebindCandidate(changedPngDigest, 0), exactSourceCropConfirmation),
  'VISUAL_CANDIDATE_PNG_DIGEST_MISMATCH',
  'changed PNG digest must fail fresh byte validation',
)
const changedPngDimensions = structuredClone(candidatePackage)
changedPngDimensions.candidates[0].artifact.pixelWidth += 1
assertCode(
  () => confirmVisualImportCandidate(rebindCandidate(changedPngDimensions, 0), exactSourceCropConfirmation),
  'VISUAL_CANDIDATE_PNG_DIMENSIONS_MISMATCH',
  'changed PNG dimensions must fail fresh IHDR validation',
)
const changedPngBytes = structuredClone(candidatePackage)
changedPngBytes.candidates[0].artifact.encodedBytes = candidatePackage.candidates[1].artifact.encodedBytes
assertCode(
  () => confirmVisualImportCandidate(rebindCandidate(changedPngBytes, 0), exactSourceCropConfirmation),
  'VISUAL_CANDIDATE_PNG_BYTE_LENGTH_MISMATCH',
  'changed PNG bytes must fail before confirmation',
)

assert.equal(comparisonManifest.manifestDigest, digestJson(withoutKey(comparisonManifest, 'manifestDigest')))
assert.equal(comparisonManifest.packageDigest, candidatePackage.packageDigest)
assert.equal(comparisonManifest.state, 'awaiting_owner_exact_digest_selection')
assert.equal(comparisonManifest.selection.default, 'unresolved')
assert.equal(comparisonManifest.selection.sourceCropIsEqualFallback, true)
assert.deepEqual(comparisonManifest.layout.layoutRef, readingOptionFigureLayoutRef)
assert.equal(comparisonManifest.layout.rowWidthPt, readingOptionFigureLayout.topology.rowWidthPt)
assert.equal(comparisonManifest.layout.trackWidthPt, readingOptionFigureLayout.topology.trackWidthPt)
assert.equal(comparisonManifest.layout.imageBoxWidthPt, readingOptionFigureLayout.imageBox.widthPt)
assert.equal(comparisonManifest.layout.imageBoxHeightPt, readingOptionFigureLayout.imageBox.heightPt)
assert.equal(comparisonManifest.layout.objectFit, readingOptionFigureLayout.imageBox.objectFit)
assert.equal(comparisonManifest.layout.crop, false)
assert.equal(comparisonManifest.layout.stretch, false)
assert.equal(comparisonManifest.observations.length, 4)
assert.ok(comparisonManifest.observations.every((observation) => observation.candidates.length === 3))
assert.ok(comparisonManifest.observations.flatMap((observation) => observation.candidates).every((candidate) => (
  candidate.agentVisualStatus !== 'passed'
)))

for (const requiredFragment of [
  'grid-template-columns: repeat(4, 109.55pt)',
  'width: 438.2pt',
  'width: 96pt; height: 60pt',
  'object-fit: contain',
  'option-label',
  '-- no selection (unresolved) --',
  "schemaVersion: 'visual-teacher-confirmation-v1'",
  'selectedCandidateDigest',
]) assert.ok(comparisonHtml.includes(requiredFragment), `comparison HTML lacks ${requiredFragment}`)
assert.equal((comparisonHtml.match(/class=\\"candidate-set\\"/gu) || []).length, 0, 'candidate rows must be data-built once per method, not duplicated markup')
assert.match(comparisonHtml, /for \(const method of methods\)/)
assert.match(comparisonHtml, /for \(const observation of manifest\.observations\)/)

console.log(JSON.stringify({
  verifier: 'paper-mock-sz-2026-m1-q33-option-figure-selection-v1',
  result: 'PASS',
  packageDigest: candidatePackage.packageDigest,
  sourceCaptureDigest: sourceCapture.digest,
  observations: candidatePackage.observations.length,
  candidates: candidatePackage.candidates.length,
  methods,
  layout: `${comparisonManifest.layout.imageBoxWidthPt}x${comparisonManifest.layout.imageBoxHeightPt}pt contain`,
  selectionState: unresolved.status,
  canonicalMaterialized: false,
  finalGatesRun: false,
}, null, 2))
