import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const maxBuffer = 100 * 1024 * 1024
const coordinateKeys = ['xMin', 'yMin', 'xMax', 'yMax']

export class Nck1PdfTextStructureError extends Error {
  constructor(code, message, evidence = null) {
    super(message)
    this.name = 'Nck1PdfTextStructureError'
    this.code = code
    this.evidence = evidence
  }
}

function xmlText(value) {
  return String(value || '').replace(
    /&(?:#(\d+)|#x([a-f0-9]+)|([a-z]+));/giu,
    (entity, decimal, hexadecimal, named) => {
      if (decimal) return String.fromCodePoint(Number(decimal))
      if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16))
      return ({ amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' })[named] || entity
    },
  )
}

function attributes(value) {
  return Object.fromEntries([...String(value).matchAll(/([A-Za-z]+)="([^"]*)"/gu)]
    .map((match) => [match[1], match[2]]))
}

function coordinates(value) {
  const attrs = attributes(value)
  const result = Object.fromEntries(coordinateKeys.map((key) => [key, Number(attrs[key])]))
  return coordinateKeys.every((key) => Number.isFinite(result[key])) ? result : null
}

function union(boxes) {
  return {
    xMin: Math.min(...boxes.map((box) => box.xMin)),
    yMin: Math.min(...boxes.map((box) => box.yMin)),
    xMax: Math.max(...boxes.map((box) => box.xMax)),
    yMax: Math.max(...boxes.map((box) => box.yMax)),
  }
}

function normalizedRegion(box, page) {
  return {
    x: box.xMin / page.width,
    y: box.yMin / page.height,
    width: (box.xMax - box.xMin) / page.width,
    height: (box.yMax - box.yMin) / page.height,
  }
}

function locator(documentId, page, box) {
  return {
    kind: 'page_region',
    documentId,
    page: page.number,
    region: normalizedRegion(box, page),
  }
}

function verticalOverlap(left, right) {
  return Math.max(0, Math.min(left.yMax, right.yMax) - Math.max(left.yMin, right.yMin))
}

function horizontalOverlap(left, right) {
  return Math.max(0, Math.min(left.xMax, right.xMax) - Math.max(left.xMin, right.xMin))
}

function sameRow(left, right) {
  const leftCenter = (left.yMin + left.yMax) / 2
  const rightCenter = (right.yMin + right.yMax) / 2
  return Math.abs(leftCenter - rightCenter) <= 2
}

function parsePages(xml, documentId, expectedPageCount) {
  const pages = [...xml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/gu)]
    .map((match, pageIndex) => {
      const attrs = attributes(match[1])
      const page = {
        number: pageIndex + 1,
        width: Number(attrs.width),
        height: Number(attrs.height),
        blocks: [],
        wordCount: 0,
      }
      if (!(page.width > 0) || !(page.height > 0)) {
        throw new Nck1PdfTextStructureError(
          'NCK1_PDF_TEXT_COVERAGE_INCOMPLETE',
          `PDF page ${page.number} has no closed page geometry`,
          { documentId, page: page.number },
        )
      }
      for (const [blockIndex, blockMatch] of [...match[2]
        .matchAll(/<block\b([^>]*)>([\s\S]*?)<\/block>/gu)].entries()) {
        const lines = [...blockMatch[2].matchAll(/<line\b([^>]*)>([\s\S]*?)<\/line>/gu)]
          .map((lineMatch) => {
            const box = coordinates(lineMatch[1])
            const words = [...lineMatch[2].matchAll(/<word\b[^>]*>([\s\S]*?)<\/word>/gu)]
              .map((word) => xmlText(word[1]).trim())
              .filter(Boolean)
            page.wordCount += words.length
            if (!box && words.length > 0) {
              throw new Nck1PdfTextStructureError(
                'NCK1_PDF_TEXT_COVERAGE_INCOMPLETE',
                `PDF page ${page.number} contains text without closed coordinates`,
                {
                  documentId,
                  page: page.number,
                  region: { x: 0, y: 0, width: 1, height: 1 },
                },
              )
            }
            return box && words.length > 0 ? { ...box, text: words.join(' ') } : null
          })
          .filter(Boolean)
        if (lines.length === 0) continue
        if (lines.some((line, lineIndex) => lines.slice(lineIndex + 1).some((other) =>
          verticalOverlap(line, other) > Math.min(
            line.yMax - line.yMin,
            other.yMax - other.yMin,
          ) * 0.8
          && horizontalOverlap(line, other) > 0))) {
          throw new Nck1PdfTextStructureError(
            'NCK1_PDF_READING_ORDER_AMBIGUOUS',
            `PDF page ${page.number} contains overlapping text lines`,
            { documentId, page: page.number, region: normalizedRegion(union(lines), page) },
          )
        }
        const box = coordinates(blockMatch[1]) || union(lines)
        if (
          box.xMin < 0
          || box.yMin < 0
          || box.xMax > page.width + 0.5
          || box.yMax > page.height + 0.5
          || box.xMax <= box.xMin
          || box.yMax <= box.yMin
        ) {
          throw new Nck1PdfTextStructureError(
            'NCK1_PDF_TEXT_COVERAGE_INCOMPLETE',
            `PDF page ${page.number} contains text outside its page geometry`,
            { documentId, page: page.number },
          )
        }
        page.blocks.push({
          ...box,
          blockIndex: blockIndex + 1,
          page: page.number,
          text: lines.map((line) => line.text).join('\n'),
        })
      }
      page.blocks = mergeInlineBlockFragments(page.blocks)
      return page
    })
  if (pages.length !== expectedPageCount) {
    throw new Nck1PdfTextStructureError(
      'NCK1_PDF_TEXT_COVERAGE_INCOMPLETE',
      `PDF text evidence covers ${pages.length} of ${expectedPageCount} pages`,
      { documentId },
    )
  }
  const pagesWithText = pages.filter((page) => page.wordCount > 0)
  if (pagesWithText.length === 0) {
    throw new Nck1PdfTextStructureError(
      'NCK1_PDF_TEXT_LAYER_MISSING',
      'PDF has no reliable text layer; OCR is required',
      {
        documentId,
        page: pages[0].number,
        pages: pages.map((page) => page.number),
        region: { x: 0, y: 0, width: 1, height: 1 },
      },
    )
  }
  if (pagesWithText.length !== pages.length) {
    const missing = pages.filter((page) => page.wordCount === 0).map((page) => page.number)
    throw new Nck1PdfTextStructureError(
      'NCK1_PDF_TEXT_COVERAGE_INCOMPLETE',
      `PDF text layer is empty on page ${missing.join(', ')}`,
      {
        documentId,
        page: missing[0],
        pages: missing,
        region: { x: 0, y: 0, width: 1, height: 1 },
      },
    )
  }
  return pages
}

