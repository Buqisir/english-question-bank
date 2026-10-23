import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateInlineBlankTextBoundaries } from '../../shared/paper-canonical/inlineBlankBoundaries.mjs'

function check(left) {
  return validateInlineBlankTextBoundaries([{
    identity: { groupId: 'grammar' }, variant: { family: 'grammar-fill' },
    blankRefs: [{ blankId: 'b63' }], questionRefs: [{ questionId: 'q63' }],
    content: { blocks: [{ kind: 'paragraph', nodeId: 'p', inlines: [
      { kind: 'text', text: left }, { kind: 'blank_ref', blankId: 'b63' },
      { kind: 'text', text: ' success and failure.' },
    ] }] },
  }])
}

test('a Chinese gloss ending at the blank is a prose boundary, including normalized parentheses', () => {
  for (const text of ['an exciting margin（差距）', 'an exciting margin(差距)',
    'a transfer（换乘，转车）']) assert.deepEqual(check(text), [])
})

test('English parentheticals and bare words still require a separator', () => {
  for (const text of ['an exciting margin', 'an exciting margin(gap)', 'a word(差距)next']) {
    assert.equal(check(text)[0]?.code, 'INLINE_BLANK_SEPARATOR_MISSING')
  }
})
