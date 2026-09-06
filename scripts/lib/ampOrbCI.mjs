import { createSign, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runVerificationCommand } from './verificationCommandRunner.mjs'

export const AMP_ORB_CI_REPOSITORY = 'Buqisir/english-question-bank'
export const AMP_ORB_CI_WORKFLOW_VERSION = 'v4'
export const AMP_ORB_CI_QUEUE_SCHEMA_VERSION = 'amp-orb-ci-queue-v1'
export const AMP_ORB_CI_CHECK_NAME = 'Amp Orb Verify'
export const AMP_ORB_CI_CHECK_EXTERNAL_ID_VERSION = 'v4'
export const AMP_ORB_CI_SANDBOX_USER = 'eqb-ci'
export const AMP_ORB_CI_SANDBOX_ROOT = '/var/tmp/eqb-amp-ci'

const SHA = /^[a-f0-9]{40}$/u
const DELIVERY_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/u
const GITHUB_DELIVERY_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
const QUEUE_FILE = /^([A-Za-z0-9][A-Za-z0-9-]{0,127})\.json$/u
const SANDBOX_BUNDLE = /^\/var\/tmp\/eqb-amp-ci\/inbox\/[a-f0-9-]{36}\/repository\.bundle$/u
const TERMINAL_STATES = new Set(['reported'])
const SANDBOX_LANES = new Set(['fast', 'full'])
const RUN_TIMEOUT_MS = 35 * 60 * 1000
export const AMP_ORB_CI_LOCK_CONFLICT_EXIT_CODE = 75

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function positiveInteger(value, label) {
  const number = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`Invalid ${label}`)
  return number
}

export function ampOrbCICheckExternalId(input) {
  const validated = validateAmpOrbCIInput(input)
  if (validated.event === 'pull_request') {
    return `v5-pr:${validated.pullRequestNumber}:${validated.sha}:${validated.baseSha}:${validated.testedSha}:${validated.deliveryId}`
  }
  return `${AMP_ORB_CI_CHECK_EXTERNAL_ID_VERSION}:${validated.testedSha}:${validated.deliveryId}`
}

function signGitHubAppJwt(payload, privateKey) {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const encodedPayload = base64Url(JSON.stringify(payload))
  const signingInput = `${header}.${encodedPayload}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  return `${signingInput}.${signer.sign(privateKey).toString('base64url')}`
}

export function createGitHubAppInstallationTokenProvider({
  appId,
  installationId,
  privateKey,
  fetchImpl = fetch,
  now = () => Date.now(),
  signJwt = signGitHubAppJwt,
} = {}) {
  const trustedAppId = positiveInteger(appId, 'Amp Orb CI GitHub App ID')
  const trustedInstallationId = positiveInteger(
    installationId,
    'Amp Orb CI GitHub App installation ID',
  )
  if (typeof privateKey !== 'string' || !privateKey.trim()) {
    throw new Error('Amp Orb CI GitHub App private key is missing')
  }
  if (typeof fetchImpl !== 'function' || typeof signJwt !== 'function') {
    throw new Error('Amp Orb CI GitHub App token dependencies are missing')
  }
  let cached = null
  return async ({ forceRefresh = false } = {}) => {
    const current = now()
    if (!forceRefresh && cached && cached.expiresAt - current > 60_000) return cached.token
    const issuedAt = Math.floor(current / 1_000) - 60
    const jwt = signJwt({
      iat: issuedAt,
      exp: issuedAt + 9 * 60,
      iss: trustedAppId,
    }, privateKey)
    const response = await fetchImpl(
      `https://api.github.com/app/installations/${trustedInstallationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${jwt}`,
          'x-github-api-version': '2026-03-10',
        },
      },
    )
    if (response.status !== 201) {
      throw new Error(`GitHub App installation token request failed (${response.status})`)
    }
    const body = await response.json()
    const expiresAt = Date.parse(body?.expires_at)
    if (typeof body?.token !== 'string' || !body.token || !Number.isFinite(expiresAt)) {
      throw new Error('GitHub App installation token response is invalid')
    }
    cached = { token: body.token, expiresAt }
    return cached.token
  }
}

