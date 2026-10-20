#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { digestJson, stableStringify } from '../shared/paper-canonical/stable.mjs'
import { manifestProductFiles } from '../server/paper-import/pdfProductSet.mjs'
import {
  buildProductPreviewPayload, buildStoredReviewSubject, buildTargetReviewSubject,
  inspectReviewFile, reviewSubjectBundleDigest, validReviewRelativePath,
} from '../server/import-review/reviewSubject.mjs'
import { compareReviewSubjects } from '../server/import-review/reviewCompatibility.mjs'
import {
  compareReviewPublicationContent, mapReviewPublicationConsumer,
} from '../server/import-review/reviewPublicationContent.mjs'

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const clone = value => structuredClone(value)
const targetBuildId = hash('current-server-build')
let checks = 0
function check(label, fn) {
  fn()
  checks++
  console.log(`PASS ${label}`)
}

// Small, invented source facts. No compilation, rendering, pdfinfo or original
// copyrighted passage. PDF bytes stand for a previously finalized commitment:
// this suite tests hash preservation, not first-finalize PDF validation.
async function fixture({ publicProfile = false, noListening = false, ocrReport = false, sidecarPadding = 0, payloadPadding = 0 } = {}) {
  const paperId = 'paper-mock-review-2026'
  const projection = {
    paperId, sourceDigest: hash('source'), candidateDigest: hash('candidate'),
    visibleStructureDigest: digestJson([{ kind: 'group', groupId: 'g1' }]),
    importProfile: publicProfile ? 'public-paper-v1' : null,
    analysisDigest: publicProfile ? null : hash('analyses'),
    paragraphSummariesDigest: publicProfile ? hash('summaries') : null,
    publicSearchMetadataDigest: publicProfile ? hash('search') : null,
    paperAsset: {
      schemaVersion: 'paper-asset-v1',
      paper: { paperId, title: '内容审查 fixture', subject: 'English', source: 'fixture', assetVersion: 1, status: 'draft' },
      sources: { sourceType: '模拟题', primarySourceType: 'pdf' }, layoutTree: { parts: [] },
      content: {
        blocks: [{ type: 'group', groupId: 'g1' }],
        groups: { g1: { groupId: 'g1', groupType: 'reading', title: 'A', questionIds: ['q1', 'q2'],
          passage: { text: 'A small invented passage.' } } },
        questions: {
          q1: { questionId: 'q1', questionNo: 21, groupId: 'g1', stem: 'Which one?',
            options: [{ label: 'A', text: 'First' }, { label: 'B', text: 'Second' }] },
          q2: { questionId: 'q2', questionNo: 22, groupId: 'g1', stem: 'Why?' },
        },
      },
      answerKey: { answers: { q1: { value: 'A' }, q2: { value: 'B' } } }, analysis: {},
    },
    analysisSidecars: publicProfile ? {} : {
      'reading-choice-analysis-v1.json': { sourceAssetVersion: 1,
        groups: { g1: { overview: '第一项符合原文', questions: { q1: { explanation: '原文有对应信息' } } } } },
    },
    consumption: {
      disposition: 'ready', paperId, sourceAssetVersion: 1, sourceAssetDigest: hash('source'),
      authorityRef: { manifestVersion: '68', manifestDigest: hash('authority') },
      profileRef: { id: 'nck1', version: 16 }, consumerContractRef: { id: 'screen', version: 47, digest: hash('consumer') },
      visibleStructure: [{ kind: 'group', groupId: 'g1' }],
      visibleStructureDigest: digestJson([{ kind: 'group', groupId: 'g1' }]),
      selections: [{ mode: 'canonical', familyContractId: 'reading', groupIds: ['g1'],
        projectedOccurrences: [{ kind: 'group', groupId: 'g1', questions: [{ questionId: 'q1', stem: 'Which one?' }] }] }],
      mediaArtifacts: [{ mediaId: 'image:1', sha256: hash('image bytes'), presentation: { selection: 'source' } }],
      paperHeaderTitle: '试题', paperSourceType: '模拟题', diagnostics: [],
    },
    compilation: { artifacts: { canonicalPaper: { diagnostic: 'old' } }, normalizationReport: { issues: [] } },
  }
  if (!noListening) {
    projection.sourceInput = { listeningAudio: { sha256: hash('audio'), byteLength: 5, durationSeconds: 30 } }
    projection.reviewedListening = { review: { groups: [{
      decision: 'usable', segmentId: 's1', questionNumbers: [1],
      playback: { startSeconds: 0, endSeconds: 5 },
    }] } }
  }
  const raw = new Map()
  const files = []
  function add(path, role, mediaType, bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(typeof bytes === 'string' ? bytes : JSON.stringify(bytes))
    files.push({ path, role, mediaType, byteLength: buffer.length, sha256: hash(buffer) })
    raw.set(path, buffer)
  }
  add('config.json', 'config', 'application/json', { provenance: { year: 2026, paperName: '内容审查 fixture', source: 'fixture' } })
  if (ocrReport) add('agent-ocr-correction-report-v2.json', 'agent_ocr_correction_report', 'application/json',
    { schemaVersion: 'agent-ocr-correction-report-v2', paperId,
      ocrRevisionId: 'rev-ocr-fixture', ocrConfirmationId: 'ocr-confirmation-fixture',
      originalSourceSetDigest: hash('source-set'), ocrEvidenceDigest: hash('ocr-evidence'),
      sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
      entries: [{ ocrItemId: 'ocr-item-fixture', category: 'source_spelling_error',
        before: 'Teh', after: 'The', reason: 'Synthetic source spelling error',
        sourceLocator: { documentId: 'question-source-1', page: 1 },
        materializationTarget: { jsonPointer: '/listening/transcript/0/text' } }] })
  if (sidecarPadding) add('materialization/nck1-ocr-source-evidence-v1.json', 'ocr_source_evidence', 'application/json',
    { schemaVersion: 'nck1-ocr-source-evidence-v1', paperId, sourceSetDigest: hash('source-set'),
      engine: { name: 'tesseract', version: 'synthetic-fixture' }, confidenceThreshold: 0.85,
      documents: [{ documentId: 'question-source-1', pages: [{ page: 1,
        raster: { recipe: { kind: 'pdf_page_region_v1', density: 150,
          region: { x: 0, y: 0, width: 1, height: 1 } }, sha256: hash('raster'), pixelWidth: 100, pixelHeight: 100 },
        regions: [{ regionId: 'r1', kind: 'text', region: { x: 0, y: 0, width: 1, height: 1 } }],
        observations: [{ observationId: 'o1', regionId: 'r1', region: { x: 0, y: 0, width: 1, height: 1 },
          text: 'a'.repeat(sidecarPadding), confidence: 0.99, alternatives: [] }], readingOrderEdges: [] }] }],
      evidenceDigest: hash('evidence') })
  if (publicProfile) {
    add('paragraph-summaries-v1.json', 'paragraph_summaries', 'application/json', { groups: [] })
    projection.paragraphSummariesDigest = files.at(-1).sha256
    add('public-search-metadata-v1.json', 'public_search_metadata', 'application/json', { groups: [] })
    projection.publicSearchMetadataDigest = files.at(-1).sha256
  } else projection.analysisDigest = digestJson(projection.analysisSidecars)
  add('unlisted-future-input.json', 'new_role', 'application/json', { caption: 'This still belongs to the review.' })
  add('images/figure.png', 'source_image', 'image/png', 'image bytes')
  if (!noListening) add('materialization/listening-audio/playback.mp3', 'listening_audio_playback', 'audio/mpeg', 'audio')
  const inputDigest = digestJson([...files].sort((a, b) => a.path.localeCompare(b.path)))
  const manifest = {
    schemaVersion: noListening ? 'paper-pdf-products-v3' : 'paper-pdf-products-v1',
    ...(noListening ? { listening: 'absent-by-exam-design', economyPageLimit: 8 } : {}),
    paperId, paperName: '内容审查 fixture', inputDigest, examDate: { year: 2026, month: 10 }, files: [],
  }
  for (const file of manifestProductFiles(manifest)) {
    add(file.path, file.role, file.mediaType, `%PDF-fixture-${file.path}`)
    const actual = files.at(-1)
    manifest.files.push({ path: actual.path, mediaType: actual.mediaType,
      sha256: actual.sha256, byteLength: actual.byteLength, pageCount: 1 })
  }
  add('products/manifest-v1.json', 'pdf_product_manifest', 'application/json', manifest)
  const bundle = {
    schemaVersion: ocrReport ? 'web-import-review-bundle-v3' : publicProfile ? 'web-import-review-bundle-v2' : 'web-import-review-bundle-v1',
    paperId, paperName: '内容审查 fixture', sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest, visibleStructureDigest: projection.visibleStructureDigest,
    ...(publicProfile ? { importProfile: projection.importProfile,
      paragraphSummariesDigest: projection.paragraphSummariesDigest,
      publicSearchMetadataDigest: projection.publicSearchMetadataDigest } : { analysisDigest: projection.analysisDigest }),
    producerBuildId: 'original-producer', files,
  }
  if (ocrReport) {
    bundle.ocrCorrectionReportVersion = 'agent-ocr-correction-report-v2'
    bundle.ocrCorrectionReportDigest = digestJson(JSON.parse(raw.get('agent-ocr-correction-report-v2.json')))
  }
  bundle.bundleDigest = reviewSubjectBundleDigest(bundle)
  const revision = { id: 'revision-original', paperId, reviewKind: 'candidate', state: 'approved',
    rendererBuildId: 'historical-renderer', bundleDigest: bundle.bundleDigest,
    sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest, manifest: bundle }
  if (payloadPadding) projection.paperAsset.content.groups.g1.passage.text = 'b'.repeat(payloadPadding)
  const payload = buildProductPreviewPayload(revision, projection)
  const preview = { revision_id: revision.id, bundle_digest: revision.bundleDigest,
    renderer_build_id: revision.rendererBuildId, payload_digest: digestJson(payload), payload_json: JSON.stringify(payload) }
  const fileEvidence = []
  for (const file of files) {
    const buffer = raw.get(file.path)
    fileEvidence.push(await inspectReviewFile(file, [buffer.subarray(0, 3), buffer.subarray(3)]))
  }
  return { revision, projection, preview, storedFiles: files, fileEvidence, raw }
}
const f = await fixture()
const baseline = buildStoredReviewSubject(f)
{
  const actual = await fixture({ publicProfile: true, ocrReport: true })
  const report = actual.storedFiles.find(file => file.path === 'agent-ocr-correction-report-v2.json')
  assert.notEqual(report.sha256, actual.revision.manifest.ocrCorrectionReportDigest)
  assert.equal(buildStoredReviewSubject(actual).ok, true)
  for (const key of ['paragraphSummariesDigest', 'publicSearchMetadataDigest', 'ocrCorrectionReportDigest']) {
    const changed = clone(actual)
    changed.revision.manifest[key] = hash('wrong')
    changed.revision.manifest.bundleDigest = reviewSubjectBundleDigest(changed.revision.manifest)
    changed.revision.bundleDigest = changed.revision.manifest.bundleDigest
    changed.preview.bundle_digest = changed.revision.bundleDigest
    assert.equal(buildStoredReviewSubject(changed).reasonCode, 'BASELINE_UNTRUSTED', key)
  }
  console.log('PASS v3 OCR canonical JSON digest differs from byte SHA; all three sidecar digest guards still reject wrong values')
}
{
  const large = await fixture({ sidecarPadding: 9 * 1024 ** 2 })
  const built = buildStoredReviewSubject(large)
  assert.equal(built.ok, true, JSON.stringify(built))
  assert(built.metrics.subjectBytes < 100_000)
  const entry = built.subject.components.sidecar.find(file => file.role === 'ocr_source_evidence')
  assert.equal(Object.hasOwn(entry, 'json'), false)
  assert.equal(entry.jsonDigest, digestJson(large.fileEvidence.find(file => file.path === entry.path).json))
  const tooLarge = await fixture({ payloadPadding: 8 * 1024 ** 2 })
  assert.equal(buildStoredReviewSubject(tooLarge).reasonCode, 'SUBJECT_TOO_LARGE')
  console.log('PASS 9 MiB OCR evidence is read separately and committed by digest; actual subject retains its 8 MiB cap')
}
function compare(projection = f.projection, extra = {}) {
  const target = buildTargetReviewSubject({ ...f, projection, inventory: f.storedFiles, ...extra })
  return compareReviewSubjects({ baseline, target, targetBuildId })
}
check('complete stored evidence establishes six-component baseline', () => {
  assert.equal(baseline.ok, true, JSON.stringify(baseline))
  assert.equal(baseline.origin, 'stored_evidence')
  assert.equal(Object.keys(baseline.componentDigests).length, 6)
  assert.equal(baseline.subject.components.sidecar.some(file => file.role === 'new_role'), true)
})
check('identical content is equal across server build identities', () => {
  assert.equal(compare().result, 'equal')
  assert.equal(compareReviewSubjects({ baseline, target: buildTargetReviewSubject({ ...f, inventory: f.storedFiles }),
    targetBuildId: hash('another-server-build') }).result, 'equal')
})
const mutations = [
  ['question text', p => { p.paperAsset.content.questions.q1.stem = 'Changed?' }],
  ['answer', p => { p.paperAsset.answerKey.answers.q1.value = 'B' }],
  ['analysis', p => { p.analysisSidecars['reading-choice-analysis-v1.json'].groups.g1.questions.q1.explanation = '不同解析' }],
  ['question order', p => { p.paperAsset.content.groups.g1.questionIds.reverse() }],
  ['options order', p => { p.paperAsset.content.questions.q1.options.reverse() }],
  ['projected occurrence', p => { p.consumption.selections[0].projectedOccurrences[0].questions[0].stem = 'Changed admission?' }],
  ['header', p => { p.consumption.paperHeaderTitle = '新卷头' }],
  ['sourceType', p => { p.consumption.paperSourceType = '真题' }],
  ['media selection', p => { p.consumption.mediaArtifacts[0].presentation.selection = 'candidate' }],
  ['audio duration', p => { p.sourceInput.listeningAudio.durationSeconds++ }],
  ['audio segments', p => { p.reviewedListening.review.groups[0].playback.endSeconds++ }],
  ['new payload field', p => { p.consumption.newDisplayField = 'not ignored' }],
  ['named timestamp is still content', p => { p.paperAsset.content.questions.q1.timestamp = '2026' }],
  ['named digest is still content', p => { p.paperAsset.content.questions.q1.digest = hash('new') }],
]
for (const [name, mutate] of mutations) {
  const changed = clone(f.projection)
  mutate(changed)
  check(`${name} changes actual input and returns different`, () => {
    assert.notEqual(stableStringify(changed), stableStringify(f.projection), 'counterexample must mutate its input')
    assert.notDeepEqual(buildProductPreviewPayload(f.revision, changed), buildProductPreviewPayload(f.revision, f.projection))
    const result = compare(changed)
    assert.equal(result.result, 'different', JSON.stringify(result))
    assert.equal(result.reasonCode, 'SUBJECT_CHANGED')
    assert.ok(result.differences.length)
  })
}
check('Canonical/Source Capture/normalization diagnostic changes do not invalidate content', () => {
  const changed = clone(f.projection)
  changed.compilation.artifacts.canonicalPaper.diagnostic = 'new'
  changed.compilation.artifacts.sourceCapture = { internalRepresentation: 'new' }
  changed.compilation.normalizationReport.issues.push({ code: 'DIAGNOSTIC_ONLY' })
  assert.notDeepEqual(changed, f.projection)
  assert.equal(compare(changed).result, 'equal')
})
check('JSON key order is canonical, array order is preserved', () => {
  const changed = clone(f.projection)
  changed.paperAsset.paper = Object.fromEntries(Object.entries(changed.paperAsset.paper).reverse())
  assert.notEqual(JSON.stringify(changed), JSON.stringify(f.projection))
  assert.equal(compare(changed).result, 'equal')
})
for (const path of ['products/answerOnly.pdf', 'images/figure.png', 'materialization/listening-audio/playback.mp3', 'config.json']) {
  const fileEvidence = clone(f.fileEvidence)
  const index = f.storedFiles.findIndex(file => file.path === path)
  const originalBytes = f.raw.get(path)
  const alteredBytes = Buffer.from(originalBytes)
  alteredBytes[alteredBytes.length - 1] ^= 1
  assert.notDeepEqual(alteredBytes, originalBytes, 'byte mutation must be real')
  fileEvidence[index] = await inspectReviewFile(f.storedFiles[index], [alteredBytes])
  check(`changed sealed bytes: ${path}`, () => {
    assert.notEqual(fileEvidence[index].sha256, f.fileEvidence[index].sha256)
    const result = compare(f.projection, { fileEvidence })
    assert.equal(result.result, 'different')
    assert.equal(result.reasonCode, 'SEALED_FILE_CHANGED')
  })
}
// Construct a complete, internally consistent alternative target snapshot.
// The input recipe is fixture preparation, not an alternate comparator.
for (const [label, mutate] of [
  ['product pageCount', (files, raw) => {
    const manifest = JSON.parse(Buffer.from(raw.get('products/manifest-v1.json')).toString())
    manifest.files[0].pageCount++
    raw.set('products/manifest-v1.json', Buffer.from(JSON.stringify(manifest)))
  }],
  ['new inventory role', files => { files.find(file => file.path === 'unlisted-future-input.json').role = 'changed_role' }],
  ['new input file', (files, raw) => {
    files.push({ path: 'new-input.json', role: 'new_role', mediaType: 'application/json', sha256: hash('placeholder'), byteLength: 0 })
    raw.set('new-input.json', Buffer.from('{"visible":"new caption"}'))
  }],
  ['removed input file', files => { files.splice(files.findIndex(file => file.path === 'unlisted-future-input.json'), 1) }],
]) {
  const files = clone(f.storedFiles)
  const raw = clone(f.raw)
  mutate(files, raw)
  for (const file of files) { file.sha256 = hash(raw.get(file.path)); file.byteLength = raw.get(file.path).byteLength }
  const manifest = JSON.parse(Buffer.from(raw.get('products/manifest-v1.json')).toString())
  manifest.inputDigest = digestJson(files.filter(file => !file.path.startsWith('products/')).sort((a, b) => a.path.localeCompare(b.path)))
  const manifestBytes = Buffer.from(JSON.stringify(manifest))
  raw.set('products/manifest-v1.json', manifestBytes)
  const descriptor = files.find(file => file.path === 'products/manifest-v1.json')
  descriptor.sha256 = hash(manifestBytes)
  descriptor.byteLength = manifestBytes.length
  const fileEvidence = []
  for (const file of files) fileEvidence.push(await inspectReviewFile(file, [raw.get(file.path)]))
  check(`complete changed target: ${label}`, () => {
    assert.notDeepEqual(files, f.storedFiles, 'the target descriptors must really change')
    const result = compare(f.projection, { inventory: files, fileEvidence })
    assert.equal(result.result, 'different', JSON.stringify(result))
    assert.equal(result.reasonCode, 'SUBJECT_CHANGED')
  })
}
for (const [name, mutate] of [
  ['missing original preview', x => { x.preview = null }],
  ['missing file evidence', x => { x.fileEvidence.pop() }],
  ['missing required identity', x => { delete x.revision.manifest.analysisDigest }],
  ['DB/manifest disagreement', x => { x.storedFiles[0].role = 'changed' }],
  ['preview digest corruption', x => { x.preview.payload_digest = hash('wrong') }],
  ['historical renderer binding corruption', x => { x.preview.renderer_build_id = 'other' }],
  ['missing nested payload', x => {
    const payload = JSON.parse(x.preview.payload_json)
    delete payload.paperAsset.content.groups
    x.preview.payload_json = JSON.stringify(payload)
    x.preview.payload_digest = digestJson(payload)
  }],
  ['missing nested question stem', x => {
    const payload = JSON.parse(x.preview.payload_json)
    delete payload.paperAsset.content.questions.q1.stem
    x.preview.payload_json = JSON.stringify(payload)
    x.preview.payload_digest = digestJson(payload)
  }],
]) {
  const changed = clone(f)
  // Avoid aliasing manifest.files and storedFiles in cloned fixture.
  changed.storedFiles = clone(changed.storedFiles)
  const before = stableStringify({ revision: changed.revision, preview: changed.preview,
    storedFiles: changed.storedFiles, fileEvidence: changed.fileEvidence })
  mutate(changed)
  check(name, () => {
    assert.notEqual(stableStringify({ revision: changed.revision, preview: changed.preview,
      storedFiles: changed.storedFiles, fileEvidence: changed.fileEvidence }), before)
    const extracted = buildStoredReviewSubject(changed)
    assert.equal(extracted.ok, false)
    assert.equal(compareReviewSubjects({ baseline: extracted, target: null, targetBuildId }).result, 'unknown')
  })
}
for (const options of [{ publicProfile: true }, { publicProfile: true, noListening: true }, { noListening: true }]) {
  const profile = await fixture(options)
  const old = buildStoredReviewSubject(profile)
  const next = buildTargetReviewSubject({ ...profile, inventory: profile.storedFiles })
  check(`supported profile ${JSON.stringify(options)}`, () => {
    assert.equal(old.ok, true, JSON.stringify(old))
    assert.equal(next.ok, true, JSON.stringify(next))
    assert.equal(compareReviewSubjects({ baseline: old, target: next, targetBuildId }).result, 'equal')
    assert.equal(old.subject.components.products.files.length, options.noListening ? 3 : 4)
    assert.equal(old.subject.components.identity.importProfile, options.publicProfile ? 'public-paper-v1' : null)
  })
}
check('stored subject disagreement cannot reuse a favorable result', () => {
  const storedSubject = clone(baseline.subject)
  storedSubject.components.consumer.paperAsset.paper.title = 'tampered'
  assert.notDeepEqual(storedSubject, baseline.subject)
  assert.equal(compareReviewSubjects({ baseline, target: baseline, storedSubject, targetBuildId }).reasonCode, 'BASELINE_UNTRUSTED')
})
check('target binding and invalid build identity fail closed', () => {
  assert.equal(compareReviewSubjects({ baseline, target: baseline, targetBuildId: 'arbitrary-label' }).result, 'unknown')
  const target = clone(baseline)
  target.subject.revisionId = 'another-revision'
  target.subjectDigest = digestJson(target.subject)
  assert.equal(compareReviewSubjects({ baseline, target, targetBuildId }).reasonCode, 'TARGET_BINDING_INVALID')
})
check('subject exceeding 8 MiB is unknown, without truncation', () => {
  const projection = clone(f.projection)
  projection.paperAsset.content.questions.q1.stem = 'x'.repeat(8 * 1024 * 1024)
  assert.notEqual(projection.paperAsset.content.questions.q1.stem, f.projection.paperAsset.content.questions.q1.stem)
  const result = compare(projection)
  assert.equal(result.result, 'unknown')
  assert.equal(result.reasonCode, 'SUBJECT_TOO_LARGE')
})
check('unsafe and nonstandard paths are rejected', () => {
  for (const path of ['/tmp/file', '../file', 'a/../b', 'a//b', './a', 'a\\b', 'C:/file', 'a\u0000b']) {
    assert.equal(validReviewRelativePath(path), false, path)
  }
  assert.equal(validReviewRelativePath('source/file.pdf'), true)
})
check('publication consumer only maps its bound version envelope', () => {
  const consumption = clone(baseline.subject.components.consumer.consumption)
  const sealedManifest = { paperId: f.revision.paperId, sourceAssetVersion: 2,
    sourceAssetDigest: consumption.sourceAssetDigest, publicationDigest: hash('published') }
  consumption.sourceAssetVersion = 2
  consumption.publicationDigest = sealedManifest.publicationDigest
  assert.deepEqual(mapReviewPublicationConsumer({ subject: baseline.subject, consumption, sealedManifest, version: 2 }),
    baseline.subject.components.consumer.consumption)
  const changed = clone(consumption)
  changed.selections[0].projectedOccurrences[0].questions[0].stem = 'Changed by admission'
  assert.notDeepEqual(changed, consumption)
  assert.notDeepEqual(mapReviewPublicationConsumer({ subject: baseline.subject, consumption: changed, sealedManifest, version: 2 }),
    baseline.subject.components.consumer.consumption, 'actual admission text must survive mapping')
  assert.throws(() => mapReviewPublicationConsumer({ subject: baseline.subject,
    consumption: { ...consumption, publicationDigest: hash('wrong') }, sealedManifest, version: 2 }))
})
check('unmapped real package fields remain unknown, never silently omitted', () => {
  const result = compareReviewPublicationContent({ subject: baseline.subject,
    packageData: { arbitraryNewDisplayContent: 'must map' }, consumption: {}, sealedManifest: {}, version: 2 })
  assert.equal(result.result, 'unknown')
  assert.equal(result.reasonCode, 'UNSUPPORTED_PUBLICATION_MAPPING')
})
console.log(`PASS review compatibility: ${checks} checks; no DB, Chromium, pagination or pdfinfo`)
