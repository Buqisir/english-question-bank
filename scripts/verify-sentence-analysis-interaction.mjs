#!/usr/bin/env node
import assert from 'node:assert/strict'
import { compileFixture } from '../shared/sentence-analysis/compileFixture.mjs'
import { coreFixtures } from '../shared/sentence-analysis/fixtures/core-samples.mjs'
import { paperFixtures } from '../shared/sentence-analysis/fixtures/paper-2026-i.mjs'
import { coverage, difficulties, teachingPoints, unitBubble, copyText, unitText, unitDisplayLabel } from '../shared/sentence-analysis/derive.mjs'
import { validateSentenceAnalysis } from '../shared/sentence-analysis/validate.mjs'
import { compileModelReply } from '../server/paper-sentence-analysis/runtime.mjs'
import { PROMPT_EXAMPLES } from '../server/paper-sentence-analysis/prompt.mjs'
import { initialInteraction, reduceInteraction, interactionView, canEscape } from '../app/src/features/paper-browse/selection/sentence-analysis/sentenceInteraction.ts'
import { packAnnotations } from '../app/src/features/paper-browse/selection/sentence-analysis/annotationLayout.ts'
import { tokenStates } from '../app/src/features/paper-browse/selection/sentence-analysis/sentencePaint.ts'
import { capsuleGroups } from '../app/src/features/paper-browse/selection/sentence-analysis/capsuleGroups.ts'
import { persistentLabelUnits, visibleFlags, visibleRoleUnits, capsuleLabel } from '../app/src/features/paper-browse/selection/sentence-analysis/sentencePresentation.ts'
import { underlinePaths } from '../app/src/features/paper-browse/selection/sentence-analysis/underlines.ts'

let passed = 0
function check(name, run) { run(); passed++; console.log(`PASS ${name}`) }
const sample = id => compileFixture(coreFixtures.find(item => item.id === id))
const analysis = sample('core-main')
const unit = analysis.units.find(item => item.form === 'clause' && item.role)
const reduce = (state, action) => reduceInteraction(state, action, analysis)
const selected = reduce(initialInteraction(), { type: 'select-unit', unitId: unit.id })

check('selecting a component again clears its highlight and explanation together', () => {
  assert.equal(interactionView(selected).open.unitId, unit.id)
  assert.deepEqual(reduce(selected, { type: 'select-unit', unitId: unit.id }), initialInteraction())
})
check('a new component clears restoration, logical-subject and legend state', () => {
  let state = reduce(selected, { type: 'logical-subject' })
  state = reduce(state, { type: 'restore-start', to: 'restore' })
  state = reduce(state, { type: 'role', role: 'attributive' })
  const view = interactionView(state)
  assert.equal(view.selectedRole, 'attributive')
  assert.equal(view.logicalSubjectActive, false)
  assert.equal(view.pending, null)
  assert.equal(view.open, null)
  assert.equal(view.restored, null)
})
check('entering then selecting an internal word preserves the entered path', () => {
  let state = reduce(selected, { type: 'enter', unitId: unit.id })
  state = reduce(state, { type: 'select-unit', unitId: 'internal' })
  assert.equal(state.scopePath.at(-1), unit.id)
  assert.equal(interactionView(state).focus.unitId, 'internal')
})
check('Escape first clears selection, then returns a layer, then releases the card', () => {
  let state = reduce(selected, { type: 'enter', unitId: unit.id })
  state = reduce(state, { type: 'select-unit', unitId: 'internal' })
  state = reduce(state, { type: 'escape' })
  assert.equal(state.scopePath.at(-1), unit.id)
  assert.equal(state.selection.kind, 'none')
  state = reduce(state, { type: 'escape' })
  assert.deepEqual(state.scopePath, [])
  assert.equal(canEscape(state), false)
})
check('locating the main clause clears the path and increments its cue once', () => {
  let state = reduce(selected, { type: 'enter', unitId: unit.id })
  state = reduce(state, { type: 'main' })
  assert.deepEqual(state.scopePath, [])
  assert.equal(interactionView(state).mainActive, true)
  assert.equal(state.locate, 1)
  assert.equal(reduce(state, { type: 'main' }).locate, 2)
})
check('difficulty stepping keeps the chosen difficulty open; direct repeat toggles it', () => {
  const action = { type: 'select-flag', unitId: unit.id, flagId: 'flag' }
  const state = reduce(selected, action)
  assert.equal(reduce(state, action).selection.kind, 'none')
  assert.equal(reduce(state, { ...action, step: true }).selection.flagId, 'flag')
})
check('restoration has separate leaving and committed phases', () => {
  let state = reduce(selected, { type: 'restore-start', to: 'restore' })
  assert.equal(state.restored, null)
  assert.equal(state.pending.to, 'restore')
  state = reduce(state, { type: 'restore-finish', to: 'restore' })
  assert.equal(state.restored, 'restore')
  assert.equal(state.pending, null)
  assert.equal(reduce(state, { type: 'back' }).restored, null)
})
check('logical subject wins over the selected nonfinite structure and toggles off', () => {
  const data = sample('object-complement')
  const relation = data.relations.find(item => item.kind === 'logical-subject')
  const states = tokenStates(data, { kind: 'unit', unitId: relation.from }, null, null, false, null, true)
  for (const target of relation.to) for (const index of coverage(data, target)) assert.equal(states.get(index).state, 'subject')
  const off = tokenStates(data, { kind: 'unit', unitId: relation.from }, null, null, false, null, false)
  assert.equal([...off.values()].some(item => item.state === 'subject'), false)
})

