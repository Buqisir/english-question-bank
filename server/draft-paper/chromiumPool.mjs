// draft-desk-b step1 (MF-2/MF-6, plan.md "步1 — 服务器分页渲染器 + 实例池"):
// a single resident headless-Chromium instance shared by every server-side
// pagination render. This cut explicitly does NOT build a real multi-browser
// pool ("本刀=单实例常驻即可，不用真"池"") — that is future scope only if
// render concurrency ever needs it.
//
// Lifecycle contract:
//   - lazy launch: no Chromium process spawns until the first acquire()
//   - crash auto-restart: a `disconnected` browser event (crash / OOM-kill /
//     manual close) drops the cached instance; the NEXT acquire() detects
//     the gap and relaunches. There is no background health-check timer —
//     detection is lazy, on next use, per plan.md "崩溃自动重启（下次请求
//     触发重连）".
//   - process exit cleanup: `process.on('exit', ...)` best-effort closes the
//     browser so no orphaned Chromium process outlives this Node process.
//     Deliberately NOT a SIGINT/SIGTERM handler — this repo's server
//     (server/api.mjs) registers no signal handlers of its own today, and
//     Node's default SIGINT/SIGTERM disposition already routes through
//     `process.exit()` (which fires 'exit'); adding our own SIGINT/SIGTERM
//     listener would override that default and take over process shutdown
//     semantics for the whole server process — out of scope for a
//     self-contained step1 module. `closeChromiumPool()` below is the
//     explicit, awaitable close for callers (route-layer graceful shutdown,
//     verify scripts) that need a clean guaranteed close instead of the
//     best-effort exit hook.
//   - serial render queue: every acquire() ticket runs strictly after the
//     previous one settles (success OR failure) — never concurrently. Two
//     pages of the SAME browser instance running paged.js pagination at once
//     is untested territory this cut deliberately avoids; serializing is a
//     simple, deliberate contract, not a perf ceiling (queue wait time is
//     the real backpressure signal if it ever needs revisiting).
//   - fully async: chromium.launch/newPage/close are all awaited. No
//     execFileSync anywhere in this module — synchronous subprocess calls
//     block the whole Node event loop, which is exactly what this rewrite
//     replaces (draftPaperStore.mjs's Vivliostyle CLI line still uses
//     execFileSync; this module must not repeat that for the new engine).
//
// Latency budget (spike-gate-dp1.md): chromium.launch() cold ~120-265ms;
// this module amortizes that cost across every render after the first by
// keeping the browser resident.

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let browser = null // resident Chromium instance, or null if not launched / disconnected
let context = null // resident BrowserContext reused by every render (see launchBrowser() below)
let queue = Promise.resolve() // settles (never rejects) once the previously-enqueued render finishes
let exitHookRegistered = false

function registerExitHookOnce() {
  if (exitHookRegistered) return
  exitHookRegistered = true
  process.on('exit', () => {
    // 'exit' handlers are synchronous-only — the event loop is already torn
    // down, so browser.close() (async) cannot be awaited here. This is a
    // best-effort safety net against orphaned Chromium processes, not a
    // substitute for callers using closeChromiumPool() during a controlled
    // shutdown.
    if (browser) {
      try {
        browser.close()
      } catch {
        // best-effort only
      }
    }
  })
}

async function launchBrowser() {
  const { chromium } = require('playwright-core')
  // `channel: 'chromium'` pins the full Chromium build rather than the
  // "chromium_headless_shell" split build playwright-core defaults
  // `headless: true` to since ~1.49 — this production host only has the
  // full chromium-1194 build + its system libs installed (go-live-record.md
  // 追记 2026-07-09（二）, for the existing vivliostyle→playwright-core PDF
  // line), and NOT the headless_shell variant. Reusing the exact build the
  // production host already has avoids downloading a second browser /
  // introducing a new system-library surface there. Verified locally:
  // `headless: true` alone fails with "Executable doesn't exist at
  // .../chromium_headless_shell-1194/..." on this same playwright-core
  // version; `channel: 'chromium'` launches the already-cached build. This
  // build is measurably heavier per-page than the headless_shell build
  // (see paginationRenderer.mjs latency note) — the resident BrowserContext
  // below exists specifically to claw back some of that gap.
  const launched = await chromium.launch({ headless: true, channel: 'chromium' })
  launched.on('disconnected', () => {
    if (browser === launched) {
      browser = null
      context = null
    }
  })
  registerExitHookOnce()
  return launched
}

async function getContext() {
  if (browser && browser.isConnected() && context) return context
  browser = await launchBrowser()
  // A resident BrowserContext (created once, reused by every render) instead
  // of calling browser.newPage() per render measurably cuts per-render
  // overhead on the `channel: 'chromium'` build (~150-195ms -> ~85-95ms per
  // page, measured locally) — see paginationRenderer.mjs's latency note.
  // Every render still gets its own fresh Page (created/closed per render by
  // withChromiumPage below); only the context — and with it, the underlying
  // browser-process-level setup cost — is shared. Renders never touch
  // cookies/storage/navigation to a real origin (setContent() on inert
  // HTML strings only), so a shared context has no cross-render leakage.
  context = await browser.newContext()
  return context
}

// Runs `task(page)` against a fresh Chromium page from the resident
// browser/context, serialized behind every previously-enqueued render.
// `task` owns the page for the duration of the call (set content, paginate,
// serialize, PDF — draft-desk-b's locked single-page-produces-both-
// artifacts contract lives in paginationRenderer.mjs, not here); this
// module closes the page afterward regardless of success or failure.
export function withChromiumPage(task) {
  const run = async () => {
    const activeContext = await getContext()
    const page = await activeContext.newPage()
    try {
      return await task(page)
    } finally {
      await page.close().catch(() => {})
    }
  }
  const ticket = queue.then(run, run)
  // Keep the queue chain alive for the NEXT caller even when this render
  // fails — `ticket` (returned below) still carries the real rejection to
  // THIS call's caller; only the internal chain is failure-swallowing so one
  // bad render can't wedge everyone queued behind it.
  queue = ticket.then(
    () => undefined,
    () => undefined,
  )
  return ticket
}

// Explicit, awaitable close for controlled shutdown (route-layer graceful
// shutdown, verify scripts that must not leave a Node process hanging on an
// open browser handle). Safe to call when nothing was ever launched.
export async function closeChromiumPool() {
  if (!browser) return
  const toClose = browser
  browser = null
  context = null
  await toClose.close().catch(() => {})
}

// Test/inspection seam only — not part of the render contract.
export function isChromiumPoolWarm() {
  return Boolean(browser && browser.isConnected() && context)
}
