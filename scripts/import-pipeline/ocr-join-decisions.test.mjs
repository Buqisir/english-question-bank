import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeLineFacts } from './ocr-line-facts.mjs'
import { decideLineJoin } from './ocr-join-decisions.mjs'

const location = { before: { documentId: 'answers', page: 1, itemId: 'i1' },
  after: { documentId: 'answers', page: 2, itemId: 'i2' } }
const reference = () => ({
  content: 'reference', previous: { role: 'body', right: .9, page: 1 },
  current: computeLineFacts({ text: 'Another day began.', page: 2, left: .1 }),
  geometry: { unit: 'normalized', margin: { left: .1, right: .9 } },
  roles: { hasParagraph: true, special: null, afterClosing: false, numbered: false }, location,
})

test('integer transcript coordinates quantize the fractional indent ceiling without losing the next pixel boundary', () => {
  const first = [{ text: 'M:', box: { left: 55, top: 535, width: 20, height: 28 } },
    { text: 'This is the room we are in. It’s', box: { left: 78, top: 535, width: 1060, height: 28 } }]
  for (const [left, continuation, expected] of [[88, true, 'join'], [89, true, 'separate'], [88, false, 'separate']]) {
    const next = [{ text: 'located', box: { left, top: 571, width: 64, height: 28 } }]
    const before = { first, last: first, firstFacts: computeLineFacts({ words: first }), lastFacts: computeLineFacts({ words: first }) }
    const after = { first: next, last: next, firstFacts: computeLineFacts({ words: next }), lastFacts: computeLineFacts({ words: next }) }
    const result = decideLineJoin({ content: 'transcript', previous: computeLineFacts({ text: 'M: This is the room we are in. It’s' }),
      current: computeLineFacts({ text: 'located upstairs.' }), geometry: { unit: 'pixels', before, after, rights: [before.lastFacts.box] },
      roles: { turnContinuation: continuation }, location })
    assert.equal(result.resolution, expected, `${left}/${continuation}`)
  }
})

test('review decisions carry the old deterministic resolution, exact reviews and both source locators', () => {
  const input = reference()
  const before = structuredClone(input)
  const result = decideLineJoin(input)
  assert.equal(result.action, 'review')
  assert.equal(result.resolution, 'separate')
  assert.equal(result.reason, 'reference.page-turn')
  assert.deepEqual(result.location, location)
  assert.deepEqual(result.reviews, [{ itemId: 'i2',
    issue: 'paragraph continues across a page turn; split into two located paragraphs' }])
  assert.deepEqual(input, before)
})

test('hyphen review remains present when a short previous line now forces separation', () => {
  const input = reference()
  input.previous.right = .5
  input.current = computeLineFacts({ text: 'and a well-', page: 1, left: .1 })
  const result = decideLineJoin(input)
  assert.equal(result.action, 'review')
  assert.equal(result.resolution, 'separate')
  assert.equal(result.boundary.previousShort, true)
  assert.equal(result.boundary.continues, false)
  assert.equal(result.reviews[0].issue, 'line ends with a hyphen; joined with a space')
})

test('previous-page short-line geometry never replaces the current-page indentation margin', () => {
  const input = reference()
  input.previous.right = .65
  input.current = computeLineFacts({ text: 'Another day began.', page: 2, left: .14 })
  input.geometry.previousMargin = { left: .3, right: .65 }
  const result = decideLineJoin(input)
  assert.equal(result.boundary.previousShort, false)
  assert.equal(result.boundary.indented, true)
  assert.equal(result.reason, 'reference.indented')
  assert.equal(result.resolution, 'separate')
  assert.deepEqual(result.reviews, [])
})

test('coordinate units cannot accidentally route normalized reference facts through pixel speech policy', () => {
  assert.throws(() => decideLineJoin({ ...reference(), geometry: { unit: 'pixels' } }), /coordinate unit/u)
  assert.throws(() => decideLineJoin({ ...reference(), content: 'transcript' }), /coordinate unit/u)
  assert.throws(() => decideLineJoin({ ...reference(), content: 'missing' }), /Invalid join policy/u)
})