const entry = (id, x, width, extra = {}) => ({ id, labelIds: [String(id)], actionFor: undefined,
  hidden: false, x, natural: x, y: 0, width, height: 25, above: true, current: false, persistent: true, ...extra })
const row = entries => ({ top: 0, textBottom: 26, boxes: [{ left: 0, right: 400, top: 0, bottom: 26 }], markers: [], entries })
const minimum = { top: 38, line: 64, locked: true }
check('selection cannot move an existing capsule or change the reading frame', () => {
  const base = packAnnotations([row([entry(1, 100, 100)])], 400, 18, minimum)
  const focus = packAnnotations([row([entry(1, 100, 100, { current: true }), entry(2, 100, 180, { persistent: false })])], 400, 18, minimum)
  assert.deepEqual([focus.entries[0].x, focus.entries[0].y], [base.entries[0].x, base.entries[0].y])
  assert.equal(focus.lineHeight, base.lineHeight)
  assert.equal(focus.paddingTop, base.paddingTop)
  assert.equal(focus.entries[1].hidden, true)
})
check('a local action flips left without moving the owning capsule', () => {
  const result = packAnnotations([row([entry(1, 320, 70), entry(2, 320, 80, { persistent: false, actionFor: '1', labelIds: [] })])], 400, 18, minimum)
  assert.equal(result.entries[0].x, 320)
  assert.equal(result.entries[1].x, 236)
  assert.equal(result.entries[1].y, result.entries[0].y)
})
check('an action with no horizontal room yields to the detail area', () => {
  const result = packAnnotations([row([entry(1, 0, 400), entry(2, 0, 80, { persistent: false, actionFor: '1', labelIds: [] })])], 400, 18, minimum)
  assert.deepEqual(result.crowded, ['action:1'])
  assert.equal(result.entries[1].hidden, true)
  assert.equal(result.lineHeight, 64)
})
check('difficulty flags preserve clearance below connector hit areas', () => {
  const input = row([entry(1, 100, 70, { above: false })])
  input.markers.push({ left: 100, right: 124, top: 24, bottom: 46 })
  input.boxes.push(input.markers[0])
  const result = packAnnotations([input], 400, 18, minimum)
  assert.ok(result.entries[0].y >= 54)
})
check('layout is deterministic and never mutates its measurements', () => {
  const input = [row([entry(1, 100, 100), entry(2, 120, 100)])]
  const before = structuredClone(input)
  const first = packAnnotations(input, 400, 18, minimum)
  assert.deepEqual(packAnnotations(input, 400, 18, minimum), first)
  assert.deepEqual(input, before)
})
// Measured from the Shenzhen paper's infinitive + parallel-clause row.
const adjacentCapsules = () => [entry(1, 47.2109375, 111.7734375),
  entry(2, 94.65625, 180.5078125, { height: 31 }),
  entry(3, 253.140625, 27.8359375, { height: 26.5 }),
  entry(4, 364.140625, 27.8359375, { height: 26.5 })]
