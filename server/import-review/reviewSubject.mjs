import { createHash } from 'node:crypto'
import { digestJson, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { LISTENING_AUDIO_PATHS } from '../paper-import/listeningAudioEvidence.mjs'
import { listeningReviewPrintNeutralPaths, reviewedPlaybackSegments } from '../paper-import/listeningReview.mjs'
import { manifestProductFiles } from '../paper-import/pdfProductSet.mjs'

export const REVIEW_SUBJECT_VERSION = 'review-content-subject-v2'
export const REVIEW_SUBJECT_MAX_BYTES = 8 * 1024 * 1024
export const REVIEW_JSON_FILE_MAX_BYTES = 64 * 1024 * 1024
export const REVIEW_COMPONENTS = Object.freeze(['identity', 'consumer', 'sidecar', 'media', 'products', 'inventory'])
const PRODUCT_MANIFEST = 'products/manifest-v1.json'
const SHA = /^sha256:[a-f0-9]{64}$/
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const own = (value, key) => Object.hasOwn(value || {}, key)
const same = (a, b) => stableStringify(a) === stableStringify(b)
const sortPath = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0

function fail(reasonCode, pointer = '') {
  throw Object.assign(new Error(reasonCode), { reviewContentError: true, reasonCode, pointer })
}

export function validReviewRelativePath(value) {
  return typeof value === 'string' && value.length > 0
    && !/[\\\u0000-\u001f\u007f]/.test(value) && !/^[A-Za-z]:/.test(value)
    && value.split('/').every(part => part && part !== '.' && part !== '..')
}

function descriptor(file) {
  if (!validReviewRelativePath(file?.path) || !SHA.test(file.sha256)
    || !Number.isSafeInteger(file.byteLength) || file.byteLength < 0
    || typeof file.role !== 'string' || !file.role || typeof file.mediaType !== 'string' || !file.mediaType) {
    fail('BASELINE_UNTRUSTED', '/inventory')
  }
  return Object.fromEntries(['path', 'role', 'mediaType', 'byteLength', 'sha256'].map(key => [key, file[key]]))
}

function inventory(files) {
  if (!Array.isArray(files) || !files.length) fail('MISSING_EVIDENCE', '/inventory')
  const result = files.map(descriptor).sort(sortPath)
  if (new Set(result.map(file => file.path)).size !== result.length) fail('BASELINE_UNTRUSTED', '/inventory')
  return result
}

// Streaming, no filesystem access and no PDF parser. The I/O boundary must
// securely open regular files (including every parent) and reject symlinks.
// Only bounded JSON bytes are retained; PDFs/audio are hashed and discarded.
function reviewFileInspector(file) {
  descriptor(file)
  const hash = createHash('sha256')
  const jsonChunks = []
  const json = file.mediaType === 'application/json' || file.path.endsWith('.json')
  let byteLength = 0
  let prefix = Buffer.alloc(0)
  function push(chunk) {
    if (!(chunk instanceof Uint8Array)) fail('MISSING_EVIDENCE', file.path)
    hash.update(chunk)
    byteLength += chunk.byteLength
    if (prefix.length < 5) prefix = Buffer.concat([prefix, Buffer.from(chunk.subarray(0, 5 - prefix.length))])
    if (json) {
      if (byteLength > REVIEW_JSON_FILE_MAX_BYTES) fail('JSON_FILE_TOO_LARGE', file.path)
      jsonChunks.push(Buffer.from(chunk))
    }
  }
  function finish() {
    const evidence = { path: file.path, sha256: `sha256:${hash.digest('hex')}`, byteLength, prefix: prefix.toString('ascii') }
    if (json) {
      try {
        let bytes = Buffer.concat(jsonChunks)
        jsonChunks.length = 0
        const text = bytes.toString('utf8')
        bytes = null
        evidence.json = JSON.parse(text)
      }
      // Preserve successful byte evidence even when tampering broke JSON syntax.
      // verifiedFiles classifies a changed hash before interpreting this flag.
      catch { evidence.jsonError = true }
    }
    return evidence
  }
  return { push, finish }
}

export async function inspectReviewFile(file, chunks) {
  const inspector = reviewFileInspector(file)
  for await (const chunk of chunks) inspector.push(chunk)
  return inspector.finish()
}

export function inspectReviewFileSync(file, chunks) {
  const inspector = reviewFileInspector(file)
  for (const chunk of chunks) inspector.push(chunk)
  return inspector.finish()
}

// Same historical bundle identity as importReviewStore.reviewBundleDigest.
// Kept independent of the store/DB/projection dependency graph for workers.
export function reviewSubjectBundleDigest(manifest) {
  const selected = {}
  for (const key of ['schemaVersion', 'paperId', 'paperName', 'sourceDigest', 'candidateDigest',
    'visibleStructureDigest', 'producerBuildId']) selected[key] = manifest[key]
  for (const key of ['expectedBaseRevisionId', 'analysisDigest', 'importProfile',
    'paragraphSummariesDigest', 'publicSearchMetadataDigest']) {
    if (manifest[key]) selected[key] = manifest[key]
  }
  if (manifest.ocrCorrectionReportDigest) {
    selected.ocrCorrectionReportVersion = manifest.ocrCorrectionReportVersion
    selected.ocrCorrectionReportDigest = manifest.ocrCorrectionReportDigest
  }
  // Preserve the legacy digest's locale ordering; subject inventory below uses
  // POSIX code-point ordering. Do not silently change historical bundle IDs.
  selected.files = manifest.files.map(descriptor).sort((a, b) => a.path.localeCompare(b.path))
  return digestJson(selected)
}

// Pure extraction of saveProductPreview's payload. No persistence or guard
// changes in step A; step B replaces the store's duplicate construction.
export function buildProductPreviewPayload(revision, projection) {
  const playback = projection.sourceInput?.listeningAudio || projection.analyzedPackage?.listeningAudio
  const playbackPath = projection.analyzedPackage
    ? projection.sourceProvenance?.members.find(member => member.role === 'audio')?.path
    : LISTENING_AUDIO_PATHS.playback
  return JSON.parse(JSON.stringify({
    paperAsset: projection.paperAsset,
    analysisSidecars: projection.analysisSidecars || {},
    consumption: { ...projection.consumption, ...(playback ? { listeningAudio: {
      relativePath: 'listening/playback.mp3', sha256: playback.sha256, byteLength: playback.byteLength,
      durationSeconds: playback.durationSeconds, mediaType: 'audio/mpeg',
      url: `/api/import-review-preview/revisions/${encodeURIComponent(revision.id)}/files?path=${encodeURIComponent(playbackPath)}`,
      segments: reviewedPlaybackSegments(projection.reviewedListening),
    } } : {}) },
  }))
}

function identity(input, profile, reviewKind = 'candidate') {
  if (profile !== null && profile !== 'public-paper-v1') fail('UNSUPPORTED_PROFILE', '/identity/importProfile')
  if (!record(input) || typeof input.paperId !== 'string' || !input.paperId || reviewKind !== 'candidate') {
    fail('MISSING_EVIDENCE', '/identity')
  }
  const result = { paperId: input.paperId, reviewKind, importProfile: profile }
  for (const key of ['sourceDigest', 'candidateDigest', 'visibleStructureDigest']) {
    if (!SHA.test(input[key])) fail('MISSING_EVIDENCE', `/identity/${key}`)
    result[key] = input[key]
  }
  const required = profile === 'public-paper-v1'
    ? ['paragraphSummariesDigest', 'publicSearchMetadataDigest'] : ['analysisDigest']
  for (const key of ['analysisDigest', 'paragraphSummariesDigest', 'publicSearchMetadataDigest']) {
    if (required.includes(key) && !SHA.test(input[key])) fail('MISSING_EVIDENCE', `/identity/${key}`)
    if (input[key] != null && !SHA.test(input[key])) fail('BASELINE_UNTRUSTED', `/identity/${key}`)
    result[key] = input[key] ?? null
  }
  return result
}

export function assertReviewPreviewPayload(payload) {
  const asset = payload?.paperAsset
  const consumption = payload?.consumption
  if (!record(asset) || asset.schemaVersion !== 'paper-asset-v1'
    || !record(asset.paper) || typeof asset.paper.paperId !== 'string'
    || !Number.isSafeInteger(asset.paper.assetVersion)
    || typeof asset.paper.title !== 'string' || !record(asset.sources)
    || !record(asset.layoutTree) || !Array.isArray(asset.layoutTree.parts)
    || !record(asset.content) || !Array.isArray(asset.content.blocks)
    || !record(asset.content.groups) || !record(asset.content.questions)
    || !record(asset.answerKey?.answers) || !record(asset.analysis)
    || !record(payload.analysisSidecars)
    || !record(consumption) || consumption.disposition !== 'ready'
    || !Number.isSafeInteger(consumption.sourceAssetVersion)
    || typeof consumption.paperId !== 'string' || !SHA.test(consumption.sourceAssetDigest)
    || !SHA.test(consumption.visibleStructureDigest)
    || !record(consumption.authorityRef) || !record(consumption.profileRef)
    || !record(consumption.consumerContractRef) || !Array.isArray(consumption.visibleStructure)
    || !Array.isArray(consumption.selections) || !Array.isArray(consumption.mediaArtifacts)
    || !Array.isArray(consumption.diagnostics)
    || consumption.selections.some(selection => selection.mode !== 'canonical'
      || typeof selection.familyContractId !== 'string' || !Array.isArray(selection.groupIds)
      || !Array.isArray(selection.projectedOccurrences))
    || (own(consumption, 'listeningAudio') && (!record(consumption.listeningAudio)
      || !SHA.test(consumption.listeningAudio.sha256)
      || !Number.isSafeInteger(consumption.listeningAudio.byteLength)
      || !Number.isFinite(consumption.listeningAudio.durationSeconds)
      || typeof consumption.listeningAudio.url !== 'string' || !Array.isArray(consumption.listeningAudio.segments)))) {
    fail('UNSUPPORTED_PREVIEW_PAYLOAD', '/consumer')
  }
  if (asset.paper.paperId !== consumption.paperId
    || asset.paper.assetVersion !== consumption.sourceAssetVersion) fail('BASELINE_UNTRUSTED', '/consumer')
  for (const [key, group] of Object.entries(asset.content.groups)) {
    if (!record(group) || group.groupId !== key || typeof group.groupType !== 'string'
      || typeof group.title !== 'string' || !Array.isArray(group.questionIds)
      || group.questionIds.some(id => !record(asset.content.questions[id]))) {
      fail('UNSUPPORTED_PREVIEW_PAYLOAD', '/consumer/paperAsset/content/groups')
    }
  }
  for (const [key, question] of Object.entries(asset.content.questions)) {
    if (!record(question) || question.questionId !== key || !Number.isSafeInteger(question.questionNo)
      || !record(asset.content.groups[question.groupId]) || typeof question.stem !== 'string') {
      fail('UNSUPPORTED_PREVIEW_PAYLOAD', '/consumer/paperAsset/content/questions')
    }
  }
}

function profileOf(manifest) {
  if (manifest?.schemaVersion === 'web-import-review-bundle-v1' && manifest.importProfile == null) return null
  if (['web-import-review-bundle-v2', 'web-import-review-bundle-v3'].includes(manifest?.schemaVersion)
    && manifest.importProfile === 'public-paper-v1') return manifest.importProfile
  fail('UNSUPPORTED_PROFILE', '/identity/importProfile')
}

function verifiedFiles(expected, fileEvidence) {
  if (!Array.isArray(fileEvidence)) fail('MISSING_EVIDENCE', '/inventory')
  const map = new Map(fileEvidence.map(file => [file.path, file]))
  if (map.size !== fileEvidence.length || map.size !== expected.length) fail('MISSING_EVIDENCE', '/inventory')
  return expected.map(file => {
    const evidence = map.get(file.path)
    if (!evidence) fail('MISSING_EVIDENCE', file.path)
    if (file.sha256 !== evidence.sha256 || file.byteLength !== evidence.byteLength) fail('SEALED_FILE_CHANGED', file.path)
    if (evidence.jsonError) fail('BASELINE_UNTRUSTED', file.path)
    if ((file.mediaType === 'application/json' || file.path.endsWith('.json')) && !own(evidence, 'json') && !SHA.test(evidence.jsonDigest || '')) {
      fail('MISSING_EVIDENCE', file.path)
    }
    return { ...file, ...(own(evidence, 'json') ? { json: evidence.json } : {}),
      ...(evidence.jsonDigest ? { jsonDigest: evidence.jsonDigest } : {}), prefix: evidence.prefix }
  })
}

const isMedia = file => /^(image|audio|video)\//.test(file.mediaType)
const contentFile = file => ({ ...descriptor(file), ...(own(file, 'json')
  ? { jsonDigest: digestJson(file.json) } : file.jsonDigest ? { jsonDigest: file.jsonDigest } : {}) })

function productsFromFiles(files, revision, validatedListeningReview) {
  const entry = files.find(file => file.path === PRODUCT_MANIFEST)
  if (!entry?.json) fail('MISSING_FROZEN_PRODUCTS', '/products')
  const manifest = entry.json
  let expected
  try { expected = manifestProductFiles(manifest) }
  catch { fail('BASELINE_UNTRUSTED', '/products/manifest') }
  if (manifest.paperId !== revision.paperId || manifest.paperName !== revision.manifest.paperName
    || !SHA.test(manifest.inputDigest) || !Array.isArray(manifest.files)
    || manifest.files.length !== expected.length
    || (manifest.schemaVersion === 'paper-pdf-products-v2' && manifest.economyPageLimit !== 9)) {
    fail('BASELINE_UNTRUSTED', '/products/manifest')
  }
  // Navigation-only listening evidence is excluded only after the boundary
  // supplies the existing validator's result, never from a path prefix alone.
  if (files.some(file => file.path === 'listening-review-v1.json') && !validatedListeningReview) {
    fail('MISSING_VALIDATED_LISTENING_REVIEW', '/products/inputDigest')
  }
  const neutral = listeningReviewPrintNeutralPaths(validatedListeningReview)
  const inputs = files.filter(file => !file.path.startsWith('products/') && !neutral.has(file.path))
    .map(file => ({ path: file.path, mediaType: file.mediaType, role: file.role,
      sha256: file.sha256, byteLength: file.byteLength })).sort((a, b) => a.path.localeCompare(b.path))
  if (digestJson(inputs) !== manifest.inputDigest) fail('BASELINE_UNTRUSTED', '/products/inputDigest')
  const products = expected.map((expectedFile, index) => {
    const item = manifest.files[index]
    const actual = files.find(file => file.path === expectedFile.path)
    if (!actual || item.path !== expectedFile.path || item.mediaType !== expectedFile.mediaType
      || actual.role !== expectedFile.role || actual.mediaType !== expectedFile.mediaType
      || item.sha256 !== actual.sha256 || item.byteLength !== actual.byteLength
      || !Number.isSafeInteger(item.pageCount) || item.pageCount < 1
      || actual.prefix !== '%PDF-') fail('BASELINE_UNTRUSTED', expectedFile.path)
    return { edition: expectedFile.path.slice('products/'.length, -4), ...item }
  })
  const actualProducts = files.filter(file => file.path.startsWith('products/'))
  if (actualProducts.length !== expected.length + 1) fail('BASELINE_UNTRUSTED', '/products')
  return { manifestFile: descriptor(entry), manifest, inputDigest: manifest.inputDigest, files: products }
}

function makeSubject(revision, components, origin, provenance) {
  const subject = {
    subjectVersion: REVIEW_SUBJECT_VERSION, revisionId: revision.id,
    sourceRendererBuildId: revision.rendererBuildId, bundleDigest: revision.bundleDigest, components,
  }
  const subjectJson = stableStringify(subject)
  if (Buffer.byteLength(subjectJson) > REVIEW_SUBJECT_MAX_BYTES) fail('SUBJECT_TOO_LARGE')
  return { ok: true, origin, subject, subjectDigest: digestJson(subject),
    componentDigests: Object.fromEntries(REVIEW_COMPONENTS.map(key => [key, digestJson(components[key])])),
    provenance, metrics: { subjectBytes: Buffer.byteLength(subjectJson),
      fileCount: components.inventory.length,
      fileBytes: components.inventory.reduce((sum, file) => sum + file.byteLength, 0) } }
}

function attempt(callback) {
  try { return callback() }
  catch (error) {
    return { ok: false, reasonCode: error.reviewContentError ? error.reasonCode : 'COMPUTATION_FAILED',
      differences: error.pointer ? [error.pointer] : [] }
  }
}

function revisionEvidence(revision, storedFiles) {
  if (!revision?.id || !revision.rendererBuildId || revision.reviewKind !== 'candidate'
    || !revision.state || revision.state === 'uploading' || !revision.manifest) fail('MISSING_EVIDENCE')
  const manifest = revision.manifest
  if (!manifest.paperName || !manifest.producerBuildId
    || (manifest.schemaVersion === 'web-import-review-bundle-v3'
      && (manifest.ocrCorrectionReportVersion !== 'agent-ocr-correction-report-v2'
        || !SHA.test(manifest.ocrCorrectionReportDigest)))) fail('MISSING_EVIDENCE', '/identity')
  const files = inventory(manifest.files)
  if (!same(files, inventory(storedFiles))) fail('BASELINE_UNTRUSTED', '/inventory')
  if (!SHA.test(revision.bundleDigest) || manifest.bundleDigest !== revision.bundleDigest
    || reviewSubjectBundleDigest(manifest) !== revision.bundleDigest) fail('BASELINE_UNTRUSTED', '/bundleDigest')
  const baselineIdentity = identity(manifest, profileOf(manifest))
  for (const key of ['paperId', 'sourceDigest', 'candidateDigest', 'visibleStructureDigest']) {
    if (revision[key] !== manifest[key]) fail('BASELINE_UNTRUSTED', `/identity/${key}`)
  }
  return { files, baselineIdentity }
}

function componentsFor(revision, identityValue, payload, files, validatedListeningReview) {
  assertReviewPreviewPayload(payload)
  if (payload.paperAsset.paper.paperId !== identityValue.paperId
    || payload.consumption.visibleStructureDigest !== identityValue.visibleStructureDigest
    || payload.consumption.sourceAssetDigest !== identityValue.sourceDigest
    || digestJson(payload.consumption.visibleStructure) !== identityValue.visibleStructureDigest) {
    fail('BASELINE_UNTRUSTED', '/consumer')
  }
  return {
    identity: identityValue,
    consumer: payload,
    sidecar: files.filter(file => !file.path.startsWith('products/') && !isMedia(file)).map(contentFile),
    media: { files: files.filter(isMedia).map(contentFile),
      artifacts: payload.consumption.mediaArtifacts,
      listeningAudio: payload.consumption.listeningAudio ?? null },
    products: productsFromFiles(files, revision, validatedListeningReview),
    inventory: files.map(descriptor),
  }
}

// Baseline path: ONLY persisted preview + manifest/DB/file evidence. It never
// accepts a projection, compiled Canonical or a current-build fallback.
export function buildStoredReviewSubject({ revision, preview, storedFiles, fileEvidence, validatedListeningReview = null }) {
  return attempt(() => {
    const { files, baselineIdentity } = revisionEvidence(revision, storedFiles)
    if (!preview?.payload_json) fail('MISSING_BASELINE', '/consumer')
    let payload
    try { payload = JSON.parse(preview.payload_json) }
    catch { fail('BASELINE_UNTRUSTED', '/consumer') }
    if (preview.revision_id !== revision.id || preview.bundle_digest !== revision.bundleDigest
      || preview.renderer_build_id !== revision.rendererBuildId || digestJson(payload) !== preview.payload_digest) {
      fail('BASELINE_UNTRUSTED', '/consumer')
    }
    if (baselineIdentity.analysisDigest && digestJson(payload.analysisSidecars) !== baselineIdentity.analysisDigest) {
      fail('BASELINE_UNTRUSTED', '/identity/analysisDigest')
    }
    const verified = verifiedFiles(files, fileEvidence)
    for (const [key, path] of [
      ['paragraphSummariesDigest', 'paragraph-summaries-v1.json'],
      ['publicSearchMetadataDigest', 'public-search-metadata-v1.json'],
      ...(revision.manifest.schemaVersion === 'web-import-review-bundle-v3'
        ? [['ocrCorrectionReportDigest', 'agent-ocr-correction-report-v2.json']] : []),
    ]) {
      const expected = revision.manifest[key]
      if (!expected) continue
      const entry = verified.find(file => file.path === path)
      if (!entry) fail('MISSING_EVIDENCE', path)
      const actual = key === 'ocrCorrectionReportDigest' ? (entry.jsonDigest || digestJson(entry.json)) : entry.sha256
      if (actual !== expected) fail('BASELINE_UNTRUSTED', `/identity/${key}`)
    }
    return makeSubject(revision, componentsFor(revision, baselineIdentity, payload,
      verified, validatedListeningReview), 'stored_evidence', {
      extractorVersion: REVIEW_SUBJECT_VERSION, payloadDigest: preview.payload_digest,
      manifestDigest: digestJson(revision.manifest), inventoryDigest: digestJson(files),
      source: 'persisted-preview-and-sealed-files',
    })
  })
}

// Target path: caller runs current strict projection/admission and supplies its
// exact inventory. No projection code is invoked here (it would run pdfinfo).
export function buildTargetReviewSubject({ revision, projection, inventory: targetInventory, fileEvidence }) {
  return attempt(() => {
    revisionEvidence(revision, revision.manifest.files)
    if (!projection) fail('TARGET_COMPUTATION_FAILED')
    if (projection.importProfile !== profileOf(revision.manifest)) fail('UNSUPPORTED_PROFILE')
    const files = inventory(targetInventory)
    const payload = buildProductPreviewPayload(revision, projection)
    const components = componentsFor(revision, identity(projection, projection.importProfile), payload,
      verifiedFiles(files, fileEvidence), projection.reviewedListening)
    return makeSubject(revision, components, 'finalize', {
      extractorVersion: REVIEW_SUBJECT_VERSION, source: 'current-validated-projection',
    })
  })
}

export function validateReviewSubject(subject) {
  return attempt(() => {
    if (subject?.subjectVersion !== REVIEW_SUBJECT_VERSION || !subject.revisionId
      || !subject.sourceRendererBuildId || !SHA.test(subject.bundleDigest)
      || !record(subject.components)
      || !same(Object.keys(subject.components).sort(), [...REVIEW_COMPONENTS].sort())
      || Buffer.byteLength(stableStringify(subject)) > REVIEW_SUBJECT_MAX_BYTES) fail('BASELINE_UNTRUSTED')
    const { identity: id, consumer, inventory: files } = subject.components
    if (!same(identity(id, id.importProfile, id.reviewKind), id)) fail('BASELINE_UNTRUSTED')
    assertReviewPreviewPayload(consumer)
    inventory(files)
    return { ok: true, subject, subjectDigest: digestJson(subject) }
  })
}
