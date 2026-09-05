import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { FILES, hash, safeNode, readBarrier, withDeploymentLock } from '../../deploy/eqb-deploy-barrier.mjs'
import { buildPayload, canonical, parsePayload, inspectHost, parseReadiness, installLocked, parseReceipt, parseRouteProof } from '../../deploy/eqb-barrier-bootstrap.mjs'
import { buildBarrierTatCommand } from './barrierBootstrapTat.mjs'

export async function verifyBarrierBootstrap(repository) {
  const uid = process.getuid(), gid = process.getgid()
  const before = '1'.repeat(40), target = '2'.repeat(40), production = '3'.repeat(40)
  const payload = buildPayload(target, (name) => fs.readFileSync(path.join(repository, name)))
  assert.equal(buildPayload(target, (name) => fs.readFileSync(path.join(repository, name))), payload)
  const parsed = parsePayload(payload)
  assert.throws(() => parsePayload(payload.trimEnd()))
  assert.throws(() => parsePayload(canonical({ ...parsed, extra: true })))
  assert.throws(() => parsePayload(canonical({ ...parsed, targetSha: [target] })))
  const corrupt = structuredClone(parsed)
  corrupt.files['deploy/eqb-release.service'].sha256 = '0'.repeat(64)
  assert.throws(() => parsePayload(canonical(corrupt)))
  const operatorSource = fs.readFileSync(path.join(repository, 'deploy/eqb-barrier-bootstrap.mjs'), 'utf8')
  const readonly = buildBarrierTatCommand({ operatorSource, payloadText: payload })
  assert.equal(readonly.commandDigest, hash(readonly.command))
  assert.equal(spawnSync('/bin/bash', ['-n'], { input: readonly.command }).status, 0)
  assert.ok(!readonly.command.includes('/usr/bin/systemd-run'))
  assert.ok(!readonly.command.includes('fs.mkdirSync(root'))

  for (const outcome of ['success', 'known-failure', 'unknown', 'crash']) {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'eqb-bootstrap-'))
    const write = (file, bytes, mode = 0o600) => {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
      fs.writeFileSync(file, bytes, { mode })
    }
    try {
      const installed = {}, files = {}, stableLaunchers = {}
      const version = path.join(root, 'deployments/host-configuration/versions', before)
      for (const [name, location] of Object.entries(FILES)) {
        let bytes = Buffer.from(parsed.files[name].base64, 'base64')
        if (name === 'deploy/eqb-deploy-controller') bytes = Buffer.from('#!/bin/sh\n# old ungated wrapper\n')
        if (name === 'deploy/eqb-deploy-controller.mjs') bytes = Buffer.from('export function runController() { throw new Error("OLD_UNGATED_MODULE") }\n')
        const host = Object.keys(FILES).indexOf(name) < 3
        if (host) { write(path.join(version, name), bytes, 0o644); files[name] = hash(bytes) }
        else stableLaunchers[name] = hash(bytes)
        installed[name] = location ? path.join(root, 'installed', path.basename(location)) : null
        if (installed[name]) write(installed[name], bytes, parsed.files[name].mode)
      }
      write(path.join(version, '.eqb-host-configuration.json'), JSON.stringify({ schemaVersion: 'eqb-host-configuration-v1',
        sha: before, files, stableLaunchers, preparedAt: new Date().toISOString() }))
      const pointer = path.join(root, 'deployments/host-configuration/current')
      fs.symlinkSync(`versions/${before}`, pointer)
      fs.symlinkSync(`releases/${production}`, path.join(root, 'current'))
      write(path.join(root, 'releases', production, '.eqb-release.json'), JSON.stringify({ schemaVersion: 'eqb-release-v1', sha: production }))
      const lock = path.join(root, 'deployments/deploy.lock')
      write(lock, '')
      let proofs = 0
      const config = { root, uid, gid, installed, manager: path.join(root, 'installed/manager.mjs'),
        currentMain(sha) { assert.equal(sha, target) },
        ancestors(file, ownerUid, ownerGid) {
          for (let parent = path.dirname(file); parent.startsWith(root); parent = path.dirname(parent)) {
            safeNode(parent, 'directory', ownerUid, ownerGid)
          }
        },
        diagnostics: () => ({ processes: [123], units: 'delayed diagnostic unit', jobs: 'in-flight IPC is not observable' }),
        proof() {
          proofs++
          if ((outcome === 'known-failure' && proofs === 3) || (outcome === 'unknown' && proofs >= 3)) throw new Error('fake health unknown')
        } }
      const report = inspectHost(payload, config)
      const reportText = canonical(report)
      assert.deepEqual(parseReadiness(reportText, payload), report)
      assert.throws(() => parseReadiness(canonical({ ...report, extra: true }), payload))
      assert.throws(() => parseReadiness(canonical({ ...report, previousSha: [before] }), payload))
      assert.throws(() => inspectHost(payload, { ...config, gid: gid + 1 }))
      fs.chmodSync(lock, 0o666)
      assert.throws(() => inspectHost(payload, config), /Unsafe file/)
      fs.chmodSync(lock, 0o600)
      fs.renameSync(lock, `${lock}.saved`)
      fs.symlinkSync(`${lock}.saved`, lock)
      assert.throws(() => inspectHost(payload, config), /Unsafe file/)
      fs.unlinkSync(lock)
      fs.renameSync(`${lock}.saved`, lock)
      const changedInode = structuredClone(report)
      changedInode.nodes.lock.ino++
      assert.throws(() => withDeploymentLock(root,
        () => installLocked(payload, canonical(changedInode), randomUUID(), config), uid, gid), /Host identity changed/)
      proofs = 1 // Reset only the injected proof-failure position after negative readiness probes.
      const transactionId = randomUUID()
      const invocation = buildBarrierTatCommand({ operatorSource, payloadText: payload, readinessText: reportText, transactionId })
      assert.equal(spawnSync('/bin/bash', ['-n'], { input: invocation.command }).status, 0)
      assert.ok(invocation.command.includes('--property=StandardInput=null'))
      assert.ok(invocation.command.includes('--unit=eqb-barrier-install-'))
      // This saved legacy argv names current, not a pinned target. It does not
      // contain the wrapper inline gate and is opened ONLY after real flock.
      const request = (originalCommand) => `import {runController} from ${JSON.stringify(`file://${pointer}/deploy/eqb-deploy-controller.mjs`)};
        try { await runController({originalCommand:${JSON.stringify(originalCommand)},config:${JSON.stringify({ root, controllerUid: uid, controllerGid: gid })},dependencies:{}}) }
        catch(e) { console.error(e.message); process.exit(70) }`
      const delayed = (originalCommand = `deploy ${target}`) => spawnSync('/usr/bin/flock',
        ['-n', lock, process.execPath, '--input-type=module', '-e', request(originalCommand)], { encoding: 'utf8' })
      if (outcome === 'crash') {
        const childSource = `
          import {installLocked} from ${JSON.stringify(new URL('../../deploy/eqb-barrier-bootstrap.mjs', import.meta.url).href)};
          import {withDeploymentLock} from ${JSON.stringify(new URL('../../deploy/eqb-deploy-barrier.mjs', import.meta.url).href)};
          const config = ${JSON.stringify(config)};
          config.currentMain = () => {};
          config.ancestors = () => {};
          config.diagnostics = () => ({processes:[],units:'',jobs:''});
          config.proof = module => {if(module.includes('/versions/${target}/'))process.exit(91)};
          withDeploymentLock(config.root, () => installLocked(${JSON.stringify(payload)},${JSON.stringify(reportText)},${JSON.stringify(transactionId)},config),config.uid,config.gid);
        `
        const child = path.join(root, 'crash-fixture.mjs')
        write(child, childSource)
        assert.equal(spawnSync(process.execPath, [child]).status, 91)
        assert.equal(readBarrier(root, uid, gid).phase, 'active')
        assert.match(delayed().stderr, /ROOT_DISPATCH_BARRIER_PRESENT/)
        assert.equal(fs.existsSync(path.join(root, `deployments/barrier-install-${transactionId}/receipt.json`)), false)
        assert.ok(fs.existsSync(path.join(root, `deployments/barrier-install-${transactionId}/readiness.json`)))
        continue
      }
      let receipt
      withDeploymentLock(root, () => {
        assert.equal(delayed().status, 1) // real lock excludes the old request
        receipt = installLocked(payload, reportText, transactionId, config)
      }, uid, gid)
      assert.equal(receipt.conclusion, outcome)
      assert.deepEqual(parseReceipt(canonical(receipt), { transactionId }), receipt)
      assert.throws(() => parseReceipt(canonical(receipt), { transactionId: randomUUID() }))
      assert.throws(() => parseReceipt(canonical({ ...receipt, previousSha: [before] }), { transactionId }))
      if (outcome === 'success') {
        for (const forced of ['passed', 'unknown']) {
          const text = canonical({ schemaVersion: 'eqb-barrier-route-proof-v1', install: receipt,
            forced, observedAt: new Date().toISOString() })
          assert.equal(parseRouteProof(text, { transactionId }).forced, forced)
          assert.throws(() => parseRouteProof(text.trimEnd(), { transactionId }))
        }
      }
      assert.ok(fs.existsSync(path.join(root, `deployments/barrier-install-${transactionId}/receipt.json`)))
      assert.throws(() => withDeploymentLock(root, () => installLocked(payload, reportText, transactionId, config), uid, gid))
      assert.equal(readBarrier(root, uid, gid).phase, 'active')
      if (outcome !== 'known-failure') {
        const blocked = delayed()
        assert.equal(blocked.status, 70)
        assert.match(blocked.stderr, /ROOT_DISPATCH_BARRIER_PRESENT/)
        for (const command of ['deploy-reviewed-persistence', 'update-host-config']) {
          assert.match(delayed(`${command} ${target} ${'4'.repeat(64)}`).stderr, /ROOT_DISPATCH_BARRIER_PRESENT/)
        }
        for (const bytes of ['', 'unknown']) {
          fs.writeFileSync(path.join(root, 'deployments/root-dispatch-barrier.json'), bytes)
          assert.match(delayed().stderr, /ROOT_DISPATCH_BARRIER_PRESENT/)
        }
      } else assert.equal(fs.readlinkSync(pointer), `versions/${before}`)
      for (const name of ['deploy/Caddyfile.release', 'deploy/eqb-release.service', 'deploy/eqb-deploy-transport']) {
        assert.equal(hash(fs.readFileSync(installed[name])), parsed.files[name].sha256)
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  }
  console.log('  ✓ bootstrap payload/parser, root ownership, real-lock delayed legacy request, diagnostic queues, known rollback, unknown, no retry')
}