export function createGitHubCheckWriter({
  appId,
  getInstallationToken,
  fetchImpl = fetch,
} = {}) {
  const trustedAppId = positiveInteger(appId, 'Amp Orb CI GitHub App ID')
  if (typeof getInstallationToken !== 'function' || typeof fetchImpl !== 'function') {
    throw new Error('Amp Orb CI Check writer dependencies are missing')
  }
  const request = async (url, options = {}) => {
    let token = await getInstallationToken()
    let response = await fetchImpl(url, {
      ...options,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2026-03-10',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
    })
    if (response.status === 401) {
      token = await getInstallationToken({ forceRefresh: true })
      response = await fetchImpl(url, {
        ...options,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2026-03-10',
          ...(options.body ? { 'content-type': 'application/json' } : {}),
        },
      })
    }
    return response
  }
  const matchingCheck = async ({ sha, externalId }) => {
    const matches = []
    for (let page = 1; page <= 100; page += 1) {
      const pageQuery = page === 1 ? '' : `&page=${page}`
      const response = await request(
        `https://api.github.com/repos/${AMP_ORB_CI_REPOSITORY}/commits/${sha}/check-runs?check_name=${encodeURIComponent(AMP_ORB_CI_CHECK_NAME)}&filter=all&per_page=100${pageQuery}`,
      )
      if (response.status !== 200) {
        throw new Error(`GitHub Check reconciliation failed (${response.status})`)
      }
      const body = await response.json()
      if (!Array.isArray(body?.check_runs)) {
        throw new Error('GitHub Check reconciliation response is invalid')
      }
      for (const check of body.check_runs) {
        if (
          check?.name === AMP_ORB_CI_CHECK_NAME
          && check?.head_sha === sha
          && check?.external_id === externalId
          && check?.app?.id === trustedAppId
        ) matches.push(check)
      }
      if (body.check_runs.length < 100) break
      if (page === 100) throw new Error('GitHub Check reconciliation pagination is excessive')
    }
    if (matches.length > 1) throw new Error('GitHub Check external identity is ambiguous')
    if (matches.length === 0) return null
    positiveInteger(matches[0].id, 'Amp Orb CI Check Run ID')
    return matches[0]
  }
  const reconcileCreate = async ({ sha, externalId, cause }) => {
    const found = await matchingCheck({ sha, externalId })
    if (found) return found.id
    throw cause
  }
  return Object.freeze({
    async reconcile({ sha, externalId }) {
      const found = await matchingCheck({ sha, externalId })
      if (!found) throw new Error('GitHub Check creation outcome is unresolved')
      return found.id
    },
    async start({ sha, externalId, detailsUrl = null }) {
      const parts = String(externalId || '').split(':')
      const validPush = parts.length === 3
        && parts[0] === AMP_ORB_CI_CHECK_EXTERNAL_ID_VERSION
        && parts[1] === sha
        && DELIVERY_ID.test(parts[2] || '')
      const validPR = parts.length === 6
        && parts[0] === 'v5-pr'
        && /^[1-9][0-9]*$/u.test(parts[1])
        && Number.isSafeInteger(Number(parts[1]))
        && parts[2] === sha
        && SHA.test(parts[3]) && SHA.test(parts[4])
        && GITHUB_DELIVERY_ID.test(parts[5])
      if (
        !SHA.test(sha || '')
        || (!validPush && !validPR)
      ) throw new Error('Amp Orb CI Check external identity is invalid')
      const existing = await matchingCheck({ sha, externalId })
      if (existing) return existing.id
      const body = {
        name: AMP_ORB_CI_CHECK_NAME,
        head_sha: sha,
        status: 'in_progress',
        external_id: externalId,
        ...(detailsUrl ? { details_url: detailsUrl } : {}),
      }
      let response
      try {
        response = await request(
          `https://api.github.com/repos/${AMP_ORB_CI_REPOSITORY}/check-runs`,
          { method: 'POST', body: JSON.stringify(body) },
        )
      } catch (error) {
        return reconcileCreate({ sha, externalId, cause: error })
      }
      if (response.status !== 201) {
        return reconcileCreate({
          sha,
          externalId,
          cause: new Error(`GitHub Check creation failed (${response.status})`),
        })
      }
      let created
      try {
        created = await response.json()
      } catch (error) {
        return reconcileCreate({ sha, externalId, cause: error })
      }
      if (
        created?.name !== AMP_ORB_CI_CHECK_NAME
        || created?.head_sha !== sha
        || created?.external_id !== externalId
        || created?.app?.id !== trustedAppId
        || !Number.isSafeInteger(created?.id)
        || created.id < 1
      ) {
        return reconcileCreate({
          sha,
          externalId,
          cause: new Error('GitHub Check creation response is invalid'),
        })
      }
      return created.id
    },
    async complete({ checkRunId, conclusion, summary }) {
      const id = positiveInteger(checkRunId, 'Amp Orb CI Check Run ID')
      if (!['success', 'failure'].includes(conclusion)) {
        throw new Error('Amp Orb CI Check conclusion is invalid')
      }
      if (typeof summary !== 'string' || !summary || summary.length > 65_535) {
        throw new Error('Amp Orb CI Check summary is invalid')
      }
      const response = await request(
        `https://api.github.com/repos/${AMP_ORB_CI_REPOSITORY}/check-runs/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'completed',
            conclusion,
            output: {
              title: conclusion === 'success' ? 'Amp Orb verification passed' : 'Amp Orb verification failed',
              summary,
            },
          }),
        },
      )
      if (response.status !== 200) {
        throw new Error(`GitHub Check completion failed (${response.status})`)
      }
      return id
    },
  })
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
}

function atomicWriteJson(filePath, value) {
  ensurePrivateDirectory(path.dirname(filePath))
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  const descriptor = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  } finally {
    closeSync(descriptor)
  }
  renameSync(temporary, filePath)
  chmodSync(filePath, 0o600)
}

function atomicCreateJson(filePath, value) {
  ensurePrivateDirectory(path.dirname(filePath))
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  const descriptor = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  } finally {
    closeSync(descriptor)
  }
  try {
    linkSync(temporary, filePath)
    chmodSync(filePath, 0o600)
    return true
  } catch (error) {
    if (error?.code === 'EEXIST') return false
    throw error
  } finally {
    rmSync(temporary, { force: true })
  }
}

function readJson(filePath) {
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

export function validateAmpOrbCIInput(input) {
  if (!input || !['pull_request', 'push'].includes(input.event)) {
    throw new Error('Invalid Amp Orb CI event')
  }
  if (!SHA.test(input.sha || '') || !SHA.test(input.testedSha || '') || !SHA.test(input.baseSha || '')) {
    throw new Error('Invalid Amp Orb CI commit identity')
  }
  if (!DELIVERY_ID.test(input.deliveryId || '')) {
    throw new Error('Invalid Amp Orb CI delivery identity')
  }
  if (input.event === 'pull_request') {
    if (!Number.isSafeInteger(input.pullRequestNumber) || input.pullRequestNumber < 1) {
      throw new Error('Invalid Amp Orb CI pull request identity')
    }
  } else if (input.pullRequestNumber !== null && input.pullRequestNumber !== undefined) {
    throw new Error('Push CI input cannot include a pull request identity')
  } else if (input.testedSha !== input.sha) {
    throw new Error('Push CI status and tested commits must match')
  }
  return {
    event: input.event,
    sha: input.sha,
    testedSha: input.testedSha,
    baseSha: input.baseSha,
    deliveryId: input.deliveryId,
    pullRequestNumber: input.pullRequestNumber ?? null,
    forced: input.forced === true,
  }
}

export function validateAmpOrbCIQueueInput(input) {
  if (input?.kind !== 'resolve') return validateAmpOrbCIInput(input)
  if (
    input.event !== 'pull_request'
    || !SHA.test(input.sha || '')
    || !SHA.test(input.baseSha || '')
    || !DELIVERY_ID.test(input.deliveryId || '')
    || !Number.isSafeInteger(input.pullRequestNumber)
    || input.pullRequestNumber < 1
  ) {
    throw new Error('Invalid unresolved Amp Orb CI pull request identity')
  }
  return {
    kind: 'resolve',
    event: 'pull_request',
    sha: input.sha,
    baseSha: input.baseSha,
    deliveryId: input.deliveryId,
    pullRequestNumber: input.pullRequestNumber,
  }
}

export function ampOrbCIRunId(input) {
  const validated = validateAmpOrbCIInput(input)
  const version = validated.event === 'pull_request' ? 'v5-pr' : AMP_ORB_CI_WORKFLOW_VERSION
  return `${version}-${validated.testedSha}`
}

export function enqueueAmpOrbCIJob(input, { stateDir } = {}) {
  const validated = validateAmpOrbCIQueueInput(input)
  ensurePrivateDirectory(stateDir)
  const queueDir = path.join(stateDir, 'queue')
  ensurePrivateDirectory(queueDir)
  const queuePath = path.join(queueDir, `${validated.deliveryId}.json`)
  const item = {
    schemaVersion: AMP_ORB_CI_QUEUE_SCHEMA_VERSION,
    input: validated,
  }
  const created = atomicCreateJson(queuePath, item)
  if (!created) {
    const existing = readJson(queuePath)
    if (
      existing?.schemaVersion !== AMP_ORB_CI_QUEUE_SCHEMA_VERSION
      || JSON.stringify(existing.input) !== JSON.stringify(validated)
    ) {
      throw new Error('Amp Orb CI queue delivery identity mismatch')
    }
  }
  return {
    outcome: created ? 'queued' : 'duplicate',
    queuePath,
  }
}

export async function drainAmpOrbCIQueue({ stateDir, resolveJob, runJob } = {}) {
  if (typeof runJob !== 'function') throw new Error('Amp Orb CI queue runner is missing')
  ensurePrivateDirectory(stateDir)
  const queueDir = path.join(stateDir, 'queue')
  ensurePrivateDirectory(queueDir)
  const files = readdirSync(queueDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
  const results = []
  for (const file of files) {
    const match = QUEUE_FILE.exec(file)
    if (!match) throw new Error('Amp Orb CI queue filename is invalid')
    const queuePath = path.join(queueDir, file)
    const item = readJson(queuePath)
    const queuedInput = validateAmpOrbCIQueueInput(item?.input)
    if (
      item?.schemaVersion !== AMP_ORB_CI_QUEUE_SCHEMA_VERSION
      || queuedInput.deliveryId !== match[1]
    ) {
      throw new Error('Amp Orb CI queue item identity mismatch')
    }
    let input = queuedInput
    if (
      queuedInput.kind === 'resolve'
      || (queuedInput.event === 'pull_request' && typeof resolveJob === 'function')
    ) {
      if (typeof resolveJob !== 'function') {
        throw new Error('Amp Orb CI pull request resolver is missing')
      }
      const unresolvedInput = queuedInput.kind === 'resolve'
        ? queuedInput
        : {
            kind: 'resolve',
            event: 'pull_request',
            sha: queuedInput.sha,
            baseSha: queuedInput.baseSha,
            deliveryId: queuedInput.deliveryId,
            pullRequestNumber: queuedInput.pullRequestNumber,
          }
      try {
        input = await resolveJob(unresolvedInput)
      } catch {
        results.push({
          deliveryId: queuedInput.deliveryId,
          outcome: 'deferred',
        })
        continue
      }
      if (input === null) {
        rmSync(queuePath)
        results.push({
          deliveryId: queuedInput.deliveryId,
          outcome: 'stale',
        })
        continue
      }
      input = validateAmpOrbCIInput(input)
    }
    const result = await runJob(input)
    if (
      !['cached', 'reported'].includes(result?.outcome)
      || result?.receipt?.state !== 'reported'
    ) {
      throw new Error('Amp Orb CI queue job did not reach a terminal receipt')
    }
    rmSync(queuePath)
    results.push({
      deliveryId: input.deliveryId,
      outcome: result.outcome,
    })
  }
  return results
}

export function ampOrbCILockInvocation({
  stateDir,
  controllerPath,
  controllerArgs = [],
  nodePath = process.execPath,
  wait = false,
} = {}) {
  ensurePrivateDirectory(stateDir)
  const lockPath = path.join(stateDir, 'runner.lock')
  closeSync(openSync(lockPath, 'a', 0o600))
  chmodSync(lockPath, 0o600)
  const args = ['--no-fork']
  if (!wait) {
    args.push(
      '--nonblock',
      '--conflict-exit-code',
      String(AMP_ORB_CI_LOCK_CONFLICT_EXIT_CODE),
    )
  }
  args.push(lockPath, nodePath, controllerPath, ...controllerArgs)
  return {
    command: '/usr/bin/flock',
    args,
  }
}

export function sandboxEnvironment({ nodePath = process.execPath } = {}) {
  const bin = path.dirname(nodePath)
  return Object.freeze({
    CI: '1',
    COREPACK_HOME: `${AMP_ORB_CI_SANDBOX_ROOT}/cache/corepack`,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    HOME: `${AMP_ORB_CI_SANDBOX_ROOT}/home`,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    npm_config_cache: `${AMP_ORB_CI_SANDBOX_ROOT}/cache/npm`,
    PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`,
    PLAYWRIGHT_BROWSERS_PATH: `${AMP_ORB_CI_SANDBOX_ROOT}/cache/ms-playwright`,
    TMPDIR: `${AMP_ORB_CI_SANDBOX_ROOT}/tmp`,
    XDG_CACHE_HOME: `${AMP_ORB_CI_SANDBOX_ROOT}/cache`,
  })
}

export function sandboxInvocation(input, {
  bundlePath,
  lane,
  repositoryRoot,
  nodePath = process.execPath,
} = {}) {
  const validated = validateAmpOrbCIInput(input)
  if (!SANDBOX_BUNDLE.test(bundlePath || '')) {
    throw new Error('Invalid Amp Orb CI sandbox bundle path')
  }
  if (!SANDBOX_LANES.has(lane)) throw new Error('Invalid Amp Orb CI sandbox lane')
  const helper = path.join(repositoryRoot, 'scripts', 'amp-orb-ci-sandbox.mjs')
  const environment = sandboxEnvironment({ nodePath })
  const args = [
    '-n',
    '-u',
    AMP_ORB_CI_SANDBOX_USER,
    '--',
    '/usr/bin/env',
    '-i',
    ...Object.entries(environment).map(([key, value]) => `${key}=${value}`),
    nodePath,
    helper,
    '--event',
    validated.event,
    '--sha',
    validated.sha,
    '--tested-sha',
    validated.testedSha,
    '--base-sha',
    validated.baseSha,
    '--bundle',
    bundlePath,
    '--lane',
    lane,
  ]
  if (validated.pullRequestNumber) {
    args.push('--pull-request', String(validated.pullRequestNumber))
  }
  if (validated.forced) args.push('--forced')
  return { command: 'sudo', args, environment }
}

export function reapAmpOrbCIProcesses({ execFileSyncImpl = execFileSync } = {}) {
  for (const signal of ['TERM', 'KILL']) {
    try {
      execFileSyncImpl('sudo', [
        '-n',
        '/usr/bin/pkill',
        `-${signal}`,
        '-u',
        AMP_ORB_CI_SANDBOX_USER,
      ], { stdio: 'ignore' })
    } catch (error) {
      if (error?.status !== 1) {
        throw new Error(`Amp Orb CI process cleanup failed (${error?.status ?? 'unknown'})`)
      }
    }
  }
}

export function validateAmpOrbCISandboxResult(exitCode, result, { lane } = {}) {
  if (!result || !['sandbox-error', 'setup-failed', 'verified'].includes(result.kind)) {
    throw new Error('Amp Orb CI sandbox result marker is missing or invalid')
  }
  if (!SANDBOX_LANES.has(lane) || result.lane !== lane) {
    throw new Error('Amp Orb CI sandbox result lane is missing or invalid')
  }
  if (['setup-failed', 'verified'].includes(result.kind) && result.exitCode !== exitCode) {
    throw new Error('Amp Orb CI sandbox result contradicts its process exit')
  }
  const successful = result.kind === 'verified' && result.exitCode === 0
  if ((exitCode === 0) !== successful) {
    throw new Error('Amp Orb CI sandbox result contradicts its process exit')
  }
  return result
}

function trustedGit(repositoryRoot, args, {
  allowFailure = false,
  timeoutMs = 120_000,
} = {}) {
  try {
    return execFileSync('git', args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    }).trim()
  } catch (error) {
    if (allowFailure) return null
    throw new Error(`Trusted Amp Orb CI git ${args[0]} failed (${error?.status ?? 'unknown'})`)
  }
}

