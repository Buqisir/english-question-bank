export const PAPER_PDF_PRODUCTS = Object.freeze({
  largeComplete: '大字完整版',
  largeNoListening: '大字无听力版',
  economy8: '省纸版',
  answerOnly: '纯答案版',
})
export const PAPER_PDF_EDITIONS = Object.freeze(Object.keys(PAPER_PDF_PRODUCTS))

export function requirePaperPdfEdition(edition) {
  if (!PAPER_PDF_EDITIONS.includes(edition)) throw Object.assign(new Error('edition 必须是四款 PDF 产品之一'), { status: 400 })
  return edition
}
