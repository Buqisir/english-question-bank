import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { cleanupA3Fixture } from './verify-a3-imposition.mjs'

// Exercises the actual cleanup seam with a late writer, not a claimed
// reproduction of the original CI ENOTEMPTY interleaving.
const root = mkdtempSync(path.join(tmpdir(), 'a3-cleanup-regression-'))
const child = spawn(process.execPath, ['-e', `
  const fs = require('node:fs');
  process.on('SIGTERM', () => setTimeout(() => {
    try { fs.writeFileSync(process.argv[1] + '/last-write', 'done'); process.exit(0) }
    catch { process.exit(2) }
  }, 100));
  setInterval(() => {}, 1000);
  console.log('ready');
`, root], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
const closed = once(child, 'close')
try {
  await once(child.stdout, 'data')
  await cleanupA3Fixture([{ child, closed }], root)
  assert.notEqual(child.exitCode, null, 'cleanup must wait for the delayed writer to close before deleting its fixture')
  assert.equal(child.exitCode, 0, 'fixture must remain present for the final shutdown write')
  assert.equal(existsSync(root), false)
  console.log('PASS A3 cleanup waits for the real delayed writer before removing its fixture')
} finally {
  try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
  await closed
  rmSync(root, { recursive: true, force: true })
}

const groupRoot = mkdtempSync(path.join(tmpdir(), 'a3-cleanup-grandchild-'))
const leader = spawn(process.execPath, ['-e', `
  require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(`
    process.on('SIGTERM', () => {});
    setInterval(() => require('node:fs').writeFileSync(process.argv[1] + '/heartbeat', 'live'), 10);
    console.log('ready');
  `)}, process.argv[1]], { stdio: ['ignore', 1, 2] });
  process.on('SIGTERM', () => process.exit(0));
  setInterval(() => {}, 1000);
`, groupRoot], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
const groupClosed = once(leader, 'close')
try {
  await once(leader.stdout, 'data')
  const started = Date.now()
  await cleanupA3Fixture([{ child: leader, closed: groupClosed }], groupRoot)
  assert.equal(leader.exitCode, 0)
  assert.ok(Date.now() - started >= 900, 'stubborn grandchild receives the bounded grace period')
  assert.ok(Date.now() - started < 5000, 'cleanup is bounded despite a SIGTERM-ignoring grandchild')
  assert.equal(existsSync(groupRoot), false)
  console.log('PASS A3 cleanup reaps the SIGTERM-ignoring grandchild after its leader exits')
} finally {
  try { process.kill(-leader.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
  await groupClosed
  rmSync(groupRoot, { recursive: true, force: true })
}

// An exhausted filesystem removal failure must still fail the verifier.
const fs = await import('node:fs')
const { syncBuiltinESMExports } = await import('node:module')
const originalRm = fs.default.rmSync
const failedRoot = mkdtempSync(path.join(tmpdir(), 'a3-cleanup-failure-'))
try {
  fs.default.rmSync = (_root, options) => {
    assert.equal(options.maxRetries, 5)
    assert.equal(options.retryDelay, 100)
    throw Object.assign(new Error('persistent cleanup failure'), { code: 'ENOTEMPTY' })
  }
  syncBuiltinESMExports()
  await assert.rejects(cleanupA3Fixture([], failedRoot), { code: 'ENOTEMPTY' })
  console.log('PASS A3 cleanup requests bounded filesystem retries and propagates persistent failure')
} finally {
  fs.default.rmSync = originalRm
  syncBuiltinESMExports()
  rmSync(failedRoot, { recursive: true, force: true })
}
