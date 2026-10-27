import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION } from '../../scripts/import-pipeline/ocr-source-references-version.mjs'
export { OCR_SOURCE_REFERENCES_PRODUCER_VERSION }
export const LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION = 'ocr-source-references-producer-v17'
export const PREVIOUS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION = 'ocr-source-references-producer-v18'
export const EXPLICIT_TITLES_OCR_SOURCE_REFERENCES_PRODUCER_VERSION = 'ocr-source-references-producer-v19'
export const GIVEN_TITLES_OCR_SOURCE_REFERENCES_PRODUCER_VERSION = 'ocr-source-references-producer-v20'
export const COMPOSED_LABELS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION = 'ocr-source-references-producer-v21'
export const TITLE_ABBREVIATION_OCR_SOURCE_REFERENCES_PRODUCER_VERSION = 'ocr-source-references-producer-v22'
export const usesTitleAbbreviation = version =>
  [TITLE_ABBREVIATION_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, OCR_SOURCE_REFERENCES_PRODUCER_VERSION].includes(version)
export const usesExplicitWritingTitles = version =>
  [EXPLICIT_TITLES_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, GIVEN_TITLES_OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
    COMPOSED_LABELS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, TITLE_ABBREVIATION_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, OCR_SOURCE_REFERENCES_PRODUCER_VERSION].includes(version)
export const usesGivenTitleWritingSamples = version =>
  [GIVEN_TITLES_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, COMPOSED_LABELS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, TITLE_ABBREVIATION_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, OCR_SOURCE_REFERENCES_PRODUCER_VERSION].includes(version)
export const usesComposedWritingLabels = version => [COMPOSED_LABELS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, TITLE_ABBREVIATION_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, OCR_SOURCE_REFERENCES_PRODUCER_VERSION].includes(version)

export function assertSourceReferenceProducerVersion(version) {
  if (![LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, PREVIOUS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
    EXPLICIT_TITLES_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, GIVEN_TITLES_OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
    COMPOSED_LABELS_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, TITLE_ABBREVIATION_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, OCR_SOURCE_REFERENCES_PRODUCER_VERSION].includes(version)) {
    throw Object.assign(new Error('Unsupported source-reference producer semantics'),
      { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' })
  }
  return version
}

// First admission is never a historical replay. Missing/self-declared legacy
// versions cannot authorize the old ownership rules before a seal exists.
export function sourceReferenceProducerVersion(sidecar) {
  if (!sidecar) return OCR_SOURCE_REFERENCES_PRODUCER_VERSION
  if (!Object.hasOwn(sidecar, 'producerVersion') || sidecar.producerVersion !== OCR_SOURCE_REFERENCES_PRODUCER_VERSION) {
    throw Object.assign(new Error('First source-reference admission requires the current producer version'),
      { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' })
  }
  return sidecar.producerVersion
}
