import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { PAPER_PDF_PRODUCTS } from '../../shared/paperPdfProducts.mjs'
import { configuredBlobStore } from './blobStore.mjs'

export const PRODUCT_MANIFEST = 'products/manifest-v1.json'
export const PRODUCT_FILES = Object.keys(PAPER_PDF_PRODUCTS).map(edition => ({
  path: `products/${edition}.pdf`, mediaType: 'application/pdf', role: 'pdf_product',
}))

export function frozenProductResult(products, edition) {
  const file = products.manifest.files.find(file => file.path === `products/${edition}.pdf`)
  if (!file) reject('产品不存在')
  const pdfBytes = products.bytes[file.path]
  return { pdfBytes, pageCount: file.pageCount, edition, mode: 'frozen',
    draftPaper: { title: products.manifest.paperName },
    paginatedHtml: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>PDF 预览</title><style>html,body,iframe{width:100%;height:100%;margin:0;border:0}</style><iframe title="PDF 预览" src="data:application/pdf;base64,${pdfBytes.toString('base64')}"></iframe></html>` }
}

function reject(message) {
  throw Object.assign(new Error(`固定 PDF 产品不可用：${message}`), { code: 'FROZEN_PRODUCTS_INVALID', status: 409 })
}

export function productInputDigest(rootDir, files) {
  return digestJson(files.filter(file => !file.path.startsWith('products/')).map(file => {
    const bytes = readFileSync(path.join(rootDir, file.path))
    return { ...file, sha256: sha256(bytes), byteLength: bytes.length }
  }).sort((a, b) => a.path.localeCompare(b.path)))
}

// The manifest is itself an uploaded, approval-bound Review file. The input
// digest excludes products, avoiding a circular digest and binding config,
// source documents, answer references, pagination and all other Review inputs.
export function readFrozenProducts(rootDir, { inputDigest, required = false, readArtifact = null } = {}) {
  const read = readArtifact || (relative => {
    const file = path.join(rootDir, relative)
    return existsSync(file) ? readFileSync(file) : null
  })
  const manifestBytes = read(PRODUCT_MANIFEST)
  if (!manifestBytes) {
    if (required) reject('请先生成四款产品，再提交新的 Review')
    return null
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  if (manifest.schemaVersion !== 'paper-pdf-products-v1'
    || !/^sha256:[a-f0-9]{64}$/.test(manifest.inputDigest || '')
    || (inputDigest && manifest.inputDigest !== inputDigest)
    || typeof manifest.paperName !== 'string' || !manifest.paperName.trim()
    || !Array.isArray(manifest.files) || manifest.files.length !== PRODUCT_FILES.length) reject('输入或四款文件清单不一致')
  const bytes = { [PRODUCT_MANIFEST]: manifestBytes }
  for (const [index, expected] of PRODUCT_FILES.entries()) {
    const file = manifest.files[index]
    if (file.path !== expected.path || file.mediaType !== expected.mediaType
      || !Number.isSafeInteger(file.pageCount) || file.pageCount < 1
      || !Number.isSafeInteger(file.byteLength) || file.byteLength < 5
      || !/^sha256:[a-f0-9]{64}$/.test(file.sha256 || '')) reject('产品文件描述无效')
    const buffer = read(expected.path)
    if (!buffer || buffer.length !== file.byteLength || sha256(buffer) !== file.sha256
      || buffer.subarray(0, 5).toString() !== '%PDF-') reject(`文件缺失或已改变：${expected.path}`)
    bytes[expected.path] = buffer
  }
  return { manifest, bytes, digest: sha256(manifestBytes) }
}

// SQLite's successful publication report commits these files, not a mutable
// latest folder. No fallback rendering and no adopting an unreviewed PDF.
export function readPublishedProducts({ db, paperAssetsDir, consumption, required = false, readArtifact = null }) {
  const { paperId, sourceAssetVersion, publicationDigest } = consumption
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(paperId || '') || !Number.isSafeInteger(sourceAssetVersion)
    || sourceAssetVersion < 1 || !/^sha256:[a-f0-9]{64}$/.test(publicationDigest || '')) reject('版本身份无效')
  const hasRuns = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='paper_import_runs'").get()
  const runs = hasRuns ? db.prepare(`SELECT publish_report_json FROM paper_import_runs
    WHERE paper_id = ? AND asset_version = ? AND status = 'published'`).all(paperId, sourceAssetVersion) : []
  if (runs.length > 1) reject('版本发布记录不唯一')
  const report = runs.length ? JSON.parse(runs[0].publish_report_json) : null
  const commitment = report?.pdfProducts
  const rootDir = path.join(paperAssetsDir, paperId, 'versions', `v${sourceAssetVersion}`)
  if (!commitment) {
    if (required || existsSync(path.join(rootDir, PRODUCT_MANIFEST))) reject('此版本尚无已审固定 PDF，需重新审核发布')
    return null
  }
  const canonical = db.prepare(`SELECT publication_digest FROM canonical_paper_publications
    WHERE paper_id = ? AND version_name = ?`).get(paperId, `v${sourceAssetVersion}`)
  const version = db.prepare(`SELECT status FROM paper_asset_versions
    WHERE paper_id = ? AND asset_version = ?`).get(paperId, sourceAssetVersion)
  if (canonical?.publication_digest !== publicationDigest || version?.status !== 'published'
    || report.canonicalPublicationDigest !== publicationDigest || report.paperId !== paperId
    || report.assetVersion !== sourceAssetVersion || report.versionName !== `v${sourceAssetVersion}`
    || !commitment.approvalId || !commitment.revisionId || !/^sha256:[a-f0-9]{64}$/.test(commitment.bundleDigest || '')) reject('产品与发布版本或批准身份不同')
  const products = readFrozenProducts(rootDir, { required: true, readArtifact })
  if (products.digest !== commitment.manifestDigest || products.manifest.paperId !== paperId) reject('已审产品字节不同')
  return products
}

export async function loadStoredProducts({ db, paperAssetsDir, consumption, blobStore = configuredBlobStore() }) {
  const rows = db.prepare(`SELECT publish_report_json FROM paper_import_runs
    WHERE paper_id = ? AND asset_version = ? AND status = 'published'`).all(consumption.paperId, consumption.sourceAssetVersion)
  if (rows.length !== 1) reject('没有唯一的发布文件记录')
  const report = JSON.parse(rows[0].publish_report_json)
  const storage = report.fileStorage
  if (!storage || storage.schemaVersion !== 'review-file-storage-v1' || storage.store !== blobStore.identity
    || storage.bundleDigest !== report.pdfProducts?.bundleDigest
    || report.canonicalPublicationDigest !== consumption.publicationDigest) reject('正式文件存储未接通或版本不一致')
  const snapshot = new Map()
  for (const relative of [PRODUCT_MANIFEST, ...PRODUCT_FILES.map(file => file.path)]) {
    snapshot.set(relative, await blobStore.get(storage.files?.[relative]))
  }
  // No network during validation: read only the hash-verified byte snapshot.
  return readPublishedProducts({ db, paperAssetsDir, consumption, required: true,
    readArtifact: relative => snapshot.get(relative) || null })
}
