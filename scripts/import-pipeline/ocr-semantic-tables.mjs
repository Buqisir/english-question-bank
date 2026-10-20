// Draft-only names resolve to the existing v3 confirmation contract.
export function compileSemanticTables(draft, items, { documentId, page, width, height }) {
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
    const region = table.region
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
