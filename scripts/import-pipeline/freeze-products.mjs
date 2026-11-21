#!/usr/bin/env node
// Local rendering only. Does not submit, approve or publish a Review.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { readExamDate } from '../../shared/examDate.mjs'
import { buildNck1ProductRefreshProjection, reviewBundleFilePaths } from '../../server/import-review/revisionProjection.mjs'
import { buildLocalReviewProjection, hydratedEvidenceBase } from './review.mjs'
import { renderReviewPdfProduct } from '../../server/import-review/reviewPagination.mjs'
import { PRODUCT_MANIFEST, productInputDigest, readFrozenProducts } from '../../server/paper-import/frozenProducts.mjs'
import { ABSENT_BY_EXAM_DESIGN, ANALYSIS_PDF_EDITION, NO_LISTENING_PRODUCT_SCHEMA, productFiles, sourceProductEditions } from '../../server/paper-import/pdfProductSet.mjs'
import { productPageLimitsForPlan } from '../../server/paper-import/paginationPlan.mjs'
import { LARGE_PAGE_LIMIT_AUTHORIZATION, EXTENDED_PAGE_LIMIT_AUTHORIZATION } from '../../server/paper-import/pdfPageLimits.mjs'
import { buildCompanionAnalysisHtml } from '../../server/exports/companionAnalysisRenderer.mjs'
import { renderPaginatedPaper } from '../../server/draft-paper/paginationRenderer.mjs'
import { buildPrintHtml } from '../../server/print-renderer.mjs'
import { closeChromiumPool } from '../../server/draft-paper/chromiumPool.mjs'

const usage = 'Use freeze-products.mjs --paper-dir <local workspace> [--parallel]'

function currentInputDigest(rootDir, projection) {
  return productInputDigest(rootDir,
    reviewBundleFilePaths(rootDir, projection.candidate, hydratedEvidenceBase(rootDir)), projection.reviewedListening)
}

function selectedEditions(projection, listeningCount) {
  const editions = sourceProductEditions(projection.config, listeningCount)
  return projection.analysisDigest ? [...editions, ANALYSIS_PDF_EDITION] : editions
}

function renderBinding(rootDir, projection) {
  return `${currentInputDigest(rootDir, projection)} ${projection.analysisDigest ?? ''}`
}

async function renderProduct(projection, edition, output) {
  const result = edition === ANALYSIS_PDF_EDITION
    ? await renderPaginatedPaper(buildCompanionAnalysisHtml({ projection }))
    : await renderReviewPdfProduct(projection, edition, buildPrintHtml)
  writeFileSync(output, result.pdfBytes, { flag: 'wx' })
  return { sha256: sha256(result.pdfBytes), byteLength: result.pdfBytes.length, pageCount: result.pageCount }
}

