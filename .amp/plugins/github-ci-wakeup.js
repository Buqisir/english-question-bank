import { spawn } from 'node:child_process'
import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import {
  defaultAmpOrbCIStateDir,
  enqueueAmpOrbCIJob,
  repositoryRootFromModule,
} from '../../scripts/lib/ampOrbCI.mjs'

const REPOSITORY = 'Buqisir/english-question-bank'
const MAIN_REF = 'refs/heads/main'
const SHA = /^[a-f0-9]{40}$/u
const DELIVERY_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/u
const PR_ACTIONS = new Set(['opened', 'ready_for_review', 'reopened', 'synchronize'])
const CONTROLLER_COMMANDS = new Set(['drain'])

export const description = 'Receives signed GitHub events and durably queues exact CI targets in one private Orb.'

export function validGitHubCISignature(body, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/u.test(signature || '')) return false
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  const actualBytes = Buffer.from(signature)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes)
}

export function parseGitHubCIWebhook(body, { eventName, deliveryId }) {
  if (!DELIVERY_ID.test(deliveryId || '')) return null
  let payload
  try {
    payload = JSON.parse(Buffer.from(body).toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  if (payload.repository?.full_name !== REPOSITORY) return null

  if (eventName === 'ping') return { kind: 'ignored' }
  if (eventName === 'pull_request') {
    const number = payload.number
    const head = payload.pull_request?.head
    const base = payload.pull_request?.base
    if (!PR_ACTIONS.has(payload.action)) return null
    if (!Number.isSafeInteger(number) || number < 1) return null
    if (head?.repo?.full_name !== REPOSITORY) return null
    if (base?.repo?.full_name !== REPOSITORY || base?.ref !== 'main') return null
    if (!SHA.test(head?.sha || '') || !SHA.test(base?.sha || '')) {
      return null
    }
    return {
      kind: 'resolve',
      event: 'pull_request',
      action: payload.action,
      deliveryId,
      sha: head.sha,
      baseSha: base.sha,
      pullRequestNumber: number,
    }
  }
  if (eventName === 'push') {
    if (payload.ref !== MAIN_REF || payload.deleted !== false) return null
    if (!SHA.test(payload.after || '') || !SHA.test(payload.before || '')) return null
    return {
      kind: 'run',
      event: 'push',
      action: 'main',
      deliveryId,
      sha: payload.after,
      testedSha: payload.after,
      baseSha: payload.before,
      forced: payload.forced === true,
    }
  }
  return null
}

function ampOrbCINodeExecutable() {
  const homeDirectory = String(process.env.HOME || '')
  if (!path.isAbsolute(homeDirectory)) {
    throw new Error('Amp Orb CI requires an absolute HOME for the setup-owned Node.js runtime')
  }
  return path.join(homeDirectory, '.local', 'node-24', 'bin', 'node')
}

function recordGitHubCIDrainLaunch(stateDir, record) {
  try {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 })
    chmodSync(stateDir, 0o700)
    const launcherPath = path.join(stateDir, 'launcher.json')
    writeFileSync(launcherPath, `${JSON.stringify({
      schemaVersion: 'amp-orb-ci-launcher-v1',
      recordedAt: new Date().toISOString(),
      ...record,
    }, null, 2)}\n`, { mode: 0o600 })
    chmodSync(launcherPath, 0o600)
  } catch {
    // Diagnostics must never block or retain a successfully spawned drainer.
  }
}

export async function launchGitHubCIDrain({
  controllerCommand = 'drain',
  repositoryRoot,
  stateDir,
  onSettled = () => {},
  spawnImpl = spawn,
} = {}) {
  if (!CONTROLLER_COMMANDS.has(controllerCommand)) {
    throw new Error('Invalid Amp Orb CI controller command')
  }
  const controllerPath = path.join(repositoryRoot, 'scripts', 'amp-orb-ci.mjs')
  const resolvedStateDir = stateDir || defaultAmpOrbCIStateDir(repositoryRoot)
  await new Promise((resolve, reject) => {
    let spawned = false
    let settled = false
    let child
    const settle = () => {
      if (settled) return
      settled = true
      try {
        onSettled()
      } catch {
        // Resource cleanup must not hide the controller outcome.
      }
    }
    try {
      child = spawnImpl(ampOrbCINodeExecutable(), [controllerPath, controllerCommand], {
        cwd: repositoryRoot,
        detached: true,
        env: process.env,
        stdio: 'ignore',
      })
    } catch (error) {
      recordGitHubCIDrainLaunch(resolvedStateDir, {
        state: 'error',
        errorName: String(error?.name || 'Error').slice(0, 80),
        errorCode: String(error?.code || 'unknown').slice(0, 80),
      })
      settle()
      reject(error)
      return
    }
    child.once('error', (error) => {
      recordGitHubCIDrainLaunch(resolvedStateDir, {
        state: 'error',
        errorName: String(error?.name || 'Error').slice(0, 80),
        errorCode: String(error?.code || 'unknown').slice(0, 80),
      })
      settle()
      if (!spawned) reject(error)
    })
    child.once('spawn', () => {
      spawned = true
      child.unref()
      recordGitHubCIDrainLaunch(resolvedStateDir, {
        state: 'spawned',
        pid: child.pid ?? null,
      })
      resolve()
    })
    child.once('exit', (code, signal) => {
      recordGitHubCIDrainLaunch(resolvedStateDir, {
        state: 'exited',
        pid: child.pid ?? null,
        code: Number.isInteger(code) ? code : null,
        signal: typeof signal === 'string' ? signal.slice(0, 32) : null,
      })
      settle()
    })
  })
}

