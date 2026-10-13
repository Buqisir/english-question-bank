#!/usr/bin/env node
import assert from 'node:assert/strict'
import { LIMITS, SCHEMA_VERSION, TOKENIZER_VERSION, lineWidth } from '../shared/sentence-analysis/constants.mjs'
import { compileFixture } from '../shared/sentence-analysis/compileFixture.mjs'
import {
  connectorParts,
  copyText,
  difficulties,
  teachingPoints,
  difficultyBubble,
  explanation,
  firstChild,
  focusView,
  hitTest,
  layerLabel,
  mainFocus,
  moveFocus,
  next,
  parentOf,
  prev,
  primaryUnits,
  restoreLayout,
  restoreText,
  structureSummary,
  unitBubble,
  unitDisplayLabel,
  unitPartnerId,
  unitText,
} from '../shared/sentence-analysis/derive.mjs'
import { alignRestore } from '../shared/sentence-analysis/restore.mjs'
import { coreFixtures, mainSample } from '../shared/sentence-analysis/fixtures/core-samples.mjs'
import { paperFixtures } from '../shared/sentence-analysis/fixtures/paper-2026-i.mjs'
import { analysisSentences } from '../shared/sentence-analysis/resolveTarget.mjs'
import { tokenizeSentence } from '../shared/sentence-analysis/tokenize.mjs'
import { validateSentenceAnalysis } from '../shared/sentence-analysis/validate.mjs'

let passed = 0
let failed = 0

