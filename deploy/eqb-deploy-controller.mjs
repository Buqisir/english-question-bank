#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  chownSync,
  closeSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
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
export const EQB_REVIEWED_PERSISTENCE_RECEIPT_SCHEMA_VERSION =
  'eqb-reviewed-persistence-receipt-v1'
export const EQB_HOST_CONFIGURATION_RECEIPT_SCHEMA_VERSION =
  'eqb-host-configuration-receipt-v1'

const SHA = /^[a-f0-9]{40}$/u
const DIGEST = /^[a-f0-9]{64}$/u
const RELEASE_MARKER = '.eqb-release.json'
const COMMAND_TIMEOUT_MS = 20 * 60 * 1000
const HEALTH_ATTEMPTS = 30
const HEALTH_INTERVAL_MS = 1000
const HEALTH_TIMEOUT_MS = 60_000
export const HOST_CONFIGURATION_PATHS = Object.freeze([
  'deploy/Caddyfile.release',
  'deploy/eqb-release.service',
  'deploy/eqb-deploy-controller.mjs',
])
export const STABLE_LAUNCHER_PATHS = Object.freeze([
  'deploy/eqb-deploy-transport',
  'deploy/eqb-deploy-controller',
])
export const PERSISTENCE_AUTHORITY_PATHS = Object.freeze([
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
  controllerGid: 0,
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
  systemdUnitPath: '/etc/systemd/system/eqb.service',
  caddyConfigPath: '/etc/caddy/Caddyfile',
  rootWrapperPath: '/usr/local/libexec/eqb-deploy-controller-v1',
  transportWrapperPath: '/usr/local/libexec/eqb-deploy-transport-v1',
})

export function formatControllerOutput(output) {
  const marker = new Map([
    [EQB_DEPLOY_RECEIPT_SCHEMA_VERSION, 'EQB_DEPLOY_RECEIPT '],
    [EQB_REVIEWED_PERSISTENCE_RECEIPT_SCHEMA_VERSION, 'EQB_REVIEWED_PERSISTENCE_RECEIPT '],
    [EQB_HOST_CONFIGURATION_RECEIPT_SCHEMA_VERSION, 'EQB_HOST_CONFIGURATION_RECEIPT '],
  ]).get(output?.schemaVersion) || ''
  return `${marker}${JSON.stringify(output)}\n`
}

function assertSha(value, label = 'deployment SHA') {
  if (!SHA.test(value || '')) throw new Error(`Invalid ${label}`)
  return value
}

function assertAbsolute(directory, label) {
  if (!path.isAbsolute(directory || '')) throw new Error(`${label} must be absolute`)
  return path.resolve(directory)
}

