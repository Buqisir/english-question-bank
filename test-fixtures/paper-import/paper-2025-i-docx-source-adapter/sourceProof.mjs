import {
  deriveDocxCanonicalSource,
  extractDocxDocumentText,
  inspectDocxListeningEvidence,
} from '../../../server/paper-canonical/docxSourceAdapter.mjs'
import { sha256 } from '../../../shared/paper-canonical/stable.mjs'

/**
 * Reproduce the Ticket 25 proof through the same complete DOCX derivation
 * consumed by the public compiler. The fixture contributes only immutable
 * source bytes; it does not maintain a second semantic projection.
 */
export function makePaper2025IDocxSourceProof(docxBytes) {
  const source = deriveDocxCanonicalSource(docxBytes)
  if (source.paperId !== 'paper-2025-i' || source.profileId !== 'nck1') {
    throw new Error('DOCX source does not identify the approved Ticket 25 paper')
  }
  const inactiveListening = inspectDocxListeningEvidence(docxBytes)
  if (
    inactiveListening.questions.length !== 20
    || inactiveListening.questions.some((question, index) =>
      question.questionNo !== index + 1
      || Object.keys(question.options).join('') !== 'ABC'
      || !Object.hasOwn(question.options, question.answer))
  ) {
    throw new Error('DOCX source listening questions, A-C Options, or answers are incomplete')
  }
  const rawText = extractDocxDocumentText(docxBytes)
  return {
    source,
    rawTextDigest: sha256(new TextEncoder().encode(rawText)),
    familyCounts: Object.fromEntries([
      'reading',
      'seven-choices',
      'cloze',
      'grammar-fill',
      'application-writing',
      'continuation-writing',
    ].map((family) => [
      family,
      source.groups.filter((group) => group.family === family).length,
    ])),
    inactiveListening,
    officialAnswerCount: source.assertions.length,
  }
}
