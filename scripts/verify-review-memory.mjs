#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { stableStringify, sha256, digestJson } from '../shared/paper-canonical/stable.mjs'
import * as legacy from '../test-fixtures/review-compatibility/legacyStable.mjs'
import { deriveNck1MaterializationBundle, withNck1MaterializationSourceCache } from '../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { loadNck1ReviewSource } from '../server/import-review/revisionProjection.mjs'

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
const previousFixtureMode = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs')
if (previousFixtureMode === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previousFixtureMode
const root = mkdtempSync(path.join(tmpdir(), 'eqb-review-memory-'))
try {
  const { reviewRoot } = makeReviewRoot(root, 'paper-memory-source')
  const raw = loadNck1ReviewSource(reviewRoot).sourceInput
  const before = sha256(raw.materializationBytes)
  withNck1MaterializationSourceCache(() => {
    const first = deriveNck1MaterializationBundle(raw)
    assert.deepEqual(first.issues, [])
    const sourceDigest = digestJson(first.source)
    first.materialization.paperId = 'paper-tampered-result'
    assert.equal(digestJson(deriveNck1MaterializationBundle(raw).source), sourceDigest)
    checks++
    first.input.materializationBytes[0] ^= 1
    const second = deriveNck1MaterializationBundle(raw)
    assert.equal(digestJson(second.source), sourceDigest)
    assert.equal(sha256(second.input.materializationBytes), before)
    assert.equal(sha256(raw.materializationBytes), before)
    checks++
  })
} finally { rmSync(root, { recursive: true, force: true }) }
console.log(`PASS ${checks} native streaming/browser/legacy bytes, digests and source-cache mutation checks`)
