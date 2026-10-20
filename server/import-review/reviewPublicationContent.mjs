import { createHash } from 'node:crypto'
import { stableStringify } from '../../shared/paper-canonical/stable.mjs'
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

// No URL/digest/version wildcard stripping. The sealed source digest must
// already equal the review source digest; until C supplies a proven source
// mapping, a different publication source representation fails closed.
export function mapReviewPublicationConsumer({ subject, consumption, sealedManifest, version }) {
  const baseline = subject.components.consumer.consumption
  if (!Number.isSafeInteger(version) || version < 1 || !record(consumption)
    || sealedManifest?.paperId !== subject.components.identity.paperId
    || sealedManifest.sourceAssetVersion !== version
    || !/^sha256:[a-f0-9]{64}$/.test(sealedManifest.publicationDigest || '')
    || sealedManifest.sourceAssetDigest !== baseline.sourceAssetDigest
    || consumption.sourceAssetDigest !== sealedManifest.sourceAssetDigest
    || consumption.publicationDigest !== sealedManifest.publicationDigest) unknown('/consumption/publicationDigest')
  const mapped = clone(consumption)
  versionField(mapped, 'sourceAssetVersion', baseline.sourceAssetVersion, version, '/consumption/sourceAssetVersion')
  delete mapped.publicationDigest
  // Published listening URLs require a SHA/length/segment-bound mapping in C.
  // Comparing the original review URL exactly is intentionally conservative.
  return mapped
}

function expectedImportMeta(subject) {
  const { consumer, sidecar } = subject.components
  const config = sidecar.find(file => file.path === 'config.json')?.json
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

// Package fields supported here are exhaustive. A future package field cannot
// disappear into a normalize/omit list. Identity receipts, fileStorage, raw
// sources and pagination binding need C's runtime guard and are unknown here.
export const REVIEW_PUBLICATION_PACKAGE_FIELDS = Object.freeze([
  'paperAsset', 'answerKey', ...Object.keys(ANALYSES),
  'paragraphSummariesBytes', 'publicSearchMetadataBytes', 'sourceReferencesBytes',
  'paginationPlan', 'frozenProducts', 'importMeta', 'sourceAssetDigest', 'paperHeader',
])

export function compareReviewPublicationContent({ subject, packageData, consumption, sealedManifest, version }) {
  const result = { mappingVersion: REVIEW_PUBLICATION_CONTENT_VERSION, result: 'unknown',
    reasonCode: 'UNSUPPORTED_PUBLICATION_MAPPING', differences: [], coverage: [] }
  try {
    if (!validateReviewSubject(subject).ok || !record(packageData)) unknown('/')
    const unmapped = Object.keys(packageData).filter(key => !REVIEW_PUBLICATION_PACKAGE_FIELDS.includes(key))
    if (unmapped.length) unknown(`/packageData/${unmapped[0]}`)
    const original = subject.components.consumer
    const actualAsset = clone(packageData.paperAsset)
    // Accept either the pre-writer exact preview identity or the final version
    // identity, but never an arbitrary third version/status.
    if (!same(actualAsset.paper, original.paperAsset.paper)) {
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
      consumption: mapReviewPublicationConsumer({ subject, consumption, sealedManifest, version }) }
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
    const pagination = subject.components.sidecar.find(file => file.path === 'pagination-plan.json')?.json ?? null
    if (!same(packageData.paginationPlan ?? null, pagination)) result.differences.push('/packageData/paginationPlan')
    const frozen = packageData.frozenProducts
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
    // File name/source provenance cannot be established merely by recomputing
    // a package. Until their explicit sealed-source mapping is supplied, fail
    // closed on the real package's additional fields.
    exactKeys(meta, ['schemaVersion', 'paperId', 'paper', 'groups'], '/packageData/importMeta')
    if (meta.schemaVersion !== 'import-meta-v1' || meta.paperId !== subject.components.identity.paperId) unknown('/importMeta')
    const expectedMeta = expectedImportMeta(subject)
    if (!same(meta.paper, expectedMeta.paper)) result.differences.push('/packageData/importMeta/paper')
    if (!same(meta.groups, expectedMeta.groups)) result.differences.push('/packageData/importMeta/groups')
    const expectedSource = original.paperAsset.sources.provenance?.members?.find(file => file.role === 'content')?.sha256
    if (!expectedSource || packageData.sourceAssetDigest !== expectedSource.replace(/^sha256:/, '')) unknown('/packageData/sourceAssetDigest')
    if (packageData.paperHeader !== undefined) unknown('/packageData/paperHeader')
    result.coverage.push('importMeta.paper', 'importMeta.groups', 'sourceAssetDigest')
    return { ...result, result: result.differences.length ? 'different' : 'equal',
      reasonCode: result.differences.length ? 'SUBJECT_CHANGED' : 'CONTENT_EQUAL' }
  } catch (error) {
    return { ...result, differences: error.pointer ? [error.pointer] : [],
      reasonCode: 'UNSUPPORTED_PUBLICATION_MAPPING' }
  }
}
