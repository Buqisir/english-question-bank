#!/usr/bin/env node
// Reusable OCR proofreading lane for scanned public-paper-v1 sources.
//
//   evidence <paperId>        raster every immutable source page at the evidence density,
//                             run Tesseract, keep word-level engine output, then write one
//                             worksheet plus one editable page draft per page.
//                             --regions <requests.json> appends real region OCR to an existing
//                             trace, preserving all original observations and page draft refs.
//   worksheets <paperId>      rebuild worksheets (and, with --reset-drafts, drafts) from the trace.
//   compile <paperId>         build and stage the evidence (with any declared figure regions),
//                             then write the evidence-bound confirmation and correctionNotes
//                             accepted by `review.mjs proofread-ocr`. `--pages a,b` only checks
//                             word closure and missing-figure hints for those pages and writes nothing.
//   presentation <paperId>    after materialize, fill missing v4 sourcePresentation directions
//                             from confirmed items; --output <path> previews without overwriting.
//   numbering <paperId>       before spelling/digests, normalize only proved Chinese numbering.
//   report-entries <paperId>  after pull-ocr-confirmation + materialize, locate the receipt's
//                             real OCR repairs in the current Materialization for
//                             `review.mjs finalize-ocr-correction-report`.
//
// The tool never edits existing OCR observations or writes Owner receipts. Region additions
// come only from retained Tesseract TSV, never request text. Page drafts are the Agent's
// page-by-page source reading; every gate stays in the existing CLI and server.
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { rasterPdfRegion } from '../../server/paper-canonical/pdfRegionRaster.mjs'
import { sourceReferenceObjectiveFigureAnchors } from '../../server/paper-import/sourceReferenceScoringScope.mjs'
import { captureSourceReferenceFigure } from '../../server/paper-import/sourceReferenceImages.mjs'
import { SOURCE_REFERENCE_REGION_TOLERANCE } from '../../server/paper-import/sourceReferences.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
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
import { writeFigureCrosscheck } from './ocr-figure-crosscheck.mjs'
import { computeLineFacts } from './ocr-line-facts.mjs'
import { matchesLineRole, firstLineRole, watermarkMatches,
  REFERENCE_MARGIN_TOLERANCE } from './ocr-line-roles.mjs'
import { prepareSourceReferenceWritingItems, sourceReferenceWritingLifecycle,
  sourceReferenceUnionRegion as unionRegion } from '../../server/paper-import/sourceReferenceWritingTask.mjs'
