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
import { pathToFileURL } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_FILE_SIGNATURE = 0x02014b50
const LOCAL_FILE_SIGNATURE = 0x04034b50
const MAX_EOCD_SEARCH_BYTES = 65_557
const MAX_CAPTURE_BYTES = 50 * 1024 * 1024
const EMU_PER_POINT = 12_700
const SVG_MATCH_TOLERANCE_POINTS = 3
const CROP_DPI = 144
const CROP_PADDING_POINTS = 2
const shapeXmlPartPattern = /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/
const vmlShapePattern = /<v:(shape|rect|roundrect|oval|line|polyline|arc|curve)\b([^>]*)(?:\/>|>[\s\S]*?<\/v:\1>)/g

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
    const isTarget = shapeXmlPartPattern.test(entryName)
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

function vmlPrimaryMarkup(documentXml) {
  return documentXml.replace(/<mc:Fallback\b[\s\S]*?<\/mc:Fallback>/g, '')
}

function documentHasShapes(documentXml) {
  if (
    /<(?:wps:wsp|c:chart|dgm:relIds)\b/.test(documentXml)
    || /<a:graphicData\b[^>]*\buri="[^"]*(?:wordprocessingShape|chart|diagram)[^"]*"/.test(documentXml)
  ) {
    return true
  }
  return [...vmlPrimaryMarkup(documentXml).matchAll(vmlShapePattern)].some(
    (match) => !/<v:imagedata\b/.test(match[0]),
  )
}