function embeddedRasterImagePages(sourcePath) {
  const output = execFileSync('pdfimages', ['-list', sourcePath], {
    encoding: 'utf8',
    maxBuffer,
  })
  return [...new Set(output.split(/\r?\n/u).flatMap((line) => {
    const match = /^\s*(\d+)\s+\d+\s+(?:image|mask|smask)\b/u.exec(line)
    return match ? [Number(match[1])] : []
  }))]
}

function rowGroups(blocks) {
  const groups = []
  for (const block of [...blocks].sort((left, right) =>
    left.yMin - right.yMin || left.xMin - right.xMin)) {
    const current = groups.at(-1)
    if (current?.every((candidate) => sameRow(candidate, block))) current.push(block)
    else groups.push([block])
  }
  return groups
}

function mergeInlineBlockFragments(blocks) {
  const merged = []
  for (const row of rowGroups(blocks)) {
    let current = null
    for (const block of row.sort((left, right) => left.xMin - right.xMin)) {
      const gap = current ? block.xMin - current.xMax : null
      if (current && gap >= -0.5 && gap <= 12) {
        current = {
          ...union([current, block]),
          text: `${current.text} ${block.text}`,
          page: current.page,
        }
      } else {
        if (current) merged.push(current)
        current = { ...block }
      }
    }
    if (current) merged.push(current)
  }
  return merged
    .sort((left, right) => left.yMin - right.yMin || left.xMin - right.xMin)
    .map((block, index) => ({ ...block, blockIndex: index + 1 }))
}

