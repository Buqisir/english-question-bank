#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

// One-time, fail-closed migration from the legacy mutable checkout to the
// exact production baseline required by the immutable release-layout bootstrap.
// The trusted Deployment Orb streams this tracked file to root over pinned SSH.
// It remains inert unless every machine-resolved input is explicitly present.

function requiredInput(name, pattern = /.+/u) {
  const value = process.env[name]
  if (!value || !pattern.test(value)) throw new Error(`Missing or invalid ${name}`)
  return value
}

const shaPattern = /^[a-f0-9]{40}$/u
const digestPattern = /^[a-f0-9]{64}$/u
const repo = path.resolve(requiredInput('EQB_PHASE1_REPO_ROOT'))
const old = requiredInput('EQB_PHASE1_OLD_SHA', shaPattern)
const target = requiredInput('EQB_PHASE1_TARGET_SHA', shaPattern)
const expectedTree = requiredInput('EQB_PHASE1_RELEASE_CHILD_DIGEST', digestPattern)
const publicHost = requiredInput('EQB_PHASE1_PUBLIC_HOST', /^[A-Za-z0-9.-]+$/u)
const gitHost = requiredInput('EQB_PHASE1_GIT_HOST', /^[A-Za-z0-9.-]+$/u)
const home = path.resolve(requiredInput('EQB_PHASE1_SOURCE_HOME'))
const defaultKey = path.join(home, '.ssh', 'id_ed25519')
const dbNames = ['question-bank.sqlite', 'user-data.sqlite', 'import-ops.sqlite']

process.umask(0o077)
const startedAt = new Date().toISOString()

let stage = 'initialize'
let backupDir = null
let logFd = null
let identityInstalled = false
let identityRecord = null
let sourceKey = null
let sourceFingerprint = null
let keyTempDir = null
let quarantine = null
let maintenance = false
let codeAdvanced = false
let snapshotsReady = false
let trafficReopened = false
let quarantineRecord = null
let migrationVerified = false
let distVerified = false
const dbMeta = new Map()

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function pathEntryExists(filePath) {
  try {
    fs.lstatSync(filePath)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function raw(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: options.binary ? null : 'utf8',
    cwd: options.cwd,
    maxBuffer: 128 * 1024 * 1024,
    stdio: options.stdio,
    timeout: options.timeout ?? 20 * 60 * 1000,
  })
}

function must(command, args, options = {}) {
  const result = raw(command, args, options)
  if (result.error || result.status !== 0) throw new Error(options.label || 'command')
  return result
}

function eqb(command, args, options = {}) {
  return must('/usr/sbin/runuser', ['-u', 'eqb', '--', command, ...args], {
    ...options,
    cwd: options.cwd || repo,
  })
}

function eqbResult(command, args, options = {}) {
  return raw('/usr/sbin/runuser', ['-u', 'eqb', '--', command, ...args], {
    ...options,
    cwd: options.cwd || repo,
  })
}

// The remote retry inherited the root operator's 077 umask here. Force 022
// inside every install/build subprocess instead, without changing the private
// operator process umask used for backups and logs.
function eqbBuild(command, args) {
  return eqb('/bin/sh', [
    '-c',
    'umask 022; exec "$@"',
    'eqb-build-step',
    command,
    ...args,
  ], { stdio: ['ignore', logFd, logFd] })
}

function log(message, data = {}) {
  if (logFd !== null) {
    fs.writeSync(logFd, `${JSON.stringify({
      at: new Date().toISOString(),
      stage,
      message,
      ...data,
    })}\n`)
  }
}

function gitText(args) {
  return eqb('/usr/bin/git', ['-C', repo, ...args]).stdout.trim()
}

function normalRemote() {
  const result = eqbResult('/usr/bin/env', [
    'GIT_TERMINAL_PROMPT=0',
    'GCM_INTERACTIVE=never',
    '/usr/bin/git', '-C', repo, 'ls-remote', 'origin', 'refs/heads/main',
  ])
  return !result.error
    && result.status === 0
    && (String(result.stdout || '').trim().split(/\s+/u)[0] || '') === target
}