export function ensureCompleteAmpOrbCIGitHistory(repositoryRoot, {
  trustedGitImpl = trustedGit,
} = {}) {
  const shallow = trustedGitImpl(repositoryRoot, ['rev-parse', '--is-shallow-repository'])
  if (shallow === 'true') {
    trustedGitImpl(repositoryRoot, ['fetch', '--no-tags', '--unshallow', 'origin'])
  } else if (shallow !== 'false') {
    throw new Error('Trusted Amp Orb CI git returned an invalid shallow-repository state')
  }
}

export async function resolveAmpOrbCIPullRequest(input, {
  repositoryRoot,
  retryDelaysMs = [0, 500, 1_000, 2_000, 4_000],
  sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  trustedGitImpl = trustedGit,
} = {}) {
  if (
    input?.kind !== 'resolve'
    || input.event !== 'pull_request'
    || !SHA.test(input.sha || '')
    || !SHA.test(input.baseSha || '')
    || !DELIVERY_ID.test(input.deliveryId || '')
    || !Number.isSafeInteger(input.pullRequestNumber)
    || input.pullRequestNumber < 1
  ) {
    throw new Error('Invalid unresolved Amp Orb CI pull request identity')
  }
  const incomingRef = [
    'refs/amp-ci/resolve/pr',
    input.pullRequestNumber,
    input.deliveryId,
  ].join('/')
  try {
    let fetchError = null
    for (const delayMs of retryDelaysMs) {
      if (delayMs > 0) await sleep(delayMs)
      try {
        trustedGitImpl(repositoryRoot, [
          'fetch',
          '--no-tags',
          'origin',
          `+refs/pull/${input.pullRequestNumber}/merge:${incomingRef}`,
        ], { timeoutMs: 5_000 })
        fetchError = null
        break
      } catch (error) {
        fetchError = error
      }
    }
    if (fetchError) throw fetchError
    const testedSha = trustedGitImpl(repositoryRoot, ['rev-parse', `${incomingRef}^{commit}`])
    if (!SHA.test(testedSha || '')) {
      throw new Error('Resolved Amp Orb CI pull request merge SHA is invalid')
    }
    const fetchedBase = trustedGitImpl(repositoryRoot, ['rev-parse', `${incomingRef}^1`])
    const fetchedHead = trustedGitImpl(repositoryRoot, ['rev-parse', `${incomingRef}^2`])
    if (fetchedBase !== input.baseSha || fetchedHead !== input.sha) return null
    return {
      ...input,
      kind: 'run',
      testedSha,
    }
  } finally {
    trustedGitImpl(repositoryRoot, ['update-ref', '-d', incomingRef], { allowFailure: true })
  }
}

