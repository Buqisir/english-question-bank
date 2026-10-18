#!/usr/bin/env node
// Reusable OCR proofreading lane for scanned public-paper-v1 sources.
//
//   evidence <paperId>        raster every immutable source page at the evidence density,
//                             run Tesseract, keep word-level engine output, then write one
//                             worksheet plus one editable page draft per page.
//   worksheets <paperId>      rebuild worksheets (and, with --reset-drafts, drafts) from the trace.
//   compile <paperId>         build and stage the evidence (with any declared figure regions),
//                             then write the evidence-bound confirmation and correctionNotes
//                             accepted by `review.mjs proofread-ocr`. `--pages a,b` only checks
//                             word closure and missing-figure hints for those pages and writes nothing.
//   presentation <paperId>    after materialize, upgrade the Materialization to v4 by binding the
//                             confirmed section-direction items as sourcePresentation.
//   report-entries <paperId>  after pull-ocr-confirmation + materialize, locate the receipt's
//                             real OCR repairs in the current Materialization for
//                             `review.mjs finalize-ocr-correction-report`.
//
// The tool never edits OCR observations or writes Owner receipts. Page drafts are the Agent's
// page-by-page source reading; every gate stays in the existing CLI and server.
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { rasterPdfRegion } from '../../server/paper-canonical/pdfRegionRaster.mjs'
import {
  NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V2,
  NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3,
  NCK1_OCR_EVIDENCE_FILE_NAME,
  buildNck1OcrSourceEvidence,
  nck1OcrSourceSetDigest,
  resolveConfirmedNck1OcrEvidence,
} from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { planHeadingRepairs } from './ocr-heading-repair.mjs'
import { missingFigureHints, missingFigureMessage } from './ocr-figure-guard.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const HEADING_REPAIRS_FILE = 'heading-repairs.json'
const execFileAsync = promisify(execFile)
// Must match RASTER_DENSITY in nck1OcrSourceEvidence.mjs so OCR reads the bound raster.
const EVIDENCE_DENSITY = 144
const FULL_PAGE = { x: 0, y: 0, width: 1, height: 1 }
const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/u
const WATERMARK = /微\s*信\s*公\s*众\s*号\s*(?:I\s*A\s*[Il1|]\s*)?(?:English)?/gu
const FOOTER = /第\s*\d+\s*页|共\s*\d+\s*页/u

function fail(message) {
  console.error(message)
  process.exit(1)
}

