import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { FILES, hash, safeNode, readBarrier, withDeploymentLock, readonlyCommand, strictProof } from '../../deploy/eqb-deploy-barrier.mjs'
import { buildPayload, canonical, parsePayload, inspectHost, parseReadiness, installLocked, parseReceipt, parseRouteProof,
  failureResult, parseFailure, parseInstallExecution, diagnostics, currentMain } from '../../deploy/eqb-barrier-bootstrap.mjs'
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
  const secret = 'FAKE_SECRET_DO_NOT_ECHO'
  const transaction = randomUUID()
  const preflight = JSON.stringify({ schemaVersion: 'eqb-deployment-preflight-v2', controllerVersion: 'eqb-deploy-controller-v1',
    productionSha: production, eqb: 'active', caddy: 'active', layout: 'release' })
  for (const stage of ['selected-preflight', ...Array.from({ length: 6 }, (_, i) => `health-${i}`),
    'list-units', 'list-jobs', 'live-main', 'journal-sync', 'journal-read', 'deploy-lock']) {
    for (const status of [70, null]) {
      const run = (actual, executable, args, options) => actual !== stage ? preflight
        : readonlyCommand(actual, executable, args, options, () => ({ status, stdout: secret, stderr: secret,
          error: status === null ? { code: 'ETIMEDOUT', message: secret } : undefined }))
      let error
      try {
        if (stage === 'live-main') currentMain(target, run)
        else if (stage.startsWith('list-')) diagnostics(run)
        else if (stage.startsWith('journal-') || stage === 'deploy-lock') run(stage, 'fake-readonly', [])
        else strictProof('fake-module', production, run)
      } catch (caught) { error = caught }
      assert.ok(error)
      const result = failureResult(transaction, 'root-entry', error)
      assert.equal(result.diagnostic.stage, stage)
      assert.equal(result.diagnostic.exitCode, status)
      assert.equal(result.diagnostic.code, status === null ? 'ETIMEDOUT' : null)
      assert.equal(result.diagnostic.stderrBytes, Buffer.byteLength(secret))
      assert.equal(result.retryAllowed, false)
      assert.equal(canonical(result).includes(secret), false)
      assert.deepEqual(parseFailure(canonical(result), transaction), result)
      assert.equal(parseInstallExecution({ output: canonical(result), exitCode: 70 }, { transactionId: transaction }).conclusion, 'unknown')
    }
  }
  for (const output of [secret, `${preflight}\n${secret}`, 'null']) {
    for (const operation of [() => strictProof('fake', production, () => output), () => currentMain(target, () => output)]) {
      assert.throws(operation, (error) => {
        assert.ok(['selected-preflight', 'live-main'].includes(error.diagnostic.stage))
        assert.equal(canonical(failureResult(transaction, 'root-entry', error)).includes(secret), false)
        return true
      })
    }
  }
  for (const output of ['', `Bootstrap unknown ${secret}`, '{}\n', canonical(failureResult(randomUUID(), 'root-entry'))]) {
    const result = parseInstallExecution({ output, exitCode: 70 }, { transactionId: transaction })
    assert.equal(result.diagnostic.stage, 'remote-output')
    assert.equal(result.diagnostic.exitCode, 70)
    assert.equal(result.conclusion, 'unknown')
    assert.equal(canonical(result).includes(secret), false)
  }
  const failure = failureResult(transaction, 'root-entry')
  for (const value of [{ ...failure, retryAllowed: true }, { ...failure, transactionId: [transaction] },
    { ...failure, diagnostic: { ...failure.diagnostic, code: secret } },
    { ...failure, diagnostic: { ...failure.diagnostic, stage: secret } }]) {
    assert.throws(() => parseFailure(canonical(value), transaction))
  }
  const rootGuard = spawnSync(process.execPath, [path.join(repository, 'deploy/eqb-barrier-bootstrap.mjs'),
    'install', '/nonexistent', '/nonexistent', transaction], { encoding: 'utf8' })
  assert.equal(rootGuard.status, 70)
  assert.equal(rootGuard.stderr, '')
  assert.equal(parseFailure(rootGuard.stdout, transaction).conclusion, 'unknown')

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
      assert.ok(invocation.command.includes("'eqb-barrier-install-' + input.transactionId"))
      if (outcome === 'success') {
        const generated = invocation.command.split("<<'EQB_BARRIER_NODE'\n")[1].split('\nEQB_BARRIER_NODE')[0]
        const wireFailure = failureResult(transactionId, 'live-main', { diagnostic: { exitCode: 22, stdoutBytes: 0, stderrBytes: 20 } })
        for (const mode of ['root-guard', 'structured', 'polluted', 'journal-sync', 'journal-read', 'launch-error']) {
          const sandbox = fs.mkdtempSync(path.join(tmpdir(), 'eqb-bootstrap-wire-'))
          try {
            fs.mkdirSync(path.join(sandbox, 'deployments'))
            // Execute the generated transport itself with local fake process/fs
            // seams. No systemd, curl, journal, TAT or host command can execute.
            const preamble = `
              import cp from 'node:child_process';
              import fakeFs from 'node:fs';
              import {syncBuiltinESMExports} from 'node:module';
              process.getuid = () => ${mode === 'root-guard' ? 1000 : 0}; process.getgid = () => 0;
              const stat = fakeFs.lstatSync;
              fakeFs.lstatSync = (...args) => {const s = stat(...args); s.uid = 0; s.gid = 0; s.mode &= ~0o022; return s};
              cp.spawnSync = (exe, args) => {
                if (exe === '/usr/bin/systemd-run') return ${mode === 'launch-error'
                  ? `{status:null,error:{code:'EACCES',message:${JSON.stringify(secret)}},stdout:'',stderr:${JSON.stringify(secret)}}`
                  : "{status:70,stdout:'',stderr:''}"};
                if (exe !== '/usr/bin/journalctl') throw new Error('Unexpected fake command');
                const sync = args.includes('--sync');
                return {status: ${JSON.stringify(mode)} === (sync ? 'journal-sync' : 'journal-read') ? 1 : 0,
                  stdout: sync ? '' : ${JSON.stringify(mode === 'polluted' ? `Bootstrap unknown ${secret}\n` : canonical(wireFailure))},
                  stderr:${JSON.stringify(secret)}};
              };
              syncBuiltinESMExports();
            `
            const child = spawnSync(process.execPath, ['--input-type=module'], { encoding: 'utf8',
              input: preamble + generated.replaceAll('/opt/eqb', sandbox) })
            assert.equal(child.status, 70, child.stderr)
            assert.equal(child.stderr, '')
            assert.equal(child.stdout.includes(secret), false)
            const result = parseFailure(child.stdout, transactionId)
            const expectedStage = { 'root-guard': 'transport-load', structured: 'live-main', polluted: 'remote-output',
              'journal-sync': 'journal-sync', 'journal-read': 'journal-read', 'launch-error': 'manager-launch' }[mode]
            assert.equal(result.diagnostic.stage, expectedStage)
            if (mode !== 'root-guard') {
              assert.ok(fs.existsSync(path.join(sandbox, 'deployments', `barrier-dispatch-${transactionId}`, 'payload.json')))
              const again = spawnSync(process.execPath, ['--input-type=module'], { encoding: 'utf8',
                input: preamble + generated.replaceAll('/opt/eqb', sandbox) })
              assert.equal(again.status, 70)
              assert.equal(parseFailure(again.stdout, transactionId).diagnostic.stage, 'dispatch-stage')
            }
          } finally { fs.rmSync(sandbox, { recursive: true, force: true }) }
        }
        // Reproduce the observed state, not an inferred cause: dispatch staging
        // exists, exit70, no attempt/receipt/barrier/manager/target, old pointer.
        const dispatch = path.join(root, 'deployments', `barrier-dispatch-${transactionId}`)
        fs.mkdirSync(dispatch)
        const oldPointer = fs.readlinkSync(pointer)
        const oldWrapper = fs.readFileSync(installed['deploy/eqb-deploy-controller'])
        for (const stage of ['selected-preflight', 'list-units', 'list-jobs', 'live-main',
          ...Array.from({ length: 6 }, (_, i) => `health-${i}`)]) {
          const fail = () => readonlyCommand(stage, 'fake', [], {}, () => ({ status: 70, stdout: secret, stderr: secret }))
          let error
          try {
            withDeploymentLock(root, () => installLocked(payload, reportText, transactionId, {
              ...config, ...(stage === 'live-main' ? { currentMain: fail }
                : stage.startsWith('list-') ? { diagnostics: fail } : { proof: fail }),
            }), uid, gid)
          } catch (caught) { error = caught }
          assert.ok(error)
          const result = parseInstallExecution({ output: canonical(failureResult(transactionId, 'root-entry', error)), exitCode: 70 }, { transactionId })
          assert.equal(result.diagnostic.stage, stage)
          assert.equal(result.conclusion, 'unknown')
          assert.equal(result.retryAllowed, false)
          for (const entry of [`deployments/barrier-install-${transactionId}`, 'deployments/root-dispatch-barrier.json',
            'installed/manager.mjs', `deployments/host-configuration/versions/${target}`]) assert.equal(fs.existsSync(path.join(root, entry)), false)
          assert.equal(fs.readlinkSync(pointer), oldPointer)
          assert.deepEqual(fs.readFileSync(installed['deploy/eqb-deploy-controller']), oldWrapper)
        }
        proofs = 1
      }
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
      assert.equal(parseInstallExecution({ output: canonical(receipt), exitCode: outcome === 'success' ? 0 : 70 }, { transactionId }).conclusion, outcome)
      assert.equal(parseInstallExecution({ output: `${canonical(receipt)}${secret}`, exitCode: 0 }, { transactionId }).conclusion, 'unknown')
      if (outcome === 'success') assert.equal(parseInstallExecution({ output: canonical(receipt), exitCode: 70 }, { transactionId }).conclusion, 'unknown')
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