function syncDirectory(directory) {
  const descriptor = openSync(
    directory,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
  )
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function ensureDirectory(directory, mode) {
  const existed = pathEntryExists(directory)
  mkdirSync(directory, { recursive: true, mode })
  chmodSync(directory, mode)
  syncDirectory(directory)
  if (!existed) syncDirectory(path.dirname(directory))
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
  let descriptor = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(descriptor, value, 'utf8')
    fchmodSync(descriptor, 0o600)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null
    renameSync(temporary, filePath)
    syncDirectory(path.dirname(filePath))
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    rmSync(temporary, { force: true })
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function changedPathDigest(paths) {
  return sha256(`${paths.join('\n')}\n`)
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
    syncDirectory(config.root)
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

function assertLayout(config, dependencies, { requireHostConfiguration = true } = {}) {
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
  if (requireHostConfiguration) readHostConfigurationMarker(config)
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
  )).trim().split('\n').filter(Boolean).sort()
}

function hostConfigurationRoot(config) {
  return path.join(config.root, 'deployments', 'host-configuration')
}

function readHostConfigurationVersion(config, directory, sha, { requireInstalled = false } = {}) {
  const markerPath = path.join(directory, '.eqb-host-configuration.json')
  const markerState = lstatSync(markerPath)
  if (
    !markerState.isFile()
    || markerState.uid !== config.controllerUid
    || (markerState.mode & 0o022) !== 0
    || markerState.nlink !== 1
  ) throw new Error('Active host configuration marker is unsafe')
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
  if (
    marker?.schemaVersion !== 'eqb-host-configuration-v1'
    || marker.sha !== sha
    || !marker.files
    || Object.keys(marker.files).sort().join('\n') !== [...HOST_CONFIGURATION_PATHS].sort().join('\n')
    || !Object.values(marker.files).every((digest) => DIGEST.test(digest || ''))
    || !marker.stableLaunchers
    || Object.keys(marker.stableLaunchers).sort().join('\n')
      !== [...STABLE_LAUNCHER_PATHS].sort().join('\n')
    || !Object.values(marker.stableLaunchers).every((digest) => DIGEST.test(digest || ''))
  ) throw new Error('Active host configuration marker is invalid')
  for (const relativePath of HOST_CONFIGURATION_PATHS) {
    const installed = path.join(directory, relativePath)
    const state = lstatSync(installed)
    if (
      !state.isFile()
      || state.isSymbolicLink()
      || state.uid !== config.controllerUid
      || (state.mode & 0o022) !== 0
      || state.nlink !== 1
      || sha256(readFileSync(installed)) !== marker.files[relativePath]
    ) throw new Error('Active host configuration files do not match their marker')
  }
  if (requireInstalled) {
    for (const [relativePath, installed] of [
      ['deploy/eqb-release.service', config.systemdUnitPath],
      ['deploy/Caddyfile.release', config.caddyConfigPath],
    ]) {
      const state = lstatSync(installed)
      if (
        !state.isFile()
        || state.isSymbolicLink()
        || state.uid !== config.controllerUid
        || (state.mode & 0o022) !== 0
        || state.nlink !== 1
        || sha256(readFileSync(installed)) !== marker.files[relativePath]
      ) throw new Error('Installed service configuration does not match its active marker')
    }
  }
  for (const [relativePath, installed] of [
    ['deploy/eqb-deploy-controller', config.rootWrapperPath],
    ['deploy/eqb-deploy-transport', config.transportWrapperPath],
  ]) {
    const state = lstatSync(installed)
    if (
      !state.isFile()
      || state.isSymbolicLink()
      || state.uid !== config.controllerUid
      || (state.mode & 0o022) !== 0
      || state.nlink !== 1
      || sha256(readFileSync(installed)) !== marker.stableLaunchers[relativePath]
    ) throw new Error('Stable deployment launcher does not match its installed marker')
  }
  return { directory, marker }
}

function readHostConfigurationMarker(config, { optional = false } = {}) {
  const current = path.join(hostConfigurationRoot(config), 'current')
  try {
    const currentState = lstatSync(current)
    if (!currentState.isSymbolicLink() || currentState.uid !== config.controllerUid) {
      throw new Error('Active host configuration pointer is unsafe')
    }
    const root = path.join(hostConfigurationRoot(config), 'versions')
    const target = path.resolve(path.dirname(current), readlinkSync(current))
    const relative = path.relative(root, target)
    if (!SHA.test(relative) || relative.includes(path.sep)) {
      throw new Error('Active host configuration pointer is invalid')
    }
    return readHostConfigurationVersion(config, target, relative, { requireInstalled: true })
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null
    throw error
  }
}

function assertOrdinaryReleaseBoundary(config, dependencies, previousSha, targetSha) {
  const stableLauncherChanges = changedProtectedPaths(
    config,
    dependencies,
    previousSha,
    targetSha,
    STABLE_LAUNCHER_PATHS,
  )
  if (
    stableLauncherChanges.length > 0
    && readHostConfigurationMarker(config, { optional: true })?.marker.sha !== targetSha
  ) {
    throw controllerFailure(
      'STABLE_LAUNCHER_UPDATE_REQUIRES_ROOT',
      'Target changes the root-installed stable deployment launchers',
    )
  }
  const hostConfigurationChanges = changedProtectedPaths(
    config,
    dependencies,
    previousSha,
    targetSha,
    HOST_CONFIGURATION_PATHS,
  )
  if (
    hostConfigurationChanges.length > 0
    && readHostConfigurationMarker(config, { optional: true })?.marker.sha !== targetSha
  ) {
    throw controllerFailure(
      'HOST_CONFIGURATION_UPDATE_REQUIRED',
      'Target host configuration has not passed the separately authorized update',
    )
  }
  if (changedProtectedPaths(
    config,
    dependencies,
    previousSha,
    targetSha,
    PERSISTENCE_AUTHORITY_PATHS,
  ).length > 0) {
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

function generatedDistManifest(dist, verifyModes) {
  const entries = []
  function walk(absolute, relative = '.') {
    const state = lstatSync(absolute)
    if (state.isSymbolicLink() || (!state.isDirectory() && !state.isFile())) {
      throw new Error('Prepared release dist contains a special node')
    }
    if (state.isFile() && state.nlink !== 1) {
      throw new Error('Prepared release dist contains a linked file')
    }
    const type = state.isDirectory() ? 'directory' : 'file'
    const expectedMode = type === 'directory' ? 0o755 : 0o644
    if (verifyModes && (state.mode & 0o7777) !== expectedMode) {
      throw new Error('Prepared release dist mode is invalid')
    }
    entries.push({
      relative,
      type,
      uid: state.uid,
      gid: state.gid,
      dev: state.dev,
      ino: state.ino,
      nlink: state.nlink,
      size: state.size,
      digest: state.isFile()
        ? createHash('sha256').update(readFileSync(absolute)).digest('hex')
        : null,
    })
    if (state.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) {
        walk(path.join(absolute, name), relative === '.' ? name : `${relative}/${name}`)
      }
    }
  }
  walk(dist)
  if (!entries.some((entry) => entry.relative === 'index.html' && entry.type === 'file')) {
    throw new Error('Prepared release is missing the built app')
  }
  return entries
}

function normalizeGeneratedDist(dist) {
  const before = generatedDistManifest(dist, false)
  for (const entry of before) {
    const absolute = entry.relative === '.' ? dist : path.join(dist, entry.relative)
    const expectedMode = entry.type === 'directory' ? 0o755 : 0o644
    const flags = fsConstants.O_RDONLY
      | fsConstants.O_NOFOLLOW
      | fsConstants.O_NONBLOCK
      | (entry.type === 'directory' ? fsConstants.O_DIRECTORY : 0)
    const descriptor = openSync(absolute, flags)
    try {
      const current = fstatSync(descriptor)
      const currentType = current.isDirectory() ? 'directory' : current.isFile() ? 'file' : 'other'
      if (
        currentType !== entry.type
        || current.uid !== entry.uid
        || current.gid !== entry.gid
        || current.dev !== entry.dev
        || current.ino !== entry.ino
        || current.nlink !== entry.nlink
        || current.size !== entry.size
      ) throw new Error('Prepared release dist changed during normalization')
      fchmodSync(descriptor, expectedMode)
    } finally {
      closeSync(descriptor)
    }
  }
  const after = generatedDistManifest(dist, true)
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error('Prepared release dist content changed during normalization')
  }
  return after.map(({ relative, type, size, digest }) => ({ relative, type, size, digest }))
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
    'eqb-deploy-transport',
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
    const builtDist = normalizeGeneratedDist(path.join(staging, 'app', 'dist'))
    restoreTrustedDeployTree(dependencies, staging, archive)
    sealRelease(config, dependencies, staging, sha)
    const sealedDist = normalizeGeneratedDist(path.join(staging, 'app', 'dist'))
    if (JSON.stringify(builtDist) !== JSON.stringify(sealedDist)) {
      throw new Error('Prepared release dist content changed while sealing')
    }
    renameSync(staging, finalDirectory)
    syncDirectory(path.dirname(finalDirectory))
    readReleaseMarker(config, sha)
    return { release: finalDirectory, staged: true }
  } finally {
    rmSync(archiveDirectory, { recursive: true, force: true })
    rmSync(staging, { recursive: true, force: true })
  }
}

function databasePaths(config) {
  return [
    'question-bank.sqlite',
    'user-data.sqlite',
    'import-ops.sqlite',
  ].map((name) => ({ name, filePath: path.join(config.root, 'shared', 'data', name) }))
}

