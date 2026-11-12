import { digestJson, exactKeys, isRecordValue } from '../../shared/paper-canonical/stable.mjs'

function reject(message) { throw new Error(message) }

// Rows contain only anchor cells; merges use logical, zero-based grid positions.
export function semanticTableGrid({ rows, merges }) {
  if (!Array.isArray(rows) || !rows.length || rows.some(row =>
    !isRecordValue(row) || !exactKeys(row, ['header', 'cells'])
    || typeof row.header !== 'boolean' || !Array.isArray(row.cells)
    || row.cells.some(cell => !Array.isArray(cell))
    || (row.cells.length > 0 && row.cells.every(cell => !cell.length))
    || (merges === undefined && (!row.cells.length || row.cells.length !== rows[0].cells.length)))) {
    reject('OCR tables require explicit rows of confirmed item IDs')
  }
  if (merges !== undefined && !Array.isArray(merges)) reject('Table merges must be an array')
  const anchors = new Map()
  for (const merge of merges || []) {
    if (!isRecordValue(merge) || !exactKeys(merge, ['row', 'column', 'rowSpan', 'columnSpan'])
      || !Object.values(merge).every(Number.isSafeInteger)
      || merge.row < 0 || merge.column < 0 || merge.rowSpan < 1 || merge.columnSpan < 1
      || merge.row + merge.rowSpan > rows.length || anchors.has(`${merge.row}:${merge.column}`)) {
      reject('Invalid or duplicate table merge anchor')
    }
    anchors.set(`${merge.row}:${merge.column}`, merge)
  }
  const occupied = rows.map(() => new Set())
  const used = new Set()
  let columnCount = 0
  const geometry = rows.map((row, r) => {
    let column = 0
    const cells = row.cells.map(() => {
      while (occupied[r].has(column)) column++
      const key = `${r}:${column}`, merge = anchors.get(key)
      if (merge) used.add(key)
      const columnSpan = merge?.columnSpan ?? 1, rowSpan = merge?.rowSpan ?? 1
      if (r && column + columnSpan > columnCount) reject('Table cell exceeds the declared grid')
      for (let y = r; y < r + rowSpan; y++) for (let x = column; x < column + columnSpan; x++) {
        if (occupied[y].has(x)) reject('Table cells overlap')
        occupied[y].add(x)
      }
      const cell = { columnStart: column, columnSpan, rowSpan }
      column += columnSpan
      return cell
    })
    if (!r) columnCount = column
    if (!columnCount || occupied[r].size !== columnCount) reject('Table grid has uncovered positions')
    return cells
  })
  if (used.size !== anchors.size) reject('Table merge anchor must be an actual cell')
  return { columnCount, geometry }
}

function contains(outer, inner) {
  return inner.x >= outer.x - 0.000001 && inner.y >= outer.y - 0.000001
    && inner.x + inner.width <= outer.x + outer.width + 0.000001
    && inner.y + inner.height <= outer.y + outer.height + 0.000001
}

