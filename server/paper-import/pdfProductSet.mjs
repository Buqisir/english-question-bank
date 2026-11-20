import { productPageLimitsForManifest } from './pdfPageLimits.mjs'
import { FROZEN_PAPER_PDF_PRODUCTS, PAPER_PDF_EDITIONS, requirePaperPdfEdition } from '../../shared/paperPdfProducts.mjs'

export const ANALYSIS_PDF_EDITION = 'analysis'

export function frozenProductLabel(edition) {
  return FROZEN_PAPER_PDF_PRODUCTS[edition === ANALYSIS_PDF_EDITION ? edition : requirePaperPdfEdition(edition)]
}

export function frozenProductInventory(files) {
  const editions = files.map(file => file.path.slice('products/'.length, -'.pdf'.length))
  return {
    editions: editions.filter(edition => edition !== ANALYSIS_PDF_EDITION),
    ...(editions.includes(ANALYSIS_PDF_EDITION) ? { analysisAvailable: true } : {}),
  }
}

export const ABSENT_BY_EXAM_DESIGN = 'absent-by-exam-design'
export const NO_LISTENING_PRODUCT_SCHEMA = 'paper-pdf-products-v3'
export const NO_LISTENING_EDITIONS = Object.freeze(['largeNoListening', 'economy8', 'answerOnly'])

// This is a source declaration in the sealed config, never inferred from audio.
// Canonical slots supply the independent content check.
export function sourceProductEditions(config, listeningCount) {
  const declaredAbsent = config?.listening === ABSENT_BY_EXAM_DESIGN
  if ((config?.listening !== undefined && !declaredAbsent)
    || (declaredAbsent ? listeningCount !== 0 : listeningCount !== 2)) {
    throw Object.assign(new Error('听力声明与 Canonical 题组不一致：无听力卷须声明 listening: "absent-by-exam-design"，有听力卷须有完整两个听力题组'), {
      code: 'PDF_PRODUCT_LISTENING_MISMATCH',
    })
  }
  return declaredAbsent ? NO_LISTENING_EDITIONS : PAPER_PDF_EDITIONS
}

export function productFiles(editions) {
  return editions.map(edition => ({
    path: `products/${edition}.pdf`, mediaType: 'application/pdf', role: 'pdf_product',
  }))
}

// Historical v1/v2 four-product records keep their original meaning.
export function manifestProductFiles(manifest) {
  const files = baseManifestProductFiles(manifest)
  if (manifest.analysisDigest === undefined) return files
  if (!/^sha256:[a-f0-9]{64}$/.test(manifest.analysisDigest || '')) {
    throw Object.assign(new Error('固定 PDF 产品不可用：讲评摘要无效'), {
      code: 'FROZEN_PRODUCTS_INVALID', status: 409,
    })
  }
  return files.concat(productFiles([ANALYSIS_PDF_EDITION]))
}

function baseManifestProductFiles(manifest) {
  if (manifest?.schemaVersion === 'paper-pdf-products-v4') {
    productPageLimitsForManifest(manifest)
    if (manifest.listening === undefined) return productFiles(PAPER_PDF_EDITIONS)
    if (manifest.listening === ABSENT_BY_EXAM_DESIGN && manifest.pageLimits.largeCompletePageLimit === 12) return productFiles(NO_LISTENING_EDITIONS)
  }
  if (manifest?.schemaVersion === NO_LISTENING_PRODUCT_SCHEMA
    && manifest.listening === ABSENT_BY_EXAM_DESIGN
    && [8, 9].includes(manifest.economyPageLimit)) return productFiles(NO_LISTENING_EDITIONS)
  if (['paper-pdf-products-v1', 'paper-pdf-products-v2'].includes(manifest?.schemaVersion)
    && manifest.listening === undefined) return productFiles(PAPER_PDF_EDITIONS)
  throw Object.assign(new Error('固定 PDF 产品不可用：产品清单版本或听力声明无效'), {
    code: 'FROZEN_PRODUCTS_INVALID', status: 409,
  })
}
