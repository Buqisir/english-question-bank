import { resolveInImageOptionLabels } from './inImageOptionLabels.mjs'
import { resolveCrossPageParagraphJoins } from './crossPageParagraphJoin.mjs'
import { validateListeningSourceDecision } from './listeningSourceDecision.mjs'
import {
  digestJson,
  exactKeys,
  isRecordValue,
} from './stable.mjs'
import {
  validateMediaPresentation,
  validateMediaPublication,
} from './mediaPresentation.mjs'
import { validateReadingFigureLayout } from './readingFigureLayout.mjs'
import { writingNoticeGroups, writingWordCount } from './applicationWritingDisplay.mjs'
import { SOURCE_INSTRUCTION_SLOTS, validSourceExample } from './sourcePresentation.mjs'

export const NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION =
  'nck1-source-materialization-v1'
export const NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V2 =
  'nck1-source-materialization-v2'
export const NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V3 =
  'nck1-source-materialization-v3'
export const NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V4 =
  'nck1-source-materialization-v4'
export const NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V5 =
  'nck1-source-materialization-v5'

// v6 extends v5 with Reading Question-owned stemFigures. Older envelopes
// remain closed. Canonical authority registration waits for the complete reader.
export const NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V6 =
  'nck1-source-materialization-v6'

// v7 adds explicit source-backed application givens; older envelopes stay closed.
export const NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V7 =
  'nck1-source-materialization-v7'
export const NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8 =
  'nck1-source-materialization-v8'
export const NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9 =
  'nck1-source-materialization-v9'

const slots = Object.freeze([
  ['reading.a', 'reading', 21, 23],
  ['reading.b', 'reading', 24, 27],
  ['reading.c', 'reading', 28, 31],
  ['reading.d', 'reading', 32, 35],
  ['seven-choices', 'seven-choices', 36, 40],
  ['cloze', 'cloze', 41, 55],
  ['grammar-fill', 'grammar-fill', 56, 65],
  ['writing.application', 'application-writing', null, null],
  ['writing.continuation', 'continuation-writing', null, null],
])

const slotById = new Map(slots.map((slot) => [slot[0], slot]))
const digestPattern = /^sha256:[a-f0-9]{64}$/
const idPattern = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/
// Only the closed package entrypoint installs this policy. The raw entrypoint
// always uses its own ordinary Map and cannot opt out of document replay rules.
const packageSourceSets = new WeakMap()