export function assertAmpOrbCIHeadTree(input, { repositoryRoot, trustedGitImpl = trustedGit } = {}) {
  const validated = validateAmpOrbCIInput(input)
  if (validated.event !== 'pull_request') return
  // Strict branch protection must remain enabled: a newer base outside this
  // head then blocks merging, rather than reusing a head Check for untested code.
  trustedGitImpl(repositoryRoot, ['merge-base', '--is-ancestor', validated.baseSha, validated.sha])
  const headTree = trustedGitImpl(repositoryRoot, ['rev-parse', `${validated.sha}^{tree}`])
  const mergeTree = trustedGitImpl(repositoryRoot, ['rev-parse', `${validated.testedSha}^{tree}`])
  if (!SHA.test(headTree || '') || mergeTree !== headTree) {
    throw new Error('Amp Orb CI tested merge tree differs from PR head')
  }
}

export function prepareAmpOrbCIBundle(input, { repositoryRoot } = {}) {
  const validated = validateAmpOrbCIInput(input)
  ensureCompleteAmpOrbCIGitHistory(repositoryRoot)
  const identity = randomUUID()
  const namespace = `refs/amp-ci/bundle/${identity}`
  const incomingRef = validated.event === 'pull_request'
    ? `refs/amp-ci/incoming/pr/${validated.pullRequestNumber}`
    : 'refs/amp-ci/incoming/main'
  const remoteRef = validated.event === 'pull_request'
    ? `refs/pull/${validated.pullRequestNumber}/merge`
    : 'refs/heads/main'
  const stagingRoot = mkdtempSync(path.join(tmpdir(), 'eqb-amp-ci-bundle-'))
  const stagingBundle = path.join(stagingRoot, 'repository.bundle')
  const sandboxDirectory = `${AMP_ORB_CI_SANDBOX_ROOT}/inbox/${identity}`
  const sandboxBundle = `${sandboxDirectory}/repository.bundle`
  let installed = false
  try {
    trustedGit(repositoryRoot, [
      'fetch',
      '--no-tags',
      'origin',
      `+${remoteRef}:${incomingRef}`,
    ])
    const fetchedSha = trustedGit(repositoryRoot, ['rev-parse', `${incomingRef}^{commit}`])
    if (fetchedSha !== validated.testedSha) {
      throw new Error(`Webhook tested SHA is stale: fetched ${fetchedSha}, expected ${validated.testedSha}`)
    }
    if (validated.event === 'pull_request') {
      const fetchedBase = trustedGit(repositoryRoot, ['rev-parse', `${incomingRef}^1`])
      const fetchedHead = trustedGit(repositoryRoot, ['rev-parse', `${incomingRef}^2`])
      if (fetchedBase !== validated.baseSha || fetchedHead !== validated.sha) {
        throw new Error('Webhook pull request merge parents are stale')
      }
      assertAmpOrbCIHeadTree(validated, { repositoryRoot })
    }
    if (trustedGit(repositoryRoot, ['cat-file', '-e', `${validated.baseSha}^{commit}`], {
      allowFailure: true,
    }) === null) {
      trustedGit(repositoryRoot, ['fetch', '--no-tags', 'origin', validated.baseSha])
    }
    trustedGit(repositoryRoot, ['cat-file', '-e', `${validated.baseSha}^{commit}`])
    trustedGit(repositoryRoot, ['update-ref', `${namespace}/tested`, validated.testedSha])
    trustedGit(repositoryRoot, ['update-ref', `${namespace}/base`, validated.baseSha])
    trustedGit(repositoryRoot, [
      'bundle',
      'create',
      stagingBundle,
      `${namespace}/tested`,
      `${namespace}/base`,
    ])
    trustedGit(repositoryRoot, ['bundle', 'verify', stagingBundle])
    execFileSync('sudo', [
      'install',
      '-d',
      '-o',
      AMP_ORB_CI_SANDBOX_USER,
      '-g',
      AMP_ORB_CI_SANDBOX_USER,
      '-m',
      '0700',
      sandboxDirectory,
    ], { stdio: 'ignore' })
    execFileSync('sudo', [
      'install',
      '-o',
      AMP_ORB_CI_SANDBOX_USER,
      '-g',
      AMP_ORB_CI_SANDBOX_USER,
      '-m',
      '0400',
      stagingBundle,
      sandboxBundle,
    ], { stdio: 'ignore' })
    installed = true
    return {
      bundlePath: sandboxBundle,
      cleanup() {
        execFileSync('sudo', ['rm', '-rf', sandboxDirectory], { stdio: 'ignore' })
      },
    }
  } finally {
    trustedGit(repositoryRoot, ['update-ref', '-d', `${namespace}/tested`], { allowFailure: true })
    trustedGit(repositoryRoot, ['update-ref', '-d', `${namespace}/base`], { allowFailure: true })
    rmSync(stagingRoot, { force: true, recursive: true })
    if (!installed) {
      try {
        execFileSync('sudo', ['rm', '-rf', sandboxDirectory], { stdio: 'ignore' })
      } catch {
        // The destination may not have been created yet.
      }
    }
  }
}