check('nearby persistent capsules share a lane through bounded joint adjustment', () => {
  const result = packAnnotations([row(adjacentCapsules())], 718, 14, { top: 38, line: 44.1, locked: false })
  assert.equal(new Set(result.entries.map(item => item.y + item.height)).size, 1)
  result.entries.forEach((item, index, all) => {
    assert.ok(Math.abs(item.x - item.natural) <= 48)
    assert.ok(item.x >= 0 && item.x + item.width <= 718)
    if (index) assert.ok(item.x >= all[index - 1].x + all[index - 1].width + 4)
  })
})
check('joint placement keeps selection and local actions from moving the shared lane', () => {
  const input = adjacentCapsules()
  const base = packAnnotations([row(input)], 718, 14, { top: 38, line: 64, locked: true })
  input[1].current = true
  input.push(entry(5, 94.65625, 54, { persistent: false, actionFor: '2', labelIds: [] }))
  const focus = packAnnotations([row(input)], 718, 14, { top: 38, line: 64, locked: true })
  assert.deepEqual(focus.entries.slice(0, 4).map(item => [item.x, item.y]), base.entries.map(item => [item.x, item.y]))
  assert.equal(focus.lineHeight, base.lineHeight)
  assert.equal(focus.paddingTop, base.paddingTop)
})
check('capsules keep separate lanes when a shared row would drift too far or overflow', () => {
  for (const [width, items] of [[250, [entry(1, 0, 150), entry(2, 70, 180)]],
    [718, [entry(1, 200, 150), entry(2, 201, 180)]]]) {
    const result = packAnnotations([row(items)], width, 14, { top: 38, line: 44.1, locked: false })
    assert.equal(new Set(result.entries.map(item => item.y + item.height)).size, 2)
    assert.ok(result.entries.every(item => item.x >= 0 && item.x + item.width <= width))
  }
})

const groupedSample = compileFixture({
  id: 'grouped-capsules', sentenceText: 'She says reading books and writing stories matters.', roots: ['root'],
  units: [
    { id: 'root', quote: 'She says reading books and writing stories matters.', form: 'clause' },
    { id: 'she', quote: 'She', form: 'word', role: 'subject', parent: 'root', layer: 'root' },
    { id: 'says', quote: 'says', form: 'verb-group', role: 'predicate', parent: 'root', layer: 'root' },
    { id: 'quote', quote: 'reading books and writing stories matters', form: 'clause', role: 'object', parent: 'root', layer: 'root' },
    { id: 'pair', quote: 'reading books and writing stories', form: 'coordination', role: 'subject', parent: 'quote', layer: 'quote' },
    { id: 'read', quote: 'reading books', form: 'gerund', role: 'subject', parent: 'pair', layer: 'quote' },
    { id: 'write', quote: 'writing stories', form: 'gerund', role: 'subject', parent: 'pair', layer: 'quote' },
    { id: 'matters', quote: 'matters', form: 'verb-group', role: 'predicate', parent: 'quote', layer: 'quote' },
  ], relations: [],
})
const groupedUnits = persistentLabelUnits(groupedSample)
check('coordinated structures share terminology but keep each original-word entry', () => {
  const result = capsuleGroups(groupedSample, groupedUnits, null)
  const groups = [...result.at.values()].flat()
  const parallel = groups.find(group => group.kind === 'parallel')
  assert.deepEqual(parallel.units.map(unit => unit.id), ['read', 'write'])
  assert.deepEqual(parallel.numbers, ['①', '②'])
  // Capsules name the role; the form (动名词) waits in the explanation line.
  assert.equal(parallel.sharedLabel, '主语')
  assert.equal(result.at.get(5).find(group => group.kind === 'member').units[0].id, 'write')
  assert.equal(result.anchors.get('write'), 2)
})
check('nearby nested structures form a chain; unrelated co-located units do not', () => {
  const data = structuredClone(groupedSample)
  data.units.find(unit => unit.id === 'read').parentId = 'quote'
  const units = data.units.filter(unit => ['quote', 'read'].includes(unit.id))
  assert.equal(capsuleGroups(data, units, null).at.get(2)[0].kind, 'nested')
  data.units.find(unit => unit.id === 'read').parentId = 'root'
  assert.equal(capsuleGroups(data, units, null).at.get(2).length, 2)
})
check('incomplete coordination and the current layer retain full local capsules', () => {
  const partial = capsuleGroups(groupedSample, groupedUnits.filter(unit => unit.id !== 'write'), null)
  assert.equal([...partial.at.values()].flat().some(group => group.kind === 'parallel'), false)
  const inside = capsuleGroups(groupedSample, groupedUnits, 'read')
  assert.equal([...inside.at.values()].flat().some(group => group.kind === 'parallel'), false)
})

