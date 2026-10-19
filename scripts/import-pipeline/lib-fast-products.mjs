import { ABSENT_BY_EXAM_DESIGN, sourceProductEditions } from '../../server/paper-import/pdfProductSet.mjs'

// Before materialization only the explicit source declaration is available.
// Once Canonical exists callers pass its independent listening-slot count.
export function fastProductSet(config, listeningCount = config?.listening === ABSENT_BY_EXAM_DESIGN ? 0 : 2) {
  const products = sourceProductEditions(config, listeningCount)
  return { products, editions: products.filter(edition => edition !== 'answerOnly'),
    hasListening: config?.listening !== ABSENT_BY_EXAM_DESIGN }
}

export function declareFastListening(config, declaration, audio) {
  if (declaration !== null && declaration !== ABSENT_BY_EXAM_DESIGN) throw new Error('--listening 只接受 absent-by-exam-design')
  if (declaration && config.listening !== undefined && config.listening !== declaration) throw new Error('既有听力声明不同，不能静默替换')
  const next = declaration ? { ...config, listening: declaration } : config
  if (!fastProductSet(next).hasListening && audio) throw new Error('无听力来源不能附带 --audio')
  return next
}
