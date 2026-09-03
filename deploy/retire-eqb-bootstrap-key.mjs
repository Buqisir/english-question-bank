#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// One-time retirement of the privileged bootstrap identity after the new
// forced-command controller identity has already passed an independent SSH
// preflight. The Deployment Orb streams this exact tracked operator over the
// still-live bootstrap connection and then proves that identity no longer works.

const keyBodyPattern = /^[A-Za-z0-9+/]+={0,3}$/u
const transportUserPattern = /^[a-z_][a-z0-9_-]*$/u
const transportUser = String(process.env.EQB_DEPLOY_TRANSPORT_USER || '')
const oldKeyBody = String(process.env.EQB_DEPLOY_BOOTSTRAP_PUBLIC_KEY_BODY || '')
const newKeyBody = String(process.env.EQB_DEPLOY_CONTROLLER_PUBLIC_KEY_BODY || '')
const transportController = '/usr/local/libexec/eqb-deploy-transport-v1'
const keyComment = 'eqb-amp-deployment-v1'

process.umask(0o077)

function fail(message) {
  throw new Error(message)
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function privateWrite(filePath, value, { uid = 0, gid = 0 } = {}) {
  const descriptor = fs.openSync(filePath, 'wx', 0o600)
  try {
    fs.writeFileSync(descriptor, value, 'utf8')
    fs.fsyncSync(descriptor)
    fs.fchownSync(descriptor, uid, gid)
    fs.fchmodSync(descriptor, 0o600)
  } finally {
    fs.closeSync(descriptor)
  }
}

function containsKeyBody(line, body) {
  return line.trim().split(/[\t ]+/u).includes(body)
}

function lineRecords(value) {
  const records = value.match(/[^\n]*(?:\n|$)/gu) || []
  if (records.at(-1) === '') records.pop()
  return records
}

function authorizationRecords(records) {
  return records.filter((record) => {
    const line = record.trim()
    return line && !line.startsWith('#')
  })
}

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, 'r')
  try {
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
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

function resolveTransportBoundary() {
  if (!transportUserPattern.test(transportUser) || transportUser === 'root') fail('transport-user')
  const fields = execFileSync('/usr/bin/getent', ['passwd', transportUser], {
    encoding: 'utf8',
  }).trim().split(':')
  if (fields.length !== 7 || fields[0] !== transportUser) fail('transport-account')
  const uid = Number(fields[2])
  const gid = Number(fields[3])
  const home = fields[5]
  if (!Number.isSafeInteger(uid) || uid < 1 || !Number.isSafeInteger(gid) || gid < 0) {
    fail('transport-identity')
  }
  if (
    !path.isAbsolute(home)
    || path.normalize(home) !== home
    || home === '/'
    || home.includes('\0')
  ) fail('transport-home')
  const homeState = fs.lstatSync(home)
  if (
    !homeState.isDirectory()
    || homeState.isSymbolicLink()
    || homeState.uid !== uid
    || homeState.gid !== gid
  ) {
    fail('transport-home-state')
  }
  if ((homeState.mode & 0o022) !== 0) fail('transport-home-mode')
  const sshDirectory = path.join(home, '.ssh')
  const sshState = fs.lstatSync(sshDirectory)
  if (
    !sshState.isDirectory()
    || sshState.isSymbolicLink()
    || sshState.uid !== uid
    || sshState.gid !== gid
    || (sshState.mode & 0o7777) !== 0o700
  ) fail('transport-ssh-directory')
  const authorizedKeys = path.join(sshDirectory, 'authorized_keys')
  if (pathEntryExists(path.join(sshDirectory, 'authorized_keys2'))) {
    fail('transport-secondary-authorized-keys')
  }
  return { uid, gid, sshDirectory, authorizedKeys }
}

if (process.getuid?.() !== 0) fail('run-as-root')
const transport = resolveTransportBoundary()
if (!keyBodyPattern.test(oldKeyBody) || !keyBodyPattern.test(newKeyBody)) fail('key-input')
if (oldKeyBody === newKeyBody) fail('key-identities-equal')

const authorizedState = fs.lstatSync(transport.authorizedKeys)
if (
  !authorizedState.isFile()
  || authorizedState.isSymbolicLink()
  || authorizedState.uid !== transport.uid
  || authorizedState.gid !== transport.gid
  || (authorizedState.mode & 0o7777) !== 0o600
  || authorizedState.nlink !== 1
) fail('authorized-keys-state')

const original = fs.readFileSync(transport.authorizedKeys, 'utf8')
if (
  Buffer.byteLength(original) > 1024 * 1024
  || original.includes('\0')
  || original.includes('\r')
) {
  fail('authorized-keys-content')
}
const records = lineRecords(original)
const oldMatches = records.filter((record) => containsKeyBody(record, oldKeyBody))
const newMatches = records.filter((record) => containsKeyBody(record, newKeyBody))
const expectedForcedKey = `restrict,command="${transportController}" ssh-ed25519 ${newKeyBody} ${keyComment}`
if (oldMatches.length !== 1) fail('bootstrap-key-count')
if (newMatches.length !== 1 || newMatches[0].trim() !== expectedForcedKey) {
  fail('controller-key-state')
}
if (authorizationRecords(records).length !== 2) fail('unexpected-authorized-key')

const backupRoot = '/var/backups/eqb'
const backupRootState = fs.lstatSync(backupRoot)
if (
  !backupRootState.isDirectory()
  || backupRootState.isSymbolicLink()
  || backupRootState.uid !== 0
  || backupRootState.gid !== 0
  || (backupRootState.mode & 0o7777) !== 0o700
) fail('backup-root-state')
const backupDirectory = fs.mkdtempSync('/var/backups/eqb/bootstrap-key-retirement-')
fs.chownSync(backupDirectory, 0, 0)
fs.chmodSync(backupDirectory, 0o700)
const backupPath = path.join(backupDirectory, 'authorized_keys.before')
privateWrite(backupPath, original)

const replacement = records
  .filter((record) => !containsKeyBody(record, oldKeyBody))
  .join('')
const replacementPath = path.join(
  transport.sshDirectory,
  `.authorized_keys-retirement-${crypto.randomBytes(12).toString('hex')}`,
)
let replaced = false
try {
  privateWrite(replacementPath, replacement, transport)
  const currentState = fs.lstatSync(transport.authorizedKeys)
  if (
    currentState.dev !== authorizedState.dev
    || currentState.ino !== authorizedState.ino
    || currentState.uid !== authorizedState.uid
    || currentState.gid !== authorizedState.gid
    || (currentState.mode & 0o7777) !== (authorizedState.mode & 0o7777)
    || currentState.nlink !== authorizedState.nlink
    || hash(fs.readFileSync(transport.authorizedKeys, 'utf8')) !== hash(original)
  ) fail('authorized-keys-race')
  fs.renameSync(replacementPath, transport.authorizedKeys)
  syncDirectory(transport.sshDirectory)
  replaced = true
  const installedState = fs.lstatSync(transport.authorizedKeys)
  const installed = fs.readFileSync(transport.authorizedKeys, 'utf8')
  const installedRecords = lineRecords(installed)
  if (
    !installedState.isFile()
    || installedState.isSymbolicLink()
    || installedState.uid !== transport.uid
    || installedState.gid !== transport.gid
    || (installedState.mode & 0o7777) !== 0o600
    || installedState.nlink !== 1
    || installed !== replacement
    || installedRecords.some((record) => containsKeyBody(record, oldKeyBody))
    || installedRecords.filter((record) => containsKeyBody(record, newKeyBody)).length !== 1
    || authorizationRecords(installedRecords).length !== 1
    || installedRecords.find((record) => containsKeyBody(record, newKeyBody))?.trim() !== expectedForcedKey
  ) fail('retirement-postcondition')

  const receipt = {
    schemaVersion: 'eqb-bootstrap-key-retirement-v1',
    state: 'reported',
    conclusion: 'success',
    oldKeyRemoved: true,
    forcedKeyPreserved: true,
    originalDigest: hash(original),
    installedDigest: hash(installed),
  }
  privateWrite(path.join(backupDirectory, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`)
  console.log(JSON.stringify(receipt))
} catch (error) {
  if (replaced) {
    const rollbackPath = path.join(
      transport.sshDirectory,
      `.authorized_keys-retirement-rollback-${crypto.randomBytes(12).toString('hex')}`,
    )
    privateWrite(rollbackPath, original, transport)
    fs.renameSync(rollbackPath, transport.authorizedKeys)
    syncDirectory(transport.sshDirectory)
    if (hash(fs.readFileSync(transport.authorizedKeys, 'utf8')) !== hash(original)) {
      throw new Error('retirement-rollback-failed')
    }
  }
  try {
    fs.unlinkSync(replacementPath)
  } catch (cleanupError) {
    if (cleanupError.code !== 'ENOENT') throw cleanupError
  }
  throw error
}
