#!/usr/bin/env node
// Local rendering only. Does not submit, approve or publish a Review.
import { existsSync, mkdirSync, renameSync, rmdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { readExamDate } from '../../shared/examDate.mjs'
import { buildNck1ReviewProjection, reviewBundleFilePaths } from '../../server/import-review/revisionProjection.mjs'
import { renderReviewPdfProduct } from '../../server/import-review/reviewPagination.mjs'
import { PRODUCT_FILES, PRODUCT_MANIFEST, productInputDigest, readFrozenProducts } from '../../server/paper-import/frozenProducts.mjs'
import { economyPageLimitForPlan } from '../../server/paper-import/paginationPlan.mjs'
import { buildPrintHtml } from '../../server/print-renderer.mjs'
import { closeChromiumPool } from '../../server/draft-paper/chromiumPool.mjs'

try {
  if (process.argv.length !== 4 || process.argv[2] !== '--paper-dir') throw new Error('Use freeze-products.mjs --paper-dir <local workspace>')
  const rootDir = path.resolve(process.argv[3])
  if (existsSync(path.join(rootDir, 'products'))) throw new Error('产品目录已存在；保留旧字节，请在新 revision 工作副本生成')
  const projection = buildNck1ReviewProjection(rootDir, { requireAnalyses: true })
  const examDate = readExamDate(projection.config.provenance, { required: true })
  const economyPageLimit = economyPageLimitForPlan(projection.paginationPlan)
  const inputDigest = productInputDigest(rootDir, reviewBundleFilePaths(rootDir), projection.reviewedListening)
  const staging = path.join(rootDir, `.products-${randomUUID()}`)
  mkdirSync(path.join(staging, 'products'), { recursive: true })
  const files = []
  for (const file of PRODUCT_FILES) {
    const edition = path.basename(file.path, '.pdf')
    const result = await renderReviewPdfProduct(projection, edition, buildPrintHtml)
    writeFileSync(path.join(staging, file.path), result.pdfBytes, { flag: 'wx' })
    files.push({ ...file, sha256: sha256(result.pdfBytes), byteLength: result.pdfBytes.length, pageCount: result.pageCount })
  }
  if (productInputDigest(rootDir, reviewBundleFilePaths(rootDir), projection.reviewedListening) !== inputDigest) throw new Error(`生成期间输入改变；保留失败产物 ${staging}`)
  const manifest = { schemaVersion: economyPageLimit === 9 ? 'paper-pdf-products-v2' : 'paper-pdf-products-v1',
    ...(economyPageLimit === 9 ? { economyPageLimit } : {}), paperId: projection.paperId,
    paperName: projection.paperName, examDate, inputDigest, files }
  writeFileSync(path.join(staging, PRODUCT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  readFrozenProducts(staging, { inputDigest, economyPageLimit, required: true })
  renameSync(path.join(staging, 'products'), path.join(rootDir, 'products'))
  rmdirSync(staging)
  console.log(JSON.stringify({ status: 'local_products_frozen', paperId: projection.paperId, files,
    review: 'not_submitted', publication: null }))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await closeChromiumPool()
}
