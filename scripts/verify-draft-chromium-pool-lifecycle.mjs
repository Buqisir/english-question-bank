#!/usr/bin/env node
// PR #455 / Detail #368: a newContext failure must not orphan a live browser.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../server/package.json', import.meta.url))
const playwright = require('playwright-core')
const originalChromium = playwright.chromium
const launches = []
let passed = 0
function check(name, condition) {
  assert.ok(condition, name)
  passed += 1
  console.log(`ok - ${name}`)
}
function makeBrowser({ error = null, closeError = null } = {}) {
  const stats = { contexts: 0, closes: 0 }
  return {
    stats,
    isConnected: () => true,
    on() {},
    async newContext() {
      stats.contexts += 1
      if (error) throw error
      return { newPage: async () => ({ close: async () => {} }) }
    },
    async close() {
      stats.closes += 1
      if (closeError) throw closeError
    },
  }
}
playwright.chromium = { launch: async () => {
  const next = launches.shift()
  assert.ok(next, 'no unexpected relaunch')
  return next
} }
const { withChromiumPage, closeChromiumPool, isChromiumPoolWarm } =
  await import('../server/draft-paper/chromiumPool.mjs')
try {
  const originalError = new Error('Target.createBrowserContext failed while connected')
  const failed = makeBrowser({ error: originalError })
  const recovered = makeBrowser()
  launches.push(failed, recovered)
  const caught = await withChromiumPage(() => {}).catch((error) => error)
  check('the original context error reaches the caller', caught === originalError)
  check('failed-acquire browser is closed exactly once', failed.stats.closes === 1)
  check('pool is cold after context creation failure', !isChromiumPoolWarm())
  let taskRan = false
  await withChromiumPage(() => { taskRan = true })
  check('the next acquire relaunches exactly once', launches.length === 0)
  check('the recovered task runs', taskRan)
  check('pool is warm after recovery', isChromiumPoolWarm())
  check('recovered browser stays open', recovered.stats.closes === 0)
  await withChromiumPage(() => {})
  check('warm acquisition reuses the context', recovered.stats.contexts === 1)
  await closeChromiumPool()
  check('explicit pool shutdown closes the resident browser', recovered.stats.closes === 1)
  // Integration hardening: cleanup rejection must not mask the original failure.
  const cleanupFailed = makeBrowser({ error: originalError, closeError: new Error('close failed') })
  launches.push(cleanupFailed)
  const cleanupCaught = await withChromiumPage(() => {}).catch((error) => error)
  check('cleanup rejection preserves the original context error', cleanupCaught === originalError)
  check('cleanup is attempted exactly once despite close rejection', cleanupFailed.stats.closes === 1)
  check('cleanup rejection cannot make the pool warm', !isChromiumPoolWarm())
} finally {
  await closeChromiumPool().catch(() => {})
  playwright.chromium = originalChromium
}
console.log(`\nchromium-pool lifecycle verify PASSED: ${passed} checks`)