export async function executeAmpOrbCISandbox(input, {
  lane,
  manageProcesses = true,
  repositoryRoot,
  writeOutput,
  timeoutMs = RUN_TIMEOUT_MS,
} = {}) {
  // Chromium crash handlers may re-parent to PID 1. The dedicated Unix user is
  // exclusively owned by this serial queue, so reap it before recovery and
  // after every run instead of trusting descendant-only process cleanup.
  if (manageProcesses) reapAmpOrbCIProcesses()
  const bundle = prepareAmpOrbCIBundle(input, { repositoryRoot })
  const invocation = sandboxInvocation(input, {
    bundlePath: bundle.bundlePath,
    lane,
    repositoryRoot,
  })
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort('SIGTERM'), timeoutMs)
  timeout.unref()
  let tail = ''
  const collect = (chunk) => {
    writeOutput(chunk)
    tail = `${tail}${chunk}`.slice(-16_384)
  }
  try {
    const exitCode = await runVerificationCommand(invocation.command, invocation.args, {
      abortSignal: abortController.signal,
      cwd: repositoryRoot,
      stdout: collect,
      stderr: collect,
    })
    const matches = [...tail.matchAll(/^AMP_ORB_CI_RESULT (\{.*\})$/gmu)]
    let result = null
    if (matches.length > 0) {
      try {
        result = JSON.parse(matches.at(-1)[1])
      } catch {
        result = null
      }
    }
    validateAmpOrbCISandboxResult(exitCode, result, { lane })
    return { exitCode, result }
  } finally {
    clearTimeout(timeout)
    try {
      if (manageProcesses) reapAmpOrbCIProcesses()
    } finally {
      bundle.cleanup()
    }
  }
}

