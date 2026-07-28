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
const reviewedEvidenceDir = option('--reviewed-evidence-dir')
const write = process.argv.includes('--write')

if (
  !packageDir
  || packageDir.startsWith('--')
  || !outputDir
  || !answersPdfPath
  || !instructionEvidencePath
  || !reviewedEvidenceDir
) {
  console.error(
    'Usage: node scripts/import-pipeline/build-canonical-request.mjs '
      + '<package-dir> --answers-pdf <answers.pdf> '
      + '--instruction-evidence <reviewed.json> '
      + '--reviewed-evidence-dir <dir> '
      + '--output-dir <dir> [--write]',
  )
  process.exit(1)
}

const absolutePackageDir = path.resolve(packageDir)
const absoluteOutputDir = path.resolve(outputDir)
const absoluteReviewedEvidenceDir = path.resolve(reviewedEvidenceDir)
const requiredPaths = {
  paperAsset: path.join(absolutePackageDir, 'paper-asset.json'),
  answerKey: path.join(absolutePackageDir, 'answer-key.json'),
  sourcePdf: path.join(absolutePackageDir, 'paper.pdf'),
  answersPdf: path.resolve(answersPdfPath),
  instructionEvidence: path.resolve(instructionEvidencePath),
  sourceProvenance: path.join(absolutePackageDir, 'import-meta.json'),
  readingSourceCapture: path.join(
    absoluteReviewedEvidenceDir,
    'reading-source-capture-v1.json',
  ),
  tableVisualProof: path.join(
    absoluteReviewedEvidenceDir,
    'reading-a-table-1.png',
  ),
  applicationWritingCapture: path.join(
    absoluteReviewedEvidenceDir,
    'application-writing-source-capture.json',
  ),
  applicationWritingTranscription: path.join(
    absoluteReviewedEvidenceDir,
    'application-writing-source-transcription.json',
  ),
  continuationWritingCapture: path.join(
    absoluteReviewedEvidenceDir,
    'continuation-writing-source-capture.json',
  ),
  continuationWritingTranscription: path.join(
    absoluteReviewedEvidenceDir,
    'continuation-writing-source-transcription.json',
  ),
  listeningQuestions: path.join(
    absoluteReviewedEvidenceDir,
    'listening-questions.json',
  ),
  listeningAnswers: path.join(
    absoluteReviewedEvidenceDir,
    'listening-answers.json',
  ),
  listeningTranscript: path.join(
    absoluteReviewedEvidenceDir,
    'listening-transcript.json',
  ),
  listeningInventory: path.join(
    absoluteReviewedEvidenceDir,
    'listening-source-inventory.json',
  ),
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
  sourceProvenanceBytes: readFileSync(requiredPaths.sourceProvenance),
  readingSourceCaptureBytes: readFileSync(requiredPaths.readingSourceCapture),
  tableVisualProofBytes: readFileSync(requiredPaths.tableVisualProof),
  applicationWritingCaptureBytes: readFileSync(
    requiredPaths.applicationWritingCapture,
  ),
  applicationWritingTranscriptionBytes: readFileSync(
    requiredPaths.applicationWritingTranscription,
  ),
  continuationWritingCaptureBytes: readFileSync(
    requiredPaths.continuationWritingCapture,
  ),
  continuationWritingTranscriptionBytes: readFileSync(
    requiredPaths.continuationWritingTranscription,
  ),
  listeningQuestionsBytes: readFileSync(requiredPaths.listeningQuestions),
  listeningAnswersBytes: readFileSync(requiredPaths.listeningAnswers),
  listeningTranscriptBytes: readFileSync(requiredPaths.listeningTranscript),
  listeningInventoryBytes: readFileSync(requiredPaths.listeningInventory),
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
  ['canonical_source_envelope', '01-canonical-source-envelope.json'],
  ['original_question_source', '02-original-question-source.pdf'],
  [
    'continuation_writing_instruction_evidence',
    '03-continuation_writing_instruction_evidence.json',
  ],
  ['paper_asset', '04-paper_asset.json'],
  ['official_answers', '05-official_answers.json'],
  ['listening_answer_source', '06-source_answers_pdf.pdf'],
  ['reading_structure', '07-reading-source-capture.json'],
  ['table_visual_proof', '08-reading-a-table-1.png'],
  ['source_provenance', '09-source-provenance.json'],
  ['application_writing_capture', '10-application-writing-capture.json'],
  [
    'application_writing_transcription',
    '11-application-writing-transcription.json',
  ],
  ['continuation_writing_capture', '12-continuation-writing-capture.json'],
  [
    'continuation_writing_transcription',
    '13-continuation-writing-transcription.json',
  ],
  ['listening_questions', '14-listening-questions.json'],
  ['listening_answers', '15-listening-answers.json'],
  ['listening_transcript', '16-listening-transcript.json'],
  ['listening_inventory', '17-listening-source-inventory.json'],
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