function option(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

function readJson(file, label) {
  if (!existsSync(file)) fail(`${label} is missing: ${file}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function context(paperId) {
  if (!paperId || !/^paper-[a-z0-9-]+$/u.test(paperId)) fail('A valid paperId is required')
  const paperDir = path.join(root, 'scripts/import-pipeline/papers', paperId)
  const manifest = readJson(path.join(paperDir, 'universal-source-manifest.json'), 'Source manifest')
  const documents = manifest.documents.filter((document) => !document.renditionOf).map((document) => ({
    ...document,
    bytes: new Uint8Array(readFileSync(path.join(paperDir, document.path))),
  }))
  const work = path.resolve(option('--work') || path.join(root, 'imports/ocr-proofread', paperId))
  return { paperId, paperDir, documents, work }
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function pageKey(documentId, page) {
  return `${documentId}-p${pad(page)}`
}

// Display/joined reading of OCR tokens: a space only between two non-CJK tokens.
function joinTokens(tokens) {
  return tokens.reduce((text, token) => {
    if (!text) return token
    return CJK.test(text.at(-1)) || CJK.test(token[0]) ? `${text}${token}` : `${text} ${token}`
  }, '')
}

function parseTsv(text) {
  const [header, ...rows] = text.split('\n')
  const keys = header.split('\t')
  return rows.filter(Boolean).map((line) => {
    const cells = line.split('\t')
    return Object.fromEntries(keys.map((key, index) => [key, cells[index] ?? '']))
  })
}

function round(value) {
  return Number(value.toFixed(6))
}

function wordRegion(word, width, height) {
  const x = round(word.left / width)
  const y = round(word.top / height)
  return {
    x,
    y,
    width: Math.min(round(word.width / width), round(1 - x)),
    height: Math.min(round(word.height / height), round(1 - y)),
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  }))
  return results
}

function tesseractVersion() {
  const output = execFileSync('tesseract', ['--version'], { encoding: 'utf8' })
  const match = /tesseract\s+(\S+)/u.exec(output)
  if (!match) fail('Cannot read the Tesseract version')
  return match[1]
}

async function evidence(paperId) {
  const { paperDir, documents, work } = context(paperId)
  const language = option('--lang', 'chi_sim+eng')
  const jobs = Number(option('--jobs', String(Math.max(1, Math.min(6, os.cpus().length - 2)))))
  const pages = documents.flatMap((document) =>
    Array.from({ length: document.pageCount }, (_, index) => ({ document, page: index + 1 })))
  const started = Date.now()
  const ocrPages = await mapLimit(pages, jobs, async ({ document, page }) => {
    const key = pageKey(document.documentId, page)
    const imagePath = path.join(work, 'pages', `${key}.png`)
    const tsvBase = path.join(work, 'tsv', key)
    mkdirSync(path.dirname(imagePath), { recursive: true })
    mkdirSync(path.dirname(tsvBase), { recursive: true })
    const raster = rasterPdfRegion({ pdfBytes: document.bytes, page, region: FULL_PAGE, density: EVIDENCE_DENSITY })
    writeFileSync(imagePath, raster.bytes)
    await execFileAsync('tesseract', [imagePath, tsvBase, '-l', language, '--psm', '3', 'tsv'], {
      env: { ...process.env, OMP_THREAD_LIMIT: '1' },
      maxBuffer: 64 * 1024 * 1024,
    })
    const rows = parseTsv(readFileSync(`${tsvBase}.tsv`, 'utf8'))
    const pageBox = rows.find((row) => row.level === '1')
    if (!pageBox || Number(pageBox.width) !== raster.pixelWidth || Number(pageBox.height) !== raster.pixelHeight) {
      throw new Error(`${key}: Tesseract page box does not match the ${raster.pixelWidth}x${raster.pixelHeight} raster`)
    }
    // Tesseract's own reading order (TSV row order) is the engine reading order.
    const words = rows.filter((row) => row.level === '5' && row.text.trim()).map((row, index) => ({
      number: index + 1,
      text: row.text,
      conf: Number(row.conf),
      line: `${row.block_num}:${row.par_num}:${row.line_num}`,
      box: { left: Number(row.left), top: Number(row.top), width: Number(row.width), height: Number(row.height) },
    }))
    if (words.length === 0) throw new Error(`${key}: Tesseract found no words`)
    const observations = words.map((word) => {
      if (!Number.isFinite(word.conf) || word.conf < 0 || word.conf > 100) {
        throw new Error(`${key}: word ${word.number} has confidence ${word.conf}`)
      }
      const id = `${document.documentId}:page-${page}:word-${word.number}`
      return {
        observationId: id,
        regionId: id,
        region: wordRegion(word.box, raster.pixelWidth, raster.pixelHeight),
        text: word.text,
        confidence: Number((word.conf / 100).toFixed(6)),
        alternatives: [],
      }
    })
    return {
      documentId: document.documentId,
      page,
      key,
      imagePath,
      words,
      record: {
        page,
        regions: observations.map((observation) => ({
          regionId: observation.regionId, kind: 'text', region: observation.region,
        })),
        observations,
        readingOrderEdges: observations.slice(1).map((observation, index) => ({
          before: observations[index].observationId, after: observation.observationId,
        })),
      },
    }
  })
  // Staged evidence is immutable, and figure regions are only known after proofreading,
  // so the engine output is kept here and `compile` builds and stages evidence once.
  writeJson(path.join(work, 'trace.json'), {
    schemaVersion: 'ocr-proofread-trace-v2',
    paperId,
    sourceSetDigest: nck1OcrSourceSetDigest(documents),
    engine: { name: 'tesseract', version: `${tesseractVersion()} -l ${language} --psm 3 @${EVIDENCE_DENSITY}dpi` },
    confidenceThreshold: 0.5,
    pages: ocrPages.map(({ documentId, page, key, imagePath, words, record }) =>
      ({ documentId, page, key, imagePath, words, record })),
  })
  const questionDocuments = new Set(documents.filter((document) => ['question_source', 'question_and_answers'].includes(document.role))
    .map((document) => document.documentId))
  const repairs = await planHeadingRepairs(ocrPages.filter((page) => questionDocuments.has(page.documentId))
    .map((page) => ({ key: page.key, imagePath: page.imagePath, lines: draftLines(page.words) })))
  writeJson(path.join(work, HEADING_REPAIRS_FILE), { schemaVersion: 'ocr-heading-repairs-v1', paperId, repairs })
  for (const page of ocrPages) writeWorksheet(work, page, { repairs: repairs[page.key] })
  console.log(JSON.stringify({
    ok: true,
    paperId,
    stagedEvidence: existsSync(path.join(paperDir, 'materialization', NCK1_OCR_EVIDENCE_FILE_NAME)),
    pages: ocrPages.map((page) => ({ page: page.key, words: page.words.length })),
    headingRepairs: Object.values(repairs).reduce((sum, byLine) => sum + Object.keys(byLine).length, 0),
    worksheets: path.join(work, 'worksheets'),
    drafts: path.join(work, 'drafts'),
    seconds: Math.round((Date.now() - started) / 1000),
    next: 'Proofread every page draft against its image, then run: node scripts/import-pipeline/ocr-proofread.mjs compile ' + paperId,
  }, null, 2))
}

function pageLines(words) {
  const lines = []
  for (const word of words) {
    if (lines.at(-1)?.key !== word.line) lines.push({ key: word.line, words: [] })
    lines.at(-1).words.push(word)
  }
  return lines.map((line, index) => ({ ...line, id: `L${pad(index + 1)}` }))
}

function watermarkWords(line) {
  let text = ''
  const owner = []
  for (const word of line.words) {
    if (text) {
      text += ' '
      owner.push(null)
    }
    for (const _ of word.text) owner.push(word.number)
    text += word.text
  }
  const found = new Set()
  for (const match of text.matchAll(WATERMARK)) {
    for (let index = match.index; index < match.index + match[0].length; index += 1) {
      if (owner[index]) found.add(owner[index])
    }
  }
  return [...found]
}

// The draft reading of each line (watermark words dropped) with the box of the kept words.
function draftLines(words) {
  return pageLines(words).map((line) => {
    const marks = watermarkWords(line)
    const kept = line.words.filter((word) => !marks.includes(word.number))
    const boxes = (kept.length ? kept : line.words).map((word) => word.box)
    return {
      id: line.id,
      text: joinTokens(kept.map((word) => word.text)),
      box: {
        left: Math.min(...boxes.map((box) => box.left)),
        top: Math.min(...boxes.map((box) => box.top)),
        right: Math.max(...boxes.map((box) => box.left + box.width)),
        bottom: Math.max(...boxes.map((box) => box.top + box.height)),
      },
    }
  })
}

function ranges(numbers) {
  const sorted = [...numbers].sort((left, right) => left - right)
  const out = []
  for (const number of sorted) {
    const last = out.at(-1)
    if (last && number === last[1] + 1) last[1] = number
    else out.push([number, number])
  }
  return out.map(([from, to]) => (from === to ? `w${from}` : `w${from}-w${to}`))
}

function writeWorksheet(work, { documentId, page, key, imagePath, words }, { force = false, repairs = {} } = {}) {
  const lines = pageLines(words)
  const furniture = []
  const rows = lines.map((line, index) => {
    const marks = watermarkWords(line)
    const lineText = joinTokens(line.words.map((word) => word.text))
    const isFooter = (index >= lines.length - 2 && FOOTER.test(lineText))
      || (index === lines.length - 1 && /页/u.test(lineText) && line.words.length <= 12)
    if (isFooter) furniture.push(line.id)
    else furniture.push(...ranges(marks))
    const first = line.words[0].number
    const last = line.words.at(-1).number
    const lowest = Math.min(...line.words.map((word) => word.conf))
    const repair = repairs[line.id]
    const hint = isFooter ? '  ⟪页脚候选⟫' : [
      ...(marks.length ? [`⟪水印候选 ${ranges(marks).join(',')}⟫`] : []),
      ...(repair ? [`⟪粗体标题乱码，草稿已按卷面结构重建为「${repair.text}」，请对图核对${
        [...(repair.notes || []), ...(repair.uncertain ? [`存疑：${repair.uncertain}`] : [])].map((note) => `；${note}`).join('')}⟫`] : []),
    ].map((text) => `  ${text}`).join('')
    return `${line.id} [w${first}-w${last}] (min conf ${Math.round(lowest)}) ${joinTokens(line.words.map((word) => word.text))}${hint}`
  })
  const tokens = lines.map((line) => `${line.id}: ${line.words.map((word) => `${word.number}:${word.text}`).join(' ')}`)
  mkdirSync(path.join(work, 'worksheets'), { recursive: true })
  writeFileSync(path.join(work, 'worksheets', `${key}.md`), [
    `# OCR 校对工作单 ${documentId} 第 ${page} 页`,
    '',
    `页面图片：${imagePath}`,
    `待编辑草稿：${path.join(work, 'drafts', `${key}.json`)}`,
    `规则：${path.join(import.meta.dirname, 'ocr-proofread-rules.md')}`,
    '',
    '## 识别行（行号 [词号范围] 最低置信度 文本）',
    '',
    ...rows,
    '',
    '## 逐词编号（仅在需要拆行或标记行内水印时使用）',
    '',
    ...tokens,
    '',
  ].join('\n'))
  const draftPath = path.join(work, 'drafts', `${key}.json`)
  if (force || !existsSync(draftPath)) {
    writeJson(draftPath, {
      documentId,
      page,
      image: imagePath,
      items: lines.filter((line) => !furniture.includes(line.id)).map((line) => ({
        lines: line.id,
        text: repairs[line.id]?.text
          ?? joinTokens(line.words.filter((word) => !watermarkWords(line).includes(word.number)).map((word) => word.text)),
        ...(repairs[line.id]?.uncertain ? { uncertain: repairs[line.id].uncertain } : {}),
      })).filter((item) => item.text),
      furniture,
    })
  }
}