function fixedRemote() {
  const result = eqbResult('/usr/bin/env', [
    'GIT_TERMINAL_PROMPT=0',
    'GCM_INTERACTIVE=never',
    'GIT_SSH_COMMAND=/usr/bin/ssh -F /dev/null -o BatchMode=yes -o PasswordAuthentication=no',
    '/usr/bin/git', '-C', repo, 'ls-remote', 'origin', 'refs/heads/main',
  ])
  return !result.error
    && result.status === 0
    && (String(result.stdout || '').trim().split(/\s+/u)[0] || '') === target
}

function keyFingerprint(filePath) {
  const result = raw('/usr/bin/ssh-keygen', ['-y', '-f', filePath])
  if (result.error || result.status !== 0) return null
  const fields = result.stdout.trim().split(/\s+/u)
  return fields[0] === 'ssh-ed25519' && fields[1]
    ? hash(Buffer.from(fields[1], 'base64'))
    : null
}

// The digest invariant deliberately starts at the single unknown child, not
// at the outer releases wrapper or its quarantine parent.
function childProof(wrapper) {
  const names = fs.readdirSync(wrapper)
  if (names.length !== 1) throw new Error('wrapper-child-count')
  const child = path.join(wrapper, names[0])
  if (!fs.lstatSync(child).isDirectory()) throw new Error('wrapper-child-type')

  const files = []
  const completeFiles = []
  let special = 0
  function walk(absolute, relative = '') {
    const stat = fs.lstatSync(absolute)
    if (
      stat.isSymbolicLink()
      || stat.isSocket()
      || stat.isBlockDevice()
      || stat.isCharacterDevice()
      || stat.isFIFO()
    ) {
      special += 1
      return
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) {
        walk(path.join(absolute, name), relative ? `${relative}/${name}` : name)
      }
      return
    }
    if (!stat.isFile()) return

    const isDb = /\.(sqlite|sqlite3|db)(-(wal|shm))?$/iu.test(relative)
    const isManifest = [
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
    ].includes(path.basename(relative))
    const isServer = relative.startsWith('server/') && !isDb && !isManifest
    const body = fs.readFileSync(absolute)
    const entry = { relative, size: stat.size, digest: hash(body) }
    completeFiles.push(entry)
    if (!isDb && !isManifest && !isServer) {
      files.push(entry)
    }
  }
  walk(child)
  const digest = (entries) => hash(Buffer.from(entries
    .toSorted((left, right) => left.relative.localeCompare(right.relative))
    .map((file) => `${file.relative}\0${file.size}\0${file.digest}\n`)
    .join('')))
  return {
    child,
    digest: digest(files),
    fileCount: files.length,
    completeDigest: digest(completeFiles),
    totalFileCount: completeFiles.length,
    special,
  }
}

function referenced(child) {
  function below(candidate) {
    try {
      const link = fs.readlinkSync(candidate).replace(/ \(deleted\)$/u, '')
      const resolved = path.resolve(path.dirname(candidate), link)
      return resolved === child || resolved.startsWith(`${child}/`)
    } catch {
      return false
    }
  }

  for (const pid of fs.readdirSync('/proc').filter((name) => /^\d+$/u.test(name))) {
    if (['cwd', 'root', 'exe'].some((name) => below(`/proc/${pid}/${name}`))) return true
    try {
      if (fs.readdirSync(`/proc/${pid}/fd`).some((fd) => below(`/proc/${pid}/fd/${fd}`))) {
        return true
      }
    } catch {}
  }

  function read(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8')
    } catch {
      return ''
    }
  }
  let text = `${raw('/usr/bin/systemctl', ['cat', 'eqb']).stdout || ''}\n`
    + `${read('/etc/caddy/Caddyfile')}\n${read('/etc/crontab')}`
  try {
    for (const name of fs.readdirSync('/etc/cron.d')) text += `\n${read(`/etc/cron.d/${name}`)}`
  } catch {}
  for (const user of ['root', 'eqb']) {
    const result = raw('/usr/bin/crontab', ['-l', '-u', user])
    if (result.status === 0) text += `\n${result.stdout}`
  }
  return text.includes(child) || text.includes('/opt/eqb/releases')
}

function service(name) {
  return raw('/usr/bin/systemctl', ['is-active', name]).stdout.trim() === 'active'
}

function curl(args) {
  return raw('/usr/bin/curl', [
    '--fail', '--silent', '--show-error', '--max-time', '15', ...args,
  ]).status === 0
}

function localHealth() {
  return service('eqb') && curl(['http://127.0.0.1:8787/api/health'])
}

