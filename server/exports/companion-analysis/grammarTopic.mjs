// The 考点 line of a grammar-fill blank, built only from fields the analysis
// already carries: the facet the model chose (facetKey), what a non-finite
// verb does in the sentence (role), and what the server derives from the
// answer (tense, voice, form). The model never writes this text. Taxonomy and
// names: docs/product/grammar-fill-methods.md §六 (Owner reviewed 40 blanks,
// 2026-11-23). A detail the data does not settle is left out rather than
// guessed; an unknown facet prints no line.

const ROLE = {
  subject: '作主语', object: '作宾语', predicative: '作表语', attributive: '作定语', adverbial: '作状语',
  'object-complement': '作宾补', 'subject-complement': '作主补', appositive: '作同位语',
}
const FORM = {
  'to-do': 'to do', doing: 'doing', done: 'done', 'to-be-done': 'to be done', 'being-done': 'being done',
  'having-done': 'having done', 'to-have-done': 'to have done', 'having-been-done': 'having been done',
}
const TENSE = {
  past: '一般过去时', present: '一般现在时', 'present-perfect': '现在完成时', 'past-perfect': '过去完成时', progressive: '进行时',
}
const POS = { noun: '名词', adjective: '形容词', verb: '动词', adverb: '副词' }
const PRONOUN = {
  'object-pronoun': '宾格', 'possessive-determiner': '形容词性物主代词', 'possessive-pronoun': '名词性物主代词',
  'reflexive-pronoun': '反身代词', 'one-to-ones': '替代词 one(s)', 'referential-it': '指代 it',
  'formal-subject-it': '形式主语 it', 'formal-object-it': '形式宾语 it', 'cleft-it': '强调句 it',
  'substitution-that-those': '替代词 that/those', 'impersonal-it': 'it 表天气时间等',
}
const CONNECTIVE = {
  'no-hint.conjunction.coordinating': '并列连词',
  'no-hint.conjunction.relative-clause': '定语从句',
  'no-hint.conjunction.noun-clause': '名词性从句',
  'no-hint.conjunction.adverbial-clause': '状语从句',
  'no-hint.conjunction.cleft': '强调句',
}

const join = (name, details) => {
  const known = details.filter(Boolean)
  return known.length ? `${name}（${known.join('，')}）` : name
}

// The server stamps only 'progressive'; the auxiliary in the answer says which.
function progressive(answer) {
  const auxiliary = String(answer || '').trim().split(/\s+/u)[0].toLowerCase()
  if (['was', 'were'].includes(auxiliary)) return '过去进行时'
  if (['am', 'is', 'are'].includes(auxiliary)) return '现在进行时'
  return '进行时'
}

function finiteDetails(blank) {
  // 'other' is a modal before the verb (should be done) in all but one known
  // blank, an imperative; only the passive case is settled by the data.
  const tense = blank.tense === 'other'
    ? (blank.voice === 'passive' || blank.similarityProfile?.route === 'modal-passive' ? '情态动词后' : null)
    : blank.tense === 'progressive' ? progressive(blank.answer) : TENSE[blank.tense]
  return [tense, blank.voice === 'passive' ? '被动' : null]
}

const nonFiniteDetails = (blank, role) => [ROLE[role], FORM[blank.similarityForm] || FORM[blank.form]]

export function grammarTopic(blank) {
  const facet = String(blank?.facetKey || '').replace(/^grammar-fill\./u, '')
  const route = blank?.similarityProfile?.route
  if (facet === 'given.verb.finite') return join('谓语动词', finiteDetails(blank))
  if (facet === 'given.verb.non-finite') return join('非谓语动词', nonFiniteDetails(blank, blank.role))
  if (facet === 'given.conversion.noun-to-verb') return join('词形转换', ['名词变动词'])
  const conversion = facet.match(/^given\.conversion\.(\w+)-to-(\w+)$/u)
  if (conversion && POS[conversion[1]] && POS[conversion[2]]) {
    return join('词形转换', [`${POS[conversion[1]]}变${POS[conversion[2]]}`])
  }
  if (facet === 'given.noun.number') return '名词的数'
  if (facet === 'given.noun.genitive') return '名词的格'
  if (facet === 'given.adjective.comparison') {
    return join('比较等级', [{ superlative: '最高级', comparative: '比较级' }[route]])
  }
  if (facet === 'given.pronoun' || facet === 'no-hint.pronoun') {
    return join('代词', [facet.startsWith('no-hint') ? '无提示词' : '有提示词', PRONOUN[route]])
  }
  if (facet === 'given.numeral') return join('数词', ['序数词'])
  if (facet === 'no-hint.article') {
    return join('冠词', [/^the$/iu.test(String(blank.answer || '').trim()) ? '定冠词' : '不定冠词'])
  }
  if (facet === 'no-hint.preposition') return '介词'
  return CONNECTIVE[facet] || ''
}
