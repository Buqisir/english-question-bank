#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  chownSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const EQB_DEPLOY_CONTROLLER_VERSION = 'eqb-deploy-controller-v1'
export const EQB_DEPLOY_RECEIPT_SCHEMA_VERSION = 'eqb-deployment-receipt-v2'

const SHA = /^[a-f0-9]{40}$/u
const RELEASE_MARKER = '.eqb-release.json'
const COMMAND_TIMEOUT_MS = 20 * 60 * 1000
const HEALTH_ATTEMPTS = 30
const HEALTH_INTERVAL_MS = 1000
const HEALTH_TIMEOUT_MS = 60_000
const HOST_CONFIGURATION_PATHS = Object.freeze([
  'deploy/Caddyfile.release',
  'deploy/eqb-release.service',
  'deploy/eqb-deploy-controller',
  'deploy/eqb-deploy-controller.mjs',
])
const PERSISTENCE_AUTHORITY_PATHS = Object.freeze([
  'data/sql',
  'server/api.mjs',
  'server/auth/auth.mjs',
  'server/draft-paper/draftPaperStore.mjs',
  'server/import-review/importReviewStore.mjs',
  'server/my-space/mySpace.mjs',
  'server/paper-import/publisher.mjs',
  'server/paper-import/storage.mjs',
  'server/source-intake/sourceIntakeStore.mjs',
  'server/user-data',
  'server/vocabulary/vocabularyStore.mjs',
])

export const PRODUCTION_CONFIG = Object.freeze({
  root: '/opt/eqb',
  source: '/opt/eqb/english-question-bank',
  controllerUid: 0,
  minimumFreeBytes: 5 * 1024 * 1024 * 1024,
  sourceUser: 'eqb',
  runtimeUser: 'eqb',
  buildUser: 'eqb-build',
  buildGroup: 'eqb-build',
  repositoryUrls: Object.freeze([
    'https://github.com/Buqisir/english-question-bank',
    'https://github.com/Buqisir/english-question-bank.git',
    'git@github.com:Buqisir/english-question-bank',
    'git@github.com:Buqisir/english-question-bank.git',
    'ssh://git@github.com/Buqisir/english-question-bank',
    'ssh://git@github.com/Buqisir/english-question-bank.git',
  ]),
  service: 'eqb',
  caddyService: 'caddy',
})

function assertSha(value, label = 'deployment SHA') {
  if (!SHA.test(value || '')) throw new Error(`Invalid ${label}`)
  return value
}

function assertAbsolute(directory, label) {
  if (!path.isAbsolute(directory || '')) throw new Error(`${label} must be absolute`)
  return path.resolve(directory)
}

function ensureDirectory(directory, mode) {
  mkdirSync(directory, { recursive: true, mode })
  chmodSync(directory, mode)
}

