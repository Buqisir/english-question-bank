#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { stableStringify, sha256, digestJson } from '../shared/paper-canonical/stable.mjs'
import * as legacy from '../test-fixtures/review-compatibility/legacyStable.mjs'

const source = readFileSync(new URL('../shared/paper-canonical/stable.mjs', import.meta.url), 'utf8')
const browser = vm.runInNewContext(`(() => {
  ${source.replaceAll('export ', '')}
  return { stableStringify, sha256, digestJson };
})()`, { TextEncoder, Uint8Array, DataView, Uint32Array })
const values = [
  null, true, false, 0, -0, 1e30, '', '中文😀\ud800\udc00\ud800',
  { z: undefined, a: null, b: ['e\u0301', 'é', 0.0000001], 2: 'two', 10: 'ten' },
  [1, , 3], { b: { c: 1, a: false }, a: [true, null] },
  'a'.repeat(16383) + '😀\ud800\n"\\'.repeat(20000),
  { image: 'a+/='.repeat(512 * 1024) },
  Array.from({ length: 2000 }, (_, i) => ({ z: `题文 ${i} 😀`, a: i, absent: undefined })),
]
let checks = 0
for (const value of values) {
  assert.equal(stableStringify(value), legacy.stableStringify(value))
  assert.equal(digestJson(value), legacy.digestJson(value))
  assert.equal(browser.digestJson(value), legacy.digestJson(value))
  checks++
}
for (const value of ['', 'abc', '中文😀\ud800', Buffer.alloc(2 * 1024 ** 2, 0xa7), Uint8Array.of(0, 255, 12)]) {
  assert.equal(sha256(value), legacy.sha256(value))
  assert.equal(browser.sha256(value), legacy.sha256(value))
  checks++
}
for (const value of [undefined, NaN, Infinity, { a: NaN }, [undefined], BigInt(1)]) {
  assert.throws(() => digestJson(value), TypeError)
  assert.throws(() => legacy.digestJson(value), TypeError)
  checks++
}
console.log(`PASS ${checks} native streaming/browser/legacy canonical byte and digest checks`)
