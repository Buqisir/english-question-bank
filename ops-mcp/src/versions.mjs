import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { runFixed } from './commands.mjs'

const SHA = /^[a-f0-9]{40}$/u

function unknown(reason) {
  return { commit: 'unknown', reason }
}

export async function readCheckoutCommit({ checkoutPath, gitBin }) {
  try {
    const { stdout } = await runFixed(gitBin, ['-C', checkoutPath, 'rev-parse', 'HEAD'])
    const commit = stdout.trim()
    if (!SHA.test(commit)) return unknown('checkout git HEAD is not a 40-hex SHA')
    return { commit, reason: null }
  } catch (error) {
    return unknown(`checkout git HEAD unread: ${error.message}`)
  }
}

export function readCurrentReleaseSha(releaseRoot) {
  const currentPath = path.join(releaseRoot, 'current')
  const stat = lstatSync(currentPath)
  if (!stat.isSymbolicLink()) {
    throw new Error('deployment current pointer is not a symlink')
  }
  const target = readlinkSync(currentPath)
  const match = /^releases\/([a-f0-9]{40})$/u.exec(target)
  if (!match) throw new Error('deployment current pointer does not name one release SHA')
  const sha = match[1]
  const markerPath = path.join(releaseRoot, 'releases', sha, '.eqb-release.json')
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
  if (marker?.schemaVersion !== 'eqb-release-v1' || marker.sha !== sha) {
    throw new Error('release marker is invalid')
  }
  return { sha, currentPath, releasePath: path.join(releaseRoot, 'releases', sha) }
}

export async function readServiceMainPid(systemctlBin, serviceName) {
  const { stdout } = await runFixed(systemctlBin, [
    'show',
    serviceName,
    '--property=MainPID,ActiveState,ActiveEnterTimestamp',
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
    activeState: values.ActiveState || 'unknown',
    activeEnterTimestamp: values.ActiveEnterTimestamp || '',
  }
}

export async function readProcessCwd(pid) {
  const cwdLink = `/proc/${pid}/cwd`
  try {
    return { cwd: readlinkSync(cwdLink), real: realpathSync(cwdLink) }
  } catch {
    const lsof = existsSync('/usr/sbin/lsof') ? '/usr/sbin/lsof' : '/usr/bin/lsof'
    const { stdout } = await runFixed(lsof, ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
    const line = stdout.split('\n').find((entry) => entry.startsWith('n'))
    if (!line) throw new Error(`process ${pid} cwd unread`)
    const cwd = line.slice(1)
    return { cwd, real: realpathSync(cwd) }
  }
}

function processCwdMatchesRelease(cwdInfo, releasePath, currentPath) {
  const realRelease = realpathSync(releasePath)
  const realCurrent = realpathSync(currentPath)
  return cwdInfo.cwd === releasePath
    || cwdInfo.cwd === currentPath
    || cwdInfo.real === realRelease
    || cwdInfo.real === realCurrent
}

export async function readRunningCommit({
  releaseRoot,
  systemctlBin,
  eqbService,
  processCwdReader = readProcessCwd,
}) {
  try {
    const current = readCurrentReleaseSha(releaseRoot)
    const service = await readServiceMainPid(systemctlBin, eqbService)
    if (!service.pid) {
      return unknown('eqb MainPID is unavailable; directory SHA is not used as runningCommit')
    }
    try {
      const cwdInfo = await processCwdReader(service.pid)
      if (!processCwdMatchesRelease(cwdInfo, current.releasePath, current.currentPath)) {
        return unknown(`eqb pid ${service.pid} cwd does not match /opt/eqb/current; refusing to guess runningCommit`)
      }
    } catch (error) {
      return unknown(`eqb process cwd unread: ${error.message}`)
    }
    return {
      commit: current.sha,
      reason: null,
      proof: 'release-marker+process-cwd',
      activeState: service.activeState,
      activeEnterTimestamp: service.activeEnterTimestamp,
    }
  } catch (error) {
    return unknown(error.message)
  }
}
