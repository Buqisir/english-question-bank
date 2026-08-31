import { randomUUID } from 'node:crypto'
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
export const AMP_ORB_CI_WORKFLOW_VERSION = 'v3'
export const AMP_ORB_CI_QUEUE_SCHEMA_VERSION = 'amp-orb-ci-queue-v1'
export const AMP_ORB_CI_STATUS_CONTEXT = 'Amp Orb Verify'
export const AMP_ORB_CI_FAST_STATUS_CONTEXT = 'Amp Orb Verify (fast)'
export const AMP_ORB_CI_SANDBOX_USER = 'eqb-ci'
export const AMP_ORB_CI_SANDBOX_ROOT = '/var/tmp/eqb-amp-ci'

const SHA = /^[a-f0-9]{40}$/u
const DELIVERY_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/u
const QUEUE_FILE = /^([A-Za-z0-9][A-Za-z0-9-]{0,127})\.json$/u
const SANDBOX_BUNDLE = /^\/var\/tmp\/eqb-amp-ci\/inbox\/[a-f0-9-]{36}\/repository\.bundle$/u
const THREAD_ID = /^T-[a-f0-9-]{36}$/u
const TERMINAL_STATES = new Set(['reported'])
const SANDBOX_LANES = new Set(['fast', 'full'])
const STATUS_CONTEXTS = new Set([AMP_ORB_CI_FAST_STATUS_CONTEXT, AMP_ORB_CI_STATUS_CONTEXT])
const RUN_TIMEOUT_MS = 35 * 60 * 1000
export const AMP_ORB_CI_LOCK_CONFLICT_EXIT_CODE = 75

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
  return `${AMP_ORB_CI_WORKFLOW_VERSION}-${validateAmpOrbCIInput(input).testedSha}`
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
    if (queuedInput.kind === 'resolve') {
      if (typeof resolveJob !== 'function') {
        throw new Error('Amp Orb CI pull request resolver is missing')
      }
      try {
        input = await resolveJob(queuedInput)
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

function githubStatusTargetUrl(threadId) {
  return THREAD_ID.test(threadId || '')
    ? `https://ampcode.com/threads/${threadId}`
    : null
}

export function createGitHubStatusWriter({ token, threadId, fetchImpl = fetch }) {
  if (!token) throw new Error('Amp Orb CI GitHub status token is missing')
  return async ({ sha, state, description, context = AMP_ORB_CI_STATUS_CONTEXT }) => {
    if (!STATUS_CONTEXTS.has(context)) throw new Error('Amp Orb CI GitHub status context is invalid')
    const body = {
      state,
      context,
      description,
      target_url: githubStatusTargetUrl(threadId),
    }
    const response = await fetchImpl(
      `https://api.github.com/repos/${AMP_ORB_CI_REPOSITORY}/statuses/${sha}`,
      {
        method: 'POST',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-github-api-version': '2026-03-10',
        },
        body: JSON.stringify(body),
      },
    )
    if (response.status !== 201) {
      throw new Error(`GitHub shadow status write failed (${response.status})`)
    }
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
  if (!result || !['docs-only', 'sandbox-error', 'setup-failed', 'verified'].includes(result.kind)) {
    throw new Error('Amp Orb CI sandbox result marker is missing or invalid')
  }
  if (!SANDBOX_LANES.has(lane) || result.lane !== lane) {
    throw new Error('Amp Orb CI sandbox result lane is missing or invalid')
  }
  if (['setup-failed', 'verified'].includes(result.kind) && result.exitCode !== exitCode) {
    throw new Error('Amp Orb CI sandbox result contradicts its process exit')
  }
  const successful = result.kind === 'docs-only'
    || (result.kind === 'verified' && result.exitCode === 0)
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
    if (fast.result.kind === 'docs-only' || full.result.kind === 'docs-only') {
      if (fast.result.kind !== 'docs-only' || full.result.kind !== 'docs-only') {
        throw new Error('Amp Orb CI lane scope results disagree')
      }
      return {
        exitCode: 0,
        result: {
          kind: 'docs-only',
          fast: fast.result,
          full: full.result,
          wallSeconds: Math.max(0, (Date.now() - startedAt) / 1000),
        },
      }
    }
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

function statusDescription(receipt) {
  if (receipt.result?.kind === 'docs-only') {
    return 'Docs-only change; full verification not required'
  }
  const wall = Number.isFinite(receipt.result?.wallSeconds)
    ? ` in ${Math.round(receipt.result.wallSeconds)}s`
    : ''
  if (receipt.conclusion === 'success') return `verify:all + e2e passed${wall} on Amp Orb`
  if (receipt.conclusion === 'failure') return `verify:all or e2e failed${wall} on Amp Orb`
  return `Amp Orb verification could not complete${wall}`
}

function fastStatusDescription(fast) {
  if (fast.result?.kind === 'docs-only') return 'Docs-only change; fast E2E not required'
  const wall = Number.isFinite(fast.result?.wallSeconds)
    ? ` in ${Math.round(fast.result.wallSeconds)}s`
    : ''
  if (fast.conclusion === 'success') return `E2E fast lane passed${wall} on Amp Orb`
  if (fast.conclusion === 'failure') return `E2E fast lane failed${wall} on Amp Orb`
  return `Amp Orb fast lane could not complete${wall}`
}

function statusState(conclusion) {
  if (conclusion === 'success') return 'success'
  if (conclusion === 'failure') return 'failure'
  return 'error'
}

export async function runAmpOrbCIJob(input, {
  stateDir,
  writeStatus,
  execute,
  now = () => Date.now(),
} = {}) {
  const validated = validateAmpOrbCIInput(input)
  ensurePrivateDirectory(stateDir)

  const runId = ampOrbCIRunId(validated)
  const receiptPath = path.join(stateDir, 'runs', `${runId}.json`)
  const logPath = path.join(stateDir, 'logs', `${runId}.log`)
  let receipt = readJson(receiptPath)
  if (receipt && (
    receipt.runId !== runId
    || receipt.sha !== validated.sha
    || receipt.testedSha !== validated.testedSha
    || receipt.workflowVersion !== AMP_ORB_CI_WORKFLOW_VERSION
  )) {
    throw new Error('Amp Orb CI receipt identity mismatch')
  }
  if (receipt && TERMINAL_STATES.has(receipt.state)) {
    return { outcome: 'cached', receipt, logPath }
  }

  const reportFastStatus = async () => {
    if (!receipt?.fast || receipt.fast.state === 'reported') return
    await writeStatus({
      sha: receipt.sha,
      state: statusState(receipt.fast.conclusion),
      context: AMP_ORB_CI_FAST_STATUS_CONTEXT,
      description: fastStatusDescription(receipt.fast),
    })
    receipt = {
      ...receipt,
      fast: {
        ...receipt.fast,
        state: 'reported',
        reportedAt: new Date(now()).toISOString(),
      },
    }
    atomicWriteJson(receiptPath, receipt)
  }

  const recordFastResult = async (execution, {
    replace = false,
    suppressStatusError = false,
  } = {}) => {
    if (replace || !receipt.fast) {
      const conclusion = execution.exitCode === 0
        ? 'success'
        : (Number.isInteger(execution.exitCode) ? 'failure' : 'error')
      receipt = {
        ...receipt,
        fast: {
          state: 'verified',
          conclusion,
          exitCode: execution.exitCode,
          result: execution.result,
          finishedAt: new Date(now()).toISOString(),
        },
      }
      atomicWriteJson(receiptPath, receipt)
    }
    try {
      await reportFastStatus()
    } catch (error) {
      if (!suppressStatusError) throw error
    }
  }

  if (receipt?.fast?.state === 'verified') await reportFastStatus()
  if (receipt?.state === 'verified') {
    if (!receipt.fast) {
      await recordFastResult({
        exitCode: null,
        result: { kind: 'controller-error', errorName: 'Error' },
      })
    }
    await writeStatus({
      sha: receipt.sha,
      state: statusState(receipt.conclusion),
      context: AMP_ORB_CI_STATUS_CONTEXT,
      description: statusDescription(receipt),
    })
    receipt = {
      ...receipt,
      state: 'reported',
      reportedAt: new Date(now()).toISOString(),
    }
    atomicWriteJson(receiptPath, receipt)
    return { outcome: 'reported', receipt, logPath }
  }

  const retainedFast = receipt?.state === 'running' ? receipt.fast : null
  const startedAtMs = now()
  receipt = {
    schemaVersion: 'amp-orb-ci-run-v1',
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
    firstDeliveryId: validated.deliveryId,
    startedAt: new Date(startedAtMs).toISOString(),
    ...(retainedFast ? { fast: retainedFast } : {}),
  }
  atomicWriteJson(receiptPath, receipt)
  if (!retainedFast) {
    await writeStatus({
      sha: validated.sha,
      state: 'pending',
      context: AMP_ORB_CI_FAST_STATUS_CONTEXT,
      description: 'Fast E2E queued on the dedicated 16-core Amp Orb',
    })
  }
  await writeStatus({
    sha: validated.sha,
    state: 'pending',
    context: AMP_ORB_CI_STATUS_CONTEXT,
    description: 'Queued on the dedicated 16-core Amp Orb',
  })

  ensurePrivateDirectory(path.dirname(logPath))
  const logDescriptor = openSync(logPath, 'w', 0o600)
  let execution
  let conclusion
  try {
    execution = await execute({
      input: validated,
      async onFastResult(fastExecution) {
        await recordFastResult(fastExecution, {
          replace: true,
          suppressStatusError: true,
        })
      },
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

  if (!receipt.fast) {
    const fastResult = execution.result?.fast
    await recordFastResult(fastResult
      ? {
          exitCode: fastResult.kind === 'docs-only' ? 0 : fastResult.exitCode,
          result: fastResult,
        }
      : {
          exitCode: null,
          result: {
            kind: 'controller-error',
            errorName: execution.result?.errorName || 'Error',
          },
        }, { suppressStatusError: true })
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
  await reportFastStatus()
  await writeStatus({
    sha: receipt.sha,
    state: statusState(receipt.conclusion),
    context: AMP_ORB_CI_STATUS_CONTEXT,
    description: statusDescription(receipt),
  })
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
