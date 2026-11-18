#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { fork, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { killReviewProcessTree } from '../server/import-review/reviewProcessTree.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'eqb-review-process-'))
// Parallel Review verifiers must not share the workspace cleanup assertion.
const previousTmpdir = process.env.TMPDIR
process.env.TMPDIR = root
try {
  const quickWorker = path.join(root, 'quick-worker.mjs')
  writeFileSync(quickWorker, `process.once('message',()=> {
    process.send({ready:true},()=> { if(process.argv[2]!=='stay')process.disconnect() });
    if(process.argv[2]==='stay')setInterval(()=>{},1000);
  })`)
  const quickChild = stay => {
    const child = fork(quickWorker, stay ? ['stay'] : [], {
      execArgv: [], detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    const exited = once(child, 'exit')
    const ready = once(child, 'message')
    child.send({})
    return { child, exited, ready }
  }
  if (process.platform === 'darwin') {
    const { child, exited, ready } = quickChild(false)
    await ready
    try {
      // Block only this test process so the kernel can exit the child before
      // Node delivers its exit event. Darwin rejects kill(-zombiePid) as EPERM.
      let rows = []
      for (let attempt = 0; attempt < 20; attempt++) {
        rows = execFileSync('/bin/ps', ['-axo', 'pid=,stat='], { encoding: 'utf8' })
          .trim().split('\n').map(line => line.trim().split(/\s+/))
        if (rows.some(([pid, state]) => Number(pid) === child.pid && state.startsWith('Z'))) break
      }
      assert(rows.some(([pid, state]) => Number(pid) === child.pid && state.startsWith('Z')))
      assert.equal(child.exitCode, null)
      await Promise.all([killReviewProcessTree(child, [child.pid]), killReviewProcessTree(child, [child.pid])])
    } finally { await exited }
    console.log('PASS Darwin zombie group EPERM is verified as exited before Node exit delivery; disposal is idempotent')
  } else console.log('SKIP Darwin zombie group EPERM reproduction on this platform')
  const { child: live, exited: liveExited, ready: liveReady } = quickChild(true)
  await liveReady
  const originalKill = process.kill
  try {
    process.kill = function (pid, signal) {
      if (pid === -live.pid) throw Object.assign(new Error('fixture live group denial'), { code: 'EPERM' })
      return originalKill.call(process, pid, signal)
    }
    await assert.rejects(killReviewProcessTree(live, [live.pid]), { code: 'EPERM' })
  } finally {
    process.kill = originalKill
    originalKill.call(process, -live.pid, 'SIGKILL')
    await liveExited
  }
  console.log('PASS live process-group permission failures remain errors rather than being mistaken for exited zombies')

  console.log(`PASS ${process.platform === 'darwin' ? 2 : 1} review process isolation checks`)
} finally {
  if (previousTmpdir === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = previousTmpdir
  rmSync(root, { recursive: true, force: true })
}
