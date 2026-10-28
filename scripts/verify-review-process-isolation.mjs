#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { fork, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { makeReviewRelease } from '../test-fixtures/review-compatibility/release.mjs'
import { startReviewCompatibilityWorker } from '../server/import-review/runReviewCompatibilityWorker.mjs'
import { reviewCompatibilityEligibility, isTransientReviewFailure } from '../server/import-review/reviewRecoveryPolicy.mjs'
import { killReviewProcessTree } from '../server/import-review/reviewProcessTree.mjs'
import { reviewCompatibilityLockDiagnostics } from '../server/import-review/reviewCompatibilityScheduling.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'eqb-review-process-'))
const server = createServer((_request, response) => response.end('alive'))
try {
  let invoked = 0
  process.env.EQB_REVIEW_COMPATIBILITY_AUTORUN = '0'
  const scheduler = startReviewCompatibilityWorker({ ready() { invoked++ } },
    { backfillStore: { runBatch() { invoked++ } } })
  await yieldFor(50)
  await scheduler.stop()
  assert.equal(invoked, 0)
  delete process.env.EQB_REVIEW_COMPATIBILITY_AUTORUN
  console.log('PASS automatic scheduling is enabled by default and starts neither worker when disabled')

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

  const release = makeReviewRelease(path.join(root, 'release'))
  const worker = path.join(release, 'server/import-review/reviewCompatibilityWorker.mjs')
  // Only the grandchild allocates the large native buffer. A V8 heap limit or
  // sampling only the direct child's RSS cannot detect this fixture.
  writeFileSync(worker, `
    import {spawn} from 'node:child_process';
    import {writeFileSync} from 'node:fs';
    process.once('message',()=> {
      const parser=spawn(process.execPath,['-e',"const bytes=Buffer.alloc(160*1024**2,1);setInterval(()=>bytes[0],1000)"],{stdio:'ignore'});
      writeFileSync(process.env.REVIEW_TEST_PID,String(parser.pid));
      setInterval(()=>{},1000);
    });
  `)
  process.env.REVIEW_TEST_PID = path.join(root, 'parser.pid')
  const { runReviewCompatibilityWorker } = await import(pathToFileURL(path.join(release, 'server/import-review/runReviewCompatibilityWorker.mjs')))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const before = readdirSync(tmpdir()).filter(name => name.startsWith('eqb-review-job-'))
  for (const mode of ['compare', 'backfill']) {
    const output = await runReviewCompatibilityWorker({ mode }, { rssMb: 96, timeoutMs: 10000 })
    assert.equal(output.comparison.reasonCode, 'WORKER_RSS_LIMIT')
    assert(output.comparison.metrics.peakTreeRssBytes > 96 * 1024 ** 2)
    assert(isTransientReviewFailure(output.comparison.reasonCode))
    assert.equal(reviewCompatibilityEligibility(output.comparison, false).eligible, true)
    assert.equal(reviewCompatibilityEligibility(output.comparison, true).eligible, false)
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}`)).status, 200)
    assert.deepEqual(readdirSync(tmpdir()).filter(name => name.startsWith('eqb-review-job-')), before)
    assert.equal(reviewCompatibilityLockDiagnostics().leader.state, 'missing',
      `${mode} disposal must release its leader before the next verifier`)
    console.log(`PASS ${mode}: descendant RSS triggers kill; supervisor HTTP survives, legacy fallback applies and workspace is removed`)
  }
  for (const args of [[], ['--hold']]) {
    // Give each fault-injection subprocess its own lock root, just as a
    // standalone verifier has; a retained live-owner test must not poison us.
    const env = { ...process.env }
    delete env.EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT
    process.stdout.write(execFileSync(process.execPath,
      [fileURLToPath(new URL('../test-fixtures/review-compatibility/disposal.mjs', import.meta.url)), ...args],
      { env, timeout: 30000, encoding: 'utf8' }))
  }
  console.log(`PASS ${process.platform === 'darwin' ? 7 : 6} review process isolation checks`)
} finally {
  delete process.env.REVIEW_TEST_PID
  delete process.env.EQB_REVIEW_COMPATIBILITY_AUTORUN
  await new Promise(resolve => server.close(resolve))
  rmSync(root, { recursive: true, force: true })
}