export async function executeAmpOrbCILanes(input, {
  executeLane = null,
  onFastResult = async () => {},
  reapProcesses = reapAmpOrbCIProcesses,
  repositoryRoot,
  writeOutput,
  timeoutMs = RUN_TIMEOUT_MS,
} = {}) {
  const startedAt = Date.now()
  reapProcesses()
  const runLane = executeLane || ((lane) => executeAmpOrbCISandbox(input, {
    lane,
    manageProcesses: false,
    repositoryRoot,
    timeoutMs,
    writeOutput(chunk) {
      writeOutput(`[${lane}] ${chunk}`)
    },
  }))
  try {
    const fastPromise = runLane('fast').then(async (execution) => {
      await onFastResult(execution)
      return execution
    })
    const outcomes = await Promise.allSettled([fastPromise, runLane('full')])
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected')
    if (rejected) throw rejected.reason
    const [fast, full] = outcomes.map((outcome) => outcome.value)
    const clean = fast.result.clean === true && full.result.clean === true
    const exitCode = fast.exitCode === 0 && full.exitCode === 0 && clean ? 0 : 1
    return {
      exitCode,
      result: {
        kind: 'verified',
        fast: fast.result,
        full: full.result,
        verifyExitCode: full.result.verifyExitCode,
        e2eFailureCount: fast.result.e2eFailureCount,
        clean,
        wallSeconds: Math.max(0, (Date.now() - startedAt) / 1000),
        exitCode,
      },
    }
  } finally {
    reapProcesses()
  }
}