// Confirmation v3 describes layout using existing confirmed item identities,
// never a second transcription. The caller already verified each item and the
// immutable page raster. Returning a replacement does not approve a Candidate.
export function resolveOcrContentVisual({ paperId, document, page, visual, region, claimedItems }) {
  const table = visual.classification === 'semantic_table'
  const image = visual.classification === 'content_media'
  if (!isRecordValue(visual) || !(table || image)
    || !exactKeys(visual, table
      ? ['regionId', 'classification', 'rows', ...(Object.hasOwn(visual, 'merges') ? ['merges'] : [])]
      : ['regionId', 'classification', 'itemIds', 'afterItemId'])) {
    reject('Content visual requires a closed table or source-image placement')
  }
  if (image && (!['question_source', 'official_answers'].includes(document.role) || document.mediaType !== 'application/pdf')) {
    reject('Content images require a separate PDF question source or official_answers reference source with a replayable crop')
  }
  if (table && document.role === 'question_and_answers') {
    reject('Content tables currently require separate question/answer sources to keep scoring out of student content')
  }
  if (table && Object.hasOwn(visual, 'merges') && document.role !== 'question_source') {
    reject('评分/答案表暂不支持合并单元格，请拆成普通表或按图片处理')
  }
  const grid = table ? semanticTableGrid(visual) : null
  const ids = table ? visual.rows.flatMap(row => row.cells.flat()) : visual.itemIds
  const items = new Map(page.orderedItems.map((item, index) => [item.itemId, { item, index }]))
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length
    || ids.some(id => !items.has(id) || claimedItems.has(id))) {
    reject('Content visuals require unique, unclaimed confirmed items on the same page')
  }
  const indexes = ids.map(id => items.get(id).index)
  if (indexes.some((index, i) => i > 0 && index !== indexes[i - 1] + 1)) {
    reject('Content visual items must occupy one consecutive source-order range')
  }
  // v3's explicit null boundary is question-source-only. Missing/unknown
  // string anchors never fall back to the beginning of this or another page.
  const pageTop = image && visual.afterItemId === null
  if (pageTop && (document.role !== 'question_source'
    || (indexes.length && indexes[0] !== 0)
    || page.visualClassifications.filter(value =>
      value.classification === 'content_media' && value.afterItemId === null).length !== 1)) {
    reject('A page-top image requires the unique question-source boundary before all page content')
  }
  if (image && !pageTop && (typeof visual.afterItemId !== 'string'
    || !items.has(visual.afterItemId) || ids.includes(visual.afterItemId)
    || (indexes.length && indexes[0] !== items.get(visual.afterItemId).index + 1))) {
    reject('An image must follow an exact surviving item immediately before its text range')
  }
  const observations = new Map(page.observations.map(item => [item.observationId, item]))
  const selected = new Set(ids.flatMap(id => items.get(id).item.observationIds))
  if ([...selected].some(id => !observations.has(id)
    || !contains(region.region, observations.get(id).region))) {
    reject('Visual text observations must lie within the classified source region')
  }
  // The page validator already requires disjoint content/furniture claims.
  // A confirmed watermark remains in the source, but is not table-cell text.
  const furniture = new Set(page.furnitureObservationIds)
  if (pageTop && page.observations.some(observation =>
    !selected.has(observation.observationId) && !furniture.has(observation.observationId)
    && observation.region.y < region.region.y + region.region.height - 0.000001)) {
    reject('A page-top image cannot precede unexplained content above or beside its crop')
  }
  if (page.observations.some(observation => contains(region.region, observation.region)
    && !selected.has(observation.observationId) && !furniture.has(observation.observationId))) {
    reject('Every text observation inside a content visual must be accounted for')
  }
  if (ids.some(id => items.get(id).item.sourceEmphasis)) {
    reject('Emphasized visual text requires explicit cell-level support, not silent flattening')
  }
  const source = { kind: 'page_region', documentId: document.documentId,
    page: page.page, region: structuredClone(region.region) }
  const suffix = `ocr-${digestJson([document.documentId, page.page, region.regionId]).slice(7, 23)}`
  if (table) {
    return { itemIds: ids, insertAt: indexes[0], item: {
      kind: 'table', tableIndex: suffix, columnCount: grid.columnCount,
      nestedTableCount: 0, source,
      rows: visual.rows.map((row, r) => ({ header: row.header, cells: row.cells.map((cell, c) => ({
        text: cell.map(id => items.get(id).item.text).join('\n'), columnSpan: 1,
        ...(visual.merges === undefined ? {} : grid.geometry[r][c]),
        verticalMerge: null, containsDrawing: false, containsNestedTable: false,
      })) })),
    } }
  }
  if (document.role === 'official_answers') {
    const anchor = items.get(visual.afterItemId).item
    const boxes = anchor.observationIds.map(id => observations.get(id).region)
    const x = Math.min(...boxes.map(box => box.x))
    const y = Math.min(...boxes.map(box => box.y))
    const anchorRegion = { x, y,
      width: Math.max(...boxes.map(box => box.x + box.width)) - x,
      height: Math.max(...boxes.map(box => box.y + box.height)) - y }
    return { itemIds: ids, insertAt: items.get(visual.afterItemId).index + 1,
      referenceFigure: { sourceRegionId: region.regionId, source,
        itemIds: [...ids], observationIds: [...selected],
        afterItem: { itemId: anchor.itemId, text: anchor.text,
          source: { ...source, region: anchorRegion } } } }
  }
  const mediaId = `media:${paperId}:${suffix}`
  return { itemIds: ids, insertAt: pageTop ? 0 : items.get(visual.afterItemId).index + 1, item: {
    kind: 'paragraph', text: '', containsDrawing: true, sourceIndex: source,
    materializedMedia: { mediaId },
  }, media: { mediaId, source }, visual: {
    visualId: `visual:${paperId}:${suffix}`, page: page.page,
    region: structuredClone(region.region), disposition: 'content_media', targetId: mediaId,
  } }
}