function issue(code, path, message) {
  return { code, path, message }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function validateRegion(
  region,
  path,
  issues,
  code = 'MATERIALIZATION_REGION_INVALID',
) {
  if (
    !isRecordValue(region)
    || !exactKeys(region, ['x', 'y', 'width', 'height'])
    || !['x', 'y', 'width', 'height'].every((key) =>
      typeof region[key] === 'number' && Number.isFinite(region[key]))
    || region.x < 0
    || region.y < 0
    || region.width <= 0
    || region.height <= 0
    || region.x + region.width > 1
    || region.y + region.height > 1
  ) {
    issues.push(issue(
      code,
      path,
      'Page regions use normalized x/y/width/height within 0..1',
    ))
  }
}

function validateLocator(locator, path, documents, issues) {
  if (packageSourceSets.has(documents)) {
    const member = documents.get(locator?.documentId)
    if (!isRecordValue(locator)
      || !exactKeys(locator, ['kind', 'documentId', 'pointer'])
      || locator.kind !== 'package_json_pointer'
      || typeof locator.pointer !== 'string'
      || !/^(?:\/(?:[^~/]|~[01])*)*$/.test(locator.pointer)
      || member?.mediaType !== 'application/json'
      || !['content', 'official_answers'].includes(member.role)) {
      issues.push(issue('PACKAGE_CONTENT_LOCATOR_INVALID', path, 'Package content must reference a captured content/answer JSON member with a strict JSON pointer'))
    }
    return
  }
  if (!isRecordValue(locator) || !nonEmptyString(locator.documentId)) {
    issues.push(issue('MATERIALIZATION_SOURCE_LOCATOR_INVALID', path, 'Source locator needs a document id'))
    return
  }
  if (!documents.has(locator.documentId)) {
    issues.push(issue('MATERIALIZATION_SOURCE_DOCUMENT_UNRESOLVED', `${path}.documentId`, 'Source locator document is not captured'))
  }
  if (locator.kind === 'page_region') {
    if (
      !exactKeys(locator, ['kind', 'documentId', 'page', 'region'])
      || !Number.isInteger(locator.page)
      || locator.page < 1
      || locator.page > (documents.get(locator.documentId)?.pageCount || 0)
    ) {
      issues.push(issue('MATERIALIZATION_PAGE_LOCATOR_INVALID', path, 'Page locator must resolve inside the captured document'))
      return
    }
    validateRegion(locator.region, `${path}.region`, issues)
    return
  }
  if (
    locator.kind !== 'docx_part'
    || !exactKeys(locator, ['kind', 'documentId', 'part', 'selector'])
    || !nonEmptyString(locator.part)
    || !nonEmptyString(locator.selector)
  ) {
    issues.push(issue('MATERIALIZATION_SOURCE_LOCATOR_INVALID', path, 'Source locator must be one closed page_region or docx_part locator'))
  }
}

function validateOptions(options, labels, path, issues) {
  if (!Array.isArray(options) || options.length !== labels.length) {
    issues.push(issue('MATERIALIZATION_OPTIONS_INVALID', path, `Options must contain ${labels.join('-')}`))
    return
  }
  for (const [index, option] of options.entries()) {
    if (
      !isRecordValue(option)
      || !exactKeys(option, ['label', 'text'])
      || option.label !== labels[index]
      || !nonEmptyString(option.text)
    ) {
      issues.push(issue('MATERIALIZATION_OPTION_INVALID', `${path}[${index}]`, 'Option labels and non-empty text must preserve source order'))
      continue
    }
    if (
      option.text.length > 500
      || /(?:第[一二三四]部分|第[一二]节|听第\d+段|\s\d{1,2}\.\s+[A-Z])/u.test(option.text)
    ) {
      issues.push(issue('MATERIALIZATION_OPTION_TEXT_SUSPICIOUS', `${path}[${index}].text`, 'Option text appears to cross a question or source section boundary and requires source review'))
    }
  }
}

function validateCellContent(content, path, mediaReferences, issues) {
  if (!Array.isArray(content) || content.length === 0) {
    issues.push(issue('MATERIALIZATION_TABLE_CELL_EMPTY', path, 'Table cells need ordered text or media content'))
    return
  }
  for (const [index, item] of content.entries()) {
    const itemPath = `${path}[${index}]`
    if (
      isRecordValue(item)
      && exactKeys(item, ['kind', 'text'])
      && item.kind === 'text'
      && nonEmptyString(item.text)
    ) continue
    if (
      isRecordValue(item)
      && exactKeys(item, ['kind', 'mediaId', 'alt'])
      && item.kind === 'media_ref'
      && nonEmptyString(item.mediaId)
      && typeof item.alt === 'string'
    ) {
      mediaReferences.push({ mediaId: item.mediaId, path: `${itemPath}.mediaId` })
      continue
    }
    issues.push(issue('MATERIALIZATION_TABLE_CELL_CONTENT_INVALID', itemPath, 'Table cell content may only be non-empty text or an identified media_ref with alt text'))
  }
}

function validateParagraphContent(content, path, blankReferences, issues) {
  if (!Array.isArray(content) || content.length === 0) {
    issues.push(issue('MATERIALIZATION_PARAGRAPH_EMPTY', path, 'Paragraphs need ordered text or blank content'))
    return
  }
  for (const [index, item] of content.entries()) {
    const itemPath = `${path}[${index}]`
    if (
      isRecordValue(item)
      && exactKeys(item, ['kind', 'text'])
      && item.kind === 'text'
      && nonEmptyString(item.text)
    ) continue
    if (
      isRecordValue(item)
      && exactKeys(item, ['kind', 'blankId'])
      && item.kind === 'blank_ref'
      && nonEmptyString(item.blankId)
    ) {
      blankReferences.push(item.blankId)
      continue
    }
    issues.push(issue('MATERIALIZATION_PARAGRAPH_CONTENT_INVALID', itemPath, 'Paragraph content may only be non-empty text or blank_ref'))
  }
}

function validateTable(block, path, documents, mediaReferences, issues) {
  if (
    !exactKeys(block, ['kind', 'blockId', 'columnCount', 'rows', 'source'])
    || !Number.isInteger(block.columnCount)
    || block.columnCount < 1
    || !Array.isArray(block.rows)
    || block.rows.length === 0
  ) {
    issues.push(issue('MATERIALIZATION_TABLE_INVALID', path, 'Table needs a non-empty rectangular semantic grid'))
    return
  }
  validateLocator(block.source, `${path}.source`, documents, issues)
  const activeRowSpans = new Map()
  for (const [rowIndex, row] of block.rows.entries()) {
    const rowPath = `${path}.rows[${rowIndex}]`
    if (!isRecordValue(row) || !exactKeys(row, ['rowId', 'cells']) || !nonEmptyString(row.rowId) || !Array.isArray(row.cells)) {
      issues.push(issue('MATERIALIZATION_TABLE_ROW_INVALID', rowPath, 'Table rows are closed and identified'))
      continue
    }
    const occupied = new Set(activeRowSpans.keys())
    for (const [cellIndex, cell] of row.cells.entries()) {
      const cellPath = `${rowPath}.cells[${cellIndex}]`
      if (
        !isRecordValue(cell)
        || !exactKeys(cell, ['cellId', 'columnStart', 'columnSpan', 'rowSpan', 'role', 'content'])
        || !nonEmptyString(cell.cellId)
        || !Number.isInteger(cell.columnStart)
        || !Number.isInteger(cell.columnSpan)
        || !Number.isInteger(cell.rowSpan)
        || cell.columnStart < 0
        || cell.columnSpan < 1
        || cell.rowSpan < 1
        || cell.columnStart + cell.columnSpan > block.columnCount
        || !['header', 'data'].includes(cell.role)
      ) {
        issues.push(issue('MATERIALIZATION_TABLE_CELL_INVALID', cellPath, 'Table cell geometry and role must be closed'))
        continue
      }
      for (let column = cell.columnStart; column < cell.columnStart + cell.columnSpan; column += 1) {
        if (occupied.has(column)) {
          issues.push(issue('MATERIALIZATION_TABLE_OVERLAP', cellPath, 'Table cells and row spans cannot overlap'))
        }
        occupied.add(column)
        if (cell.rowSpan > 1) activeRowSpans.set(column, cell.rowSpan)
      }
      validateCellContent(cell.content, `${cellPath}.content`, mediaReferences, issues)
    }
    if (occupied.size !== block.columnCount) {
      issues.push(issue('MATERIALIZATION_TABLE_NOT_RECTANGULAR', rowPath, 'Every table row must cover the declared columns'))
    }
    for (const [column, remaining] of [...activeRowSpans]) {
      if (remaining <= 1) activeRowSpans.delete(column)
      else activeRowSpans.set(column, remaining - 1)
    }
  }
  if (activeRowSpans.size > 0) {
    issues.push(issue('MATERIALIZATION_TABLE_ROWSPAN_OVERFLOW', path, 'Table row span exceeds the final row'))
  }
}

function validateBlocks(blocks, path, documents, mediaReferences, blankReferences, ids, issues, {
  allowFramedColumns = true,
  allowFigure = true,
} = {}) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    issues.push(issue('MATERIALIZATION_BLOCKS_EMPTY', path, 'Every active group needs source-ordered content blocks'))
    return
  }
  for (const [index, block] of blocks.entries()) {
    const blockPath = `${path}[${index}]`
    if (!isRecordValue(block) || !nonEmptyString(block.blockId) || ids.has(block.blockId)) {
      issues.push(issue('MATERIALIZATION_BLOCK_ID_INVALID', blockPath, 'Content blocks need unique identities'))
      continue
    }
    ids.add(block.blockId)
    if (block.kind === 'paragraph') {
      if (
        !exactKeys(block, ['kind', 'blockId', 'role', 'content', 'source'])
        || !['title', 'subtitle', 'body'].includes(block.role)
      ) {
        issues.push(issue('MATERIALIZATION_PARAGRAPH_INVALID', blockPath, 'Paragraph fields are closed'))
      }
      validateParagraphContent(block.content, `${blockPath}.content`, blankReferences, issues)
      validateLocator(block.source, `${blockPath}.source`, documents, issues)
      continue
    }
    if (block.kind === 'table') {
      validateTable(block, blockPath, documents, mediaReferences, issues)
      continue
    }
    if (block.kind === 'figure' && allowFigure) {
      if (
        !exactKeys(block, ['kind', 'blockId', 'mediaId', 'caption', 'source'])
        || !nonEmptyString(block.mediaId)
        || typeof block.caption !== 'string'
      ) {
        issues.push(issue('MATERIALIZATION_FIGURE_INVALID', blockPath, 'Figures need one source media reference and caption'))
      }
      mediaReferences.push({ mediaId: block.mediaId, path: `${blockPath}.mediaId` })
      validateLocator(block.source, `${blockPath}.source`, documents, issues)
      continue
    }
    if (block.kind === 'framed_columns' && allowFramedColumns) {
      if (
        !exactKeys(block, ['kind', 'blockId', 'columns', 'source'])
        || !Array.isArray(block.columns)
        || block.columns.length !== 2
      ) {
        issues.push(issue('MATERIALIZATION_FRAMED_COLUMNS_INVALID', blockPath, 'framed_columns requires exactly two columns'))
        continue
      }
      validateLocator(block.source, `${blockPath}.source`, documents, issues)
      for (const [columnIndex, column] of block.columns.entries()) {
        const columnPath = `${blockPath}.columns[${columnIndex}]`
        if (
          !isRecordValue(column)
          || !exactKeys(column, ['columnId', 'headingBlockId', 'blocks'])
          || !nonEmptyString(column.columnId)
          || ids.has(column.columnId)
          || !(column.headingBlockId === null || nonEmptyString(column.headingBlockId))
        ) {
          issues.push(issue('MATERIALIZATION_FRAMED_COLUMN_INVALID', columnPath, 'Framed columns need unique identities and an optional heading block'))
          continue
        }
        ids.add(column.columnId)
        validateBlocks(column.blocks, `${columnPath}.blocks`, documents, mediaReferences, blankReferences, ids, issues, {
          allowFramedColumns: false,
          allowFigure: false,
        })
        if (
          column.headingBlockId !== null
          && !column.blocks.some((child) =>
            child?.kind === 'paragraph' && child.blockId === column.headingBlockId)
        ) {
          issues.push(issue('MATERIALIZATION_FRAMED_HEADING_UNRESOLVED', `${columnPath}.headingBlockId`, 'Column heading must identify one paragraph in that column'))
        }
      }
      continue
    }
    issues.push(issue('MATERIALIZATION_BLOCK_UNSUPPORTED', blockPath, 'Only paragraph, table, figure, and two-column framed content are supported'))
  }
}

