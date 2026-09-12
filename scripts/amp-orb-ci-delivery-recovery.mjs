#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { defaultAmpOrbCIStateDir, repositoryRootFromModule } from './lib/ampOrbCI.mjs'
import {
  ampOrbCIDeliveryRecoveryLockInvocation,
  createGitHubRepositoryWebhookDeliveryClient,
  recordAmpOrbCIDeliveryRecoveryFailure,
  recoverAmpOrbCIDeliveries,
} from './lib/ampOrbCIDeliveryRecovery.mjs'

const repositoryRoot = repositoryRootFromModule(import.meta.url, 1)
const stateDir = defaultAmpOrbCIStateDir(repositoryRoot)

if (process.argv[2] !== 'recover') {
  console.error('Usage: amp-orb-ci-delivery-recovery.mjs recover')
  process.exit(1)
}

if (process.env.AMP_ORB_CI_DELIVERY_RECOVERY_LOCK_HELD !== '1') {
  const invocation = ampOrbCIDeliveryRecoveryLockInvocation({
    stateDir,
    scriptPath: fileURLToPath(import.meta.url),
    args: process.argv.slice(2),
  })
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    env: { ...process.env, AMP_ORB_CI_DELIVERY_RECOVERY_LOCK_HELD: '1' },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status === 75) {
    console.log('Amp Orb CI delivery recovery is already running; this invocation did no work.')
    process.exit(0)
  }
  process.exit(result.status ?? 1)
}

try {
  const hookId = Number(process.env.QUESTION_BANK_AMP_CI_GITHUB_WEBHOOK_ID)
  const accessToken = String(process.env.QUESTION_BANK_AMP_CI_GITHUB_WEBHOOK_RECOVERY_TOKEN || '')
  if (!Number.isSafeInteger(hookId) || hookId < 1 || !accessToken) {
    recordAmpOrbCIDeliveryRecoveryFailure({ stateDir, code: 'invalid-configuration' })
    throw new Error('Amp Orb CI webhook recovery configuration is missing')
  }
  const client = createGitHubRepositoryWebhookDeliveryClient({
    hookId,
    getAccessToken: async () => accessToken,
  })
  const result = await recoverAmpOrbCIDeliveries({
    stateDir,
    listDeliveries: client.listDeliveries,
    getDelivery: client.getDelivery,
    redeliver: client.redeliver,
  })
  const manual = result.summary.outcomes['manual-required'] || 0
  const unknown = result.summary.outcomes['redelivery-unknown'] || 0
  console.log(`Amp Orb CI delivery recovery scanned ${result.summary.scanned}; requested ${result.summary.requests}; manual ${manual}; unknown ${unknown}.`)
  if (manual > 0 || unknown > 0 || result.summary.state === 'blocked') process.exitCode = 1
} catch (error) {
  if (!/configuration is missing/u.test(error.message)) {
    const status = Number(String(error.message).match(/\((\d{3})\)/u)?.[1])
    const code = [401, 403, 404].includes(status)
      ? 'permission-denied' : status === 429 ? 'rate-limited' : 'api-unavailable'
    try {
      recordAmpOrbCIDeliveryRecoveryFailure({ stateDir, code })
    } catch {
      // The original failure remains authoritative.
    }
  }
  console.error('Amp Orb CI delivery recovery blocked; inspect its private status ledger.')
  process.exitCode = 1
}
