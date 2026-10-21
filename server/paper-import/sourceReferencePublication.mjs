import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { validateCanonicalPublicationBundle } from '../paper-canonical/publication.mjs'
import { applySpellingReview } from './spellingReview.mjs'
import { SOURCE_REFERENCES_FILE, assertSourceReferences, parseSourceReferencesBytes } from './sourceReferences.mjs'
import { deriveNck1AnalyzedPackageBundle, NCK1_ANALYZED_PACKAGE_INPUT_KIND, parseStrictPackageJson } from '../paper-canonical/nck1AnalyzedPackageAdapter.mjs'

function reject(message) {
  throw Object.assign(new Error(`纯答案版不可用：${message}`), { code: 'SOURCE_REFERENCE_PUBLICATION_INVALID' })
}

// SQLite is the commitment authority, not a self-declared filesystem report.
// The caller supplies a successfully validated, exact Canonical consumption.
export function readSourceReferencePublication({ db, paperAssetsDir, consumption, expected = null }) {
  const { paperId, sourceAssetVersion, publicationDigest } = consumption
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(paperId || '') || !Number.isInteger(sourceAssetVersion)
    || sourceAssetVersion < 1 || !/^sha256:[a-f0-9]{64}$/.test(publicationDigest || '')) reject('精确版本身份缺失')
  const hasRuns = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'paper_import_runs'").get()
  if (!hasRuns) {
    if (expected) reject('已审答案的发布记录缺失')
    return null
  }
  const runs = db.prepare(`SELECT publish_report_json FROM paper_import_runs
    WHERE paper_id = ? AND asset_version = ? AND status = 'published'`).all(paperId, sourceAssetVersion)
  if (runs.length > 1) reject('同一版本存在多条成功发布记录')
  const report = runs.length ? JSON.parse(runs[0].publish_report_json) : null
  const commitment = report?.sourceReferencePublication
  if (!commitment) {
    if (expected) reject('此版本没有已审源参考答案承诺')
    return null
  }
  const versionName = `v${sourceAssetVersion}`
  const canonical = db.prepare(`SELECT publication_digest, source_asset_version FROM canonical_paper_publications
    WHERE paper_id = ? AND version_name = ?`).get(paperId, versionName)
  const asset = db.prepare(`SELECT version_name, status FROM paper_asset_versions
    WHERE paper_id = ? AND asset_version = ?`).get(paperId, sourceAssetVersion)
  if (report.paperId !== paperId || report.assetVersion !== sourceAssetVersion || report.versionName !== versionName
    || report.canonicalPublicationDigest !== publicationDigest || canonical?.publication_digest !== publicationDigest
    || Number(canonical?.source_asset_version) !== sourceAssetVersion || asset?.version_name !== versionName
    || asset?.status !== 'published' || commitment.schemaVersion !== 'source-reference-publication-v1') reject('发布记录与 Canonical 版本不一致')
  if (!commitment.approvalId || !commitment.revisionId || typeof commitment.paperName !== 'string' || !commitment.paperName.trim()
    || ['bundleDigest', 'sourceDigest', 'candidateDigest', 'materializationDigest', 'sourceReferencesDigest']
      .some(key => !/^sha256:[a-f0-9]{64}$/.test(commitment[key] || ''))) reject('发布承诺不完整')
  if (expected && Object.entries(expected).some(([key, value]) => commitment[key] !== value)) reject('重试与已提交的源答案或批准身份不同')
  const versionDir = path.join(paperAssetsDir, paperId, 'versions', versionName)
  const read = relative => {
    const file = path.join(versionDir, relative)
    return existsSync(file) ? readFileSync(file) : null
  }
  const referenceBytes = read(SOURCE_REFERENCES_FILE)
  if (!referenceBytes || sha256(referenceBytes) !== commitment.sourceReferencesDigest) reject('源参考答案字节缺失或已改变')
  const manifestVersion = consumption.authorityRef?.manifestVersion
  const manifestBytes = read(`canonical/canonical-paper-publication-v${manifestVersion}.json`)
  if (!manifestBytes) reject('封存 Canonical manifest 缺失')
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  if (manifest.publicationDigest !== publicationDigest) reject('封存 Canonical manifest 身份不一致')
  const validated = validateCanonicalPublicationBundle({ manifest, sourceAsset: read('canonical/source-asset.bin'), readArtifact: read })
  const documents = validated.sourceCapture.documents
  const decoded = document => Buffer.from(document.encodedBytes, 'base64')
  const materializations = documents.filter(document => document.inputKey === 'nck1_source_materialization')
  const overlays = documents.filter(document => document.inputKey === 'spelling_review')
  if (overlays.length > 1) reject('源校订身份不唯一')
  let materialization
  let sourceInput = null
  if (materializations.length === 1) {
    const materializationBytes = decoded(materializations[0])
    materialization = overlays.length
      ? applySpellingReview(materializationBytes, decoded(overlays[0]))
      : JSON.parse(materializationBytes.toString('utf8'))
  } else {
    const packages = documents.filter(document => document.inputKey === 'nck1_analyzed_package_manifest')
    if (materializations.length || packages.length !== 1 || overlays.length) reject('此版本没有唯一可回放的源材料化或分析包')
    const manifestBytes = decoded(packages[0])
    const packageManifest = parseStrictPackageJson(manifestBytes)
    sourceInput = { kind: NCK1_ANALYZED_PACKAGE_INPUT_KIND, manifestBytes,
      members: packageManifest.members.map(member => {
        const matches = documents.filter(document => document.inputKey === `source_document_${member.memberId.replace(/[^a-z0-9]+/gi, '_')}`)
        if (matches.length !== 1) reject('分析包源成员缺失或不唯一')
        return { memberId: member.memberId, role: member.role, mediaType: member.mediaType, bytes: decoded(matches[0]) }
      }) }
    const derived = deriveNck1AnalyzedPackageBundle(sourceInput)
    if (derived.issues.length || !derived.materialization) reject('封存分析包无法回放')
    materialization = derived.materialization
  }
  if (digestJson(materialization) !== commitment.materializationDigest) reject('源材料化与答案承诺不同')
  const sourceDocuments = sourceInput ? sourceInput.members.map(member => ({ documentId: member.memberId, bytes: member.bytes }))
    : materialization.documents.map(document => {
    const matches = documents.filter(captured => captured.sha256 === document.sha256)
    if (matches.length !== 1) reject('原文档身份不唯一或缺失')
    return { documentId: document.documentId, bytes: decoded(matches[0]) }
  })
  const sourceReferences = parseSourceReferencesBytes(referenceBytes)
  assertSourceReferences({ sidecar: sourceReferences, materialization,
    sourceDigest: commitment.sourceDigest, candidateDigest: commitment.candidateDigest, sourceDocuments, sourceInput })
  return { paperName: commitment.paperName, materialization, sourceReferences, sourceReferencesBytes: referenceBytes, sourceDocuments,
    sourceDigest: commitment.sourceDigest, candidateDigest: commitment.candidateDigest, commitment, ...(sourceInput ? { sourceInput } : {}) }
}
