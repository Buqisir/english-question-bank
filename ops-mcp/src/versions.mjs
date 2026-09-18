import { lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { runFixed } from './commands.mjs'

const SHA = /^[a-f0-9]{40}$/u

function unknown(reason) {
  return { commit: 'unknown', reason }
}

export async function readCheckoutCommit({ checkoutPath, gitBin }) {
  try {
    const { stdout } = await runFixed(gitBin, ['-c', `safe.directory=${checkoutPath}`, '-C', checkoutPath, 'rev-parse', '--verify', 'HEAD'])
    const commit = stdout.trim()
    if (!SHA.test(commit)) return unknown('checkout git HEAD is not a 40-hex SHA')
    return { commit, reason: null }
  } catch (error) {
    return unknown(`checkout git HEAD unread: ${error.message}`)
  }
}

export async function readServiceMainPid(systemctlBin, serviceName) {
  const { stdout } = await runFixed(systemctlBin, [
    'show',
    serviceName,
    '--property=MainPID,ActiveState,ActiveEnterTimestamp,InvocationID',
    '--no-page',
  ])
  const values = Object.fromEntries(
    stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      }),
  )
  return {
    pid: Number(values.MainPID || 0),
    invocationId: values.InvocationID || '',
    activeState: values.ActiveState || 'unknown',
    activeEnterTimestamp: values.ActiveEnterTimestamp || '',
  }
}

export async function readRunningCommit({
  releaseRoot,
  systemctlBin,
  eqbService,
  provenancePath = '/run/eqb-provenance/running-commit.json',
}) {
  try {
    const before = await readServiceMainPid(systemctlBin, eqbService)
    if (before.activeState !== 'active' || !Number.isSafeInteger(before.pid) || before.pid <= 0) {
      return unknown('eqb is not active with a valid MainPID')
    }
    if (!/^[a-f0-9]{32}$/u.test(before.invocationId)) {
      return unknown('eqb systemd InvocationID is unavailable')
    }
    const state = lstatSync(provenancePath)
    if (!state.isFile() || state.isSymbolicLink() || state.size > 4096 || (state.mode & 0o022)) {
      return unknown('runtime provenance is not a bounded, non-group/world-writable regular file')
    }
    const proof = JSON.parse(readFileSync(provenancePath, 'utf8'))
    if (proof.schemaVersion !== 'eqb-running-commit-v1' || !SHA.test(proof.commit || '')
      || proof.pid !== before.pid || proof.invocationId !== before.invocationId
      || proof.sourceDirectory !== path.join(releaseRoot, 'releases', proof.commit)
      || !Number.isFinite(Date.parse(proof.recordedAt))) {
      return unknown('runtime provenance is invalid or does not match the current service invocation')
    }
    const marker = JSON.parse(readFileSync(path.join(proof.sourceDirectory, '.eqb-release.json'), 'utf8'))
    if (marker.schemaVersion !== 'eqb-release-v1' || marker.sha !== proof.commit) {
      return unknown('runtime provenance release marker does not match its commit')
    }
    const after = await readServiceMainPid(systemctlBin, eqbService)
    if (after.activeState !== 'active' || after.pid !== before.pid
      || after.invocationId !== before.invocationId) {
      return unknown('eqb service invocation changed while reading runtime provenance')
    }
    return {
      commit: proof.commit,
      reason: null,
      proof: {
        source: 'runtime-provenance',
        path: provenancePath,
        service: eqbService,
        pid: proof.pid,
        invocationId: proof.invocationId,
        sourceDirectory: proof.sourceDirectory,
        recordedAt: proof.recordedAt,
        startedAt: after.activeEnterTimestamp,
      },
    }
  } catch (error) {
    return unknown(`runtime provenance unavailable: ${error.message}`)
  }
}