function expand(reference, lines, label) {
  const out = []
  for (const part of String(reference).split(',').map((value) => value.trim()).filter(Boolean)) {
    const lineRange = /^L(\d+)(?:-L?(\d+))?$/u.exec(part)
    const wordRange = /^w(\d+)(?:-w?(\d+))?$/u.exec(part)
    if (lineRange) {
      const from = Number(lineRange[1])
      const to = Number(lineRange[2] || lineRange[1])
      for (let index = from; index <= to; index += 1) {
        const line = lines[index - 1]
        if (!line) fail(`${label}: line L${pad(index)} does not exist`)
        out.push(...line.words.map((word) => word.number))
      }
    } else if (wordRange) {
      const from = Number(wordRange[1])
      const to = Number(wordRange[2] || wordRange[1])
      for (let index = from; index <= to; index += 1) out.push(index)
    } else fail(`${label}: cannot read reference "${part}"`)
  }
  return out
}

const TRANSCRIPT_MARKER = /^\(?Text\s*\d{1,2}\)?\s*[:：.．]?(?:\s|$)/iu
const TRANSCRIPT_END = /^(?:第[一二三四五六]部分|参考|写作|阅读|语言|[一二三四五六]、)/u
const SPEAKER_LABEL = /^\(?[A-Z][A-Za-z]{0,15}(?:\.?\s[A-Z][A-Za-z]{0,15})?\)?\s*[:：]/u

function lineBox(words) {
  return {
    left: Math.min(...words.map((word) => word.box.left)),
    right: Math.max(...words.map((word) => word.box.left + word.box.width)),
    height: Math.max(...words.map((word) => word.box.height)),
  }
}

// The physical first and last printed lines an item covers, by top-to-bottom word position.
function itemEdges(item, lines, label) {
  const numbers = new Set([...(item.lines ? expand(item.lines, lines, label) : []),
    ...(item.words ? expand(item.words, lines, label) : [])])
  const covered = lines.map((line) => line.words.filter((word) => numbers.has(word.number)))
    .filter((words) => words.length)
    .sort((left, right) => Math.min(...left.map((word) => word.box.top)) - Math.min(...right.map((word) => word.box.top)))
  return covered.length ? { first: covered[0], last: covered.at(-1) } : null
}

// Answer documents are proofread one printed line per item, but a speaker turn that wraps
// onto the next printed line is one paragraph; joining keeps the rendered transcript from
// breaking where the source page happened to wrap. A join needs typographic proof: the next
// line's first word would not have fit after the previous line within the same column.
function joinTranscriptTurns(items, lines, state, label) {
  const rights = lines.filter((line) => line.words.length >= 4).map((line) => lineBox(line.words))
  const out = []
  let joins = 0
  let previousSpeech = false
  for (const [index, item] of items.entries()) {
    const text = typeof item.text === 'string' ? item.text.trim() : ''
    if (TRANSCRIPT_MARKER.test(text)) state.inTranscript = true
    else if (TRANSCRIPT_END.test(text)) state.inTranscript = false
    const speech = state.inTranscript && text && text === item.text && !TRANSCRIPT_MARKER.test(text) && !CJK.test(text)
      && !item.figure && !item.emphasis
    const previous = out.at(-1)
    if (speech && previousSpeech && !SPEAKER_LABEL.test(text)) {
      const before = itemEdges(previous, lines, `${label} item ${index}`)
      const after = itemEdges(item, lines, `${label} item ${index + 1}`)
      if (before && after) {
        const last = lineBox(before.last)
        const firstWord = [...after.first].sort((left, right) => left.box.left - right.box.left)[0]
        const column = rights.filter((box) => box.right > last.left && box.left < last.right
          && box.left >= last.left - last.height * 3).map((box) => box.right).sort((left, right) => left - right)
        const columnRight = column.length ? column[Math.floor((column.length - 1) * 0.9)] : last.right
        if (last.right + last.height * 0.3 + firstWord.box.width > columnRight) {
          const glue = /[A-Za-z][-‐]$/u.test(previous.text) ? '' : ' '
          out[out.length - 1] = {
            ...previous,
            text: `${previous.text}${glue}${text}`,
            ...(previous.lines || item.lines ? { lines: [previous.lines, item.lines].filter(Boolean).join(',') } : {}),
            ...(previous.words || item.words ? { words: [previous.words, item.words].filter(Boolean).join(',') } : {}),
            ...(previous.uncertain || item.uncertain
              ? { uncertain: [previous.uncertain, item.uncertain].filter(Boolean).join('；') } : {}),
            ...(previous.reason || item.reason
              ? { reason: [previous.reason, item.reason].filter(Boolean).join('；') } : {}),
          }
          joins += 1
          continue
        }
      }
    }
    out.push(item)
    previousSpeech = speech
  }
  return { items: out, joins }
}

function emphasisRanges(item, label) {
  if (!item.emphasis) return undefined
  const result = item.emphasis.map((entry) => {
    const marks = [...new Set(entry.marks || [])].sort()
    if (!['["bold"]', '["underline"]', '["bold","underline"]'].includes(JSON.stringify(marks))) {
      fail(`${label}: emphasis marks must be bold and/or underline`)
    }
    let start = -1
    for (let count = 0; count < (entry.occurrence || 1); count += 1) {
      start = item.text.indexOf(entry.text, start + 1)
      if (start === -1) fail(`${label}: emphasis text "${entry.text}" is not in the item text`)
    }
    return { start, end: start + entry.text.length, marks }
  }).sort((left, right) => left.start - right.start)
  result.forEach((range, index) => {
    if (index && range.start < result[index - 1].end) fail(`${label}: emphasis ranges overlap`)
  })
  return result
}