function decodeXml(value) {
  return String(value || '')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function xmlAttribute(source, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(source)
  return match ? decodeXml(match[1]) : null
}

function lengthToPoints(value) {
  const match = /^(-?\d+(?:\.\d+)?)(pt|in|cm|mm|px)?$/i.exec(String(value || '').trim())
  if (!match) return null
  const amount = Number(match[1])
  const unit = (match[2] || 'pt').toLowerCase()
  if (unit === 'pt') return amount
  if (unit === 'in') return amount * 72
  if (unit === 'cm') return amount * 72 / 2.54
  if (unit === 'mm') return amount * 72 / 25.4
  if (unit === 'px') return amount * 72 / 96
  return null
}

function extractShapeDescriptors(sourcePart, xml) {
  const shapes = []
  const drawingPattern = /<wp:(anchor|inline)\b[\s\S]*?<\/wp:\1>/g
  for (const match of xml.matchAll(drawingPattern)) {
    const block = match[0]
    if (!documentHasShapes(block)) continue
    const extent = /<wp:extent\b([^>]*)\/?>/.exec(block)
    const docPr = /<wp:docPr\b([^>]*)\/?>/.exec(block)
    const widthEmu = Number(extent ? xmlAttribute(extent[1], 'cx') : NaN)
    const heightEmu = Number(extent ? xmlAttribute(extent[1], 'cy') : NaN)
    const sourceShapeId = docPr ? xmlAttribute(docPr[1], 'name') : null
    if (
      !sourceShapeId
      || !Number.isFinite(widthEmu)
      || widthEmu <= 0
      || !Number.isFinite(heightEmu)
      || heightEmu <= 0
    ) {
      throw new Error(`DOCX shape metadata is incomplete in ${sourcePart}`)
    }
    shapes.push({
      sourcePart,
      sourceShapeId,
      widthPoints: widthEmu / EMU_PER_POINT,
      heightPoints: heightEmu / EMU_PER_POINT,
    })
  }

  for (const match of vmlPrimaryMarkup(xml).matchAll(vmlShapePattern)) {
    if (/<v:imagedata\b/.test(match[0])) continue
    const attributes = match[2]
    const style = xmlAttribute(attributes, 'style') || ''
    const width = /(?:^|;)\s*width\s*:\s*([^;]+)/i.exec(style)
    const height = /(?:^|;)\s*height\s*:\s*([^;]+)/i.exec(style)
    const sourceShapeId = xmlAttribute(attributes, 'id')
    const widthPoints = lengthToPoints(width?.[1])
    const heightPoints = lengthToPoints(height?.[1])
    if (!sourceShapeId || !widthPoints || !heightPoints) {
      throw new Error(`DOCX VML shape metadata is incomplete in ${sourcePart}`)
    }
    shapes.push({
      sourcePart,
      sourceShapeId,
      widthPoints,
      heightPoints,
    })
  }

  if (documentHasShapes(xml) && shapes.length === 0) {
    throw new Error(`DOCX shapes could not be enumerated in ${sourcePart}`)
  }
  return shapes
}

function resolveShapeAssociations(paperAsset, shapes) {
  const associations = paperAsset?.sources?.docx?.shapeAssociations
  if (!Array.isArray(associations) || associations.length !== shapes.length) {
    throw new Error('Every DOCX shape requires one explicit source/body association')
  }

  const groups = paperAsset?.content?.groups || {}
  const usedShapes = new Set()
  const usedFigures = new Set()
  const usedPageOrders = new Set()
  return associations.map((association) => {
    const shapeKey = `${association?.sourcePart}\0${association?.sourceShapeId}`
    const shape = shapes.find(
      (candidate) => (
        candidate.sourcePart === association?.sourcePart
        && candidate.sourceShapeId === association?.sourceShapeId
      ),
    )
    if (!shape || usedShapes.has(shapeKey)) {
      throw new Error(`DOCX shape association is missing or duplicated: ${shapeKey}`)
    }
    usedShapes.add(shapeKey)

    const figureId = String(association.figureId || '')
    const groupId = String(association.groupId || '')
    const kind = association.kind
    const placeholderMarker = String(association.placeholderMarker || '')
    const sourcePage = Number(association.sourcePage)
    const sourcePageOrder = Number(association.sourcePageOrder)
    const expectedMarker = `[${kind === 'table' ? '表' : '图'}: ${figureId}]`
    const pageOrderKey = `${sourcePage}\0${sourcePageOrder}`
    if (
      !/^fig-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(figureId)
      || usedFigures.has(figureId)
      || !groups[groupId]
      || !['figure', 'table'].includes(kind)
      || placeholderMarker !== expectedMarker
      || !Number.isInteger(sourcePage)
      || sourcePage < 1
      || !Number.isInteger(sourcePageOrder)
      || sourcePageOrder < 1
      || usedPageOrders.has(pageOrderKey)
    ) {
      throw new Error(`Invalid DOCX shape figure association: ${figureId || shapeKey}`)
    }
    usedFigures.add(figureId)
    usedPageOrders.add(pageOrderKey)

    const markerParagraphs = Object.values(groups).flatMap((group) =>
      (group?.passage?.paragraphs || []).filter(
        (paragraph) => String(paragraph?.text || '').trim().startsWith(placeholderMarker),
      ).map((paragraph) => ({ groupId: group.groupId, paragraphId: paragraph.paragraphId })),
    )
    if (markerParagraphs.length !== 1 || markerParagraphs[0].groupId !== groupId) {
      throw new Error(`DOCX shape marker must start exactly one paragraph in ${groupId}: ${placeholderMarker}`)
    }

    return {
      ...shape,
      sourcePage,
      sourcePageOrder,
      figureId,
      groupId,
      kind,
      placeholderMarker,
      caption: String(association.caption || figureId),
      paragraphId: markerParagraphs[0].paragraphId,
    }
  })
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

function findPdftocairo() {
  const candidates = [
    process.env.PDFTOCAIRO_PATH,
    '/opt/homebrew/bin/pdftocairo',
    '/usr/local/bin/pdftocairo',
    'pdftocairo',
  ].filter(Boolean)
  return candidates.find((candidate) => candidate === 'pdftocairo' || existsSync(candidate))
    || 'pdftocairo'
}

function svgAttribute(source, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(source)
  return match ? match[1] : null
}

function transformPoint(point, transform) {
  if (!transform) return point
  const match = /^matrix\(\s*([^)]+)\s*\)$/.exec(transform)
  if (!match) return point
  const values = match[1].split(/[\s,]+/).filter(Boolean).map(Number)
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) return point
  const [a, b, c, d, e, f] = values
  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  }
}