function pathEntryExists(filePath) {
  try {
    lstatSync(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function privateWrite(filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  const descriptor = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(descriptor, value, 'utf8')
  } finally {
    closeSync(descriptor)
  }
  chmodSync(temporary, 0o600)
  renameSync(temporary, filePath)
  chmodSync(filePath, 0o600)
}

function releaseDirectory(config, sha) {
  return path.join(config.root, 'releases', assertSha(sha))
}

function readReleaseMarker(config, sha) {
  const directory = releaseDirectory(config, sha)
  if (!existsSync(directory) || !lstatSync(directory).isDirectory()) {
    throw new Error(`Prepared release ${sha} is missing`)
  }
  const releaseState = statSync(directory)
  if (releaseState.uid !== config.controllerUid || (releaseState.mode & 0o022) !== 0) {
    throw new Error(`Prepared release ${sha} is not controller-owned and sealed`)
  }
  let marker
  const markerPath = path.join(directory, RELEASE_MARKER)
  try {
    const markerState = lstatSync(markerPath)
    if (
      !markerState.isFile()
      || markerState.uid !== config.controllerUid
      || (markerState.mode & 0o022) !== 0
    ) {
      throw new Error('untrusted marker')
    }
    marker = JSON.parse(readFileSync(markerPath, 'utf8'))
  } catch {
    throw new Error(`Prepared release ${sha} has no valid marker`)
  }
  if (
    marker?.schemaVersion !== 'eqb-release-v1'
    || marker.sha !== sha
  ) {
    throw new Error(`Prepared release ${sha} marker is invalid`)
  }
  return { directory, marker }
}

function currentReleaseSha(config) {
  const currentPath = path.join(config.root, 'current')
  if (!existsSync(currentPath) || !lstatSync(currentPath).isSymbolicLink()) {
    throw new Error('Deployment current pointer is missing or not a symlink')
  }
  if (lstatSync(currentPath).uid !== config.controllerUid) {
    throw new Error('Deployment current pointer is not controller-owned')
  }
  const releases = path.join(config.root, 'releases')
  const target = path.resolve(path.dirname(currentPath), readlinkSync(currentPath))
  const relative = path.relative(releases, target)
  if (!SHA.test(relative) || relative.includes(path.sep)) {
    throw new Error('Deployment current pointer does not name one release SHA')
  }
  readReleaseMarker(config, relative)
  return relative
}

function switchCurrent(config, sha) {
  readReleaseMarker(config, sha)
  const currentPath = path.join(config.root, 'current')
  const temporary = path.join(config.root, `.current-${process.pid}-${randomUUID()}`)
  symlinkSync(path.join('releases', sha), temporary)
  try {
    renameSync(temporary, currentPath)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function defaultRun(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: options.encoding ?? 'utf8',
    stdio: options.stdio,
    timeout: options.timeout,
    env: options.env,
  })
}

function productionDependencies(config) {
  const fixedPath = '/usr/local/bin:/usr/bin:/bin'
  const run = defaultRun
  return {
    runSource(command, args, options = {}) {
      return run('/usr/sbin/runuser', [
        '-u', config.sourceUser,
        '--',
        '/usr/bin/env', '-i',
        `HOME=/home/${config.sourceUser}`,
        `PATH=${fixedPath}`,
        'GIT_TERMINAL_PROMPT=0',
        'GCM_INTERACTIVE=never',
        'GIT_SSH_COMMAND=/usr/bin/ssh -F /dev/null -o BatchMode=yes -o PasswordAuthentication=no',
        command,
        ...args,
      ], options)
    },
    runBuild(command, args, { home, release, ...options } = {}) {
      delete options.timeout
      return run('/usr/bin/systemd-run', [
        '--quiet',
        '--wait',
        '--pipe',
        '--collect',
        '--property=Type=exec',
        '--property=RuntimeMaxSec=1200s',
        '--property=KillMode=control-group',
        `--uid=${config.buildUser}`,
        '--',
        '/usr/bin/env', '-i',
        `HOME=${home}`,
        `PATH=${fixedPath}`,
        `PLAYWRIGHT_BROWSERS_PATH=${path.join(release, '.playwright-browsers')}`,
        '/bin/sh', '-c', 'umask 022; exec "$@"', 'eqb-release-build',
        command,
        ...args,
      ], options)
    },
    runSystem: run,
    sleep(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds))
    },
    uid(user) {
      return Number(run('/usr/bin/id', ['-u', user]).trim())
    },
    chown(directory, user, group) {
      const uid = Number(run('/usr/bin/id', ['-u', user]).trim())
      const gid = Number(run('/usr/bin/id', ['-g', group]).trim())
      chownSync(directory, uid, gid)
      run('/usr/bin/chown', ['-hR', `${user}:${group}`, directory], { stdio: 'ignore' })
    },
    seal(directory) {
      run('/usr/bin/chown', ['-hR', 'root:root', directory], { stdio: 'ignore' })
      run('/usr/bin/chmod', ['-R', 'u+rwX,go+rX,go-w', directory], { stdio: 'ignore' })
      chmodSync(directory, 0o755)
    },
  }
}

