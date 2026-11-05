import { digestJson, exactKeys } from '../../shared/paper-canonical/stable.mjs'
import { semanticTableGrid } from './nck1OcrContentVisuals.mjs'

const same = (a, b) => digestJson(a) === digestJson(b)
const fail = message => { throw new Error(`OCR visual table reclassification: ${message}`) }

// A working interpretation of sealed text, never a replacement OCR receipt.
// Character ranges allow one historical item to span several source cells.
export function buildOcrVisualTable({ declaration, confirmation, source, blockId }) {
  if (!exactKeys(declaration, ['regionId', 'confirmationDigest', 'basis', 'rows', 'merges'])
    || declaration.confirmationDigest !== digestJson(confirmation)
    || typeof declaration.basis !== 'string' || !declaration.basis.trim()
    || confirmation.schemaVersion !== 'nck1-ocr-source-confirmation-v3' || !confirmation.confirmed) {
    fail('requires the exact sealed confirmation and original-page basis')
  }
  const page = confirmation.documents.find(d => d.documentId === source.documentId)?.pages.find(p => p.page === source.page)
  const visual = page?.visualClassifications.find(v => v.regionId === declaration.regionId)
  if (visual?.classification !== 'content_media' || !visual.itemIds.length) fail('requires an existing text-bearing content_media region')
  const items = new Map(page.orderedItems.filter(i => visual.itemIds.includes(i.itemId)).map(i => [i.itemId, i]))
  const itemOrder = new Map(page.orderedItems.map((item, index) => [item.itemId, index]))
  const used = new Map([...items].map(([id, item]) => [id, new Set()]))
  const readAtRows = new Map()
  const merges = Array.isArray(declaration.merges) ? declaration.merges.map(merge => {
    if (!merge || !Object.hasOwn(merge, 'readAtRow')) return merge
    if (!exactKeys(merge, ['row', 'column', 'rowSpan', 'columnSpan', 'readAtRow'])
      || !Number.isSafeInteger(merge.readAtRow) || merge.readAtRow < merge.row
      || merge.readAtRow >= merge.row + merge.rowSpan) fail('readAtRow must lie within its merged cell span')
    const { readAtRow, ...geometry } = merge
    readAtRows.set(`${merge.row}:${merge.column}`, readAtRow)
    return geometry
  }) : declaration.merges
  const grid = semanticTableGrid({ rows: declaration.rows, merges })
  const readingCells = declaration.rows.flatMap((row, r) => row.cells.map((fragments, c) => ({
    keyRow: readAtRows.get(`${r}:${grid.geometry[r][c].columnStart}`) ?? r,
    column: grid.geometry[r][c].columnStart, fragments,
  }))).sort((a, b) => a.keyRow - b.keyRow || a.column - b.column)
  const rows = declaration.rows.map((row, r) => ({
    rowId: `${blockId}:row-${r + 1}`,
    cells: row.cells.map((fragments, c) => ({
      cellId: `${blockId}:cell-${r + 1}-${c + 1}`, ...grid.geometry[r][c],
      role: row.header ? 'header' : 'data',
      content: [{ kind: 'text', text: fragments.map(fragment => {
        const item = items.get(fragment?.itemId)
        if (!exactKeys(fragment, ['itemId', 'start', 'end']) || !item
          || !Number.isInteger(fragment.start) || !Number.isInteger(fragment.end)
          || fragment.start < 0 || fragment.end <= fragment.start || fragment.end > item.text.length) {
          fail('cell fragments must address exact text ranges inside this confirmed region')
        }
        const claimed = used.get(item.itemId)
        for (let i = fragment.start; i < fragment.end; i++) {
          if (claimed.has(i)) fail('cell fragments overlap')
          claimed.add(i)
        }
        return item.text.slice(fragment.start, fragment.end)
      }).join('\n') }],
    })),
  }))
  let previous = { index: -1, end: 0 }
  for (const cell of readingCells) for (const fragment of cell.fragments) {
    const index = itemOrder.get(fragment.itemId)
    if (index < previous.index || (index === previous.index && fragment.start < previous.end)) {
      fail('cell fragments must retain confirmed source order')
    }
    previous = { index, end: fragment.end }
  }
  for (const [id, item] of items) {
    if (Array.from({ length: item.text.length }, (_, i) => i)
        .some(i => !/\s/u.test(item.text[i]) && !used.get(id).has(i))) fail('every confirmed non-whitespace character must survive exactly once')
  }
  return { kind: 'table', blockId, columnCount: grid.columnCount, rows, source: structuredClone(source) }
}

// Project only explicitly named regions on the producer side. The ordinary
// placement, cell and complete visual/media inventory comparisons still run.
export function reclassifyOcrVisualTables(raw, expected, resolved, confirmation) {
  const replacements = new Map()
  const flatten = blocks => blocks.flatMap(b => b.kind === 'framed_columns'
    ? b.columns.flatMap(c => flatten(c.blocks)) : [b])
  for (const visual of raw.sourceCoverage.visuals.filter(v => v.ocrReclassification)) {
    const declaration = visual.ocrReclassification
    const parents = resolved.contentMedia.filter(p => p.source.documentId === raw.sourceCoverage.documentId
      && p.source.page === visual.page && same(p.source.region, visual.region))
    if (parents.length !== 1 || replacements.has(parents[0].mediaId)) fail('region must identify one unique confirmed source image')
    const parent = parents[0]
    const owners = expected.groups.flatMap(group => flatten(group.blocks)
      .filter(b => b.kind === 'figure' && b.mediaId === parent.mediaId).map(block => ({ group, block })))
    const coverage = expected.sourceCoverage.visuals.find(v => v.targetId === parent.mediaId)
    const owner = owners[0]
    const group = raw.groups.find(g => g.groupId === owner?.group.groupId)
    const table = group && flatten(group.blocks).find(b => b.blockId === visual.targetId)
    if (owners.length !== 1 || owner.group.family !== 'reading' || group?.slotId !== owner.group.slotId
      || visual.disposition !== 'semantic_table' || !coverage || visual.visualId !== coverage.visualId
      || table?.kind !== 'table' || !same(table.source, parent.source)
      || raw.media.some(m => m.mediaId === parent.mediaId)) fail('replacement must retain the Reading group, exact source and inventory identity, and remove the old media')
    const page = confirmation.documents.find(d => d.documentId === parent.source.documentId)?.pages.find(p => p.page === parent.source.page)
    const region = page?.visualClassifications.find(v => v.regionId === declaration.regionId)
    const mediaSuffix = digestJson([parent.source.documentId, parent.source.page, declaration.regionId]).slice(7, 23)
    if (region?.classification !== 'content_media' || parent.mediaId !== `media:${raw.paperId}:ocr-${mediaSuffix}`) fail('region ID does not match the confirmed image')
    const projected = buildOcrVisualTable({ declaration, confirmation, source: parent.source, blockId: table.blockId })
    if (!same(table, projected)) fail('table must retain exactly the declared source text and merge geometry')
    const rewrite = blocks => blocks.map(b => b === owner.block ? projected : b.kind === 'framed_columns'
      ? { ...b, columns: b.columns.map(c => ({ ...c, blocks: rewrite(c.blocks) })) } : b)
    owner.group.blocks = rewrite(owner.group.blocks)
    Object.assign(coverage, { disposition: 'semantic_table', targetId: table.blockId, ocrReclassification: structuredClone(declaration) })
    replacements.set(parent.mediaId, parent)
  }
  return replacements
}
