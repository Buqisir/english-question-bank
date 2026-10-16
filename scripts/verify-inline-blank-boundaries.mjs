import assert from 'node:assert/strict'
import { validateInlineBlankTextBoundaries } from '../shared/paper-canonical/inlineBlankBoundaries.mjs'
import { grammarFillPromptPrefix } from '../shared/paper-canonical/grammarFillPromptContract.mjs'
import { canonicalizeVisibleEnglishTypography } from '../shared/paper-canonical/visibleTypography.mjs'
import { replayCanonicalVisibleTypography } from '../shared/paper-canonical/visibleTypographyReplay.mjs'

const text = value => ({ kind: 'text', text: value })
const blank = { kind: 'blank_ref', blankId: 'b56' }
function check(inlines, family = 'grammar-fill', prompt) {
  const blankRefs = inlines.filter(node => node.kind === 'blank_ref').map(node => ({ blankId: node.blankId }))
  const groups = [{
    identity: { groupId: 'g' },
    variant: { family, promptBindings: [{ blankId: 'b56', ...(prompt ? { prompt } : {}) }] },
    blankRefs, questionRefs: blankRefs.map((_, index) => ({ questionId: `q${56 + index}` })),
    content: { blocks: [{ kind: 'paragraph', nodeId: 'p', inlines }] },
  }]
  const before = JSON.stringify(groups)
  const result = validateInlineBlankTextBoundaries(groups)
  assert.equal(JSON.stringify(groups), before, 'validation must not repair signed text')
  return result
}

assert.deepEqual(check([text('Before '), blank, text(' after.')]), [])
assert.deepEqual(check([text('Before\uFEFF'), blank, text('\uFEFFafter')]).map(issue => issue.side), ['left', 'right'], 'zero-width BOM is not prose spacing')
for (const [left, right, sides] of [
  ['Before', ' after.', ['left']],
  ['Before ', 'after.', ['right']],
  ['Before', 'after.', ['left', 'right']],
]) {
  const issues = check([text(left), blank, text(right)])
  assert.deepEqual(issues.map(issue => issue.side), sides)
  assert(issues.every(issue => issue.code === 'INLINE_BLANK_SEPARATOR_MISSING'
    && issue.groupId === 'g' && issue.blockId === 'p'
    && issue.blankId === 'b56' && issue.questionId === 'q56'
    && issue.path === '$.questionGroups[0].content.blocks[0].inlines[1]'))
}
assert.deepEqual(check([text('word'), text(''), text(' '), blank, text(''), text(' after')]), [])
assert.deepEqual(check([text('word'), text(''), blank, text(''), text('next')]).map(x => x.side), ['left', 'right'])
assert.deepEqual(check([blank]), [])
const secondBlank = { kind: 'blank_ref', blankId: 'b57' }
assert.deepEqual(check([blank, secondBlank]).map(issue => [issue.blankId, issue.side]), [['b56', 'right'], ['b57', 'left']])
assert.deepEqual(check([blank, text(' '), secondBlank]), [])
for (const punctuation of ['?', ',', '.', ';', ':', '!', ')', ']']) {
  assert.deepEqual(check([blank, text(punctuation)]), [])
}
assert.deepEqual(check([text('('), blank, text(')')]), [])
assert.deepEqual(check([text('Sentence.'), blank, text(' Next.')], 'seven-choices').map(x => x.side), ['left'])
assert.deepEqual(check([text('Sentence. '), blank, text(' Next.')], 'seven-choices'), [])
assert.deepEqual(check([text('Before '), blank, text('(word) after')], 'grammar-fill', 'word'), [])
assert.deepEqual(check([text('Before '), blank, text(' (word)'), text('after')], 'grammar-fill', 'word').map(x => x.side), ['right'])
assert.deepEqual(check([text('Before '), blank, text('(word)'), text(' after')], 'grammar-fill', 'word'), [])
assert.equal(check([text('well-'), blank])[0].code, 'INLINE_BLANK_BOUNDARY_REVIEW_REQUIRED')
assert.equal(grammarFillPromptPrefix(text('(noun)—particularly'), 'noun'), '(noun)')
for (const family of ['grammar-fill', 'cloze', 'seven-choices']) {
  assert.deepEqual(check([text('Before—'), blank, text('—after')], family), [])
  assert.deepEqual(check([text('She said, “'), blank, text('” today.')], family), [])
  assert.deepEqual(check([text('Before”'), blank, text('“after')], family).map(x => x.code),
    ['INLINE_BLANK_BOUNDARY_REVIEW_REQUIRED', 'INLINE_BLANK_BOUNDARY_REVIEW_REQUIRED'])
}
for (const suffix of [[text('(noun)—particularly')], [text('(noun)'), text('—particularly')]]) {
  assert.deepEqual(check([text('Before '), blank, ...suffix], 'grammar-fill', 'noun'), [])
}
for (const punctuation of ['-', '–', '"', '’']) {
  assert.equal(grammarFillPromptPrefix(text(`(noun)${punctuation}after`), 'noun'), null)
  assert.deepEqual(check([text(`Before${punctuation}`), blank, text(`${punctuation}after`)]).map(x => x.code),
    ['INLINE_BLANK_BOUNDARY_REVIEW_REQUIRED', 'INLINE_BLANK_BOUNDARY_REVIEW_REQUIRED'])
}
assert.equal(grammarFillPromptPrefix(text('(noun)particularly'), 'noun'), null)
assert.deepEqual(check([blank, text('(noun)'), text('particularly')], 'grammar-fill', 'noun').map(x => x.code),
  ['INLINE_BLANK_SEPARATOR_MISSING'])
// A text inline ends before a blank; it is not the end of the paragraph.
for (const normalize of [canonicalizeVisibleEnglishTypography, replayCanonicalVisibleTypography]) {
  assert.equal(normalize('shuttle(接驳车) ', '3'), 'shuttle (接驳车)', 'historical v3 remains immutable')
  for (const separator of [' ', '\t', '  ']) {
    const normalized = normalize(`shuttle(接驳车)${separator}`, '4')
    assert.equal(normalized, `shuttle (接驳车)${separator}`)
    assert.deepEqual(check([text(normalized), blank, text(' after.')]), [])
    assert.equal(normalize(normalized, '4'), normalized)
  }
  assert.deepEqual(check([text(normalize('shuttle(接驳车)', '4')), blank]).map(x => x.code),
    ['INLINE_BLANK_SEPARATOR_MISSING'], 'normalization must not invent absent source spacing')
  assert.equal(normalize('word（释义）  , next', '4'), 'word (释义), next')
}
console.log('PASS inline blank boundaries: directional punctuation, split text, hints, paragraph edges, identities and immutability')
