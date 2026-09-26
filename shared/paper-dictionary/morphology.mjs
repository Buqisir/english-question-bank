function labelsForTagSet(tags) {
  const set = new Set(tags)
  const labels = []
  if (set.has('participle') && set.has('past')) labels.push('过去分词')
  else if (set.has('past')) labels.push('过去式')
  if (set.has('participle') && set.has('present')) labels.push('现在分词')
  if (set.has('plural') && !set.has('past') && !set.has('participle')) labels.push('复数')
  if (set.has('comparative')) labels.push('比较级')
  if (set.has('superlative')) labels.push('最高级')
  if (set.has('third-person') && set.has('singular') && set.has('present') && !set.has('past')) {
    labels.push('第三人称单数')
  }
  return labels
}

export function morphologyLabels(tagSets) {
  const labels = []
  for (const tags of tagSets) {
    if (!Array.isArray(tags) || tags.includes('lemma')) continue
    for (const label of labelsForTagSet(tags)) {
      if (!labels.includes(label)) labels.push(label)
    }
  }
  const order = ['过去式', '过去分词', '现在分词', '第三人称单数', '复数', '比较级', '最高级']
  return labels.sort((left, right) => order.indexOf(left) - order.indexOf(right))
}

const POS_LABELS = {
  noun: 'n.',
  verb: 'v.',
  adj: 'adj.',
  adjective: 'adj.',
  adverb: 'adv.',
  pronoun: 'pron.',
  preposition: 'prep.',
  conjunction: 'conj.',
  interjection: 'interj.',
  article: 'art.',
  numeral: 'num.',
  particle: 'part.',
  determiner: 'det.',
  phrase: 'phr.',
  name: 'name',
  prefix: 'prefix',
  suffix: 'suffix',
}

export function posLabel(pos) {
  if (typeof pos !== 'string' || !pos) return ''
  return POS_LABELS[pos] || pos
}

export function dialectFromTags(tags) {
  const list = Array.isArray(tags) ? tags.map((tag) => String(tag)) : []
  const upper = list.map((tag) => tag.toUpperCase())
  if (upper.includes('UK') || upper.includes('GB') || upper.includes('RP')) {
    return { code: 'UK', label: '英' }
  }
  if (upper.includes('US') || upper.includes('GA')) {
    return { code: 'US', label: '美' }
  }
  const source = list.find((tag) => tag.trim())
  if (!source) return { code: 'unspecified', label: '英语读音' }
  return { code: source, label: source }
}