function assertLayout(config, dependencies) {
  const root = assertAbsolute(config.root, 'Deployment root')
  const source = assertAbsolute(config.source, 'Deployment source')
  if (path.dirname(source) !== root || path.basename(source) !== 'english-question-bank') {
    throw new Error('Deployment source is outside the fixed root')
  }
  if (!lstatSync(root).isDirectory()) throw new Error('Deployment root is not a directory')
  const rootState = statSync(root)
  if (rootState.uid !== config.controllerUid || (rootState.mode & 0o022) !== 0) {
    throw new Error('Deployment root is not controller-owned and sealed')
  }
  for (const directory of [
    path.join(root, 'releases'),
    path.join(root, 'deployments'),
  ]) {
    if (!existsSync(directory) || !lstatSync(directory).isDirectory()) {
      throw new Error('Deployment release layout is not bootstrapped')
    }
    const state = statSync(directory)
    if (state.uid !== config.controllerUid || (state.mode & 0o022) !== 0) {
      throw new Error('Deployment controller directory is not sealed')
    }
  }
  if (!existsSync(path.join(root, 'shared')) || !lstatSync(path.join(root, 'shared')).isDirectory()) {
    throw new Error('Deployment release layout is not bootstrapped')
  }
  const shared = statSync(path.join(root, 'shared'))
  if (config.runtimeUser === config.buildUser) {
    throw new Error('Deployment build and runtime users must differ')
  }
  if ((shared.mode & 0o077) !== 0 || shared.uid !== dependencies.uid(config.runtimeUser)) {
    throw new Error('Deployment shared directory must not be accessible to the build user')
  }
  for (const relative of ['data', 'paper-assets', 'exports', 'server-logs']) {
    const target = path.join(root, 'shared', relative)
    if (!existsSync(target) || !lstatSync(target).isDirectory()) {
      throw new Error(`Deployment shared ${relative} directory is missing`)
    }
  }
  const environment = path.join(root, 'shared', '.env')
  if (!existsSync(environment) || !lstatSync(environment).isFile()) {
    throw new Error('Deployment shared environment file is missing')
  }
  const environmentState = statSync(environment)
  if ((environmentState.mode & 0o077) !== 0 || environmentState.uid !== shared.uid) {
    throw new Error('Deployment shared environment file is not private to the runtime user')
  }
  return { root, source }
}

function assertOrigin(config, dependencies) {
  const origin = String(dependencies.runSource(
    '/usr/bin/git',
    ['-C', config.source, 'remote', 'get-url', 'origin'],
  )).trim()
  if (!config.repositoryUrls.includes(origin)) {
    throw new Error('Production source origin is not the fixed repository')
  }
}

function controllerFailure(code, message) {
  const error = new Error(message)
  error.controllerFailureCode = code
  return error
}

function changedProtectedPaths(config, dependencies, previousSha, targetSha, paths) {
  return String(dependencies.runSystem(
    '/usr/bin/git',
    [
      '-c', `safe.directory=${config.source}`,
      '-C', config.source,
      'diff', '--name-only', '--no-renames',
      previousSha, targetSha,
      '--',
      ...paths,
    ],
    { timeout: COMMAND_TIMEOUT_MS },
  )).trim()
}

function assertOrdinaryReleaseBoundary(config, dependencies, previousSha, targetSha) {
  if (changedProtectedPaths(
    config,
    dependencies,
    previousSha,
    targetSha,
    HOST_CONFIGURATION_PATHS,
  )) {
    throw controllerFailure(
      'HOST_CONFIGURATION_UPDATE_REQUIRED',
      'Target changes the fixed host deployment configuration',
    )
  }
  if (changedProtectedPaths(
    config,
    dependencies,
    previousSha,
    targetSha,
    PERSISTENCE_AUTHORITY_PATHS,
  )) {
    throw controllerFailure(
      'SEPARATE_MUTATION_AUTHORIZATION_REQUIRED',
      'Target changes production persistence authority',
    )
  }
}

function fetchMain(config, dependencies) {
  assertOrigin(config, dependencies)
  dependencies.runSource(
    '/usr/bin/git',
    ['-C', config.source, 'fetch', '--quiet', '--no-tags', 'origin', 'main'],
    { timeout: COMMAND_TIMEOUT_MS },
  )
  return assertSha(String(dependencies.runSource(
    '/usr/bin/git',
    ['-C', config.source, 'rev-parse', 'FETCH_HEAD'],
  )).trim(), 'fetched main SHA')
}

function replaceWithSharedLink(release, relative, target) {
  const destination = path.join(release, relative)
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(path.dirname(destination), { recursive: true })
  symlinkSync(target, destination)
}

function assertCandidateStructure(release) {
  for (const relative of ['app', path.join('app', 'public'), 'server', 'deploy']) {
    const candidatePath = path.join(release, relative)
    if (!existsSync(candidatePath) || !lstatSync(candidatePath).isDirectory()) {
      throw new Error(`Prepared release has an unsafe ${relative} directory`)
    }
  }
}

function restoreTrustedDeployTree(dependencies, release, archive) {
  const deployDirectory = path.join(release, 'deploy')
  rmSync(deployDirectory, { recursive: true, force: true })
  dependencies.runSystem('/usr/bin/tar', [
    '-xf', archive,
    '-C', release,
    'deploy',
  ], {
    timeout: COMMAND_TIMEOUT_MS,
    stdio: 'ignore',
  })
  assertCandidateStructure(release)
  for (const relative of [
    'Caddyfile.release',
    'eqb-release.service',
    'eqb-deploy-controller',
    'eqb-deploy-controller.mjs',
  ]) {
    const trustedPath = path.join(deployDirectory, relative)
    if (!existsSync(trustedPath) || !lstatSync(trustedPath).isFile()) {
      throw new Error(`Prepared release has an unsafe deploy/${relative}`)
    }
  }
}

