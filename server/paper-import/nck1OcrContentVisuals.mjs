import { digestJson, exactKeys, isRecordValue } from '../../shared/paper-canonical/stable.mjs'

function reject(message) { throw new Error(message) }

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
      ? ['regionId', 'classification', 'rows']
      : ['regionId', 'classification', 'itemIds', 'afterItemId'])) {
    reject('Content visual requires a closed table or source-image placement')
  }
  if (image && (!['question_source', 'official_answers'].includes(document.role) || document.mediaType !== 'application/pdf')) {
    reject('Content images require a separate PDF question source or official_answers reference source with a replayable crop')
  }
  if (table && document.role === 'question_and_answers') {
    reject('Content tables currently require separate question/answer sources to keep scoring out of student content')
  }
  if (table && (!Array.isArray(visual.rows) || visual.rows.length === 0
    || visual.rows.some(row => !isRecordValue(row) || !exactKeys(row, ['header', 'cells'])
      || typeof row.header !== 'boolean' || !Array.isArray(row.cells) || row.cells.length === 0
      || row.cells.length !== visual.rows[0].cells.length
      || row.cells.some(cell => !Array.isArray(cell) || cell.length === 0)))) {
    reject('OCR tables require nonempty rectangular rows of confirmed item IDs')
  }
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
      kind: 'table', tableIndex: suffix, columnCount: visual.rows[0].cells.length,
      nestedTableCount: 0, source,
      rows: visual.rows.map(row => ({ header: row.header, cells: row.cells.map(cell => ({
        text: cell.map(id => items.get(id).item.text).join('\n'), columnSpan: 1,
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
