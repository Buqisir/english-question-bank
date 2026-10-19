#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import {
  createOrderedResultFlusher,
  createVerificationProgress,
  runVerificationSchedule,
  verificationLaneScripts,
  verificationSchedulingPolicy,
} from './lib/verificationScheduler.mjs'

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const planFor = (...args) => JSON.parse(execFileSync(process.execPath, [
  'scripts/verify-ci.mjs', '--plan-json', ...args,
], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }))
const registry = JSON.parse(execFileSync(process.execPath, [
  'scripts/verify-ci.mjs', '--list-json',
], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }))
const transferredScripts = [
  'scripts/verify-universal-nck1-publish.mjs',
  'scripts/verify-universal-nck1-image-source-bundle.mjs',
  'scripts/verify-paper-canonical-legacy-opaque-writing-rendered-behavior.mjs',
  'scripts/verify-paper-canonical-seven-choices-rendered-behavior.mjs',
  'scripts/verify-paper-canonical-application-writing-rendered-behavior.mjs',
  'scripts/verify-figure-render.mjs',
]
assert.deepEqual(planFor('--pack', 'all', '--lane', 'e2e').scripts, transferredScripts)
assert.deepEqual(planFor().scripts, registry.scripts, 'local Full remains unpartitioned')
for (const [pack, scripts] of Object.entries(registry.packs)) {
  const verify = planFor('--pack', pack, '--lane', 'verify')
  const e2e = planFor('--pack', pack, '--lane', 'e2e')
  const full = planFor('--pack', pack)
  assert.deepEqual(full.scripts, scripts)
  assert.deepEqual(verify.scripts, scripts.filter(script => !transferredScripts.includes(script)))
  assert.deepEqual(e2e.scripts, scripts.filter(script => transferredScripts.includes(script)))
  assert.equal(new Set([...verify.scripts, ...e2e.scripts]).size, scripts.length,
    `${pack}: no script omitted or duplicated across runners`)
  assert.deepEqual(verify.preflight, full.preflight, 'verify lane retains preflight')
  assert.deepEqual(e2e.preflight, full.preflight, 'e2e lane retains preflight, even with no selected scripts')
}
for (const args of [
  ['--lane'], ['--lane', 'typo'], ['--lane', 'verify', '--lane', 'e2e'],
  ['--lane', 'verify', '--lane'],
]) {
  assert.equal(spawnSync(process.execPath, ['scripts/verify-ci.mjs', '--plan-json', ...args], {
    cwd: new URL('..', import.meta.url),
  }).status, 1, 'invalid lane cannot silently omit tests')
}
assert.deepEqual(verificationLaneScripts(['scripts/future-check.mjs'], 'verify'), ['scripts/future-check.mjs'],
  'new checks default to verify, not to neither lane')
assert.deepEqual(verificationLaneScripts([], 'e2e'), [])
assert.throws(() => verificationLaneScripts([], 'typo'), /Unknown verification lane/)

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

