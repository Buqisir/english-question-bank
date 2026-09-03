import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import path from 'node:path'

function uploadError(prefix, suffix, message, status = 400) {
  const error = new Error(message)
  error.code = `${prefix}_${suffix}`
  error.status = status
  return error
}

export async function receiveVerifiedUpload(
  request,
  destination,
  expected,
  {
    errorPrefix = 'IMPORT_REVIEW',
    expectedContentType = '',
    validateTemporaryFile = null,
  } = {},
) {
  const contentType = String(request.headers?.['content-type'] || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()
  if (expectedContentType && contentType !== expectedContentType.toLowerCase()) {
    throw uploadError(
      errorPrefix,
      'FILE_MIME_MISMATCH',
      'Content-Type does not match manifest',
      415,
    )
  }
  const contentLength = Number(request.headers?.['content-length'])
  if (Number.isFinite(contentLength) && contentLength !== expected.byteLength) {
    throw uploadError(
      errorPrefix,
      'FILE_SIZE_MISMATCH',
      'Content-Length does not match manifest',
    )
  }
  mkdirSync(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.upload-${randomUUID()}`
  const descriptor = openSync(temporary, 'wx')
  const hash = createHash('sha256')
  let byteLength = 0
  try {
    try {
      for await (const chunk of request) {
        byteLength += chunk.length
        if (byteLength > expected.byteLength) {
          throw uploadError(
            errorPrefix,
            'FILE_SIZE_MISMATCH',
            'Uploaded file is larger than manifest',
          )
        }
        hash.update(chunk)
        writeSync(descriptor, chunk)
      }
    } finally {
      closeSync(descriptor)
    }
    const sha256 = `sha256:${hash.digest('hex')}`
    if (byteLength !== expected.byteLength || sha256 !== expected.sha256) {
      throw uploadError(
        errorPrefix,
        'FILE_DIGEST_MISMATCH',
        'Uploaded file does not match manifest',
      )
    }
    if (validateTemporaryFile) {
      await validateTemporaryFile(temporary, expected)
    }
    renameSync(temporary, destination)
    return { sha256, byteLength }
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary)
    throw error
  }
}
