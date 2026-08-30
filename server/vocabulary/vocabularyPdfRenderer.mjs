import { withChromiumPage } from '../draft-paper/chromiumPool.mjs'

const RENDER_TIMEOUT_MS = 45_000

export async function renderVocabularySetPdf({
  origin,
  cookie = '',
  setId,
  printJobId,
  accent,
  kind = 'cards',
  expectedPageCount,
  expectedQrCount,
}) {
  const url = new URL('/', origin)
  url.searchParams.set('view', 'vocabulary-review')
  if (printJobId) url.searchParams.set('vocabularyPrintJobId', printJobId)
  else url.searchParams.set('vocabularyPrintSetId', setId)
  url.searchParams.set('printAccent', accent)
  url.searchParams.set('vocabularyPrintMode', kind)

  return withChromiumPage(async (page) => {
    if (cookie) await page.setExtraHTTPHeaders({ cookie })
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS })
    await page.waitForFunction(() => {
      const state = document.querySelector('[data-vocabulary-print-state]')
        ?.getAttribute('data-vocabulary-print-state')
      return state === 'ready' || state === 'error'
    }, { timeout: RENDER_TIMEOUT_MS })

    const state = await page.locator('[data-vocabulary-print-state]').getAttribute('data-vocabulary-print-state')
    if (state !== 'ready') {
      const message = await page.locator('.vocabulary-request-error').first().textContent().catch(() => '')
      throw new Error(message?.trim() || '单词纸内容加载失败。')
    }

    await page.emulateMedia({ media: 'print' })
    const inspection = await page.evaluate(async () => {
      await document.fonts.ready
      const images = [...document.querySelectorAll('.vocabulary-print-sheet img')]
      await Promise.all(images.map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true })
            image.addEventListener('error', resolve, { once: true })
          })))
      return {
        pageCount: document.querySelectorAll('.vocabulary-print-page').length,
        imageCount: images.length,
        brokenImageCount: images.filter((image) => image.naturalWidth === 0).length,
        qrCount: document.querySelectorAll('.vocabulary-print-qr svg').length,
      }
    })

    if (Number.isInteger(expectedPageCount) && inspection.pageCount !== expectedPageCount) {
      throw new Error(`单词纸页数不一致：预期 ${expectedPageCount} 页，实际 ${inspection.pageCount} 页。`)
    }
    if (inspection.pageCount < 1) throw new Error('单词纸没有生成任何页面。')
    if (kind === 'cards' && (inspection.brokenImageCount > 0 || inspection.imageCount === 0)) {
      throw new Error(`单词纸图片加载失败：${inspection.brokenImageCount}/${inspection.imageCount}。`)
    }
    const requiredQrCount = Number.isInteger(expectedQrCount)
      ? expectedQrCount
      : kind === 'cards' || kind === 'dictation' ? 1 : 0
    if (inspection.qrCount !== requiredQrCount) {
      throw new Error(`单词纸二维码数量不正确：预期 ${requiredQrCount}，实际 ${inspection.qrCount}。`)
    }

    const pdfBytes = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    })
    return { pdfBytes, pageCount: inspection.pageCount }
  })
}
