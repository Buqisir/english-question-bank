import { canonicalAuthorityRef } from '../../shared/paper-canonical/compiler.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { inflateRawSync } from 'node:zlib'

const textEncoder = new TextEncoder()

export const DOCX_SOURCE_ENVELOPE_MEDIA_TYPE =
  'application/vnd.eqb.docx-source-envelope+json'
export const DOCX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_FILE_SIGNATURE = 0x02014b50
const LOCAL_FILE_SIGNATURE = 0x04034b50
const MAX_EOCD_SEARCH_BYTES = 65_557
const MAX_DOCUMENT_XML_BYTES = 20 * 1024 * 1024

function requireRange(buffer, offset, length, label) {
  if (offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`DOCX ${label} is truncated`)
  }
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - MAX_EOCD_SEARCH_BYTES)
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  throw new Error('DOCX ZIP central directory is missing')
}

function readDocumentXml(docxBytes) {
  const buffer = Buffer.from(docxBytes)
  const eocdOffset = findEndOfCentralDirectory(buffer)
  requireRange(buffer, eocdOffset, 22, 'ZIP directory')
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16)
  if (entryCount === 0xffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 DOCX source is unsupported')
  }
  let offset = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    requireRange(buffer, offset, 46, 'ZIP central entry')
    if (buffer.readUInt32LE(offset) !== CENTRAL_FILE_SIGNATURE) {
      throw new Error('DOCX ZIP central directory is corrupt')
    }
    const flags = buffer.readUInt16LE(offset + 8)
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    requireRange(buffer, offset + 46, nameLength, 'ZIP entry name')
    const name = buffer
      .toString('utf8', offset + 46, offset + 46 + nameLength)
      .replaceAll('\\', '/')
    if (name === 'word/document.xml') {
      if ((flags & 0x1) !== 0) throw new Error('Encrypted DOCX source is unsupported')
      if (uncompressedSize > MAX_DOCUMENT_XML_BYTES) {
        throw new Error('DOCX document XML is too large')
      }
      requireRange(buffer, localOffset, 30, 'ZIP local entry')
      if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_SIGNATURE) {
        throw new Error('DOCX local entry is corrupt')
      }
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength
      requireRange(buffer, dataOffset, compressedSize, 'ZIP entry data')
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize)
      const content = method === 0
        ? Buffer.from(compressed)
        : method === 8
          ? inflateRawSync(compressed)
          : null
      if (!content) throw new Error(`Unsupported DOCX ZIP compression method ${method}`)
      if (content.length !== uncompressedSize) {
        throw new Error('DOCX document XML size mismatch')
      }
      return content.toString('utf8')
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  throw new Error('DOCX document XML is missing')
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

/**
 * Extract the textual body from one immutable DOCX without using a platform
 * converter. This intentionally preserves paragraph and hard-break boundaries
 * so a profile adapter may make its own deterministic structural decisions.
 */
export function extractDocxDocumentText(docxBytes) {
  if (!(docxBytes instanceof Uint8Array) || docxBytes.byteLength === 0) {
    throw new TypeError('DOCX text extraction requires immutable DOCX bytes')
  }
  const xml = readDocumentXml(docxBytes)
  return decodeXml(
    xml
      .replace(/<w:tab\b[^>]*\/?\s*>/g, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/?\s*>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
}

function immutableDocument(document) {
  if (
    !document
    || typeof document.inputKey !== 'string'
    || !Array.isArray(document.roles)
    || !(document.bytes instanceof Uint8Array)
    || typeof document.declared?.mediaType !== 'string'
  ) {
    throw new TypeError('DOCX source adapter supplemental evidence must be immutable documents')
  }
  return {
    inputKey: document.inputKey,
    roles: [...document.roles],
    bytes: new Uint8Array(document.bytes),
    declared: {
      mediaType: document.declared.mediaType,
      ...(document.declared.originalName
        ? { originalName: document.declared.originalName }
        : {}),
    },
  }
}

/**
 * Package structured source facts with their immutable DOCX evidence. The
 * compiler owns validation and never treats this as a legacy asset projection.
 */
export function buildDocxCanonicalImportRequest({
  docxBytes,
  source,
  originalName = 'source.docx',
  supplementalDocuments = [],
}) {
  if (!(docxBytes instanceof Uint8Array) || docxBytes.byteLength === 0) {
    throw new TypeError('DOCX source adapter requires immutable DOCX bytes')
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('DOCX source adapter requires structured source facts')
  }
  if (!Array.isArray(supplementalDocuments)) {
    throw new TypeError('DOCX source adapter supplemental evidence must be an array')
  }
  const supplemental = supplementalDocuments.map(immutableDocument)
  const inputKeys = new Set(['source_docx', 'docx_source_envelope'])
  for (const document of supplemental) {
    if (inputKeys.has(document.inputKey)) {
      throw new TypeError(`DOCX source adapter duplicate evidence input ${document.inputKey}`)
    }
    inputKeys.add(document.inputKey)
  }

  const sourceDocument = {
    inputKey: 'source_docx',
    mediaType: DOCX_MEDIA_TYPE,
    sha256: sha256(docxBytes),
    byteLength: docxBytes.byteLength,
  }
  const envelope = {
    schemaVersion: 'docx-source-envelope-v1',
    sourceDocument,
    source,
  }
  return {
    authority: canonicalAuthorityRef,
    evidence: {
      documents: [
        {
          inputKey: sourceDocument.inputKey,
          roles: [
            'question_source',
            'official_answer_source',
            'source_provenance',
          ],
          bytes: new Uint8Array(docxBytes),
          declared: { mediaType: DOCX_MEDIA_TYPE, originalName },
        },
        {
          inputKey: 'docx_source_envelope',
          roles: ['operator_assertions'],
          bytes: textEncoder.encode(JSON.stringify(envelope)),
          declared: {
            mediaType: DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
            originalName: 'docx-source-envelope.json',
          },
        },
        ...supplemental,
      ],
    },
  }
}
