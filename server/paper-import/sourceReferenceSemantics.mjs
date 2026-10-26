import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION } from '../../scripts/import-pipeline/ocr-source-references-version.mjs'
export { OCR_SOURCE_REFERENCES_PRODUCER_VERSION }
export const LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION = 'ocr-source-references-producer-v17'

export function assertSourceReferenceProducerVersion(version) {
  if (![LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION, OCR_SOURCE_REFERENCES_PRODUCER_VERSION].includes(version)) {
    throw Object.assign(new Error('Unsupported source-reference producer semantics'),
      { code: 'SOURCE_REFERENCES_PRODUCER_VERSION_INVALID' })
  }
  return version
}

// Original v1–v5 envelopes have no producerVersion: this historical shape
// permanently selects v17. New captures persist an explicit version within
// the existing whole-sidecar byte/digest binding. Cache state, file dates,
// current producer code and caller overrides never select sidecar semantics.
export function sourceReferenceProducerVersion(sidecar) {
  if (!sidecar) return OCR_SOURCE_REFERENCES_PRODUCER_VERSION
  if (Object.hasOwn(sidecar, 'producerVersion')) return assertSourceReferenceProducerVersion(sidecar.producerVersion)
  if (/^source-references-v[1-5]$/u.test(sidecar.schemaVersion)) return LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION
  return assertSourceReferenceProducerVersion(undefined)
}
