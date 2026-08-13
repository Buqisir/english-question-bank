#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import {
  TRUSTED_DOCX_REQUEST_FILE_NAME,
  materializeTrustedDocxCanonicalRequest,
} from '../../server/paper-canonical/trustedDocxCanonicalRequest.mjs'
import { loadCanonicalImportRequest } from '../../server/paper-canonical/importRequest.mjs'

function option(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

const sourcePath = process.argv[2]
const outputDir = option('--output-dir')
const expectedPaperId = option('--expected-paper-id')
const requestFileName =
  option('--request-file-name') || TRUSTED_DOCX_REQUEST_FILE_NAME
const write = process.argv.includes('--write')

if (
  !sourcePath
  || sourcePath.startsWith('--')
  || !outputDir
) {
  console.error(
    'Usage: node scripts/import-pipeline/build-trusted-docx-canonical-request.mjs '
      + '<source.docx> --output-dir <dir> '
      + '[--expected-paper-id <paperId>] '
      + '[--request-file-name <file.json>] [--write]',
  )
  process.exit(1)
}

if (
  path.basename(requestFileName) !== requestFileName
  || !/^canonical-import-request(?:-v[1-9][0-9]*)?\.json$/.test(
    requestFileName,
  )
) {
  throw new Error(`Canonical request file name is unsafe: ${requestFileName}`)
}

const absoluteSourcePath = path.resolve(sourcePath)
const absoluteOutputDir = path.resolve(outputDir)
if (!existsSync(absoluteSourcePath)) {
  throw new Error(`Format ① DOCX source is missing: ${absoluteSourcePath}`)
}

const materialized = materializeTrustedDocxCanonicalRequest(
  new Uint8Array(readFileSync(absoluteSourcePath)),
  {
    originalName: path.basename(absoluteSourcePath),
    expectedPaperId: expectedPaperId || null,
  },
)
const outputs = new Map(materialized.outputs)
if (requestFileName !== TRUSTED_DOCX_REQUEST_FILE_NAME) {
  const requestBytes = outputs.get(TRUSTED_DOCX_REQUEST_FILE_NAME)
  outputs.delete(TRUSTED_DOCX_REQUEST_FILE_NAME)
  outputs.set(requestFileName, requestBytes)
}

if (write) {
  mkdirSync(absoluteOutputDir, { recursive: true })
  for (const [fileName, bytes] of outputs) {
    writeFileSync(path.join(absoluteOutputDir, fileName), bytes)
  }
  const requestPath = path.join(absoluteOutputDir, requestFileName)
  const loaded = loadCanonicalImportRequest(requestPath)
  assert.equal(
    loaded.evidence.documents.length,
    3,
    'Trusted DOCX request must load source, envelope, and Teacher Confirmation',
  )
  console.log(
    `WROTE ${materialized.paperId} trusted-DOCX canonical request: ${requestPath}`,
  )
} else {
  for (const [fileName, expectedBytes] of outputs) {
    const actualPath = path.join(absoluteOutputDir, fileName)
    if (!existsSync(actualPath)) {
      throw new Error(`Canonical request output is missing: ${actualPath}`)
    }
    assert.deepEqual(
      readFileSync(actualPath),
      expectedBytes,
      `Canonical request output drifted: ${actualPath}`,
    )
  }
  console.log(
    `PASS ${materialized.paperId} trusted-DOCX canonical request is reproducible`,
  )
}
