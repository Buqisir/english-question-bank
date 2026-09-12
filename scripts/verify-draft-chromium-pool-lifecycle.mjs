#!/usr/bin/env node

// chromiumPool lifecycle regression guard (Detail bug #368).
//
// getContext() must never let a live Chromium process become unreachable:
//   - a connection-preserving newContext() failure (method-level CDP errors
//     such as Target.createBrowserContext) leaves the browser connected with
//     no context — the pool must close that browser, not keep a dead-end
//     reference that the next acquire would overwrite;
//   - the acquire after a failure must launch exactly one new browser and
//     recover normally.
//
// playwright-core is stubbed at the module-cache seam: chromiumPool resolves
// it via createRequire anchored inside server/, so patching the same cached
// module object controls what launchBrowser() returns.

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(pathToFileURL(path.join(root, 'server', 'anchor.js')))
const playwright = require('playwright-core')

let passed = 0
function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`${name}${detail ? `\n${detail}` : ''}`)
  }
  passed += 1
  console.log(`ok - ${name}`)
}

function makeBrowser({ connectable = true, newContextImpl }) {
  const stats = { newContextCalls: 0, closeCalls: 0 }
  const browser = {
    stats,
    isConnected: () => connectable,
    newContext: async () => {
      stats.newContextCalls += 1
      return newContextImpl()
    },
    on: () => {},
    close: async () => {
      stats.closeCalls += 1
    },
  }
  return browser
}

const makeContext = () => ({
  newPage: async () => ({ close: async () => {} }),
})

const launches = []
const realLaunch = playwright.chromium.launch
playwright.chromium = {
  ...playwright.chromium,
  launch: async () => {
    const next = launches.shift()
    if (!next) throw new Error('test exhausted its scripted launches')
    return next
  },
}

const { withChromiumPage, closeChromiumPool, isChromiumPoolWarm } =
  await import('../server/draft-paper/chromiumPool.mjs')

try {
  const firstBrowser = makeBrowser({
    newContextImpl: async () => {
      throw new Error('Target.createBrowserContext: method-level failure (connection preserved)')
    },
  })
  const secondBrowser = makeBrowser({ newContextImpl: async () => makeContext() })
  launches.push(firstBrowser, secondBrowser)

  // Acquire 1: launch succeeds, newContext() rejects with the browser still
  // connected — the connection-preserving failure class from the report.
  let firstError = null
  await withChromiumPage(() => {}).catch((error) => {
    firstError = error
  })
  assert('connection-preserving newContext failure still reaches the caller', /createBrowserContext/u.test(firstError?.message || ''))
  assert(
    'the failed-acquire browser is closed, not orphaned',
    firstBrowser.stats.closeCalls === 1,
    `closeCalls=${firstBrowser.stats.closeCalls}`,
  )
  assert('pool reports cold after the torn-down acquire', !isChromiumPoolWarm())

  // Acquire 2: the pool relaunches once and serves a working page.
  let taskRan = false
  await withChromiumPage(() => {
    taskRan = true
  })
  assert('next acquire relaunches exactly one browser', launches.length === 0)
  assert('next acquire runs the render task', taskRan)
  assert('pool is warm after recovery', isChromiumPoolWarm())
  assert(
    'the recovered browser is never closed by the retry',
    secondBrowser.stats.closeCalls === 0,
  )

  // Acquire 3: the warm path reuses the resident context without relaunching.
  await withChromiumPage(() => {})
  assert('warm acquire reuses the resident context', secondBrowser.stats.newContextCalls === 1)

  await closeChromiumPool()
  assert('closeChromiumPool closes the resident browser', secondBrowser.stats.closeCalls === 1)
} finally {
  playwright.chromium = { ...playwright.chromium, launch: realLaunch }
  await closeChromiumPool().catch(() => {})
}

console.log(`\nchromium-pool lifecycle verify PASSED: ${passed} checks`)