function changeReason(ocrTokens, text) {
  const joined = joinTokens(ocrTokens)
  if (joined === text) return '逐词识别结果按原页顺序拼合，文字未改'
  let start = 0
  while (start < joined.length && joined[start] === text[start]) start += 1
  let tail = 0
  while (tail < joined.length - start && tail < text.length - start
    && joined[joined.length - 1 - tail] === text[text.length - 1 - tail]) tail += 1
  const clip = (value) => (value.length > 40 ? `${value.slice(0, 40)}…` : value)
  const before = clip(joined.slice(start, joined.length - tail)) || '（无）'
  const after = clip(text.slice(start, text.length - tail)) || '（无）'
  return `按原页校正识别：「${before}」改为「${after}」`
}

function pngSize(file) {
  const bytes = readFileSync(file)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

// A figure is a run of consecutive draft items marked `figure`. Its region defaults to the
// non-white extent of the band between the neighbouring items; `figureRegion` (page-image
// pixels) overrides it. The confirmed text stays bound to its words; the crop replaces it.
function figureRegion(tracePage, items, start, end, label) {
  const { width, height } = pngSize(tracePage.imagePath)
  const explicit = items[start].figureRegion
  let box
  if (explicit) {
    box = { left: explicit.x, top: explicit.y, right: explicit.x + explicit.width, bottom: explicit.y + explicit.height }
  } else {
    const wordBoxes = (from, to) => items.slice(from, to).flatMap((item) => item.numbers)
      .map((number) => tracePage.words[number - 1].box)
    const before = wordBoxes(Math.max(0, start - 1), start)
    const after = wordBoxes(end, end + 1)
    const top = before.length ? Math.max(...before.map((b) => b.top + b.height)) + 2 : 0
    const bottom = after.length ? Math.min(...after.map((b) => b.top)) - 2 : height
    if (bottom - top < 8) fail(`${label}: no vertical room for the figure between its neighbours`)
    // Ink profile of the band; scan edges (outer 2%) and isolated specks are ignored.
    const bandHeight = bottom - top
    const gray = execFileSync('magick', [
      tracePage.imagePath, '-crop', `${width}x${bandHeight}+0+${top}`, '+repage',
      '-colorspace', 'gray', '-depth', '8', 'gray:-',
    ], { maxBuffer: 64 * 1024 * 1024 })
    const columns = new Array(width).fill(0)
    const rows = new Array(bandHeight).fill(0)
    const margin = Math.round(width * 0.02)
    for (let y = 0; y < bandHeight; y += 1) {
      for (let x = margin; x < width - margin; x += 1) {
        if (gray[y * width + x] < 160) {
          columns[x] += 1
          rows[y] += 1
        }
      }
    }
    const first = (values) => values.findIndex((count) => count >= 3)
    const last = (values) => values.length - 1 - [...values].reverse().findIndex((count) => count >= 3)
    if (first(columns) === -1 || first(rows) === -1) fail(`${label}: no figure ink between its neighbours`)
    box = {
      left: first(columns) - 3,
      top: top + first(rows) - 3,
      right: last(columns) + 4,
      bottom: top + last(rows) + 4,
    }
  }
  // The resolver requires every figure word inside the region, and Tesseract boxes can
  // overhang the visible ink.
  const words = items.slice(start, end).flatMap((item) => item.numbers).map((number) => tracePage.words[number - 1].box)
  const left = Math.max(0, Math.min(box.left, ...words.map((b) => b.left)))
  const top = Math.max(0, Math.min(box.top, ...words.map((b) => b.top)))
  const right = Math.min(width, Math.max(box.right, ...words.map((b) => b.left + b.width + 1)))
  const bottom = Math.min(height, Math.max(box.bottom, ...words.map((b) => b.top + b.height + 1)))
  return {
    pixels: { x: left, y: top, width: right - left, height: bottom - top },
    region: {
      x: round(left / width),
      y: round(top / height),
      width: Math.min(round((right - left) / width), round(1 - left / width)),
      height: Math.min(round((bottom - top) / height), round(1 - top / height)),
    },
  }
}

function buildEvidence(paperId, documents, trace, figures) {
  return buildNck1OcrSourceEvidence({
    paperId,
    documents,
    engine: trace.engine,
    confidenceThreshold: trace.confidenceThreshold,
    engineDocuments: documents.map((document) => ({
      documentId: document.documentId,
      pages: trace.pages.filter((page) => page.documentId === document.documentId).map((page) => ({
        ...page.record,
        regions: [
          ...page.record.regions,
          ...figures.filter((figure) => figure.key === page.key)
            .map((figure) => ({ regionId: figure.regionId, kind: 'visual', region: figure.region })),
        ],
      })),
    })),
  })
}

function compile(paperId) {
  const { paperDir, documents, work } = context(paperId)
  const trace = readJson(path.join(work, 'trace.json'), 'OCR trace')
  if (trace.schemaVersion !== 'ocr-proofread-trace-v2') fail('OCR trace predates staged-at-compile evidence; rerun `evidence`')
  const confirmation = {
    schemaVersion: NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V2,
    paperId,
    sourceSetDigest: trace.sourceSetDigest,
    evidenceDigest: null,
    confirmed: true,
    documents: [],
  }
  const figures = []
  const correctionNotes = []
  const problems = []
  const only = option('--pages')?.split(',').map((value) => value.trim())
  const flagsDir = path.join(work, 'source-flags')
  const noFigures = existsSync(flagsDir) ? readdirSync(flagsDir).filter((name) => name.endsWith('.json'))
    .flatMap((name) => readJson(path.join(flagsDir, name), 'Source flags').noFigures || []) : []
  const figureHints = missingFigureHints({
    only,
    noFigures,
    pages: trace.pages.map((page) => {
      const file = path.join(work, 'drafts', `${page.key}.json`)
      return { ...page, role: documents.find((document) => document.documentId === page.documentId)?.role,
        draft: existsSync(file) ? readJson(file, `Page draft ${page.key}`) : null }
    }),
  })
  const missingFigures = figureHints.filter((hint) => hint.missing)
  if (missingFigures.length) fail(missingFigures.map(missingFigureMessage).join('\n'))
  let corrected = 0
  let transcriptJoins = 0
  for (const document of documents) {
    const pages = []
    let itemNumber = 0
    const answerBearing = ['official_answers', 'question_and_answers'].includes(document.role)
    const transcriptState = { inTranscript: false }
    for (const tracePage of trace.pages.filter((page) => page.documentId === document.documentId)) {
      const label = tracePage.key
      if (only && !only.includes(label)) continue
      const draft = readJson(path.join(work, 'drafts', `${label}.json`), `Page draft ${label}`)
      if (draft.documentId !== document.documentId || draft.page !== tracePage.page) fail(`${label}: draft identity mismatch`)
      const lines = pageLines(tracePage.words)
      const byNumber = new Map(tracePage.words.map((word) => [word.number, word]))
      const claimed = new Map()
      const claim = (number, owner) => {
        if (!byNumber.has(number)) problems.push(`${label}: w${number} does not exist`)
        else if (claimed.has(number)) problems.push(`${label}: w${number} claimed by ${claimed.get(number)} and ${owner}`)
        else claimed.set(number, owner)
      }
      const furniture = new Set(expand((draft.furniture || []).join(','), lines, label))
      furniture.forEach((number) => claim(number, 'furniture'))
      const orderedItems = []
      const resolvedItems = []
      let draftItems = draft.items || []
      if (answerBearing) {
        const joined = joinTranscriptTurns(draftItems, lines, transcriptState, label)
        draftItems = joined.items
        transcriptJoins += joined.joins
      }
      for (const [index, item] of draftItems.entries()) {
        const itemLabel = `${label} item ${index + 1}`
        if (typeof item.text !== 'string' || !item.text.trim()) fail(`${itemLabel}: text is required`)
        if (item.text !== item.text.trim()) fail(`${itemLabel}: text has leading or trailing whitespace`)
        const fromLines = item.lines ? expand(item.lines, lines, itemLabel).filter((number) => !furniture.has(number)) : []
        const numbers = [...new Set([...fromLines, ...(item.words ? expand(item.words, lines, itemLabel) : [])])]
          .sort((left, right) => left - right)
        if (numbers.length === 0) fail(`${itemLabel}: no OCR words are assigned`)
        numbers.forEach((number) => claim(number, itemLabel))
        itemNumber += 1
        const itemId = `${document.documentId}:item-${itemNumber}`
        const observationIds = numbers.map((number) => `${document.documentId}:page-${tracePage.page}:word-${number}`)
        // A figure crop carries its own typography; flattened emphasis would be rejected.
        const sourceEmphasis = item.figure ? undefined : emphasisRanges(item, itemLabel)
        orderedItems.push({ itemId, observationIds, text: item.text, ...(sourceEmphasis ? { sourceEmphasis } : {}) })
        resolvedItems.push({ ...item, itemId, numbers })
        const tokens = numbers.map((number) => byNumber.get(number).text)
        if (tokens.join('\n') !== item.text) {
          const reason = item.uncertain || item.reason || changeReason(tokens, item.text)
          if (!item.uncertain && joinTokens(tokens) !== item.text) corrected += 1
          correctionNotes.push({ itemId, kind: item.uncertain ? 'uncertain' : 'ocr_repair', sourceText: item.text, reason })
        }
      }
      for (const word of tracePage.words) {
        if (!claimed.has(word.number)) problems.push(`${label}: w${word.number} "${word.text}" is unclaimed`)
      }
      const visualClassifications = []
      for (let start = 0; start < resolvedItems.length; start += 1) {
        const name = resolvedItems[start].figure
        if (!name || resolvedItems[start - 1]?.figure === name) continue
        let end = start + 1
        while (resolvedItems[end]?.figure === name) end += 1
        if (start === 0) fail(`${label}: figure "${name}" needs a preceding item to anchor it`)
        const figureLabel = `${label} figure ${name}`
        const regionId = `${document.documentId}:page-${tracePage.page}:figure-${figures.length + 1}`
        figures.push({ key: label, regionId, ...figureRegion(tracePage, resolvedItems, start, end, figureLabel) })
        visualClassifications.push({
          regionId,
          classification: 'content_media',
          itemIds: resolvedItems.slice(start, end).map((item) => item.itemId),
          afterItemId: resolvedItems[start - 1].itemId,
        })
      }
      pages.push({
        page: tracePage.page,
        orderedItems,
        furnitureObservationIds: [...furniture].sort((left, right) => left - right)
          .map((number) => `${document.documentId}:page-${tracePage.page}:word-${number}`),
        visualClassifications,
      })
    }
    confirmation.documents.push({ documentId: document.documentId, pages })
  }
  if (problems.length) fail(`Page drafts do not close every OCR word:\n${problems.slice(0, 60).join('\n')}`)
  if (only) {
    console.log(JSON.stringify({
      ok: true,
      checkedPages: only,
      items: confirmation.documents.reduce((count, document) =>
        count + document.pages.reduce((sum, page) => sum + page.orderedItems.length, 0), 0),
      textCorrections: corrected,
      transcriptJoins,
      uncertain: correctionNotes.filter((note) => note.kind === 'uncertain').map((note) => note.itemId),
      figures: figures.map(({ key, pixels }) => ({ page: key, pixels })),
    }, null, 2))
    return
  }
  if (figures.length) confirmation.schemaVersion = NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3
  const evidence = buildEvidence(paperId, documents, trace, figures)
  confirmation.evidenceDigest = evidence.evidenceDigest
  const resolved = resolveConfirmedNck1OcrEvidence({ paperId, documents, evidence, confirmation })
  if (resolved.issues.length) {
    fail(`Confirmation rejected locally:\n${resolved.issues.slice(0, 20).map((item) => `${item.code} ${item.path}: ${item.message}`).join('\n')}`)
  }
  const evidencePath = path.join(work, NCK1_OCR_EVIDENCE_FILE_NAME)
  writeJson(evidencePath, evidence)
  const staged = spawnSync(process.execPath, [
    path.join(import.meta.dirname, 'universal-nck1.mjs'), 'stage-ocr', paperId, evidencePath,
  ], { cwd: root, encoding: 'utf8' })
  if (staged.status !== 0) {
    fail(`stage-ocr refused the compiled evidence (a different evidence file is already staged?):\n${staged.stderr || staged.stdout}`)
  }
  const output = path.join(work, 'proofread-input.json')
  writeJson(output, { confirmation, correctionNotes })
  for (const figure of figures) {
    const { x, y, width, height } = figure.pixels
    execFileSync('magick', [trace.pages.find((page) => page.key === figure.key).imagePath,
      '-crop', `${width}x${height}+${x}+${y}`, '+repage', path.join(work, `${figure.key}-figure.png`)])
  }
  console.log(JSON.stringify({
    ok: true,
    paperId,
    evidenceDigest: evidence.evidenceDigest,
    staged: JSON.parse(staged.stdout).state,
    figures: figures.map(({ key, pixels }) => ({ page: key, pixels, preview: path.join(work, `${key}-figure.png`) })),
    output,
    items: confirmation.documents.reduce((count, document) =>
      count + document.pages.reduce((sum, page) => sum + page.orderedItems.length, 0), 0),
    notes: correctionNotes.length,
    textCorrections: corrected,
    transcriptJoins,
    uncertain: correctionNotes.filter((note) => note.kind === 'uncertain').length,
    next: [
      `node scripts/import-pipeline/review.mjs push-ocr ${paperId}`,
      `node scripts/import-pipeline/review.mjs proofread-ocr ${paperId} --revision <revisionId> --input ${output}`,
      `node scripts/import-pipeline/review.mjs pull-ocr-confirmation ${paperId} --revision <revisionId>`,
    ],
  }, null, 2))
}

function walkStrings(value, pointer, out) {
  if (typeof value === 'string') out.push({ pointer, value })
  else if (Array.isArray(value)) value.forEach((entry, index) => walkStrings(entry, `${pointer}/${index}`, out))
  else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      walkStrings(entry, `${pointer}/${key.replace(/~/gu, '~0').replace(/\//gu, '~1')}`, out)
    }
  }
  return out
}