// Controlled stall: a renderer holds its resource, a later independent task
// settles, and ordered logs cannot yet flush. Progress must still identify both.
const diagnosticLines = []
let clock = 100
const progress = createVerificationProgress({ emit: (line) => diagnosticLines.push(line), now: () => clock })
let release
const held = new Promise((resolve) => { release = resolve })
let observedLaterSettlement
const laterSettled = new Promise((resolve) => { observedLaterSettlement = resolve })
const orderedDiagnostics = []
const diagnosticFlush = createOrderedResultFlusher((index) => orderedDiagnostics.push(index))
const diagnosticRun = runVerificationSchedule([
  { script: 'held-render', resourceKeys: ['browser-render'] },
  { script: 'queued-render', resourceKeys: ['browser-render'] },
  { script: 'independent', resourceKeys: [] },
], {
  concurrency: 2,
  onStart: progress.start,
  async run(item, index) {
    if (index === 0) {
      progress.output(index, 'discarded-prefix' + 'x'.repeat(3000))
      progress.output(index, '\n::error::tail\n##[set-output name=x]y')
      await held
    }
    return { status: index === 2 ? 2 : 0 }
  },
  async onSettled(index, result) {
    progress.settled(index, result.status)
    await diagnosticFlush(index, result)
    if (index === 2) observedLaterSettlement()
  },
})
try {
  await laterSettled
  clock = 30100
  progress.snapshot()
  const snapshot = JSON.parse(diagnosticLines.at(-1).slice('VERIFY PROGRESS '.length))
  assert.deepEqual(orderedDiagnostics, [], 'ordered output remains blocked by the controlled stall')
  assert.deepEqual(snapshot.active.map((task) => task.script), ['held-render'], 'queued renderer is not misreported as running')
  assert.deepEqual(snapshot.active[0].resources, ['browser-render'])
  assert.equal(snapshot.active[0].elapsedMs, 30000)
  assert.equal(snapshot.active[0].tail.length, 2048)
  assert(snapshot.active[0].tail.endsWith('##[set-output name=x]y'))
  assert(!diagnosticLines.at(-1).includes('::'))
  assert(!diagnosticLines.at(-1).includes('##['))
  assert.equal(diagnosticLines.at(-1).split('\n').length, 1, 'tail stays one inert JSON line')
  assert(diagnosticLines.some((line) => line.includes('"event":"settled"') && line.includes('"status":2')))
  progress.snapshot('interrupted')
  assert(diagnosticLines.at(-1).includes('"event":"interrupted"'))
} finally {
  release()
}
assert.deepEqual((await diagnosticRun).map((result) => result.status), [0, 0, 2], 'diagnostics preserve results')
assert.deepEqual(orderedDiagnostics, [0, 1, 2])
progress.snapshot()
assert.deepEqual(JSON.parse(diagnosticLines.at(-1).slice('VERIFY PROGRESS '.length)).active, [])

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
  verificationSchedulingPolicy(
    'transitive-render.mjs',
    '// verify-resource: browser-render\nawait makeSyntheticPdfFixture()',
  ),
  { script: 'transitive-render.mjs', exclusive: false, resourceKeys: ['browser-render'] },
)
assert.deepEqual(
  verificationSchedulingPolicy(
    'source-only.mjs',
    '// verify-resource: source-only-import-ledger\nassertCapture()',
  ),
  { script: 'source-only.mjs', exclusive: false, resourceKeys: ['source-only-import-ledger'] },
)
assert.throws(
  () => verificationSchedulingPolicy('typo.mjs', '// verify-resource: source-only-import-ledgr'),
  /Unknown verify-resource/,
  'a misspelled resource must not silently create an independent lock lane',
)
let activeLedger = 0
let maxActiveLedger = 0
await runVerificationSchedule([
  { script: 'ledger-reader', resourceKeys: ['source-only-import-ledger'] },
  { script: 'ledger-mutator', resourceKeys: ['source-only-import-ledger'] },
], {
  concurrency: 2,
  async run() {
    activeLedger += 1
    maxActiveLedger = Math.max(maxActiveLedger, activeLedger)
    await sleep(2)
    activeLedger -= 1
  },
})
assert.equal(maxActiveLedger, 1, 'declared shared resources cannot overlap')
const imageBundleVerifier = 'scripts/verify-universal-nck1-image-source-bundle.mjs'
assert.deepEqual(
  verificationSchedulingPolicy(
    imageBundleVerifier,
    readFileSync(new URL('./verify-universal-nck1-image-source-bundle.mjs', import.meta.url), 'utf8'),
  ),
  { script: imageBundleVerifier, exclusive: false, resourceKeys: ['browser-render'] },
  'transitive image-bundle OCR fixture stays in the browser/render lane',
)
const paperBrowseVerifier = 'scripts/verify-paper-browse.mjs'
assert.deepEqual(
  verificationSchedulingPolicy(
    paperBrowseVerifier,
    readFileSync(new URL('./verify-paper-browse.mjs', import.meta.url), 'utf8'),
  ),
  { script: paperBrowseVerifier, exclusive: false, resourceKeys: ['browser-render'] },
  'paper-browse SSR shares the dependency cache with browser Vite servers',
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
  verificationSchedulingPolicy('static.mjs', 'assert.equal(actual, expected)'),
  { script: 'static.mjs', exclusive: false, resourceKeys: [] },
)

console.log('verification scheduler verification passed')