function parsePgm(bytes) {
  let offset = 0
  const token = () => {
    while (offset < bytes.length) {
      if (bytes[offset] === 35) {
        while (offset < bytes.length && bytes[offset] !== 10) offset += 1
      } else if (bytes[offset] <= 32) offset += 1
      else break
    }
    const start = offset
    while (offset < bytes.length && bytes[offset] > 32 && bytes[offset] !== 35) offset += 1
    return bytes.subarray(start, offset).toString('ascii')
  }
  if (token() !== 'P5') throw new Error('Expected a binary PGM raster')
  const width = Number(token())
  const height = Number(token())
  const maxValue = Number(token())
  if (!Number.isInteger(width) || width < 1
    || !Number.isInteger(height) || height < 1
    || maxValue !== 255) {
    throw new Error('Invalid PGM raster geometry')
  }
  if (bytes[offset] === 13 && bytes[offset + 1] === 10) offset += 2
  else if (bytes[offset] <= 32) offset += 1
  const pixels = bytes.subarray(offset, offset + width * height)
  if (pixels.length !== width * height) throw new Error('Incomplete PGM raster')
  return { width, height, pixels }
}

function dark(raster, x, y) {
  if (x < 0 || x >= raster.width || y < 0 || y >= raster.height) return false
  return raster.pixels[y * raster.width + x] <= 160
}

function lineStrength(raster, orientation, position, from, to) {
  const start = Math.max(0, Math.floor(from))
  const end = Math.min(
    orientation === 'vertical' ? raster.height - 1 : raster.width - 1,
    Math.ceil(to),
  )
  if (end < start) return 0
  let darkCount = 0
  for (let cursor = start; cursor <= end; cursor += 1) {
    const found = [-1, 0, 1].some((delta) => orientation === 'vertical'
      ? dark(raster, position + delta, cursor)
      : dark(raster, cursor, position + delta))
    if (found) darkCount += 1
  }
  return darkCount / (end - start + 1)
}

function lineCenters(raster, orientation, searchFrom, searchTo, spanFrom, spanTo) {
  const scaleLimit = orientation === 'vertical' ? raster.width : raster.height
  const positions = []
  for (
    let position = Math.max(0, Math.floor(searchFrom));
    position <= Math.min(scaleLimit - 1, Math.ceil(searchTo));
    position += 1
  ) {
    if (lineStrength(raster, orientation, position, spanFrom, spanTo) >= 0.7) {
      positions.push(position)
    }
  }
  const clusters = []
  for (const position of positions) {
    const current = clusters.at(-1)
    if (current && position <= current.at(-1) + 1) current.push(position)
    else clusters.push([position])
  }
  return clusters.map((cluster) => cluster.reduce((sum, value) => sum + value, 0) / cluster.length)
}

function enclosingGridLines(lines, groups, scale) {
  for (let start = 0; start <= lines.length - groups.length - 1; start += 1) {
    const sequence = lines.slice(start, start + groups.length + 1)
    if (groups.every((group, index) => group.every((box) =>
      box.min * scale >= sequence[index] - 2
      && box.max * scale <= sequence[index + 1] + 2))) {
      return sequence
    }
  }
  return null
}

function borderedTableBox(page, rows, raster) {
  const textBox = union(rows.flat())
  const xScale = raster.width / page.width
  const yScale = raster.height / page.height
  const verticalLines = lineCenters(
    raster,
    'vertical',
    (textBox.xMin - 20) * xScale,
    Math.min(page.width, textBox.xMax + page.width * 0.2) * xScale,
    (textBox.yMin - 4) * yScale,
    (textBox.yMax + 4) * yScale,
  )
  const columnGroups = rows[0].map((_, column) => rows.map((row) => ({
    min: row[column].xMin,
    max: row[column].xMax,
  })))
  const xLines = enclosingGridLines(verticalLines, columnGroups, xScale)
  if (!xLines) return null

  const horizontalLines = lineCenters(
    raster,
    'horizontal',
    (textBox.yMin - 20) * yScale,
    (textBox.yMax + 20) * yScale,
    xLines[0],
    xLines.at(-1),
  )
  const rowGroups = rows.map((row) => row.map((block) => ({
    min: block.yMin,
    max: block.yMax,
  })))
  const yLines = enclosingGridLines(horizontalLines, rowGroups, yScale)
  if (!yLines) return null
  return {
    xMin: xLines[0] / xScale,
    yMin: yLines[0] / yScale,
    xMax: xLines.at(-1) / xScale,
    yMax: yLines.at(-1) / yScale,
  }
}

