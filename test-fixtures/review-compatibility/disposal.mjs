// Run in a separate process: the signal-delivery fault must not affect other
// verifiers sharing the storage suite's module graph.
import '../../scripts/lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import cp from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { makeReviewRelease } from './release.mjs'
import { reviewCompatibilityLockDiagnostics } from '../../server/import-review/reviewCompatibilityScheduling.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'eqb-review-disposal-'))
const release = makeReviewRelease(path.join(root, 'release'))
const pidFile = path.join(root, 'parser.pid')
const hold = process.argv.includes('--hold')
writeFileSync(path.join(release, 'server/import-review/reviewCompatibilityWorker.mjs'), `
  import { spawn } from 'node:child_process';
  import { writeFileSync } from 'node:fs';
  process.once('message', ({ pidFile }) => {
    const parser = spawn(process.execPath, ['-e',
      'const bytes=Buffer.alloc(160*1024**2,1);setInterval(()=>bytes[0],1000)'], { stdio: 'ignore' });
    writeFileSync(pidFile, String(parser.pid));
    setInterval(()=>{},1000);
  });
`)
const originalKill = process.kill
const originalExecFile = cp.execFile
let group
let held = false
let observed = 0
let probeFailure
process.kill = function (pid, signal) {
  if (signal === 'SIGKILL' && pid < 0) {
    group = -pid
    held = true
    // Reap the direct child now; defer the parser's signal until its first
    // real custody inventory. This pins the legal kernel scheduling window.
    return originalKill.call(process, group, signal)
  }
  if (held && signal === 'SIGKILL' && existsSync(pidFile)
    && pid === Number(readFileSync(pidFile, 'utf8'))) return true
  return originalKill.call(process, pid, signal)
}
cp.execFile = function (...args) {
  const custodyProbe = args[0] === 'ps' && new Error().stack.includes('reviewProcessGroupMembers')
  const callback = args.at(-1)
  if (custodyProbe && typeof callback === 'function') args[args.length - 1] = (error, stdout, stderr) => {
    try { if (held && !error) {
      const parser = Number(readFileSync(pidFile, 'utf8'))
      const rows = stdout.trim().split('\n').map(line => line.trim().split(/\s+/))
      assert(!rows.some(([pid]) => Number(pid) === group), 'direct worker must already be reaped')
      assert(rows.some(([pid, , , pgid, state]) =>
        Number(pid) === parser && Number(pgid) === group && !state.startsWith('Z')))
      observed++
      const locks = reviewCompatibilityLockDiagnostics()
      assert.equal(locks.leader.pid, process.pid, 'custody must retain the supervisor leader')
      if (!hold) {
        held = false
        originalKill.call(process, -group, 'SIGKILL')
      }
    } } catch (failure) {
      probeFailure = failure
      callback(failure, stdout, stderr)
      return
    }
    callback(error, stdout, stderr)
  }
  return originalExecFile.apply(this, args)
}
// Match execFile's two-value promisified contract while keeping the probe.
cp.execFile[Symbol.for('nodejs.util.promisify.custom')] = (...args) =>
  new Promise((resolve, reject) => cp.execFile(...args, (error, stdout, stderr) =>
    error ? reject(error) : resolve({ stdout, stderr })))
syncBuiltinESMExports()
try {
  const { runReviewCompatibilityWorker } = await import(pathToFileURL(
    path.join(release, 'server/import-review/runReviewCompatibilityWorker.mjs')))
  const output = await runReviewCompatibilityWorker({ mode: 'backfill', pidFile }, { rssMb: 96, timeoutMs: 10000 })
  if (probeFailure) throw probeFailure
  assert.equal(output.comparison.reasonCode, 'WORKER_RSS_LIMIT')
  assert(observed > 0, 'must exercise the real descendant-exit window')
  const locks = reviewCompatibilityLockDiagnostics()
  const custody = readdirSync(locks.root).filter(name => name.startsWith('.compatibility-work-'))
  assert.equal(locks.leader.state, hold ? 'live' : 'missing')
  assert.equal(custody.length, hold ? 1 : 0)
  if (hold) {
    assert(observed > 1, 'disposal must observe the group rather than abandon it on its first probe')
    const blocked = await runReviewCompatibilityWorker({}, { timeoutMs: 10000 })
    assert.equal(blocked.comparison.reasonCode, 'LEADER_BUSY')
    console.log('PASS disposal deadline retains live leader/custody and rejects the next worker')
  } else {
    // A subsequent public worker call must acquire the released leader.
    const canceled = new AbortController()
    canceled.abort()
    const next = await runReviewCompatibilityWorker({}, { signal: canceled.signal })
    assert.equal(next.comparison.reasonCode, 'WORKER_EXIT')
    assert.equal(reviewCompatibilityLockDiagnostics().leader.state, 'missing')
    console.log('PASS delayed descendant exit drains custody and releases leader before the next worker')
  }
} finally {
  process.kill = originalKill
  cp.execFile = originalExecFile
  syncBuiltinESMExports()
  if (group) {
    try { originalKill.call(process, -group, 'SIGKILL') }
    catch (error) { if (!['ESRCH', 'EPERM'].includes(error.code)) throw error }
  }
  rmSync(root, { recursive: true, force: true })
}