function strictHealth() {
  const origin = `https://${publicHost}`
  return service('eqb')
    && service('caddy')
    && curl(['http://127.0.0.1:8787/api/health'])
    && curl(['--resolve', `${publicHost}:443:127.0.0.1`, `${origin}/api/health`])
    && curl(['--resolve', `${publicHost}:443:127.0.0.1`, `${origin}/`])
    && curl([`${origin}/api/health`])
    && curl([`${origin}/`])
    && curl([`${origin}/ops/`])
    && curl([`${origin}/ops/?view=review`])
}

function waitHealth(strict) {
  const deadline = Date.now() + 30_000
  do {
    if (strict ? strictHealth() : localHealth()) return true
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  } while (Date.now() < deadline)
  return false
}

function fileDigest(filePath) {
  return hash(fs.readFileSync(filePath))
}

function writeReceipt(receipt) {
  const receiptPath = path.join(backupDir, 'receipt.json')
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  fs.chmodSync(receiptPath, 0o600)
  return receipt
}

function sqliteValid(filePath) {
  const db = new DatabaseSync(filePath, { readOnly: true })
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all()
    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all()
    return integrity.length === 1
      && Object.values(integrity[0])[0] === 'ok'
      && foreignKeys.length === 0
  } finally {
    db.close()
  }
}

function sourceRows(filePath) {
  const db = new DatabaseSync(filePath, { readOnly: true })
  try {
    const exists = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='source_intake_files'",
    ).get()
    const schema = db.prepare(
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name LIKE 'source_intake%' OR name='idx_source_intake_active_role' ORDER BY type,name",
    ).all()
    const rows = exists
      ? db.prepare('SELECT * FROM source_intake_files ORDER BY id').all()
      : []
    return {
      count: rows.length,
      digest: hash(Buffer.from(JSON.stringify(rows))),
      schemaDigest: hash(Buffer.from(JSON.stringify(schema))),
    }
  } finally {
    db.close()
  }
}

function schemaPass(filePath, before) {
  const db = new DatabaseSync(filePath, { readOnly: true })
  try {
    const columns = new Set(db.prepare('PRAGMA table_info(source_intakes)').all()
      .map((column) => column.name))
    const table = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='source_intake_files'",
    ).get()
    const temporary = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE name='source_intake_files_before_listening'",
    ).get()
    const index = db.prepare(
      "SELECT \"unique\" u, partial p FROM pragma_index_list('source_intake_files') WHERE name='idx_source_intake_active_role'",
    ).get()
    const integrity = db.prepare('PRAGMA integrity_check').all()
    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all()
    const rows = db.prepare('SELECT * FROM source_intake_files ORDER BY id').all()
    const after = {
      count: rows.length,
      digest: hash(Buffer.from(JSON.stringify(rows))),
    }
    return columns.has('target_paper_id')
      && String(table?.sql || '').includes("'listening_audio'")
      && !temporary
      && Number(index?.u) === 1
      && Number(index?.p) === 1
      && integrity.length === 1
      && Object.values(integrity[0])[0] === 'ok'
      && foreignKeys.length === 0
      && after.count === before.count
      && after.digest === before.digest
  } finally {
    db.close()
  }
}

function distManifest() {
  const dist = path.join(repo, 'app', 'dist')
  const entries = []
  function walk(absolute, relative = '.') {
    const stat = fs.lstatSync(absolute)
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      throw new Error('generated-dist-special-node')
    }
    const expectedMode = stat.isDirectory() ? 0o755 : 0o644
    if ((stat.mode & 0o7777) !== expectedMode) throw new Error('generated-dist-mode')
    entries.push({
      relative,
      type: stat.isDirectory() ? 'directory' : 'file',
      uid: stat.uid,
      gid: stat.gid,
      mode: stat.mode & 0o7777,
      size: stat.size,
      digest: stat.isFile() ? hash(fs.readFileSync(absolute)) : null,
    })
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) {
        walk(path.join(absolute, name), relative === '.' ? name : `${relative}/${name}`)
      }
    }
  }
  walk(dist)
  if (!entries.some((entry) => entry.relative === 'index.html' && entry.type === 'file')) {
    throw new Error('generated-dist-index-missing')
  }
  return entries
}

function sameDistManifest(expected) {
  return JSON.stringify(distManifest()) === JSON.stringify(expected)
}