function validateQuestion(question, expectedNumber, family, path, documents, ids, issues, figureReferences = null, allowStemFigures = false) {
  if (
    !isRecordValue(question)
    || !exactKeys(question, [
      'questionId',
      'sourceNumber',
      'canonicalNumber',
      'stem',
      'options',
      'blankId',
      'prompt',
      'source',
      ...(figureReferences && family === 'reading' && Object.hasOwn(question, 'figureLayout') ? ['figureLayout'] : []),
      ...(allowStemFigures && family === 'reading' && Object.hasOwn(question, 'stemFigures') ? ['stemFigures'] : []),
    ])
    || !nonEmptyString(question.questionId)
    || ids.has(question.questionId)
    || !Number.isInteger(question.sourceNumber)
    || question.sourceNumber < 1
    || question.canonicalNumber !== expectedNumber
    || typeof question.stem !== 'string'
  ) {
    issues.push(issue('MATERIALIZATION_QUESTION_INVALID', path, `Question must close canonical number ${expectedNumber}`))
    return
  }
  ids.add(question.questionId)
  validateLocator(question.source, `${path}.source`, documents, issues)
  if (Object.hasOwn(question, 'figureLayout') && !validateReadingFigureLayout(
    question.figureLayout, question.questionId, question.options,
    documents.get(question.source?.documentId)?.sha256,
  )) {
    issues.push(issue('MATERIALIZATION_FIGURE_LAYOUT_INVALID', `${path}.figureLayout`, 'Source-measured Reading layout must bind its exact question, options, source document and measurement'))
  }
  if (family === 'reading') {
    if (Object.hasOwn(question, 'stemFigures')) {
      const figures = question.stemFigures
      if (!Array.isArray(figures) || figures.length === 0 || figures.some(figure => figure?.kind !== 'figure')) {
        issues.push(issue('MATERIALIZATION_STEM_FIGURES_INVALID', `${path}.stemFigures`, 'Stem figures must be a nonempty ordered figure-only sequence'))
      } else {
        validateBlocks(figures, `${path}.stemFigures`, documents, figureReferences, [], ids, issues)
        for (const figure of figures) {
          if (figure.caption !== '') {
            issues.push(issue('MATERIALIZATION_STEM_FIGURE_CAPTION_INVALID', `${path}.stemFigures`, 'Source-cropped stem figures must have an empty caption; image labels must not be transcribed again'))
          }
          const document = documents.get(figure.source?.documentId)
          if (figure.source?.kind !== 'page_region' || document?.role !== 'question_source'
            || document?.mediaType !== 'application/pdf'
            || figure.source.documentId !== question.source.documentId) {
            issues.push(issue('MATERIALIZATION_STEM_FIGURE_SOURCE_INVALID', `${path}.stemFigures`, 'Stem figures require the same question_source PDF as their owning Question'))
          }
        }
      }
    }
    if (figureReferences && Array.isArray(question.options) && question.options.some((option) => option?.figure)) {
      if (question.options.length !== 4 || question.options.some((option, index) =>
        !isRecordValue(option) || !exactKeys(option, ['label', 'figure'])
        || option.label !== 'ABCD'[index] || !isRecordValue(option.figure)
        || !exactKeys(option.figure, ['mediaId']) || !nonEmptyString(option.figure.mediaId))) {
        issues.push(issue('MATERIALIZATION_FIGURE_OPTIONS_INVALID', `${path}.options`, 'Reading requires four ordered A-D figure options without mixed text'))
      } else {
        question.options.forEach((option, index) => figureReferences.push({
          mediaId: option.figure.mediaId,
          path: `${path}.options[${index}].figure`,
        }))
      }
    } else {
      validateOptions(question.options, ['A', 'B', 'C', 'D'], `${path}.options`, issues)
    }
    if (question.blankId !== null || question.prompt !== null || !nonEmptyString(question.stem)) {
      issues.push(issue('MATERIALIZATION_READING_QUESTION_INVALID', path, 'Reading questions need a stem and A-D choices only'))
    }
    return
  }
  if (family === 'cloze') {
    validateOptions(question.options, ['A', 'B', 'C', 'D'], `${path}.options`, issues)
  } else if (!Array.isArray(question.options) || question.options.length !== 0) {
    issues.push(issue('MATERIALIZATION_QUESTION_OPTIONS_FORBIDDEN', `${path}.options`, 'This family does not own per-question options'))
  }
  if (!nonEmptyString(question.blankId) || ids.has(question.blankId)) {
    issues.push(issue('MATERIALIZATION_BLANK_ID_INVALID', `${path}.blankId`, 'Blank-bearing questions need unique blank identities'))
  } else {
    ids.add(question.blankId)
  }
  if (family === 'grammar-fill') {
    if (!(question.prompt === null || nonEmptyString(question.prompt))) {
      issues.push(issue('MATERIALIZATION_GRAMMAR_PROMPT_INVALID', `${path}.prompt`, 'Grammar prompt is source text or null when no hint is supplied'))
    }
  } else if (question.prompt !== null) {
    issues.push(issue('MATERIALIZATION_QUESTION_PROMPT_FORBIDDEN', `${path}.prompt`, 'Only Grammar Fill carries a source prompt'))
  }
}

function validateWritingTask(task, family, path, documents, issues, allowDrawingArea = false, allowGivenBlockRefs = false) {
  if (
    !isRecordValue(task)
    || !exactKeys(task, [
      'taskType',
      'prompt',
      'material',
      'starters',
      'givenSkeleton',
      ...(allowGivenBlockRefs && Object.hasOwn(task, 'givenBlockRefs') ? ['givenBlockRefs'] : []),
      'wordCountTarget',
      'officialModelAnswer',
      'source',
      ...(allowDrawingArea && Object.hasOwn(task, 'drawingArea') ? ['drawingArea'] : []),
    ])
    || task.taskType !== (family === 'application-writing' ? 'application' : 'continuation')
    || !nonEmptyString(task.prompt)
    || !Array.isArray(task.material)
    || task.material.some((item) => !nonEmptyString(item))
    || !Array.isArray(task.starters)
    || task.starters.some((item) => !nonEmptyString(item))
    || !Array.isArray(task.givenSkeleton)
    || task.givenSkeleton.some((item) =>
      !isRecordValue(item)
      || !exactKeys(item, ['text', 'role'])
      || !nonEmptyString(item.text)
      || !['title', 'salutation', 'opening', 'closing', 'signature'].includes(item.role))
    || !Number.isInteger(task.wordCountTarget)
    || task.wordCountTarget < 1
    || !(task.officialModelAnswer === null || nonEmptyString(task.officialModelAnswer))
  ) {
    issues.push(issue('MATERIALIZATION_WRITING_TASK_INVALID', path, 'Writing task must preserve its complete source prompt and response givens'))
    return
  }
  if (Object.hasOwn(task, 'givenBlockRefs') && (family !== 'application-writing'
    || !Array.isArray(task.givenBlockRefs) || task.givenBlockRefs.some(ref => !nonEmptyString(ref)))) {
    issues.push(issue('MATERIALIZATION_WRITING_GIVEN_REFS_INVALID', `${path}.givenBlockRefs`, 'Explicit givens require application-only ordered block ids'))
  }
  if (family === 'application-writing' && (task.material.length > 0 || task.starters.length > 0)) {
    issues.push(issue('MATERIALIZATION_APPLICATION_SHAPE_INVALID', path, 'Application Writing does not carry continuation material or starters'))
  }
  if (family === 'continuation-writing' && (task.material.length === 0 || task.starters.length !== 2 || task.givenSkeleton.length > 0)) {
    issues.push(issue('MATERIALIZATION_CONTINUATION_SHAPE_INVALID', path, 'Continuation needs source material and exactly two starters'))
  }
  validateLocator(task.source, `${path}.source`, documents, issues)
  if (Object.hasOwn(task, 'drawingArea')) {
    const area = task.drawingArea
    if (family !== 'application-writing' || !isRecordValue(area)
      || !exactKeys(area, ['placement', 'labelBlockRef', 'source'])
      || area.placement !== 'top_right' || !nonEmptyString(area.labelBlockRef)) {
      issues.push(issue('MATERIALIZATION_DRAWING_AREA_INVALID', `${path}.drawingArea`, 'One application-only top-right drawing area requires a label block and source locator'))
    } else {
      validateLocator(area.source, `${path}.drawingArea.source`, documents, issues)
      if (!['question_source', 'question_and_answers'].includes(documents.get(area.source?.documentId)?.role)) {
        issues.push(issue('MATERIALIZATION_DRAWING_AREA_SOURCE_INVALID', `${path}.drawingArea.source`, 'Drawing area must bind the question-bearing source'))
      }
    }
  }
}