function buildEnvironment(config, dependencies, release) {
  const home = mkdtempSync(path.join(config.root, 'deployments', '.build-home-'))
  const logs = path.join(config.root, 'deployments', 'logs')
  ensureDirectory(logs, 0o700)
  const logPath = path.join(logs, `build-${Date.now()}-${randomUUID()}.log`)
  const logDescriptor = openSync(logPath, 'wx', 0o600)
  dependencies.chown(home, config.buildUser, config.buildGroup)
  const run = (command, args) => dependencies.runBuild(command, args, {
    home,
    release,
    timeout: COMMAND_TIMEOUT_MS,
    stdio: ['ignore', logDescriptor, logDescriptor],
  })
  try {
    run('/usr/bin/pnpm', ['-C', path.join(release, 'app'), 'install', '--frozen-lockfile'])
    run('/usr/bin/npm', ['--prefix', path.join(release, 'server'), 'ci'])
    run('/usr/bin/pnpm', [
      '-C', path.join(release, 'app'),
      'exec', 'playwright', 'install', '--no-shell', 'chromium',
    ])
    run('/usr/bin/node', [path.join(release, 'scripts', 'smoke-production-chromium.mjs')])
    run('/usr/bin/pnpm', ['-C', path.join(release, 'app'), 'build'])
  } finally {
    closeSync(logDescriptor)
    chmodSync(logPath, 0o600)
    rmSync(home, { recursive: true, force: true })
  }
  if (!existsSync(path.join(release, 'app', 'dist', 'index.html'))) {
    throw new Error('Prepared release is missing the built app')
  }
}

function sealRelease(config, dependencies, release, sha) {
  assertCandidateStructure(release)
  replaceWithSharedLink(release, 'data', path.join(config.root, 'shared', 'data'))
  replaceWithSharedLink(
    release,
    path.join('app', 'public', 'paper-assets'),
    path.join(config.root, 'shared', 'paper-assets'),
  )
  replaceWithSharedLink(release, 'exports', path.join(config.root, 'shared', 'exports'))
  replaceWithSharedLink(
    release,
    path.join('server', 'logs'),
    path.join(config.root, 'shared', 'server-logs'),
  )
  replaceWithSharedLink(release, '.env', path.join(config.root, 'shared', '.env'))
  const markerPath = path.join(release, RELEASE_MARKER)
  rmSync(markerPath, { recursive: true, force: true })
  const markerDescriptor = openSync(markerPath, 'wx', 0o444)
  try {
    writeFileSync(markerDescriptor, `${JSON.stringify({
      schemaVersion: 'eqb-release-v1',
      sha,
      controllerVersion: EQB_DEPLOY_CONTROLLER_VERSION,
      preparedAt: new Date().toISOString(),
    }, null, 2)}\n`, 'utf8')
  } finally {
    closeSync(markerDescriptor)
  }
  chmodSync(markerPath, 0o444)
  dependencies.seal(release)
  chmodSync(markerPath, 0o444)
}

function prepareRelease(config, dependencies, sha) {
  const finalDirectory = releaseDirectory(config, sha)
  if (existsSync(finalDirectory)) {
    readReleaseMarker(config, sha)
    return { release: finalDirectory, staged: false }
  }
  const filesystem = statfsSync(config.root)
  const availableBytes = filesystem.bavail * filesystem.bsize
  if (availableBytes < config.minimumFreeBytes) {
    throw new Error('Production filesystem has insufficient space to stage a release')
  }

  const staging = mkdtempSync(path.join(config.root, 'releases', `.staging-${sha}-`))
  const archiveDirectory = mkdtempSync(path.join(config.root, 'deployments', '.source-archive-'))
  const archive = path.join(archiveDirectory, `${sha}.tar`)
  try {
    dependencies.chown(staging, config.buildUser, config.buildGroup)
    const archiveDescriptor = openSync(archive, 'wx', 0o600)
    try {
      dependencies.runSystem(
        '/usr/bin/git',
        [
          '-c', `safe.directory=${config.source}`,
          '-C', config.source,
          'archive', '--format=tar', sha,
        ],
        {
          timeout: COMMAND_TIMEOUT_MS,
          stdio: ['ignore', archiveDescriptor, 'inherit'],
        },
      )
    } finally {
      closeSync(archiveDescriptor)
    }
    dependencies.runSystem('/usr/bin/tar', ['-xf', archive, '-C', staging], {
      timeout: COMMAND_TIMEOUT_MS,
      stdio: 'ignore',
    })
    dependencies.chown(staging, config.buildUser, config.buildGroup)
    buildEnvironment(config, dependencies, staging)
    restoreTrustedDeployTree(dependencies, staging, archive)
    sealRelease(config, dependencies, staging, sha)
    renameSync(staging, finalDirectory)
    readReleaseMarker(config, sha)
    return { release: finalDirectory, staged: true }
  } finally {
    rmSync(archiveDirectory, { recursive: true, force: true })
    rmSync(staging, { recursive: true, force: true })
  }
}