// The resident Chromium pool renders serially within one process, so
// --parallel renders each product in its own child against the same inputs.
async function renderOne([edition, dirFlag, dir, outputFlag, output, digestFlag, inputDigest]) {
  if (dirFlag !== '--paper-dir' || outputFlag !== '--output' || digestFlag !== '--input-digest') throw new Error(usage)
  const rootDir = path.resolve(dir)
  const projection = buildLocalReviewProjection(rootDir, { requireAnalyses: true })
  const listeningCount = projection.paginationSlotBindings.filter(entry => entry.familyContractId === 'listening').length
  if (!selectedEditions(projection, listeningCount).includes(edition)) throw new Error(usage)
  if (renderBinding(rootDir, projection) !== inputDigest) throw new Error('生成期间输入改变')
  console.log(JSON.stringify(await renderProduct(projection, edition, output)))
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
  const productsDir = path.join(rootDir, 'products')
  const refreshing = existsSync(productsDir)
  const project = () => refreshing
    ? buildNck1ProductRefreshProjection(rootDir, { requireAnalyses: true }, hydratedEvidenceBase(rootDir))
    : buildLocalReviewProjection(rootDir, { requireAnalyses: true })
  const projection = project()
  const existing = projection.frozenProducts
  if (refreshing && (!existing || !projection.analysisDigest)) throw new Error('已有产品目录，缺少可复用清单或同版讲评')
  const examDate = readExamDate(projection.config.provenance, { required: true })
  const pageLimits = productPageLimitsForPlan(projection.paginationPlan)
  const { economyPageLimit } = pageLimits
  const extendedLarge = projection.paginationPlan?.schemaVersion === 'paper-pagination-plan-v6'
  const listeningCount = projection.paginationSlotBindings.filter(entry => entry.familyContractId === 'listening').length
  const selectedFiles = productFiles(selectedEditions(projection, listeningCount))
  const inputDigest = currentInputDigest(rootDir, projection)
  const binding = `${inputDigest} ${projection.analysisDigest ?? ''}`
  const staging = path.join(rootDir, `.products-${randomUUID()}`)
  mkdirSync(path.join(staging, 'products'), { recursive: true })
  const files = []
  if (existing) {
    for (const file of existing.manifest.files.filter(file => file.path !== `products/${ANALYSIS_PDF_EDITION}.pdf`)) {
      writeFileSync(path.join(staging, file.path), existing.bytes[file.path], { flag: 'wx' })
      files.push(file)
    }
    const [file] = productFiles([ANALYSIS_PDF_EDITION])
    files.push({ ...file, ...await renderProduct(projection, ANALYSIS_PDF_EDITION, path.join(staging, file.path)) })
  } else if (parallel) {
    const results = await Promise.all(selectedFiles.map((file) =>
      renderInChild(rootDir, path.basename(file.path, '.pdf'), path.join(staging, file.path), binding)))
    selectedFiles.forEach((file, index) => files.push({ ...file, ...results[index] }))
  } else {
    for (const file of selectedFiles) {
      const edition = path.basename(file.path, '.pdf')
      files.push({ ...file, ...await renderProduct(projection, edition, path.join(staging, file.path)) })
    }
  }
  const current = project()
  if (renderBinding(rootDir, current) !== binding || current.frozenProducts?.digest !== existing?.digest) {
    throw new Error(`生成期间输入改变；保留失败产物 ${staging}`)
  }
  const noListening = projection.config.listening === ABSENT_BY_EXAM_DESIGN
  const manifest = existing ? { ...existing.manifest, inputDigest, analysisDigest: projection.analysisDigest, files }
    : { schemaVersion: extendedLarge ? 'paper-pdf-products-v4' : noListening ? NO_LISTENING_PRODUCT_SCHEMA : economyPageLimit === 9 ? 'paper-pdf-products-v2' : 'paper-pdf-products-v1',
    ...(extendedLarge ? { pageLimits, pageLimitAuthorization: (pageLimits.largeCompletePageLimit === 14
      || pageLimits.largeNoListeningPageLimit === 12 || pageLimits.economyPageLimit === 10
        ? EXTENDED_PAGE_LIMIT_AUTHORIZATION : LARGE_PAGE_LIMIT_AUTHORIZATION),
      ...(noListening ? { listening: ABSENT_BY_EXAM_DESIGN } : {}) } : noListening ? { listening: ABSENT_BY_EXAM_DESIGN, economyPageLimit } : economyPageLimit === 9 ? { economyPageLimit } : {}), paperId: projection.paperId,
    paperName: projection.paperName, examDate, inputDigest,
    ...(projection.analysisDigest ? { analysisDigest: projection.analysisDigest } : {}), files }
  writeFileSync(path.join(staging, PRODUCT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  readFrozenProducts(staging, { inputDigest, analysisDigest: projection.analysisDigest, ...pageLimits, config: projection.config, listeningCount, required: true })
  const previousDir = path.join(staging, 'previous-products')
  if (existing) renameSync(productsDir, previousDir)
  try {
    renameSync(path.join(staging, 'products'), productsDir)
  } catch (error) {
    if (existing) renameSync(previousDir, productsDir)
    throw error
  }
  if (existing) {
    const originalFiles = new Set(Object.keys(existing.bytes).map(file => path.basename(file)))
    if (readdirSync(previousDir).every(file => originalFiles.has(file))) {
      for (const file of originalFiles) unlinkSync(path.join(previousDir, file))
      rmdirSync(previousDir)
    } else {
      console.warn(`旧产品目录含额外文件，已保留在 ${previousDir}`)
    }
  }
  if (!existsSync(previousDir)) rmdirSync(staging)
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