const appositiveSample = compileFixture({
  id: 'appositive-coordination', sentenceText: 'This summer I came face-to-face with three deep-rooted fears: heights, bears, and ageing.', roots: ['root'],
  units: [
    { id: 'root', quote: 'This summer I came face-to-face with three deep-rooted fears: heights, bears, and ageing.', form: 'clause' },
    { id: 'adv', quote: 'This summer', form: 'prepositional', role: 'adverbial', parent: 'root', layer: 'root' },
    { id: 'i', quote: 'I', form: 'word', role: 'subject', parent: 'root', layer: 'root' },
    { id: 'came', quote: 'came face-to-face with', form: 'verb-group', role: 'predicate', parent: 'root', layer: 'root' },
    { id: 'fears', quote: 'three deep-rooted fears', form: 'phrase', role: 'object', parent: 'root', layer: 'root' },
    { id: 'head', quote: 'fears', form: 'word', role: 'head', parent: 'fears', layer: 'root' },
    { id: 'appo', quote: 'heights, bears, and ageing', form: 'coordination', role: 'appositive', parent: 'root', layer: 'root' },
    { id: 'a1', quote: 'heights', form: 'word', role: 'appositive', parent: 'appo', layer: 'root' },
    { id: 'a2', quote: 'bears', form: 'word', role: 'appositive', parent: 'appo', layer: 'root' },
    { id: 'and', quote: 'and', form: 'word', parent: 'appo', layer: 'root', connector: 'coordinator' },
    { id: 'a3', quote: 'ageing', form: 'word', role: 'appositive', parent: 'appo', layer: 'root' },
  ],
  relations: [{ id: 'r1', kind: 'modifies', from: 'appo', to: ['head'], certainty: 'certain' }],
})
check('a coordinated appositive keeps a persistent capsule naming its segment', () => {
  const units = persistentLabelUnits(appositiveSample)
  const appo = units.find(unit => unit.id === 'appo')
  assert.ok(appo, 'coordination appositive shows a capsule')
  assert.equal(capsuleLabel(appositiveSample, appo, false), '同位语')
  // The strip names what the appositive explains even seated beside its noun.
  const bubble = unitBubble(appositiveSample, 'appo')
  assert.equal(bubble?.relation, '说明 fears')
  assert.equal(bubble?.relationTargetId, 'head')
})
check('a multi-word appositive keeps a capsule and a partnerless one still explains', () => {
  const sentence = compileFixture({
    id: 'appositive-phrase', sentenceText: 'Each contestant must choose a language, a choice that binds everyone.', roots: ['root'],
    units: [
      { id: 'root', quote: 'Each contestant must choose a language, a choice that binds everyone.', form: 'clause' },
      { id: 'subj', quote: 'Each contestant', form: 'phrase', role: 'subject', parent: 'root', layer: 'root' },
      { id: 'verb', quote: 'must choose', form: 'verb-group', role: 'predicate', parent: 'root', layer: 'root' },
      { id: 'obj', quote: 'a language', form: 'phrase', role: 'object', parent: 'root', layer: 'root' },
      { id: 'appo', quote: 'a choice that binds everyone', form: 'phrase', role: 'appositive', parent: 'root', layer: 'root' },
      { id: 'inner', quote: 'that binds everyone', form: 'clause', role: 'attributive', parent: 'appo', layer: 'root' },
      { id: 'that', quote: 'that', form: 'word', role: 'subject', parent: 'inner', layer: 'inner', connector: 'relative-pronoun' },
    ],
    relations: [],
  })
  // No modifies target: a sentence appositive still says one line.
  const bubble = unitBubble(sentence, 'appo')
  assert.equal(bubble?.relation, '说明前面的整句')
  const units = persistentLabelUnits(sentence)
  assert.ok(units.some(unit => unit.id === 'appo'), 'multi-word phrase appositive shows a capsule')
  assert.equal(capsuleLabel(sentence, units.find(unit => unit.id === 'appo'), false), '同位语')
  // Outer and inner capsules chain at their shared anchor region.
  const groups = capsuleGroups(sentence, units, null)
  const chain = [...groups.at.values()].flat().find(group => group.kind === 'nested')
  assert.deepEqual(chain.units.map(unit => unit.id), ['appo', 'inner'])
  // A single-word appositive stays quiet under its parent capsule.
  const word = compileFixture({
    id: 'appositive-word', sentenceText: 'My friend Tom joined us.', roots: ['root'],
    units: [
      { id: 'root', quote: 'My friend Tom joined us.', form: 'clause' },
      { id: 'subj', quote: 'My friend Tom', form: 'phrase', role: 'subject', parent: 'root', layer: 'root' },
      { id: 'tom', quote: 'Tom', form: 'word', role: 'appositive', parent: 'subj', layer: 'root' },
    ],
    relations: [],
  })
  assert.equal(persistentLabelUnits(word).some(unit => unit.id === 'tom'), false)
  // A plain coordination (并列主语) still gets no capsule.
  assert.equal(groupedUnits.some(unit => unit.id === 'pair'), false)
})
check('a short subject stroke stays two straight parallel lines', () => {
  const paths = underlinePaths('subject', 100, 104, 20)
  assert.equal(paths.length, 2)
  assert.ok(paths.every(path => /^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/.test(path.d)), 'no bowed curves under 12px')
  const long = underlinePaths('subject', 100, 200, 20)
  assert.ok(long.every(path => path.d.includes('C')), 'wide strokes keep the hand-drawn bow')
})
check('a child action is placed beside its complete joined group', () => {
  const input = row([entry(1, 100, 220, { labelIds: ['parent', 'child'] }),
    entry(2, 100, 70, { persistent: false, actionFor: 'child', labelIds: [] })])
  const result = packAnnotations([input], 400, 18, minimum)
  assert.equal(result.entries[0].x, 100)
  assert.equal(result.entries[1].x, 324)
  assert.equal(result.entries[1].y, result.entries[0].y)
})
check('grouping preserves all persistent entry points across every fixture and reading scope', () => {
  for (const fixture of [...coreFixtures, ...paperFixtures]) {
    const data = compileFixture(fixture)
    for (const scope of [null, ...data.units.map(unit => unit.id)]) {
      const units = persistentLabelUnits(data, scope)
      const before = structuredClone(data)
      const grouped = capsuleGroups(data, units, scope)
      assert.deepEqual(new Set([...grouped.at.values()].flat().flatMap(group => group.units.map(unit => unit.id))), new Set(units.map(unit => unit.id)))
      assert.deepEqual(data, before)
      for (const group of [...grouped.at.values()].flat().filter(group => group.kind === 'nested')) {
        const starts = group.units.map(unit => unit.spans[0].start)
        assert.ok(Math.max(...starts) - Math.min(...starts) <= 3)
      }
    }
  }
})
const collocationSentence = 'The plan can make life center around numbers.'
const collocationReply = { spans: [
  { text: 'The plan', role: 'subject' },
  { text: 'can make', role: 'predicate', obstacle: 'collocation', collocationText: 'make life center around numbers', note: 'make＋宾语＋动词原形：使……做……（省 to）' },
  { text: 'life', role: 'object' },
  { text: 'center around numbers', role: 'object-complement', form: 'infinitive', head: 'life' },
  { text: 'center', role: 'nonfinite-verb', obstacle: 'collocation', collocationText: 'center around', note: 'center around：围绕……' },
  { text: 'around numbers', role: 'adverbial', form: 'prepositional', head: 'center' },
] }
const compileCollocation = reply => compileModelReply(JSON.stringify(reply), collocationSentence, 'test')
const collocationAnalysis = compileCollocation(collocationReply)
const collocationFlags = difficulties(collocationAnalysis)
const highlighted = (data, flag) => [...tokenStates(data, { kind: 'unit', unitId: flag.unitId }, null, null, false, null, false, flag)]
  .filter(([, state]) => state.state === 'focused').map(([index]) => data.tokens[index].text).join(' ')

