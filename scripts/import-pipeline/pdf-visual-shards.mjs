export function visualBatches(images) {
  return images.length > 10 ? Array.from({ length: Math.ceil(images.length / 4) }, (_, index) =>
    images.slice(Math.max(0, index * 4 - 1), Math.min(images.length, (index + 1) * 4 + 1))) : [images]
}

export function validateVisualPart(part, images, sha256) {
  if (part.sha256 !== sha256 || !Array.isArray(part.blocking) || !Array.isArray(part.notes)
    || !Array.isArray(part.needsContext) || images.some(image => !part.checkedImages?.includes(image))) {
    throw new Error('视觉检查没有覆盖指定页面、PDF SHA 不匹配或格式无效')
  }
  for (const issue of part.needsContext) {
    if (!issue.reason || !Array.isArray(issue.pages) || !issue.pages.length
      || issue.pages.some(page => !Number.isInteger(page) || page < 1)) throw new Error('缺上下文项必须说明原因与 PDF 页码')
  }
}

// Uncertainty is resolved by another actual image read, never by absence of a neighbouring alarm.
export async function resolveVisualParts({ parts, images, sha256, recheck }) {
  const review = { sha256, blocking: parts.flatMap(part => part.blocking),
    notes: parts.flatMap(part => part.notes), checkedImages: [...new Set(parts.flatMap(part => part.checkedImages))],
    needsContext: [], contextResolutions: [] }
  for (const [index, part] of parts.entries()) {
    if (!part.needsContext.length) continue
    const pages = [...new Set(part.needsContext.flatMap(issue => issue.pages.flatMap(page => [page - 1, page, page + 1])))]
      .filter(page => page >= 1 && page <= images.length).sort((a, b) => a - b)
    const requested = pages.map(page => images[page - 1])
    if (!requested.length) throw new Error('上下文复核没有有效页面')
    const result = await recheck({ index, issues: part.needsContext, pages, images: requested })
    validateVisualPart(result, requested, sha256)
    review.blocking.push(...result.blocking,
      ...result.needsContext.map(issue => `补看相邻页后仍无法确认：${issue.reason}`))
    review.notes.push(...result.notes)
    review.checkedImages = [...new Set([...review.checkedImages, ...result.checkedImages])]
    review.contextResolutions.push({ issues: part.needsContext, pages, result })
  }
  return review
}
