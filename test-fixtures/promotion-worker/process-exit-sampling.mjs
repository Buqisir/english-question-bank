import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { reviewProcessIdentity, readReviewProcessTree } from '../../server/import-review/reviewProcessTree.mjs'

export async function verifyProcessExitSampling() {
  // Real /proc open/read races: a snapshot PID may disappear before its
  // identity is read. Linux can report ESRCH as well as ENOENT in that gap.
  const linux = process.platform === 'linux'
  let reads = 0, gone = 0
  for (let batch = 0; batch < (linux ? 32 : 4); batch++) {
    const children = Array.from({ length: linux ? 24 : 8 }, () => {
      const child = spawn(linux ? '/bin/true' : '/usr/bin/true', [], { stdio: 'ignore' })
      const closed = new Promise(resolve => {
        child.once('error', error => resolve({ error }))
        child.once('close', code => resolve({ code }))
      })
      return { child, closed }
    })
    const results = await Promise.allSettled(children.map(async ({ child, closed }) => {
      try {
        for (let n = 0; n < (linux ? 4 : 2); n++) {
          if (!await reviewProcessIdentity(child.pid)) gone++
          reads++
        }
      } finally {
        const exit = await closed
        assert.ifError(exit.error)
        assert.equal(exit.code, 0)
      }
      assert.equal(await reviewProcessIdentity(child.pid), null, 'reaped process is gone')
    }))
    // Settle and reap every child even when the regression is detected.
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason
    }
    const tree = await readReviewProcessTree(process.pid)
    assert.ok(tree.pids.includes(process.pid))
    assert.ok(Number.isFinite(tree.rssBytes) && tree.rssBytes > 0)
  }
  assert.ok(gone > 0, 'the race check must observe exited processes')
  console.log(`PASS real short-lived process sampling (${process.platform}): ${reads} identity reads, ${gone} gone`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyProcessExitSampling()
}