check('collocation focus crosses grammatical units without changing their roles or ranges', () => {
  const flag = collocationFlags.find(item => item.rule.startsWith('make'))
  assert.equal(highlighted(collocationAnalysis, flag), 'make life center around numbers')
  assert.equal(unitText(collocationAnalysis, flag.unitId), 'can make')
  assert.ok(collocationAnalysis.units.some(unit => unit.role === 'object' && unitText(collocationAnalysis, unit) === 'life'))
  const plain = tokenStates(collocationAnalysis, { kind: 'unit', unitId: flag.unitId }, null, null, false, null, false)
  assert.deepEqual([...plain].filter(([, state]) => state.state === 'focused').map(([index]) => index), [...coverage(collocationAnalysis, flag.unitId)])
})
check('outer sentence pattern and inner collocation remain independently selectable', () => {
  assert.equal(collocationFlags.length, 2)
  const inner = collocationFlags.find(item => item.rule.startsWith('center'))
  assert.equal(highlighted(collocationAnalysis, inner), 'center around')
  const selected = tokenStates(collocationAnalysis, { kind: 'unit', unitId: inner.unitId }, null, null, false, null, false, inner)
  assert.ok([...selected.values()].every(state => state.state === 'focused'))
})
check('old analyses without collocation ranges still highlight their original unit', () => {
  const reply = structuredClone(collocationReply)
  reply.spans.forEach(span => { delete span.collocationText })
  const data = compileCollocation(reply)
  assert.equal(highlighted(data, difficulties(data)[0]), 'can make')
})
check('fabricated, detached, or empty collocation text is discarded without losing grammar', () => {
  for (const text of ['not in the sentence', 'numbers', []]) {
    const reply = structuredClone(collocationReply)
    reply.spans[1].collocationText = text
    const data = compileCollocation(reply)
    assert.ok(data.units.some(unit => unit.role === 'predicate' && unitText(data, unit) === 'can make'))
    assert.equal(difficulties(data).some(flag => flag.rule.startsWith('make')), false)
  }
})
check('repeated discontinuous phrasal verbs bind to their own occurrence', () => {
  const sentence = 'She turned it down and turned it down again.'
  const data = compileModelReply(JSON.stringify({ spans: [
    { text: 'She', role: 'subject' },
    { text: ['turned', 'down'], role: 'predicate', obstacle: 'collocation', collocationText: ['turned', 'down'], note: 'turn down：拒绝' },
    { text: 'it', role: 'object' },
    { text: 'and', role: 'connector', connector: 'coordinator' },
    { text: ['turned', 'down'], occurrence: 2, role: 'predicate', obstacle: 'collocation', collocationText: ['turned', 'down'], note: 'turn down：拒绝' },
    { text: 'it', occurrence: 2, role: 'object' },
    { text: 'again', role: 'adverbial' },
  ] }), sentence, 'test')
  const flags = difficulties(data).filter(flag => flag.obstacle === 'collocation')
  assert.equal(flags.length, 2)
  assert.equal(highlighted(data, flags[0]), 'turned down')
  assert.equal(highlighted(data, flags[1]), 'turned down')
  assert.ok(flags[0].highlightSpans.at(-1).end < flags[1].highlightSpans[0].start)
})
check('merging redundant grammar cores preserves their precise collocation', () => {
  const sentence = 'She feels responsible for keeping it safe.'
  const data = compileModelReply(JSON.stringify({ spans: [
    { text: 'She', role: 'subject' }, { text: 'feels', role: 'predicate' },
    { text: 'responsible for keeping it safe', role: 'predicative', form: 'adjective-phrase' },
    { text: 'responsible for', role: 'predicative', obstacle: 'collocation', collocationText: 'responsible for', note: 'responsible for：对……负责' },
    { text: 'keeping it safe', role: 'object', form: 'gerund' },
    { text: 'keeping', role: 'nonfinite-verb' }, { text: 'it', role: 'object' }, { text: 'safe', role: 'object-complement' },
  ] }), sentence, 'test')
  const flags = difficulties(data)
  assert.equal(data.units.filter(unit => unit.role === 'predicative').length, 1)
  assert.equal(flags.length, 1)
  assert.equal(highlighted(data, flags[0]), 'responsible for')
})
check('idioms, metaphors and rare senses are their own difficulties with exact highlights', () => {
  const sentence = 'Those words warmed my heart and eased my fear of being “over the hill.”'
  const data = compileModelReply(JSON.stringify({ spans: [
    { text: 'Those words', role: 'subject' },
    { text: 'warmed', role: 'predicate', obstacle: 'metaphor', collocationText: 'warmed my heart', note: 'warm one’s heart：字面“暖了心”，指让人欣慰' },
    { text: 'my heart', role: 'object' },
    { text: 'and', role: 'connector', connector: 'coordinator' },
    { text: 'eased', role: 'predicate' },
    { text: 'my fear of being “over the hill.”', role: 'object' },
    { text: 'of being “over the hill.”', role: 'attributive', form: 'prepositional', head: 'fear' },
    { text: 'being “over the hill.”', role: 'object', form: 'gerund' },
    { text: 'being', role: 'nonfinite-verb' },
    { text: '“over the hill.”', role: 'predicative', obstacle: 'idiom', collocationText: 'over the hill', note: 'over the hill：字面“翻过山头”，指上了年纪、不再年轻，这一说法常带自嘲' },
  ] }), sentence, 'test')
  assert.equal(validateSentenceAnalysis(data).ok, true)
  const flags = difficulties(data)
  assert.deepEqual(flags.map(flag => flag.label).sort(), ['习语', '比喻'].sort())
  assert.equal(highlighted(data, flags.find(flag => flag.obstacle === 'metaphor')), 'warmed my heart')
  const idiom = flags.find(flag => flag.obstacle === 'idiom')
  assert.equal(highlighted(data, idiom), 'over the hill')
  // The highlight already shows the English, so an over-long gloss loses that echo instead of the whole note.
  assert.equal(idiom.rule, '字面“翻过山头”，指上了年纪、不再年轻，这一说法常带自嘲')
  // Hung on a unit inside an unopened gerund, the idiom still shows at the top level, on a visible unit.
  const visible = new Set(visibleRoleUnits(data, null).map(unit => unit.id))
  assert.equal(visible.has(idiom.unitId), false)
  const lifted = visibleFlags(data, flags, null).find(flag => flag.id === idiom.id)
  assert.ok(lifted && visible.has(lifted.unitId))
  assert.equal(highlighted(data, lifted), 'over the hill')
  const rare = compileModelReply(JSON.stringify({ spans: [
    { text: 'They', role: 'subject' },
    { text: 'addressed', role: 'predicate', obstacle: 'rare-sense', note: 'address：常见义“地址”，这里是“处理”' },
    { text: 'the problem', role: 'object' },
  ] }), 'They addressed the problem.', 'test')
  const [flag] = difficulties(rare)
  assert.equal(flag.label, '熟词生义')
  assert.equal(highlighted(rare, flag), 'addressed')
})
check('collocation contract rejects out-of-bounds, overlapping and detached ranges', () => {
  for (const spans of [[{ start: -1, end: 2 }], [{ start: 3, end: 99 }], [{ start: 3, end: 5 }, { start: 4, end: 6 }], [{ start: 0, end: 1 }], [null]]) {
    const data = structuredClone(collocationAnalysis)
    data.units.find(unit => unit.obstacles.includes('collocation')).collocationSpans = spans
    assert.equal(validateSentenceAnalysis(data).ok, false)
  }
})
const taught = sentence => {
  const example = PROMPT_EXAMPLES.find(item => item.sentence === sentence)
  return compileModelReply(JSON.stringify(example.reply), example.sentence, 'test')
}
check('simple comparisons stay recognized and clickable without a standing badge', () => {
  const data = taught('Maya is as tall as Noah.')
  const point = teachingPoints(data).find(item => item.obstacle === 'as-comparison')
  assert.equal(point.attention, 'on-demand')
  assert.equal(difficulties(data).length, 0)
  assert.match(unitBubble(data, point.unitId).body, /两人一样高/)
  assert.match(copyText(data), /两人一样高/)
  assert.ok(data.units.find(unit => unit.id === point.unitId).obstacles.includes('as-comparison'))
})
check('a contextual comparison obstacle is promoted only with its actual explanation', () => {
  const sentence = 'The budget is no more flexible than it was last year.'
  const reply = { spans: [
    { text: 'The budget', role: 'subject' }, { text: 'is', role: 'predicate' },
    { text: 'no more flexible than it was last year', role: 'predicative', obstacle: 'comparative', focusObstacles: ['comparative'], note: '今年预算并不比去年更灵活，注意 no 的否定范围' },
    { text: 'than it was last year', role: 'adverbial', form: 'clause', sense: 'comparison' },
    { text: 'than', role: 'connector' }, { text: 'it', role: 'subject' },
    { text: 'was', role: 'predicate', obstacle: 'ellipsis' }, { text: 'last year', role: 'adverbial', sense: 'time' },
  ] }
  const data = compileModelReply(JSON.stringify(reply), sentence, 'test')
  assert.equal(difficulties(data).length, 1)
  assert.equal(difficulties(data)[0].attention, 'priority')
  assert.match(difficulties(data)[0].rule, /不比去年/)
  delete reply.spans[2].note
  assert.equal(difficulties(compileModelReply(JSON.stringify(reply), sentence, 'test')).length, 0)
})
check('short ellipsis keeps its restoration on demand and can be promoted for a concrete reading obstacle', () => {
  const data = sample('core-main')
  const point = teachingPoints(data).find(item => item.obstacle === 'ellipsis')
  assert.equal(point.attention, 'on-demand')
  assert.equal(unitBubble(data, point.unitId).restore.id, point.restoreId)
  const unit = data.units.find(item => item.id === point.unitId)
  unit.focusObstacles = ['ellipsis']
  unit.noteZh = '省略的是提案被实施，不能把提案理解为动作执行者'
  assert.equal(difficulties(data).find(item => item.obstacle === 'ellipsis').attention, 'priority')
})
check('subjunctive explanations distinguish the past assumption from its present result', () => {
  const data = taught('If Maya had left earlier, she would feel calmer now.')
  const points = difficulties(data)
  assert.deepEqual(points.map(item => item.attention), ['priority', 'priority'])
  assert.match(points.find(item => item.obstacle === 'subjunctive-past').rule, /过去更早离开/)
  assert.match(points.find(item => item.obstacle === 'subjunctive-present').rule, /现在的结果/)
  const unit = data.units.find(item => item.obstacles.includes('subjunctive-present'))
  unit.obstacles.unshift('passive')
  assert.match(unitBubble(data, unit.id).body, /现在的结果/)
  unit.obstacles = ['subjunctive-future']
  delete unit.noteZh
  assert.match(difficulties(data).find(item => item.obstacle === 'subjunctive-future').rule, /尚不能断定/)
})
check('ordinary passive is named in the predicate capsule without a stock explanation', () => {
  const data = compileModelReply(JSON.stringify({ spans: [
    { text: 'Wires', role: 'subject' },
    { text: 'were placed', role: 'predicate', obstacle: 'passive' },
  ] }), 'Wires were placed.', 'test')
  const predicate = data.units.find(item => item.role === 'predicate')
  assert.equal(unitDisplayLabel(data, predicate), '谓语（被动）')
  // The subject sits right before it and lights up, so the bubble adds nothing.
  assert.equal(unitBubble(data, predicate.id), null)
  assert.equal(difficulties(data).length, 0)
  predicate.noteZh = '主语是动作的承受者'
  assert.equal(unitBubble(data, predicate.id), null)
  predicate.noteZh = '这里强调电线被放置，而没有说明是谁放置的'
  predicate.focusObstacles = ['passive']
  assert.equal(unitBubble(data, predicate.id).body, predicate.noteZh)
  assert.equal(difficulties(data)[0].rule, predicate.noteZh)
})
check('difficulty navigation prioritizes a reading obstacle before an earlier collocation', () => {
  const sentence = 'Maya gave up, but she would have stayed without the storm.'
  const data = compileModelReply(JSON.stringify({ spans: [
    { text: 'Maya gave up', role: 'main', form: 'clause' },
    { text: 'Maya', role: 'subject' },
    { text: 'gave up', role: 'predicate', obstacle: 'collocation', collocationText: 'gave up', note: 'give up：放弃' },
    { text: 'but', role: 'connector', connector: 'coordinator' },
    { text: 'she would have stayed without the storm', role: 'main', form: 'clause' },
    { text: 'she', role: 'subject' },
    { text: 'would have stayed', role: 'predicate', obstacle: 'subjunctive-past', note: '假设过去没有暴风雨，她本会留下' },
    { text: 'without the storm', role: 'adverbial', sense: 'condition' },
  ] }), sentence, 'test')
  assert.deepEqual(difficulties(data).map(item => item.obstacle), ['subjunctive-past', 'collocation'])
  assert.deepEqual(teachingPoints(data).map(item => item.obstacle), ['collocation', 'subjunctive-past'])
})
check('focus metadata must refer to a recognized obstacle and tolerates old payloads', () => {
  const data = taught('Maya is as tall as Noah.')
  const unit = data.units.find(item => item.obstacles.includes('as-comparison'))
  for (const bad of [null, 'as-comparison', ['unknown'], ['ellipsis'], ['as-comparison', 'as-comparison']]) {
    unit.focusObstacles = bad
    assert.equal(validateSentenceAnalysis(data).ok, false)
  }
  delete unit.focusObstacles
  assert.equal(validateSentenceAnalysis(data).ok, true)
  assert.equal(difficulties(data).length, 0)
})
check('a nonfinite voice names its doer and action in place of the relation line', () => {
  const reply = { translationZh: '昨天颁发的奖牌是金牌。', spans: [
    { text: 'The medals awarded yesterday', role: 'subject' },
    { text: 'awarded yesterday', role: 'attributive', form: 'past-participle', head: 'medals', voice: 'passive', action: '颁发' },
    { text: 'awarded', role: 'nonfinite-verb' },
    { text: 'were', role: 'predicate' },
    { text: 'gold', role: 'predicative', voice: 'passive', action: '变成' },
  ] }
  const data = compileModelReply(JSON.stringify(reply), 'The medals awarded yesterday were gold.', 'test')
  assert.equal(validateSentenceAnalysis(data).ok, true)
  const attributive = data.units.find(item => item.role === 'attributive')
  assert.equal(attributive.voice, 'passive')
  assert.equal(attributive.actionZh, '颁发')
  assert.equal(unitBubble(data, attributive.id).relation, '逻辑主语是 medals，与「颁发」是被动关系')
  // A voice on anything but a nonfinite structure is dropped, not fatal.
  assert.equal(data.units.find(item => item.role === 'predicative').voice, undefined)
  attributive.voice = 'completed'
  attributive.actionZh = '落下'
  assert.equal(unitBubble(data, attributive.id).relation, '逻辑主语是 medals，表示已经「落下」')
  delete attributive.actionZh
  attributive.voice = 'active'
  assert.equal(unitBubble(data, attributive.id).relation, '逻辑主语是 medals，表示主动')
  const bad = structuredClone(data)
  bad.units.find(item => item.role === 'predicate').voice = 'passive'
  assert.equal(validateSentenceAnalysis(bad).ok, false)
})
check('a linking being gets no voice line even when the model gives one', () => {
  const reply = { translationZh: '我们发现他很开心。', spans: [
    { text: 'We', role: 'subject' },
    { text: 'found', role: 'predicate' },
    { text: 'him', role: 'object' },
    { text: 'being happy', role: 'object-complement', form: 'present-participle', head: 'him', voice: 'active', action: '是' },
    { text: 'being', role: 'nonfinite-verb' },
    { text: 'happy', role: 'predicative' },
  ] }
  const data = compileModelReply(JSON.stringify(reply), 'We found him being happy.', 'test')
  const complement = data.units.find(item => item.role === 'object-complement')
  assert.equal(complement.voice, undefined)
  assert.equal(unitBubble(data, complement.id).relation, '补充说明 him')
})
console.log(`OK ${passed} sentence interaction/layout checks`)
