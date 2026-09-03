#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// The Deployment Orb streams this tracked operator through the still-valid
// bootstrap identity while holding the bootstrap host lock. The marker closes
// the dispatch-acceptance race: a queued bootstrap must observe it under that
// same lock before making any runtime change.

const SHA = /^[a-f0-9]{40}$/u
const UNIT = /^eqb-release-bootstrap-[a-f0-9]{32}$/u
const targetSha = String(process.argv[2] || '')
const unit = String(process.argv[3] || '')
const backupRoot = '/var/backups/eqb'
const schemaVersion = 'eqb-release-bootstrap-cancellation-v1'

process.umask(0o077)

function fail(message) {
  throw new Error(message)
}

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY)
  try {
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
}

function readPrivateFile(filePath) {
  const before = fs.lstatSync(filePath)
  if (
    !before.isFile()
    || before.isSymbolicLink()
    || before.uid !== 0
    || before.gid !== 0
    || (before.mode & 0o7777) !== 0o600
    || before.nlink !== 1
    || before.size < 1
    || before.size > 4096
  ) fail('cancellation-marker-state')
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const opened = fs.fstatSync(descriptor)
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) {
      fail('cancellation-marker-race')
    }
    return fs.readFileSync(descriptor, 'utf8')
  } finally {
    fs.closeSync(descriptor)
  }
}

function assertReceipt(receipt) {
  const expectedKeys = [
    'cancellationInstalled',
    'conclusion',
    'hostAttemptStarted',
    'schemaVersion',
    'state',
    'targetSha',
    'unit',
  ]
  if (
    !receipt
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || Object.keys(receipt).sort().join('\n') !== expectedKeys.join('\n')
    || receipt.schemaVersion !== schemaVersion
    || receipt.state !== 'reported'
    || receipt.conclusion !== 'cancelled'
    || receipt.targetSha !== targetSha
    || receipt.unit !== unit
    || receipt.cancellationInstalled !== true
    || typeof receipt.hostAttemptStarted !== 'boolean'
  ) fail('cancellation-marker-content')
  return receipt
}

if (process.getuid?.() !== 0) fail('run-as-root')
if (!SHA.test(targetSha)) fail('target-sha')
if (!UNIT.test(unit)) fail('bootstrap-unit')
if (!path.isAbsolute(backupRoot) || path.normalize(backupRoot) !== backupRoot || backupRoot === '/') {
  fail('backup-root')
}
const backupRootState = fs.lstatSync(backupRoot)
if (
  !backupRootState.isDirectory()
  || backupRootState.isSymbolicLink()
  || backupRootState.uid !== 0
  || backupRootState.gid !== 0
  || (backupRootState.mode & 0o7777) !== 0o700
) fail('backup-root-state')

const markerPath = path.join(backupRoot, `bootstrap-cancellation-${unit}.json`)
const attemptPath = path.join(backupRoot, `bootstrap-attempt-${unit}.json`)
let receipt
try {
  receipt = assertReceipt(JSON.parse(readPrivateFile(markerPath)))
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
  let hostAttemptStarted = false
  try {
    const attempt = JSON.parse(readPrivateFile(attemptPath))
    const attemptKeys = ['schemaVersion', 'state', 'targetSha', 'unit']
    if (
      !attempt
      || typeof attempt !== 'object'
      || Array.isArray(attempt)
      || Object.keys(attempt).sort().join('\n') !== attemptKeys.join('\n')
      || attempt.schemaVersion !== 'eqb-release-bootstrap-attempt-v1'
      || attempt.state !== 'accepted'
      || attempt.targetSha !== targetSha
      || attempt.unit !== unit
    ) fail('bootstrap-attempt-marker-content')
    hostAttemptStarted = true
  } catch (attemptError) {
    if (attemptError?.code !== 'ENOENT') throw attemptError
  }
  receipt = {
    schemaVersion,
    state: 'reported',
    conclusion: 'cancelled',
    targetSha,
    unit,
    cancellationInstalled: true,
    hostAttemptStarted,
  }
  const temporary = path.join(
    backupRoot,
    `.bootstrap-cancellation-${crypto.randomBytes(12).toString('hex')}`,
  )
  let descriptor
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600)
    fs.writeFileSync(descriptor, `${JSON.stringify(receipt)}\n`, 'utf8')
    fs.fsyncSync(descriptor)
    fs.fchownSync(descriptor, 0, 0)
    fs.fchmodSync(descriptor, 0o600)
    fs.closeSync(descriptor)
    descriptor = undefined
    fs.renameSync(temporary, markerPath)
    syncDirectory(backupRoot)
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
    try {
      fs.unlinkSync(temporary)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  assertReceipt(JSON.parse(readPrivateFile(markerPath)))
}

console.log(`EQB_BOOTSTRAP_CANCELLATION ${JSON.stringify(receipt)}`)