export function normalizedWritingText(value) {
  return value
    .normalize('NFKC')
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function writingParagraphs(blocks) {
  return blocks
    .filter((block) => block?.kind === 'paragraph' && Array.isArray(block.content))
    .map((block) => ({
      blockId: block.blockId,
      text: normalizedWritingText(block.content
        .filter((item) => item?.kind === 'text')
        .map((item) => item.text)
        .join('')),
    }))
}

// Explicit references may select only one contiguous terminal response run.
// Material before that run stays in the prompt, including figures. This shared
// resolver never guesses from matching words scattered through source material.
export function resolveWritingGivenBlocks(blocks, task, family) {
  const paragraphs = writingParagraphs(blocks).filter(block => block.blockId !== task.drawingArea?.labelBlockRef)
  const notices = writingNoticeGroups(paragraphs.map(paragraph => paragraph.text))
  if (notices.length !== 1) return null
  const end = notices[0].startIndex + notices[0].blockCount
  if (!Object.hasOwn(task, 'givenBlockRefs')) {
    return paragraphs.slice(end).map(paragraph => blocks.find(block => block.blockId === paragraph.blockId))
  }
  const refs = task.givenBlockRefs
  if (family !== 'application-writing' || !Array.isArray(refs) || !Array.isArray(task.givenSkeleton)
    || refs.length !== task.givenSkeleton.length || !refs.length || new Set(refs).size !== refs.length) return null
  const selected = refs.map(ref => blocks.filter(block => block.blockId === ref))
  if (selected.some(matches => matches.length !== 1)) return null
  const result = selected.map(matches => matches[0])
  const first = blocks.indexOf(result[0])
  // Require exact raw text (no compatibility/whitespace normalization), and
  // exclude labels, media, missing locators and anything before/inside 注意.
  if (blocks.length - first !== result.length || result.some((block, index) =>
    blocks[first + index] !== block || block.kind !== 'paragraph' || !block.source
    || block.blockId === task.drawingArea?.labelBlockRef
    || paragraphs.findIndex(paragraph => paragraph.blockId === block.blockId) < end
    || !Array.isArray(block.content) || block.content.some(item => item.kind !== 'text')
    || block.content.map(item => item.text).join('') !== task.givenSkeleton[index]?.text)) return null
  return result
}

function matchingParagraphIndexes(paragraphs, text) {
  const normalized = normalizedWritingText(text)
  return paragraphs.flatMap((paragraph, index) =>
    paragraph.text === normalized ? [index] : [])
}

function validateWritingBlocks(blocks, task, family, path, issues) {
  if (
    !isRecordValue(task)
    || !nonEmptyString(task.prompt)
    || !Array.isArray(task.material)
    || !Array.isArray(task.starters)
    || !Array.isArray(task.givenSkeleton)
    || !Number.isInteger(task.wordCountTarget)
  ) return

  const paragraphs = writingParagraphs(blocks).filter(block => block.blockId !== task.drawingArea?.labelBlockRef)
  if (task.drawingArea) {
    const labels = writingParagraphs(blocks).filter(block => block.blockId === task.drawingArea.labelBlockRef)
    if (labels.length !== 1 || !labels[0].text) {
      issues.push(issue('MATERIALIZATION_DRAWING_LABEL_INVALID', `${path}.writingTask.drawingArea.labelBlockRef`, 'Drawing label must resolve to one nonempty paragraph in its own group'))
    }
  }
  const notices = writingNoticeGroups(paragraphs.map(paragraph => paragraph.text))
    .map(notice => ({
      start: notice.startIndex,
      end: notice.startIndex + notice.blockCount - 1,
      text: notice.lines.map(line => line.text).join(' '),
    }))
  if (notices.length !== 1 || writingWordCount(notices[0].text) === null) {
    issues.push(issue(
      'MATERIALIZATION_WRITING_NOTICE_INVALID',
      path,
      'Writing requires exactly one source-ordered 注意 block with a word-count instruction, preserving any numbered source instructions without merging paragraphs',
    ))
    return
  }

  const notice = notices[0]
  const noticeWordCount = writingWordCount(notice.text)
  if (noticeWordCount !== task.wordCountTarget) {
    issues.push(issue(
      'MATERIALIZATION_WRITING_WORD_COUNT_CONFLICT',
      `${path}.writingTask.wordCountTarget`,
      'Writing wordCountTarget must equal the source 注意 instruction',
    ))
  }

  const promptIndexes = matchingParagraphIndexes(paragraphs, task.prompt)
  if (promptIndexes.length !== 1 || promptIndexes[0] >= notice.start) {
    issues.push(issue(
      'MATERIALIZATION_WRITING_PROMPT_PLACEMENT_INVALID',
      `${path}.blocks`,
      'Writing prompt must resolve to exactly one paragraph before the 注意 block',
    ))
    return
  }

  const promptIndex = promptIndexes[0]
  if (family === 'continuation-writing') {
    const sourceMaterial = paragraphs
      .slice(promptIndex + 1, notice.start)
      .map((paragraph) => paragraph.text)
    const declaredMaterial = task.material.map(normalizedWritingText)
    if (
      sourceMaterial.length !== declaredMaterial.length
      || sourceMaterial.some((text, index) => text !== declaredMaterial[index])
    ) {
      issues.push(issue(
        'MATERIALIZATION_CONTINUATION_MATERIAL_BOUNDARY_INVALID',
        `${path}.blocks`,
        'Every continuation material paragraph, including its source title, must map one-for-one in source order between prompt and 注意',
      ))
    }
  }

  const explicit = Object.hasOwn(task, 'givenBlockRefs')
  const resolvedGivens = explicit ? resolveWritingGivenBlocks(blocks, task, family) : []
  const sourceGivens = explicit
    ? resolvedGivens?.map(block =>
        normalizedWritingText(block.content.map(item => item.text).join(''))) || []
    : paragraphs.slice(notice.end + 1).map(paragraph => paragraph.text)
  const declaredGivens = (family === 'continuation-writing'
    ? task.starters
    : task.givenSkeleton.map((item) => item.text))
    .map(normalizedWritingText)
  if (
    resolvedGivens === null
    || sourceGivens.length !== declaredGivens.length
    || sourceGivens.some((text, index) => text !== declaredGivens[index])
  ) {
    issues.push(issue(
      'MATERIALIZATION_WRITING_GIVENS_PLACEMENT_INVALID',
      `${path}.blocks`,
      'Source response title, skeleton, or continuation starters must map one-for-one after 注意 and remain response-box givens',
    ))
  }
}

function validateGroups(groups, documents, mediaReferences, issues, allowFigureOptions = false, allowDrawingArea = false, allowStemFigures = false, allowGivenBlockRefs = false) {
  if (!Array.isArray(groups) || groups.length !== slots.length) {
    issues.push(issue('MATERIALIZATION_GROUPS_INCOMPLETE', '$.groups', 'NCK1 requires exactly nine active groups'))
    return { questionIds: new Map(), ids: new Set() }
  }
  const groupBySlot = new Map()
  const ids = new Set()
  const questionIds = new Map()
  for (const [index, group] of groups.entries()) {
    const path = `$.groups[${index}]`
    if (
      !isRecordValue(group)
      || !exactKeys(group, ['slotId', 'groupId', 'family', 'blocks', 'questions', 'optionBank', 'writingTask'])
      || !slotById.has(group.slotId)
      || groupBySlot.has(group.slotId)
      || !nonEmptyString(group.groupId)
      || ids.has(group.groupId)
    ) {
      issues.push(issue('MATERIALIZATION_GROUP_INVALID', path, 'Groups need one unique NCK1 slot and identity'))
      continue
    }
    groupBySlot.set(group.slotId, group)
    ids.add(group.groupId)
    const [, expectedFamily, from, to] = slotById.get(group.slotId)
    if (group.family !== expectedFamily) {
      issues.push(issue('MATERIALIZATION_GROUP_FAMILY_MISMATCH', `${path}.family`, 'Group family must match its NCK1 slot'))
    }
    const blankReferences = []
    validateBlocks(group.blocks, `${path}.blocks`, documents, mediaReferences, blankReferences, ids, issues)
    if (from === null) {
      if (!Array.isArray(group.questions) || group.questions.length !== 0 || !Array.isArray(group.optionBank) || group.optionBank.length !== 0) {
        issues.push(issue('MATERIALIZATION_WRITING_QUESTIONS_FORBIDDEN', path, 'Writing groups have no Questions or option bank'))
      }
      validateWritingTask(group.writingTask, expectedFamily, `${path}.writingTask`, documents, issues, allowDrawingArea, allowGivenBlockRefs)
      validateWritingBlocks(group.blocks, group.writingTask, expectedFamily, path, issues)
      continue
    }
    // Objective passage blocks do not own section-level answering directions.
    // Flag even a truncated instruction prefix for source review; never delete it.
    for (const [blockIndex, block] of (Array.isArray(group.blocks) ? group.blocks : []).entries()) {
      if (block?.kind !== 'paragraph' || !Array.isArray(block.content)) continue
      const text = block.content.filter(item => item?.kind === 'text').map(item => item.text).join('')
        .normalize('NFKC').replace(/\s+/gu, '')
      if (!/^(?:请)?阅读(?:下[列面]|以下)(?:的)?(?:短文|材料|文本)/u.test(text)) continue
      issues.push(issue(
        'MATERIALIZATION_PASSAGE_INSTRUCTION_SUSPECTED',
        `${path}.blocks[${blockIndex}]`,
        `${group.slotId}: block ${block.blockId} looks like answering directions inside passage content; review its source locator and ownership before submitting, do not auto-delete source text`,
      ))
    }
    if (group.writingTask !== null || !Array.isArray(group.questions) || group.questions.length !== to - from + 1) {
      issues.push(issue('MATERIALIZATION_GROUP_QUESTION_COUNT_INVALID', `${path}.questions`, `Slot ${group.slotId} requires questions ${from}-${to}`))
      continue
    }
    for (let number = from; number <= to; number += 1) {
      const questionIndex = number - from
      const question = group.questions[questionIndex]
      validateQuestion(question, number, expectedFamily, `${path}.questions[${questionIndex}]`, documents, ids, issues, allowFigureOptions ? mediaReferences : null, allowStemFigures)
      if (nonEmptyString(question?.questionId)) {
        questionIds.set(question.questionId, { number, family: expectedFamily })
      }
    }
    const expectedBlankIds = group.questions
      .map((question) => question?.blankId)
      .filter(nonEmptyString)
    if (
      blankReferences.length !== expectedBlankIds.length
      || blankReferences.some((blankId, index) => blankId !== expectedBlankIds[index])
    ) {
      issues.push(issue('MATERIALIZATION_BLANK_PLACEMENT_INVALID', `${path}.blocks`, 'Every blank-bearing Question must be placed exactly once in source order'))
    }
    if (expectedFamily === 'seven-choices') {
      validateOptions(group.optionBank, ['A', 'B', 'C', 'D', 'E', 'F', 'G'], `${path}.optionBank`, issues)
    } else if (!Array.isArray(group.optionBank) || group.optionBank.length !== 0) {
      issues.push(issue('MATERIALIZATION_OPTION_BANK_FORBIDDEN', `${path}.optionBank`, 'Only Seven Choices owns an option bank'))
    }
  }
  for (const [slotId] of slots) {
    if (!groupBySlot.has(slotId)) issues.push(issue('MATERIALIZATION_SLOT_MISSING', '$.groups', `Missing NCK1 slot ${slotId}`))
  }
  return { questionIds, ids }
}

function validateAnswers(answers, questionIds, documents, issues) {
  if (!Array.isArray(answers) || answers.length !== 45) {
    issues.push(issue('MATERIALIZATION_ANSWERS_INCOMPLETE', '$.answers', 'Official answers must cover canonical questions 21-65 exactly once'))
    return
  }
  const seenNumbers = new Set()
  for (const [index, answer] of answers.entries()) {
    const path = `$.answers[${index}]`
    if (
      !isRecordValue(answer)
      || !exactKeys(answer, ['questionId', 'canonicalNumber', 'value', 'authority'])
      || questionIds.get(answer.questionId)?.number !== answer.canonicalNumber
      || !Number.isInteger(answer.canonicalNumber)
      || answer.canonicalNumber < 21
      || answer.canonicalNumber > 65
      || seenNumbers.has(answer.canonicalNumber)
      || !nonEmptyString(answer.value)
      || (
        ['reading', 'cloze'].includes(questionIds.get(answer.questionId)?.family)
        && !['A', 'B', 'C', 'D'].includes(answer.value)
      )
      || (
        questionIds.get(answer.questionId)?.family === 'seven-choices'
        && !['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(answer.value)
      )
    ) {
      issues.push(issue('MATERIALIZATION_ANSWER_INVALID', path, 'Answer must bind one captured Question and canonical number'))
      continue
    }
    seenNumbers.add(answer.canonicalNumber)
    validateLocator(answer.authority, `${path}.authority`, documents, issues)
  }
  for (let number = 21; number <= 65; number += 1) {
    if (!seenNumbers.has(number)) issues.push(issue('MATERIALIZATION_ANSWER_MISSING', '$.answers', `Missing official answer ${number}`))
  }
}

function validateMedia(media, documents, mediaReferences, schemaVersion, issues) {
  if (!Array.isArray(media)) {
    issues.push(issue('MATERIALIZATION_MEDIA_INVALID', '$.media', 'Media inventory must be an array'))
    return
  }
  const mediaKeys = schemaVersion !== NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION
    ? [
        'mediaId',
        'usage',
        'kind',
        'mimeType',
        'sha256',
        'pixelWidth',
        'pixelHeight',
        'extraction',
        'presentation',
        'publication',
      ]
    : ['mediaId', 'usage', 'kind', 'mimeType', 'sha256', 'pixelWidth', 'pixelHeight', 'extraction']
  const byId = new Map()
  for (const [index, item] of media.entries()) {
    const path = `$.media[${index}]`
    if (
      !isRecordValue(item)
      || !exactKeys(item, mediaKeys)
      || !nonEmptyString(item.mediaId)
      || byId.has(item.mediaId)
      || !['content', 'visual_proof'].includes(item.usage)
      || !['figure', 'icon', 'barcode'].includes(item.kind)
      || !/^image\/(?:png|jpeg|webp|svg\+xml)$/.test(item.mimeType)
      || !digestPattern.test(item.sha256)
      || !Number.isInteger(item.pixelWidth)
      || item.pixelWidth < 1
      || !Number.isInteger(item.pixelHeight)
      || item.pixelHeight < 1
    ) {
      issues.push(issue('MATERIALIZATION_MEDIA_ITEM_INVALID', path, 'Media requires closed identity, image metadata, digest, and extraction recipe'))
      continue
    }
    if (
      schemaVersion !== NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION
      && !validateMediaPresentation(item.presentation)
    ) {
      issues.push(issue('MATERIALIZATION_MEDIA_PRESENTATION_INVALID', `${path}.presentation`, 'Media layout intent requires one alignment, relative width, and finite spacing tokens'))
      continue
    }
    if (
      schemaVersion !== NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION
      && (
        !validateMediaPublication(item.publication, item.presentation)
        || item.publication.sourceSha256 !== item.sha256
      )
    ) {
      issues.push(issue('MATERIALIZATION_MEDIA_PUBLICATION_INVALID', `${path}.publication`, 'Media publication must select the immutable source crop, replayable enhancement, or exact human-confirmed AI candidate'))
      continue
    }
    byId.set(item.mediaId, item)
    const extraction = item.extraction
    if (packageSourceSets.has(documents)) {
      const member = documents.get(extraction?.memberId)
      if (!isRecordValue(extraction)
        || !exactKeys(extraction, ['kind', 'memberId'])
        || extraction.kind !== 'package_member'
        || member?.role !== 'media'
        || member.sha256 !== item.sha256
        || member.mediaType !== item.mimeType) {
        issues.push(issue('PACKAGE_CONTENT_MEDIA_INVALID', `${path}.extraction`, 'Package media must bind one supplied media member, not an original extraction recipe'))
      }
      continue
    }
    if (
      isRecordValue(extraction)
      && exactKeys(extraction, ['kind', 'documentId', 'entryName'])
      && extraction.kind === 'docx_media'
      && documents.has(extraction.documentId)
      && /^word\/media\/[^/]+$/.test(extraction.entryName)
    ) continue
    if (
      isRecordValue(extraction)
      && exactKeys(extraction, ['kind', 'documentId', 'entryName', 'density'])
      && extraction.kind === 'docx_svg_raster'
      && documents.has(extraction.documentId)
      && /^word\/media\/[^/]+\.svg$/i.test(extraction.entryName)
      && Number.isInteger(extraction.density)
      && extraction.density >= 72
      && extraction.density <= 600
      && item.mimeType === 'image/png'
    ) continue
    if (
      isRecordValue(extraction)
      && exactKeys(extraction, ['kind', 'documentId', 'page', 'region', 'density'])
      && extraction.kind === 'pdf_crop'
      && documents.has(extraction.documentId)
      && Number.isInteger(extraction.page)
      && extraction.page >= 1
      && extraction.page <= documents.get(extraction.documentId).pageCount
      && Number.isInteger(extraction.density)
      && extraction.density >= 72
      && extraction.density <= 600
    ) {
      validateRegion(extraction.region, `${path}.extraction.region`, issues)
      continue
    }
    issues.push(issue('MATERIALIZATION_MEDIA_EXTRACTION_INVALID', `${path}.extraction`, 'Media must resolve to one DOCX entry, deterministic DOCX SVG raster, or normalized PDF page crop'))
  }
  const referenceCounts = new Map()
  for (const reference of mediaReferences) {
    const item = byId.get(reference.mediaId)
    if (!item || item.usage !== 'content') {
      issues.push(issue('MATERIALIZATION_MEDIA_UNRESOLVED', reference.path, 'Content media reference must resolve to one content media item'))
    }
    referenceCounts.set(
      reference.mediaId,
      (referenceCounts.get(reference.mediaId) || 0) + 1,
    )
  }
  for (const item of media) {
    if (item?.usage === 'content' && referenceCounts.get(item.mediaId) !== 1) {
      issues.push(issue('MATERIALIZATION_MEDIA_PLACEMENT_INVALID', '$.media', `Content media ${item.mediaId} must be used exactly once by a source block or Reading option`))
    }
  }
}

function nestedBlocks(blocks) {
  return blocks.flatMap((block) => block.kind === 'framed_columns'
    ? [block, ...block.columns.flatMap((column) => nestedBlocks(column.blocks))]
    : [block])
}

// Normalized coordinates may differ by one millionth through crop rounding.
const structuredAnswerRegionTolerance = 1e-6
function regionContains(outer, inner) {
  return outer && inner
    && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(outer[key]) && Number.isFinite(inner[key]))
    && inner.x >= outer.x - structuredAnswerRegionTolerance
    && inner.y >= outer.y - structuredAnswerRegionTolerance
    && inner.x + inner.width <= outer.x + outer.width + structuredAnswerRegionTolerance
    && inner.y + inner.height <= outer.y + outer.height + structuredAnswerRegionTolerance
}

function regionsOverlap(left, right) {
  return left && right
    && Math.min(left.x + left.width, right.x + right.width)
      - Math.max(left.x, right.x) > structuredAnswerRegionTolerance
    && Math.min(left.y + left.height, right.y + right.height)
      - Math.max(left.y, right.y) > structuredAnswerRegionTolerance
}

function blockReferencesMedia(block, mediaId) {
  if (block.kind === 'figure') return block.mediaId === mediaId
  return block.kind === 'table' && Array.isArray(block.rows) && block.rows.some(row =>
    Array.isArray(row?.cells) && row.cells.some(cell =>
      Array.isArray(cell?.content) && cell.content.some(node =>
        node?.kind === 'media_ref' && node.mediaId === mediaId)))
}

function validateSourceCoverage(sourceCoverage, groups, media, documents, issues, allowStructuredAnswerRegion = false) {
  if (!isRecordValue(sourceCoverage) || !exactKeys(sourceCoverage, [
    'documentId', 'reviewedPages', 'visuals',
  ])) {
    issues.push(issue('MATERIALIZATION_SOURCE_COVERAGE_INVALID', '$.sourceCoverage', 'Source coverage must close one immutable question-paper page and visual inventory'))
    return null
  }
  const document = documents.get(sourceCoverage.documentId)
  const expectedPages = document
    ? Array.from({ length: document.pageCount }, (_, index) => index + 1)
    : []
  if (
    !['question_source', 'question_and_answers'].includes(document?.role)
    || ![
      'application/pdf',
      'application/vnd.eqb.nck1-image-source-bundle+json',
    ].includes(document.mediaType)
    || !Array.isArray(sourceCoverage.reviewedPages)
    || sourceCoverage.reviewedPages.length !== expectedPages.length
    || sourceCoverage.reviewedPages.some((page, index) => page !== expectedPages[index])
  ) {
    issues.push(issue('MATERIALIZATION_SOURCE_PAGE_COVERAGE_INCOMPLETE', '$.sourceCoverage.reviewedPages', 'Every page of one immutable question-bearing paged source must be reviewed exactly once in order'))
  }
  const blocks = groups.flatMap(group => nestedBlocks(group.blocks))
  const tableIds = new Set(blocks.filter(block => block.kind === 'table').map(block => block.blockId))
  const mediaIds = new Set(media.filter((item) => item?.usage === 'content').map((item) => item.mediaId))
  const groupsById = new Map(groups.map(group => [group.groupId, group]))
  const expectedTargets = new Set([...tableIds, ...mediaIds])
  const seenVisualIds = new Set()
  const seenTargets = new Set()
  if (!Array.isArray(sourceCoverage.visuals)) {
    issues.push(issue('MATERIALIZATION_SOURCE_VISUAL_INVENTORY_INVALID', '$.sourceCoverage.visuals', 'Visual inventory must be an array, including an empty array when no visuals exist'))
    return sourceCoverage
  }
  for (const [index, visual] of sourceCoverage.visuals.entries()) {
    const path = `$.sourceCoverage.visuals[${index}]`
    const visualKeys = visual?.region === undefined
      ? ['visualId', 'page', 'disposition', 'targetId']
      : ['visualId', 'page', 'region', 'disposition', 'targetId']
    if (
      !isRecordValue(visual)
      || !exactKeys(visual, visualKeys)
      || !nonEmptyString(visual.visualId)
      || seenVisualIds.has(visual.visualId)
      || !Number.isInteger(visual.page)
      || visual.page < 1
      || visual.page > (document?.pageCount || 0)
      || !['semantic_table', 'content_media', 'furniture',
        ...(allowStructuredAnswerRegion ? ['structured_answer_region'] : [])].includes(visual.disposition)
      || (visual.disposition === 'furniture'
        ? visual.targetId !== null
        : !nonEmptyString(visual.targetId))
    ) {
      issues.push(issue('MATERIALIZATION_SOURCE_VISUAL_INVALID', path, 'Each detected visual needs unique identity, source page, disposition, and content target'))
      continue
    }
    if (visual.region !== undefined) {
      validateRegion(
        visual.region,
        `${path}.region`,
        issues,
        'MATERIALIZATION_SOURCE_VISUAL_REGION_INVALID',
      )
    }
    seenVisualIds.add(visual.visualId)
    if (visual.disposition === 'structured_answer_region') {
      const group = groupsById.get(visual.targetId)
      const drawingSource = group?.writingTask?.drawingArea?.source
      if (group?.family !== 'application-writing' || group.writingTask?.taskType !== 'application'
        || drawingSource?.kind !== 'page_region'
        || drawingSource.documentId !== sourceCoverage.documentId
        || drawingSource.page !== visual.page
        || !regionContains(visual.region, drawingSource.region)) {
        issues.push(issue('MATERIALIZATION_SOURCE_VISUAL_TARGET_INVALID', `${path}.targetId`,
          'Structured answer visual must bind an application group with a drawing area inside the same source document/page/region'))
      }
      const sourceOverlaps = source => source?.kind === 'page_region'
        && source.documentId === sourceCoverage.documentId && source.page === visual.page
        && regionsOverlap(visual.region, source.region)
      const conflictingMedia = media.some(item => {
        if (item?.usage !== 'content') return false
        const crop = item?.extraction
        return (crop?.kind === 'pdf_crop' && sourceOverlaps({ ...crop, kind: 'page_region' }))
          || sourceCoverage.visuals.some(candidate =>
            candidate?.disposition === 'content_media' && candidate.targetId === item.mediaId
            && candidate.page === visual.page && regionsOverlap(visual.region, candidate.region))
          || blocks.some(block => blockReferencesMedia(block, item.mediaId) && sourceOverlaps(block.source))
      })
      if (conflictingMedia) issues.push(issue('MATERIALIZATION_SOURCE_VISUAL_CONTENT_CONFLICT', path,
        'A structured answer visual cannot also be consumed by overlapping content media'))
    }
    if (visual.targetId !== null) {
      if (seenTargets.has(visual.targetId)) {
        issues.push(issue('MATERIALIZATION_SOURCE_VISUAL_TARGET_DUPLICATE', `${path}.targetId`, 'Each semantic table, content media or structured answer group may be inventoried only once'))
      }
      seenTargets.add(visual.targetId)
      const validTarget = visual.disposition === 'semantic_table'
        ? tableIds.has(visual.targetId)
        : visual.disposition === 'structured_answer_region'
          ? groupsById.has(visual.targetId)
          : mediaIds.has(visual.targetId)
      if (!validTarget) issues.push(issue('MATERIALIZATION_SOURCE_VISUAL_TARGET_INVALID', `${path}.targetId`, 'Visual disposition must bind its exact semantic table or content media target'))
    }
  }
  for (const targetId of expectedTargets) {
    if (!seenTargets.has(targetId)) issues.push(issue('MATERIALIZATION_SOURCE_VISUAL_TARGET_MISSING', '$.sourceCoverage.visuals', `Source content target ${targetId} is absent from the closed visual inventory`))
  }
  return sourceCoverage
}

function validateListening(listening, documents, sourceCoverage, issues) {
  if (!isRecordValue(listening) || typeof listening.state !== 'string') {
    issues.push(issue('MATERIALIZATION_LISTENING_INVALID', '$.listening', 'Listening must be captured or explicitly not supplied'))
    return
  }
  if (listening.state === 'not_supplied') {
    if (packageSourceSets.has(documents)) {
      if (!exactKeys(listening, ['state', 'evidence'])
        || !isRecordValue(listening.evidence)
        || !exactKeys(listening.evidence, ['kind', 'documentId'])
        || listening.evidence.kind !== 'package_declares_no_listening_content'
        || listening.evidence.documentId !== packageSourceSets.get(documents)) {
        issues.push(issue('PACKAGE_CONTENT_LISTENING_ABSENCE_INVALID', '$.listening.evidence', 'Package absence is a declaration bound to its content member, not a reviewed original page'))
      }
      return
    }
    if (
      !exactKeys(listening, ['state', 'evidence'])
      || !isRecordValue(listening.evidence)
      || !exactKeys(listening.evidence, ['kind', 'documentId'])
      || listening.evidence.kind !== 'question_source_reviewed_no_listening_content'
      || listening.evidence.documentId !== sourceCoverage?.documentId
    ) {
      issues.push(issue('MATERIALIZATION_LISTENING_ABSENCE_EVIDENCE_INVALID', '$.listening.evidence', 'not_supplied Listening must bind to the fully reviewed immutable question source'))
    }
    return
  }
  if (
    listening.state !== 'captured'
    || !exactKeys(listening, ['state', 'questions', 'answers', 'transcript', 'timing'])
    || !Array.isArray(listening.questions)
    || listening.questions.length !== 20
    || !Array.isArray(listening.answers)
    || listening.answers.length !== 20
    || !Array.isArray(listening.transcript)
    || listening.transcript.length === 0
    || !Array.isArray(listening.timing)
  ) {
    issues.push(issue('MATERIALIZATION_LISTENING_INCOMPLETE', '$.listening', 'Captured Listening needs 20 questions, 20 official answers, and transcript source'))
    return
  }
  for (let index = 0; index < 20; index += 1) {
    const number = index + 1
    const question = listening.questions[index]
    const answer = listening.answers[index]
    if (
      !isRecordValue(question)
      || !exactKeys(question, ['canonicalNumber', 'stem', 'options', 'source'])
      || question.canonicalNumber !== number
      || !nonEmptyString(question.stem)
      || question.stem.length > 160
    ) {
      issues.push(issue('MATERIALIZATION_LISTENING_QUESTION_INVALID', `$.listening.questions[${index}]`, `Listening question ${number} is incomplete or crosses a source boundary`))
    } else {
      validateOptions(question.options, ['A', 'B', 'C'], `$.listening.questions[${index}].options`, issues)
      validateLocator(question.source, `$.listening.questions[${index}].source`, documents, issues)
    }
    if (
      !isRecordValue(answer)
      || !exactKeys(answer, ['canonicalNumber', 'value', 'authority'])
      || answer.canonicalNumber !== number
      || !['A', 'B', 'C'].includes(answer.value)
    ) {
      issues.push(issue('MATERIALIZATION_LISTENING_ANSWER_INVALID', `$.listening.answers[${index}]`, `Listening answer ${number} is incomplete`))
    } else {
      validateLocator(answer.authority, `$.listening.answers[${index}].authority`, documents, issues)
    }
  }
  const transcriptIds = new Set()
  const transcriptQuestionNumbers = []
  for (const [index, segment] of listening.transcript.entries()) {
    if (
      !isRecordValue(segment)
      || !exactKeys(segment, ['segmentId', 'text', 'questionNumbers', 'source'])
      || !nonEmptyString(segment.segmentId)
      || transcriptIds.has(segment.segmentId)
      || !nonEmptyString(segment.text)
      || !Array.isArray(segment.questionNumbers)
      || segment.questionNumbers.length === 0
      || segment.questionNumbers.some((number) =>
        !Number.isInteger(number) || number < 1 || number > 20)
    ) {
      issues.push(issue('MATERIALIZATION_LISTENING_TRANSCRIPT_INVALID', `$.listening.transcript[${index}]`, 'Transcript segments preserve unique identity, source text, and covered Questions'))
    } else {
      transcriptIds.add(segment.segmentId)
      transcriptQuestionNumbers.push(...segment.questionNumbers)
      validateLocator(segment.source, `$.listening.transcript[${index}].source`, documents, issues)
    }
  }
  const shortSegments = listening.transcript.filter((segment) =>
    segment?.questionNumbers?.some((number) => number <= 5))
  const longSegments = listening.transcript.filter((segment) =>
    segment?.questionNumbers?.some((number) => number >= 6))
  if (
    shortSegments.length !== 5
    || shortSegments.some((segment) =>
      segment.questionNumbers.length !== 1 || segment.questionNumbers[0] > 5)
    || longSegments.length !== 5
    || listening.transcript.some((segment) =>
      segment?.questionNumbers?.some((number) => number <= 5)
      && segment.questionNumbers.some((number) => number >= 6))
    || transcriptQuestionNumbers.length !== 20
    || new Set(transcriptQuestionNumbers).size !== 20
  ) {
    issues.push(issue('MATERIALIZATION_LISTENING_TRANSCRIPT_COVERAGE_INVALID', '$.listening.transcript', 'NCK1 transcript requires five short and five long source segments covering Questions 1-20 exactly once'))
  }
  const playbackMarkers = listening.timing.filter((entry) => entry?.kind === 'section1_playback')
  if (playbackMarkers.length > 1 || playbackMarkers.some((entry) =>
    !isRecordValue(entry)
    || !exactKeys(entry, ['kind', 'passes', 'source'])
    || entry.passes !== 1)) {
    issues.push(issue('MATERIALIZATION_LISTENING_PLAYBACK_INVALID', '$.listening.timing', 'Only an explicitly source-bound one-pass first-section marker may override the two-pass display default'))
  } else if (playbackMarkers[0]) {
    validateLocator(playbackMarkers[0].source, '$.listening.timing.section1_playback.source', documents, issues)
  }
}

export function validateNck1SourceMaterialization(value) {
  if (value?.schemaVersion === 'nck1-source-materialization-v11') {
    const legacy = { ...value, schemaVersion: Object.hasOwn(value, 'listeningSourceDecision')
      ? 'nck1-source-materialization-v10' : Object.hasOwn(value, 'inImageOptionLabels')
        ? 'nck1-source-materialization-v9' : Object.hasOwn(value, 'paragraphJoins')
          ? 'nck1-source-materialization-v8' : 'nck1-source-materialization-v7' }
    return validateNck1SourceMaterialization(legacy)
  }
  if (value?.schemaVersion === 'nck1-source-materialization-v10') {
    const { listeningSourceDecision, ...legacy } = value
    legacy.schemaVersion = Object.hasOwn(legacy, 'inImageOptionLabels')
      ? 'nck1-source-materialization-v9'
      : Object.hasOwn(legacy, 'paragraphJoins')
        ? 'nck1-source-materialization-v8' : 'nck1-source-materialization-v7'
    const issues = validateNck1SourceMaterialization(legacy)
    try { validateListeningSourceDecision(listeningSourceDecision) }
    catch (error) { issues.push(issue('MATERIALIZATION_LISTENING_SOURCE_DECISION_INVALID', '$.listeningSourceDecision', error.message)) }
    return issues
  }
  const issues = []
  if (
    !isRecordValue(value)
    || !exactKeys(value, [
      'schemaVersion',
      ...((value.schemaVersion === NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8
        || (value.schemaVersion === NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9 && Object.hasOwn(value, 'paragraphJoins'))) ? ['paragraphJoins'] : []),
      ...(value.schemaVersion === NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9 ? ['inImageOptionLabels'] : []),
      'paperId',
      'profileId',
      'documents',
      'groups',
      'answers',
      'media',
      'sourceCoverage',
      'listening',
      'issues',
      ...([NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V4, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V5, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V6, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V7, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9].includes(value.schemaVersion) && (![NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V7, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9].includes(value.schemaVersion) || Object.hasOwn(value, 'sourcePresentation')) ? ['sourcePresentation'] : []),
    ])
    || ![
      NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION,
      NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V2,
      NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V3,
      NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V4,
      NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V5,
      NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V6,
      NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V7,
      NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8,
      NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9,
    ].includes(value.schemaVersion)
    || !/^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.paperId || '')
    || value.profileId !== 'nck1'
  ) {
    return [issue('MATERIALIZATION_ROOT_INVALID', '$', 'Materialization root is closed and bound to one NCK1 paper')]
  }
  if (!Array.isArray(value.issues) || value.issues.length > 0) {
    issues.push(issue('MATERIALIZATION_UNRESOLVED_ISSUES', '$.issues', 'Source issues must be resolved before candidate derivation'))
  }
  const documents = new Map()
  if (!Array.isArray(value.documents) || value.documents.length === 0) {
    issues.push(issue('MATERIALIZATION_DOCUMENTS_EMPTY', '$.documents', 'At least one immutable source document is required'))
  } else {
    for (const [index, document] of value.documents.entries()) {
      const path = `$.documents[${index}]`
      if (
        !isRecordValue(document)
        || !exactKeys(document, ['documentId', 'role', 'mediaType', 'sha256', 'byteLength', 'pageCount'])
        || !idPattern.test(document.documentId || '')
        || documents.has(document.documentId)
        || !['question_source', 'official_answers', 'question_and_answers'].includes(document.role)
        || ![
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.eqb.nck1-image-source-bundle+json',
        ].includes(document.mediaType)
        || !digestPattern.test(document.sha256 || '')
        || !Number.isInteger(document.byteLength)
        || document.byteLength < 1
        || !Number.isInteger(document.pageCount)
        || document.pageCount < 1
      ) {
        issues.push(issue('MATERIALIZATION_DOCUMENT_INVALID', path, 'Source documents need immutable identity, role, digest, bytes, and rendered page count'))
        continue
      }
      documents.set(document.documentId, document)
    }
  }
  if ([NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V4, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V5, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V6, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V7, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9].includes(value.schemaVersion)
    && (![NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V7, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9].includes(value.schemaVersion) || Object.hasOwn(value, 'sourcePresentation'))) {
    const presentation = value.sourcePresentation
    const required = Object.keys(SOURCE_INSTRUCTION_SLOTS).filter(slot =>
      !slot.startsWith('listening.') || value.listening?.state !== 'not_supplied')
    const boundToQuestion = (source, path) => {
      validateLocator(source, path, documents, issues)
      if (!['question_source', 'question_and_answers'].includes(documents.get(source?.documentId)?.role)) {
        issues.push(issue('MATERIALIZATION_SOURCE_PRESENTATION_INVALID', path, 'Instruction and example evidence must bind the question-bearing source'))
      }
    }
    if (!isRecordValue(presentation) || !exactKeys(presentation, ['instructions', 'listeningExample'])
      || !Array.isArray(presentation.instructions) || presentation.instructions.length !== required.length
      || new Set(presentation.instructions.map(item => item?.slotId)).size !== required.length) {
      issues.push(issue('MATERIALIZATION_SOURCE_PRESENTATION_INVALID', '$.sourcePresentation', 'All active source instructions require exact, unique slot coverage'))
    } else {
      for (const [index, entry] of presentation.instructions.entries()) {
        const path = `$.sourcePresentation.instructions[${index}]`
        if (!isRecordValue(entry) || !exactKeys(entry, ['slotId', 'text', 'source'])
          || !required.includes(entry.slotId) || !nonEmptyString(entry.text)) {
          issues.push(issue('MATERIALIZATION_SOURCE_PRESENTATION_INVALID', path, 'Source instruction needs an active slot, exact text and locator'))
        } else boundToQuestion(entry.source, `${path}.source`)
      }
      if (value.listening?.state === 'not_supplied') {
        if (presentation.listeningExample !== null) issues.push(issue('MATERIALIZATION_SOURCE_PRESENTATION_INVALID', '$.sourcePresentation.listeningExample', 'Inactive listening cannot supply an example'))
      } else if (!validSourceExample(presentation.listeningExample, 'source')) {
        issues.push(issue('MATERIALIZATION_SOURCE_PRESENTATION_INVALID', '$.sourcePresentation.listeningExample', 'Listening example requires source-backed content or explicit source-backed absence'))
      } else boundToQuestion(presentation.listeningExample.source, '$.sourcePresentation.listeningExample.source')
    }
  }
  const mediaReferences = []
  const { questionIds } = validateGroups(value.groups, documents, mediaReferences, issues,
    [NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V3, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V4, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V5, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V6, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V7, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9].includes(value.schemaVersion),
    [NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V5, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V6, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V7, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9].includes(value.schemaVersion),
    [NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V6, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V7, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9].includes(value.schemaVersion),
    [NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V7, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9].includes(value.schemaVersion))
  validateAnswers(value.answers, questionIds, documents, issues)
  validateMedia(value.media, documents, mediaReferences, value.schemaVersion, issues)
  for (const group of Array.isArray(value.groups) ? value.groups : []) {
    for (const question of Array.isArray(group?.questions) ? group.questions : []) {
      for (const figure of Array.isArray(question?.stemFigures) ? question.stemFigures : []) {
        const media = (Array.isArray(value.media) ? value.media : []).find(item => item?.mediaId === figure?.mediaId)
        const crop = media?.extraction
        if (media?.kind !== 'figure' || crop?.kind !== 'pdf_crop'
          || !isRecordValue(figure.source?.region) || !isRecordValue(crop.region)
          || crop.documentId !== figure.source?.documentId || crop.page !== figure.source?.page
          || digestJson(crop.region) !== digestJson(figure.source?.region)) {
          issues.push(issue('MATERIALIZATION_STEM_FIGURE_CROP_INVALID', '$.groups', 'Stem figure locator must equal its exact PDF crop'))
        }
      }
      if (question?.figureLayout && !validateReadingFigureLayout(
        question.figureLayout, question.questionId, question.options,
        documents.get(question.source?.documentId)?.sha256,
        question.source, Array.isArray(value.media) ? value.media : [],
      )) {
        issues.push(issue('MATERIALIZATION_FIGURE_SOURCE_BINDING_INVALID', '$.groups', 'Measured options must bind the exact source page, media bytes and PDF crop geometry'))
      }
    }
  }
  const sourceCoverage = validateSourceCoverage(value.sourceCoverage, value.groups, value.media, documents, issues,
    [NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V5, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V6, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V7, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9].includes(value.schemaVersion))
  validateListening(value.listening, documents, sourceCoverage, issues)
  if ([NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V8, NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9].includes(value.schemaVersion)) {
    try { resolveCrossPageParagraphJoins(value) }
    catch (error) { issues.push(issue('MATERIALIZATION_PARAGRAPH_JOIN_INVALID', '$.paragraphJoins', error.message)) }
  }
  if (value.schemaVersion === NCK1_SOURCE_MATERIALIZATION_SCHEMA_VERSION_V9) {
    try { resolveInImageOptionLabels(value) }
    catch (error) { issues.push(issue('MATERIALIZATION_IN_IMAGE_OPTION_LABELS_INVALID', '$.inImageOptionLabels', error.message)) }
  }
  return issues
}

