import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  FILES, assertDispatch, createBarrier, finishBarrier, hash, parseBarrier,
  proveBinding, readBarrier, safeAncestors, safeNode, withDeploymentLock,
} from '../../deploy/eqb-deploy-barrier.mjs'

export async function verifyDeployBarrier(repository) {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'eqb-barrier-'))
  const uid = process.getuid()
  const gid = process.getgid()
  const expected = { transactionId: randomUUID(), previousSha: '1'.repeat(40), targetSha: '2'.repeat(40),
    productionSha: '3'.repeat(40), payloadDigest: '4'.repeat(64) }
  const active = path.join(root, 'deployments/root-dispatch-barrier.json')
  const lock = path.join(root, 'deployments/deploy.lock')
  const mutation = `deploy ${expected.targetSha}`
  const pointer = path.join(root, 'deployments/host-configuration/current')
  const installed = {}
  const options = { root, uid, gid, installed, proof() {} }
  const assertClockRegression = (action) => {
    const before = fs.readFileSync(active, 'utf8')
    const RealDate = globalThis.Date
    const earlier = Date.parse(readBarrier(root, uid, gid).createdAt) - 1000
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [earlier])) }
    }
    try { assert.throws(() => finishBarrier(action, expected, options), /Invalid barrier/) }
    finally { globalThis.Date = RealDate }
    assert.equal(fs.readFileSync(active, 'utf8'), before)
    assert.throws(() => assertDispatch(mutation, root, uid, gid))
    assert.equal(fs.existsSync(path.join(root, 'deployments', `root-dispatch-${expected.transactionId}.json`)), false)
  }
  const write = (file, bytes, mode = 0o600) => {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    fs.writeFileSync(file, bytes, { mode })
  }
  try {
    write(lock, '')
    for (const sha of [expected.previousSha, expected.targetSha]) {
      const version = path.join(root, 'deployments/host-configuration/versions', sha)
      const files = {}, stableLaunchers = {}
      for (const [name, file] of Object.entries(FILES)) {
        const bytes = `trusted ${name}\n`
        if (name.endsWith('.mjs') || name.endsWith('.service') || name.endsWith('.release')) {
          write(path.join(version, name), bytes)
          files[name] = hash(bytes)
        } else stableLaunchers[name] = hash(bytes)
        installed[name] = file ? path.join(root, 'installed', path.basename(file)) : null
        if (installed[name]) write(installed[name], bytes)
      }
      write(path.join(version, '.eqb-host-configuration.json'), JSON.stringify({
        schemaVersion: 'eqb-host-configuration-v1', sha, files, stableLaunchers, preparedAt: new Date().toISOString(),
      }))
    }
    fs.symlinkSync(`versions/${expected.previousSha}`, pointer)
    write(path.join(root, 'releases', expected.productionSha, '.eqb-release.json'), JSON.stringify({
      schemaVersion: 'eqb-release-v1', sha: expected.productionSha,
    }))
    fs.symlinkSync(`releases/${expected.productionSha}`, path.join(root, 'current'))
    assert.equal(readBarrier(root, uid, gid), null)
    assertDispatch(mutation, root, uid, gid)
    const value = createBarrier(expected, root, uid, gid)
    assert.equal(fs.statSync(active).mode & 0o777, 0o600)
    assert.deepEqual(parseBarrier(fs.readFileSync(active, 'utf8')), value)
    // Exercise distinct owner IDs on every platform without requiring chown or
    // extra accounts. All other metadata and the actual fixture bytes stay real.
    const lstat = fs.lstatSync
    try {
      for (const [ownerUid, ownerGid] of [[0, 0], [0, 29], [17, 0], [17, 29]]) {
        fs.lstatSync = (...args) => Object.assign(lstat(...args), { uid: ownerUid, gid: ownerGid })
        safeNode(active, 'file', ownerUid, ownerGid, 0o600)
        assert.deepEqual(readBarrier(root, ownerUid, ownerGid), value)
        proveBinding(value, expected.previousSha, { ...options, uid: ownerUid, gid: ownerGid })
        assert.throws(() => safeNode(active, 'file', ownerUid + 1, ownerGid, 0o600))
        assert.throws(() => safeNode(active, 'file', ownerUid, ownerGid + 1, 0o600))
        if (ownerUid === 0 && ownerGid === 0) {
          safeNode(active, 'file')
          assert.deepEqual(readBarrier(root), value)
        } else {
          assert.throws(() => safeNode(active, 'file'))
          assert.throws(() => readBarrier(root))
        }
      }
    } finally { fs.lstatSync = lstat }
    for (const command of [mutation, `deploy-reviewed-persistence ${expected.targetSha} ${expected.payloadDigest}`,
      `update-host-config ${expected.targetSha} ${expected.payloadDigest}`]) {
      assert.throws(() => assertDispatch(command, root, uid, gid))
    }
    assertDispatch('preflight', root, uid, gid)
    assert.throws(() => createBarrier(expected, root, uid, gid))
    for (const changed of [
      { ...value, extra: true }, { ...value, targetSha: [expected.targetSha] },
      { ...value, phase: 'unknown' }, { ...value, finishedAt: value.createdAt },
    ]) assert.throws(() => parseBarrier(`${JSON.stringify(changed)}\n`))
    assert.throws(() => parseBarrier(JSON.stringify(value)))
    assert.throws(() => parseBarrier(`${JSON.stringify(value).replace('{', '{"phase":"bad",')}\n`))
    for (const corrupt of ['', '{}\n', 'unknown\n']) {
      fs.writeFileSync(active, corrupt)
      assert.throws(() => readBarrier(root, uid, gid))
      assert.throws(() => assertDispatch(mutation, root, uid, gid))
      assertDispatch('preflight', root, uid, gid)
    }
    fs.writeFileSync(active, `${JSON.stringify(value)}\n`)
    fs.chmodSync(active, 0o666)
    assert.throws(() => assertDispatch(mutation, root, uid, gid))
    fs.chmodSync(active, 0o600)
    fs.linkSync(active, `${active}.linked`)
    assert.throws(() => readBarrier(root, uid, gid))
    fs.unlinkSync(`${active}.linked`)
    fs.renameSync(active, `${active}.saved`)
    fs.symlinkSync('nonexistent', active)
    assert.throws(() => assertDispatch(mutation, root, uid, gid))
    assertDispatch('preflight', root, uid, gid)
    fs.unlinkSync(active)
    fs.renameSync(`${active}.saved`, active)
    assert.throws(() => readBarrier(root, uid + 1, gid))
    assert.throws(() => readBarrier(root, uid, gid + 1))
    assert.throws(() => safeAncestors(path.join(root, 'deployments/file'), uid, gid)) // /tmp is writable
    assert.throws(() => finishBarrier('finalize', expected, options)) // wrong pointer
    assert.throws(() => finishBarrier('recover', { ...expected, payloadDigest: 'f'.repeat(64) }, options))
    assert.throws(() => finishBarrier('recover', expected, { ...options, proof() { throw new Error('unknown') } }))
    assert.equal(readBarrier(root, uid, gid).phase, 'active')
    const file = installed['deploy/eqb-deploy-controller']
    fs.appendFileSync(file, 'drift')
    assert.throws(() => proveBinding(value, expected.previousSha, options))
    fs.writeFileSync(file, 'trusted deploy/eqb-deploy-controller\n')
    write(path.join(root, 'deployments/reviewed-persistence/active.json'), '{}')
    assert.throws(() => finishBarrier('recover', expected, options))
    fs.unlinkSync(path.join(root, 'deployments/reviewed-persistence/active.json'))
    assertClockRegression('recover')
    const recovered = finishBarrier('recover', expected, options)
    assert.equal(recovered.phase, 'recovered')
    assert.equal(readBarrier(root, uid, gid), null)
    assert.throws(() => createBarrier(expected, root, uid, gid)) // consumed transaction
    expected.transactionId = randomUUID()
    createBarrier(expected, root, uid, gid)
    fs.unlinkSync(pointer)
    fs.symlinkSync(`versions/${expected.targetSha}`, pointer)
    assertClockRegression('finalize')
    assert.equal(finishBarrier('finalize', expected, options).phase, 'finalized')
    assert.throws(() => finishBarrier('finalize', expected, options)) // never silently retry
    expected.transactionId = randomUUID()
    const interrupted = createBarrier(expected, root, uid, gid)
    fs.writeFileSync(active, `${JSON.stringify({ ...interrupted, phase: 'finalized', finishedAt: new Date().toISOString() })}\n`)
    assert.throws(() => assertDispatch(mutation, root, uid, gid))
    assert.throws(() => finishBarrier('recover', expected, options))
    assert.equal(finishBarrier('finalize', expected, options).phase, 'finalized')
    if (uid !== 0) {
      const denied = spawnSync(process.execPath, [path.join(repository, 'deploy/eqb-deploy-barrier.mjs'), 'inspect'], { encoding: 'utf8' })
      assert.equal(denied.status, 70)
      assert.match(denied.stderr, /Root only/)
    }

    // Real wrapper → real flock → inline admission → fake application module.
    const systemd = path.join(root, 'systemd-run')
    write(systemd, '#!/bin/sh\nwhile [ "$1" != -- ]; do shift; done\nshift\nexec "$@"\n', 0o700)
    const journal = path.join(root, 'journalctl')
    write(journal, '#!/bin/sh\nexit 0\n', 0o700)
    const module = path.join(root, 'fake-controller.mjs')
    const entered = path.join(root, 'entered')
    write(module, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(entered)}, process.env.SSH_ORIGINAL_COMMAND);\n`)
    const wrapper = path.join(root, 'wrapper')
    write(wrapper, fs.readFileSync(path.join(repository, 'deploy/eqb-deploy-controller'), 'utf8')
      .replaceAll('/usr/bin/systemd-run', systemd).replaceAll('/usr/bin/journalctl', journal)
      .replaceAll('/usr/bin/node', process.execPath)
      .replaceAll('/opt/eqb/deployments/deploy.lock', lock)
      .replaceAll('/opt/eqb/deployments/root-dispatch-barrier.json', active)
      .replaceAll('"/opt/eqb/deployments"', JSON.stringify(path.join(root, 'deployments')))
      .replaceAll('/opt/eqb/deployments/host-configuration/current/deploy/eqb-deploy-controller.mjs', module), 0o700)
    const invoke = (command) => {
      const args = command.split(' ')
      if (command !== 'preflight') args.splice(1, 0, expected.transactionId)
      return spawnSync(wrapper, ['--', ...args], { encoding: 'utf8' })
    }
    assert.equal(spawnSync(wrapper, ['--', ...mutation.split(' ')]).status, 64)
    assert.equal(invoke(mutation).status, 0)
    fs.unlinkSync(entered)
    withDeploymentLock(root, () => {
      assert.equal(invoke(mutation).status, 75)
      assert.equal(invoke('preflight').status, 0)
      assert.equal(fs.readFileSync(entered, 'utf8'), 'preflight')
      fs.unlinkSync(entered)
      assert.throws(() => withDeploymentLock(root, () => assert.fail('nested lock entered'), uid, gid))
    }, uid, gid)
    assert.equal(fs.existsSync(entered), false)
    for (const corrupt of ['', '{}\n']) {
      write(active, corrupt)
      for (const command of [mutation, `deploy-reviewed-persistence ${expected.targetSha} ${expected.payloadDigest}`,
        `update-host-config ${expected.targetSha} ${expected.payloadDigest}`]) assert.equal(invoke(command).status, 70)
      assert.equal(fs.existsSync(entered), false)
      assert.equal(invoke('preflight').status, 0)
      fs.unlinkSync(entered)
      fs.unlinkSync(active)
    }
    fs.symlinkSync('missing', active)
    assert.equal(invoke(mutation).status, 70)
    fs.unlinkSync(active)
    fs.chmodSync(path.dirname(active), 0o777)
    assert.notEqual(invoke(mutation).status, 0)
    fs.chmodSync(path.dirname(active), 0o700)
    expected.transactionId = randomUUID()
    // Process exits nonzero after durable creation: lock disappears, barrier does not.
    const source = new URL('../../deploy/eqb-deploy-barrier.mjs', import.meta.url).href
    const crash = spawnSync('/usr/bin/flock', ['-n', lock, process.execPath, '--input-type=module', '-e',
      `import {createBarrier} from ${JSON.stringify(source)}; createBarrier(${JSON.stringify(expected)},${JSON.stringify(root)},${uid},${gid}); process.exit(91);`])
    assert.equal(crash.status, 91)
    assert.notEqual(invoke(mutation).status, 0)
    assert.equal(fs.existsSync(entered), false)
    assert.equal(invoke('preflight').status, 0)
    assert.equal(fs.readFileSync(entered, 'utf8'), 'preflight')
    fs.unlinkSync(entered)
    const ready = path.join(root, 'locked')
    const child = spawn('/usr/bin/flock', ['-n', lock, process.execPath, '-e',
      `require('fs').writeFileSync(${JSON.stringify(ready)},'1'); setTimeout(()=>{},500);`], { stdio: 'ignore' })
    const ended = new Promise((resolve) => child.once('exit', resolve))
    while (!fs.existsSync(ready) && child.exitCode === null) await new Promise((resolve) => setTimeout(resolve, 5))
    assert.throws(() => withDeploymentLock(root, () => assert.fail('busy management entered'), uid, gid))
    assert.equal(invoke(mutation).status, 75)
    assert.equal(invoke('preflight').status, 0) // readonly does not acquire the mutation lock
    assert.equal(fs.readFileSync(entered, 'utf8'), 'preflight')
    fs.unlinkSync(entered)
    await ended
    assert.notEqual(invoke(mutation).status, 0) // durable even after holder is gone
    assert.equal(finishBarrier('finalize', expected, options).phase, 'finalized')
    assert.equal(invoke(mutation).status, 0)
    console.log('  ✓ root barrier: parser, lifecycle, permissions, symlink, crash, real-flock concurrency, readonly, rollback proof')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
