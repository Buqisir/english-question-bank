#!/usr/bin/env node

import assert from 'node:assert/strict'

import {
  createOrderedResultFlusher,
  runVerificationSchedule,
  verificationSchedulingPolicy,
} from './lib/verificationScheduler.mjs'

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const items = [
  { name: 'a', delay: 35, status: 0, resourceKeys: [], exclusive: false },
  { name: 'render-a', delay: 20, status: 1, resourceKeys: ['browser-render'], exclusive: false },
  { name: 'render-b', delay: 10, status: 0, resourceKeys: ['browser-render'], exclusive: false },
  { name: 'b', delay: 5, status: 2, resourceKeys: [], exclusive: false },
  { name: 'exclusive', delay: 5, status: 0, resourceKeys: [], exclusive: true },
  { name: 'c', delay: 1, status: 0, resourceKeys: [], exclusive: false },
]
let active = 0
let maxActive = 0
let activeRender = 0
let maxActiveRender = 0
const completed = []
const results = await runVerificationSchedule(items, {
  concurrency: 3,
  async run(item) {
    active += 1
    maxActive = Math.max(maxActive, active)
    if (item.resourceKeys.includes('browser-render')) {
      activeRender += 1
      maxActiveRender = Math.max(maxActiveRender, activeRender)
    }
    if (item.exclusive) assert.equal(active, 1, 'exclusive verifier runs alone')
    await sleep(item.delay)
    if (item.resourceKeys.includes('browser-render')) activeRender -= 1
    active -= 1
    completed.push(item.name)
    return { name: item.name, status: item.status }
  },
})
assert.equal(maxActive, 3, 'bounded scheduler reaches configured concurrency')
assert.equal(maxActiveRender, 1, 'browser/render resource is mutually exclusive')
assert.deepEqual(results.map((result) => result.name), items.map((item) => item.name))
assert.deepEqual(results.map((result) => result.status), [0, 1, 0, 2, 0, 0])
assert(completed.indexOf('exclusive') > completed.indexOf('a'))
assert(completed.indexOf('exclusive') > completed.indexOf('render-b'))
assert(completed.indexOf('c') > completed.indexOf('exclusive'))

const serialStarts = []
await runVerificationSchedule(items.slice(0, 3), {
  concurrency: 1,
  onStart(item) { serialStarts.push(item.name) },
  async run(item) { return item.name },
})
assert.deepEqual(serialStarts, ['a', 'render-a', 'render-b'], 'jobs=1 restores registry-order serial execution')

const flushed = []
const flush = createOrderedResultFlusher(async (index, value) => {
  await sleep(1)
  flushed.push([index, value])
})
await Promise.all([
  flush(2, 'third'),
  flush(0, 'first'),
  flush(1, 'second'),
])
assert.deepEqual(flushed, [[0, 'first'], [1, 'second'], [2, 'third']])

const controller = new AbortController()
const abortStarts = []
await assert.rejects(
  runVerificationSchedule(items, {
    concurrency: 2,
    signal: controller.signal,
    onStart(item) {
      abortStarts.push(item.name)
      if (abortStarts.length === 2) controller.abort('SIGINT')
    },
    async run() { await sleep(5) },
  }),
  { name: 'AbortError' },
)
assert.deepEqual(abortStarts, ['a', 'render-a'], 'abort prevents pending verifiers from starting')

assert.deepEqual(
  verificationSchedulingPolicy('render.mjs', "await chromium.launch({ channel: 'chromium' })"),
  { script: 'render.mjs', exclusive: false, resourceKeys: ['browser-render'] },
)
assert.deepEqual(
  verificationSchedulingPolicy('server.mjs', 'server.listen(8787, host)'),
  { script: 'server.mjs', exclusive: false, resourceKeys: ['port:8787'] },
)
assert.deepEqual(
  verificationSchedulingPolicy('api.mjs', 'const apiPort = 9895'),
  { script: 'api.mjs', exclusive: false, resourceKeys: ['port:9895'] },
)
assert.deepEqual(
  verificationSchedulingPolicy(
    'evidence.mjs',
    "import { inspectEvidence } from './lib/canonicalImportPilotEvidenceRoot.mjs'",
  ),
  { script: 'evidence.mjs', exclusive: true, resourceKeys: [] },
)
assert.deepEqual(
  verificationSchedulingPolicy('static.mjs', 'assert.equal(actual, expected)'),
  { script: 'static.mjs', exclusive: false, resourceKeys: [] },
)

console.log('verification scheduler verification passed')