function check(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function codes(result) {
  return result.ok ? [] : result.errors.map((error) => error.code)
}

function hasCode(result, code) {
  return codes(result).includes(code)
}

const tokenText = (text) => tokenizeSentence(text).map((token) => token.text)

check('contractions split into word and clitic', [
  ["don't", "do|n't"],
  ["can't", "ca|n't"],
  ["We'd", "We|'d"],
  ["you're", "you|'re"],
  ["I'm", "I|'m"],
  ["it'll", "it|'ll"],
  ["should've", "should|'ve"],
  ["wouldn't've", "would|n't|'ve"],
  ['company\u2019s', 'company|\u2019s'],
].every(([word, expected]) => tokenText(word).join('|') === expected))
check('apostrophes inside names and fixed words do not split', ["O'Brien", "o'clock", "rock'n'roll"].every((word) => tokenText(word).join('|') === word))
check('a trailing plural apostrophe stays punctuation', tokenText("students'").join('|') === "students|'")
check('a quote that starts at a clitic tokenizes as inside the sentence', (
  tokenText('’s why').join('|') === '’s|why'
  && tokenText("'ll rain").join('|') === "'ll|rain"
  && tokenText("n't need").join('|') === "n't|need"
))
check('an opening single quote is not a clitic', tokenText("'sorry,' she said").join('|') === "'|sorry|,|'|she|said")
const sentenceTexts = (text) => analysisSentences(text).map((sentence) => sentence.text.trim())
check('titles do not end a sentence', sentenceTexts('Afraid of Mrs. Calloway, our librarian. In this book Dr. Petroski widens his view. Mr. and Mrs. Smith met Prof. Lee at St. Paul’s.').length === 3)
check('periods inside a quote do not end the outer sentence', (
  sentenceTexts('I read the message: “Out of order. Sorry.” I went home.').join('|') === 'I read the message: “Out of order. Sorry.”|I went home.'
  && sentenceTexts('“I came. I saw. I conquered,” he said. Then he left.').length === 2
  && sentenceTexts('He said "Stop. Now." Then left.').length === 2
))
check('an unclosed quote does not swallow the paragraph', sentenceTexts('“Never closes. One. Two. Three. Four. Five. Six.').length === 7)
check('sentences never join across a line break', sentenceTexts('It ends with Dr.\nNext paragraph.').length === 2)
check('hyphenated word stays one token', tokenText('well-known')[0] === 'well-known')
check('accented word stays one token', tokenText('café')[0] === 'café')
check('em dash is its own punctuation token', tokenText('A—B').join('|') === 'A|—|B')
check('emoji is one punctuation token and does not split the surrogate', (() => {
  const tokens = tokenizeSentence('She said 😀.')
  const emoji = tokens.find((token) => token.text === '😀')
  return emoji?.kind === 'punct' && emoji.end - emoji.start === 2
})())
check('curly quotes and a run of periods are separate punctuation', tokenText('“Hello”...').join('|') === '“|Hello|”|.|.|.')
try {
  tokenizeSentence(' Hello.')
  check('leading whitespace is rejected', false)
} catch (error) {
  check('leading whitespace is rejected', error.code === 'SOURCE_TEXT')
}
try {
  tokenizeSentence('Hello. ')
  check('trailing whitespace is rejected', false)
} catch (error) {
  check('trailing whitespace is rejected', error.code === 'SOURCE_TEXT')
}

const compiled = new Map()
for (const fixture of [...coreFixtures, ...paperFixtures]) {
  try {
    compiled.set(fixture.id, compileFixture(fixture, { id: fixture.id }))
    check(`compile ${fixture.id}`, true)
  } catch (error) {
    check(`compile ${fixture.id}`, false, error.message)
  }
}

const main = compiled.get('core-main')
if (main) {
  check('main sample has the spec unit count', main.units.length === mainSample.units.length, String(main.units.length))
  check('main sample has the spec relation count', main.relations.length === mainSample.relations.length)
  check('main schema and tokenizer versions', main.schemaVersion === SCHEMA_VERSION && main.tokenizerVersion === TOKENIZER_VERSION)
  const expectedSummary = '主干：The committee has postponed the decision（委员会推迟了决定）｜定语从句 修饰 decision｜原因状语（现在分词）说明 has postponed，内含同位语从句'
  check('structure summary matches the spec sentence', structureSummary(main) === expectedSummary, structureSummary(main))

  const decision = main.tokens.find((token) => token.text === 'decision')
  check('clicking decision hits the head, not the object phrase', hitTest(main, decision.index) === 'decision')

  const focusIds = (id) => {
    const view = focusView(main, id)
    return {
      focused: view.focused.id,
      related: view.related.map((unit) => unit.id).sort(),
    }
  }
  const related = (id) => focusIds(id).related
  check('committee focus pairs the predicate and the logical subject', JSON.stringify(related('subj')) === JSON.stringify(['n1', 'pred']))
  check('predicate focus pairs the subject and the reason phrase', JSON.stringify(related('pred')) === JSON.stringify(['n1', 'subj']))
  check('attributive clause focus points at decision', JSON.stringify(related('c1')) === JSON.stringify(['decision']))
  check('which focus pairs its predicate and antecedent', JSON.stringify(related('which')) === JSON.stringify(['decision', 'wasexp']))
  check('proposal focus crosses the parenthesis to its predicate', JSON.stringify(related('proposal')) === JSON.stringify(['could', 'implemented']))
  check('could focus pairs its subject and the condition', JSON.stringify(related('could')) === JSON.stringify(['c3', 'proposal']))
  check('participle focus pairs the predicate and its logical subject', JSON.stringify(related('n1')) === JSON.stringify(['pred', 'subj']))
  check('appositive focus points at concerns', JSON.stringify(related('c2')) === JSON.stringify(['concerns']))
  check('condition focus points at the predicate', JSON.stringify(related('c3')) === JSON.stringify(['could']))
  check('elliptical participle focus points at its logical subject', JSON.stringify(related('implemented')) === JSON.stringify(['proposal']))

  check('down from the attributive clause enters which', moveFocus(main, { kind: 'unit', unitId: 'c1' }, 'ArrowDown').unitId === 'which')
  check('which then moves to was expected', next(main, 'which') === 'wasexp')
  check('up from which returns to the clause', parentOf(main, 'which') === 'c1')
  check('up from the clause returns to main-clause focus', parentOf(main, 'c1') === 'main')
  const stepped = ['ArrowRight', 'ArrowUp', 'ArrowUp'].reduce(
    (focus, key) => moveFocus(main, focus, key),
    { kind: 'unit', unitId: 'which' },
  )
  check('right, up, up walks was expected, the clause, then main focus', stepped.kind === 'main')
  check('the first child of the attributive clause is which', firstChild(main, 'c1') === 'which')
  check('previous sibling of was expected is which', prev(main, 'wasexp') === 'which')

  const rendered = (model) => [model.title, ...model.lines.map((item) => `${item.label}：${item.text}`), model.note || ''].join('\n')
  const mainText = rendered(explanation(main, { kind: 'main' }))
  check('main explanation names the trunk roles', (
    mainText.includes('主句')
    && mainText.includes('主语：The committee')
    && mainText.includes('谓语：has postponed')
    && mainText.includes('宾语：the decision which was expected last week')
  ), mainText)

  const expectText = (id, snippets) => {
    const text = rendered(explanation(main, { kind: 'unit', unitId: id }))
    const obstacles = explanation(main, { kind: 'unit', unitId: id }).obstacles.join('、')
    const restores = explanation(main, { kind: 'unit', unitId: id }).restores
      .map((restore) => `${restore.kindLabel}：${restore.segments.map((segment) => `${segment.spaceBefore ? ' ' : ''}${segment.inserted ? `[${segment.text}]` : segment.text}`).join('')}`)
      .join('\n')
    const whole = `${text}\n难点：${obstacles}\n${restores}`
    const missing = snippets.filter((snippet) => !whole.includes(snippet))
    check(`explanation ${id}`, missing.length === 0, `${missing.join(' | ')}\n${whole}`)
  }
  expectText('c1', ['定语从句 · 主句', '修饰：decision', 'which 引导定语从句', '在从句中作主语'])
  expectText('which', ['主语 · 定语从句内', '对应谓语：was expected', '指代：decision'])
  expectText('proposal', ['主语 · 同位语从句内', '对应谓语：could undermine', '它的谓语在插入语后面：could undermine'])
  expectText('n1', ['原因状语（现在分词） · 主句', '所作成分：原因状语', '作用对象：has postponed', '逻辑主语：The committee', '形式：现在分词短语'])
  expectText('c2', ['同位语从句 · 原因状语（现在分词）内', '说明：concerns', 'that 引导同位语从句'])
  expectText('c3', ['条件状语从句 · 同位语从句内', '说明：could undermine', '难点：省略、插入', '补全省略：if [the proposal is] implemented hastily'])
  expectText('implemented', ['谓语 · 条件状语从句内', '逻辑主语：the proposal', '难点：省略、被动'])

  const trunk = mainFocus(main)
  check('main focus keeps only the root subject-predicate line', trunk.relations.map((relation) => relation.id).join() === 'r1')
  check('trunk translation drops the relative-clause wording', trunk.trunkZh === '委员会推迟了决定')
}

function byId(id) {
  return compiled.get(id)
}

const progressive = byId('perfect-progressive')
if (progressive) {
  check('has been working has no separate working unit', progressive.units.every((unit) => unitText(progressive, unit) !== 'working'))
}
const passive = byId('passive-verb-group')
if (passive) {
  check('was discussed has no separate discussed unit', passive.units.every((unit) => !unit.spans.some((span) => (
    passive.tokens.slice(span.start, span.end).map((token) => token.text).join(' ') === 'discussed'
  ))))
}
const coordinated = byId('coordinated-predicates')
if (coordinated) {
  const relation = coordinated.relations.find((item) => item.kind === 'subject-predicate')
  check('one subject-predicate relation reaches both verbs', JSON.stringify(relation.to) === JSON.stringify(['opened', 'read']))
}
const uncertain = byId('uncertain-modifier')
if (uncertain) {
  const relation = uncertain.relations.find((item) => item.from === 'pp')
  check('telescope modifier is uncertain and has no target', relation.certainty === 'uncertain' && relation.to.length === 0)
  check('uncertain focus is flagged for the panel', explanation(uncertain, { kind: 'unit', unitId: 'pp' }).uncertain === true)
}
const layers = byId('relative-layers')
if (layers) {
  const teacher = layers.units.find((unit) => unit.id === 'teacher')
  const smiled = layers.units.find((unit) => unit.id === 'smiled')
  const who = layers.units.find((unit) => unit.id === 'who')
  const praised = layers.units.find((unit) => unit.id === 'praised')
  check('teacher and smiled share the main layer', teacher.layerId === 'c0' && smiled.layerId === 'c0')
  check('who and praised share the clause layer', who.layerId === 'c1' && praised.layerId === 'c1' && who.layerId !== teacher.layerId)
}
const books = byId('repeated-books')
if (books) {
  const modifies = Object.fromEntries(books.relations.filter((relation) => relation.kind === 'modifies').map((relation) => [relation.from, relation.to[0]]))
  check('each relative clause modifies its own book', modifies.c1 === 'book1' && modifies.c2 === 'book2')
}
const unicode = byId('unicode-appositive')
if (unicode) {
  check('café’s and children’s split off the possessive', (
    unicode.tokens.map((token) => token.text).join('|').includes('café|’s|owner')
    && unicode.tokens.map((token) => token.text).join('|').includes('children|’s|drawings')
    && unicode.tokens.filter((token) => token.text === '—').length === 2
  ), unicode.tokens.map((token) => token.text).join('|'))
  check('the appositive is marked as a parenthesis', unicode.units.find((unit) => unit.id === 'app').obstacles.includes('parenthesis'))
}
const split = byId('split-predicate')
if (split) {
  const predicate = split.units.find((unit) => unit.id === 'pred')
  check('split predicate keeps three spans', predicate.spans.length === 3 && unitText(split, predicate) === 'did turn down')
  check('fronting and inversion stay on their units', (
    split.units.find((unit) => unit.id === 'only').obstacles.includes('fronting')
    && predicate.obstacles.includes('partial-inversion')
    && predicate.obstacles.includes('split')
  ))
  const [restore] = split.restores
  check('a restore reorders source words inside its clause', restore.scopeId === 'c0' && JSON.stringify(restore.segments) === JSON.stringify([
    { start: 3, end: 4 }, { start: 2, end: 3 }, { start: 4, end: 8 }, { start: 0, end: 2, lowercase: true }, { start: 8, end: 9 },
  ]), JSON.stringify(restore))
  check('a restore reads back as text', restoreText(split, restore) === 'she did turn the offer down only then.', restoreText(split, restore))
}

{
  const base = {
    sentenceText: 'Hardly had he left.',
    translationZh: '他刚离开。',
    roots: ['c0'],
    units: [
      { id: 'c0', quote: 'Hardly had he left.', form: 'clause', role: null, layer: null, parent: null },
      { id: 'hardly', quote: 'Hardly', form: 'word', role: 'adverbial', layer: 'c0', parent: 'c0', obstacles: ['fronting'] },
      { id: 'had', quote: ['had', 'left'], form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0', obstacles: ['partial-inversion'] },
      { id: 'he', quote: 'he', form: 'word', role: 'subject', layer: 'c0', parent: 'c0' },
    ],
    relations: [{ id: 'r1', kind: 'subject-predicate', from: 'he', to: ['had'] }],
  }
  const withRestore = (restore) => () => compileFixture({ ...base, restores: [{ id: 's1', unit: 'hardly', kind: 'normal-order', ...restore }] })
  const throws = (make) => {
    try {
      make()
      return null
    } catch (error) {
      return error.message
    }
  }
  check('a restore word missing from the sentence fails to compile', /"just" is not in the sentence/.test(throws(withRestore({ text: 'he had just left hardly' })) || ''))
  const added = withRestore({ text: 'he had [only just] left' })()
  check('bracketed words become inserted segments and unused words drop out', JSON.stringify(added.restores[0].segments) === JSON.stringify([
    { start: 2, end: 3 }, { start: 1, end: 2 }, { text: 'only just' }, { start: 3, end: 5 },
  ]), JSON.stringify(added.restores[0].segments))
  const reject = (label, restore, code) => {
    const compiled = withRestore({ text: 'he had left hardly' })()
    const result = validateSentenceAnalysis({ ...compiled, restores: [{ ...compiled.restores[0], ...restore }] })
    check(label, !result.ok && result.errors.some((error) => error.code === code), JSON.stringify(result.errors || []))
  }
  reject('a source word used twice is rejected', { segments: [{ start: 2, end: 3 }, { start: 2, end: 3 }] }, 'RESTORE_SEGMENT')
  reject('a restore made only of added words is rejected', { segments: [{ text: 'he left' }] }, 'RESTORE_SEGMENT')
  reject('a restore scope that is not a layer is rejected', { scopeId: 'he' }, 'RESTORE_SEGMENT')
  reject('an unknown restore kind is rejected', { kind: 'reorder' }, 'BAD_ENUM')
  const marked = validateSentenceAnalysis({ ...compileFixture(base), units: compileFixture(base).units.map((unit) => (unit.id === 'he' ? { ...unit, marks: ['emphasised'] } : unit)) })
  check('an unknown mark is rejected', !marked.ok && marked.errors.some((error) => error.path.endsWith('.marks')))
  const implied = validateSentenceAnalysis({ ...compileFixture(base), relations: [{ id: 'r1', kind: 'modifies', from: 'hardly', to: ['had'], certainty: 'certain', implied: true }] })
  check('implied is only for a shared predicate', !implied.ok && implied.errors.some((error) => error.path.endsWith('.implied')))
}

{
  const gapped = compileFixture({
    sentenceText: 'Tom likes tea, and Ann, coffee.',
    roots: ['c0', 'c1'],
    units: [
      { id: 'c0', quote: 'Tom likes tea', form: 'clause', role: null, layer: null, parent: null },
      { id: 'c1', quote: 'Ann, coffee', form: 'clause', role: null, layer: null, parent: null },
      { id: 'tom', quote: 'Tom', form: 'word', role: 'subject', layer: 'c0', parent: 'c0' },
      { id: 'likes', quote: 'likes', form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0' },
      { id: 'ann', quote: 'Ann', form: 'word', role: 'subject', layer: 'c1', parent: 'c1', obstacles: ['gapping'] },
    ],
    relations: [
      { id: 'r1', kind: 'subject-predicate', from: 'tom', to: ['likes'] },
      { id: 'r2', kind: 'subject-predicate', from: 'ann', to: ['likes'], implied: true },
    ],
  })
  check('an implied subject-predicate line may cross into the shared predicate', gapped.relations[1].implied === true)
}

{
  const labels = compileFixture({
    sentenceText: 'She gave him a book, which was new, and he felt happy.',
    roots: ['c0'],
    units: [
      { id: 'c0', quote: 'She gave him a book, which was new, and he felt happy.', form: 'clause', role: null, layer: null, parent: null },
      { id: 'she', quote: 'She', form: 'word', role: 'subject', layer: 'c0', parent: 'c0', marks: ['emphasized'] },
      { id: 'gave', quote: 'gave', form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0' },
      { id: 'him', quote: 'him', form: 'word', role: 'indirect-object', layer: 'c0', parent: 'c0' },
      { id: 'book', quote: 'a book', form: 'phrase', role: 'object', layer: 'c0', parent: 'c0' },
      { id: 'rel', quote: 'which was new', form: 'clause', role: 'attributive', layer: 'c0', parent: 'c0', marks: ['non-restrictive'] },
      { id: 'which', quote: 'which', form: 'word', role: 'subject', connector: 'relative-pronoun', layer: 'rel', parent: 'rel' },
      { id: 'was', quote: 'was', form: 'verb-group', role: 'predicate', layer: 'rel', parent: 'rel' },
      { id: 'new', quote: 'new', form: 'word', role: 'predicative', layer: 'rel', parent: 'rel' },
    ],
  })
  const label = (id) => unitDisplayLabel(labels, id)
  check('a predicate followed by a predicative reads 系动词', label('was') === '系动词', label('was'))
  check('the other object beside an indirect object reads 直接宾语', label('book') === '直接宾语', label('book'))
  check('a non-restrictive attributive clause reads 非限制性定从', label('rel') === '非限制性定从', label('rel'))
  check('an emphasized unit keeps its role and adds 被强调', label('she') === '主语·被强调', label('she'))
  check('a relative pronoun reads as its connector kind', label('which') === '关系代词', label('which'))

  const group = compileFixture({
    sentenceText: 'Not only Tom but also Ann bought apples and pears, the fruit displayed.',
    roots: ['c0'],
    units: [
      { id: 'c0', quote: 'Not only Tom but also Ann bought apples and pears, the fruit displayed.', form: 'clause', role: null, layer: null, parent: null },
      { id: 'pair', quote: ['Not only', 'but also'], form: 'word', role: null, connector: 'coordinator', layer: 'c0', parent: 'c0' },
      { id: 'objs', quote: 'apples and pears', form: 'coordination', role: 'object', layer: 'c0', parent: 'c0' },
      { id: 'apples', quote: 'apples', form: 'word', role: 'object', layer: 'c0', parent: 'objs' },
      { id: 'pears', quote: 'pears', form: 'word', role: 'object', layer: 'c0', parent: 'objs' },
      { id: 'abs', quote: 'the fruit displayed', form: 'absolute', role: 'adverbial', sense: 'accompaniment', layer: 'c0', parent: 'c0' },
      { id: 'fruit', quote: 'the fruit', form: 'phrase', role: 'logical-subject', layer: 'abs', parent: 'abs' },
      { id: 'shown', quote: 'displayed', form: 'past-participle', role: 'nonfinite-verb', layer: 'abs', parent: 'abs' },
    ],
    relations: [{ id: 'r1', kind: 'logical-subject', from: 'shown', to: ['fruit'] }],
  })
  const groupLabel = (id) => unitDisplayLabel(group, id)
  check('a two-part connector reads 成对并列连词', groupLabel('pair') === '成对并列连词', groupLabel('pair'))
  check('a coordination group reads 并列宾语', groupLabel('objs') === '并列宾语', groupLabel('objs'))
  check('coordinated members are numbered in order', groupLabel('apples') === '并列宾语 ①' && groupLabel('pears') === '并列宾语 ②', `${groupLabel('apples')} ${groupLabel('pears')}`)
  check('an absolute construction reads 独立主格·伴随状语', groupLabel('abs') === '独立主格·伴随状语', groupLabel('abs'))
  check('an absolute construction is its own layer', layerLabel(group, group.units.find((unit) => unit.id === 'fruit')) === '独立主格·伴随状语内')
  check('the trunk skips the coordination group and keeps its members', primaryUnits(group).map((unit) => unit.id).join() === 'apples,pears', primaryUnits(group).map((unit) => unit.id).join())

  const prepositional = compileFixture({
    sentenceText: 'After a long walk, we rested.',
    roots: ['c0'],
    units: [
      { id: 'c0', quote: 'After a long walk, we rested.', form: 'clause', role: null, layer: null, parent: null },
      { id: 'after', quote: 'After a long walk', form: 'prepositional', role: 'adverbial', sense: 'time', layer: 'c0', parent: 'c0' },
      { id: 'walk', quote: 'a long walk', form: 'phrase', role: 'object', layer: 'c0', parent: 'after' },
      { id: 'we', quote: 'we', form: 'word', role: 'subject', layer: 'c0', parent: 'c0' },
      { id: 'rested', quote: 'rested', form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0' },
    ],
  })
  const trunk = primaryUnits(prepositional).map((unit) => unit.id).join()
  check('a preposition\'s object stays out of the trunk', trunk === 'we,rested', trunk)

  const flat = (sentenceText, units) => compileFixture({ sentenceText, roots: ['c0'], units: [
    { id: 'c0', quote: sentenceText, form: 'clause', role: null, layer: null, parent: null }, ...units] })
  const parts = (data, id) => connectorParts(data, data.units.find((unit) => unit.id === id))
    .map((indexes) => indexes.map((index) => data.tokens[index].text).join(' '))
  const twoClauses = flat('The solo contest lasts six hours, whereas the team contest lasts three.', [
    { id: 's1', quote: 'The solo contest', form: 'phrase', role: 'subject', layer: 'c0', parent: 'c0' },
    { id: 'p1', quote: 'lasts', occurrence: 1, form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0' },
    { id: 'o1', quote: 'six hours', form: 'phrase', role: 'object', layer: 'c0', parent: 'c0' },
    { id: 'w', quote: 'whereas', form: 'word', role: null, connector: 'coordinator', layer: 'c0', parent: 'c0' },
    { id: 's2', quote: 'the team contest', form: 'phrase', role: 'subject', layer: 'c0', parent: 'c0' },
    { id: 'p2', quote: 'lasts', occurrence: 2, form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0' },
    { id: 'o2', quote: 'three', form: 'word', role: 'object', layer: 'c0', parent: 'c0' },
  ])
  check('a coordinator between two flattened clauses links both clauses', parts(twoClauses, 'w').join(' | ') === 'The solo contest lasts six hours | the team contest lasts three', parts(twoClauses, 'w').join(' | '))
  const twoPredicates = flat('The song was once famous but had been lost for years.', [
    { id: 'song', quote: 'The song', form: 'phrase', role: 'subject', layer: 'c0', parent: 'c0' },
    { id: 'was', quote: 'was', form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0' },
    { id: 'once', quote: 'once', form: 'word', role: 'adverbial', layer: 'c0', parent: 'c0' },
    { id: 'famous', quote: 'famous', form: 'word', role: 'predicative', layer: 'c0', parent: 'c0' },
    { id: 'but', quote: 'but', form: 'word', role: null, connector: 'coordinator', layer: 'c0', parent: 'c0' },
    { id: 'lost', quote: 'had been lost', form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0' },
    { id: 'years', quote: 'for years', form: 'prepositional', role: 'adverbial', layer: 'c0', parent: 'c0' },
  ])
  check('a plain but between two predicates sharing a subject links the predicates', parts(twoPredicates, 'but').join(' | ') === 'was once famous | had been lost for years', parts(twoPredicates, 'but').join(' | '))
  const unknown = flat('Tom smiled and left.', [
    { id: 'and', quote: 'and', form: 'word', role: null, connector: 'coordinator', layer: 'c0', parent: 'c0' },
  ])
  const pairOpener = flat('They compete both alone and in teams.', [
    { id: 'they', quote: 'They', form: 'word', role: 'subject', layer: 'c0', parent: 'c0' },
    { id: 'compete', quote: 'compete', form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0' },
    { id: 'both', quote: 'both', form: 'word', role: null, connector: 'coordinator', layer: 'c0', parent: 'c0' },
    { id: 'alone', quote: 'alone', form: 'word', role: 'adverbial', layer: 'c0', parent: 'c0' },
    { id: 'and', quote: 'and', form: 'word', role: null, connector: 'coordinator', layer: 'c0', parent: 'c0' },
    { id: 'teams', quote: 'in teams', form: 'prepositional', role: 'adverbial', layer: 'c0', parent: 'c0' },
  ])
  check('both opens a pair whose two peers follow it, in order', parts(pairOpener, 'both').join(' | ') === 'alone | in teams', parts(pairOpener, 'both').join(' | '))
  const nestedRight = flat('This is me, and here I am.', [
    { id: 'this', quote: 'This', form: 'word', role: 'subject', layer: 'c0', parent: 'c0' },
    { id: 'is', quote: 'is', form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0' },
    { id: 'me', quote: 'me', form: 'word', role: 'predicative', layer: 'c0', parent: 'c0' },
    { id: 'and', quote: 'and', form: 'word', role: null, connector: 'coordinator', layer: 'c0', parent: 'c0' },
    { id: 'here', quote: 'here I am', form: 'clause', role: 'object', layer: 'c0', parent: 'c0' },
    { id: 'i', quote: 'I', form: 'word', role: 'subject', layer: 'here', parent: 'here' },
    { id: 'am', quote: 'am', form: 'verb-group', role: 'predicate', layer: 'here', parent: 'here' },
  ])
  check('a right-hand clause recorded as one nested clause still links both clauses', parts(nestedRight, 'and').join(' | ') === 'This is me | here I am', parts(nestedRight, 'and').join(' | '))
  const compound = flat('Friends joined me, and we decided we should go.', [
    { id: 'friends', quote: 'Friends', form: 'word', role: 'subject', layer: 'c0', parent: 'c0' },
    { id: 'joined', quote: 'joined', form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0' },
    { id: 'me', quote: 'me', form: 'word', role: 'object', layer: 'c0', parent: 'c0' },
    { id: 'and', quote: 'and', form: 'word', role: null, connector: 'coordinator', layer: 'c0', parent: 'c0' },
    { id: 'we', quote: 'we', occurrence: 1, form: 'word', role: 'subject', layer: 'c0', parent: 'c0' },
    { id: 'decided', quote: 'decided', form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0' },
    { id: 'obj', quote: 'we should go', form: 'clause', role: 'object', layer: 'c0', parent: 'c0' },
    { id: 'we2', quote: 'we', occurrence: 2, form: 'word', role: 'subject', layer: 'obj', parent: 'obj' },
    { id: 'go', quote: 'should go', form: 'verb-group', role: 'predicate', layer: 'obj', parent: 'obj' },
  ])
  const partnerWords = (id) => unitText(compound, unitPartnerId(compound, id))
  check('in two flattened clauses each part pairs with its own clause', partnerWords('obj') === 'decided' && partnerWords('we') === 'decided' && partnerWords('decided') === 'we' && partnerWords('me') === 'joined',
    ['obj', 'we', 'decided', 'me'].map(partnerWords).join(','))
  const relative = (sentenceText, antecedent) => compileFixture({ sentenceText, roots: ['c0'], units: [
    { id: 'c0', quote: sentenceText, form: 'clause', role: null, layer: null, parent: null },
    { id: 'we', quote: 'We', form: 'word', role: 'subject', layer: 'c0', parent: 'c0' },
    { id: 'told', quote: 'were told', form: 'verb-group', role: 'predicate', layer: 'c0', parent: 'c0' },
    { id: 'inf', quote: 'to make noises', form: 'infinitive', role: 'subject-complement', layer: 'c0', parent: 'c0' },
    { id: 'rel', quote: 'which became a game', form: 'clause', role: 'attributive', layer: 'c0', parent: 'c0' },
    { id: 'which', quote: 'which', form: 'word', role: 'subject', connector: 'relative-pronoun', layer: 'rel', parent: 'rel' },
    { id: 'became', quote: 'became', form: 'verb-group', role: 'predicate', layer: 'rel', parent: 'rel' },
    { id: 'game', quote: 'a game', form: 'phrase', role: 'predicative', layer: 'rel', parent: 'rel' },
  ], relations: [{ id: 'r1', kind: 'modifies', from: 'rel', to: [antecedent] }] })
  const phraseAntecedent = relative('We were told to make noises, which became a game.', 'inf')
  check('a relative clause pointing at a phrase names what the relative word stands for',
    unitBubble(phraseAntecedent, 'rel')?.body === 'which 指代 to make noises，在从句中作主语', unitBubble(phraseAntecedent, 'rel')?.body)
  const sentenceAntecedent = relative('We were told to make noises, which became a game.', 'c0')
  check('a relative clause pointing at its whole sentence says so and lights nothing',
    unitBubble(sentenceAntecedent, 'rel')?.body === 'which 指代前面整句，在从句中作主语' && unitPartnerId(sentenceAntecedent, 'rel') === null,
    `${unitBubble(sentenceAntecedent, 'rel')?.body} / ${unitPartnerId(sentenceAntecedent, 'rel')}`)
  check('a coordinator without a recorded range says nothing beyond its kind', !unitBubble(unknown, 'and')?.body, JSON.stringify(unitBubble(unknown, 'and')))
}
const gerund = byId('gerund-subject')
if (gerund) {
  check('Reading every day is a gerund subject', gerund.units.find((unit) => unit.id === 'ger').form === 'gerund')
  check('Reading itself is not a predicate', gerund.units.find((unit) => unit.id === 'reading').role === 'nonfinite-verb')
}
const objectGerund = byId('gerund-object')
if (objectGerund) {
  check('reading novels is a gerund object', (
    objectGerund.units.find((unit) => unit.id === 'ger').role === 'object'
    && objectGerund.units.find((unit) => unit.id === 'reading').role !== 'predicate'
  ))
}

{
  const core = byId('core-main')
  const items = teachingPoints(core)
  check('recognized teaching points retain reading order, one per unit and type', items.map((item) => item.id).join() === 'wasexp:passive,c3:ellipsis,c3:parenthesis,implemented:passive', items.map((item) => item.id).join())
  check('basic passive, short ellipsis and parenthesis do not crowd the standing difficulty list', difficulties(core).length === 0)
  check('a difficulty the enclosing clause already names is not repeated', !items.some((item) => item.id === 'implemented:ellipsis'))
  check('a difficulty carries a fixed one-line rule and its restore', items[1].rule === '省略了上文已有或能推知的词' && items[1].restoreId === 's1', JSON.stringify(items[1]))
  const bubble = difficultyBubble(core, items[1])
  check('a difficulty bubble offers the restore by its kind', bubble.title === '省略' && bubble.restore?.label === '补全省略', JSON.stringify(bubble))
  check('a connector bubble names what it introduces and its role there', unitBubble(core, 'which').body === 'which 引导定语从句，在从句中作主语', unitBubble(core, 'which').body)
  check('clause selection retains connector explanations and on-demand ellipsis restoration', unitBubble(core, 'c1').body === 'which 在从句中作主语' && unitBubble(core, 'c3').body === '省略了上文已有或能推知的词' && unitBubble(core, 'c3').restore, `${unitBubble(core, 'c1').body} / ${unitBubble(core, 'c3').body}`)
  check('a model note wins in a unit bubble', unitBubble(core, 'n1').body === '说明推迟的理由', unitBubble(core, 'n1').body)
  check('an uncertain relation marks its bubble', unitBubble(byId('uncertain-modifier'), 'pp').uncertain && !unitBubble(core, 'c1').uncertain)
  check('an adjacent component stays silent but still lights its partner', unitBubble(core, 'subj') === null && Boolean(unitPartnerId(core, 'subj')), JSON.stringify(unitBubble(core, 'subj')))
  check('a complement always names the word it completes', unitBubble(byId('object-complement'), 'part')?.relation === '补充说明 him', JSON.stringify(unitBubble(byId('object-complement'), 'part')))
  check('an uncertain attachment names no guessed target', !unitBubble(byId('uncertain-modifier'), 'pp').relation, JSON.stringify(unitBubble(byId('uncertain-modifier'), 'pp')))
  check('a clause keeps its connector restore when selected via the triangle', unitBubble({ ...core, restores: [...core.restores, { id: 'antecedent-test', unitId: 'which', scopeId: 'c1', kind: 'antecedent', segments: [] }] }, 'c1').restore?.label === '代入先行词')
  const wide = coreFixtures.flatMap((fixture) => {
    const analysis = byId(fixture.id)
    if (!analysis) return []
    const bubbles = [
      ...difficulties(analysis).map((item) => difficultyBubble(analysis, item)),
      ...analysis.units.filter((unit) => !analysis.rootClauseIds.includes(unit.id)).map((unit) => unitBubble(analysis, unit.id)),
    ]
    return bubbles.filter(Boolean).filter((item) => (!item.body && !item.relation && !item.restore && !item.uncertain) || lineWidth(item.body || item.relation || '') > LIMITS.noteLine).map((item) => `${fixture.id}:${item.title}:${item.body}`)
  })
  check('every bubble body fits one line', wide.length === 0, wide.join(' | '))

  const layoutText = (analysis, restoreId) => restoreLayout(analysis, restoreId).map((item) => {
    let text = item.kind === 'insert' ? `[${item.text}]` : analysis.tokens[item.index].text
    if (item.kind === 'token' && item.lowercase) text = text[0].toLowerCase() + text.slice(1)
    if (item.capitalize) text = text[0].toUpperCase() + text.slice(1)
    return `${item.gap}${text}`
  }).join('')
  check('without a restore the layout is the sentence itself', layoutText(core, null) === core.source.sentenceText)
  check('an ellipsis restore fills words in place', layoutText(core, 's1').includes(', if [the proposal is] implemented hastily, could'), layoutText(core, 's1'))
  check('a word-order restore moves words and keeps the sentence capital', layoutText(split, 's1') === 'She did turn the offer down only then.', layoutText(split, 's1'))
  const cleft = byId('cleft')
  check('a cleft restore drops the frame', layoutText(cleft, 's1') === 'She moved to London in 1998.', layoutText(cleft, 's1'))

  const copied = copyText(core)
  const copiedLines = copied.split('\n')
  check('copy lists each difficulty rule once and every restore', copiedLines.filter((line) => line === '省略：省略了上文已有或能推知的词').length === 1 && copied.includes('补全省略：if the proposal is implemented hastily'), copied)
  check('copy leaves out a rule that has no explanation', !copiedLines.some((line) => /：$/.test(line)) && !copiedLines.includes('被动：'), copied)
  check('copy capitalises a restore that starts the sentence', copyText(split).includes('正常语序：She did turn the offer down only then.'), copyText(split))
}

{
  const sentence = 'In front of me was an array of foods I could not name in my language.'
  const tokens = tokenizeSentence(sentence)
  const aligned = alignRestore(tokens, [{ id: 'c0', start: 0, end: tokens.length }], 'an array of foods I could not name in my language was in front of me.')
  const inFront = aligned.segments.find((segment) => 'start' in segment && tokens[segment.start].text.toLowerCase() === 'in' && tokens[segment.start + 1]?.text === 'front')
  check('the aligner reuses the phrase the restore words continue, not a lone later match', Boolean(inFront) && aligned.segments.every((segment) => !('start' in segment) || segment.start !== 0 || tokens[segment.end - 1].text !== 'In'), JSON.stringify(aligned.segments))
  const series = 'They have settled in the sea, stuck inside rocks and fallen in snow.'
  const seriesTokens = tokenizeSentence(series)
  const stuck = seriesTokens.findIndex((token) => token.text === 'stuck')
  const borrowed = alignRestore(seriesTokens, [{ id: 'u2', start: stuck, end: stuck + 3 }, { id: 'c0', start: 0, end: seriesTokens.length }], 'they have stuck inside rocks', { borrowFirst: true })
  check('an ellipsis restore borrows the shared words into its own unit first', borrowed.scopeId === 'u2' && JSON.stringify(borrowed.segments) === JSON.stringify([{ text: 'they have' }, { start: stuck, end: stuck + 3 }]), JSON.stringify(borrowed))
}

const base = compileFixture({
  id: 'base',
  sentenceText: 'She smiled.',
  translationZh: '她笑了。',
  roots: ['c0'],
  units: [
    { id: 'c0', quote: 'She smiled.', form: 'clause' },
    { id: 'subj', quote: 'She', role: 'subject', form: 'word', layer: 'c0', parent: 'c0', zh: ['她'] },
    { id: 'pred', quote: 'smiled', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0', zh: ['笑了'] },
  ],
  relations: [{ id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] }],
}, { id: 'base' })

function broken(mutate, code, name = code) {
  const copy = structuredClone(base)
  mutate(copy)
  const result = validateSentenceAnalysis(copy)
  check(`reject ${name}`, hasCode(result, code), codes(result).join(','))
}

broken((value) => { value.schemaVersion = 'nope' }, 'SCHEMA_VERSION')
broken((value) => { value.extra = true }, 'UNKNOWN_FIELD')
broken((value) => { value.source.sentenceText = ' She smiled.' }, 'SOURCE_TEXT')
broken((value) => { value.tokens[0].text = 'They' }, 'TOKENS_MISMATCH')
broken((value) => { value.units[1].id = 'c0' }, 'DUPLICATE_ID')
broken((value) => { value.units[1].spans = [{ start: 5, end: 9 }] }, 'BAD_SPAN')
broken((value) => { value.units[1].role = 'wizard' }, 'BAD_ENUM')
broken((value) => { value.units[1].layerId = 'missing' }, 'DANGLING_REF')
broken((value) => {
  value.units[1].parentId = 'pred'
  value.units[2].parentId = 'subj'
}, 'PARENT_CYCLE')
broken((value) => {
  value.units.push({
    id: 'deep',
    spans: [{ start: 0, end: 1 }],
    form: 'word',
    role: 'head',
    layerId: 'c0',
    parentId: 'pred',
    obstacles: [],
    translationRanges: [],
  })
  let parent = 'deep'
  for (let index = 0; index < 17; index += 1) {
    const id = `d${index}`
    value.units.push({
      id,
      spans: [{ start: 0, end: 1 }],
      form: 'word',
      role: 'head',
      layerId: 'c0',
      parentId: parent,
      obstacles: [],
      translationRanges: [],
    })
    parent = id
  }
}, 'DEPTH_LIMIT')
broken((value) => { value.rootClauseIds = [] }, 'ROOT_INVALID')
broken((value) => {
  value.units[1].layerId = 'subj'
}, 'LAYER_INVALID', 'LAYER_INVALID self word')
broken((value) => {
  value.units.push({
    id: 'other',
    spans: [{ start: 2, end: 3 }],
    form: 'word',
    role: 'predicate',
    layerId: null,
    parentId: 'c0',
    obstacles: [],
    translationRanges: [],
  })
  value.relations[0].to = ['other']
}, 'CROSS_LAYER_SP')
broken((value) => {
  value.units[2].parentId = 'subj'
}, 'CONTAINMENT')
broken((value) => { value.units[1].sense = 'time' }, 'SENSE_MISPLACED')
broken((value) => { value.units[1].role = null }, 'ROLE_MISSING')
broken((value) => {
  value.units.push({
    id: 'ger',
    spans: [{ start: 0, end: 1 }],
    form: 'gerund',
    role: 'predicate',
    layerId: 'c0',
    parentId: 'c0',
    obstacles: [],
    translationRanges: [],
  })
}, 'NONFINITE_AS_PREDICATE')
broken((value) => { value.units[1].translationRanges[0].quote = '他' }, 'TRANSLATION_RANGE')
broken((value) => { value.relations[0].to = [] }, 'RELATION_EMPTY')
broken((value) => { value.gaps = ['缺一个状语'] }, 'STATUS_SHAPE', 'STATUS_SHAPE ok gaps')
broken((value) => {
  value.status = 'partial'
}, 'STATUS_SHAPE', 'STATUS_SHAPE partial missing gaps')
broken((value) => {
  value.status = 'unavailable'
  delete value.unavailableReason
}, 'STATUS_SHAPE', 'STATUS_SHAPE unavailable')
broken((value) => { value.units[1].noteZh = '注'.repeat(81) }, 'SIZE_LIMIT')
broken((value) => {
  value.status = 'partial'
  value.gaps = ['x'.repeat(140 * 1024)]
}, 'SIZE_LIMIT', 'SIZE_LIMIT serialized')

const layerCycle = structuredClone(base)
layerCycle.units.push(
  {
    id: 'c1',
    spans: [{ start: 0, end: 1 }],
    form: 'clause',
    role: 'object',
    layerId: 'c2',
    parentId: 'c0',
    obstacles: [],
    translationRanges: [],
  },
  {
    id: 'c2',
    spans: [{ start: 0, end: 1 }],
    form: 'clause',
    role: 'object',
    layerId: 'c1',
    parentId: 'c0',
    obstacles: [],
    translationRanges: [],
  },
)
check('reject layer cycle', hasCode(validateSentenceAnalysis(layerCycle), 'PARENT_CYCLE'), codes(validateSentenceAnalysis(layerCycle)).join(','))

if (failed > 0) {
  console.error(`FAILED ${failed}  passed ${passed}`)
  process.exit(1)
}
console.log(`OK ${passed}`)
