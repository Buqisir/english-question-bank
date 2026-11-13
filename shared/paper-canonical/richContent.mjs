import { exactKeys, isRecordValue, sha256 } from './stable.mjs'
import { isBase64String } from './base64.mjs'

// Optional source-backed table presentation; absence preserves historical output.
export function validTableColumnWidths(block) {
  if (!Object.hasOwn(block, 'columnWidths')) return true
  return Array.isArray(block.columnWidths) && block.columnWidths.length === block.columnCount
    && block.columnWidths.every(width => Number.isFinite(width) && width > 0)
    && Number.isFinite(block.columnWidths.reduce((sum, width) => sum + width, 0))
}

export function validTableMarks(marks) {
  return Array.isArray(marks) && marks.length > 0
    && new Set(marks).size === marks.length
    && marks.every(mark => ['bold', 'italic', 'underline'].includes(mark))
}

export const FRAMED_COLUMNS_KIND = 'framed_columns'
export const FRAMED_COLUMNS_COLUMN_COUNT = 2
export const FRAMED_COLUMNS_CHILD_KINDS = Object.freeze(['paragraph', 'table'])
export const TOP_LEVEL_RICH_BLOCK_KINDS = Object.freeze([
  'paragraph',
  'table',
  'figure',
  FRAMED_COLUMNS_KIND,
])

export function isFramedColumnsBlock(block) {
  return block?.kind === FRAMED_COLUMNS_KIND
}

export function framedColumnsColumnExpectedKeys(column) {
  return isRecordValue(column) && Object.hasOwn(column, 'columnHeading')
    ? ['columnId', 'columnHeading', 'blocks']
    : ['columnId', 'blocks']
}

export function richBlockInlineSets(block) {
  if (!isRecordValue(block)) return []
  if (block.kind === 'table') {
    return (block.rows || []).flatMap((row) => (row.cells || []).map((cell) => cell.inlines))
  }
  if (block.kind === 'figure') return [block.caption]
  if (block.kind === FRAMED_COLUMNS_KIND) return []
  return [block.inlines]
}

export function visitRichBlocks(blocks, visit, context = {
  path: '$.content.blocks',
  parentKind: null,
}) {
  for (const [index, block] of (Array.isArray(blocks) ? blocks : []).entries()) {
    const path = `${context.path}[${index}]`
    visit(block, { ...context, path, index })
    if (!isFramedColumnsBlock(block)) continue
    for (const [columnIndex, column] of (block.columns || []).entries()) {
      visitRichBlocks(column?.blocks, visit, {
        path: `${path}.columns[${columnIndex}].blocks`,
        parentKind: FRAMED_COLUMNS_KIND,
        framedColumns: block,
        column,
        columnIndex,
      })
    }
  }
}

export function forEachRichInline(content, visit) {
  visitRichBlocks(content?.blocks, (block) => {
    for (const inlines of richBlockInlineSets(block)) {
      for (const inline of inlines || []) visit(inline, block)
    }
  })
}

export function collectRichContentTargets(content) {
  const targets = []
  const addInlines = (inlines) => {
    for (const inline of inlines || []) {
      targets.push({
        kind: inline.kind === 'blank_ref' ? 'blank' : 'content_node',
        id: inline.kind === 'blank_ref' ? inline.blankId : inline.nodeId,
      })
    }
  }
  const walk = (blocks) => {
    for (const block of blocks || []) {
      targets.push({ kind: 'content_node', id: block.nodeId })
      if (block.kind === 'table') {
        for (const row of block.rows || []) {
          targets.push({ kind: 'content_node', id: row.rowId })
          for (const cell of row.cells || []) {
            targets.push({ kind: 'content_node', id: cell.cellId })
            addInlines(cell.inlines)
          }
        }
        continue
      }
      if (block.kind === 'figure') {
        addInlines(block.caption)
        continue
      }
      if (block.kind === FRAMED_COLUMNS_KIND) {
        for (const column of block.columns || []) {
          if (typeof column?.columnId === 'string') {
            targets.push({ kind: 'content_node', id: column.columnId })
          }
          walk(column.blocks)
        }
        continue
      }
      addInlines(block.inlines)
    }
  }
  walk(content?.blocks)
  return targets
}

