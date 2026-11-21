import { deepStrictEqual, throws } from 'node:assert/strict'
import { test } from 'node:test'
import { assertMarkPushReceipt, moveUnderline } from './mark-redo.mjs'

const item = { text: 'its it', sourceEmphasis: [{ start: 0, end: 2, marks: ['bold', 'underline'] }] }

test('moves an underline out of a word and preserves its marks', () => {
  // Zhejiang Jan 2024, source p. 3: “its” is plain and “make it seem” marks “it” in bold and underline.
  deepStrictEqual(moveUnderline(item, '0,2', '4,6', 'it'),
    [{ start: 4, end: 6, marks: ['bold', 'underline'] }])
})

test('push requires the merged edit to match the current mark receipt', () => {
  const edit = { baseRevisionId: 'rev-test', block: 'reading-b:1', from: '0,2', to: '4,6', text: 'it' }
  assertMarkPushReceipt({ edit: { ...edit } }, edit)
  throws(() => assertMarkPushReceipt({}, edit), /缺少画线修订回执/)
  throws(() => assertMarkPushReceipt({ edit }, { ...edit, to: '7,9' }), /与当前回执不符/)
})

test('adds a missing underline', () => {
  deepStrictEqual(moveUnderline({ text: 'its it' }, 'none', '4,6', 'it'),
    [{ start: 4, end: 6, marks: ['underline'] }])
})

test('rejects mismatched slices and destinations inside a word', () => {
  throws(() => moveUnderline(item, '1,3', '4,6', 'it'), /坐标文本/)
  throws(() => moveUnderline(item, '0,2', '3,5', 'it'), /坐标文本/)
  throws(() => moveUnderline(item, 'none', '0,2', 'it'), /整词/)
})
