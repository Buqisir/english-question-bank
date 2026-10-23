// Eight 144-dpi draft failures (Qiangji, Jiangsu eight cities, Zhejiang four schools,
// Zhengzhou, 2026-10-22) exceeded an edge by 2,5,3,3,2,4,5,5px.
// Five pixels is the smallest whole-pixel bound covering those observed cases.
const TABLE_WORD_FIT_MAX_PIXELS = 5

function fitTableRegion(region, boxes, width, height) {
  let x = region.x, y = region.y
  let right = x + region.width, bottom = y + region.height
  for (const box of boxes) {
    x = Math.min(x, box.left)
    y = Math.min(y, box.top)
    right = Math.max(right, box.left + box.width)
    bottom = Math.max(bottom, box.top + box.height)
  }
  if (Math.max(region.x - x, region.y - y,
    right - region.x - region.width, bottom - region.y - region.height) > TABLE_WORD_FIT_MAX_PIXELS
    || x < 0 || y < 0 || right > width || bottom > height) return region
  return { x, y, width: right - x, height: bottom - y }
}

// Draft-only names resolve to the existing v3 confirmation contract.
export function compileSemanticTables(draft, items, { documentId, page, width, height, words = [] }) {
  const wordBoxes = new Map(words.map(word => [word.number, word.box]))
  const named = new Map()
  for (const item of items) {
    if (!item.cell) continue
    if (typeof item.cell !== 'string' || named.has(item.cell)
      || item.figure || item.imageOnly || item.emphasis || !item.itemId) {
      throw new Error('Table cells require unique names and ordinary, unemphasized confirmed text')
    }
    named.set(item.cell, item)
  }
  const claimed = new Set()
  const names = new Set()
  const tables = (draft.semanticTables || []).map(table => {
    if (typeof table.name !== 'string' || !table.name.trim() || names.has(table.name)) {
      throw new Error('Table names must be unique nonempty strings')
    }
    names.add(table.name)
    let region = table.region
    if (!region || ![region.x, region.y, region.width, region.height].every(Number.isFinite)
      || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
      || region.x + region.width > width || region.y + region.height > height) {
      throw new Error('Table region must lie within the source page image')
    }
    if (!Array.isArray(table.rows) || !table.rows.length
      || table.rows.some(row => typeof row.header !== 'boolean'
        || !Array.isArray(row.cells) || !row.cells.length
        || row.cells.length !== table.rows[0].cells.length)) {
      throw new Error('Tables require explicit rectangular rows and header flags')
    }
    const rows = table.rows.map(row => ({ header: row.header, cells: row.cells.map(cell => {
      if (!Array.isArray(cell) || !cell.length) throw new Error('Each table cell needs confirmed text names')
      return cell.map(name => {
        if (!named.has(name) || claimed.has(name)) throw new Error(`Unknown or repeated table cell: ${name}`)
        claimed.add(name)
        return named.get(name).itemId
      })
    }) }))
    const ids = rows.flatMap(row => row.cells.flat())
    const indexes = ids.map(id => items.findIndex(item => item.itemId === id))
    if (indexes.some((index, i) => i && index !== indexes[i - 1] + 1)) {
      throw new Error('Table cells must follow one consecutive row-major source range')
    }
    // Use only words claimed by this table's cells; the downstream validator
    // still rejects excessive overflow and any newly enclosed unclaimed text.
    const boxes = indexes.flatMap(index => (items[index].numbers || [])
      .map(number => wordBoxes.get(number)).filter(Boolean))
    region = fitTableRegion(region, boxes, width, height)
    const regionId = `${documentId}:page-${page}:table-${names.size}`
    return {
      visual: { regionId, classification: 'semantic_table', rows },
      regionId, pixels: { ...region },
      region: { x: region.x / width, y: region.y / height,
        width: region.width / width, height: region.height / height },
    }
  })
  if (claimed.size !== named.size) throw new Error('Every named table cell must belong to a declared table')
  return tables
}
