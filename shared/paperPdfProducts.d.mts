export type PaperPdfEdition = 'largeComplete' | 'largeNoListening' | 'economy8' | 'answerOnly'
export const PAPER_PDF_PRODUCTS: Readonly<Record<PaperPdfEdition, string>>
export const PAPER_PDF_EDITIONS: readonly PaperPdfEdition[]
export function requirePaperPdfEdition(edition: unknown): PaperPdfEdition
