#!/usr/bin/env node
// KEEP: tests the paper-import ENGINE (publisher/validator) contracts, not the
// retired C7 UI/routes. See ADR-0016. Do not delete when retiring import UI.
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

function baselineRef() {
  for (const candidate of ['github/main', 'origin/main', 'main']) {
    try {
      runGit(['rev-parse', '--verify', candidate])
      return candidate
    } catch {
      // Try the next shared-main spelling. GitHub Actions uses origin/main.
    }
  }
  throw new Error('No shared main ref found for forbidden-scope diff')
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
  'schemas/paper-import/paper-normalized-groups-v1.schema.json',
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

const nonReadingMissingAnswer = validatePaperImportPackage(
  mutateJsonFile(fixtureFiles, 'answer-key.json', (json) => {
    delete json.answers['q-2024-jslk-036']
  }),
)
assert('non Reading A-D missing answer-key is warning, not blocking', nonReadingMissingAnswer.ok)
assert(
  'non Reading A-D missing answer-key reports warning',
  warningCodes(nonReadingMissingAnswer).has('nonReading.answerKeyMissing'),
)

const nonReadingMissingQuestion = validatePaperImportPackage(
  mutateJsonFile(fixtureFiles, 'paper-asset.json', (json) => {
    json.content.groups['group-2024-jslk-seven-choices'].questionIds.push('q-2024-jslk-999')
  }),
)
assert('non Reading A-D missing question is warning, not blocking', nonReadingMissingQuestion.ok)
assert(
  'non Reading A-D missing question reports warning',
  warningCodes(nonReadingMissingQuestion).has('nonReading.questionMissing'),
)

const sevenChoicesMissingOption = validatePaperImportPackage(
  mutateJsonFile(fixtureFiles, 'paper-asset.json', (json) => {
    json.content.groups['group-2024-jslk-seven-choices'].optionBank.pop()
  }),
)
assert('seven-choices optionBank missing a label is blocking', !sevenChoicesMissingOption.ok)
assert(
  'seven-choices incomplete optionBank reports sevenChoices.optionBankIncomplete',
  codes(sevenChoicesMissingOption).has('sevenChoices.optionBankIncomplete'),
)

const sevenChoicesEmptyOptionText = validatePaperImportPackage(
  mutateJsonFile(fixtureFiles, 'paper-asset.json', (json) => {
    json.content.groups['group-2024-jslk-seven-choices'].optionBank[0].text = '  '
  }),
)
assert('seven-choices optionBank empty text is blocking', !sevenChoicesEmptyOptionText.ok)
assert(
  'seven-choices empty option text reports sevenChoices.optionBankIncomplete',
  codes(sevenChoicesEmptyOptionText).has('sevenChoices.optionBankIncomplete'),
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

const changedFiles = runGit(['diff', '--name-only', baselineRef()])
  .split('\n')
  .filter(Boolean)
const c7RelevantPrefixes = [
  'schemas/paper-import/',
  'server/paper-import/',
  'server/paper-import-ai/',
  'test-fixtures/paper-import/',
]
const paperNormalizationAllowedFiles = new Set([
  'app/src/shared-ui/papersurface/CanonicalPaperSentenceContent.tsx',
  'app/src/shared-ui/papersurface/PaperSurface.css',
  'app/src/shared-ui/papersurface/PaperSurface.tsx',
  'app/src/shared-ui/papersurface/legacyPaperBlankRenderer.tsx',
  'shared/papersurface/anchorKeys.d.mts',
  'shared/papersurface/anchorKeys.d.ts',
  'shared/papersurface/anchorKeys.mjs',
  'shared/papersurface/blankRuling.d.mts',
  'shared/papersurface/blankRuling.d.ts',
  'shared/papersurface/blankRuling.mjs',
  // Canonical whole-paper work uses these shared declaration/heading
  // companions without changing the C7 import schema or renderer ownership.
  'shared/papersurface/headingKind.mjs',
  'shared/papersurface/tokens.d.mts',
  'shared/papersurface/tokens.d.ts',
  'shared/papersurface/tokens.mjs',
  'shared/papersurface/types.d.ts',
  // paper-normalization Ticket 07: the proof-only Print HTML canonical
  // consumer is the approved Phase B export boundary.
  'server/print-renderer.mjs',
])
const forbiddenPrefixes = [
  'app/src/shared-ui/papersurface/',
  'shared/papersurface/',
  'app/src/features/reading-analysis/',
  // NOTE: app/src/domain/paperAsset.ts is intentionally NOT forbidden. Extending
  // the PaperWritingTask / paper-asset domain TYPE is normal import-cut work (e.g.
  // I7 added applicationGiven). The real contract boundary that import diffs must
  // not silently break is the SCHEMA (schemas/.../paper-asset-v1.schema.json),
  // which the validator + stripUnknownFields enforce separately.
  'server/print-renderer.mjs',
]
function findForbiddenScopeChanges(files) {
  return files.filter((file) =>
    forbiddenPrefixes.some((prefix) => file.startsWith(prefix))
    && !paperNormalizationAllowedFiles.has(file),
  )
}

assert(
  'scope guard accepts approved paper-normalization companion files',
  findForbiddenScopeChanges([
    'app/src/shared-ui/papersurface/CanonicalPaperSentenceContent.tsx',
    'server/print-renderer.mjs',
  ]).length === 0,
)
assert(
  'scope guard rejects unapproved PaperSurface changes',
  findForbiddenScopeChanges([
    'app/src/shared-ui/papersurface/UnrelatedFutureSurface.tsx',
  ]).length === 1,
)

const shouldCheckForbiddenScope = changedFiles.some((file) =>
  c7RelevantPrefixes.some((prefix) => file.startsWith(prefix)),
)
if (shouldCheckForbiddenScope) {
  const forbiddenScopeChanges = findForbiddenScopeChanges(changedFiles)
  assert(
    'forbidden scope untouched outside approved paper-normalization files',
    forbiddenScopeChanges.length === 0,
    forbiddenScopeChanges.join(', '),
  )
} else {
  assert('forbidden scope skipped for non-C7 diff', true)
}

if (failed > 0) {
  console.error(`\nC7 paper import contracts verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC7 paper import contracts verify PASSED: ${passed} passed, ${failed} failed`)
