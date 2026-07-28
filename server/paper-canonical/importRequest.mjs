import { readFileSync } from 'node:fs'
import path from 'node:path'

function requestError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/**
 * Load an operator-authored compiler request without embedding mutable or
 * machine-specific byte arrays in JSON. Each evidence document names one
 * immutable file relative to the request envelope.
 */
export function loadCanonicalImportRequest(requestPath) {
  const absoluteRequestPath = path.resolve(requestPath)
  let envelope
  try {
    envelope = JSON.parse(readFileSync(absoluteRequestPath, 'utf8'))
  } catch (error) {
    throw requestError(
      'CANONICAL_IMPORT_REQUEST_INVALID',
      `Canonical import request cannot be read: ${error.message}`,
    )
  }
  if (
    !envelope
    || typeof envelope !== 'object'
    || !envelope.authority
    || !Array.isArray(envelope.evidence?.documents)
    || envelope.evidence.documents.length === 0
  ) {
    throw requestError(
      'CANONICAL_IMPORT_REQUEST_INVALID',
      'Canonical import request requires authority and evidence documents',
    )
  }

  const requestDir = path.dirname(absoluteRequestPath)
  const documents = envelope.evidence.documents.map((document, index) => {
    if (
      !document
      || typeof document !== 'object'
      || typeof document.path !== 'string'
      || document.path.length === 0
      || path.isAbsolute(document.path)
      || document.path.split(/[\\/]/).includes('..')
    ) {
      throw requestError(
        'CANONICAL_IMPORT_REQUEST_DOCUMENT_INVALID',
        `Canonical evidence document ${index + 1} requires a safe relative path`,
      )
    }
    const { path: relativePath, ...descriptor } = document
    let bytes
    try {
      bytes = readFileSync(path.join(requestDir, relativePath))
    } catch (error) {
      throw requestError(
        'CANONICAL_IMPORT_REQUEST_DOCUMENT_UNAVAILABLE',
        `Canonical evidence document ${relativePath} cannot be read: ${error.message}`,
      )
    }
    return { ...descriptor, bytes }
  })

  return {
    ...envelope,
    evidence: {
      ...envelope.evidence,
      documents,
    },
  }
}