function valueAt(rootValue, pointer) {
  return pointer.split('/').slice(1).reduce((value, raw) =>
    value?.[raw.replace(/~1/gu, '/').replace(/~0/gu, '~')], rootValue)
}

function reportEntries(paperId) {
  const { paperDir, work } = context(paperId)
  const receipt = readJson(path.join(paperDir, 'signals', 'agent-proofreading-receipt.json'), 'Agent OCR receipt')
  const materialization = readJson(
    path.join(paperDir, 'materialization', 'nck1-source-materialization-v1.json'), 'Materialization')
  const strings = walkStrings(materialization, '', [])
  const entries = []
  const skipped = []
  for (const note of receipt.correctionReport.entries) {
    if (note.kind !== 'ocr_repair' || joinTokens(note.ocrText.split('\n')) === note.correctedText) continue
    const stem = /^(\d+)\.\s(.+)$/su.exec(note.correctedText)
    const candidates = strings.filter(({ pointer, value }) => value === note.correctedText
      || (stem && value === stem[2] && /\/questions\/\d+\/stem$/u.test(pointer)))
    // Text runs carry no locator of their own; the nearest ancestor with `source` owns the page.
    const ownerSource = (pointer) => {
      const parts = pointer.split('/')
      for (let end = parts.length - 1; end > 0; end -= 1) {
        const source = valueAt(materialization, parts.slice(0, end).join('/'))?.source
        if (source?.documentId) return source
      }
      return null
    }
    const samePage = candidates.filter(({ pointer }) => {
      const source = ownerSource(pointer)
      return source?.documentId === note.documentId && source?.page === note.page
    })
    // Writing prompts and continuation text are mirrored into writingTask; the visible block is
    // the publishable target when exactly one block holds the confirmed text.
    const blocks = samePage.filter(({ pointer }) => /\/blocks\/\d+\//u.test(pointer))
    const located = samePage.length === 1 ? samePage[0]
      : blocks.length === 1 ? blocks[0]
        : (candidates.length === 1 ? candidates[0] : null)
    if (!located) {
      skipped.push({
        itemId: note.itemId,
        page: note.page,
        reason: candidates.length ? 'ambiguous' : 'split_or_restructured',
        text: note.correctedText.slice(0, 60),
      })
      continue
    }
    entries.push({
      ocrItemId: note.itemId,
      before: note.ocrText,
      after: located.value,
      sourceLocator: { documentId: note.documentId, page: note.page },
      materializationTarget: { jsonPointer: located.pointer },
      reason: note.reason,
      category: 'ocr_misrecognition',
    })
  }
  const output = path.join(work, 'ocr-correction-entries.json')
  writeJson(output, { entries })
  console.log(JSON.stringify({
    ok: true,
    paperId,
    output,
    entries: entries.length,
    skipped: skipped.length,
    skippedItems: skipped,
    next: `node scripts/import-pipeline/review.mjs finalize-ocr-correction-report ${paperId} --input ${output}`,
  }, null, 2))
}

function worksheets(paperId) {
  const { work } = context(paperId)
  const trace = readJson(path.join(work, 'trace.json'), 'OCR trace')
  const force = process.argv.includes('--reset-drafts')
  const stored = path.join(work, HEADING_REPAIRS_FILE)
  const repairs = existsSync(stored) ? readJson(stored, 'Heading repairs').repairs : {}
  for (const page of trace.pages) writeWorksheet(work, page, { force, repairs: repairs[page.key] })
  console.log(JSON.stringify({ ok: true, pages: trace.pages.length, draftsReset: force }))
}

// Zhejiang NCK1 section directions have stable wording; each slot binds exactly one confirmed
// question-source item. The first matching item wins, so the more specific pattern is listed
// first where two directions share a prefix.
const DIRECTION_PATTERNS = [
  ['listening.long-form', /^听下面\d+段对话或独白/u],
  ['listening.short-dialogue', /^听下面\d+段对话。/u],
  ['seven-choices', /多余选项/u],
  ['cloze', /选出可以填入空白处/u],
  ['grammar-fill', /括号内单词的正确形式/u],
  ['reading.a', /^阅读下列短文，从每题所给的/u],
]

function unionRegion(observations) {
  const left = Math.min(...observations.map((item) => item.region.x))
  const top = Math.min(...observations.map((item) => item.region.y))
  const right = Math.max(...observations.map((item) => item.region.x + item.region.width))
  const bottom = Math.max(...observations.map((item) => item.region.y + item.region.height))
  return { x: round(left), y: round(top), width: round(right - left), height: round(bottom - top) }
}

function presentation(paperId) {
  const { paperDir } = context(paperId)
  const directory = path.join(paperDir, 'materialization')
  const materializationPath = path.join(directory, 'nck1-source-materialization-v1.json')
  const materialization = readJson(materializationPath, 'Materialization')
  if (materialization.sourcePresentation) fail('Materialization already has sourcePresentation')
  const evidence = readJson(path.join(directory, NCK1_OCR_EVIDENCE_FILE_NAME), 'Staged OCR evidence')
  const confirmation = readJson(path.join(directory, 'nck1-ocr-source-confirmation-v1.json'), 'Pulled OCR confirmation')
  const question = confirmation.documents.find((document) => document.documentId.startsWith('question-source'))
  const evidencePages = evidence.documents.find((document) => document.documentId === question.documentId).pages
  const listening = materialization.listening?.state !== 'not_supplied'
  const found = new Map()
  for (const page of question.pages) {
    const observations = new Map(evidencePages[page.page - 1].observations.map((item) => [item.observationId, item]))
    for (const item of page.orderedItems) {
      if (/^例[：:]/u.test(item.text)) fail(`Listening example found on page ${page.page}; author sourcePresentation.listeningExample by hand`)
      const slot = DIRECTION_PATTERNS.find(([, pattern]) => pattern.test(item.text))?.[0]
      if (!slot || found.has(slot)) continue
      found.set(slot, {
        slotId: slot,
        text: item.text,
        source: {
          kind: 'page_region',
          documentId: question.documentId,
          page: page.page,
          region: unionRegion(item.observationIds.map((id) => observations.get(id))),
        },
      })
    }
  }
  const required = DIRECTION_PATTERNS.map(([slot]) => slot).filter((slot) => listening || !slot.startsWith('listening.'))
  const missing = required.filter((slot) => !found.has(slot))
  if (missing.length) fail(`No confirmed direction item matched: ${missing.join(', ')}`)
  const order = ['listening.short-dialogue', 'listening.long-form', 'reading.a', 'seven-choices', 'cloze', 'grammar-fill']
  const { issues, ...rest } = materialization
  const upgraded = {
    ...rest,
    schemaVersion: 'nck1-source-materialization-v4',
    sourcePresentation: {
      instructions: order.filter((slot) => required.includes(slot)).map((slot) => found.get(slot)),
      listeningExample: listening
        ? { state: 'not_supplied', source: { kind: 'page_region', documentId: question.documentId, page: 1, region: { ...FULL_PAGE } } }
        : null,
    },
    issues,
  }
  writeJson(materializationPath, upgraded)
  console.log(JSON.stringify({
    ok: true,
    paperId,
    schemaVersion: upgraded.schemaVersion,
    instructions: upgraded.sourcePresentation.instructions.map(({ slotId, text, source }) => ({ slotId, page: source.page, text })),
    listeningExample: upgraded.sourcePresentation.listeningExample?.state ?? null,
  }, null, 2))
}

// The OCR producer emits every figure at widthRatio 1. Restore the source size the way the DOCX
// adapter does (image width / body width), measuring the body as the extent of that page's text
// observations; full-width banners stay at 1.
function figureSizes(paperId) {
  const { paperDir } = context(paperId)
  const directory = path.join(paperDir, 'materialization')
  const materializationPath = path.join(directory, 'nck1-source-materialization-v1.json')
  const materialization = readJson(materializationPath, 'Materialization')
  const evidence = readJson(path.join(directory, NCK1_OCR_EVIDENCE_FILE_NAME), 'Staged OCR evidence')
  const changes = []
  for (const media of materialization.media || []) {
    const crop = media.extraction
    if (media.usage !== 'content' || crop?.kind !== 'pdf_crop') continue
    const page = evidence.documents.find((document) => document.documentId === crop.documentId)?.pages[crop.page - 1]
    const text = (page?.observations || []).filter((item) => String(item.text || '').trim().length > 3)
    if (text.length < 10) fail(`Too few text observations to measure the body width of ${crop.documentId} page ${crop.page}`)
    const left = Math.min(...text.map((item) => item.region.x))
    const right = Math.max(...text.map((item) => item.region.x + item.region.width))
    const widthRatio = Math.min(1, Number((crop.region.width / (right - left)).toFixed(4)))
    if (media.presentation.widthRatio === widthRatio) continue
    changes.push({ mediaId: media.mediaId, page: crop.page, from: media.presentation.widthRatio, to: widthRatio,
      cropWidth: crop.region.width, bodyWidth: Number((right - left).toFixed(4)) })
    media.presentation = { ...media.presentation, widthRatio }
  }
  if (changes.length) writeJson(materializationPath, materialization)
  console.log(JSON.stringify({ ok: true, paperId, changes }, null, 2))
}

const WRITING_SECTION = [
  ['application', /^第[一二]节\s*[:：]?\s*(应用文|书面表达)/u],
  ['continuation', /^第[一二]节\s*[:：]?\s*(读后续写|续写)/u],
]
// Some answer keys head the samples only with "第一节（满分15分）" under "第四部分 写作".
const WRITING_PART = /^第四部分\s*[:：]?\s*写作/u
const BARE_WRITING_SECTION = /^第([一二])节\s*(?:\(满分\s*\d+\s*分\))?\s*[:：]?$/u
const ENTRY_LABEL = /^(参考范文|考场作文|参考答案|范文|(?:(?:A|One)\s+)?Possible\s+Version|评分(?:原则|标准|说明|细则|要求|建议)|【[^】]+】|\[[^\]]+\])[:：]?$/iu
const SCORING_LABEL = /阅卷|评分|评卷|给分|档次/u
const ESSAY_LABEL = /范文|例文|范例|答案|考场作文|Possible\s+Version/iu
// The key's own teaching commentary (【审题重点】, 主题语境：…) is neither a source sample nor scoring.
const COMMENTARY_LINE = /^\p{Script=Han}/u
const VERSION_LABEL = /^(Possible Version|Version|范文)\s*\d+[:：]?$/iu
const SALUTATION = /^Dear\s.+,$/u
const CLOSING = /^(Yours|Best wishes|Best regards|Sincerely|Yours sincerely|Love)[^.]{0,20},$/iu

