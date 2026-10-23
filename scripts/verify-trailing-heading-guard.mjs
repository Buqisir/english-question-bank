import assert from 'node:assert/strict'
import { trailingHeadingHints, trailingHeadingMessage } from './import-pipeline/trailing-heading-guard.mjs'

const group = (family, roles) => ({
  groupId: `group:${family}`, family,
  blocks: roles.map((role, index) => ({ blockId: `block:${family}:${index + 1}`, role })),
})
for (const role of ['subtitle', 'title', 'heading']) {
  const hints = trailingHeadingHints({ groups: [group('reading', ['body', role])] })
  assert.deepEqual(hints, [{ groupId: 'group:reading', blockId: 'block:reading:2', role }])
  assert.match(trailingHeadingMessage(hints),
    /漏图或漏正文[\s\S]*group:reading.*block:reading:2[\s\S]*OCR[\s\S]*figure[\s\S]*--redo-from compile/u)
}
assert.deepEqual(trailingHeadingHints({ groups: [
  group('reading', ['subtitle', 'body']),
  group('reading', ['subtitle', 'figure']),
  group('cloze', ['body']),
  group('grammar', []),
  { groupId: 'no-blocks', family: 'reading' },
  ...['application-writing', 'continuation-writing'].flatMap((family) =>
    ['subtitle', 'title', 'heading'].map((role) => group(family, [role]))),
] }), [])
assert.deepEqual(trailingHeadingHints({}), [])
assert.equal(trailingHeadingHints({ groups: [
  group('reading', ['title']), group('cloze', ['heading']), group('grammar', ['subtitle']),
] }).length, 3, 'report every affected non-writing group')
console.log('PASS trailing-heading guard')
