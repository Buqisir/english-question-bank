import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { once } from 'node:events'
import {
  acquireReviewCompatibilityLeader, beginReviewActivity, reviewCompatibilityBusy,
  reviewCompatibilityLockDiagnostics,
} from '../../server/import-review/reviewCompatibilityScheduling.mjs'

const moduleUrl = new URL('../../server/import-review/reviewCompatibilityScheduling.mjs', import.meta.url).href
const key = 'EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT'
const json = file => JSON.parse(readFileSync(file, 'utf8'))

function leaveOrphan(activity = false) {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { acquireReviewCompatibilityLeader, beginReviewActivity, reviewCompatibilityLockDiagnostics }
      from ${JSON.stringify(moduleUrl)};
    ${activity ? "beginReviewActivity('finalize-crash')" : "if (!acquireReviewCompatibilityLeader()) throw Error('fixture lock busy')"};
    console.log(JSON.stringify(reviewCompatibilityLockDiagnostics()));
  `], { encoding: 'utf8' })
  const diagnostic = JSON.parse(output)
  const record = activity ? diagnostic.activities[0] : diagnostic.leader
  assert.throws(() => process.kill(record.pid, 0), { code: 'ESRCH' })
  return json(record.file)
}

// Both contenders stop *inside* the liveness probe after reading the old record.
// SIGCONT releases that exact race, rather than hoping two starts overlap.
async function compete(oldPid, probe = 1) {
  const children = []
  const outcomes = []
  let timer
  try {
    const ready = []
    const observed = []
    for (let index = 0; index < 2; index++) {
      const child = spawn(process.execPath, ['--input-type=module', '-e', `
        import { writeSync } from 'node:fs';
        import { acquireReviewCompatibilityLeader } from ${JSON.stringify(moduleUrl)};
        const kill = process.kill.bind(process);
        let probes = 0, leader;
        process.kill = (pid, signal) => {
          try { return kill(pid, signal); }
          catch (error) {
            if (pid === ${oldPid} && signal === 0 && error.code === 'ESRCH' && ++probes === ${probe}) {
              writeSync(1, 'stale-observed\\n');
              kill(process.pid, 'SIGSTOP');
            }
            throw error;
          }
        };
        process.on('message', command => {
          if (command === 'go') {
            leader = acquireReviewCompatibilityLeader();
            process.send({ phase: 'result', acquired: !!leader, pid: process.pid });
          } else if (command === 'stop') {
            leader?.release();
            process.disconnect();
          }
        });
        process.send({ phase: 'ready' });
      `], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
      children.push(child)
      ready.push(new Promise((resolve, reject) => {
        child.on('message', message => { if (message.phase === 'ready') resolve() })
        child.once('error', reject)
        child.once('exit', code => reject(new Error(`Contender exited before ready: ${code}`)))
      }))
      observed.push(new Promise((resolve, reject) => {
        let output = ''
        child.stdout.on('data', chunk => { output += chunk; if (output.includes('stale-observed\n')) resolve() })
        child.once('error', reject)
        child.once('exit', code => reject(new Error(`Contender exited before stale probe: ${code}`)))
      }))
      outcomes.push(new Promise((resolve, reject) => {
        child.on('message', message => { if (message.phase === 'result') resolve(message) })
        child.once('error', reject)
        let stderr = ''
        child.stderr.on('data', chunk => { stderr += chunk })
        child.once('exit', code => reject(new Error(`Contender exited before result: ${code} ${stderr}`)))
      }))
    }
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out coordinating stale-lock contenders')), 10_000)
    })
    // Observe all promises immediately so an early child exit cannot be unhandled.
    const results = Promise.all(outcomes)
    results.catch(() => {})
    const race = async () => {
      await Promise.all(ready)
      for (const child of children) child.send('go')
      await Promise.all(observed)
      for (const child of children) child.kill('SIGCONT')
      return results
    }
    const winners = (await Promise.race([race(), timeout])).filter(result => result.acquired)
    assert.equal(winners.length, 1, 'exactly one process may hold the recovered leader')
    assert.equal(reviewCompatibilityLockDiagnostics().leader.pid, winners[0].pid)
  } finally {
    clearTimeout(timer)
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null || child.signalCode !== null) return
      const exit = once(child, 'exit')
      // Killing these fixture children also leaves a genuine orphan for the next
      // assertion; no process discovered elsewhere on the host is touched.
      child.kill('SIGKILL')
      await exit
    }))
    await Promise.allSettled(outcomes)
  }
}

export async function verifyReviewCompatibilityScheduling(pass) {
  const original = process.env[key]
  assert.ok(original, 'store verifier must install its isolated root before loading fixtures')
  async function check(label, callback) {
    const root = mkdtempSync(path.join(original, 'scheduling-'))
    process.env[key] = root
    try { await callback(root); pass(label) }
    finally { process.env[key] = original; rmSync(root, { recursive: true, force: true }) }
  }
  await check('proven-dead same-uid leader is renamed to a tombstone and reacquired', root => {
    const old = leaveOrphan()
    assert.equal(reviewCompatibilityLockDiagnostics().leader.state, 'dead')
    const leader = acquireReviewCompatibilityLeader()
    assert.ok(leader)
    try {
      assert.equal(reviewCompatibilityLockDiagnostics().leader.pid, process.pid)
      const tomb = readdirSync(root).find(name => name.startsWith('.reaped-leader-'))
      assert.equal(json(path.join(root, tomb)).token, old.token)
    } finally { leader.release() }
  })
  await check('live leader/activity survive contenders and worker threads inherit the isolated root', async root => {
    const leader = acquireReviewCompatibilityLeader()
    const finish = beginReviewActivity('finalize-live')
    const before = readFileSync(path.join(root, 'leader'))
    try {
      assert.equal(acquireReviewCompatibilityLeader(), null)
      assert.equal(reviewCompatibilityBusy(), true)
      assert.equal(reviewCompatibilityLockDiagnostics().activities[0].state, 'live')
      const source = `import { parentPort } from 'node:worker_threads';
        import { reviewCompatibilityLockDiagnostics } from ${JSON.stringify(moduleUrl)};
        parentPort.postMessage(reviewCompatibilityLockDiagnostics());`
      const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`))
      try {
        const [diagnostic] = await once(worker, 'message')
        assert.equal(diagnostic.root, root)
        assert.equal(diagnostic.leader.pid, process.pid)
        assert.equal(diagnostic.leader.alive, true)
      } finally { await worker.terminate() }
      assert.deepEqual(readFileSync(path.join(root, 'leader')), before)
    } finally { finish(); leader.release() }
  })
  await check('orphan activity is reclaimed without pausing subsequent work', root => {
    leaveOrphan(true)
    assert.equal(reviewCompatibilityLockDiagnostics().activities[0].state, 'dead')
    assert.equal(reviewCompatibilityBusy(), false)
    assert.equal(reviewCompatibilityLockDiagnostics().activities.length, 0)
    assert(readdirSync(root).some(name => name.startsWith('.reaped-activity-')))
  })
  await check('empty/incomplete/wrong-uid records are preserved and diagnosed for leader and activity', root => {
    const old = leaveOrphan()
    for (const [bytes, state, reason] of [
      ['', 'malformed', 'INVALID_JSON'],
      [JSON.stringify({ ...old, processToken: undefined }), 'malformed', 'INCOMPLETE_RECORD'],
      [JSON.stringify({ ...old, uid: old.uid + 1 }), 'unsafe', 'RECORD_UID_MISMATCH'],
    ]) {
      writeFileSync(path.join(root, 'leader'), bytes)
      assert.equal(acquireReviewCompatibilityLeader(), null)
      assert.equal(readFileSync(path.join(root, 'leader'), 'utf8'), bytes)
      const diagnostic = reviewCompatibilityLockDiagnostics().leader
      assert.equal(diagnostic.state, state)
      assert.equal(diagnostic.reason, reason)
      const file = path.join(root, 'activity-finalize-damaged')
      const activityBytes = bytes ? JSON.stringify({ ...JSON.parse(bytes), kind: 'activity' }) : bytes
      writeFileSync(file, activityBytes, { mode: 0o600 })
      assert.equal(reviewCompatibilityBusy(), true)
      assert.equal(readFileSync(file, 'utf8'), activityBytes)
      assert.equal(reviewCompatibilityLockDiagnostics().activities[0].state, state)
      rmSync(file)
    }
  })
  await check('permission-unknown PID probes cannot authorize leader or activity reclamation', root => {
    const old = leaveOrphan()
    const file = path.join(root, 'activity-finalize-permission')
    writeFileSync(file, JSON.stringify({ ...old, kind: 'activity' }), { mode: 0o600 })
    const kill = process.kill
    process.kill = (pid, signal) => {
      if (pid === old.pid && signal === 0) throw Object.assign(new Error('fixture permission unknown'), { code: 'EPERM' })
      return kill.call(process, pid, signal)
    }
    try {
      assert.equal(acquireReviewCompatibilityLeader(), null)
      assert.equal(reviewCompatibilityBusy(), true)
      assert.equal(reviewCompatibilityLockDiagnostics().leader.state, 'unknown')
      assert.equal(reviewCompatibilityLockDiagnostics().leader.alive, null)
      assert(existsSync(file))
    } finally { process.kill = kill }
  })
  await check('two processes that both read the stale leader admit exactly one replacement', async () => {
    const old = leaveOrphan()
    await compete(old.pid)
    const recovered = acquireReviewCompatibilityLeader()
    assert.ok(recovered, 'winner killed by fixture must itself be recoverable')
    recovered.release()
  })
  await check('orphan recovery gate is itself recoverable; stale gate readers cannot move a new gate', async root => {
    const old = leaveOrphan()
    const gate = path.join(root, '.recovery')
    mkdirSync(gate, { mode: 0o700 })
    writeFileSync(path.join(gate, 'owner.json'), JSON.stringify({ ...old, kind: 'recovery', token: randomUUID() }),
      { mode: 0o600 })
    await compete(old.pid, 2)
    const recovered = acquireReviewCompatibilityLeader()
    assert.ok(recovered)
    recovered.release()
    assert(readdirSync(root).filter(name => name.startsWith('.recovery-tomb-')).length >= 2)
  })
  await check('live or malformed recovery gate is never stolen and is visible in diagnostics', root => {
    leaveOrphan()
    const gate = path.join(root, '.recovery')
    mkdirSync(gate, { mode: 0o700 })
    assert.equal(acquireReviewCompatibilityLeader(), null)
    assert.equal(reviewCompatibilityLockDiagnostics().recovery.state, 'malformed')
    assert.deepEqual(readdirSync(gate), [], 'an empty recovery directory must be preserved')
    writeFileSync(path.join(gate, 'owner.json'), '', { mode: 0o600 })
    const before = readFileSync(path.join(root, 'leader'))
    assert.equal(acquireReviewCompatibilityLeader(), null)
    assert.equal(reviewCompatibilityLockDiagnostics().recovery.state, 'malformed')
    const old = json(path.join(root, 'leader'))
    writeFileSync(path.join(gate, 'owner.json'), JSON.stringify({ ...old, kind: 'recovery', pid: process.pid }))
    assert.equal(acquireReviewCompatibilityLeader(), null)
    assert.equal(reviewCompatibilityLockDiagnostics().recovery.state, 'live')
    assert.deepEqual(readFileSync(path.join(root, 'leader')), before)
  })
  await check('stale release cannot unlink a replacement owner', root => {
    const first = acquireReviewCompatibilityLeader()
    rmSync(path.join(root, 'leader'))
    const second = acquireReviewCompatibilityLeader()
    try {
      first.release()
      assert.equal(reviewCompatibilityLockDiagnostics().leader.state, 'live')
      assert.equal(acquireReviewCompatibilityLeader(), null)
    } finally { second.release() }
  })
  await check('uncaught verifier exceptions clean their own temporary lock root', () => {
    const env = { ...process.env }
    delete env[key]
    const helper = new URL('../../scripts/lib/reviewTestLockRoot.mjs', import.meta.url).href
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { reviewTestLockRoot } from ${JSON.stringify(helper)};
      import { acquireReviewCompatibilityLeader } from ${JSON.stringify(moduleUrl)};
      acquireReviewCompatibilityLeader();
      console.log(reviewTestLockRoot);
      throw Error('expected fixture exception');
    `], { env, encoding: 'utf8' })
    assert.equal(child.status, 1)
    assert.match(child.stderr, /expected fixture exception/)
    const childRoot = child.stdout.trim()
    assert(childRoot.includes('eqb-review-test-locks-'))
    assert.equal(existsSync(childRoot), false)
  })
}
