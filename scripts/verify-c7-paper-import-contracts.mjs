#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  makePublicValidationReport,
  readImportPackageFromDirectory,
  validatePaperImportPackage,
} from '../server/paper-import/validator.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const fixtureDir = path.join(rootDir, 'test-fixtures/paper-import/paper-2024-jslk-english')

let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function cloneFiles(files) {
  return files.map((file) => ({
    fileName: file.fileName,
    contentType: file.contentType,
    buffer: Buffer.from(file.buffer),
  }))
}

function mutateJsonFile(files, fileName, mutator) {
  const next = cloneFiles(files)
  const file = next.find((candidate) => candidate.fileName === fileName)
  if (!file) throw new Error(`Missing fixture file ${fileName}`)
  const json = JSON.parse(file.buffer.toString('utf8'))
  mutator(json)
  file.buffer = Buffer.from(`${JSON.stringify(json, null, 2)}\n`)
  return next
}

function codes(report) {
  return new Set(report.blockingIssues.map((item) => item.code))
}

function warningCodes(report) {
  return new Set(report.warnings.map((item) => item.code))
}

console.log('C7 verify: paper import contracts and offline validator')

const schemaFiles = [
  'schemas/paper-import/paper-asset-v1.schema.json',
  'schemas/paper-import/answer-key-v1.schema.json',
  'schemas/paper-import/import-meta-v1.schema.json',
  'schemas/paper-import/reading-choice-analysis-v1.schema.json',
]

for (const relPath of schemaFiles) {
  assert(`schema exists: ${relPath}`, existsSync(path.join(rootDir, relPath)))
}

const fixtureFiles = readImportPackageFromDirectory(fixtureDir)
assert('fixture contains DOCX', fixtureFiles.some((file) => file.fileName.endsWith('.docx')))
assert('fixture contains paper-asset.json', fixtureFiles.some((file) => file.fileName === 'paper-asset.json'))
assert('fixture contains answer-key.json', fixtureFiles.some((file) => file.fileName === 'answer-key.json'))
assert('fixture contains import-meta.json', fixtureFiles.some((file) => file.fileName === 'import-meta.json'))
assert(
  'fixture contains reviewed reading analysis',
  fixtureFiles.some((file) => file.fileName === 'reading-choice-analysis-v1.json'),
)

const validReport = validatePaperImportPackage(fixtureFiles, { now: '2026-05-22T00:00:00.000Z' })
assert('valid fixture passes', validReport.ok, JSON.stringify(makePublicValidationReport(validReport), null, 2))
assert('valid fixture has no blocking issues', validReport.blockingIssues.length === 0)
assert('valid fixture reports four Reading A-D groups', validReport.readingGroups.length === 4)
assert(
  'valid fixture normalizes paper status to published',
  validReport.packageData?.paperAsset?.paper?.status === 'published',
)
assert(
  'valid fixture produces merged reading-choice-analysis-v1',
  validReport.packageData?.readingAnalysis?.schemaVersion === 'reading-choice-analysis-v1',
)

const missingAnalysis = validatePaperImportPackage(
  fixtureFiles.filter((file) => file.fileName !== 'reading-choice-analysis-v1.json'),
)
assert('missing analysis is blocking', !missingAnalysis.ok)
assert('missing analysis reports package.analysisMissing', codes(missingAnalysis).has('package.analysisMissing'))

const answerMismatch = validatePaperImportPackage(
  mutateJsonFile(fixtureFiles, 'answer-key.json', (json) => {
    json.answers['q-2024-jslk-021'].answer = 'B'
  }),
)
assert('answer-key mismatch is blocking', !answerMismatch.ok)
assert('answer-key mismatch reports analysis.answerMismatch', codes(answerMismatch).has('analysis.answerMismatch'))

