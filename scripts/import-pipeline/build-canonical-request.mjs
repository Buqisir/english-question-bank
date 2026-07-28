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
  buildNck1CanonicalImportRequest,
} from '../../server/paper-canonical/nck1SourceAdapter.mjs'
import {
  compileCanonicalPaper,
} from '../../shared/paper-canonical/compiler.mjs'

function option(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

const packageDir = process.argv[2]
const outputDir = option('--output-dir')
const answersPdfPath = option('--answers-pdf')
const instructionEvidencePath = option('--instruction-evidence')
const write = process.argv.includes('--write')

if (
  !packageDir
  || packageDir.startsWith('--')
  || !outputDir
  || !answersPdfPath
  || !instructionEvidencePath
) {
  console.error(
    'Usage: node scripts/import-pipeline/build-canonical-request.mjs '
      + '<package-dir> --answers-pdf <answers.pdf> '
      + '--instruction-evidence <reviewed.json> --output-dir <dir> [--write]',
  )
  process.exit(1)
}

const absolutePackageDir = path.resolve(packageDir)
const absoluteOutputDir = path.resolve(outputDir)
const requiredPaths = {
  paperAsset: path.join(absolutePackageDir, 'paper-asset.json'),
  answerKey: path.join(absolutePackageDir, 'answer-key.json'),
  sourcePdf: path.join(absolutePackageDir, 'paper.pdf'),
  answersPdf: path.resolve(answersPdfPath),
  instructionEvidence: path.resolve(instructionEvidencePath),
}
for (const [label, filePath] of Object.entries(requiredPaths)) {
  if (!existsSync(filePath)) {
    throw new Error(`Canonical request input ${label} is missing: ${filePath}`)
  }
}

const paperAssetBytes = readFileSync(requiredPaths.paperAsset)
const answerKeyBytes = readFileSync(requiredPaths.answerKey)
const paperAsset = JSON.parse(paperAssetBytes)
const paperId = paperAsset.paper?.paperId
assert.equal(typeof paperId, 'string', 'paper-asset.json requires paper.paperId')

const request = buildNck1CanonicalImportRequest({
  paperId,
  paperAssetBytes,
  answerKeyBytes,
  sourcePdfBytes: readFileSync(requiredPaths.sourcePdf),
  answersPdfBytes: readFileSync(requiredPaths.answersPdf),
  instructionEvidenceBytes: readFileSync(requiredPaths.instructionEvidence),
})
const compilation = compileCanonicalPaper(request)
if (compilation.disposition !== 'ready') {
  console.error(JSON.stringify(
    compilation.artifacts.normalizationReport.diagnostics,
    null,
    2,
  ))
  throw new Error(
    `Canonical request compilation is ${compilation.disposition}`,
  )
}

const fileNames = new Map([
  ['questions', '01-questions.json'],
  ['profile_instruction_source', '02-profile_instruction_source.pdf'],
  [
    'continuation_writing_instruction_evidence',
    '03-continuation_writing_instruction_evidence.json',
  ],
  ['paper_asset', '04-paper_asset.json'],
  ['official_answers', '05-official_answers.json'],
  ['source_answers_pdf', '06-source_answers_pdf.pdf'],
])
const envelope = {
  authority: request.authority,
  evidence: {
    documents: request.evidence.documents.map((document) => {
      const fileName = fileNames.get(document.inputKey)
      if (!fileName) {
        throw new Error(
          `Canonical request producer has no stable path for ${document.inputKey}`,
        )
      }
      const { bytes: _bytes, ...descriptor } = document
      return { ...descriptor, path: fileName }
    }),
  },
}
const outputs = new Map(
  request.evidence.documents.map((document) => [
    fileNames.get(document.inputKey),
    Buffer.from(document.bytes),
  ]),
)
outputs.set(
  'canonical-import-request.json',
  Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`),
)

if (write) {
  mkdirSync(absoluteOutputDir, { recursive: true })
  for (const [fileName, bytes] of outputs) {
    writeFileSync(path.join(absoluteOutputDir, fileName), bytes)
  }
  console.log(
    `WROTE ${paperId} canonical request: `
      + path.join(absoluteOutputDir, 'canonical-import-request.json'),
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
  console.log(`PASS ${paperId} canonical request is reproducible`)
}