// Reuses the same group/block/notice/answer/media/listening semantics without
// manufacturing PDF descriptors, page coverage, crops, or extraction locators.
// Exact JSON-pointer value and byte binding is the source adapter's next gate.
export function validateNck1AnalyzedPackageContent(value, members, contentMemberId) {
  const issues = []
  if (!isRecordValue(value)
    || !exactKeys(value, ['schemaVersion', 'paperId', 'profileId', 'groups', 'answers', 'media', 'listening', 'issues'])
    || value.schemaVersion !== 'nck1-analyzed-package-content-v1'
    || !/^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.paperId || '')
    || value.profileId !== 'nck1') {
    return [issue('PACKAGE_CONTENT_ROOT_INVALID', '$', 'Package content is closed; original document/page-coverage declarations are not its evidence')]
  }
  if (!Array.isArray(value.issues) || value.issues.length) {
    issues.push(issue('MATERIALIZATION_UNRESOLVED_ISSUES', '$.issues', 'Source issues must be resolved before candidate derivation'))
  }
  const documents = new Map(members.map((member) => [member.memberId, member]))
  packageSourceSets.set(documents, contentMemberId)
  const mediaReferences = []
  const { questionIds } = validateGroups(value.groups, documents, mediaReferences, issues, true)
  validateAnswers(value.answers, questionIds, documents, issues)
  validateMedia(value.media, documents, mediaReferences, value.schemaVersion, issues)
  for (const group of Array.isArray(value.groups) ? value.groups : []) {
    for (const question of Array.isArray(group?.questions) ? group.questions : []) {
      if (question?.figureLayout) {
        issues.push(issue('PACKAGE_CONTENT_MEASURED_LAYOUT_UNSUPPORTED', '$.groups', 'Package content cannot assert measured original-PDF geometry'))
      }
    }
  }
  validateListening(value.listening, documents, null, issues)
  return issues
}

export function digestNck1SourceMaterialization(value) {
  const issues = validateNck1SourceMaterialization(value)
  if (issues.length > 0) {
    const error = new Error(issues[0].message)
    error.code = issues[0].code
    error.issues = issues
    throw error
  }
  return digestJson(value)
}

export function assertNck1SourceMaterialization(value) {
  digestNck1SourceMaterialization(value)
  return value
}
