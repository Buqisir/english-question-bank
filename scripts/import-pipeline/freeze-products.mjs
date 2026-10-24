#!/usr/bin/env node
// Local rendering only. Does not submit, approve or publish a Review.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { readExamDate } from '../../shared/examDate.mjs'
import { buildNck1ReviewProjection, reviewBundleFilePaths } from '../../server/import-review/revisionProjection.mjs'
import { renderReviewPdfProduct } from '../../server/import-review/reviewPagination.mjs'
import { PRODUCT_MANIFEST, productInputDigest, readFrozenProducts } from '../../server/paper-import/frozenProducts.mjs'
import { ABSENT_BY_EXAM_DESIGN, NO_LISTENING_PRODUCT_SCHEMA, productFiles, sourceProductEditions } from '../../server/paper-import/pdfProductSet.mjs'
import { productPageLimitsForPlan } from '../../server/paper-import/paginationPlan.mjs'
import { LARGE_PAGE_LIMIT_AUTHORIZATION } from '../../server/paper-import/pdfPageLimits.mjs'
import { buildPrintHtml } from '../../server/print-renderer.mjs'
import { closeChromiumPool } from '../../server/draft-paper/chromiumPool.mjs'

const usage = 'Use freeze-products.mjs --paper-dir <local workspace> [--parallel]'

function currentInputDigest(rootDir, projection) {
  return productInputDigest(rootDir, reviewBundleFilePaths(rootDir), projection.reviewedListening)
}

// The resident Chromium pool renders serially within one process, so
// --parallel renders each product in its own child against the same inputs.
async function renderOne([edition, dirFlag, dir, outputFlag, output, digestFlag, inputDigest]) {
  if (dirFlag !== '--paper-dir' || outputFlag !== '--output' || digestFlag !== '--input-digest') throw new Error(usage)
  const rootDir = path.resolve(dir)
  const projection = buildNck1ReviewProjection(rootDir, { requireAnalyses: true })
  const listeningCount = projection.paginationSlotBindings.filter(entry => entry.familyContractId === 'listening').length
  if (!sourceProductEditions(projection.config, listeningCount).includes(edition)) throw new Error(usage)
  if (currentInputDigest(rootDir, projection) !== inputDigest) throw new Error('生成期间输入改变')
  const result = await renderReviewPdfProduct(projection, edition, buildPrintHtml)
  writeFileSync(output, result.pdfBytes, { flag: 'wx' })
  console.log(JSON.stringify({ sha256: sha256(result.pdfBytes), byteLength: result.pdfBytes.length, pageCount: result.pageCount }))
}

function renderInChild(rootDir, edition, output, inputDigest) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--render-one', edition,
      '--paper-dir', rootDir, '--output', output, '--input-digest', inputDigest], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${edition}: ${stderr.trim() || `exit ${code}`}`))
      else resolve(JSON.parse(stdout.trim().split('\n').pop()))
    })
  })
}

async function freeze(args) {
  const parallel = args.length === 3 && args[2] === '--parallel'
  if ((args.length !== 2 && !parallel) || args[0] !== '--paper-dir') throw new Error(usage)
  const rootDir = path.resolve(args[1])
  if (existsSync(path.join(rootDir, 'products'))) throw new Error('产品目录已存在；保留旧字节，请在新 revision 工作副本生成')
  const projection = buildNck1ReviewProjection(rootDir, { requireAnalyses: true })
  const examDate = readExamDate(projection.config.provenance, { required: true })
  const pageLimits = productPageLimitsForPlan(projection.paginationPlan)
  const { economyPageLimit } = pageLimits
  const extendedLarge = projection.paginationPlan?.schemaVersion === 'paper-pagination-plan-v6'
  const listeningCount = projection.paginationSlotBindings.filter(entry => entry.familyContractId === 'listening').length
  const selectedFiles = productFiles(sourceProductEditions(projection.config, listeningCount))
  const inputDigest = currentInputDigest(rootDir, projection)
  const staging = path.join(rootDir, `.products-${randomUUID()}`)
  mkdirSync(path.join(staging, 'products'), { recursive: true })
  const files = []
  if (parallel) {
    const results = await Promise.all(selectedFiles.map((file) =>
      renderInChild(rootDir, path.basename(file.path, '.pdf'), path.join(staging, file.path), inputDigest)))
    selectedFiles.forEach((file, index) => files.push({ ...file, ...results[index] }))
  } else {
    for (const file of selectedFiles) {
      const edition = path.basename(file.path, '.pdf')
      const result = await renderReviewPdfProduct(projection, edition, buildPrintHtml)
      writeFileSync(path.join(staging, file.path), result.pdfBytes, { flag: 'wx' })
      files.push({ ...file, sha256: sha256(result.pdfBytes), byteLength: result.pdfBytes.length, pageCount: result.pageCount })
    }
  }
  if (currentInputDigest(rootDir, projection) !== inputDigest) throw new Error(`生成期间输入改变；保留失败产物 ${staging}`)
  const noListening = projection.config.listening === ABSENT_BY_EXAM_DESIGN
  const manifest = { schemaVersion: extendedLarge ? 'paper-pdf-products-v4' : noListening ? NO_LISTENING_PRODUCT_SCHEMA : economyPageLimit === 9 ? 'paper-pdf-products-v2' : 'paper-pdf-products-v1',
    ...(extendedLarge ? { pageLimits, pageLimitAuthorization: LARGE_PAGE_LIMIT_AUTHORIZATION,
      ...(noListening ? { listening: ABSENT_BY_EXAM_DESIGN } : {}) } : noListening ? { listening: ABSENT_BY_EXAM_DESIGN, economyPageLimit } : economyPageLimit === 9 ? { economyPageLimit } : {}), paperId: projection.paperId,
    paperName: projection.paperName, examDate, inputDigest, files }
  writeFileSync(path.join(staging, PRODUCT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  readFrozenProducts(staging, { inputDigest, ...pageLimits, config: projection.config, listeningCount, required: true })
  renameSync(path.join(staging, 'products'), path.join(rootDir, 'products'))
  rmdirSync(staging)
  console.log(JSON.stringify({ status: 'local_products_frozen', paperId: projection.paperId, files,
    review: 'not_submitted', publication: null }))
}

try {
  const args = process.argv.slice(2)
  if (args[0] === '--render-one') await renderOne(args.slice(1))
  else await freeze(args)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await closeChromiumPool()
}
