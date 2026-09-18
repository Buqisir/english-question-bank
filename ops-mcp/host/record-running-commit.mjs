// Loaded with Node --import, in the actual eqb MainPID before server/api.mjs.
// Never resolve /opt/eqb/current here: cwd is already pinned by systemd.
import { readFileSync, realpathSync, writeFileSync, renameSync } from 'node:fs'
import path from 'node:path'

export function recordRunningCommit({
  cwd = process.cwd(),
  pid = process.pid,
  invocationId = process.env.INVOCATION_ID,
  releaseRoot = '/opt/eqb',
  destination = '/run/eqb-provenance/running-commit.json',
} = {}) {
  const sourceDirectory = realpathSync(cwd)
  const commit = path.basename(sourceDirectory)
  if (!/^[a-f0-9]{40}$/u.test(commit)
    || sourceDirectory !== path.join(releaseRoot, 'releases', commit)) {
    throw new Error('eqb startup cwd is not a versioned release')
  }
  const marker = JSON.parse(readFileSync(path.join(sourceDirectory, '.eqb-release.json'), 'utf8'))
  if (marker.schemaVersion !== 'eqb-release-v1' || marker.sha !== commit
    || !Number.isSafeInteger(pid) || pid <= 0 || !/^[a-f0-9]{32}$/u.test(invocationId || '')) {
    throw new Error('eqb startup release marker or invocation identity is invalid')
  }
  const proof = { schemaVersion: 'eqb-running-commit-v1', commit, pid, invocationId,
    sourceDirectory, recordedAt: new Date().toISOString() }
  const temporary = `${destination}.${pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(proof)}\n`, { mode: 0o444, flag: 'wx' })
  renameSync(temporary, destination)
  return proof
}

// Importing for unit tests does not write to /run. The production preload is
// selected by the fixed entrypoint installed alongside this pure writer.
