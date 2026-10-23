import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boundedAsrWindow } from './lib-listening-window.mjs'

test('ASR evidence bounds clamp sub-frame duration rounding without changing source evidence', () => {
  const source = { startSeconds: 1260, endSeconds: 1372.800083, segments: [] }
  assert.deepEqual(boundedAsrWindow(source, 1372.8), { startSeconds: 1260, endSeconds: 1372.8 })
  assert.equal(source.endSeconds, 1372.800083)
  assert.deepEqual(boundedAsrWindow({ startSeconds: 0, endSeconds: 10 }, 20),
    { startSeconds: 0, endSeconds: 10 })
  assert.equal(boundedAsrWindow({ startSeconds: 0, endSeconds: 20.05 }, 20).endSeconds, 20)
})

test('larger duration drift and malformed ASR bounds still fail', () => {
  for (const source of [
    { startSeconds: 0, endSeconds: 20.051 },
    { startSeconds: 20, endSeconds: 20.001 },
    { startSeconds: -1, endSeconds: 2 },
    { startSeconds: 0, endSeconds: NaN },
  ]) assert.throws(() => boundedAsrWindow(source, 20), /ASR window/)
})