function joinLines(lines) {
  return lines.reduce((text, line) => {
    if (!text) return line
    const cjk = /[\u3000-\u9fff\uff00-\uffef]$/u.test(text) && /^[\u3000-\u9fff\uff00-\uffef]/u.test(line)
    return `${text}${cjk ? '' : ' '}${line}`
  }, '')
}

// Captures writing references from the confirmed answer-document OCR lines. Paragraphs are rebuilt
// from line geometry (first-line indent or a short previous line), never from the Materialization,
// so the sidecar stays a source capture. Doubtful joins are listed for visual review before finalize.
function references(paperId) {
  const { paperDir, work } = context(paperId)
  const directory = path.join(paperDir, 'materialization')
  const materialization = readJson(path.join(directory, 'nck1-source-materialization-v1.json'), 'Materialization')
  const evidence = readJson(path.join(directory, NCK1_OCR_EVIDENCE_FILE_NAME), 'Staged OCR evidence')
  const confirmation = readJson(path.join(directory, 'nck1-ocr-source-confirmation-v1.json'), 'Pulled OCR confirmation')
  const answerDocuments = materialization.documents.filter((document) =>
    ['official_answers', 'question_and_answers'].includes(document.role))
  if (answerDocuments.length !== 1) fail('Expected exactly one answer-bearing document')
  const [answerDocument] = answerDocuments
  const documentSha256 = answerDocument.sha256
  const evidencePages = evidence.documents.find((document) => document.documentId === answerDocument.documentId).pages
  const pages = confirmation.documents.find((document) => document.documentId === answerDocument.documentId).pages
  const lines = []
  for (const page of pages) {
    const observations = new Map(evidencePages[page.page - 1].observations.map((item) => [item.observationId, item]))
    for (const item of page.orderedItems) {
      const boxes = item.observationIds.map((id) => observations.get(id))
      lines.push({ itemId: item.itemId, page: page.page, text: item.text, boxes,
        left: Math.min(...boxes.map((box) => box.region.x)),
        right: Math.max(...boxes.map((box) => box.region.x + box.region.width)) })
    }
  }
  const sections = new Map()
  let current = null
  let inWriting = false
  for (const line of lines) {
    const bare = inWriting && line.text.normalize('NFKC').match(BARE_WRITING_SECTION)
    const started = bare ? [bare[1] === '一' ? 'application' : 'continuation']
      : WRITING_SECTION.find(([, pattern]) => pattern.test(line.text))
    if (started) { current = { taskType: started[0], lines: [] }; sections.set(started[0], current); continue }
    if (/^(第[一二三四五]部分|听力)/u.test(line.text) || /^Text\s*\d+$/u.test(line.text)) {
      current = null
      inWriting = WRITING_PART.test(line.text)
    } else if (current) current.lines.push(line)
  }
  const margins = new Map()
  for (const page of new Set(lines.map((line) => line.page))) {
    const pageLines = lines.filter((line) => line.page === page && line.boxes.length > 3)
    margins.set(page, { left: Math.min(...pageLines.map((line) => line.left)), right: Math.max(...pageLines.map((line) => line.right)) })
  }
  const role = (text) => VERSION_LABEL.test(text) ? 'label' : SALUTATION.test(text) ? 'salutation'
    : CLOSING.test(text) ? 'closing' : null
  const review = []
  const groups = materialization.groups.filter((group) => group.writingTask).map((group) => {
    const taskType = group.writingTask.taskType
    const section = sections.get(taskType)
    if (!section) fail(`No answer-document section found for ${taskType}`)
    const short = taskType === 'application' ? 'app' : 'cont'
    const entries = { essays: [], scoring: [] }
    let entry = null
    let paragraph = null
    let previous = null
    let skipping = false
    const flush = () => { if (paragraph) { entry.paragraphs.push(paragraph); paragraph = null } }
    const skip = (line, reason) => {
      flush()
      entry = null
      previous = null
      skipping = true
      review.push({ itemId: line.itemId, issue: `${reason}; skipped until the next label or English line` })
    }
    for (const line of section.lines) {
      if (ENTRY_LABEL.test(line.text)) {
        skipping = false
        const kind = SCORING_LABEL.test(line.text) ? 'scoring' : ESSAY_LABEL.test(line.text) ? 'essays' : null
        if (!kind) { skip(line, `commentary "${line.text}" is neither a source sample nor scoring`); continue }
        flush()
        const index = entries[kind].length + 1
        entry = { kind, referenceId: `source-${kind === 'scoring' ? 'score' : 'ref'}-${short}-${index}`, authority: 'source_reference',
          sourceLabel: line.text, labelSource: { documentSha256, locator: { kind: 'page_region', documentId: answerDocument.documentId,
            page: line.page, region: unionRegion(line.boxes) } }, paragraphs: [] }
        entries[kind].push(entry)
        previous = null
        continue
      }
      if (entry?.kind !== 'scoring' && COMMENTARY_LINE.test(line.text)) {
        if (!skipping) skip(line, `Chinese commentary "${line.text.slice(0, 12)}…" follows the sample`)
        continue
      }
      if (skipping && !/^[A-Za-z“"‘']/u.test(line.text)) continue
      skipping = false
      if (!entry) {
        entry = { kind: 'essays', referenceId: `source-ref-${short}-${entries.essays.length + 1}`, authority: 'source_reference',
          sourceLabel: null, labelSource: null, paragraphs: [] }
        entries.essays.push(entry)
      }
      const margin = margins.get(line.page)
      const special = role(line.text)
      const afterClosing = previous?.role === 'closing'
      const indented = line.left > margin.left + 0.015
      const previousShort = previous && previous.right < margin.right - 0.06
      const pageTurn = previous && previous.page !== line.page
      // A lowercase start continues the sentence even when the previous line wrapped early.
      const continues = previous?.role === 'body' && !pageTurn && /^[a-z]/u.test(line.text)
      const starts = !paragraph || special || afterClosing || (!continues && (previous.role !== 'body' || indented
        || previousShort || pageTurn || /^Paragraph\s*\d+[:：]/u.test(line.text)))
      if (pageTurn && !special && !afterClosing && !indented && !previousShort) {
        review.push({ itemId: line.itemId, issue: 'paragraph continues across a page turn; split into two located paragraphs' })
      }
      if (starts) {
        flush()
        paragraph = { role: special || (afterClosing ? 'signature' : 'body'), lines: [] }
      }
      paragraph.lines.push(line)
      if (/[-‐]$/u.test(line.text)) review.push({ itemId: line.itemId, issue: 'line ends with a hyphen; joined with a space' })
      previous = { role: paragraph.role, right: line.right, page: line.page }
    }
    flush()
    const section_ = (kind) => {
      const list = entries[kind].filter((item) => item.paragraphs.length)
      for (const empty of entries[kind].filter((item) => !item.paragraphs.length)) {
        review.push({ referenceId: empty.referenceId, issue: `label "${empty.sourceLabel}" has no following text; dropped` })
      }
      if (!list.length) {
        return { state: 'not_supplied', entries: [], evidence: pages.map((page) => ({ documentSha256,
          locator: { kind: 'page_region', documentId: answerDocument.documentId, page: page.page, region: { ...FULL_PAGE } } })) }
      }
      return { state: 'captured', evidence: [], entries: list.map(({ kind: _kind, paragraphs, ...rest }) => ({
        ...rest,
        paragraphs: paragraphs.map((item, index) => ({
          paragraphId: `${rest.referenceId}-p${index + 1}`,
          role: item.role,
          text: joinLines(item.lines.map((line) => line.text)),
          source: { documentSha256, locator: { kind: 'page_region', documentId: answerDocument.documentId,
            page: item.lines[0].page, region: unionRegion(item.lines.flatMap((line) => line.boxes)) } },
        })),
      })) }
    }
    return { groupId: group.groupId, taskType, essays: section_('essays'), scoring: section_('scoring') }
  })
  const output = path.join(work, 'source-references-draft.json')
  writeJson(output, { schemaVersion: 'source-references-v1', paperId, sourceDigest: null, candidateDigest: null,
    materializationDigest: null, groups })
  console.log(JSON.stringify({
    ok: true,
    output,
    outline: groups.map((group) => ({ taskType: group.taskType, scoring: group.scoring.state,
      essays: group.essays.entries.map((item) => `${item.sourceLabel} :: ${item.paragraphs.map((p) =>
        `${p.role}@p${p.source.locator.page}[${p.text.slice(0, 18)}…${p.text.slice(-12)}]`).join(' | ')}`) })),
    review,
    next: 'fill the three digests from answer-products prepare, then answer-products finalize',
  }, null, 2))
}

const [command, paperId] = process.argv.slice(2)
try {
  if (command === 'evidence') await evidence(paperId)
  else if (command === 'worksheets') worksheets(paperId)
  else if (command === 'compile') compile(paperId)
  else if (command === 'report-entries') reportEntries(paperId)
  else if (command === 'presentation') presentation(paperId)
  else if (command === 'references') references(paperId)
  else if (command === 'figure-sizes') figureSizes(paperId)
  else fail('Usage: ocr-proofread.mjs <evidence|worksheets|compile|presentation|figure-sizes|references|report-entries> <paperId> [--reset-drafts] [--work <dir>] [--lang chi_sim+eng] [--jobs N]')
} catch (error) {
  fail(error.stack || String(error))
}