export default async function githubCIWakeupPlugin(amp, overrides = {}) {
  if (process.env.QUESTION_BANK_AMP_CI_PLUGIN_ENABLED !== '1') {
    amp.logger.log('Amp Orb CI is disabled; no webhook was registered.')
    return
  }

  const webhookSecret = String(
    process.env.QUESTION_BANK_AMP_CI_GITHUB_WEBHOOK_SECRET || '',
  )
  const appId = String(process.env.QUESTION_BANK_AMP_CI_GITHUB_APP_ID || '')
  const installationId = String(process.env.QUESTION_BANK_AMP_CI_GITHUB_APP_INSTALLATION_ID || '')
  const privateKey = String(process.env.QUESTION_BANK_AMP_CI_GITHUB_APP_PRIVATE_KEY || '')
  if (!webhookSecret || !appId || !installationId || !privateKey) {
    amp.logger.log('Amp Orb CI is enabled but its webhook or GitHub App credentials are missing.')
    return
  }

  const repositoryRoot = overrides.repositoryRoot || repositoryRootFromModule(import.meta.url)
  const stateDir = overrides.stateDir || defaultAmpOrbCIStateDir(repositoryRoot)
  const launchController = overrides.launchController || launchGitHubCIDrain
  const launchDrain = overrides.launchDrain || (async (controllerCommand = 'drain') => {
    const keepAlive = await amp.system.executor.keepAlive()
    let released = false
    const release = () => {
      if (released) return
      released = true
      keepAlive.unsubscribe()
    }
    try {
      await launchController({
        controllerCommand,
        repositoryRoot,
        stateDir,
        onSettled: release,
      })
    } catch (error) {
      release()
      throw error
    }
  })

  const registration = await amp.createWebhook({
    // Opaque historic identifier retained so the private webhook capability is not rotated.
    key: 'eqbank-github-ci-shadow-v1',
    headers: ['x-github-delivery', 'x-github-event', 'x-hub-signature-256'],
    handler: async (event, context) => {
      const signature = event.headers['x-hub-signature-256'] || ''
      if (!validGitHubCISignature(event.body, signature, webhookSecret)) {
        context.logger.log('Dropped an invalid GitHub CI webhook signature.')
        return
      }
      const payload = parseGitHubCIWebhook(event.body, {
        deliveryId: event.headers['x-github-delivery'] || '',
        eventName: event.headers['x-github-event'] || '',
      })
      if (!payload) {
        context.logger.log('Dropped a GitHub event outside the CI allowlist.')
        return
      }
      if (payload.kind === 'ignored') return
      enqueueAmpOrbCIJob(payload, { stateDir })
      await launchDrain()
    },
  })

  amp.registerCommand(
    'github-ci-webhook-url',
    {
      title: '复制 GitHub CI Webhook URL',
      category: 'CI Orb',
      description: '仅在显式调用时显示私有 capability URL，供 GitHub repository webhook 配置。',
    },
    async (context) => {
      await context.ui.input({
        title: 'GitHub CI Webhook URL',
        helpText: '这是私有凭据。复制到 GitHub 后关闭，不要写入 Git、日志或聊天。',
        initialValue: registration.url,
        submitButtonText: '关闭',
      })
    },
  )

  const queueDir = path.join(stateDir, 'queue')
  let startupRecoveryRequired = false
  try {
    startupRecoveryRequired = existsSync(queueDir)
      && readdirSync(queueDir).some((file) => file.endsWith('.json'))
  } catch {
    amp.logger.log('Amp Orb CI startup queue inspection failed; the plugin remains available.')
    return
  }
  if (!startupRecoveryRequired) return
  try {
    await launchDrain()
  } catch {
    amp.logger.log('Amp Orb CI startup recovery was deferred; its durable queue remains intact.')
  }
}