function validVerificationCounts(counts) {
  return ['pass', 'skip', 'fail'].every((key) => (
    Number.isSafeInteger(counts?.[key]) && counts[key] >= 0
  )) && counts.pass > 0
}

function authoritativeCheckSucceeded(receipt) {
  const result = receipt?.result
  return receipt?.conclusion === 'success'
    && result?.kind === 'verified'
    && result.fast?.kind === 'verified'
    && result.full?.kind === 'verified'
    && result.fast?.exitCode === 0
    && result.fast?.e2eFailureCount === 0
    && result.fast?.clean === true
    && result.full?.exitCode === 0
    && result.full?.verifyExitCode === 0
    && validVerificationCounts(result.full?.verificationCounts)
    && result.full?.verificationCounts?.fail === 0
    && result.full?.clean === true
    && result.clean === true
    && result.exitCode === 0
}

function canPublishAuthoritativeCheck({ deliveryId, forced } = {}) {
  return forced === false && GITHUB_DELIVERY_ID.test(deliveryId || '')
}

export function ampOrbCICheckSummary(receipt) {
  const fast = receipt?.result?.fast
  const full = receipt?.result?.full
  const duration = (lane) => Number.isFinite(lane?.wallSeconds)
    ? `${lane.wallSeconds.toFixed(1)}s`
    : 'unknown duration'
  const laneState = (lane, succeeded) => `${succeeded ? 'PASS' : 'FAIL'} (${duration(lane)})`
  const fastSucceeded = fast?.kind === 'verified'
    && fast.exitCode === 0
    && fast.e2eFailureCount === 0
    && fast.clean === true
  const fullSucceeded = full?.kind === 'verified'
    && full.exitCode === 0
    && full.verifyExitCode === 0
    && validVerificationCounts(full.verificationCounts)
    && full.verificationCounts?.fail === 0
    && full.clean === true
  const counts = full?.verificationCounts
  const countSummary = validVerificationCounts(counts)
    ? `PASS ${counts.pass} / SKIP ${counts.skip} / FAIL ${counts.fail}`
    : 'PASS/SKIP/FAIL counts unavailable'
  return [
    `Event: ${receipt.event}; PR: ${receipt.pullRequestNumber ?? 'none'}`,
    `Head: ${receipt.sha}`,
    `Base: ${receipt.baseSha}`,
    `Tested: ${receipt.testedSha}`,
    `Fast: ${laneState(fast, fastSucceeded)}`,
    `Full: ${laneState(full, fullSucceeded)}`,
    countSummary,
    `Tracked clean: ${receipt?.result?.clean === true ? 'yes' : 'no'}`,
  ].join('\n')
}

async function completeAuthoritativeCheck(receipt, publishCheck) {
  if (!publishCheck) return
  if (!Number.isSafeInteger(receipt?.checkRunId) || receipt.checkRunId < 1) {
    throw new Error('Amp Orb CI authoritative Check Run ID is missing')
  }
  await publishCheck.complete({
    checkRunId: receipt.checkRunId,
    conclusion: authoritativeCheckSucceeded(receipt) ? 'success' : 'failure',
    summary: ampOrbCICheckSummary(receipt),
  })
}

