import { productPageLimitsForManifest } from './pdfPageLimits.mjs'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { digestJson, sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { PAPER_PDF_PRODUCTS } from '../../shared/paperPdfProducts.mjs'
import { studentProductPolicy } from '../draft-paper/studentProductPdf.mjs'
import { configuredBlobStore } from './blobStore.mjs'
import { listeningReviewPrintNeutralPaths } from './listeningReview.mjs'
import { manifestProductFiles, NO_LISTENING_PRODUCT_SCHEMA, sourceProductEditions } from './pdfProductSet.mjs'

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

const printInputRoles = new Set([
  'config', 'materialization', 'spelling_review', 'listening_instruction_correction', 'answer_corrections', 'ocr_source_evidence',
  'content_media', 'content_media_candidate', 'content_media_display_variant',
  'source_references', 'pagination_plan',
  'analyzed_package_manifest', 'analyzed_package_content', 'analyzed_package_official_answers', 'analyzed_package_media',
])

export function productInputFiles(files, reviewedListening = null, { legacy = false } = {}) {
  if (!legacy) return files.filter(file => printInputRoles.has(file.role)
    // The materialization adapter reads native DOCX runs for printed emphasis.
    || (['question_source', 'question_and_answers', 'official_answers'].includes(file.role)
      && file.mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
  const neutral = listeningReviewPrintNeutralPaths(reviewedListening)
  return files.filter(file => !file.path.startsWith('products/') && !neutral.has(file.path))
}

function printConfigBytes(config) {
  const { defaultTags: _tags, provenance, ...rest } = config
  const { defaultTags: _provenanceTags, ...printProvenance } = provenance ?? {}
  return Buffer.from(stableStringify({ ...rest, ...(provenance ? { provenance: printProvenance } : {}) }))
}

export function productInputDescriptor({ path, mediaType, role, sha256: digest, byteLength }, config) {
  if (role === 'config' && config) {
    const bytes = printConfigBytes(config)
    digest = sha256(bytes)
    byteLength = bytes.length
  }
  return { path, mediaType, role, sha256: digest, byteLength }
}

export function productInputDigest(rootDir, files, reviewedListening = null, options) {
  return digestJson(productInputFiles(files, reviewedListening, options).map(file => {
    const bytes = readFileSync(path.join(rootDir, file.path))
    return productInputDescriptor({ ...file, sha256: sha256(bytes), byteLength: bytes.length },
      !options?.legacy && file.role === 'config' ? JSON.parse(bytes) : null)
  }).sort((a, b) => a.path.localeCompare(b.path)))
}

// Only a byte-identical product manifest from a validated seal may supply the
// original input inventory. An edited print input needs a fresh freeze.
export function matchesSealedPrintInputs({ rootDir, inputDigest, sealedFiles, sealedConfigBytes }) {
  if (!sealedFiles) return false
  const oldConfig = sealedFiles.find(file => file.role === 'config')
  if (!oldConfig) return false
  const bytes = sealedConfigBytes ?? readFileSync(path.join(rootDir, oldConfig.path))
  if (bytes.length !== oldConfig.byteLength || sha256(bytes) !== oldConfig.sha256) return false
  const config = JSON.parse(bytes)
  const sealedDigest = digestJson(productInputFiles(sealedFiles).map(file => productInputDescriptor(file, config))
    .sort((a, b) => a.path.localeCompare(b.path)))
  return inputDigest === sealedDigest
}

function readProductManifest(manifestBytes, { inputDigest, legacyInputDigest, economyPageLimit, largeCompletePageLimit, largeNoListeningPageLimit, config, listeningCount } = {}) {
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  const expectedFiles = manifestProductFiles(manifest)
  if (config !== undefined || listeningCount !== undefined) {
    const editions = sourceProductEditions(config, listeningCount)
    if (editions.length !== expectedFiles.length) reject('听力声明与产品清单不同')
  }
  let pageLimits
  try { pageLimits = productPageLimitsForManifest(manifest) } catch (error) { reject(error.message) }
  const manifestPageLimit = pageLimits.economyPageLimit
  if (!['paper-pdf-products-v1', 'paper-pdf-products-v2', NO_LISTENING_PRODUCT_SCHEMA, 'paper-pdf-products-v4'].includes(manifest.schemaVersion)
    || (manifest.schemaVersion === 'paper-pdf-products-v2' && manifestPageLimit !== 9)
    || (largeCompletePageLimit !== undefined && pageLimits.largeCompletePageLimit !== largeCompletePageLimit)
    || (largeNoListeningPageLimit !== undefined && pageLimits.largeNoListeningPageLimit !== largeNoListeningPageLimit)
    || (economyPageLimit !== undefined && manifestPageLimit !== economyPageLimit)
    || !/^sha256:[a-f0-9]{64}$/.test(manifest.inputDigest || '')
    || (inputDigest && manifest.inputDigest !== inputDigest && manifest.inputDigest !== legacyInputDigest?.(manifest.inputDigest))
    || typeof manifest.paperName !== 'string' || !manifest.paperName.trim()
    || !Array.isArray(manifest.files) || manifest.files.length !== expectedFiles.length) reject('输入或产品文件清单不一致')
  for (const [index, expected] of expectedFiles.entries()) {
    const file = manifest.files[index]
    if (file.path !== expected.path || file.mediaType !== expected.mediaType
      || !Number.isSafeInteger(file.pageCount) || file.pageCount < 1
      || !Number.isSafeInteger(file.byteLength) || file.byteLength < 5
      || !/^sha256:[a-f0-9]{64}$/.test(file.sha256 || '')) reject('产品文件描述无效')
  }
  return { manifest, pageLimits }
}

function assertPdfBytes(buffer, file) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== file.byteLength || sha256(buffer) !== file.sha256
    || buffer.subarray(0, 5).toString() !== '%PDF-') reject(`文件缺失或已改变：${file.path}`)
}

// Keep already frozen manifests verifiable with their original input digest.
// New products bind the files supplying printed content and layout.
export function readFrozenProducts(rootDir, { required = false, readArtifact = null, ...options } = {}) {
  const read = readArtifact || (relative => {
    const file = path.join(rootDir, relative)
    return existsSync(file) ? readFileSync(file) : null
  })
  const manifestBytes = read(PRODUCT_MANIFEST)
  if (!manifestBytes) {
    if (required) reject('请先生成所需产品，再提交新的 Review')
    return null
  }
  const { manifest, pageLimits } = readProductManifest(manifestBytes, options)
  const bytes = { [PRODUCT_MANIFEST]: manifestBytes }
  for (const file of manifest.files) {
    const buffer = read(file.path)
    assertPdfBytes(buffer, file)
    let actualPages
    try {
      const info = execFileSync('pdfinfo', ['-'], { input: buffer, encoding: 'utf8',
        timeout: 10_000, maxBuffer: 64 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
      actualPages = Number(/^Pages:\s+(\d+)\s*$/m.exec(info)?.[1])
    } catch { reject(`PDF 无法解析：${file.path}`) }
    if (actualPages !== file.pageCount) reject(`PDF 实际页数与清单不同：${file.path}`)
    const edition = path.basename(file.path, '.pdf')
    if (edition !== 'answerOnly') {
      const policy = studentProductPolicy(edition, 2, pageLimits)
      if (policy.atMost ? actualPages > policy.targetPages : actualPages !== policy.targetPages) {
        reject(`PDF 页数不符合产品规格：${file.path}`)
      }
    }
    bytes[file.path] = buffer
  }
  return { manifest, bytes, digest: sha256(manifestBytes) }
}

// SQLite's successful publication report commits these files, not a mutable
// latest folder. No fallback rendering and no adopting an unreviewed PDF.
function publishedProductReport({ db, consumption }) {
  const { paperId, sourceAssetVersion, publicationDigest } = consumption
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(paperId || '') || !Number.isSafeInteger(sourceAssetVersion)
    || sourceAssetVersion < 1 || !/^sha256:[a-f0-9]{64}$/.test(publicationDigest || '')) reject('版本身份无效')
  const hasRuns = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='paper_import_runs'").get()
  const runs = hasRuns ? db.prepare(`SELECT publish_report_json FROM paper_import_runs
    WHERE paper_id = ? AND asset_version = ? AND status = 'published'`).all(paperId, sourceAssetVersion) : []
  if (runs.length > 1) reject('版本发布记录不唯一')
  const report = runs.length ? JSON.parse(runs[0].publish_report_json) : null
  const commitment = report?.pdfProducts
  if (!commitment) return null
  const canonical = db.prepare(`SELECT publication_digest FROM canonical_paper_publications
    WHERE paper_id = ? AND version_name = ?`).get(paperId, `v${sourceAssetVersion}`)
  const version = db.prepare(`SELECT status FROM paper_asset_versions
    WHERE paper_id = ? AND asset_version = ?`).get(paperId, sourceAssetVersion)
  if (canonical?.publication_digest !== publicationDigest || version?.status !== 'published'
    || report.canonicalPublicationDigest !== publicationDigest || report.paperId !== paperId
    || report.assetVersion !== sourceAssetVersion || report.versionName !== `v${sourceAssetVersion}`
    || !commitment.approvalId || !commitment.revisionId || !/^sha256:[a-f0-9]{64}$/.test(commitment.bundleDigest || '')) reject('产品与发布版本或批准身份不同')
  return report
}

export function readPublishedProducts({ db, paperAssetsDir, consumption, required = false, readArtifact = null }) {
  const report = publishedProductReport({ db, consumption })
  const { paperId, sourceAssetVersion } = consumption
  const rootDir = path.join(paperAssetsDir, paperId, 'versions', `v${sourceAssetVersion}`)
  if (!report) {
    if (required || existsSync(path.join(rootDir, PRODUCT_MANIFEST))) reject('此版本尚无已审固定 PDF，需重新审核发布')
    return null
  }
  const products = readFrozenProducts(rootDir, { required: true, readArtifact })
  if (products.digest !== report.pdfProducts.manifestDigest || products.manifest.paperId !== paperId) reject('已审产品字节不同')
  return products
}

export async function loadStoredProducts({ db, consumption, edition, blobStore = configuredBlobStore() }) {
  const report = publishedProductReport({ db, consumption })
  if (!report) reject('没有唯一的发布文件记录')
  const storage = report.fileStorage
  if (!storage || storage.schemaVersion !== 'review-file-storage-v1' || storage.store !== blobStore.identity
    || storage.bundleDigest !== report.pdfProducts.bundleDigest) reject('正式文件存储未接通或版本不一致')
  const manifestBytes = await blobStore.get(storage.files?.[PRODUCT_MANIFEST])
  const digest = sha256(manifestBytes)
  if (digest !== report.pdfProducts.manifestDigest) reject('已审产品清单字节不同')
  const { manifest } = readProductManifest(manifestBytes)
  if (manifest.paperId !== consumption.paperId) reject('已审产品字节不同')
  const bytes = { [PRODUCT_MANIFEST]: manifestBytes }
  if (edition !== undefined) {
    const file = manifest.files.find(file => file.path === `products/${edition}.pdf`)
    if (!file) reject('产品不存在')
    const buffer = await blobStore.get(storage.files?.[file.path])
    assertPdfBytes(buffer, file)
    bytes[file.path] = buffer
  }
  return { manifest, bytes, digest }
}
