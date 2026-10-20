import { createHash } from 'node:crypto'

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

function identifyContextIssues(issues, index, sha256) {
  const occurrences = new Map()
  return issues.map(issue => {
    const key = JSON.stringify([sha256, index, [...new Set(issue.pages)].sort((a, b) => a - b), issue.reason])
    const occurrence = occurrences.get(key) || 0
    occurrences.set(key, occurrence + 1)
    const id = `context-${createHash('sha256').update(JSON.stringify([key, occurrence])).digest('hex')}`
    return { ...issue, id }
  })
}

const nonemptyText = value => typeof value === 'string' && value.trim().length > 0

// Image coverage alone cannot discharge a doubt: every original ID needs a unique decision.
function adjudicateContextIssues(issues, result, pages, review) {
  const decisions = Array.isArray(result.decisions) ? result.decisions : []
  const expected = new Set(issues.map(issue => issue.id))
  if (decisions.some(decision => !expected.has(decision?.id))) {
    review.blocking.push('上下文复核返回未知疑点 ID，裁决无效')
  }
  for (const issue of issues) {
    const matches = decisions.filter(decision => decision?.id === issue.id)
    const decision = matches[0]
    let error
    if (matches.length !== 1) error = '缺少唯一逐项裁决'
    else if (decision.status === 'resolved') {
      if (!Array.isArray(decision.pages) || !decision.pages.length
        || decision.pages.some(page => !Number.isInteger(page) || !pages.includes(page))
        || !nonemptyText(decision.evidence)) error = 'resolved 缺少有效页码或证据'
      else review.notes.push(`上下文疑点已消除 [${issue.id}]：第 ${decision.pages.join('、')} 页，${decision.evidence}`)
    } else if (['blocking', 'needsContext'].includes(decision.status) && nonemptyText(decision.reason)) {
      error = decision.status === 'blocking' ? `确证缺陷：${decision.reason}` : `仍无法确认：${decision.reason}`
    } else error = '逐项裁决状态或原因无效'
    if (error) review.blocking.push(`上下文疑点 [${issue.id}] ${issue.reason}：${error}`)
  }
}

// Uncertainty is resolved by another actual image read, never by absence of a neighbouring alarm.
export async function resolveVisualParts({ parts, images, sha256, recheck }) {
  const review = { sha256, blocking: parts.flatMap(part => part.blocking),
    notes: parts.flatMap(part => part.notes), checkedImages: [...new Set(parts.flatMap(part => part.checkedImages))],
    needsContext: [], contextResolutions: [] }
  for (const [index, part] of parts.entries()) {
    if (!part.needsContext.length) continue
    const issues = identifyContextIssues(part.needsContext, index, sha256)
    const pages = [...new Set(part.needsContext.flatMap(issue => issue.pages.flatMap(page => [page - 1, page, page + 1])))]
      .filter(page => page >= 1 && page <= images.length).sort((a, b) => a - b)
    const requested = pages.map(page => images[page - 1])
    if (!requested.length) throw new Error('上下文复核没有有效页面')
    const result = await recheck({ index, issues, pages, images: requested })
    validateVisualPart(result, requested, sha256)
    review.blocking.push(...result.blocking,
      ...result.needsContext.map(issue => `补看相邻页后仍无法确认：${issue.reason}`))
    review.notes.push(...result.notes)
    adjudicateContextIssues(issues, result, pages, review)
    review.checkedImages = [...new Set([...review.checkedImages, ...result.checkedImages])]
    review.contextResolutions.push({ issues, pages, result })
  }
  return review
}