export async function runAmpOrbCIJob(input, {
  stateDir,
  publishCheck = null,
  execute,
  now = () => Date.now(),
} = {}) {
  const validated = validateAmpOrbCIInput(input)
  ensurePrivateDirectory(stateDir)

  const runId = ampOrbCIRunId(validated)
  const receiptPath = path.join(stateDir, 'runs', `${runId}.json`)
  const logPath = path.join(stateDir, 'logs', `${runId}.log`)
  let receipt = readJson(receiptPath)
  const resumedReceipt = receipt !== null
  if (receipt && (
    receipt.runId !== runId
    || receipt.sha !== validated.sha
    || receipt.testedSha !== validated.testedSha
    || receipt.baseSha !== validated.baseSha
    || receipt.event !== validated.event
    || receipt.pullRequestNumber !== validated.pullRequestNumber
    || receipt.workflowVersion !== AMP_ORB_CI_WORKFLOW_VERSION
    || (receipt.checkExternalId && receipt.checkExternalId !== ampOrbCICheckExternalId({
      ...validated,
      deliveryId: receipt.firstDeliveryId,
    }))
    || (receipt.checkRunId !== undefined && (
      !receipt.checkExternalId
      || !Number.isSafeInteger(receipt.checkRunId)
      || receipt.checkRunId < 1
    ))
  )) {
    throw new Error('Amp Orb CI receipt identity mismatch')
  }
  if (receipt && TERMINAL_STATES.has(receipt.state)) {
    return { outcome: 'cached', receipt, logPath }
  }
  let checkPublisher = null
  if (receipt?.checkExternalId) {
    if (!canPublishAuthoritativeCheck({
      deliveryId: receipt.firstDeliveryId,
      forced: receipt.forced,
    })) throw new Error('Amp Orb CI receipt Check provenance is invalid')
    if (!publishCheck) throw new Error('Amp Orb CI receipt-bound Check writer is unavailable')
    checkPublisher = publishCheck
  } else if (!resumedReceipt && publishCheck && canPublishAuthoritativeCheck(validated)) {
    checkPublisher = publishCheck
  }
  if (receipt?.state === 'verified') {
    if (checkPublisher) await completeAuthoritativeCheck(receipt, checkPublisher)
    receipt = {
      ...receipt,
      state: 'reported',
      reportedAt: new Date(now()).toISOString(),
    }
    atomicWriteJson(receiptPath, receipt)
    return { outcome: 'reported', receipt, logPath }
  }

  const startedAtMs = now()
  const firstDeliveryId = receipt?.firstDeliveryId || validated.deliveryId
  const checkExternalId = ampOrbCICheckExternalId({
    ...validated,
    deliveryId: firstDeliveryId,
  })
  receipt = {
    schemaVersion: 'amp-orb-ci-run-v2',
    workflowVersion: AMP_ORB_CI_WORKFLOW_VERSION,
    runId,
    state: 'running',
    repository: AMP_ORB_CI_REPOSITORY,
    sha: validated.sha,
    testedSha: validated.testedSha,
    baseSha: validated.baseSha,
    event: validated.event,
    pullRequestNumber: validated.pullRequestNumber,
    forced: validated.forced,
    firstDeliveryId,
    ...(checkPublisher ? { checkExternalId } : {}),
    ...(Number.isSafeInteger(receipt?.checkRunId) ? { checkRunId: receipt.checkRunId } : {}),
    startedAt: new Date(startedAtMs).toISOString(),
  }
  atomicWriteJson(receiptPath, receipt)
  if (checkPublisher && !receipt.checkRunId) {
    const publishStart = resumedReceipt ? checkPublisher.reconcile : checkPublisher.start
    if (typeof publishStart !== 'function') {
      throw new Error('Amp Orb CI Check creation recovery dependency is missing')
    }
    const checkRunId = await publishStart.call(checkPublisher, {
      sha: validated.sha,
      externalId: checkExternalId,
    })
    receipt = { ...receipt, checkRunId }
    atomicWriteJson(receiptPath, receipt)
  }
  ensurePrivateDirectory(path.dirname(logPath))
  const logDescriptor = openSync(logPath, 'w', 0o600)
  let execution
  let conclusion
  try {
    execution = await execute({
      input: validated,
      onFastResult: async () => {},
      writeOutput(chunk) {
        writeSync(logDescriptor, chunk)
      },
    })
    conclusion = execution.exitCode === 0 ? 'success' : 'failure'
  } catch (error) {
    execution = {
      exitCode: null,
      result: {
        kind: 'controller-error',
        errorName: error?.name || 'Error',
        errorMessage: String(error?.message || 'Unknown controller error').slice(0, 500),
      },
    }
    conclusion = 'error'
  } finally {
    closeSync(logDescriptor)
    chmodSync(logPath, 0o600)
  }

  receipt = {
    ...receipt,
    state: 'verified',
    conclusion,
    exitCode: execution.exitCode,
    result: execution.result,
    finishedAt: new Date(now()).toISOString(),
    wallSeconds: Math.max(0, (now() - startedAtMs) / 1000),
  }
  atomicWriteJson(receiptPath, receipt)
  if (checkPublisher) await completeAuthoritativeCheck(receipt, checkPublisher)
  receipt = {
    ...receipt,
    state: 'reported',
    reportedAt: new Date(now()).toISOString(),
  }
  atomicWriteJson(receiptPath, receipt)
  return { outcome: 'reported', receipt, logPath }
}

export function defaultAmpOrbCIStateDir(repositoryRoot) {
  return path.join(repositoryRoot, '.scratch', 'amp-orb-ci')
}

export function repositoryRootFromModule(metaUrl, ancestorCount = 2) {
  if (!Number.isSafeInteger(ancestorCount) || ancestorCount < 1) {
    throw new Error('Amp Orb CI repository-root ancestor count is invalid')
  }
  return path.resolve(
    path.dirname(fileURLToPath(metaUrl)),
    ...Array.from({ length: ancestorCount }, () => '..'),
  )
}
