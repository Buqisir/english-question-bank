#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// One-time retirement of the privileged bootstrap identity after the new
// forced-command controller identity has already passed an independent SSH
// preflight. The Deployment Orb streams this exact tracked operator over the
// still-live bootstrap connection and then proves that identity no longer works.

const keyBodyPattern = /^[A-Za-z0-9+/]+={0,3}$/u
const oldKeyBody = String(process.env.EQB_DEPLOY_BOOTSTRAP_PUBLIC_KEY_BODY || '')
const newKeyBody = String(process.env.EQB_DEPLOY_CONTROLLER_PUBLIC_KEY_BODY || '')
const authorizedKeys = '/root/.ssh/authorized_keys'
const controller = '/usr/local/libexec/eqb-deploy-controller-v1'
const keyComment = 'eqb-amp-deployment-v1'

process.umask(0o077)

function fail(message) {
  throw new Error(message)
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function privateWrite(filePath, value) {
  const descriptor = fs.openSync(filePath, 'wx', 0o600)
  try {
    fs.writeFileSync(descriptor, value, 'utf8')
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  fs.chownSync(filePath, 0, 0)
  fs.chmodSync(filePath, 0o600)
}

function containsKeyBody(line, body) {
  return line.trim().split(/[\t ]+/u).includes(body)
}

function syncSshDirectory() {
  const descriptor = fs.openSync('/root/.ssh', 'r')
  try {
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
}

if (process.getuid?.() !== 0) fail('run-as-root')
if (!keyBodyPattern.test(oldKeyBody) || !keyBodyPattern.test(newKeyBody)) fail('key-input')
if (oldKeyBody === newKeyBody) fail('key-identities-equal')

const authorizedState = fs.lstatSync(authorizedKeys)
if (
  !authorizedState.isFile()
  || authorizedState.isSymbolicLink()
  || authorizedState.uid !== 0
  || (authorizedState.mode & 0o077) !== 0
) fail('authorized-keys-state')

const original = fs.readFileSync(authorizedKeys, 'utf8')
if (
  Buffer.byteLength(original) > 1024 * 1024
  || original.includes('\0')
  || original.includes('\r')
) {
  fail('authorized-keys-content')
}
const lines = original.split('\n')
if (lines.at(-1) === '') lines.pop()
const oldMatches = lines.filter((line) => containsKeyBody(line, oldKeyBody))
const newMatches = lines.filter((line) => containsKeyBody(line, newKeyBody))
const expectedForcedKey = `restrict,command="${controller}" ssh-ed25519 ${newKeyBody} ${keyComment}`
if (oldMatches.length !== 1) fail('bootstrap-key-count')
if (newMatches.length !== 1 || newMatches[0].trim() !== expectedForcedKey) {
  fail('controller-key-state')
}

fs.mkdirSync('/var/backups/eqb', { recursive: true, mode: 0o700 })
fs.chownSync('/var/backups/eqb', 0, 0)
fs.chmodSync('/var/backups/eqb', 0o700)
const backupDirectory = fs.mkdtempSync('/var/backups/eqb/bootstrap-key-retirement-')
fs.chownSync(backupDirectory, 0, 0)
fs.chmodSync(backupDirectory, 0o700)
const backupPath = path.join(backupDirectory, 'authorized_keys.before')
privateWrite(backupPath, original)

const retained = lines.filter((line) => !containsKeyBody(line, oldKeyBody))
const replacement = `${retained.join('\n')}\n`
const replacementPath = `/root/.ssh/.authorized_keys-retirement-${process.pid}`
let replaced = false
try {
  privateWrite(replacementPath, replacement)
  fs.renameSync(replacementPath, authorizedKeys)
  syncSshDirectory()
  replaced = true
  const installedState = fs.lstatSync(authorizedKeys)
  const installed = fs.readFileSync(authorizedKeys, 'utf8')
  if (
    !installedState.isFile()
    || installedState.isSymbolicLink()
    || installedState.uid !== 0
    || (installedState.mode & 0o7777) !== 0o600
    || installed.split('\n').some((line) => containsKeyBody(line, oldKeyBody))
    || installed.split('\n').filter((line) => containsKeyBody(line, newKeyBody)).length !== 1
    || !installed.includes(`${expectedForcedKey}\n`)
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
    const rollbackPath = `/root/.ssh/.authorized_keys-retirement-rollback-${process.pid}`
    privateWrite(rollbackPath, original)
    fs.renameSync(rollbackPath, authorizedKeys)
    fs.chmodSync(authorizedKeys, authorizedState.mode & 0o7777)
    syncSshDirectory()
    if (hash(fs.readFileSync(authorizedKeys, 'utf8')) !== hash(original)) {
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