export { writingSectionAfterPart } from '../../server/paper-import/sourceReferenceWritingTask.mjs'
import { decideLineJoin, referenceBoundaryFromFacts } from './ocr-join-decisions.mjs'
import { compileSemanticTables } from './ocr-semantic-tables.mjs'
import { restoreOcrSourcePresentation } from './materialization-presentation.mjs'
import { normalizeMaterializationNumbering } from './materialization-numbering.mjs'
import { computeOcrNumberingProjection } from '../../shared/ocrNumberingProjection.mjs'
import { reobserveRegions } from './ocr-region-reobserve.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION } from './ocr-source-references-version.mjs'
export { OCR_SOURCE_REFERENCES_PRODUCER_VERSION } from './ocr-source-references-version.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const HEADING_REPAIRS_FILE = 'heading-repairs.json'
const execFileAsync = promisify(execFile)
// Must match RASTER_DENSITY in nck1OcrSourceEvidence.mjs so OCR reads the bound raster.
const EVIDENCE_DENSITY = 144
const FULL_PAGE = { x: 0, y: 0, width: 1, height: 1 }
const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/u

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
  return { paperId, paperDir, documents, work, paperName: manifest.provenance?.paperName }
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
  const regionRequests = option('--regions')
  if (process.argv.includes('--regions') && (!regionRequests || regionRequests.startsWith('--'))) {
    throw new Error('--regions requires a request JSON path')
  }
  if (regionRequests) {
    const trace = readJson(path.join(work, 'trace.json'), 'Existing OCR trace for region re-observation')
    if (trace.paperId !== paperId) throw new Error('OCR trace paper identity mismatch')
    const output = await reobserveRegions({ trace, documents, work,
      requests: readJson(path.resolve(regionRequests), 'Region requests') })
    writeJson(path.join(work, 'trace.json'), output)
    // Drafts are deliberately preserved: new word ranges must be assigned after source comparison.
    for (const page of output.pages.filter(page => output.regionReobservations?.some(run => run.page === page.key))) {
      writeWorksheet(work, page)
    }
    console.log(JSON.stringify({ ok: true, paperId, trace: path.join(work, 'trace.json'),
      regionReobservations: output.regionReobservations,
      next: 'Assign the new worksheet word ranges to source-checked draft items, then run compile' }, null, 2))
    return
  }
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
  for (const match of watermarkMatches(text)) {
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
    const facts = computeLineFacts({ text: lineText, words: line.words })
    const isFooter = matchesLineRole('worksheet.footer', facts, { index, lineCount: lines.length })
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

// The physical first and last printed lines an item covers, by top-to-bottom word position.
function itemEdges(item, lines, label) {
  const numbers = new Set([...(item.lines ? expand(item.lines, lines, label) : []),
    ...(item.words ? expand(item.words, lines, label) : [])])
  const covered = lines.map((line) => line.words.filter((word) => numbers.has(word.number)))
    .filter((words) => words.length)
    .sort((left, right) => Math.min(...left.map((word) => word.box.top)) - Math.min(...right.map((word) => word.box.top)))
  const physical = []
  for (const words of covered) {
    const previous = physical.at(-1)
    const combined = previous ? [...previous, ...words] : words
    // OCR can put a speaker label in a different line ID from its body.
    // Coalesce only when every word shares a vertical band on the source page.
    if (previous && Math.max(...combined.map((word) => word.box.top))
      < Math.min(...combined.map((word) => word.box.top + word.box.height))) {
      physical[physical.length - 1] = combined
    } else physical.push(words)
  }
  return physical.length ? { first: physical[0], last: physical.at(-1) } : null
}

// Answer documents are proofread one printed line per item, but a speaker turn that wraps
// onto the next printed line is one paragraph; joining keeps the rendered transcript from
// breaking where the source page happened to wrap. A join needs typographic proof: the next
// line's first word would not have fit after the previous line within the same column.
export function joinTranscriptTurns(items, lines, state, label, sourceLocation = { label }) {
  const physicalFacts = new Map()
  const factsForWords = words => {
    const key = words.map(word => word.number).join(',')
    if (!physicalFacts.has(key)) physicalFacts.set(key, computeLineFacts({ words }))
    return physicalFacts.get(key)
  }
  const rights = lines.filter((line) => line.words.length >= 4).map((line) => factsForWords(line.words).box)
  const itemGeometry = new WeakMap()
  const geometryFor = (item, label) => {
    if (!itemGeometry.has(item)) {
      const edges = itemEdges(item, lines, label)
      itemGeometry.set(item, edges && { ...edges, firstFacts: factsForWords(edges.first), lastFacts: factsForWords(edges.last) })
    }
    return itemGeometry.get(item)
  }
  const itemFacts = new WeakMap()
  const factsForItem = item => {
    if (!itemFacts.has(item)) itemFacts.set(item, computeLineFacts(item))
    return itemFacts.get(item)
  }
  const out = []
  let joins = 0
  let previousSpeech = false
  let previousNote = false
  for (const [index, sourceItem] of items.entries()) {
    // Cell identities must survive transcript processing unchanged.
    if (sourceItem.cell) {
      out.push(sourceItem)
      previousSpeech = false
      previousNote = false
      continue
    }
    // Proofreaders can restore a missing printed gloss line inside one item.
    const noteStart = matchesLineRole('transcript.note-start', factsForItem(sourceItem), state)
    const inlineDecision = decideLineJoin({
      content: 'inline-annotation', previous: null, current: factsForItem(sourceItem),
      geometry: { unit: 'text' }, roles: { noteStart, multiline: noteStart && sourceItem.text.includes('\n') },
      location: { before: null, after: { ...sourceLocation, itemIndex: index, lines: sourceItem.lines, words: sourceItem.words } },
    })
    const item = inlineDecision.resolution === 'join' ? {
      ...sourceItem, text: joinLines(sourceItem.text.split(/\n/u).map((line) => line.trim())),
      ...(sourceItem.emphasis ? { emphasis: sourceItem.emphasis.map((entry) => ({
        ...entry, text: joinLines(entry.text.split(/\n/u).map((line) => line.trim())),
      })) } : {}),
    } : sourceItem
    const facts = factsForItem(item)
    const text = facts.trimmed
    const trimmedFacts = text === facts.text ? facts : computeLineFacts({ ...item, text })
    const transition = firstLineRole('transcript-state', trimmedFacts)
    if (transition?.id === 'transcript.marker') state.inTranscript = true
    else if (transition?.id === 'transcript.end') state.inTranscript = false
    // Chinese glosses/full-width punctuation and source emphasis are part of English speech.
    const previous = out.at(-1)
    const previousFacts = previous ? factsForItem(previous) : null
    const numericContinuation = matchesLineRole('transcript.numeric-continuation', facts,
      { previousSpeech, previousFacts })
    const speech = matchesLineRole('transcript.speech', facts, { inTranscript: state.inTranscript, numericContinuation })
    const note = matchesLineRole('transcript.note', facts, { inTranscript: state.inTranscript, noteStart, previousNote })
    const noteContinuation = matchesLineRole('transcript.note-continuation', facts,
      { note, previousNote, noteStart, previousFacts })
    const turnContinuation = matchesLineRole('transcript.turn-continuation', facts, { speech, previousSpeech, noteContinuation })
    const decision = decideLineJoin({
      content: noteContinuation ? 'annotation' : 'transcript', previous: previousFacts, current: facts,
      geometry: { unit: 'pixels', rights,
        before: turnContinuation ? geometryFor(previous, `${label} item ${index}`) : null,
        after: turnContinuation ? geometryFor(item, `${label} item ${index + 1}`) : null },
      roles: { turnContinuation, noteContinuation },
      location: { before: previous ? { ...sourceLocation, lines: previous.lines, words: previous.words } : null,
        after: { ...sourceLocation, itemIndex: index, lines: item.lines, words: item.words } },
    })
    if (decision.resolution === 'join') {
      const glue = noteContinuation
        ? joinLines([previous.text, text]).slice(previous.text.length, -text.length)
        : previousFacts.endsEnglishHyphen ? '' : ' '
      const joinedText = `${previous.text}${glue}${text}`
      const offset = previous.text.length + glue.length
      const emphasis = [
        ...(emphasisRanges(previous, label) || []),
        ...(emphasisRanges(item, label) || []).map((range) =>
          ({ ...range, start: range.start + offset, end: range.end + offset })),
      ].map(({ start, end, marks }) => {
        const text = joinedText.slice(start, end)
        let occurrence = 0
        let at = -1
        do { at = joinedText.indexOf(text, at + 1); occurrence += 1 } while (at < start && at !== -1)
        return { text, marks, occurrence }
      })
      out[out.length - 1] = {
        ...previous,
        text: joinedText,
        ...(emphasis.length ? { emphasis } : {}),
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
    out.push(item)
    previousSpeech = speech
    previousNote = note
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
// An imageOnly item instead supplies an explicit region without claiming or replacing text.
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

// JSON-only production orchestration, shared by compile and corpus replay.
// Generators retain page-at-a-time processing and document-local transcript state.
export function* buildTranscriptJoinDocuments({ documents, trace, drafts, only = null }) {
  if (trace.schemaVersion !== 'ocr-proofread-trace-v2') fail('OCR trace predates staged-at-compile evidence; rerun `evidence`')
  for (const document of documents.filter((entry) => !entry.renditionOf)) {
    const answerBearing = ['official_answers', 'question_and_answers'].includes(document.role)
    function* pages() {
      const transitions = []
      let currentPage = null
      let sourceItemIndex = null
      const transcriptState = new Proxy({ inTranscript: false }, {
        set(target, key, value) {
          transitions.push({ page: currentPage, sourceItemIndex, key, assignment: transitions.length, value })
          target[key] = value
          return true
        },
      })
      for (const tracePage of trace.pages.filter((page) => page.documentId === document.documentId)) {
        const label = tracePage.key
        if (only && !only.includes(label)) continue
        currentPage = tracePage.page
        const draft = drafts[label]
        if (!draft) fail(`Page draft ${label} is missing`)
        if (draft.documentId !== document.documentId || draft.page !== tracePage.page) fail(`${label}: draft identity mismatch`)
        const lines = pageLines(tracePage.words)
        const stateBefore = transcriptState.inTranscript
        const transitionStart = transitions.length
        sourceItemIndex = null
        const sourceItems = draft.items || []
        // Observation only: iterator values and source items remain unchanged.
        const observedItems = new Proxy(sourceItems, {
          get(target, key, receiver) {
            if (key === 'entries' || key === Symbol.iterator) return function* () {
              for (let index = 0; index < target.length; index += 1) {
                sourceItemIndex = index
                yield key === 'entries' ? [index, target[index]] : target[index]
              }
            }
            return Reflect.get(target, key, receiver)
          },
        })
        let draftItems = sourceItems
        let joins = 0
        if (answerBearing) {
          const joined = joinTranscriptTurns(observedItems, lines, transcriptState, label,
            { label, documentId: document.documentId, page: tracePage.page })
          draftItems = joined.items
          joins = joined.joins
        }
        yield { tracePage, draft, lines, items: draftItems, joins, stateBefore,
          stateAfter: transcriptState.inTranscript, transitions: transitions.slice(transitionStart) }
      }
    }
    yield { document, pages: pages() }
  }
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
  const drafts = {}
  const figureHints = missingFigureHints({
    only,
    noFigures,
    pages: trace.pages.map((page) => {
      const file = path.join(work, 'drafts', `${page.key}.json`)
      drafts[page.key] = existsSync(file) ? readJson(file, `Page draft ${page.key}`) : null
      return { ...page, role: documents.find((document) => document.documentId === page.documentId)?.role,
        draft: drafts[page.key] }
    }),
  })
  const missingFigures = figureHints.filter((hint) => hint.missing)
  if (missingFigures.length) fail(missingFigures.map(missingFigureMessage).join('\n'))
  let corrected = 0
  let transcriptJoins = 0
  for (const { document, pages: transcriptPages } of buildTranscriptJoinDocuments({ documents, trace, drafts, only })) {
    const pages = []
    let itemNumber = 0
    for (const { tracePage, draft, lines, items: draftItems, joins } of transcriptPages) {
      const label = tracePage.key
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
      transcriptJoins += joins
      for (const [index, item] of draftItems.entries()) {
        const itemLabel = `${label} item ${index + 1}`
        if (item.imageOnly === true) {
          if (typeof item.figure !== 'string' || !item.figure.trim()
            || typeof item.reason !== 'string' || !item.reason.trim()
            || ['lines', 'words', 'text', 'emphasis'].some((key) => key in item)) {
            fail(`${itemLabel}: imageOnly requires figure and reason, without lines, words, text or emphasis`)
          }
          if (!resolvedItems.at(-1)?.itemId || resolvedItems.at(-1).figure) {
            fail(`${itemLabel}: imageOnly needs a preceding ordinary item to anchor it`)
          }
          if (draftItems.filter((entry) => entry.figure === item.figure).length !== 1) {
            fail(`${itemLabel}: imageOnly figure "${item.figure}" must be the only item with that figure name`)
          }
          const region = item.figureRegion
          const size = pngSize(tracePage.imagePath)
          if (!region || ![region.x, region.y, region.width, region.height].every(Number.isFinite)
            || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
            || region.x + region.width > size.width || region.y + region.height > size.height) {
            fail(`${itemLabel}: imageOnly requires a valid figureRegion within the page image`)
          }
          const overlapping = tracePage.words.filter(({ box }) =>
            box.left < region.x + region.width && box.left + box.width > region.x
            && box.top < region.y + region.height && box.top + box.height > region.y)
          if (overlapping.length) {
            fail(`${itemLabel}: imageOnly figureRegion overlaps OCR words ${overlapping.map((word) => `w${word.number}`).join(', ')}; use word-assigned figure items`)
          }
          resolvedItems.push({ ...item, numbers: [] })
          continue
        }
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
      const tables = compileSemanticTables(draft, resolvedItems, {
        documentId: document.documentId, page: tracePage.page, ...pngSize(tracePage.imagePath),
        words: tracePage.words,
      })
      figures.push(...tables.map(({ visual: _visual, ...table }) => ({ key: label, ...table })))
      const visualClassifications = tables.map(table => table.visual)
      for (let start = 0; start < resolvedItems.length; start += 1) {
        const name = resolvedItems[start].figure
        if (!name || resolvedItems[start - 1]?.figure === name) continue
        let end = start + 1
        while (resolvedItems[end]?.figure === name) end += 1
        if (start === 0 || !resolvedItems[start - 1].itemId) fail(`${label}: figure "${name}" needs a preceding item to anchor it`)
        const figureLabel = `${label} figure ${name}`
        const regionId = `${document.documentId}:page-${tracePage.page}:figure-${figures.length + 1}`
        figures.push({ key: label, regionId, ...figureRegion(tracePage, resolvedItems, start, end, figureLabel) })
        visualClassifications.push({
          regionId,
          classification: 'content_media',
          itemIds: resolvedItems.slice(start, end).filter((item) => !item.imageOnly).map((item) => item.itemId),
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
  writeFigureCrosscheck({ work, pages: trace.pages, figures })
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

export function buildOcrReportEntries(receipt, materialization) {
  const strings = walkStrings(materialization, '', [])
  const entries = []
  const skipped = []
  for (const note of receipt.correctionReport.entries) {
    if (note.kind !== 'ocr_repair' || joinTokens(note.ocrText.split('\n')) === note.correctedText) continue
    const stem = /^(\d+)\.\s(.+)$/su.exec(note.correctedText)
    const candidates = strings.filter(({ pointer, value }) => value === note.correctedText
      || (stem && value === stem[2] && /\/questions\/\d+\/stem$/u.test(pointer))
      || computeOcrNumberingProjection({}, {
        category: 'ocr_misrecognition', after: value,
        sourceLocator: { documentId: note.documentId, page: note.page },
        materializationTarget: { jsonPointer: pointer },
      }, materialization, note.correctedText))
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
  return { entries, skipped }
}

function reportEntries(paperId) {
  const { paperDir, work } = context(paperId)
  const receipt = readJson(path.join(paperDir, 'signals', 'agent-proofreading-receipt.json'), 'Agent OCR receipt')
  const materialization = readJson(
    path.join(paperDir, 'materialization', 'nck1-source-materialization-v1.json'), 'Materialization')
  const { entries, skipped } = buildOcrReportEntries(receipt, materialization)
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

function numbering(paperId) {
  const { paperDir } = context(paperId)
  const file = path.join(paperDir, 'materialization', 'nck1-source-materialization-v1.json')
  const result = normalizeMaterializationNumbering(readJson(file, 'Materialization'))
  if (result.changes.length && existsSync(path.join(paperDir, 'agent-ocr-correction-report-v2.json'))) {
    fail(`已 finalized 的 OCR 报告须正式重建：fast-import.mjs after-proofread ${paperId} --redo-from chinese-numbering`)
  }
  if (result.changes.length) writeJson(file, result.materialization)
  console.log(JSON.stringify({ ok: true, ruleVersion: result.ruleVersion, changes: result.changes }, null, 2))
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


function presentation(paperId) {
  const { paperDir } = context(paperId)
  const directory = path.join(paperDir, 'materialization')
  const materializationPath = path.join(directory, 'nck1-source-materialization-v1.json')
  const materialization = readJson(materializationPath, 'Materialization')
  const evidence = readJson(path.join(directory, NCK1_OCR_EVIDENCE_FILE_NAME), 'Staged OCR evidence')
  const confirmation = readJson(path.join(directory, 'nck1-ocr-source-confirmation-v1.json'), 'Pulled OCR confirmation')
  const upgraded = restoreOcrSourcePresentation({ materialization, evidence, confirmation })
  // Preview/recovery can write elsewhere without touching retained paper artifacts or sidecars.
  const output = path.resolve(option('--output') || materializationPath)
  if (output !== materializationPath || JSON.stringify(upgraded) !== JSON.stringify(materialization)) writeJson(output, upgraded)
  console.log(JSON.stringify({
    ok: true,
    paperId,
    output,
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

function joinLines(lines, { reference = false } = {}) {
  // Text glue only. Semantic boundaries have already passed decideLineJoin;
  // reference/annotation CJK spacing intentionally differs from speech hyphens.
  return lines.reduce((text, line) => {
    if (!text) return line
    const cjk = /[\u3000-\u9fff\uff00-\uffef]$/u.test(text) && /^[\u3000-\u9fff\uff00-\uffef]/u.test(line)
    const hyphen = reference && /[A-Za-z]-$/u.test(text) && /^[a-z]/u.test(line)
    return `${text}${cjk || hyphen ? '' : ' '}${line}`
  }, '')
}

// Page furniture can be ordered after a sample by OCR even when physically above it.
// Require both an edge location and a page-counter/answer-book title (or repeated exam title).
export function isAnswerFurniture(text, region, repeated = false) {
  return Boolean(firstLineRole('furniture', computeLineFacts({ text, region }), { repeated }))
}

export function referenceLineBoundary(previous, line, margin, previousMargin = margin) {
  return referenceBoundaryFromFacts(previous, computeLineFacts(line), margin, previousMargin)
}

// Pure source interpretation shared by the CLI and offline corpus replay.
export function buildSourceReferences(materialization, evidence, confirmation,
  { sourceDocuments = [], paperName = materialization.paperName, onWritingCapture } = {}) {
  let source, lifecycle
  try {
    source = prepareSourceReferenceWritingItems(materialization, evidence, confirmation, { paperName })
    lifecycle = sourceReferenceWritingLifecycle(source.lines, source)
  } catch (error) {
    if (error.code === 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID') fail(error.message)
    throw error
  }
  const { answerDocument, documentSha256, pages, lines, sourceOrder, factsFor, referenceFigures, scoringScopes } = source
  const { sections, furniture, review } = lifecycle
  const assignedFigures = new Set()
  let hasScoringFigures = false
  const structuredScoring = pages.some(page =>
    page.visualClassifications?.some(visual => visual.classification === 'semantic_table'))
  const groups = materialization.groups.filter((group) => group.writingTask).map((group) => {
    const taskType = group.writingTask.taskType
    const section = sections.get(taskType)
    if (!section) fail(`No answer-document section found for ${taskType}`)
    // The signature ends only the admitted model answer. Explicit scoring may
    // follow, but questions, speech and prompts terminate both capture lanes.
    const { sectionLines, sampleTitles } = section
    // Derive English sample margins within this writing section, not from unrelated
    // scoring tables, watermarks or the listening column elsewhere on the same page.
    const margins = new Map()
    for (const page of new Set(sectionLines.map((line) => line.page))) {
      const local = sectionLines.filter((line) => line.page === page && !line.figure)
      const english = local.filter((line) => matchesLineRole('writing.margin-body', factsFor(line)))
      const body = english.length ? english : local
      margins.set(page, { left: Math.min(...body.map((line) => line.left)),
        right: Math.max(...body.map((line) => line.right)) })
    }
    // The Chinese wrap veto needs the previous line's own column, not the
    // English sample or the opposite column. Keep the existing paragraph
    // geometry/margins unchanged; only this veto consumes these local rights.
    const columnMargins = new WeakMap()
    const chineseBody = sectionLines.filter(line => !line.figure && !line.table
      && factsFor(line).hasHan && !firstLineRole('entry-label', factsFor(line)))
    for (const line of chineseBody) {
      const column = chineseBody.filter(other => other !== line && other.page === line.page
        && Math.abs(other.left - line.left) <= REFERENCE_MARGIN_TOLERANCE)
      columnMargins.set(line, { right: Math.max(...column.map(other => other.right)) })
    }
    const short = taskType === 'application' ? 'app' : 'cont'
    const entries = { essays: [], scoring: [] }
    let entry = null
    let paragraph = null
    let previous = null
    let previousLocation = null
    const pageSource = pageLines => ({ documentSha256, locator: {
      kind: 'page_region', documentId: answerDocument.documentId, page: pageLines[0].page,
      region: unionRegion(pageLines.flatMap(line => line.boxes)),
    } })
    const flush = () => { if (paragraph) { entry.paragraphs.push(paragraph); paragraph = null } }
    for (const step of section.steps) {
      const { line, action, state } = step
      if (step.resetEntry || action === 'pause') {
        flush()
        entry = null
        previous = null
        previousLocation = null
      }
      review.push(...step.reviews)
      if (action === 'figure') {
        const ownership = scoringScopes.get(line.figure.afterItem.itemId)
        if (entry?.kind !== 'scoring' || !ownership || ownership.taskType !== taskType
          || ownership.labelItemId !== entry.labelItemId) {
          throw new Error('Reference figure has no exact scoring entry in its confirmed Writing Task')
        }
        flush()
        entry.paragraphs.push({ figure: line.figure })
        previous = null
        previousLocation = null
        hasScoringFigures = true
        continue
      }
      if (action === 'table') {
        if (entry?.kind !== 'scoring') fail(`Source table ${line.table.tableId} is outside a scoring entry`)
        flush()
        entry.paragraphs.push({ table: line.table })
        previous = null
        previousLocation = null
        continue
      }
      if (action === 'entry') {
        const kind = state.kind
        flush()
        const index = entries[kind].length + 1
        entry = { kind, referenceId: `source-${kind === 'scoring' ? 'score' : 'ref'}-${short}-${index}`, authority: 'source_reference',
          labelItemId: line.itemId, sourceLabel: line.text, labelSource: { documentSha256, locator: { kind: 'page_region', documentId: answerDocument.documentId,
            page: line.page, region: unionRegion(line.boxes) } }, paragraphs: [] }
        entries[kind].push(entry)
        previous = null
        previousLocation = null
        continue
      }
      if (action !== 'body') continue
      const facts = factsFor(line)
      if (step.openEntry) {
        entry = { kind: 'essays', referenceId: `source-ref-${short}-${entries.essays.length + 1}`, authority: 'source_reference',
          sourceLabel: null, labelSource: null, paragraphs: [] }
        entries.essays.push(entry)
      }
      const margin = { ...margins.get(line.page) }
      // A confirmed illustration narrows the available text line. A line
      // wrapping beside it is not a short final line of a natural paragraph.
      const lineRegion = facts.region
      for (const figure of referenceFigures.filter(figure => figure.source.page === line.page)) {
        const box = figure.source.region
        if (lineRegion && box.y < lineRegion.y + lineRegion.height && box.y + box.height > lineRegion.y
          && box.x >= line.right && box.x < margin.right) margin.right = box.x
      }
      const special = entry.kind === 'essays' && sampleTitles.has(line)
        ? 'title' : firstLineRole('paragraph-role', facts)?.value || null
      const afterClosing = previous?.role === 'closing'
      const decision = decideLineJoin({
        content: 'reference', previous, current: facts,
        geometry: { unit: 'normalized', margin, previousMargin: previous?.margin || margin,
          previousColumnMargin: previous?.columnMargin },
        roles: { hasParagraph: Boolean(paragraph), special, afterClosing,
          numbered: matchesLineRole('paragraph.numbered', facts) },
        referenceContext: { entryKind: entry.kind,
          before: previous ? pageSource([lines[previous.sourceIndex]]) : null,
          after: pageSource([line]),
          furnitureOnly: Boolean(previous && sourceOrder.get(line) > previous.sourceIndex
            && lines.slice(previous.sourceIndex + 1, sourceOrder.get(line)).every(item => furniture.has(item))) },
        location: { before: previousLocation,
          after: { documentId: answerDocument.documentId, page: line.page, itemId: line.itemId } },
      })
      review.push(...decision.reviews)
      if (decision.resolution === 'separate') {
        flush()
        paragraph = { role: special || (afterClosing ? 'signature' : 'body'), lines: [] }
      }
      paragraph.lines.push(line)
      onWritingCapture?.({ itemId: line.itemId, task: taskType, kind: entry.kind })
      previous = { role: paragraph.role, right: line.right, page: line.page,
        text: line.text, sourceIndex: sourceOrder.get(line), margin, columnMargin: columnMargins.get(line) }
      previousLocation = decision.location.after
    }
    if (section.awaitingSourceLabel) {
      fail('Unresolved continuation reference after reprinted prompt; confirm the source sample label or explicit omission')
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
      return { state: 'captured', evidence: [], entries: list.map(({ kind: _kind, labelItemId: _labelItemId, paragraphs, ...rest }) => {
        const frozenFigure = figure => {
          const document = sourceDocuments.find(document => document.documentId === answerDocument.documentId)
          if (!document?.bytes || sha256(document.bytes) !== documentSha256) {
            throw new Error('Reference figure capture requires exact source PDF bytes')
          }
          if (assignedFigures.has(figure)) throw new Error('Reference figure occurs more than once')
          assignedFigures.add(figure)
          return { figureId: `source-figure-${referenceFigures.indexOf(figure) + 1}`,
            sourceRegionId: figure.sourceRegionId,
            source: { documentSha256, locator: figure.source },
            raster: captureSourceReferenceFigure({ pdfBytes: document.bytes,
              page: figure.source.page, region: figure.source.region,
              onProcessing: processing => review.push({ sourceRegionId: figure.sourceRegionId, processing }) }) }
        }
        const blocks = paragraphs.map((item, index) => {
          if (item.figure) return { kind: 'figure', ...frozenFigure(item.figure) }
          if (item.table) return item.table
          // Keep each contiguous page/column fragment narrow: a page-wide
          // union at a column wrap would also claim unrelated source items.
          const fragments = []
          for (const line of item.lines) {
            const previous = fragments.at(-1)
            if (!previous || previous.page !== line.page
              || line.left >= previous.right - SOURCE_REFERENCE_REGION_TOLERANCE
              || line.right <= previous.left + SOURCE_REFERENCE_REGION_TOLERANCE) {
              fragments.push({ page: line.page, left: line.left, right: line.right, lines: [line] })
            } else {
              previous.lines.push(line)
              previous.left = Math.min(previous.left, line.left)
              previous.right = Math.max(previous.right, line.right)
            }
          }
          const sources = fragments.map(fragment => pageSource(fragment.lines))
          return { kind: 'paragraph', paragraph: {
            paragraphId: `${rest.referenceId}-p${index + 1}`,
            role: item.role,
            text: joinLines(item.lines.map((line) => line.text), { reference: true }),
            source: sources[0],
            ...(sources.length > 1 ? { continuationSources: sources.slice(1) } : {}),
          } }
        })
        const figures = kind === 'essays' ? referenceFigures.flatMap(figure => {
          const index = paragraphs.findIndex(item => item.lines?.some(line => line.itemId === figure.afterItem.itemId))
          if (index < 0) return []
          if (paragraphs[index].lines.at(-1).itemId !== figure.afterItem.itemId || assignedFigures.has(figure)) {
            throw new Error('Reference figure anchor must end one surviving essay paragraph')
          }
          const { figureId, sourceRegionId, source, raster } = frozenFigure(figure)
          return [{ figureId, afterParagraphId: blocks[index].paragraph.paragraphId,
            sourceRegionId, source, raster }]
        }) : []
        return { ...rest, ...(kind === 'scoring' && (structuredScoring || referenceFigures.length)
          ? { blocks } : { paragraphs: blocks.map(block => block.paragraph) }),
          ...(figures.length ? { figures } : {}) }
      }) }
    }
    return { groupId: group.groupId, taskType, essays: section_('essays'), scoring: section_('scoring') }
  })
  const objectiveAnchors = sourceReferenceObjectiveFigureAnchors(confirmation, new Set([answerDocument.documentId]))
  const excludedFigures = referenceFigures.filter(figure =>
    !assignedFigures.has(figure) && objectiveAnchors.has(figure.afterItem.itemId))
  for (const figure of excludedFigures) {
    review.push({ itemId: figure.afterItem.itemId, sourceRegionId: figure.sourceRegionId,
      issue: 'objective answer figure excluded from writing references; retained in source evidence' })
  }
  if (assignedFigures.size + excludedFigures.length !== referenceFigures.length) {
    throw new Error('Reference figure has no surviving essay anchor or explicit scoring entry')
  }
  return { groups, review, structuredScoring, ...(referenceFigures.length ? { schemaVersion: hasScoringFigures ? 'source-references-v4' : 'source-references-v3' } : {}) }
}

// Captures writing references from the confirmed answer-document OCR lines. Paragraphs are rebuilt
// from line geometry (first-line indent or a short previous line), never from the Materialization,
// so the sidecar stays a source capture. Doubtful joins are listed for visual review before finalize.
function references(paperId) {
  const { paperDir, work, documents, paperName } = context(paperId)
  const directory = path.join(paperDir, 'materialization')
  const materialization = readJson(path.join(directory, 'nck1-source-materialization-v1.json'), 'Materialization')
  const evidence = readJson(path.join(directory, NCK1_OCR_EVIDENCE_FILE_NAME), 'Staged OCR evidence')
  const confirmation = readJson(path.join(directory, 'nck1-ocr-source-confirmation-v1.json'), 'Pulled OCR confirmation')
  const { groups, review, structuredScoring, schemaVersion } = buildSourceReferences(materialization, evidence, confirmation,
    { sourceDocuments: documents, paperName })
  const output = path.join(work, 'source-references-draft.json')
  writeJson(output, { schemaVersion: schemaVersion || (structuredScoring ? 'source-references-v2' : 'source-references-v1'), paperId, sourceDigest: null, candidateDigest: null,
    materializationDigest: null, groups })
  console.log(JSON.stringify({
    ok: true,
    output,
    producerVersion: OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
    outline: groups.map((group) => ({ taskType: group.taskType, scoring: group.scoring.state,
      essays: group.essays.entries.map((item) => `${item.sourceLabel} :: ${item.paragraphs.map((p) =>
        `${p.role}@p${p.source.locator.page}[${p.text.slice(0, 18)}…${p.text.slice(-12)}]`).join(' | ')}`) })),
    review,
    next: 'fill the three digests from answer-products prepare, then answer-products finalize',
  }, null, 2))
}

const [command, paperId] = process.argv.slice(2)
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) try {
  if (command === 'evidence') await evidence(paperId)
  else if (command === 'worksheets') worksheets(paperId)
  else if (command === 'compile') compile(paperId)
  else if (command === 'report-entries') reportEntries(paperId)
  else if (command === 'presentation') presentation(paperId)
  else if (command === 'numbering') numbering(paperId)
  else if (command === 'references') references(paperId)
  else if (command === 'figure-sizes') figureSizes(paperId)
  else fail('Usage: ocr-proofread.mjs <evidence|worksheets|compile|numbering|presentation|figure-sizes|references|report-entries> <paperId> [--reset-drafts] [--work <dir>] [--regions <requests.json>] [--lang chi_sim+eng] [--jobs N]')
} catch (error) {
  fail(error.stack || String(error))
}
