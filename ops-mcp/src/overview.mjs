import { statfsSync } from 'node:fs'
import { readCheckoutCommit, readRunningCommit, readServiceMainPid } from './versions.mjs'

export async function collectOverview(config) {
  const [checkout, running, eqb, caddy] = await Promise.all([
    readCheckoutCommit(config),
    readRunningCommit(config),
    readServiceMainPid(config.systemctlBin, config.eqbService).catch((error) => ({
      pid: 0,
      activeState: 'unknown',
      activeEnterTimestamp: '',
      error: error.message,
    })),
    readServiceMainPid(config.systemctlBin, config.caddyService).catch((error) => ({
      pid: 0,
      activeState: 'unknown',
      activeEnterTimestamp: '',
      error: error.message,
    })),
  ])

  let disk = { path: config.diskPath, error: 'unread' }
  try {
    const fsStat = statfsSync(config.diskPath)
    const block = Number(fsStat.bsize)
    disk = {
      path: config.diskPath,
      totalBytes: Number(fsStat.blocks) * block,
      freeBytes: Number(fsStat.bavail) * block,
    }
  } catch (error) {
    disk = { path: config.diskPath, error: error.message }
  }

  return {
    checkoutCommit: checkout.commit,
    checkoutCommitReason: checkout.reason,
    runningCommit: running.commit,
    runningCommitReason: running.reason,
    runningCommitProof: running.proof || null,
    services: {
      eqb: {
        name: config.eqbService,
        activeState: eqb.activeState,
        pid: eqb.pid || null,
        startedAt: eqb.activeEnterTimestamp || null,
        error: eqb.error || null,
      },
      caddy: {
        name: config.caddyService,
        activeState: caddy.activeState,
        pid: caddy.pid || null,
        startedAt: caddy.activeEnterTimestamp || null,
        error: caddy.error || null,
      },
    },
    disk,
  }
}