function commandHealthy(dependencies, command, args, timeout = 15_000) {
  try {
    dependencies.runSystem(command, args, {
      timeout,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

async function healthCheck(config, dependencies) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  const boundedCommandHealthy = (command, args, maximumTimeout = 15_000) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return false
    return commandHealthy(
      dependencies,
      command,
      args,
      Math.max(1, Math.min(maximumTimeout, Math.ceil(remaining))),
    )
  }
  const curl = (args) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return false
    return boundedCommandHealthy('/usr/bin/curl', [
      '--fail',
      '--silent',
      '--show-error',
      '--max-time', Math.max(0.001, Math.min(10, remaining / 1000)).toFixed(3),
      '--output', '/dev/null',
      ...args,
    ], remaining)
  }
  for (let attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1) {
    if (Date.now() >= deadline) return false
    const healthy = boundedCommandHealthy(
      '/usr/bin/systemctl',
      ['is-active', '--quiet', config.service],
    ) && boundedCommandHealthy(
      '/usr/bin/systemctl',
      ['is-active', '--quiet', config.caddyService],
    ) && curl(['http://127.0.0.1:8787/api/health'])
      && curl(['--resolve', 'eqbank.cc:443:127.0.0.1', 'https://eqbank.cc/api/health'])
      && curl(['https://eqbank.cc/api/health'])
      && curl(['https://eqbank.cc/'])
      && curl(['https://eqbank.cc/ops/'])
      && curl(['https://eqbank.cc/ops/?view=review'])
    if (healthy) return true
    if (attempt < HEALTH_ATTEMPTS && Date.now() < deadline) {
      await dependencies.sleep(Math.min(HEALTH_INTERVAL_MS, deadline - Date.now()))
    } else {
      return false
    }
  }
  return false
}

function restart(config, dependencies) {
  dependencies.runSystem('/usr/bin/systemctl', ['restart', config.service], {
    timeout: 30_000,
    stdio: 'ignore',
  })
}

function writeReceipt(config, receipt) {
  const receipts = path.join(config.root, 'deployments', 'receipts')
  ensureDirectory(receipts, 0o700)
  const timestamp = receipt.finishedAt.replaceAll(/[^0-9]/gu, '')
  const receiptPath = path.join(receipts, `${timestamp}-${receipt.targetSha}-${randomUUID()}.json`)
  privateWrite(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
  return receiptPath
}

function terminalReceipt({
  targetSha,
  previousSha,
  staged,
  noOp,
  rolledBack,
  rollbackHealthy,
  failureCode,
  startedAt,
}) {
  return {
    schemaVersion: EQB_DEPLOY_RECEIPT_SCHEMA_VERSION,
    controllerVersion: EQB_DEPLOY_CONTROLLER_VERSION,
    state: 'reported',
    conclusion: failureCode ? 'failure' : 'success',
    targetSha,
    previousSha,
    staged,
    noOp,
    rolledBack,
    rollbackHealthy,
    failureCode,
    startedAt,
    finishedAt: new Date().toISOString(),
  }
}

async function deploy(config, dependencies, targetSha) {
  const startedAt = new Date().toISOString()
  let previousSha = null
  let staged = false
  let noOp = false
  let rolledBack = false
  let rollbackHealthy = null
  let failureCode = null

  assertLayout(config, dependencies)
  try {
    previousSha = currentReleaseSha(config)
    const fetchedSha = fetchMain(config, dependencies)
    if (fetchedSha !== targetSha) throw new Error('Production source main does not match target SHA')
    assertOrdinaryReleaseBoundary(config, dependencies, previousSha, targetSha)
    staged = prepareRelease(config, dependencies, targetSha).staged
    const recheckedSha = fetchMain(config, dependencies)
    if (recheckedSha !== targetSha) throw new Error('GitHub main changed while preparing release')

    if (previousSha === targetSha) {
      noOp = true
      if (!await healthCheck(config, dependencies)) failureCode = 'CURRENT_RELEASE_UNHEALTHY'
    } else {
      switchCurrent(config, targetSha)
      try {
        restart(config, dependencies)
        if (!await healthCheck(config, dependencies)) failureCode = 'HEALTH_CHECK_FAILED'
      } catch {
        failureCode = 'ACTIVATION_FAILED'
      }
      if (failureCode) {
        try {
          switchCurrent(config, previousSha)
          rolledBack = true
          restart(config, dependencies)
          rollbackHealthy = await healthCheck(config, dependencies)
        } catch {
          rollbackHealthy = false
        }
      }
    }
  } catch (error) {
    failureCode ||= error.controllerFailureCode
      || (error.message === 'GitHub main changed while preparing release'
        ? 'MAIN_CHANGED'
        : 'PREPARATION_FAILED')
  }

  const receipt = terminalReceipt({
    targetSha,
    previousSha,
    staged,
    noOp,
    rolledBack,
    rollbackHealthy,
    failureCode,
    startedAt,
  })
  const receiptPath = writeReceipt(config, receipt)
  return { receipt, receiptPath }
}

function legacyProductionSha(config, dependencies) {
  return assertSha(String(dependencies.runSource(
    '/usr/bin/git',
    ['-C', config.source, 'rev-parse', 'HEAD'],
  )).trim(), 'production SHA')
}

function preflight(config, dependencies) {
  const layoutEntries = ['current', 'releases', 'shared', 'deployments']
    .map((relative) => pathEntryExists(path.join(config.root, relative)))
  const releaseLayout = layoutEntries.every(Boolean)
  if (!releaseLayout && layoutEntries.some(Boolean)) {
    throw new Error('Deployment release layout is partial')
  }
  if (releaseLayout) assertLayout(config, dependencies)
  const productionSha = releaseLayout
    ? currentReleaseSha(config)
    : legacyProductionSha(config, dependencies)
  return {
    schemaVersion: 'eqb-deployment-preflight-v2',
    controllerVersion: EQB_DEPLOY_CONTROLLER_VERSION,
    productionSha,
    eqb: String(dependencies.runSystem(
      '/usr/bin/systemctl',
      ['is-active', config.service],
    )).trim(),
    caddy: String(dependencies.runSystem(
      '/usr/bin/systemctl',
      ['is-active', config.caddyService],
    )).trim(),
    layout: releaseLayout ? 'release' : 'legacy',
  }
}

export function parseControllerCommand(originalCommand) {
  if (originalCommand === 'preflight') return { command: 'preflight', sha: null }
  const match = /^deploy ([a-f0-9]{40})$/u.exec(originalCommand || '')
  if (!match) throw new Error('Deployment controller command is not allowed')
  return { command: 'deploy', sha: match[1] }
}

export async function runController({
  originalCommand,
  config = PRODUCTION_CONFIG,
  dependencies,
} = {}) {
  const parsed = parseControllerCommand(originalCommand)
  const runtimeDependencies = dependencies || productionDependencies(config)
  if (parsed.command === 'preflight') {
    return { output: preflight(config, runtimeDependencies), exitCode: 0 }
  }
  const result = await deploy(config, runtimeDependencies, parsed.sha)
  return {
    output: { ...result.receipt, receiptPath: result.receiptPath },
    exitCode: result.receipt.conclusion === 'success' ? 0 : 1,
  }
}

function assertInstalledController() {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
    throw new Error('Deployment controller must run as root')
  }
  const installedPath = fileURLToPath(import.meta.url)
  const installed = statSync(installedPath)
  if (installed.uid !== 0 || (installed.mode & 0o022) !== 0) {
    throw new Error('Deployment controller must be root-owned and not group/world writable')
  }
}

const isEntrypoint = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntrypoint) {
  try {
    assertInstalledController()
    const result = await runController({ originalCommand: process.env.SSH_ORIGINAL_COMMAND })
    process.stdout.write(`${JSON.stringify(result.output)}\n`)
    process.exitCode = result.exitCode
  } catch (error) {
    process.stderr.write(`EQB deployment controller failed closed: ${error.message}\n`)
    process.exitCode = 1
  }
}
