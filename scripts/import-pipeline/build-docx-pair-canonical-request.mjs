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
  DOCX_PAIR_REQUEST_FILE_NAME,
  materializeDocxPairCanonicalRequest,
} from '../../server/paper-canonical/docxPairCanonicalRequest.mjs'
import { loadCanonicalImportRequest } from '../../server/paper-canonical/importRequest.mjs'

function option(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

const questionPath = process.argv[2]
const answersPath = process.argv[3]
const outputDir = option('--output-dir')
const expectedPaperId = option('--expected-paper-id')
const requestFileName =
  option('--request-file-name') || DOCX_PAIR_REQUEST_FILE_NAME
const write = process.argv.includes('--write')

if (
  !questionPath
  || questionPath.startsWith('--')
  || !answersPath
  || answersPath.startsWith('--')
  || !outputDir
  || !expectedPaperId
) {
  console.error(
    'Usage: node scripts/import-pipeline/build-docx-pair-canonical-request.mjs '
      + '<question.docx> <answers.docx> --output-dir <dir> '
      + '--expected-paper-id <paperId> '
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

const absoluteQuestionPath = path.resolve(questionPath)
const absoluteAnswersPath = path.resolve(answersPath)
const absoluteOutputDir = path.resolve(outputDir)
if (!existsSync(absoluteQuestionPath)) {
  throw new Error(`Format ③ question DOCX is missing: ${absoluteQuestionPath}`)
}
if (!existsSync(absoluteAnswersPath)) {
  throw new Error(`Format ③ answer DOCX is missing: ${absoluteAnswersPath}`)
}

const materialized = materializeDocxPairCanonicalRequest(
  new Uint8Array(readFileSync(absoluteQuestionPath)),
  new Uint8Array(readFileSync(absoluteAnswersPath)),
  {
    questionOriginalName: path.basename(absoluteQuestionPath),
    answersOriginalName: path.basename(absoluteAnswersPath),
    expectedPaperId,
  },
)
const outputs = new Map(materialized.outputs)
if (requestFileName !== DOCX_PAIR_REQUEST_FILE_NAME) {
  const requestBytes = outputs.get(DOCX_PAIR_REQUEST_FILE_NAME)
  outputs.delete(DOCX_PAIR_REQUEST_FILE_NAME)
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
    5,
    'DOCX pair request must load question, answers, identity, envelope, and Teacher Confirmation',
  )
  console.log(
    `WROTE ${materialized.paperId} DOCX-pair canonical request: ${requestPath}`,
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
    `PASS ${materialized.paperId} DOCX-pair canonical request is reproducible`,
  )
}