function assertRegularPrivateDatabase(filePath) {
  const state = lstatSync(filePath)
  if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1) {
    throw new Error('Production database path is unsafe')
  }
  return state
}

function verifySqliteDatabase(dependencies, filePath) {
  if (typeof dependencies.verifyDatabase === 'function') {
    return dependencies.verifyDatabase(filePath)
  }
  const script = `
    import { DatabaseSync } from 'node:sqlite'
    const db = new DatabaseSync(process.argv[1], { readOnly: true })
    try {
      const integrity = db.prepare('PRAGMA integrity_check').all()
      const foreignKeys = db.prepare('PRAGMA foreign_key_check').all()
      if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok' || foreignKeys.length !== 0) process.exit(1)
    } finally { db.close() }
  `
  dependencies.runSystem('/usr/bin/node', [
    '--no-warnings', '--input-type=module', '-e', script, filePath,
  ], { timeout: COMMAND_TIMEOUT_MS, stdio: 'ignore' })
  return true
}

function snapshotDatabases(config, dependencies, directory) {
  ensureDirectory(directory, 0o700)
  const snapshots = {}
  for (const { name, filePath } of databasePaths(config)) {
    const before = assertRegularPrivateDatabase(filePath)
    const snapshot = path.join(directory, name)
    if (typeof dependencies.snapshotDatabase === 'function') {
      dependencies.snapshotDatabase(filePath, snapshot)
    } else {
      dependencies.runSystem('/usr/bin/sqlite3', [filePath, `.backup '${snapshot}'`], {
        timeout: COMMAND_TIMEOUT_MS,
        stdio: 'ignore',
      })
    }
    const after = assertRegularPrivateDatabase(filePath)
    if (before.dev !== after.dev || before.ino !== after.ino) {
      throw new Error(`Production database changed during snapshot: ${name}`)
    }
    chmodSync(snapshot, 0o600)
    chownSync(snapshot, config.controllerUid, config.controllerGid)
    const snapshotState = assertRegularPrivateDatabase(snapshot)
    verifySqliteDatabase(dependencies, snapshot)
    const descriptor = openSync(
      snapshot,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    )
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    snapshots[name] = {
      digest: sha256(readFileSync(snapshot)),
      gid: before.gid,
      mode: before.mode & 0o7777,
      path: snapshot,
      size: snapshotState.size,
      uid: before.uid,
    }
  }
  syncDirectory(directory)
  return snapshots
}

