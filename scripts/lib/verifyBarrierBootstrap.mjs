import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { FILES, hash, safeNode, readBarrier, withDeploymentLock, readonlyCommand, strictProof } from '../../deploy/eqb-deploy-barrier.mjs'
import { buildPayload, canonical, parsePayload, inspectHost, parseReadiness, installLocked, parseReceipt, parseRouteProof,
  failureResult, parseFailure, parseInstallExecution, diagnostics, currentMain,
  priorTatEvidence, parseProbeRequest, parseIdleUnit, parseProbe, preInstallProbe, parseProbeExecution } from '../../deploy/eqb-barrier-bootstrap.mjs'
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
        const oldId = randomUUID(), newId = randomUUID(), oldTarget = '4'.repeat(40)
        const oldPayload = buildPayload(oldTarget, name => fs.readFileSync(path.join(repository, name)))
        const oldReport = canonical({ ...report, targetSha: oldTarget, payloadDigest: hash(oldPayload), inspectedAt: '2026-01-01T00:00:00.000Z' })
        const tatText = canonical({ commandId: 'cmd-12345678', invocationId: 'inv-12345678', invocationTaskId: 'invt-12345678',
          invocationStatus: 'FAILED', taskStatus: 'FAILED', exitCode: 70, output: secret, targetDigest: '5'.repeat(64) })
        const request = { schemaVersion: 'eqb-barrier-probe-request-v1', transactionId: newId, targetSha: target,
          operatorDigest: hash(operatorSource), prior: { transactionId: oldId, targetSha: oldTarget,
            payloadDigest: hash(oldPayload), operatorDigest: hash(operatorSource), readinessDigest: hash(oldReport), tat: priorTatEvidence(tatText) } }
        const requestText = canonical(request)
        const oldDispatch = path.join(root, 'deployments', `barrier-dispatch-${oldId}`)
        const saved = { 'payload.json': oldPayload, 'readiness.json': oldReport, 'eqb-barrier-bootstrap.mjs': operatorSource,
          'eqb-deploy-barrier.mjs': fs.readFileSync(path.join(repository, 'deploy/eqb-deploy-barrier.mjs'), 'utf8') }
        for (const [name, bytes] of Object.entries(saved)) write(path.join(oldDispatch, name), bytes)
        const idle = 'LoadState=not-found\nActiveState=inactive\nSubState=dead\nMainPID=0\nControlPID=0\nJob=\n'
        assert.equal(parseIdleUnit(idle).Job, '')
        let liveCalls = 0
        const probeConfig = { ...config, diagnostics: () => ({ processes: [], units: secret, jobs: secret }),
          run(stage, exe, args) {
            assert.equal(stage, 'prior-unit'); assert.equal(exe, '/usr/bin/systemctl')
            assert.equal(args[1], `eqb-barrier-install-${oldId}.service`)
            return idle
          },
          currentMain(sha) { liveCalls++; currentMain(sha, stage => {
            assert.equal(stage, 'live-main')
            return JSON.stringify({ ref: 'refs/heads/main', object: { type: 'commit', sha: target } })
          }) } }
        const probe = (overrides = {}) => withDeploymentLock(root,
          () => preInstallProbe(payload, requestText, { ...probeConfig, ...overrides }), uid, gid)
        inspectHost(payload, probeConfig)
        assert.equal(liveCalls, 0, 'readiness does not replace pre-install live-main probe')
        const risk = probe()
        assert.equal(liveCalls, 1)
        assert.equal(risk.current, 'passed')
        assert.equal(risk.historical, 'unattributable')
        assert.equal(risk.executionAuthorized, false)
        assert.equal(risk.retryAllowed, false)
        assert.equal(canonical(risk).includes(secret), false)
        assert.deepEqual(parseProbe(canonical(risk), requestText, payload), risk)
        assert.equal(parseProbeExecution({ output: canonical(risk), exitCode: 0 }, requestText, payload).current, 'passed')
        const expired = structuredClone(risk)
        expired.readiness.inspectedAt = new Date(Date.now() - 121_000).toISOString()
        assert.equal(parseProbeExecution({ output: canonical(expired), exitCode: 0 }, requestText, payload).current, 'failed')
        const future = structuredClone(risk)
        future.readiness.inspectedAt = future.observedAt = new Date(Date.now() + 60_000).toISOString()
        assert.equal(parseProbeExecution({ output: canonical(future), exitCode: 0 }, requestText, payload).current, 'failed')
        const futureObservation = structuredClone(risk)
        futureObservation.observedAt = new Date(Date.now() + 60_000).toISOString()
        const rejectedObservation = parseProbeExecution({ output: canonical(futureObservation), exitCode: 0 }, requestText, payload)
        assert.equal(rejectedObservation.current, 'failed')
        assert.equal(rejectedObservation.readiness, null)
        assert.equal(rejectedObservation.retryAllowed, false)
        assert.equal(parseProbeExecution({ output: canonical(risk), exitCode: 70 }, requestText, payload).current, 'failed')
        for (const text of ['', secret, canonical(risk) + secret]) {
          assert.equal(parseProbeExecution({ output: text, exitCode: 0 }, requestText, payload).current, 'failed')
        }
        for (const unit of [idle.replace('MainPID=0', 'MainPID=99'), idle.replace('ControlPID=0', 'ControlPID=99'),
          idle.replace('Job=', 'Job=99'), idle.replace('inactive', 'active'), idle + secret]) {
          assert.equal(probe({ run: () => unit }).current, 'failed')
        }
        const liveFailed = probe({ currentMain: () => readonlyCommand('live-main', 'fake', [], {},
          () => ({ status: 22, stdout: secret, stderr: secret })) })
        assert.equal(liveFailed.current, 'failed')
        assert.equal(liveFailed.historical, 'unattributable')
        assert.equal(liveFailed.failure.diagnostic.stage, 'live-main')
        assert.equal(liveFailed.failure.diagnostic.exitCode, 22)
        assert.equal(canonical(liveFailed).includes(secret), false)
        for (const mutate of [r => { r.transactionId = oldId }, r => { r.transactionId = [newId] },
          r => { r.prior.tat.taskStatus = 'RUNNING' }, r => { r.prior.tat.exitCode = 0 }]) {
          const bad = structuredClone(request); mutate(bad)
          assert.throws(() => parseProbeRequest(canonical(bad), payload))
        }
        for (const mutate of [r => { r.executionAuthorized = true }, r => { r.unit.MainPID = 0 },
          r => { r.historical = 'rolled-back' }, r => { r.readiness.diagnostics.units = secret }]) {
          const bad = structuredClone(risk); mutate(bad)
          assert.throws(() => parseProbe(canonical(bad), requestText, payload))
        }
        for (const entry of [`barrier-install-${oldId}`, `barrier-install-${newId}`, `barrier-dispatch-${newId}`,
          `root-dispatch-${newId}.json`, `host-configuration/versions/${oldTarget}`]) {
          const file = path.join(root, 'deployments', entry)
          fs.symlinkSync('missing', file)
          assert.equal(probe().current, 'failed')
          fs.unlinkSync(file)
        }
        const consumed = path.join(root, 'deployments', `root-dispatch-${newId}.json`)
        fs.writeFileSync(consumed, 'invalid terminal receipt', { mode: 0o600 })
        const rejectedConsumed = probe()
        assert.equal(rejectedConsumed.current, 'failed')
        assert.equal(rejectedConsumed.readiness, null)
        assert.equal(rejectedConsumed.retryAllowed, false)
        assert.equal(fs.readFileSync(consumed, 'utf8'), 'invalid terminal receipt')
        fs.unlinkSync(consumed)
        const retained = path.join(oldDispatch, 'payload.json')
        fs.writeFileSync(retained, `${oldPayload} `)
        assert.equal(probe().current, 'failed')
        fs.writeFileSync(retained, oldPayload)
        fs.chmodSync(retained, 0o644)
        assert.equal(probe().current, 'failed')
        fs.chmodSync(retained, 0o600)
        fs.renameSync(retained, `${retained}.saved`); fs.symlinkSync(`${retained}.saved`, retained)
        assert.equal(probe().current, 'failed')
        fs.unlinkSync(retained); fs.renameSync(`${retained}.saved`, retained)
        assert.equal(probe({ gid: gid + 1 }).current, 'failed')
        for (const [name, bytes] of Object.entries(saved)) assert.equal(fs.readFileSync(path.join(oldDispatch, name), 'utf8'), bytes)
        assert.equal(fs.readlinkSync(pointer), `versions/${before}`)
        assert.equal(fs.existsSync(path.join(root, `deployments/barrier-install-${oldId}/receipt.json`)), false)
        assert.equal(fs.existsSync(path.join(root, `deployments/barrier-dispatch-${newId}`)), false)
        assert.equal(fs.existsSync(path.join(root, `deployments/barrier-install-${newId}`)), false)
        const probeWire = buildBarrierTatCommand({ operatorSource, payloadText: payload, probeText: requestText })
        assert.equal(spawnSync('/bin/bash', ['-n'], { input: probeWire.command }).status, 0)
        assert.ok(!probeWire.command.includes('/usr/bin/systemd-run'))
        assert.ok(!probeWire.command.includes('fs.mkdirSync(root'))
        assert.ok(probeWire.command.includes('operator.preInstallProbe(input.payloadText, input.probeText)'))
        assert.throws(() => buildBarrierTatCommand({ operatorSource, payloadText: payload, probeText: requestText, readinessText: reportText, transactionId }))
        const probeSource = probeWire.command.split("<<'EQB_BARRIER_NODE'\n")[1].split('\nEQB_BARRIER_NODE')[0]
        for (const failLive of [false, true]) {
          // Full generated readonly branch: map host paths to this fake root,
          // retain real flock, fake all service/network commands, reject writes.
          const preamble = `
            import fakeFs from 'node:fs'; import cp from 'node:child_process';
            import {syncBuiltinESMExports} from 'node:module';
            process.getuid=()=>0; process.getgid=()=>0;
            const locations=${JSON.stringify(Object.fromEntries(Object.entries(FILES).filter(([, p]) => p).map(([n, p]) => [p, installed[n]])))};
            locations['/usr/local/libexec/eqb-deploy-barrier-v1.mjs']=${JSON.stringify(config.manager)};
            const map=p=> typeof p !== 'string' ? p : locations[p] || (p.startsWith('/opt/eqb') ? ${JSON.stringify(root)}+p.slice(8)
              : Object.keys(locations).some(k=>k.startsWith(p+'/')) ? ${JSON.stringify(path.join(root, 'installed'))} : p);
            for (const name of ['lstatSync','openSync','readFileSync','readlinkSync']) {
              const original=fakeFs[name]; fakeFs[name]=(p,...args)=>{
                if(name==='openSync' && typeof args[0]==='number' && (args[0]&3)!==0) throw new Error('WRITE_FORBIDDEN');
                const result=original(map(p),...args);
                if(name==='lstatSync'){result.uid=0;result.gid=0;result.mode&=~0o022}
                return result;
              };
            }
            const fstat=fakeFs.fstatSync; fakeFs.fstatSync=(...args)=>{const s=fstat(...args);s.uid=0;s.gid=0;return s};
            for(const name of ['mkdirSync','writeFileSync','renameSync','unlinkSync','symlinkSync','rmSync','chmodSync']) fakeFs[name]=()=>{throw new Error('WRITE_FORBIDDEN')};
            const spawn=cp.spawnSync;
            cp.spawnSync=(exe,args,options)=>{
              if(exe==='/usr/bin/flock') return spawn(exe,args,options);
              if(exe==='/usr/bin/systemctl') return {status:0,stdout:args[0]==='show'?${JSON.stringify(idle)}:${JSON.stringify(secret)},stderr:''};
              if(exe==='/usr/bin/node') return {status:0,stdout:${JSON.stringify(preflight)},stderr:''};
              if(exe==='/usr/bin/curl') {
                const live=args.some(a=>a.startsWith('https://api.github.com/'));
                return {status:live&&${failLive}?22:0,stdout:live?${JSON.stringify(JSON.stringify({ ref: 'refs/heads/main', object: { type: 'commit', sha: target } }))}:'',stderr:${JSON.stringify(secret)}};
              }
              throw new Error('UNEXPECTED_COMMAND');
            };
            syncBuiltinESMExports();
          `
          const child = spawnSync(process.execPath, ['--input-type=module'], { encoding: 'utf8', input: preamble + probeSource })
          assert.equal(child.stderr, '')
          assert.equal(child.status, failLive ? 70 : 0, child.stdout)
          const wireReport = parseProbe(child.stdout, requestText, payload)
          assert.equal(wireReport.current, failLive ? 'failed' : 'passed')
          assert.equal(child.stdout.includes(secret), false)
        }
        const unauthorized = spawnSync(process.execPath, [path.join(repository, 'scripts/amp-orb-deploy.mjs'), 'root-barrier-probe'], { encoding: 'utf8' })
        assert.equal(unauthorized.status, 1)
        assert.match(unauthorized.stderr, /Readonly probe input\/authority invalid/)
        proofs = 1
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