function installBuild(runtime) {
  eqbBuild('/usr/bin/pnpm', ['-C', 'app', 'install', '--frozen-lockfile'])
  eqbBuild('/usr/bin/npm', ['--prefix', 'server', 'ci'])
  eqbBuild('/usr/bin/pnpm', [
    '-C', 'app', 'exec', 'playwright', 'install', '--no-shell', 'chromium',
  ])
  eqbBuild('/usr/bin/node', ['scripts/smoke-production-chromium.mjs'])
  eqbBuild('/usr/bin/pnpm', ['-C', 'app', 'build'])
  if (runtime) {
    eqb('/usr/bin/node', [
      'scripts/backfill-production-canonical-publications.mjs', '--runtime-only',
    ], { stdio: ['ignore', logFd, logFd] })
  }
  return distManifest()
}

function restoreDbs() {
  for (const name of dbNames) {
    const live = path.join(repo, 'data', name)
    const snapshot = path.join(backupDir, 'databases', name)
    const temporary = path.join(repo, 'data', `.rollback-${name}-${process.pid}`)
    const metadata = dbMeta.get(name)
    fs.copyFileSync(snapshot, temporary, fs.constants.COPYFILE_EXCL)
    fs.chownSync(temporary, metadata.uid, metadata.gid)
    fs.chmodSync(temporary, metadata.mode)
    if (fileDigest(temporary) !== fileDigest(snapshot) || !sqliteValid(temporary)) {
      throw new Error('db-restore-proof')
    }
    for (const suffix of ['-wal', '-shm']) {
      try {
        fs.unlinkSync(`${live}${suffix}`)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    fs.renameSync(temporary, live)
  }
}

function rollback(reason) {
  let serviceRecoveryHealthy = true
  let dbRestored = false
  let codeRestored = false
  let quarantineRestored = !quarantine
  let identityRemoved = !identityInstalled
  log('rollback-start', { reason })
  try {
    if (maintenance) {
      raw('/usr/bin/systemctl', ['stop', 'caddy'], { stdio: ['ignore', logFd, logFd] })
      raw('/usr/bin/systemctl', ['stop', 'eqb'], { stdio: ['ignore', logFd, logFd] })
      if (!trafficReopened && snapshotsReady) {
        restoreDbs()
        dbRestored = true
      }
      let rollbackDist = null
      if (codeAdvanced && !trafficReopened) {
        eqb('/usr/bin/git', ['-C', repo, 'reset', '--hard', old], {
          stdio: ['ignore', logFd, logFd],
        })
        rollbackDist = installBuild(true)
        codeRestored = gitText(['rev-parse', 'HEAD']) === old
          && gitText(['status', '--porcelain']) === ''
      }
      must('/usr/bin/systemctl', ['start', 'eqb'], { stdio: ['ignore', logFd, logFd] })
      if (!waitHealth(false)) throw new Error('rollback-local')
      if (rollbackDist && !sameDistManifest(rollbackDist)) {
        throw new Error('rollback-dist-drift-before-caddy')
      }
      must('/usr/bin/systemctl', ['start', 'caddy'], { stdio: ['ignore', logFd, logFd] })
      if (!waitHealth(true)) throw new Error('rollback-strict')
    }
  } catch {
    serviceRecoveryHealthy = false
    raw('/usr/bin/systemctl', ['stop', 'caddy'], { stdio: ['ignore', logFd, logFd] })
  }

  try {
    if (quarantine && quarantineRecord && !pathEntryExists('/opt/eqb/releases')) {
      const proof = childProof(quarantine)
      if (
        proof.digest === expectedTree
        && proof.fileCount === 4876
        && proof.completeDigest === quarantineRecord.completeDigest
        && proof.totalFileCount === quarantineRecord.totalFileCount
        && proof.special === 0
      ) {
        fs.renameSync(quarantine, '/opt/eqb/releases')
        const restored = childProof('/opt/eqb/releases')
        quarantineRestored = restored.digest === expectedTree
          && restored.fileCount === 4876
          && restored.completeDigest === quarantineRecord.completeDigest
          && restored.totalFileCount === quarantineRecord.totalFileCount
          && restored.special === 0
      }
    }
  } catch {
    quarantineRestored = false
  }

  try {
    if (identityInstalled) {
      const stat = fs.lstatSync(defaultKey)
      if (
        normalRemote()
        && stat.dev === identityRecord.dev
        && stat.ino === identityRecord.ino
        && keyFingerprint(defaultKey) === identityRecord.fingerprint
        && keyFingerprint(sourceKey) === sourceFingerprint
      ) {
        fs.unlinkSync(defaultKey)
        identityRemoved = true
      }
    }
  } catch {
    identityRemoved = false
  }

  try {
    if (keyTempDir && fs.existsSync(keyTempDir)) {
      for (const name of fs.readdirSync(keyTempDir)) fs.unlinkSync(path.join(keyTempDir, name))
      fs.rmdirSync(keyTempDir)
    }
  } catch {}

  const baselineRestored = !trafficReopened
    && (!snapshotsReady || dbRestored)
    && (!codeAdvanced || codeRestored)
    && quarantineRestored
    && identityRemoved
  const healthy = baselineRestored && serviceRecoveryHealthy && strictHealth()
  log('rollback-finished', {
    healthy,
    baselineRestored,
    dbRestored,
    codeRestored,
    quarantineRestored,
    identityRemoved,
  })
  return {
    healthy,
    rolledBack: baselineRestored,
    dbRestored,
    codeRestored,
    quarantineRestored,
    identityRemoved,
  }
}

try {
  stage = 'operator-area'
  fs.mkdirSync('/var/backups/eqb', { recursive: true, mode: 0o700 })
  fs.chownSync('/var/backups/eqb', 0, 0)
  fs.chmodSync('/var/backups/eqb', 0o700)
  backupDir = fs.mkdtempSync('/var/backups/eqb/baseline-')
  fs.chownSync(backupDir, 0, 0)
  fs.chmodSync(backupDir, 0o700)
  logFd = fs.openSync(path.join(backupDir, 'operator.log'), 'wx', 0o600)
  fs.chmodSync(path.join(backupDir, 'operator.log'), 0o600)
  log('created')

  stage = 'race-gates'
  if (
    gitText(['rev-parse', 'HEAD']) !== old
    || gitText(['status', '--porcelain']) !== ''
    || !normalRemote()
    || pathEntryExists(defaultKey)
    || pathEntryExists(path.join(home, '.ssh', 'id_rsa'))
    || !strictHealth()
  ) throw new Error('race')
  const releasesStat = fs.lstatSync('/opt/eqb/releases')
  if (
    !releasesStat.isDirectory()
    || releasesStat.isSymbolicLink()
    || releasesStat.uid !== 0
    || (releasesStat.mode & 0o7777) !== 0o755
  ) throw new Error('releases-wrapper')
  const pre = childProof('/opt/eqb/releases')
  if (
    pre.digest !== expectedTree
    || pre.fileCount !== 4876
    || pre.special !== 0
    || referenced(pre.child)
  ) throw new Error('tree-drift')
  quarantineRecord = {
    completeDigest: pre.completeDigest,
    totalFileCount: pre.totalFileCount,
  }
  for (const fixedPath of [
    '/opt/eqb/current',
    '/opt/eqb/shared',
    '/opt/eqb/deployments',
    '/usr/local/libexec/eqb-deploy-controller-v1',
    '/usr/local/libexec/eqb-deploy-controller-v1.mjs',
  ]) {
    if (pathEntryExists(fixedPath)) throw new Error('fixed-drift')
  }
  log('gates-pass')

  stage = 'identity-correction'
  const identities = eqb('/usr/bin/env', [
    `HOME=${home}`, '/usr/bin/ssh', '-G', gitHost,
  ]).stdout.split('\n')
    .filter((line) => line.startsWith('identityfile '))
    .map((line) => line.slice(13).trim())
  if (identities.length !== 1) throw new Error('identity-count')
  sourceKey = identities[0]
    .replace(/^~(?=\/|$)/u, home)
    .replaceAll('%d', home)
  sourceFingerprint = keyFingerprint(sourceKey)
  const uid = Number(must('/usr/bin/id', ['-u', 'eqb']).stdout.trim())
  const gid = Number(must('/usr/bin/id', ['-g', 'eqb']).stdout.trim())
  const sshDirectory = path.join(home, '.ssh')
  const sourceStat = fs.lstatSync(sourceKey)
  const sourceRealPath = fs.realpathSync(sourceKey)
  const sshRealPath = fs.realpathSync(sshDirectory)
  if (
    sourceKey === defaultKey
    || !sourceFingerprint
    || !sourceStat.isFile()
    || sourceStat.isSymbolicLink()
    || sourceStat.uid !== uid
    || (sourceStat.mode & 0o077) !== 0
    || !sourceRealPath.startsWith(`${sshRealPath}${path.sep}`)
  ) throw new Error('identity-source')
  keyTempDir = fs.mkdtempSync(path.join(home, '.ssh', '.id-ed25519-copy-'))
  const temporaryKey = path.join(keyTempDir, 'key')
  fs.copyFileSync(sourceKey, temporaryKey, fs.constants.COPYFILE_EXCL)
  fs.chownSync(temporaryKey, uid, gid)
  fs.chmodSync(temporaryKey, 0o600)
  if (fs.lstatSync(temporaryKey).isSymbolicLink()
      || keyFingerprint(temporaryKey) !== sourceFingerprint) {
    throw new Error('identity-copy')
  }
  fs.linkSync(temporaryKey, defaultKey)
  fs.unlinkSync(temporaryKey)
  fs.rmdirSync(keyTempDir)
  keyTempDir = null
  const keyStat = fs.lstatSync(defaultKey)
  identityRecord = {
    dev: keyStat.dev,
    ino: keyStat.ino,
    fingerprint: sourceFingerprint,
  }
  identityInstalled = true
  if (
    keyStat.uid !== uid
    || (keyStat.mode & 0o7777) !== 0o600
    || keyFingerprint(defaultKey) !== sourceFingerprint
    || !fixedRemote()
  ) throw new Error('identity-verify')
  log('identity-pass', {
    device: keyStat.dev,
    inode: keyStat.ino,
    fingerprintEquality: true,
  })

  stage = 'quarantine-correction'
  if (fs.statSync('/opt/eqb/releases').dev !== fs.statSync('/var/backups').dev) {
    throw new Error('filesystem')
  }
  const quarantineParent = path.join(backupDir, 'quarantine')
  fs.mkdirSync(quarantineParent, { mode: 0o700 })
  fs.chownSync(quarantineParent, 0, 0)
  fs.chmodSync(quarantineParent, 0o700)
  quarantine = path.join(quarantineParent, 'releases')
  fs.renameSync('/opt/eqb/releases', quarantine)
  if (pathEntryExists('/opt/eqb/releases')) throw new Error('source-remains')
  const moved = childProof(quarantine)
  if (
    moved.digest !== expectedTree
    || moved.fileCount !== 4876
    || moved.completeDigest !== quarantineRecord.completeDigest
    || moved.totalFileCount !== quarantineRecord.totalFileCount
    || moved.special !== 0
  ) throw new Error('moved-proof')
  log('quarantine-pass', {
    childCount: 1,
    fileCount: 4876,
    totalFileCount: moved.totalFileCount,
    digestEquality: true,
    completeDigestEquality: true,
  })

  stage = 'fetch-gates'
  eqb('/usr/bin/env', [
    'GIT_TERMINAL_PROMPT=0',
    'GCM_INTERACTIVE=never',
    'GIT_SSH_COMMAND=/usr/bin/ssh -F /dev/null -o BatchMode=yes -o PasswordAuthentication=no',
    '/usr/bin/git', '-C', repo, 'fetch', '--quiet', '--no-tags', 'origin', 'main',
  ], { stdio: ['ignore', logFd, logFd] })
  if (gitText(['rev-parse', 'FETCH_HEAD']) !== target
      || eqbResult('/usr/bin/git', [
        '-C', repo, 'merge-base', '--is-ancestor', old, target,
      ]).status !== 0) {
    throw new Error('fetch-ancestry')
  }
  const protectedPaths = [
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
  ]
  const changed = gitText([
    'diff', '--name-only', '--no-renames', old, target, '--', ...protectedPaths,
  ]).split('\n').filter(Boolean).sort()
  if (JSON.stringify(changed) !== JSON.stringify([
    'server/paper-import/publisher.mjs',
    'server/source-intake/sourceIntakeStore.mjs',
  ])) throw new Error('protected-diff')
  for (const executable of [
    '/usr/bin/node',
    '/usr/bin/pnpm',
    '/usr/bin/npm',
    '/usr/bin/git',
    '/usr/bin/sqlite3',
    '/usr/bin/systemctl',
    '/usr/bin/caddy',
    '/usr/bin/curl',
    '/usr/sbin/runuser',
  ]) {
    if (!fs.existsSync(executable)) throw new Error('executable')
  }
  const allowance = dbNames.reduce(
    (total, name) => total + fs.statSync(path.join(repo, 'data', name)).size,
    0,
  )
  const filesystem = fs.statfsSync('/opt/eqb')
  if (filesystem.bavail * filesystem.bsize < 5_368_709_120 + allowance) {
    throw new Error('space')
  }
  const importDb = path.join(repo, 'data', 'import-ops.sqlite')
  const resolveCode = "import path from 'node:path';const root=process.cwd();const db=process.env.QUESTION_BANK_IMPORT_OPS_DB||path.join(root,'data/import-ops.sqlite');process.stdout.write(path.resolve(db));"
  const resolvedImportDb = eqb('/usr/bin/node', [
    `--env-file-if-exists=${path.join(repo, '.env')}`,
    '--input-type=module',
    '-e',
    resolveCode,
  ]).stdout.trim()
  if (resolvedImportDb !== importDb) throw new Error('env-db-path')
  log('fetch-gates-pass', { protectedDiffExact: true })

  stage = 'stop-services'
  // From the first stop attempt onward, rollback owns service recovery even if
  // a later stop command itself fails.
  maintenance = true
  must('/usr/bin/systemctl', ['stop', 'caddy'], { stdio: ['ignore', logFd, logFd] })
  must('/usr/bin/systemctl', ['stop', 'eqb'], { stdio: ['ignore', logFd, logFd] })
  if (service('caddy') || service('eqb')) throw new Error('inactive')
  log('services-stopped')

  stage = 'backups'
  const databaseDirectory = path.join(backupDir, 'databases')
  fs.mkdirSync(databaseDirectory, { mode: 0o700 })
  for (const name of dbNames) {
    const live = path.join(repo, 'data', name)
    const snapshot = path.join(databaseDirectory, name)
    const metadata = fs.statSync(live)
    dbMeta.set(name, {
      uid: metadata.uid,
      gid: metadata.gid,
      mode: metadata.mode & 0o7777,
    })
    must('/usr/bin/sqlite3', [live, `.backup '${snapshot}'`], {
      stdio: ['ignore', logFd, logFd],
    })
    fs.chmodSync(snapshot, 0o600)
    if (!sqliteValid(snapshot)) throw new Error('snapshot')
    log('snapshot-pass', {
      database: name,
      size: fs.statSync(snapshot).size,
      digest: fileDigest(snapshot),
      sourceOwner: metadata.uid,
      sourceGroup: metadata.gid,
      sourceMode: (metadata.mode & 0o7777).toString(8),
    })
  }
  snapshotsReady = true
  const preRows = sourceRows(importDb)
  log('intake-pre', preRows)

  stage = 'advance'
  eqb('/usr/bin/git', ['-C', repo, 'merge', '--ff-only', target], {
    stdio: ['ignore', logFd, logFd],
  })
  codeAdvanced = true
  if (gitText(['rev-parse', 'HEAD']) !== target
      || gitText(['status', '--porcelain']) !== '') {
    throw new Error('advance')
  }
  log('advanced')

  stage = 'build-runtime'
  const targetDist = installBuild(true)
  distVerified = true
  log('build-runtime-pass', { distPaths: targetDist.length, distModesVerified: true })

  stage = 'offline-migration'
  const migrate = "import path from 'node:path';import {createSourceIntakeStore} from './server/source-intake/sourceIntakeStore.mjs';const root=process.cwd();const dbPath=process.env.QUESTION_BANK_IMPORT_OPS_DB||path.join(root,'data/import-ops.sqlite');const filesRoot=process.env.QUESTION_BANK_IMPORT_OPS_ROOT||path.join(root,'data/import-ops/files');createSourceIntakeStore({dbPath,filesRoot});createSourceIntakeStore({dbPath,filesRoot});"
  eqb('/usr/bin/node', [
    `--env-file-if-exists=${path.join(repo, '.env')}`,
    '--input-type=module',
    '-e',
    migrate,
  ], { stdio: ['ignore', logFd, logFd] })
  if (!schemaPass(importDb, preRows)) throw new Error('schema')
  migrationVerified = true
  log('migration-pass', { twice: true, countEquality: true, digestEquality: true })

  stage = 'post-runtime'
  eqb('/usr/bin/node', [
    'scripts/backfill-production-canonical-publications.mjs', '--runtime-only',
  ], { stdio: ['ignore', logFd, logFd] })
  if (gitText(['rev-parse', 'HEAD']) !== target
      || gitText(['status', '--porcelain']) !== '') {
    throw new Error('post-git')
  }
  log('post-runtime-pass')

  stage = 'start-eqb'
  must('/usr/bin/systemctl', ['start', 'eqb'], { stdio: ['ignore', logFd, logFd] })
  if (!waitHealth(false)) throw new Error('local-health')
  log('local-health-pass')

  stage = 'pre-caddy-dist-proof'
  if (
    gitText(['rev-parse', 'HEAD']) !== target
    || gitText(['status', '--porcelain']) !== ''
    || !schemaPass(importDb, preRows)
    || !sameDistManifest(targetDist)
  ) throw new Error('target-invariants-before-caddy')
  eqb('/usr/bin/node', [
    'scripts/backfill-production-canonical-publications.mjs', '--runtime-only',
  ], { stdio: ['ignore', logFd, logFd] })
  if (!sameDistManifest(targetDist)) throw new Error('target-dist-drift-before-caddy')
  log('pre-caddy-dist-pass', {
    hashesUnchanged: true,
    modesVerified: true,
    schemaVerified: true,
  })

  stage = 'start-caddy'
  // From the first Caddy start attempt onward, external writes cannot be ruled
  // out. A failure must preserve the internally consistent target code/schema
  // rather than restoring snapshots or running old code against the new DB.
  trafficReopened = true
  must('/usr/bin/systemctl', ['start', 'caddy'], { stdio: ['ignore', logFd, logFd] })
  if (!waitHealth(true)) throw new Error('strict-health')
  log('strict-health-pass')

  stage = 'terminal'
  if (!strictHealth()) throw new Error('terminal-health')
  log('success', {
    sha: target,
    dirty: 0,
    countEquality: true,
    digestEquality: true,
    distHashesUnchanged: true,
    bootstrap: false,
  })
  const receipt = writeReceipt({
    schemaVersion: 'eqb-legacy-baseline-receipt-v1',
    state: 'reported',
    conclusion: 'success',
    targetSha: target,
    previousSha: old,
    productionSha: target,
    eqb: 'active',
    caddy: 'active',
    layout: 'legacy',
    identityInstalled: true,
    quarantinePreserved: true,
    backupsVerified: snapshotsReady,
    migrationVerified,
    distVerified,
    rolledBack: false,
    rollbackHealthy: null,
    failureCode: null,
    startedAt,
    finishedAt: new Date().toISOString(),
    bootstrapRun: false,
  })
  fs.fsyncSync(logFd)
  console.log(JSON.stringify(receipt))
} catch (error) {
  const failed = stage
  const rollbackResult = rollback(failed)
  log('failure', { failed, rollback: rollbackResult })
  const productionSha = (() => {
    try {
      return gitText(['rev-parse', 'HEAD'])
    } catch {
      return old
    }
  })()
  const failureCode = /^[a-z0-9-]+$/u.test(String(error.message))
    ? String(error.message)
    : 'unexpected'
  const receipt = writeReceipt({
    schemaVersion: 'eqb-legacy-baseline-receipt-v1',
    state: 'reported',
    conclusion: 'failure',
    targetSha: target,
    previousSha: old,
    productionSha,
    eqb: service('eqb') ? 'active' : 'inactive',
    caddy: service('caddy') ? 'active' : 'inactive',
    layout: 'legacy',
    identityInstalled: identityInstalled && !rollbackResult.identityRemoved,
    quarantinePreserved: Boolean(quarantine) && !rollbackResult.quarantineRestored,
    backupsVerified: snapshotsReady,
    migrationVerified,
    distVerified,
    rolledBack: rollbackResult.rolledBack,
    rollbackHealthy: rollbackResult.healthy,
    failureCode: `${failed}:${failureCode}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    bootstrapRun: false,
  })
  try {
    fs.fsyncSync(logFd)
  } catch {}
  console.log(JSON.stringify(receipt))
  process.exitCode = 1
} finally {
  if (logFd !== null) {
    try {
      fs.closeSync(logFd)
    } catch {}
  }
}
