const HAN = /[\u3400-\u9fff]/

// 只接受一条短义。词典里用分号拼在一起的几条义，不算已经选定。
export function singleGloss(gloss) {
  if (typeof gloss !== 'string') return null
  const text = gloss.trim()
  if (!text || text.includes('；') || text.includes(';')) return null
  return text
}

// 中文片段必须整段出现一次，并且两边不是汉字，避免把「行」标进「银行」。
export function alignGloss(translation, gloss) {
  const quote = singleGloss(gloss)
  if (!quote || typeof translation !== 'string' || !translation.includes(quote)) {
    return { status: 'unavailable', ranges: [] }
  }
  const hits = []
  let from = 0
  while (from <= translation.length) {
    const index = translation.indexOf(quote, from)
    if (index < 0) break
    const before = index === 0 ? '' : translation[index - 1]
    const afterIndex = index + quote.length
    const after = afterIndex >= translation.length ? '' : translation[afterIndex]
    // 单字义必须贴在非汉字边界上，避免「行」落进「银行」。多字义按整段唯一出现。
    const insideHanWord = quote.length === 1 && (HAN.test(before) || HAN.test(after))
    if (!insideHanWord) hits.push(index)
    from = index + quote.length
  }
  if (hits.length !== 1) return { status: 'unavailable', ranges: [] }
  const start = hits[0]
  return {
    status: 'ready',
    ranges: [{ start, end: start + quote.length, quote }],
  }
}
