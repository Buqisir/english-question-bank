#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  checkImportEnvironment,
  writeImportEnvironmentPreflightReceipt,
} from './import-pipeline/import-environment-preflight.mjs'

const result = checkImportEnvironment()
assert.equal(result.schemaVersion, 'import-environment-preflight-v1')
assert.match(result.environmentDigest, /^sha256:[a-f0-9]{64}$/u)
assert.deepEqual(
  result.checks.map((check) => check.name),
  ['magick', 'ffmpeg', 'soffice', 'pdfinfo', 'pdftoppm', 'unzip'],
)
assert(result.checks.every((check) =>
  check.launch === 'healthy'
  && check.executable.startsWith('/')
  && typeof check.version === 'string'))
if (process.platform === 'darwin') {
  assert(result.checks.filter((check) => ['magick', 'ffmpeg'].includes(check.name))
    .every((check) => Array.isArray(check.dynamicLinks) && check.dynamicLinks.length > 0))
}
assert.match(result.policy, /no_mid_run_install_or_upgrade/u)

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-import-preflight-'))
try {
  const receiptPath = writeImportEnvironmentPreflightReceipt(tempRoot, {
    ...result,
    receiptPath: null,
  })
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  assert.equal(receipt.environmentDigest, result.environmentDigest)
  assert.equal(Object.hasOwn(receipt, 'receiptPath'), false)
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('verify-import-environment-preflight: PASS')