function tableRuns(page, rasterPage) {
  const rows = rowGroups(page.blocks)
  const runs = []
  for (let index = 0; index < rows.length - 1;) {
    const first = rows[index]
    if (first.length < 2 || first.length > 4) {
      index += 1
      continue
    }
    if (first.slice(1).some((block, column) =>
      block.xMin - first[column].xMin < page.width * 0.06)) {
      index += 1
      continue
    }
    const run = [first]
    let nextIndex = index + 1
    while (nextIndex < rows.length) {
      const previous = run.at(-1)
      const next = rows[nextIndex]
      const previousBottom = Math.max(...previous.map((block) => block.yMax))
      const nextTop = Math.min(...next.map((block) => block.yMin))
      const sameColumns = next.length === first.length && next.every((block, column) =>
        Math.abs(block.xMin - first[column].xMin) <= 8)
      if (!sameColumns || nextTop - previousBottom > 12) break
      run.push(next)
      nextIndex += 1
    }
    const candidateBox = union(run.flat())
    if (run.length >= 2 && run.length <= 3
      && candidateBox.xMax - candidateBox.xMin <= page.width * 0.65) {
      const tableBox = borderedTableBox(page, run, rasterPage())
      if (tableBox) runs.push({ rows: run, box: tableBox })
      index = nextIndex
    } else index = run.length > 1 ? nextIndex : index + 1
  }
  return runs
}

function assertReadableLayout(pages, tableBlockIds, documentId) {
  for (const page of pages) {
    const blocks = page.blocks.filter((block) => !tableBlockIds.has(`${page.number}:${block.blockIndex}`))
    const leftColumn = new Set()
    const rightColumn = new Set()
    for (const left of blocks) {
      for (const right of blocks) {
        if (
          left.blockIndex === right.blockIndex
          || left.xMin >= right.xMin
          || verticalOverlap(left, right) <= 0
        ) continue
        const xOverlap = horizontalOverlap(left, right)
        const yOverlap = verticalOverlap(left, right)
        if (
          xOverlap > Math.min(left.xMax - left.xMin, right.xMax - right.xMin) * 0.2
          && yOverlap > Math.min(left.yMax - left.yMin, right.yMax - right.yMin) * 0.2
        ) {
          throw new Nck1PdfTextStructureError(
            'NCK1_PDF_READING_ORDER_AMBIGUOUS',
            `PDF page ${page.number} contains overlapping text blocks`,
            { documentId, page: page.number, region: normalizedRegion(union([left, right]), page) },
          )
        }
        if (
          left.xMax + 18 < right.xMin
          && left.xMin < page.width * 0.45
          && right.xMin > page.width * 0.45
        ) {
          leftColumn.add(left.blockIndex)
          rightColumn.add(right.blockIndex)
        }
      }
    }
    const columnLineCount = (indexes) => blocks
      .filter((block) => indexes.has(block.blockIndex))
      .reduce((count, block) => count + block.text.split('\n').length, 0)
    if (columnLineCount(leftColumn) >= 3 && columnLineCount(rightColumn) >= 3) {
      throw new Nck1PdfTextStructureError(
        'NCK1_PDF_MULTI_COLUMN_UNSUPPORTED',
        `PDF page ${page.number} contains an unsupported multi-column reading order`,
        { documentId, page: page.number, region: { x: 0, y: 0, width: 1, height: 1 } },
      )
    }
    const unresolvedRows = rowGroups(blocks).filter((row) => row.length > 1)
    if (unresolvedRows.length > 0) {
      throw new Nck1PdfTextStructureError(
        'NCK1_PDF_READING_ORDER_AMBIGUOUS',
        `PDF page ${page.number} contains side-by-side text without a supported table`,
        {
          documentId,
          page: page.number,
          region: normalizedRegion(union(unresolvedRows[0]), page),
        },
      )
    }
  }
}

