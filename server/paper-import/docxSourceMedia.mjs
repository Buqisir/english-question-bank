import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_FILE_SIGNATURE = 0x02014b50
const LOCAL_FILE_SIGNATURE = 0x04034b50
const MAX_EOCD_SEARCH_BYTES = 65_557
const MAX_CAPTURE_BYTES = 50 * 1024 * 1024

const mediaTypes = Object.freeze({
  '.bmp': 'image/bmp',
  '.emf': 'image/emf',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
  '.wmf': 'image/wmf',
})

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - MAX_EOCD_SEARCH_BYTES)
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  throw new Error('DOCX ZIP central directory is missing')
}

function readTargetZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16)
  if (entryCount === 0xffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 DOCX source is unsupported')
  }

  const entries = new Map()
  let offset = centralOffset
  let capturedBytes = 0
  for (let index = 0; index < entryCount; index += 1) {
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
    const rawName = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    const entryName = rawName.replaceAll('\\', '/')
    const isTarget = entryName === 'word/document.xml'
      || (entryName.startsWith('word/media/') && !entryName.endsWith('/'))

    if (isTarget) {
      if ((flags & 0x1) !== 0) throw new Error(`Encrypted DOCX entry is unsupported: ${entryName}`)
      if (uncompressedSize > MAX_CAPTURE_BYTES) throw new Error(`DOCX entry is too large: ${entryName}`)
      if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_SIGNATURE) {
        throw new Error(`DOCX local entry is corrupt: ${entryName}`)
      }
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize)
      let content
      if (method === 0) content = Buffer.from(compressed)
      else if (method === 8) content = inflateRawSync(compressed)
      else throw new Error(`Unsupported DOCX ZIP compression method ${method}: ${entryName}`)
      if (content.length !== uncompressedSize) {
        throw new Error(`DOCX entry size mismatch: ${entryName}`)
      }
      capturedBytes += content.length
      if (capturedBytes > MAX_CAPTURE_BYTES) throw new Error('DOCX source media capture is too large')
      entries.set(entryName, content)
    }

    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function documentHasShapes(documentXml) {
  return /<(?:w:pict|v:shape|v:group|wps:wsp|c:chart|dgm:relIds)\b/.test(documentXml)
    || /<a:graphicData\b[^>]*\buri="[^"]*(?:wordprocessingShape|chart|diagram)[^"]*"/.test(documentXml)
}

function findSoffice() {
  const candidates = [
    process.env.SOFFICE_PATH,
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/Applications/OpenOffice.app/Contents/MacOS/soffice',
    'soffice',
  ].filter(Boolean)
  return candidates.find((candidate) => candidate === 'soffice' || existsSync(candidate))
    || 'soffice'
}

export function convertDocxShapesWithLibreOffice(
  buffer,
  {
    sofficePath = findSoffice(),
    execFileSyncImpl = execFileSync,
  } = {},
) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'eqb-docx-source-shapes-'))
  const docxPath = path.join(tempDir, 'source.docx')
  const pdfPath = path.join(tempDir, 'source.pdf')
  try {
    writeFileSync(docxPath, buffer)
    execFileSyncImpl(
      sofficePath,
      ['--headless', '--convert-to', 'pdf', '--outdir', tempDir, docxPath],
      { stdio: 'pipe', timeout: 60_000 },
    )
    if (!existsSync(pdfPath)) {
      throw new Error('LibreOffice did not produce the DOCX source-shape PDF')
    }
    const pdf = readFileSync(pdfPath)
    if (pdf.subarray(0, 4).toString('utf8') !== '%PDF') {
      throw new Error('LibreOffice produced an invalid DOCX source-shape PDF')
    }
    return pdf
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export function captureDocxSourceMedia({
  buffer,
  fileName = 'source.docx',
  convertShapesToPdf = convertDocxShapesWithLibreOffice,
}) {
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 2).toString('utf8') !== 'PK') {
    throw new Error(`${fileName} is not a DOCX ZIP container`)
  }
  const entries = readTargetZipEntries(buffer)
  const document = entries.get('word/document.xml')
  if (!document) throw new Error(`${fileName} has no word/document.xml`)

  const embeddedImages = [...entries.entries()]
    .filter(([entryName]) => entryName.startsWith('word/media/'))
    .map(([entryName, content]) => {
      const originalName = path.posix.basename(entryName)
      return {
        fileName: originalName,
        mediaType: mediaTypes[path.extname(originalName).toLowerCase()] || 'application/octet-stream',
        sha256: sha256(content),
        buffer: content,
      }
    })
    .sort((left, right) => left.fileName.localeCompare(right.fileName))

  let shapeCapture = null
  if (documentHasShapes(document.toString('utf8'))) {
    const pdf = convertShapesToPdf(buffer)
    if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 4).toString('utf8') !== '%PDF') {
      throw new Error('DOCX shape capture must return PDF bytes')
    }
    shapeCapture = {
      fileName: 'docx-shapes.pdf',
      mediaType: 'application/pdf',
      sha256: sha256(pdf),
      buffer: pdf,
    }
  }

  return {
    schemaVersion: 'docx-source-media-capture-v1',
    sourceFileName: fileName,
    sourceSha256: sha256(buffer),
    embeddedImages,
    shapeCapture,
  }
}
