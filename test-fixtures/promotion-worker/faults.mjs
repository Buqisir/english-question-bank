import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { setTimeout as yieldFor } from 'node:timers/promises'

export function writeFixtureJson(file, value) {
  // Plans and checkpoints have concurrent readers/writers. Publish complete
  // JSON with a sibling rename; interrupted temporary files stay out of the
  // checkpoint evidence collector's filename prefix.
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  writeFileSync(temporary, JSON.stringify(value), { flag: 'wx' })
  renameSync(temporary, file)
}

function selected(stage) {
  if (process.env.EQB_PROMOTION_FAULT_CONTROL) {
    const plan = JSON.parse(readFileSync(process.env.EQB_PROMOTION_FAULT_CONTROL))
    return plan[stage]
  }
  return process.env.EQB_PROMOTION_FAULT_STAGE === stage
    ? process.env.EQB_PROMOTION_FAULT_ACTION || 'block' : null
}
function checkpoint(stage, detail = {}) {
  const record = {
    stage, pid: process.pid, at: Date.now(), rssBytes: process.memoryUsage().rss, ...detail,
    ...(stage === 'compatibility-input' ? { workspace: process.env.TMPDIR } : {}),
  }
  writeFixtureJson(process.env.EQB_PROMOTION_FAULT_MARKER, record)
  writeFixtureJson(`${process.env.EQB_PROMOTION_FAULT_MARKER}.${stage}`, record)
  writeFixtureJson(`${process.env.EQB_PROMOTION_FAULT_MARKER}.${process.pid}.${stage}`, record)
}
export async function promotionAsyncFault(stage) {
  if (selected(stage) !== 'gate') return
  checkpoint(stage)
  while (!existsSync(`${process.env.EQB_PROMOTION_FAULT_MARKER}.release`)) await yieldFor(20)
}

// Loaded exclusively by the verifier's Node module hook. Production source
// contains no fault environment switches and cannot select an alternate worker.
export function promotionFault(stage, detail, identity) {
  const action = selected(stage)
  if (!action) return
  if (action === 'out-of-order') {
    if (!identity || !/^[a-f0-9-]{36}$/.test(identity.operationId)
      || !/^[a-f0-9-]{36}$/.test(identity.nonce)) {
      throw new Error('Promotion out-of-order fixture requires current private identity')
    }
    detail = { ...detail, operationId: identity.operationId,
      nonceHash: `sha256:${createHash('sha256').update(identity.nonce).digest('hex')}` }
  }
  checkpoint(stage, detail)
  if (action === 'record') return
  if (action === 'callback-gate') {
    while (!existsSync(`${process.env.EQB_PROMOTION_FAULT_MARKER}.callback.release`)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
    return
  }
  if (action === 'http-timeout') {
    while (!existsSync(`${process.env.EQB_PROMOTION_FAULT_MARKER}.http-timeout.release`)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
    return 'http-timeout'
  }
  if (action === 'throw') throw Object.assign(new Error('Repairable fixture failure'), { code: 'FIXTURE_REPAIRABLE' })
  if (action === 'reject-content') throw Object.assign(new Error('Fixture content rejected before publication writes'), {
    code: 'IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED', reasonCode: 'FIXTURE_CONTENT_CHANGED', publicationNotWritten: true,
  })
  if (action === 'gate') {
    while (!existsSync(`${process.env.EQB_PROMOTION_FAULT_MARKER}.release`)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
    return
  }
  if (action === 'exit') process.exit(71)
  if (action === 'pause') return Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200)
  if (action === 'lock-pause') return Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2500)
  if (action === 'oom') {
    const heap = []
    while (true) heap.push(new Array(100_000).fill(Math.random()))
  }
  if (action === 'rss') globalThis.rssProbe = Buffer.alloc(800 * 1024 ** 2, 1)
  if (action === 'native') {
    spawnSync(process.execPath, ['-e', `require('node:fs').writeFileSync(${JSON.stringify(`${process.env.EQB_PROMOTION_FAULT_MARKER}.native`)},String(process.pid));process.stdin.resume();setInterval(()=>{},1000)`], { stdio: ['pipe', 'ignore', 'ignore'] })
    return
  }
  if (action === 'forged') process.send({ version: 1, type: 'outcome', operationId: 'forged', nonce: 'forged', outcome: { status: 'published' } })
  if (action === 'truncated') process.send({ type: 'outcome' })
  if (action === 'out-of-order') process.send({ version: 1, type: 'ready',
    operationId: identity.operationId, nonce: identity.nonce })
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60_000)
}