function structureFromPages(pages, documentId, rasterPage) {
  const tableBlockIds = new Set()
  const tables = []
  const units = []
  let tableIndex = 0
  for (const page of pages) {
    for (const { rows, box } of tableRuns(page, () => rasterPage(page.number))) {
      tableIndex += 1
      const blocks = rows.flat()
      blocks.forEach((block) => tableBlockIds.add(`${page.number}:${block.blockIndex}`))
      const table = {
        kind: 'table',
        tableIndex,
        columnCount: rows[0].length,
        rows: rows.map((row) => ({
          header: false,
          cells: row.map((block) => ({
            text: block.text,
            sourceParagraphIndexes: [],
            columnSpan: 1,
            verticalMerge: null,
            containsDrawing: false,
            containsNestedTable: false,
          })),
        })),
        nestedTableCount: 0,
        source: locator(documentId, page, box),
        page: page.number,
        xMin: box.xMin,
        yMin: box.yMin,
      }
      tables.push(table)
      units.push(table)
    }
  }
  assertReadableLayout(pages, tableBlockIds, documentId)
  for (const page of pages) {
    for (const block of page.blocks) {
      if (tableBlockIds.has(`${page.number}:${block.blockIndex}`)) continue
      units.push({
        kind: 'paragraph',
        sourceIndex: locator(documentId, page, block),
        text: block.text,
        containsDrawing: false,
        page: page.number,
        xMin: block.xMin,
        yMin: block.yMin,
      })
    }
  }
  units.sort((left, right) =>
    left.page - right.page || left.yMin - right.yMin || left.xMin - right.xMin)
  return {
    paragraphs: units.filter((item) => item.kind === 'paragraph'),
    body: units.map(({ page: _page, xMin: _xMin, yMin: _yMin, ...item }) => item),
    tables,
    unsupportedParagraphCount: 0,
  }
}

export function extractNck1PdfTextStructure(pdfBytes, {
  documentId,
  expectedPageCount,
}) {
  if (!(pdfBytes instanceof Uint8Array) || pdfBytes.byteLength === 0) {
    throw new TypeError('PDF text extraction requires immutable PDF bytes')
  }
  if (!Number.isInteger(expectedPageCount) || expectedPageCount < 1) {
    throw new TypeError('PDF text extraction requires the captured page count')
  }
  const temp = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-pdf-text-'))
  try {
    const sourcePath = path.join(temp, 'source.pdf')
    writeFileSync(sourcePath, pdfBytes)
    const xml = execFileSync('pdftotext', [
      '-bbox-layout',
      '-enc', 'UTF-8',
      sourcePath,
      '-',
    ], { encoding: 'utf8', maxBuffer })
    const pages = parsePages(xml, documentId, expectedPageCount)
    let rasterImagePages
    try {
      rasterImagePages = embeddedRasterImagePages(sourcePath)
    } catch (error) {
      throw new Nck1PdfTextStructureError(
        'NCK1_PDF_TEXT_COVERAGE_INCOMPLETE',
        `PDF raster-image inventory is unavailable: ${error.message}`,
        {
          documentId,
          page: 1,
          region: { x: 0, y: 0, width: 1, height: 1 },
        },
      )
    }
    if (rasterImagePages.length > 0) {
      throw new Nck1PdfTextStructureError(
        'NCK1_PDF_VISUAL_REVIEW_REQUIRED',
        `PDF page ${rasterImagePages[0]} contains embedded raster imagery that this text-only adapter cannot preserve`,
        {
          documentId,
          page: rasterImagePages[0],
          pages: rasterImagePages,
          region: { x: 0, y: 0, width: 1, height: 1 },
        },
      )
    }
    const rasterPages = new Map()
    const rasterPage = (pageNumber) => {
      if (!rasterPages.has(pageNumber)) {
        try {
          const outputPrefix = path.join(temp, `page-${pageNumber}`)
          execFileSync('pdftoppm', [
            '-f', String(pageNumber),
            '-l', String(pageNumber),
            '-singlefile',
            '-gray',
            '-r', '72',
            sourcePath,
            outputPrefix,
          ], { stdio: 'pipe', maxBuffer })
          rasterPages.set(pageNumber, parsePgm(readFileSync(`${outputPrefix}.pgm`)))
        } catch (error) {
          throw new Nck1PdfTextStructureError(
            'NCK1_PDF_TEXT_COVERAGE_INCOMPLETE',
            `PDF page ${pageNumber} raster evidence is unavailable: ${error.message}`,
            {
              documentId,
              page: pageNumber,
              region: { x: 0, y: 0, width: 1, height: 1 },
            },
          )
        }
      }
      return rasterPages.get(pageNumber)
    }
    return structureFromPages(
      pages,
      documentId,
      rasterPage,
    )
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}
