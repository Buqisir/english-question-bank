import { createHash } from 'node:crypto'
import path from 'node:path'
import { configuredPaperHeader } from '../../shared/paper-canonical/headerTitle.mjs'
import { digestJson, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { reviewContentDifferences } from './reviewCompatibility.mjs'
import { assertReviewPreviewPayload, validateReviewSubject } from './reviewSubject.mjs'

export const REVIEW_PUBLICATION_CONTENT_VERSION = 'review-publication-content-v1'

// This is a content-mapping seam, not an approval/capability. C must pass the
// actual admission consumer and actual writer snapshot, after identity guards.
// Exact nested objects are compared; these are the ONLY envelope rewrites.
export const REVIEW_PUBLICATION_ENVELOPES = Object.freeze([
  '/paperAsset/paper/assetVersion', '/paperAsset/paper/status',
  '/answerKey/sourceAssetVersion', '/analysisSidecars/*/sourceAssetVersion',
  '/analysisSidecars/*/groups/*/teachingContent/sourceAssetVersion',
  '/consumption/sourceAssetVersion', '/consumption/publicationDigest',
  '/consumption/sourceAssetDigest', '/consumption/consumerContractRef',
  '/consumption/listeningAudio/url',
  '/consumption/selections/*/projectedOccurrences/*/firstSectionPlayback',
  '/consumption/selections/*/projectedOccurrenceDigests/*/digest',
])
const ANALYSES = Object.freeze({
  readingAnalysis: 'reading-choice-analysis-v1.json',
  scAnalysis: 'seven-choices-analysis-v1.json',
  clozeAnalysis: 'cloze-analysis-v1.json',
  grammarFillAnalysis: 'grammar-fill-analysis-v1.json',
  writingAnalysis: 'writing-analysis-v1.json',
  listeningAnalysis: 'listening-analysis-v1.json',
})
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const same = (a, b) => stableStringify(a) === stableStringify(b)
const clone = value => JSON.parse(JSON.stringify(value))
const byteDigest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

function unknown(pointer) {
  throw Object.assign(new Error('UNSUPPORTED_PUBLICATION_MAPPING'), { pointer })
}
function exactKeys(value, keys, pointer) {
  if (!record(value) || !same(Object.keys(value).sort(), [...keys].sort())) unknown(pointer)
}
function versionField(object, key, from, to, pointer) {
  if (!Object.hasOwn(object, key) || object[key] !== to) unknown(pointer)
  object[key] = from
}

// Source Capture may use a package-level digest in Review and exact content
// member bytes in Publication. Only the explicitly selected sealed source file
// can bridge those representations; a caller-supplied digest is insufficient.
function sidecarJson(subject, contents, filePath) {
  const file = subject.components.sidecar.find(file => file.path === filePath)
  if (!file) return null
  const value = contents?.[filePath]
  if (value === undefined || digestJson(value) !== file.jsonDigest) unknown(`/sidecar/${filePath}`)
  return value
}

function sourceFacts(subject, sidecarContents) {
  const manifest = sidecarJson(subject, sidecarContents, 'universal-source-manifest.json')
  if (!manifest) unknown('/source/manifest')
  const external = Boolean(manifest.packageManifest)
  const document = external ? manifest.members?.find(file => file.role === 'content')
    : manifest.documents?.find(file => ['question_source', 'question_and_answers'].includes(file.role))
  const publicationPath = external ? document?.path : manifest.materializationPath
  const publicationFile = subject.components.inventory.find(file => file.path === publicationPath)
  const sourceFile = subject.components.inventory.find(file => file.path === document?.path)
  if (!document || !publicationFile || !sourceFile || document.sha256 !== sourceFile.sha256
    || document.byteLength !== sourceFile.byteLength) unknown('/source/content')
  return { document, publicationFile, external }
}

export function mapReviewPublicationConsumer({ subject, consumption, sealedManifest, version, sourceAsset = null, sidecarContents }) {
  const baseline = subject.components.consumer.consumption
  let sourceDigest = baseline.sourceAssetDigest
  if (sourceAsset !== null) {
    const file = sourceFacts(subject, sidecarContents).publicationFile
    if (!(sourceAsset instanceof Uint8Array) || sourceAsset.byteLength !== file.byteLength
      || byteDigest(sourceAsset) !== file.sha256) unknown('/source/bytes')
    sourceDigest = file.sha256
  }
  if (!Number.isSafeInteger(version) || version < 1 || !record(consumption)
    || sealedManifest?.paperId !== subject.components.identity.paperId
    || sealedManifest.sourceAssetVersion !== version
    || !/^sha256:[a-f0-9]{64}$/.test(sealedManifest.publicationDigest || '')
    || sealedManifest.sourceAssetDigest !== sourceDigest
    || consumption.sourceAssetDigest !== sealedManifest.sourceAssetDigest
    || consumption.publicationDigest !== sealedManifest.publicationDigest) unknown('/consumption/publicationDigest')
  const mapped = clone(consumption)
  versionField(mapped, 'sourceAssetVersion', baseline.sourceAssetVersion, version, '/consumption/sourceAssetVersion')
  mapped.sourceAssetDigest = baseline.sourceAssetDigest
  delete mapped.publicationDigest
  if (mapped.listeningAudio && mapped.listeningAudio.url !== baseline.listeningAudio?.url) {
    const audio = mapped.listeningAudio
    const before = baseline.listeningAudio
    const expectedUrl = `/paper-assets/${encodeURIComponent(sealedManifest.paperId)}/versions/v${version}/${audio.relativePath}`
    // Only location changes. Every descriptor, duration and reviewed segment
    // remains in the full comparison below.
    if (!before || audio.url !== expectedUrl
      || !subject.components.media.files.some(file => file.sha256 === audio.sha256
        && file.byteLength === audio.byteLength && file.mediaType === audio.mediaType)) unknown('/consumption/listeningAudio')
    audio.url = before.url
  }
  // The historical preview omits the two-play default, while Publication
  // explicitly decorates it. Only this one default is representational.
  for (const [index, selection] of (mapped.selections || []).entries()) {
    for (const [offset, occurrence] of (selection.projectedOccurrences || []).entries()) {
      const before = baseline.selections[index]?.projectedOccurrences?.[offset]
      if (occurrence.familyContractId === 'listening' && occurrence.slotId === 'listening.short-dialogue'
        && occurrence.firstSectionPlayback === 'twice_default' && before
        && !Object.hasOwn(before, 'firstSectionPlayback')) {
        const descriptor = selection.projectedOccurrenceDigests?.[offset]
        if (!descriptor || descriptor.groupId !== occurrence.groupId
          || descriptor.digest !== digestJson(occurrence)) unknown('/consumption/projectedOccurrenceDigests')
        delete occurrence.firstSectionPlayback
        descriptor.digest = digestJson(occurrence)
      }
    }
  }
  return mapped
}

function expectedImportMeta(subject, sidecarContents) {
  const { consumer } = subject.components
  const config = sidecarJson(subject, sidecarContents, 'config.json')
  const provenance = config?.provenance
  const asset = consumer.paperAsset
  if (!provenance || !Number.isInteger(Number(provenance.year))
    || !provenance.paperName || !(provenance.region || provenance.source)) unknown('/importMeta/paper')
  const paperId = subject.components.identity.paperId
  const sourceType = provenance.sourceType || (paperId.startsWith('paper-mock-') ? '模拟题' : '真题')
  const paper = {
    year: Number(provenance.year),
    region: provenance.region || provenance.source, paperName: provenance.paperName,
    examCode: paperId.replace(/^paper-/, ''), subject: 'English', sourceType,
    defaultTags: Array.isArray(provenance.defaultTags) ? provenance.defaultTags : [sourceType, String(provenance.year)],
  }
  // Use the already sealed product date, rather than guessing a month from a
  // title or rerunning current metadata generation as historical evidence.
  const examDate = subject.components.products.manifest.examDate
  if (examDate?.month) paper.month = examDate.month
  const family = {
    reading: ['reading-choice-analysis-v1.json', '阅读理解'],
    sevenChoices: ['seven-choices-analysis-v1.json', '七选五'],
    cloze: ['cloze-analysis-v1.json', '完形填空'],
    grammarFill: ['grammar-fill-analysis-v1.json', '语法填空'],
  }
  const groups = {}
  for (const group of Object.values(asset.content.groups)) {
    const spec = family[group.groupType]
    if (!spec || !consumer.analysisSidecars[spec[0]]) continue
    const analysis = consumer.analysisSidecars[spec[0]]
    groups[group.groupId] = {
      groupId: group.groupId, difficulty: '中',
      summary: analysis.groups?.[group.groupId]?.overview || group.title || spec[1],
      tags: [spec[1]], displayTitleOverride: group.title || spec[1],
    }
  }
  return { paper, groups }
}

// Exhaustive package coverage. Unknown fields never disappear in normalization.
export const REVIEW_PUBLICATION_PACKAGE_FIELDS = Object.freeze([
  'paperAsset', 'answerKey', ...Object.keys(ANALYSES),
  'paragraphSummariesBytes', 'publicSearchMetadataBytes', 'sourceReferencesBytes',
  'paginationPlan', 'frozenProducts', 'importMeta', 'sourceAssetDigest', 'paperHeader',
  'sourceReferenceApproval', 'pdfProductApproval', 'fileStorage', 'paginationPlanBinding',
])

export function compareReviewPublicationContent({ subject, packageData, consumption, sealedManifest, version,
  sourceAsset = null, approvedIdentity = null, approvedManifest = null, materializationDigest = null, sidecarContents,
}) {
  const result = { mappingVersion: REVIEW_PUBLICATION_CONTENT_VERSION, result: 'unknown',
    reasonCode: 'UNSUPPORTED_PUBLICATION_MAPPING', differences: [], coverage: [] }
  try {
    if (!validateReviewSubject(subject).ok || !record(packageData)) unknown('/')
    const unmapped = Object.keys(packageData).filter(key => !REVIEW_PUBLICATION_PACKAGE_FIELDS.includes(key))
    if (unmapped.length) unknown(`/packageData/${unmapped[0]}`)
    if (!(sourceAsset instanceof Uint8Array)) unknown('/source/bytes')
    const original = subject.components.consumer
    const actualAsset = clone(packageData.paperAsset)
    // Accept either the pre-writer exact preview identity or the final version
    // identity, but never an arbitrary third version/status.
    if (actualAsset.paper.assetVersion !== original.paperAsset.paper.assetVersion
      || actualAsset.paper.status !== original.paperAsset.paper.status) {
      versionField(actualAsset.paper, 'assetVersion', original.paperAsset.paper.assetVersion, version, '/paperAsset/paper/assetVersion')
      if (actualAsset.paper.status !== 'published') unknown('/paperAsset/paper/status')
      actualAsset.paper.status = original.paperAsset.paper.status
    }
    const actualAnalyses = {}
    for (const [field, file] of Object.entries(ANALYSES)) {
      const actual = packageData[field]
      const expected = original.analysisSidecars[file]
      if (actual == null && expected === undefined) continue
      if (!record(actual) || !record(expected)) unknown(`/analysisSidecars/${file}`)
      const mapped = clone(actual)
      // writingAnalysis is not versioned by storage.makeVersionedArtifacts.
      if (field !== 'writingAnalysis' && mapped.sourceAssetVersion !== expected.sourceAssetVersion) {
        versionField(mapped, 'sourceAssetVersion', expected.sourceAssetVersion, version, `/analysisSidecars/${file}/sourceAssetVersion`)
      }
      if (['readingAnalysis', 'scAnalysis', 'clozeAnalysis', 'grammarFillAnalysis'].includes(field)) {
        for (const [groupId, group] of Object.entries(mapped.groups || {})) {
          const teaching = group.teachingContent
          const before = expected.groups?.[groupId]?.teachingContent
          if (teaching?.schemaVersion === 'objective-teaching-content-v1'
            && before?.schemaVersion === teaching.schemaVersion && teaching.sourceAssetVersion !== before.sourceAssetVersion) {
            versionField(teaching, 'sourceAssetVersion', before.sourceAssetVersion, version,
              `/analysisSidecars/${file}/groups/${groupId}/teachingContent/sourceAssetVersion`)
          }
        }
      }
      actualAnalyses[file] = mapped
    }
    const actualPayload = { paperAsset: actualAsset, analysisSidecars: actualAnalyses,
      consumption: mapReviewPublicationConsumer({ subject, consumption, sealedManifest, version, sourceAsset, sidecarContents }) }
    assertReviewPreviewPayload(actualPayload)
    const diff = reviewContentDifferences(original, actualPayload)
    result.differences.push(...diff.differences)
    result.coverage.push('paperAsset', 'analysisSidecars', 'actual-admission-consumption')
    const answer = packageData.answerKey
    exactKeys(answer, ['schemaVersion', 'paperId', 'sourceAssetVersion', 'answers'], '/answerKey')
    if (answer.schemaVersion !== 'answer-key-v1' || answer.paperId !== subject.components.identity.paperId
      || ![original.paperAsset.paper.assetVersion, version].includes(answer.sourceAssetVersion)) unknown('/answerKey')
    if (!same(answer.answers, original.paperAsset.answerKey.answers)) result.differences.push('/answerKey/answers')
    result.coverage.push('answerKey')
    for (const [field, path] of [
      ['paragraphSummariesBytes', 'paragraph-summaries-v1.json'],
      ['publicSearchMetadataBytes', 'public-search-metadata-v1.json'],
      ['sourceReferencesBytes', 'source-references-v1.json'],
    ]) {
      const source = subject.components.sidecar.find(file => file.path === path)
      if (source ? !(packageData[field] instanceof Uint8Array)
        || byteDigest(packageData[field]) !== source.sha256 : packageData[field] != null) {
        result.differences.push(`/packageData/${field}`)
      }
      result.coverage.push(field)
    }
    const pagination = sidecarJson(subject, sidecarContents, 'pagination-plan.json')
    if (!same(packageData.paginationPlan ?? null, pagination)) result.differences.push('/packageData/paginationPlan')
    const frozen = packageData.frozenProducts
    exactKeys(frozen, ['manifest', 'bytes', 'digest'], '/packageData/frozenProducts')
    if (!frozen || !same(frozen.manifest, subject.components.products.manifest)
      || frozen.digest !== subject.components.products.manifestFile.sha256) result.differences.push('/packageData/frozenProducts')
    else {
      const paths = [subject.components.products.manifestFile, ...subject.components.products.files]
      exactKeys(frozen.bytes, paths.map(file => file.path), '/packageData/frozenProducts/bytes')
      for (const file of paths) {
        const bytes = frozen.bytes[file.path]
        if (!(bytes instanceof Uint8Array) || bytes.byteLength !== file.byteLength || byteDigest(bytes) !== file.sha256) {
          result.differences.push(`/packageData/frozenProducts/bytes/${file.path}`)
        }
      }
    }
    result.coverage.push('paginationPlan', 'frozenProducts')
    const meta = packageData.importMeta
    const facts = sourceFacts(subject, sidecarContents)
    const provenance = original.paperAsset.sources.provenance
    exactKeys(meta, ['schemaVersion', 'paperId', 'sourceFileName', 'sourceFileSha256',
      ...(facts.external ? ['sourceProvenance'] : []), 'paper', 'groups'], '/packageData/importMeta')
    if (meta.schemaVersion !== 'import-meta-v1' || meta.paperId !== subject.components.identity.paperId) unknown('/importMeta')
    const expectedMeta = expectedImportMeta(subject, sidecarContents)
    if (!same(meta.paper, expectedMeta.paper)) result.differences.push('/packageData/importMeta/paper')
    if (!same(meta.groups, expectedMeta.groups)) result.differences.push('/packageData/importMeta/groups')
    if (meta.sourceFileName !== path.posix.basename(facts.document.path)
      || meta.sourceFileSha256 !== facts.document.sha256.replace(/^sha256:/, '')
      || (facts.external && !same(meta.sourceProvenance, provenance))
      || packageData.sourceAssetDigest !== facts.document.sha256.replace(/^sha256:/, '')) {
      result.differences.push('/packageData/importMeta/source')
    }
    const config = sidecarJson(subject, sidecarContents, 'config.json')
    if (!same(packageData.paperHeader ?? null, configuredPaperHeader(config) ?? null)
      || !same(sealedManifest.paperHeader ?? null, packageData.paperHeader ?? null)) result.differences.push('/paperHeader')
    result.coverage.push('importMeta', 'sourceAssetDigest', 'paperHeader')
    if (!approvedIdentity || !approvedManifest || approvedIdentity.revisionId !== subject.revisionId
      || approvedIdentity.bundleDigest !== subject.bundleDigest
      || approvedManifest.bundleDigest !== subject.bundleDigest
      || !same([...approvedManifest.files].sort((a,b) => a.path < b.path ? -1 : 1), subject.components.inventory)
      || !approvedIdentity.approvalId) unknown('/approval')
    const id = subject.components.identity
    const references = subject.components.sidecar.find(file => file.path === 'source-references-v1.json')
    const expectedReferenceApproval = references ? {
      schemaVersion: 'source-reference-publication-v1', paperName: approvedManifest.paperName,
      approvalId: approvedIdentity.approvalId, revisionId: subject.revisionId, bundleDigest: subject.bundleDigest,
      sourceDigest: id.sourceDigest, candidateDigest: id.candidateDigest,
      materializationDigest, sourceReferencesDigest: references.sha256,
    } : null
    if (references && !/^sha256:[a-f0-9]{64}$/.test(materializationDigest || '')) unknown('/sourceReferenceApproval/materializationDigest')
    if (!same(packageData.sourceReferenceApproval, expectedReferenceApproval)) unknown('/sourceReferenceApproval')
    if (!same(packageData.pdfProductApproval, {
      manifestDigest: subject.components.products.manifestFile.sha256,
      approvalId: approvedIdentity.approvalId, revisionId: subject.revisionId, bundleDigest: subject.bundleDigest,
    })) unknown('/pdfProductApproval')
    if (!same(packageData.paginationPlanBinding, {
      schemaVersion: 'paper-pagination-binding-v1', paperId: id.paperId,
      sourceDigest: id.sourceDigest, candidateDigest: id.candidateDigest,
      canonicalSourceDigest: sealedManifest.sourceAssetDigest,
      planDigest: pagination ? digestJson(pagination) : null,
    })) unknown('/paginationPlanBinding')
    const storage = packageData.fileStorage
    exactKeys(storage, ['schemaVersion', 'store', 'bundleDigest', 'reviewManifest', 'files'], '/fileStorage')
    if (storage.schemaVersion !== 'review-file-storage-v1' || storage.bundleDigest !== subject.bundleDigest
      || typeof storage.store !== 'string' || !/^(local|r2:[^\s]+)$/.test(storage.store)) unknown('/fileStorage/store')
    exactKeys(storage.files, subject.components.inventory.map(file => file.path), '/fileStorage/files')
    for (const file of subject.components.inventory) {
      if (!same(storage.files[file.path], { sha256: file.sha256, byteLength: file.byteLength, mediaType: file.mediaType })) unknown(`/fileStorage/files/${file.path}`)
    }
    const manifestBytes = Buffer.from(`${JSON.stringify(approvedManifest)}\n`)
    if (!same(storage.reviewManifest, { sha256: byteDigest(manifestBytes),
      byteLength: manifestBytes.byteLength, mediaType: 'application/json' })) unknown('/fileStorage/reviewManifest')
    result.coverage.push('sourceReferenceApproval', 'pdfProductApproval', 'paginationPlanBinding', 'fileStorage')
    return { ...result, result: result.differences.length ? 'different' : 'equal',
      reasonCode: result.differences.length ? 'SUBJECT_CHANGED' : 'CONTENT_EQUAL' }
  } catch (error) {
    return { ...result, differences: error.pointer ? [error.pointer] : [],
      reasonCode: 'UNSUPPORTED_PUBLICATION_MAPPING' }
  }
}
