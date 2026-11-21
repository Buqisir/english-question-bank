import { deepStrictEqual, throws } from 'node:assert/strict'
import { test } from 'node:test'
import { moveUnderline } from './mark-redo.mjs'

const item = { text: 'its it', sourceEmphasis: [{ start: 0, end: 2, marks: ['bold', 'underline'] }] }

test('moves an underline out of a word and preserves its marks', () => {
  deepStrictEqual(moveUnderline(item, '0,2', '4,6', 'it'),
    [{ start: 4, end: 6, marks: ['bold', 'underline'] }])
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