function restoreDatabaseSnapshots(config, dependencies, snapshots) {
  for (const { name, filePath } of databasePaths(config)) {
    const snapshot = snapshots[name]
    const snapshotState = snapshot ? assertRegularPrivateDatabase(snapshot.path) : null
    if (
      !snapshot
      || snapshotState.uid !== config.controllerUid
      || (snapshotState.mode & 0o7777) !== 0o600
      || snapshotState.size !== snapshot.size
      || sha256(readFileSync(snapshot.path)) !== snapshot.digest
    ) {
      throw new Error(`Database snapshot is unavailable or changed: ${name}`)
    }
    verifySqliteDatabase(dependencies, snapshot.path)
    const temporary = `${filePath}.restore-${process.pid}-${randomUUID()}`
    try {
      copyFileSync(snapshot.path, temporary, fsConstants.COPYFILE_EXCL)
      chmodSync(temporary, snapshot.mode)
      chownSync(temporary, snapshot.uid, snapshot.gid)
      const descriptor = openSync(temporary, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
      try {
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
      renameSync(temporary, filePath)
      syncDirectory(path.dirname(filePath))
      verifySqliteDatabase(dependencies, filePath)
    } finally {
      rmSync(temporary, { force: true })
    }
  }
}

function runImportOpsPersistenceEnsures(config, dependencies, sha) {
  const release = readReleaseMarker(config, sha).directory
  const script = `
    import path from 'node:path'
    import { createImportReviewStore } from './server/import-review/importReviewStore.mjs'
    import { createSourceIntakeStore } from './server/source-intake/sourceIntakeStore.mjs'
    const root = process.cwd()
    const dbPath = path.join(root, 'data/import-ops.sqlite')
    const filesRoot = path.join(root, 'data/import-ops/files')
    const configured = [
      [process.env.QUESTION_BANK_DB, path.join(root, 'data/question-bank.sqlite')],
      [process.env.USER_DATA_DB, path.join(root, 'data/user-data.sqlite')],
      [process.env.QUESTION_BANK_IMPORT_OPS_DB, dbPath],
    ]
    if (configured.some(([value, fallback]) => path.resolve(value || fallback) !== fallback)) {
      throw new Error('Production database override is outside the reviewed shared-data contract')
    }
    createImportReviewStore({ dbPath, filesRoot, rendererBuildId: 'deployment-maintenance' })
    createSourceIntakeStore({ dbPath, filesRoot })
  `
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (typeof dependencies.runRuntime === 'function') {
      dependencies.runRuntime('/usr/bin/node', [
        '--env-file-if-exists=/opt/eqb/shared/.env',
        '--input-type=module', '-e', script,
      ], { cwd: release, timeout: COMMAND_TIMEOUT_MS, stdio: 'ignore' })
    } else {
      dependencies.runSystem('/usr/sbin/runuser', [
        '-u', config.runtimeUser, '--',
        '/usr/bin/env', '-i',
        'HOME=/opt/eqb/shared',
        'PATH=/usr/local/bin:/usr/bin:/bin',
        '/usr/bin/node',
        '--env-file-if-exists=/opt/eqb/shared/.env',
        '--input-type=module', '-e', script,
      ], { cwd: release, timeout: COMMAND_TIMEOUT_MS, stdio: 'ignore' })
    }
  }
}

function serviceAction(config, dependencies, action, service) {
  dependencies.runSystem('/usr/bin/systemctl', [action, service], {
    timeout: 30_000,
    stdio: 'ignore',
  })
}

async function localHealthCheck(config, dependencies) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  for (let attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1) {
    const healthy = commandHealthy(
      dependencies,
      '/usr/bin/systemctl',
      ['is-active', '--quiet', config.service],
    ) && commandHealthy(
      dependencies,
      '/usr/bin/curl',
      ['--fail', '--silent', '--show-error', '--max-time', '10', '--output', '/dev/null',
        'http://127.0.0.1:8787/api/health'],
    )
    if (healthy) return true
    if (attempt < HEALTH_ATTEMPTS && Date.now() < deadline) {
      await dependencies.sleep(Math.min(HEALTH_INTERVAL_MS, deadline - Date.now()))
    }
  }
  return false
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
      && curl(['--resolve', 'eqbank.cc:443:127.0.0.1', 'https://eqbank.cc/'])
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

function maintenanceStateRoot(config, kind) {
  return path.join(config.root, 'deployments', kind)
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function readPrivateMaintenanceState(config, statePath) {
  const metadata = lstatSync(statePath)
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || metadata.uid !== config.controllerUid
    || (metadata.mode & 0o7777) !== 0o600
    || metadata.nlink !== 1
  ) throw new Error('Maintenance transaction state is unsafe')
  return readJsonFile(statePath)
}

function writeMaintenanceState(statePath, state) {
  privateWrite(statePath, `${JSON.stringify(state, null, 2)}\n`)
}

function maintenanceReceiptPath(config, kind, targetSha) {
  const receipts = path.join(config.root, 'deployments', 'receipts')
  ensureDirectory(receipts, 0o700)
  return path.join(
    receipts,
    `${new Date().toISOString().replaceAll(/[^0-9]/gu, '')}-${kind}-${targetSha}-${randomUUID()}.json`,
  )
}

function writeMaintenanceReceipt(config, kind, receipt) {
  const receiptPath = maintenanceReceiptPath(config, kind, receipt.targetSha)
  privateWrite(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
  return receiptPath
}

function reviewedPersistenceReceipt({
  targetSha,
  previousSha,
  staged,
  changedPaths,
  changedPathsDigest,
  snapshots,
  trafficReopened,
  rolledBack,
  databasesRestored,
  rollbackHealthy,
  recovered,
  failureCode,
  startedAt,
}) {
  return {
    schemaVersion: EQB_REVIEWED_PERSISTENCE_RECEIPT_SCHEMA_VERSION,
    controllerVersion: EQB_DEPLOY_CONTROLLER_VERSION,
    state: 'reported',
    conclusion: failureCode ? 'failure' : 'success',
    targetSha,
    previousSha,
    staged,
    changedPersistencePaths: changedPaths,
    changedPersistencePathsDigest: changedPathsDigest,
    databaseSnapshots: Object.fromEntries(Object.entries(snapshots || {})
      .map(([name, snapshot]) => [name, snapshot.digest])),
    trafficReopened,
    rolledBack,
    databasesRestored,
    rollbackHealthy,
    recovered,
    failureCode,
    startedAt,
    finishedAt: new Date().toISOString(),
  }
}

async function recoverReviewedPersistence(config, dependencies, statePath, expected) {
  const state = readPrivateMaintenanceState(config, statePath)
  const snapshotNames = Object.keys(state.snapshots || {}).sort()
  const expectedSnapshotNames = databasePaths(config).map(({ name }) => name).sort()
  if (
    state?.schemaVersion !== 'eqb-reviewed-persistence-state-v1'
    || state.targetSha !== expected.targetSha
    || state.changedPathsDigest !== expected.changedPathsDigest
    || !SHA.test(state.previousSha || '')
    || !Array.isArray(state.changedPaths)
    || state.changedPaths.length === 0
    || changedPathDigest(state.changedPaths) !== state.changedPathsDigest
    || typeof state.staged !== 'boolean'
    || typeof state.trafficReopened !== 'boolean'
    || typeof state.startedAt !== 'string'
    || (snapshotNames.length !== 0
      && snapshotNames.join('\n') !== expectedSnapshotNames.join('\n'))
    || Object.entries(state.snapshots || {}).some(([name, snapshot]) => (
      !snapshot
      || !DIGEST.test(snapshot.digest || '')
      || !Number.isSafeInteger(snapshot.uid)
      || !Number.isSafeInteger(snapshot.gid)
      || !Number.isSafeInteger(snapshot.mode)
      || !Number.isSafeInteger(snapshot.size)
      || path.resolve(snapshot.path || '') !== path.join(path.dirname(snapshot.path || ''), name)
      || path.dirname(path.resolve(snapshot.path || '')).startsWith(
        `${path.resolve(path.dirname(statePath))}${path.sep}`,
      ) === false
    ))
  ) throw new Error('A different or invalid reviewed-persistence transaction is pending')

  let failureCode = 'INTERRUPTED_BEFORE_TRAFFIC'
  let rolledBack = false
  let databasesRestored = false
  let rollbackHealthy = null
  if (state.trafficReopened) {
    const targetHealthy = currentReleaseSha(config) === state.targetSha
      && await healthCheck(config, dependencies)
    failureCode = targetHealthy ? null : 'POST_TRAFFIC_MANUAL_RECOVERY_REQUIRED'
  } else {
    try {
      serviceAction(config, dependencies, 'stop', config.caddyService)
      serviceAction(config, dependencies, 'stop', config.service)
      if (Object.keys(state.snapshots || {}).length > 0) {
        restoreDatabaseSnapshots(config, dependencies, state.snapshots)
        databasesRestored = true
      }
      switchCurrent(config, state.previousSha)
      rolledBack = true
      serviceAction(config, dependencies, 'start', config.service)
      serviceAction(config, dependencies, 'start', config.caddyService)
      rollbackHealthy = await healthCheck(config, dependencies)
    } catch {
      rollbackHealthy = false
      failureCode = 'PRE_TRAFFIC_ROLLBACK_FAILED'
    }
  }
  const receipt = reviewedPersistenceReceipt({
    targetSha: state.targetSha,
    previousSha: state.previousSha,
    staged: state.staged,
    changedPaths: state.changedPaths,
    changedPathsDigest: state.changedPathsDigest,
    snapshots: state.snapshots,
    trafficReopened: state.trafficReopened,
    rolledBack,
    databasesRestored,
    rollbackHealthy,
    recovered: true,
    failureCode,
    startedAt: state.startedAt,
  })
  const receiptPath = writeMaintenanceReceipt(config, 'reviewed-persistence', receipt)
  if (failureCode === null || rollbackHealthy === true) {
    rmSync(statePath)
    syncDirectory(path.dirname(statePath))
  }
  return { receipt, receiptPath }
}

async function deployReviewedPersistence(
  config,
  dependencies,
  targetSha,
  expectedChangedPathsDigest,
) {
  const startedAt = new Date().toISOString()
  assertLayout(config, dependencies)
  const stateRoot = maintenanceStateRoot(config, 'reviewed-persistence')
  ensureDirectory(stateRoot, 0o700)
  const statePath = path.join(stateRoot, 'active.json')
  if (existsSync(statePath)) {
    return recoverReviewedPersistence(config, dependencies, statePath, {
      targetSha,
      changedPathsDigest: expectedChangedPathsDigest,
    })
  }

  let previousSha = null
  let staged = false
  let changedPaths = []
  let snapshots = {}
  let trafficReopened = false
  let rolledBack = false
  let databasesRestored = false
  let rollbackHealthy = null
  let failureCode = null
  let state = null
  try {
    previousSha = currentReleaseSha(config)
    const fetchedSha = fetchMain(config, dependencies)
    if (fetchedSha !== targetSha) throw new Error('Production source main does not match target SHA')
    const stableLauncherChanges = changedProtectedPaths(
      config, dependencies, previousSha, targetSha, STABLE_LAUNCHER_PATHS,
    )
    if (
      stableLauncherChanges.length > 0
      && readHostConfigurationMarker(config, { optional: true })?.marker.sha !== targetSha
    ) {
      throw controllerFailure(
        'STABLE_LAUNCHER_UPDATE_REQUIRES_ROOT',
        'Target changes the root-installed stable deployment launchers',
      )
    }
    const hostConfigurationChanges = changedProtectedPaths(
      config, dependencies, previousSha, targetSha, HOST_CONFIGURATION_PATHS,
    )
    if (
      hostConfigurationChanges.length > 0
      && readHostConfigurationMarker(config, { optional: true })?.marker.sha !== targetSha
    ) throw controllerFailure('HOST_CONFIGURATION_UPDATE_REQUIRED', 'Target host configuration is not installed')
    changedPaths = changedProtectedPaths(
      config, dependencies, previousSha, targetSha, PERSISTENCE_AUTHORITY_PATHS,
    )
    if (changedPaths.length === 0) {
      throw controllerFailure(
        'REVIEWED_PERSISTENCE_DIFF_REQUIRED',
        'Reviewed-persistence deploy requires a non-empty protected diff',
      )
    }
    if (changedPathDigest(changedPaths) !== expectedChangedPathsDigest) {
      throw controllerFailure('REVIEWED_PERSISTENCE_DIFF_MISMATCH', 'Protected diff is not the reviewed diff')
    }
    staged = prepareRelease(config, dependencies, targetSha).staged
    if (fetchMain(config, dependencies) !== targetSha) {
      throw controllerFailure('MAIN_CHANGED', 'GitHub main changed while preparing release')
    }
    state = {
      schemaVersion: 'eqb-reviewed-persistence-state-v1',
      targetSha,
      previousSha,
      changedPaths,
      changedPathsDigest: expectedChangedPathsDigest,
      staged,
      snapshots,
      trafficReopened,
      startedAt,
    }
    writeMaintenanceState(statePath, state)

    serviceAction(config, dependencies, 'stop', config.caddyService)
    serviceAction(config, dependencies, 'stop', config.service)
    snapshots = snapshotDatabases(config, dependencies, path.join(stateRoot, `snapshots-${randomUUID()}`))
    state = { ...state, snapshots }
    writeMaintenanceState(statePath, state)
    switchCurrent(config, targetSha)
    runImportOpsPersistenceEnsures(config, dependencies, targetSha)
    serviceAction(config, dependencies, 'start', config.service)
    if (!await localHealthCheck(config, dependencies)) {
      throw controllerFailure('LOCAL_MIGRATION_HEALTH_FAILED', 'Candidate failed local migration health')
    }
    for (const { filePath } of databasePaths(config)) verifySqliteDatabase(dependencies, filePath)

    serviceAction(config, dependencies, 'stop', config.service)
    serviceAction(config, dependencies, 'start', config.service)
    if (!await localHealthCheck(config, dependencies)) {
      throw controllerFailure('MIGRATION_IDEMPOTENCY_FAILED', 'Candidate failed second-start health')
    }
    for (const { filePath } of databasePaths(config)) verifySqliteDatabase(dependencies, filePath)

    trafficReopened = true
    state = { ...state, trafficReopened }
    writeMaintenanceState(statePath, state)
    serviceAction(config, dependencies, 'start', config.caddyService)
    if (!await healthCheck(config, dependencies)) {
      throw controllerFailure('POST_TRAFFIC_HEALTH_FAILED', 'Candidate failed after traffic reopened')
    }
  } catch (error) {
    failureCode = error.controllerFailureCode || 'REVIEWED_PERSISTENCE_FAILED'
    if (state && !trafficReopened) {
      try {
        serviceAction(config, dependencies, 'stop', config.caddyService)
        serviceAction(config, dependencies, 'stop', config.service)
        if (Object.keys(snapshots).length > 0) {
          restoreDatabaseSnapshots(config, dependencies, snapshots)
          databasesRestored = true
        }
        switchCurrent(config, previousSha)
        rolledBack = true
        serviceAction(config, dependencies, 'start', config.service)
        serviceAction(config, dependencies, 'start', config.caddyService)
        rollbackHealthy = await healthCheck(config, dependencies)
      } catch {
        failureCode = 'PRE_TRAFFIC_ROLLBACK_FAILED'
        rollbackHealthy = false
      }
    }
  }

  const receipt = reviewedPersistenceReceipt({
    targetSha,
    previousSha,
    staged,
    changedPaths,
    changedPathsDigest: expectedChangedPathsDigest,
    snapshots,
    trafficReopened,
    rolledBack,
    databasesRestored,
    rollbackHealthy,
    recovered: false,
    failureCode,
    startedAt,
  })
  const receiptPath = writeMaintenanceReceipt(config, 'reviewed-persistence', receipt)
  if (
    existsSync(statePath)
    && (failureCode === null || rollbackHealthy === true)
  ) {
    rmSync(statePath)
    syncDirectory(path.dirname(statePath))
  }
  return { receipt, receiptPath }
}

function switchHostConfiguration(config, sha) {
  const prepared = path.join(hostConfigurationRoot(config), 'versions', assertSha(sha))
  if (!lstatSync(prepared).isDirectory()) throw new Error('Prepared host configuration is missing')
  const current = path.join(hostConfigurationRoot(config), 'current')
  const temporary = path.join(hostConfigurationRoot(config), `.current-${randomUUID()}`)
  symlinkSync(path.join('versions', sha), temporary)
  try {
    renameSync(temporary, current)
    syncDirectory(hostConfigurationRoot(config))
  } finally {
    rmSync(temporary, { force: true })
  }
  readHostConfigurationMarker(config)
}

function validateHostConfiguration(config, dependencies, directory) {
  if (
    readdirSync(directory).join('\n') !== 'deploy'
    || readdirSync(path.join(directory, 'deploy')).sort().join('\n')
      !== HOST_CONFIGURATION_PATHS.map((relative) => path.basename(relative)).sort().join('\n')
  ) throw new Error('Candidate host configuration file set is not exact')
  const paths = Object.fromEntries(HOST_CONFIGURATION_PATHS.map((relative) => [
    relative,
    path.join(directory, relative),
  ]))
  for (const filePath of Object.values(paths)) {
    const state = lstatSync(filePath)
    if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1) {
      throw new Error('Candidate host configuration contains an unsafe file')
    }
  }
  dependencies.runSystem('/usr/bin/node', ['--check', paths['deploy/eqb-deploy-controller.mjs']], {
    timeout: COMMAND_TIMEOUT_MS,
    stdio: 'ignore',
  })
  dependencies.runSystem('/usr/bin/systemd-analyze', [
    'verify', paths['deploy/eqb-release.service'],
  ], { timeout: COMMAND_TIMEOUT_MS, stdio: 'ignore' })
  dependencies.runSystem('/usr/bin/caddy', [
    'validate', '--config', paths['deploy/Caddyfile.release'],
  ], { timeout: COMMAND_TIMEOUT_MS, stdio: 'ignore' })
  return paths
}

function prepareHostConfiguration(config, dependencies, sha) {
  const root = hostConfigurationRoot(config)
  const versions = path.join(root, 'versions')
  ensureDirectory(root, 0o700)
  ensureDirectory(versions, 0o700)
  const finalDirectory = path.join(versions, sha)
  if (existsSync(finalDirectory)) {
    return { ...readHostConfigurationVersion(config, finalDirectory, sha), staged: false }
  }
  const staging = mkdtempSync(path.join(versions, `.staging-${sha}-`))
  const archiveDirectory = mkdtempSync(path.join(config.root, 'deployments', '.host-config-archive-'))
  const archive = path.join(archiveDirectory, `${sha}.tar`)
  try {
    const descriptor = openSync(archive, 'wx', 0o600)
    try {
      dependencies.runSystem('/usr/bin/git', [
        '-c', `safe.directory=${config.source}`,
        '-C', config.source,
        'archive', '--format=tar', sha,
        ...HOST_CONFIGURATION_PATHS,
      ], { timeout: COMMAND_TIMEOUT_MS, stdio: ['ignore', descriptor, 'inherit'] })
    } finally {
      closeSync(descriptor)
    }
    dependencies.runSystem('/usr/bin/tar', ['-xf', archive, '-C', staging], {
      timeout: COMMAND_TIMEOUT_MS,
      stdio: 'ignore',
    })
    validateHostConfiguration(config, dependencies, staging)
    const files = Object.fromEntries(HOST_CONFIGURATION_PATHS.map((relative) => [
      relative,
      sha256(readFileSync(path.join(staging, relative))),
    ]))
    const stableLaunchers = readHostConfigurationMarker(config).marker.stableLaunchers
    const marker = path.join(staging, '.eqb-host-configuration.json')
    privateWrite(marker, `${JSON.stringify({
      schemaVersion: 'eqb-host-configuration-v1',
      sha,
      files,
      stableLaunchers,
      preparedAt: new Date().toISOString(),
    }, null, 2)}\n`)
    dependencies.seal(staging)
    renameSync(staging, finalDirectory)
    syncDirectory(versions)
    return { directory: finalDirectory, staged: true }
  } finally {
    rmSync(archiveDirectory, { recursive: true, force: true })
    rmSync(staging, { recursive: true, force: true })
  }
}

function atomicInstall(source, destination, mode, config) {
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}-${randomUUID()}`)
  try {
    copyFileSync(source, temporary, fsConstants.COPYFILE_EXCL)
    chmodSync(temporary, mode)
    chownSync(temporary, config.controllerUid, config.controllerGid)
    const descriptor = openSync(temporary, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    renameSync(temporary, destination)
    syncDirectory(path.dirname(destination))
  } finally {
    rmSync(temporary, { force: true })
  }
}

function hostConfigurationReceipt({
  targetSha,
  previousSha,
  changedPaths,
  changedPathsDigest,
  staged,
  installed,
  noOp,
  rolledBack,
  rollbackHealthy,
  recovered,
  failureCode,
  startedAt,
}) {
  return {
    schemaVersion: EQB_HOST_CONFIGURATION_RECEIPT_SCHEMA_VERSION,
    controllerVersion: EQB_DEPLOY_CONTROLLER_VERSION,
    state: 'reported',
    conclusion: failureCode ? 'failure' : 'success',
    targetSha,
    previousHostConfigurationSha: previousSha,
    changedHostConfigurationPaths: changedPaths,
    changedHostConfigurationPathsDigest: changedPathsDigest,
    staged,
    installed,
    noOp,
    rolledBack,
    rollbackHealthy,
    recovered,
    failureCode,
    startedAt,
    finishedAt: new Date().toISOString(),
  }
}

function installHostConfigurationFiles(config, sourceDirectory) {
  atomicInstall(
    path.join(sourceDirectory, 'deploy/eqb-release.service'),
    config.systemdUnitPath,
    0o644,
    config,
  )
  atomicInstall(
    path.join(sourceDirectory, 'deploy/Caddyfile.release'),
    config.caddyConfigPath,
    0o644,
    config,
  )
}

function hostRecoveryControllerPath(statePath) {
  return path.join(path.dirname(statePath), 'recovery-controller.mjs')
}

function assertHostRecoveryController(config, statePath) {
  const recoveryController = hostRecoveryControllerPath(statePath)
  const metadata = lstatSync(recoveryController)
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || metadata.uid !== config.controllerUid
    || (metadata.mode & 0o7777) !== 0o600
    || metadata.nlink !== 1
  ) throw new Error('Host-configuration recovery controller is unsafe')
  return recoveryController
}

function clearHostConfigurationState(statePath) {
  rmSync(statePath)
  rmSync(hostRecoveryControllerPath(statePath), { force: true })
  syncDirectory(path.dirname(statePath))
}

async function recoverHostConfiguration(config, dependencies, statePath, expected) {
  const state = readPrivateMaintenanceState(config, statePath)
  assertHostRecoveryController(config, statePath)
  const stateRoot = path.dirname(statePath)
  const backupDirectory = path.resolve(state.backupDirectory || '')
  if (
    state?.schemaVersion !== 'eqb-host-configuration-state-v1'
    || state.targetSha !== expected.targetSha
    || state.changedPathsDigest !== expected.changedPathsDigest
    || !SHA.test(state.previousSha || '')
    || !Array.isArray(state.changedPaths)
    || state.changedPaths.length === 0
    || changedPathDigest(state.changedPaths) !== state.changedPathsDigest
    || typeof state.staged !== 'boolean'
    || typeof state.startedAt !== 'string'
    || path.dirname(backupDirectory) !== path.resolve(stateRoot)
    || !path.basename(backupDirectory).startsWith(`backup-${state.targetSha}-`)
  ) throw new Error('A different or invalid host-configuration transaction is pending')
  const backupState = lstatSync(backupDirectory)
  if (
    !backupState.isDirectory()
    || backupState.isSymbolicLink()
    || backupState.uid !== config.controllerUid
    || (backupState.mode & 0o7777) !== 0o700
  ) throw new Error('Host-configuration rollback evidence is unsafe')
  for (const relative of ['deploy/eqb-release.service', 'deploy/Caddyfile.release']) {
    const backupFile = lstatSync(path.join(backupDirectory, relative))
    if (
      !backupFile.isFile()
      || backupFile.isSymbolicLink()
      || backupFile.uid !== config.controllerUid
      || (backupFile.mode & 0o7777) !== 0o600
      || backupFile.nlink !== 1
    ) throw new Error('Host-configuration rollback file is unsafe')
  }
  let failureCode = 'INTERRUPTED_HOST_CONFIGURATION_UPDATE'
  let installed = false
  let rolledBack = false
  let rollbackHealthy = null
  let targetHealthy = false
  try {
    targetHealthy = readHostConfigurationMarker(config).marker.sha === state.targetSha
      && await healthCheck(config, dependencies)
  } catch {
    targetHealthy = false
  }
  if (targetHealthy) {
    failureCode = null
    installed = true
  } else {
    try {
      installHostConfigurationFiles(config, state.backupDirectory)
      switchHostConfiguration(config, state.previousSha)
      dependencies.runSystem('/usr/bin/systemctl', ['daemon-reload'], { stdio: 'ignore' })
      dependencies.runSystem('/usr/bin/caddy', ['reload', '--config', config.caddyConfigPath], {
        timeout: 30_000,
        stdio: 'ignore',
      })
      rolledBack = true
      rollbackHealthy = await healthCheck(config, dependencies)
    } catch {
      failureCode = 'HOST_CONFIGURATION_ROLLBACK_FAILED'
      rollbackHealthy = false
    }
  }
  const receipt = hostConfigurationReceipt({
    targetSha: state.targetSha,
    previousSha: state.previousSha,
    changedPaths: state.changedPaths,
    changedPathsDigest: state.changedPathsDigest,
    staged: state.staged,
    installed,
    noOp: false,
    rolledBack,
    rollbackHealthy,
    recovered: true,
    failureCode,
    startedAt: state.startedAt,
  })
  const receiptPath = writeMaintenanceReceipt(config, 'host-configuration', receipt)
  if (failureCode === null || rollbackHealthy === true) clearHostConfigurationState(statePath)
  return { receipt, receiptPath }
}

async function updateHostConfiguration(
  config,
  dependencies,
  targetSha,
  expectedChangedPathsDigest,
) {
  const startedAt = new Date().toISOString()
  const stateRoot = maintenanceStateRoot(config, 'host-configuration-update')
  ensureDirectory(stateRoot, 0o700)
  const statePath = path.join(stateRoot, 'active.json')
  const recoveryController = hostRecoveryControllerPath(statePath)
  if (!existsSync(statePath) && existsSync(recoveryController)) {
    assertHostRecoveryController(config, statePath)
    rmSync(recoveryController)
  }
  assertLayout(config, dependencies, { requireHostConfiguration: !existsSync(statePath) })
  if (existsSync(statePath)) {
    return recoverHostConfiguration(config, dependencies, statePath, {
      targetSha,
      changedPathsDigest: expectedChangedPathsDigest,
    })
  }
  const previous = readHostConfigurationMarker(config)
  if (previous.marker.sha === targetSha) {
    const receipt = hostConfigurationReceipt({
      targetSha,
      previousSha: targetSha,
      changedPaths: [],
      changedPathsDigest: expectedChangedPathsDigest,
      staged: false,
      installed: true,
      noOp: true,
      rolledBack: false,
      rollbackHealthy: null,
      recovered: false,
      failureCode: null,
      startedAt,
    })
    return {
      receipt,
      receiptPath: writeMaintenanceReceipt(config, 'host-configuration', receipt),
    }
  }

  let changedPaths = []
  let staged = false
  let installed = false
  let rolledBack = false
  let rollbackHealthy = null
  let failureCode = null
  let state = null
  let prepared = null
  try {
    const productionSha = currentReleaseSha(config)
    if (fetchMain(config, dependencies) !== targetSha) {
      throw new Error('Production source main does not match target SHA')
    }
    const stableLauncherChanges = changedProtectedPaths(
      config, dependencies, productionSha, targetSha, STABLE_LAUNCHER_PATHS,
    )
    if (stableLauncherChanges.length > 0) {
      throw controllerFailure(
        'STABLE_LAUNCHER_UPDATE_REQUIRES_ROOT',
        'Stable launcher changes require the one-time root installer',
      )
    }
    changedPaths = changedProtectedPaths(
      config, dependencies, productionSha, targetSha, HOST_CONFIGURATION_PATHS,
    )
    if (changedPaths.length === 0) {
      throw controllerFailure('HOST_CONFIGURATION_DIFF_REQUIRED', 'No host configuration change requires installation')
    }
    if (changedPathDigest(changedPaths) !== expectedChangedPathsDigest) {
      throw controllerFailure('HOST_CONFIGURATION_DIFF_MISMATCH', 'Host configuration diff is not the reviewed diff')
    }
    prepared = prepareHostConfiguration(config, dependencies, targetSha)
    staged = prepared.staged
    if (fetchMain(config, dependencies) !== targetSha) {
      throw controllerFailure('MAIN_CHANGED', 'GitHub main changed while preparing host configuration')
    }
    const backupDirectory = mkdtempSync(path.join(stateRoot, `backup-${targetSha}-`))
    chmodSync(backupDirectory, 0o700)
    mkdirSync(path.join(backupDirectory, 'deploy'), { recursive: true })
    chmodSync(path.join(backupDirectory, 'deploy'), 0o700)
    copyFileSync(config.systemdUnitPath, path.join(backupDirectory, 'deploy/eqb-release.service'))
    copyFileSync(config.caddyConfigPath, path.join(backupDirectory, 'deploy/Caddyfile.release'))
    chmodSync(path.join(backupDirectory, 'deploy/eqb-release.service'), 0o600)
    chmodSync(path.join(backupDirectory, 'deploy/Caddyfile.release'), 0o600)
    for (const backupFile of ['deploy/eqb-release.service', 'deploy/Caddyfile.release']) {
      const descriptor = openSync(
        path.join(backupDirectory, backupFile),
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
      )
      try {
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
    }
    syncDirectory(path.join(backupDirectory, 'deploy'))
    syncDirectory(backupDirectory)
    atomicInstall(
      path.join(previous.directory, 'deploy/eqb-deploy-controller.mjs'),
      recoveryController,
      0o600,
      config,
    )
    state = {
      schemaVersion: 'eqb-host-configuration-state-v1',
      targetSha,
      previousSha: previous.marker.sha,
      changedPaths,
      changedPathsDigest: expectedChangedPathsDigest,
      staged,
      backupDirectory,
      startedAt,
    }
    writeMaintenanceState(statePath, state)
    installHostConfigurationFiles(config, prepared.directory)
    switchHostConfiguration(config, targetSha)
    dependencies.runSystem('/usr/bin/systemctl', ['daemon-reload'], { stdio: 'ignore' })
    dependencies.runSystem('/usr/bin/caddy', ['reload', '--config', config.caddyConfigPath], {
      timeout: 30_000,
      stdio: 'ignore',
    })
    if (!await healthCheck(config, dependencies)) {
      throw controllerFailure('HOST_CONFIGURATION_HEALTH_FAILED', 'Host configuration failed health')
    }
    installed = true
  } catch (error) {
    failureCode = error.controllerFailureCode || 'HOST_CONFIGURATION_UPDATE_FAILED'
    if (state) {
      try {
        installHostConfigurationFiles(config, state.backupDirectory)
        switchHostConfiguration(config, state.previousSha)
        dependencies.runSystem('/usr/bin/systemctl', ['daemon-reload'], { stdio: 'ignore' })
        dependencies.runSystem('/usr/bin/caddy', ['reload', '--config', config.caddyConfigPath], {
          timeout: 30_000,
          stdio: 'ignore',
        })
        rolledBack = true
        rollbackHealthy = await healthCheck(config, dependencies)
      } catch {
        failureCode = 'HOST_CONFIGURATION_ROLLBACK_FAILED'
        rollbackHealthy = false
      }
    }
  }
  const receipt = hostConfigurationReceipt({
    targetSha,
    previousSha: previous.marker.sha,
    changedPaths,
    changedPathsDigest: expectedChangedPathsDigest,
    staged,
    installed,
    noOp: false,
    rolledBack,
    rollbackHealthy,
    recovered: false,
    failureCode,
    startedAt,
  })
  const receiptPath = writeMaintenanceReceipt(config, 'host-configuration', receipt)
  if (
    existsSync(statePath)
    && (failureCode === null || rollbackHealthy === true)
  ) clearHostConfigurationState(statePath)
  else if (!existsSync(statePath)) rmSync(recoveryController, { force: true })
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
  const deployMatch = /^deploy ([a-f0-9]{40})$/u.exec(originalCommand || '')
  if (deployMatch) return { command: 'deploy', sha: deployMatch[1], digest: null }
  const maintenanceMatch = /^(deploy-reviewed-persistence|update-host-config) ([a-f0-9]{40}) ([a-f0-9]{64})$/u
    .exec(originalCommand || '')
  if (maintenanceMatch) {
    return {
      command: maintenanceMatch[1],
      sha: maintenanceMatch[2],
      digest: maintenanceMatch[3],
    }
  }
  throw new Error('Deployment controller command is not allowed')
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
  const result = parsed.command === 'deploy'
    ? await deploy(config, runtimeDependencies, parsed.sha)
    : parsed.command === 'deploy-reviewed-persistence'
      ? await deployReviewedPersistence(config, runtimeDependencies, parsed.sha, parsed.digest)
      : await updateHostConfiguration(config, runtimeDependencies, parsed.sha, parsed.digest)
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
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (isEntrypoint) {
  try {
    assertInstalledController()
    const result = await runController({ originalCommand: process.env.SSH_ORIGINAL_COMMAND })
    process.stdout.write(formatControllerOutput(result.output))
    process.exitCode = result.exitCode
  } catch (error) {
    process.stderr.write(`EQB deployment controller failed closed: ${error.message}\n`)
    process.exitCode = 1
  }
}