export function collectRichContentTargetValues(content) {
  const targets = new Map()
  let duplicate = false
  const add = (id, value) => {
    if (typeof id !== 'string') return
    const targetKey = `content_node:${id}`
    if (targets.has(targetKey)) duplicate = true
    targets.set(targetKey, value)
  }
  const addInlines = (inlines) => {
    for (const inline of inlines || []) add(inline?.nodeId, inline)
  }
  const walk = (blocks) => {
    for (const block of blocks || []) {
      add(block?.nodeId, block)
      if (block?.kind === 'table') {
        for (const row of block.rows || []) {
          add(row?.rowId, row)
          for (const cell of row.cells || []) {
            add(cell?.cellId, cell)
            addInlines(cell?.inlines)
          }
        }
        continue
      }
      if (block?.kind === FRAMED_COLUMNS_KIND) {
        for (const column of block.columns || []) {
          add(column?.columnId, column)
          walk(column.blocks)
        }
        continue
      }
      addInlines(block?.kind === 'figure' ? block.caption : block?.inlines)
    }
  }
  walk(content?.blocks)
  return { targets, duplicate }
}

export function contentHasFramedColumns(content) {
  return (content?.blocks || []).some((block) => isFramedColumnsBlock(block))
}

export function someRichBlocks(blocks, predicate) {
  return (blocks || []).some((block) => {
    if (predicate(block)) return true
    if (!isFramedColumnsBlock(block)) return false
    return (block.columns || []).some((column) => someRichBlocks(column?.blocks, predicate))
  })
}

export function readingCaptureHasUnregisteredBlock(blocks, {
  allowFramedColumns = true,
  allowFigure = true,
} = {}) {
  return (blocks || []).some((block) => {
    if (!block?.kind) return true
    if (block.kind === FRAMED_COLUMNS_KIND) {
      return !allowFramedColumns
        || (block.columns || []).some((column) => readingCaptureHasUnregisteredBlock(
          column?.blocks,
          { allowFramedColumns: false, allowFigure: false },
        ))
    }
    if (block.kind === 'figure') return !allowFigure
    return !['paragraph', 'table'].includes(block.kind)
  })
}

export function isQuestionLikeRichBlock(block) {
  return isRecordValue(block)
    && (block.kind === 'question' || typeof block.questionId === 'string')
}

export function framedColumnsHeadingBlock(column) {
  if (!isRecordValue(column) || typeof column.columnHeading !== 'string') return null
  return (column.blocks || []).find((block) => block?.nodeId === column.columnHeading) || null
}

export function exactFramedColumnsColumn(column) {
  return isRecordValue(column)
    && exactKeys(column, framedColumnsColumnExpectedKeys(column))
    && typeof column.columnId === 'string'
    && Array.isArray(column.blocks)
    && column.blocks.length > 0
    && (
      !Object.hasOwn(column, 'columnHeading')
      || typeof column.columnHeading === 'string'
    )
}

export function exactFramedColumnsBlock(block) {
  return isRecordValue(block)
    && exactKeys(block, ['kind', 'nodeId', 'columnCount', 'columns'])
    && block.kind === FRAMED_COLUMNS_KIND
    && typeof block.nodeId === 'string'
    && block.columnCount === FRAMED_COLUMNS_COLUMN_COUNT
    && Array.isArray(block.columns)
    && block.columns.length === FRAMED_COLUMNS_COLUMN_COUNT
    && block.columns.every((column) => exactFramedColumnsColumn(column))
}

/** A display rendition supplements, and never replaces, the captured source. */
export function validDisplayVariant(value) {
  return isRecordValue(value)
    && exactKeys(value, ['path', 'sha256', 'byteLength', 'generator', 'textCheck'])
    && typeof value.path === 'string'
    && /^materialization\/media\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:png|jpe?g|webp)$/.test(value.path)
    && !value.path.includes('..')
    && /^sha256:[a-f0-9]{64}$/.test(value.sha256)
    && Number.isSafeInteger(value.byteLength) && value.byteLength > 0
    && value.generator === 'codex-cli' && value.textCheck === 'verified'
}

export function displayVariantArtifact(media, documents) {
  if (!media.displayVariant) return undefined
  const variant = media.displayVariant
  const { mimeType, pixelWidth, pixelHeight, sourceArtifactRef, ...declaration } = variant
  if (!validDisplayVariant(declaration) || !/^image\/(?:png|jpeg|webp)$/.test(mimeType)
    || !Number.isInteger(pixelWidth) || pixelWidth < 1 || !Number.isInteger(pixelHeight) || pixelHeight < 1
    || !exactKeys(sourceArtifactRef, ['artifactId'])) throw new Error('Invalid display variant declaration')
  const document = documents.get(variant.sourceArtifactRef?.artifactId)
  const bytes = isBase64String(document?.encodedBytes)
    ? Uint8Array.from(atob(document.encodedBytes), character => character.charCodeAt(0)) : null
  if (!document || !bytes || document.sha256 !== variant.sha256
    || (document.mediaType ?? document.mimeType) !== variant.mimeType || bytes.byteLength !== variant.byteLength
    || sha256(bytes) !== variant.sha256) throw new Error('Display variant does not close immutable bytes')
  return { ...structuredClone(variant), encodedBytes: document.encodedBytes }
}