function pathPoints(pathData) {
  const tokens = String(pathData || '').match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || []
  const points = []
  let command = null
  let index = 0
  let current = { x: 0, y: 0 }
  let start = { x: 0, y: 0 }
  const parameterCounts = {
    M: 2,
    L: 2,
    T: 2,
    H: 1,
    V: 1,
    C: 6,
    S: 4,
    Q: 4,
    A: 7,
  }
  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) {
      command = tokens[index]
      index += 1
      if (command.toUpperCase() === 'Z') {
        current = { ...start }
        points.push(current)
        continue
      }
    }
    if (!command) break
    const upper = command.toUpperCase()
    const parameterCount = parameterCounts[upper]
    if (!parameterCount || index + parameterCount > tokens.length) break
    const values = tokens.slice(index, index + parameterCount).map(Number)
    if (values.some((value) => !Number.isFinite(value))) break
    index += parameterCount
    const relative = command !== upper
    const point = (x, y) => ({
      x: (relative ? current.x : 0) + x,
      y: (relative ? current.y : 0) + y,
    })
    if (upper === 'H') {
      current = { x: (relative ? current.x : 0) + values[0], y: current.y }
      points.push(current)
    } else if (upper === 'V') {
      current = { x: current.x, y: (relative ? current.y : 0) + values[0] }
      points.push(current)
    } else if (upper === 'A') {
      const end = point(values[5], values[6])
      points.push(
        { x: current.x - values[0], y: current.y - values[1] },
        { x: current.x + values[0], y: current.y + values[1] },
        end,
      )
      current = end
    } else {
      for (let valueIndex = 0; valueIndex < values.length; valueIndex += 2) {
        points.push(point(values[valueIndex], values[valueIndex + 1]))
      }
      current = points.at(-1)
    }
    if (upper === 'M') {
      start = { ...current }
      command = relative ? 'l' : 'L'
    }
  }
  return points
}

