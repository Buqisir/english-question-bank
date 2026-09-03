#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const LEGACY_BASELINE_RECEIPT_SCHEMA_VERSION = 'eqb-legacy-baseline-receipt-v1'

const SHA = /^[a-f0-9]{40}$/u
const DIGEST = /^[a-f0-9]{64}$/u
const USER = /^[a-z_][a-z0-9_-]*$/u
const RECEIPT_KEYS = [
  'backupsVerified',
  'bootstrapRun',
  'caddy',
  'conclusion',
  'distVerified',
  'eqb',
  'failureCode',
  'finishedAt',
  'identityInstalled',
  'layout',
  'migrationVerified',
  'previousSha',
  'productionSha',
  'quarantinePreserved',
  'rollbackHealthy',
  'rolledBack',
  'schemaVersion',
  'startedAt',
  'state',
  'targetSha',
]

function pathEntryExists(filePath) {
  try {
    fs.lstatSync(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function realNode(filePath, type, uid, mode, { gid = uid, nlink = null } = {}) {
  try {
    const metadata = fs.lstatSync(filePath)
    return !metadata.isSymbolicLink()
      && (type === 'directory' ? metadata.isDirectory() : metadata.isFile())
      && metadata.uid === uid
      && metadata.gid === gid
      && (metadata.mode & 0o7777) === mode
      && (nlink === null || metadata.nlink === nlink)
  } catch {
    return false
  }
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') return false
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

function classifyReceipt(receipt, expectedHead) {
  if (
    !receipt
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || Object.keys(receipt).sort().join('\n') !== RECEIPT_KEYS.join('\n')
    || receipt.schemaVersion !== LEGACY_BASELINE_RECEIPT_SCHEMA_VERSION
    || receipt.state !== 'reported'
    || !['success', 'failure'].includes(receipt.conclusion)
    || !SHA.test(receipt.targetSha || '')
    || !SHA.test(receipt.previousSha || '')
    || !SHA.test(receipt.productionSha || '')
    || !['active', 'inactive'].includes(receipt.eqb)
    || !['active', 'inactive'].includes(receipt.caddy)
    || receipt.layout !== 'legacy'
    || [
      'identityInstalled',
      'quarantinePreserved',
      'backupsVerified',
      'migrationVerified',
      'distVerified',
      'rolledBack',
      'bootstrapRun',
    ].some((key) => typeof receipt[key] !== 'boolean')
    || ![null, true, false].includes(receipt.rollbackHealthy)
    || !isIsoTimestamp(receipt.startedAt)
    || !isIsoTimestamp(receipt.finishedAt)
  ) return null

  if (receipt.conclusion === 'success') {
    return receipt.targetSha === expectedHead
      && receipt.productionSha === expectedHead
      && receipt.previousSha !== expectedHead
      && receipt.eqb === 'active'
      && receipt.caddy === 'active'
      && receipt.identityInstalled
      && receipt.quarantinePreserved
      && receipt.backupsVerified
      && receipt.migrationVerified
      && receipt.distVerified
      && !receipt.rolledBack
      && receipt.rollbackHealthy === null
      && receipt.failureCode === null
      && !receipt.bootstrapRun
      ? 'success'
      : null
  }

  return typeof receipt.failureCode === 'string'
    && /^[a-z0-9-]+:[a-z0-9-]+$/u.test(receipt.failureCode)
    && typeof receipt.rollbackHealthy === 'boolean'
    && !receipt.bootstrapRun
    && (!receipt.rollbackHealthy || (
      receipt.rolledBack
      && receipt.productionSha === receipt.previousSha
      && receipt.eqb === 'active'
      && receipt.caddy === 'active'
      && !receipt.identityInstalled
      && !receipt.quarantinePreserved
    ))
    ? 'failure'
    : null
}

export function legacyReleaseChildProof(wrapper) {
  const names = fs.readdirSync(wrapper)
  if (names.length !== 1) throw new Error('legacy quarantine wrapper child count is invalid')
  const child = path.join(wrapper, names[0])
  const childState = fs.lstatSync(child)
  if (!childState.isDirectory() || childState.isSymbolicLink()) {
    throw new Error('legacy quarantine wrapper child is unsafe')
  }

  const files = []
  let special = 0
  function walk(absolute, relative = '') {
    const metadata = fs.lstatSync(absolute)
    if (
      metadata.isSymbolicLink()
      || metadata.isSocket()
      || metadata.isBlockDevice()
      || metadata.isCharacterDevice()
      || metadata.isFIFO()
    ) {
      special += 1
      return
    }
    if (metadata.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) {
        walk(path.join(absolute, name), relative ? `${relative}/${name}` : name)
      }
      return
    }
    if (!metadata.isFile()) return

    const isDatabase = /\.(sqlite|sqlite3|db)(-(wal|shm))?$/iu.test(relative)
    const isManifest = [
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
    ].includes(path.basename(relative))
    const isServer = relative.startsWith('server/') && !isDatabase && !isManifest
    if (!isDatabase && !isManifest && !isServer) {
      files.push({
        relative,
        size: metadata.size,
        digest: hash(fs.readFileSync(absolute)),
      })
    }
  }
  walk(child)
  return {
    child,
    digest: hash(Buffer.from(files
      .toSorted((left, right) => left.relative.localeCompare(right.relative))
      .map((file) => `${file.relative}\0${file.size}\0${file.digest}\n`)
      .join(''))),
    fileCount: files.length,
    special,
  }
}

export function controllerSudoAllowed(output) {
  const controller = '/usr/local/libexec/eqb-deploy-controller-v1'
  const nextTag = /\b(?:PASSWD|EXEC|NOEXEC|SETENV|NOSETENV|LOG_INPUT|NOLOG_INPUT|LOG_OUTPUT|NOLOG_OUTPUT|MAIL|NOMAIL|FOLLOW|NOFOLLOW):/u
  const nextRule = /\n[\t ]*\(/u
  const commands = String(output || '').split('NOPASSWD:').slice(1)
    .flatMap((segment) => segment.split(nextRule, 1)[0].split(nextTag, 1)[0]
      .split(',')
      .map((command) => command.replaceAll(/\s+/gu, ' ').trim())
      .filter(Boolean))
  return commands.includes('ALL')
    || commands.includes(controller)
    || (
      commands.includes(`${controller} -- preflight`)
      && ['deploy', 'deploy-reviewed-persistence', 'update-host-config'].every((command) => (
        commands.includes(`${controller} -- ${command} *`)
        || commands.includes(`${controller} -- ${command} [a-f0-9]*`)
      ))
    )
}

export function inspectLegacyBaselineState({
  repo,
  backupRoot,
  home,
  expectedHead,
  expectedChildDigest,
  expectedChildFileCount,
  rootUid,
  sourceUid,
  sourceGid,
} = {}) {
  if (
    ![repo, backupRoot, home].every((value) => path.isAbsolute(value || ''))
    || !SHA.test(expectedHead || '')
    || !DIGEST.test(expectedChildDigest || '')
    || !Number.isSafeInteger(expectedChildFileCount)
    || expectedChildFileCount < 1
    || ![rootUid, sourceUid, sourceGid].every(Number.isSafeInteger)
  ) throw new Error('legacy baseline inspector inputs are invalid')

  const layoutPaths = ['current', 'releases', 'shared', 'deployments']
    .map((relative) => path.join(path.dirname(repo), relative))
  const liveEntries = layoutPaths.filter(pathEntryExists).length
  const liveReleaseLayout = liveEntries === 0
    ? 'absent'
    : liveEntries === layoutPaths.length ? 'present' : 'partial'

  const sshDirectory = path.join(home, '.ssh')
  const defaultKey = path.join(sshDirectory, 'id_ed25519')
  const rsaKey = path.join(sshDirectory, 'id_rsa')
  let defaultIdentity = 'invalid'
  if (!pathEntryExists(defaultKey) && !pathEntryExists(rsaKey)) {
    defaultIdentity = 'missing'
  } else if (
    realNode(sshDirectory, 'directory', sourceUid, 0o700, { gid: sourceGid })
    && realNode(defaultKey, 'file', sourceUid, 0o600, { gid: sourceGid, nlink: 1 })
    && !pathEntryExists(rsaKey)
  ) {
    defaultIdentity = 'ok'
  }

  let evidenceInvalid = !realNode(backupRoot, 'directory', rootUid, 0o700)
  const successes = []
  let baselineFailedReceipts = 0
  if (!evidenceInvalid) {
    for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })
      .filter(({ name }) => name.startsWith('baseline-'))) {
      const directory = path.join(backupRoot, entry.name)
      if (
        !entry.isDirectory()
        || entry.isSymbolicLink()
        || !realNode(directory, 'directory', rootUid, 0o700)
      ) {
        evidenceInvalid = true
        continue
      }
      const receiptPath = path.join(directory, 'receipt.json')
      if (!realNode(receiptPath, 'file', rootUid, 0o600, { nlink: 1 })) {
        evidenceInvalid = true
        continue
      }
      try {
        const receiptState = fs.lstatSync(receiptPath)
        if (receiptState.size < 1 || receiptState.size > 64 * 1024) throw new Error('size')
        const classification = classifyReceipt(
          JSON.parse(fs.readFileSync(receiptPath, 'utf8')),
          expectedHead,
        )
        if (classification === 'success') successes.push(directory)
        else if (classification === 'failure') baselineFailedReceipts += 1
        else evidenceInvalid = true
      } catch {
        evidenceInvalid = true
      }
    }
  }

  let quarantineChildren = 0
  let quarantineValid = false
  if (successes.length === 1) {
    try {
      const quarantine = path.join(successes[0], 'quarantine')
      const wrapper = path.join(quarantine, 'releases')
      if (
        !realNode(quarantine, 'directory', rootUid, 0o700)
        || !realNode(wrapper, 'directory', rootUid, 0o755)
        || fs.readdirSync(quarantine).join('\n') !== 'releases'
      ) throw new Error('metadata')
      quarantineChildren = fs.readdirSync(wrapper).length
      const proof = legacyReleaseChildProof(wrapper)
      quarantineValid = quarantineChildren === 1
        && proof.fileCount === expectedChildFileCount
        && proof.digest === expectedChildDigest
        && proof.special === 0
    } catch {
      quarantineValid = false
    }
  }

  const baselineState = !evidenceInvalid
    && successes.length === 1
    && quarantineValid
    && liveReleaseLayout === 'absent'
    && defaultIdentity === 'ok'
    ? 'established'
    : !evidenceInvalid && successes.length === 0 ? 'absent' : 'invalid'

  return {
    baselineState,
    baselineReceipts: successes.length,
    baselineFailedReceipts,
    quarantineChildren,
    liveReleaseLayout,
    defaultIdentity,
  }
}

function requiredInteger(value, label) {
  if (!/^\d+$/u.test(value || '')) throw new Error(`invalid ${label}`)
  return Number(value)
}

function main() {
  const [
    repo,
    backupRoot,
    home,
    expectedHead,
    expectedChildDigest,
    expectedChildFileCount,
    sourceUser,
    transportUser,
  ] = process.argv.slice(2)
  if (![sourceUser, transportUser].every((value) => USER.test(value || ''))) {
    throw new Error('invalid source or transport user')
  }
  const identity = (flag) => {
    const result = spawnSync('/usr/bin/id', [flag, sourceUser], { encoding: 'utf8' })
    if (result.error || result.status !== 0 || !/^\d+\n?$/u.test(result.stdout || '')) {
      throw new Error('cannot resolve source identity')
    }
    return Number(result.stdout.trim())
  }
  const result = inspectLegacyBaselineState({
    repo,
    backupRoot,
    home,
    expectedHead,
    expectedChildDigest,
    expectedChildFileCount: requiredInteger(expectedChildFileCount, 'child file count'),
    rootUid: process.getuid(),
    sourceUid: identity('-u'),
    sourceGid: identity('-g'),
  })
  const sudo = spawnSync('/usr/sbin/runuser', [
    '-u', transportUser, '--', '/usr/bin/env', 'LC_ALL=C', '/usr/bin/sudo', '-n', '-l',
  ], { encoding: 'utf8' })
  const controllerSudo = !sudo.error && sudo.status === 0 && controllerSudoAllowed(sudo.stdout)
    ? 'ok'
    : 'invalid'
  for (const [key, value] of Object.entries({ ...result, controllerSudo })) {
    process.stdout.write(`${key}=${value}\n`)
  }
}

const isEntrypoint = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntrypoint || process.env.EQB_LEGACY_BASELINE_INSPECT_STDIN === '1') {
  try {
    main()
  } catch {
    process.stderr.write('Legacy baseline state inspection failed closed\n')
    process.exitCode = 1
  }
}