const unresolvedQuote = validatePaperImportPackage(
  mutateJsonFile(fixtureFiles, 'reading-choice-analysis-v1.json', (json) => {
    json.questions['q-2024-jslk-021'].optionAnalysis.find((option) => option.status === 'correct').evidence[0].quote =
      'This quote is not present in the passage.'
  }),
)
assert('unresolved Reading A-D quote is blocking', !unresolvedQuote.ok)
assert('unresolved quote reports analysis.unresolvedQuote', codes(unresolvedQuote).has('analysis.unresolvedQuote'))

const unknownParagraph = validatePaperImportPackage(
  mutateJsonFile(fixtureFiles, 'reading-choice-analysis-v1.json', (json) => {
    json.questions['q-2024-jslk-021'].optionAnalysis.find((option) => option.status === 'correct').evidence[0].paragraphId =
      'para-not-real'
  }),
)
assert('unknown paragraphId is blocking', !unknownParagraph.ok)
assert('unknown paragraph reports analysis.unknownParagraphId', codes(unknownParagraph).has('analysis.unknownParagraphId'))

const unsupportedEvidence = validatePaperImportPackage(
  mutateJsonFile(fixtureFiles, 'reading-choice-analysis-v1.json', (json) => {
    const wrong = json.questions['q-2024-jslk-021'].optionAnalysis.find(
      (option) => option.trap?.primaryType === 'unsupportedClaim',
    )
    wrong.trapEvidence = [
      {
        paragraphId: 'para-2024-jslk-reading-a-p1',
        quote: 'A first-of-its-kind exhibition',
      },
    ]
  }),
)
assert('unsupportedClaim evidence is warning, not blocking', unsupportedEvidence.ok)
assert(
  'unsupportedClaim evidence reports stripped warning',
  warningCodes(unsupportedEvidence).has('analysis.unsupportedClaimEvidenceStripped'),
)

const unknownField = validatePaperImportPackage(
  mutateJsonFile(fixtureFiles, 'answer-key.json', (json) => {
    json.extraGeneratedNote = 'AI added this, importer should strip it.'
  }),
)
assert('unknown fields are warning, not blocking', unknownField.ok)
assert('unknown fields report stripped warning', warningCodes(unknownField).has('json.unknownFieldStripped'))
assert(
  'unknown fields are removed from normalized package',
  !Object.prototype.hasOwnProperty.call(unknownField.packageData?.answerKey || {}, 'extraGeneratedNote'),
)

const arrayJson = validatePaperImportPackage([
  ...fixtureFiles.filter((file) => file.fileName !== 'answer-key.json'),
  { fileName: 'answer-key.json', buffer: Buffer.from('[]\n') },
])
assert('top-level JSON array is blocking', !arrayJson.ok)
assert('top-level JSON array reports json.parseFailed', codes(arrayJson).has('json.parseFailed'))

const codeFenceJson = validatePaperImportPackage([
  ...fixtureFiles.filter((file) => file.fileName !== 'answer-key.json'),
  { fileName: 'answer-key.json', buffer: Buffer.from('```json\n{}\n```\n') },
])
assert('code-fenced JSON is blocking', !codeFenceJson.ok)
assert('code-fenced JSON reports json.parseFailed', codes(codeFenceJson).has('json.parseFailed'))

const changedFiles = runGit(['diff', '--name-only', 'github/main'])
  .split('\n')
  .filter(Boolean)
const forbiddenPrefixes = [
  'app/src/shared-ui/papersurface/',
  'shared/papersurface/',
  'app/src/features/reading-analysis/',
  'app/src/domain/paperAsset.ts',
  'server/print-renderer.mjs',
]
for (const prefix of forbiddenPrefixes) {
  assert(`forbidden scope untouched so far: ${prefix}`, !changedFiles.some((file) => file.startsWith(prefix)))
}

if (failed > 0) {
  console.error(`\nC7 paper import contracts verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC7 paper import contracts verify PASSED: ${passed} passed, ${failed} failed`)