function boxFromPoints(points, transform) {
  if (points.length === 0) return null
  const transformed = points.map((point) => transformPoint(point, transform))
  const xs = transformed.map((point) => point.x)
  const ys = transformed.map((point) => point.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function extractSvgCandidates(svg) {
  const surfaceIndex = svg.indexOf('<g id="surface')
  const visible = surfaceIndex >= 0 ? svg.slice(surfaceIndex) : svg
  const candidates = []
  for (const match of visible.matchAll(/<path\b([^>]*)\/?>/g)) {
    const box = boxFromPoints(
      pathPoints(svgAttribute(match[1], 'd')),
      svgAttribute(match[1], 'transform'),
    )
    if (box && box.width > 3 && box.height > 3) candidates.push(box)
  }
  for (const match of visible.matchAll(/<(?:rect|image)\b([^>]*)\/?>/g)) {
    const attributes = match[1]
    const x = Number(svgAttribute(attributes, 'x') || 0)
    const y = Number(svgAttribute(attributes, 'y') || 0)
    const width = Number(svgAttribute(attributes, 'width'))
    const height = Number(svgAttribute(attributes, 'height'))
    if (![x, y, width, height].every(Number.isFinite) || width <= 3 || height <= 3) continue
    const corners = [
      { x, y },
      { x: x + width, y },
      { x, y: y + height },
      { x: x + width, y: y + height },
    ]
    const box = boxFromPoints(corners, svgAttribute(attributes, 'transform'))
    if (box) candidates.push(box)
  }

  const deduplicated = []
  for (const candidate of candidates) {
    if (deduplicated.some((existing) => (
      Math.abs(existing.x - candidate.x) < 0.5
      && Math.abs(existing.y - candidate.y) < 0.5
      && Math.abs(existing.width - candidate.width) < 0.5
      && Math.abs(existing.height - candidate.height) < 0.5
    ))) continue
    deduplicated.push(candidate)
  }
  return deduplicated
}

function pngDimensions(buffer) {
  if (
    !Buffer.isBuffer(buffer)
    || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || buffer.length < 24
  ) {
    throw new Error('DOCX shape crop must return PNG bytes')
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

export function cropDocxShapesFromPdf(
  pdf,
  associations,
  {
    pdftocairoPath = findPdftocairo(),
    execFileSyncImpl = execFileSync,
  } = {},
) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'eqb-docx-source-shape-crops-'))
  const pdfPath = path.join(tempDir, 'source.pdf')
  try {
    writeFileSync(pdfPath, pdf)
    const candidatesByPage = new Map()
    for (const sourcePage of new Set(associations.map((association) => association.sourcePage))) {
      const svgPath = path.join(tempDir, `page-${sourcePage}.svg`)
      execFileSyncImpl(
        pdftocairoPath,
        ['-svg', '-f', String(sourcePage), '-l', String(sourcePage), pdfPath, svgPath],
        { stdio: 'pipe', timeout: 60_000 },
      )
      if (!existsSync(svgPath)) throw new Error(`DOCX shape PDF page ${sourcePage} could not be inspected`)
      candidatesByPage.set(sourcePage, extractSvgCandidates(readFileSync(svgPath, 'utf8')))
    }

    const selectedCandidates = new Map()
    for (const [sourcePage, candidates] of candidatesByPage) {
      const pageAssociations = associations
        .filter((association) => association.sourcePage === sourcePage)
        .sort((left, right) => left.sourcePageOrder - right.sourcePageOrder)
      const sizeGroups = []
      for (const association of pageAssociations) {
        const sizeGroup = sizeGroups.find((candidate) => (
          Math.abs(candidate.widthPoints - association.widthPoints) <= 0.5
          && Math.abs(candidate.heightPoints - association.heightPoints) <= 0.5
        ))
        if (sizeGroup) sizeGroup.associations.push(association)
        else {
          sizeGroups.push({
            widthPoints: association.widthPoints,
            heightPoints: association.heightPoints,
            associations: [association],
          })
        }
      }

      const usedCandidateIndexes = new Set()
      for (const sizeGroup of sizeGroups) {
        const matches = candidates
          .map((candidate, candidateIndex) => ({
            candidate,
            candidateIndex,
            score: (
              Math.abs(candidate.width - sizeGroup.widthPoints)
              + Math.abs(candidate.height - sizeGroup.heightPoints)
            ),
          }))
          .filter(({ candidate, candidateIndex }) => (
            !usedCandidateIndexes.has(candidateIndex)
            && Math.abs(candidate.width - sizeGroup.widthPoints) <= SVG_MATCH_TOLERANCE_POINTS
            && Math.abs(candidate.height - sizeGroup.heightPoints) <= SVG_MATCH_TOLERANCE_POINTS
          ))
          .sort((left, right) => left.score - right.score)
        const bestScore = matches[0]?.score
        const closest = matches.filter(({ score }) => score - bestScore < 0.25)
        if (sizeGroup.associations.length === 1) {
          if (closest.length !== 1) {
            const association = sizeGroup.associations[0]
            throw new Error(`DOCX shape crop is missing or ambiguous: ${association.sourcePart}#${association.sourceShapeId}`)
          }
        } else if (closest.length !== sizeGroup.associations.length) {
          throw new Error(`DOCX same-size shape crops are incomplete or ambiguous on page ${sourcePage}`)
        }
        const visualCandidates = closest.sort(
          (left, right) => left.candidate.y - right.candidate.y || left.candidate.x - right.candidate.x,
        )
        sizeGroup.associations.forEach((association, index) => {
          const selected = visualCandidates[index]
          usedCandidateIndexes.add(selected.candidateIndex)
          selectedCandidates.set(association.figureId, selected.candidate)
        })
      }
    }

    const counters = new Map()
    return associations.map((association, index) => {
      const selected = selectedCandidates.get(association.figureId)
      if (!selected) {
        throw new Error(`DOCX shape crop is missing or ambiguous: ${association.sourcePart}#${association.sourceShapeId}`)
      }

      const scale = CROP_DPI / 72
      const x = Math.max(0, Math.floor((selected.x - CROP_PADDING_POINTS) * scale))
      const y = Math.max(0, Math.floor((selected.y - CROP_PADDING_POINTS) * scale))
      const width = Math.max(1, Math.ceil((selected.width + 2 * CROP_PADDING_POINTS) * scale))
      const height = Math.max(1, Math.ceil((selected.height + 2 * CROP_PADDING_POINTS) * scale))
      const outputPrefix = path.join(tempDir, `crop-${index + 1}`)
      execFileSyncImpl(
        pdftocairoPath,
        [
          '-png',
          '-singlefile',
          '-r',
          String(CROP_DPI),
          '-f',
          String(association.sourcePage),
          '-l',
          String(association.sourcePage),
          '-x',
          String(x),
          '-y',
          String(y),
          '-W',
          String(width),
          '-H',
          String(height),
          pdfPath,
          outputPrefix,
        ],
        { stdio: 'pipe', timeout: 60_000 },
      )
      const outputPath = `${outputPrefix}.png`
      if (!existsSync(outputPath)) throw new Error(`DOCX shape crop was not created: ${association.figureId}`)
      const buffer = readFileSync(outputPath)
      const dimensions = pngDimensions(buffer)
      const counterKey = `${association.groupId}:${association.kind}`
      const ordinal = (counters.get(counterKey) || 0) + 1
      counters.set(counterKey, ordinal)
      const groupTail = association.groupId.replace(/^group-/, '')
      return {
        ...association,
        fileName: `${groupTail}-${association.kind}-${ordinal}.png`,
        mediaType: 'image/png',
        sha256: sha256(buffer),
        pixelWidth: dimensions.width,
        pixelHeight: dimensions.height,
        buffer,
      }
    })
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
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
  const profileUrl = pathToFileURL(path.join(tempDir, 'libreoffice-profile')).href
  try {
    writeFileSync(docxPath, buffer)
    execFileSyncImpl(
      sofficePath,
      [
        `-env:UserInstallation=${profileUrl}`,
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        tempDir,
        docxPath,
      ],
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
  paperAsset = null,
  convertShapesToPdf = convertDocxShapesWithLibreOffice,
  cropShapesFromPdf = cropDocxShapesFromPdf,
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

  const shapeParts = [...entries.entries()]
    .filter(([entryName]) => shapeXmlPartPattern.test(entryName))
    .map(([entryName, content]) => ({
      entryName,
      xml: content.toString('utf8'),
    }))
    .filter(({ xml }) => documentHasShapes(xml))
  const shapes = shapeParts.flatMap(({ entryName, xml }) => extractShapeDescriptors(entryName, xml))
  const associations = paperAsset?.sources?.docx?.shapeAssociations
  const associationsDeclared = !!associations
    && (!Array.isArray(associations) || associations.length > 0)
  const furnitureOnly = shapes.length > 0
    && shapes.every((shape) => shape.sourcePart !== 'word/document.xml')
    && !associationsDeclared

  let shapeCapture = null
  if (shapes.length > 0 && !furnitureOnly) {
    const boundAssociations = resolveShapeAssociations(paperAsset, shapes)
    const pdf = convertShapesToPdf(buffer)
    if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 4).toString('utf8') !== '%PDF') {
      throw new Error('DOCX shape capture must return PDF bytes')
    }
    const figures = cropShapesFromPdf(pdf, boundAssociations)
    if (
      !Array.isArray(figures)
      || figures.length !== boundAssociations.length
      || figures.some((figure) => (
        !Buffer.isBuffer(figure.buffer)
        || figure.sha256 !== sha256(figure.buffer)
        || figure.mediaType !== 'image/png'
      ))
    ) {
      throw new Error('DOCX shape crops are incomplete or digest-mismatched')
    }
    shapeCapture = {
      fileName: 'docx-shapes.pdf',
      mediaType: 'application/pdf',
      sha256: sha256(pdf),
      buffer: pdf,
      sourceParts: shapeParts.map(({ entryName }) => entryName),
      figures,
    }
  } else if (associationsDeclared) {
    if (!Array.isArray(associations)) {
      throw new Error(
        'paper-asset.json sources.docx.shapeAssociations must be an array',
      )
    }
    throw new Error(
      'paper-asset.json declares sources.docx.shapeAssociations but the DOCX yielded no enumerable shapes',
    )
  }

  return {
    schemaVersion: 'docx-source-media-capture-v1',
    sourceFileName: fileName,
    sourceSha256: sha256(buffer),
    embeddedImages,
    shapeCapture,
  }
}
