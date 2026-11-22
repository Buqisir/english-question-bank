export function* sourceBlocks(blocks = []) {
  for (const block of blocks) {
    if (block.kind === 'framed_columns') {
      for (const column of block.columns) yield* sourceBlocks(column.blocks)
    } else {
      yield block
    }
  }
}

export const inlineText = inlines => (inlines || []).map(inline =>
  inline.kind === 'blank_ref' ? '____' : inline.text || '').join('')

function unknown(reason) {
  return { naturalParagraph: null, naturalParagraphBasis: null, naturalParagraphReason: reason }
}

function contradictsOrder(previous, current) {
  if (!previous || !current) return false
  if (previous.documentId !== current.documentId) return true
  if (previous.kind !== 'page_region' || current.kind !== 'page_region') return false
  if (previous.page !== current.page) return previous.page > current.page
  const a = previous.region
  const b = current.region
  // A different column may start higher. Compare only overlapping columns.
  return a && b && Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x)
    && b.y + b.height < a.y
}

export function mediaReference(paperId, mediaId) {
  return { mediaId, mediaUrl: `/api/agent/v1/media/${encodeURIComponent(paperId)}/${encodeURIComponent(mediaId)}` }
}

export function projectAgentPassage(paperId, passage, sourceGroup, media = [], paragraphJoins = []) {
  const original = passage?.paragraphs || []
  const paragraphIds = new Set(original.map(paragraph => paragraph.paragraphId))
  const numbering = new Map()
  const tableCells = new Set()
  const mediaById = new Map(media.map(item => [item.mediaId, item]))
  const blocks = []
  const confirmedPredecessors = new Map(paragraphJoins.filter(join =>
    join.groupId === sourceGroup?.groupId && join.sourceReview?.sameNaturalParagraph === true)
    .flatMap(({ fragments }) => fragments.slice(1).map((fragment, index) => [fragment.blockId, fragments[index].blockId])))
  let number = 0
  let previous
  let previousBlockId
  let previousText = ''
  let uncertainty
  let hasText = false
  let hasImage = false
  for (const block of sourceBlocks(sourceGroup?.blocks)) {
    const { kind, blockId, source } = block
    if (kind === 'paragraph') {
      const role = block.role ?? null
      const paragraphId = paragraphIds.has(blockId) ? blockId : null
      const text = inlineText(block.content).trim()
      hasText ||= Boolean(text)
      let natural = {}
      if (role === 'body') {
        const merged = confirmedPredecessors.has(blockId)
          ? confirmedPredecessors.get(blockId) === previousBlockId
          : previousText && !/[.!?…。”’"'！？]$/u.test(previousText) && /^\p{Ll}/u.test(text)
        if (contradictsOrder(previous, source)) uncertainty ??= 'source_order_conflict'
        if (/\r?\n[^\S\r\n]*\r?\n/u.test(text)) uncertainty ??= 'multiple_paragraphs_in_block'
        if (uncertainty) natural = unknown(uncertainty)
        else if (!text) natural = unknown('empty_body_block')
        else natural = { naturalParagraph: merged ? number : ++number, naturalParagraphBasis: merged ? 'merged' : 'order' }
        if (text) {
          previous = source
          previousBlockId = blockId
          previousText = text
        }
      }
      if (paragraphId) numbering.set(paragraphId, natural)
      blocks.push({ kind, blockId, paragraphId, role, page: source?.page ?? null, ...natural })
    } else if (kind === 'figure') {
      hasImage = true
      const media = mediaById.get(block.mediaId)
      blocks.push({
        kind, blockId, ...mediaReference(paperId, block.mediaId), caption: block.caption ?? null, page: source?.page ?? null,
        mimeType: media?.mimeType ?? null, width: media?.pixelWidth ?? null, height: media?.pixelHeight ?? null,
      })
    } else if (kind === 'table') {
      const rows = block.rows.map(row => row.cells.map(cell => {
        tableCells.add(cell.cellId)
        const text = inlineText(cell.content)
        hasText ||= Boolean(text.trim())
        const columnSpan = cell.columnSpan ?? 1
        const rowSpan = cell.rowSpan ?? 1
        const spans = { ...(columnSpan === 1 ? {} : { columnSpan }), ...(rowSpan === 1 ? {} : { rowSpan }) }
        if (cell.content.some(inline => inline.kind === 'media_ref')) {
          hasImage = true
          const content = cell.content.map(inline => inline.kind === 'media_ref'
            ? mediaReference(paperId, inline.mediaId) : inlineText([inline])).filter(Boolean)
          return { ...(content.length === 1 ? content[0] : { content }), ...spans }
        }
        return columnSpan === 1 && rowSpan === 1 ? text : { text, ...spans }
      }))
      blocks.push({ kind, blockId, columnCount: block.columnCount, rows })
    }
  }
  const paragraphs = original.map(paragraph => {
    const { paragraphId, role } = paragraph
    if (numbering.has(paragraphId)) return { ...paragraph, ...numbering.get(paragraphId) }
    if (tableCells.has(paragraphId) || (role && role !== 'body')) return paragraph
    return { ...paragraph, ...unknown(sourceGroup ? 'unmapped_paragraph' : 'source_materialization_unavailable') }
  })
  hasText ||= original.some(paragraph => Boolean((paragraph.text ?? inlineText(paragraph.nodes)).trim()))
  return {
    ...passage, paragraphs, blocks,
    ...(hasText ? {} : { notice: hasImage ? 'image_only' : 'empty' }),
  }
}
