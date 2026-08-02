#!/usr/bin/env node

/**
 * Ticket 25: compile one NCK1 paper from its immutable DOCX source through
 * the generic source-adapter seam. This is deliberately zero-write except for
 * the checked-in deterministic evidence record created by --write-evidence.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalAuthorityRef, compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import {
  buildDocxCanonicalImportRequest,
  DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
} from '../server/paper-canonical/docxSourceAdapter.mjs'
import {
  makeReadyCanonicalFixture,
} from '../test-fixtures/paper-canonical/foundationFixture.mjs'
import {
  makePaper2025IDocxSourceProof,
} from '../test-fixtures/paper-import/paper-2025-i-docx-source-adapter/sourceProof.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PAPER_ID = 'paper-2025-i'
const SOURCE_REL =
  'test-fixtures/paper-import/paper-2025-i-docx-source-adapter/2025-nck1-answer-source.docx'
const SOURCE_PROOF_REL =
  'test-fixtures/paper-import/paper-2025-i-docx-source-adapter/sourceProof.mjs'
const EVIDENCE_REL =
  'docs/cuts/paper-canonical-unification/migration/paper-2025-i-docx-source-adapter-v1.json'
const DRY_RUN_REL =
  'docs/cuts/paper-canonical-unification/migration/full-corpus-zero-write-dry-run-v1.json'
const PROTECTED_ROOTS = Object.freeze([
  'app/public/paper-assets',
  'data/question-bank.sqlite',
  'scripts/import-pipeline/papers',
  'docs/cuts/paper-canonical-unification/migration/ledger-v1.json',
  'docs/cuts/paper-canonical-unification/migration/manifest-v1.json',
])
const EXPECTED_SOURCE = Object.freeze({
  byteLength: 135250,
  sha256: '33a93bfa4af0ebab48ae7aaef036a44b7004fff6ea2b90f2814ed12dee01b047',
})
const EXPECTED_FAMILIES = Object.freeze({
  reading: 4,
  'seven-choices': 1,
  cloze: 1,
  'grammar-fill': 1,
  'application-writing': 1,
  'continuation-writing': 1,
})

function abs(relativePath) {
  return path.join(ROOT, relativePath)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(abs(relativePath), 'utf8'))
}

function walkFiles(relativePath) {
  const target = abs(relativePath)
  if (!existsSync(target)) return []
  const stat = statSync(target)
  if (stat.isFile()) return [{ relativePath, bytes: readFileSync(target) }]
  assert.equal(stat.isDirectory(), true, `${relativePath} must be a file or directory`)
  const files = []
  function visit(currentRelativePath) {
    for (const entry of readdirSync(abs(currentRelativePath), { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const nextRelativePath = path.posix.join(currentRelativePath, entry.name)
      assert.equal(entry.isSymbolicLink(), false, `${nextRelativePath} must not be a symlink`)
      if (entry.isDirectory()) visit(nextRelativePath)
      else if (entry.isFile()) files.push({
        relativePath: nextRelativePath,
        bytes: readFileSync(abs(nextRelativePath)),
      })
      else throw new Error(`unsupported protected entry: ${nextRelativePath}`)
    }
  }
  visit(relativePath)
  return files
}

function protectedState() {
  const files = PROTECTED_ROOTS.flatMap(walkFiles)
    .map(({ relativePath, bytes }) => ({
      path: relativePath,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
  return {
    paths: [...PROTECTED_ROOTS],
    fileCount: files.length,
    digest: digestJson(files),
  }
}

function diagnostics(result) {
  return result.artifacts.normalizationReport.diagnostics
}

function assertDiagnostic(result, code) {
  assert.ok(
    diagnostics(result).some((diagnostic) => diagnostic.code === code),
    `expected ${code}; got ${diagnostics(result).map((diagnostic) => diagnostic.code).join(', ')}`,
  )
}

function mutateEnvelope(request, mutate) {
  const candidate = structuredClone(request)
  const document = candidate.evidence.documents.find(
    (item) => item.declared.mediaType === DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
  )
  assert.ok(document, 'DOCX request must contain one source envelope')
  const envelope = JSON.parse(new TextDecoder().decode(document.bytes))
  mutate(envelope)
  document.bytes = new TextEncoder().encode(JSON.stringify(envelope))
  return candidate
}

function baseline() {
  const run = readJson(DRY_RUN_REL).runs.find(
    (candidate) => candidate.paperId === PAPER_ID,
  )
  assert.ok(run, 'Ticket 22 baseline must retain paper-2025-i')
  assert.equal(run.measuredCost.inspectionWorkUnits, 67)
  assert.equal(run.measuredCost.components.immutableDocumentCount, 8)
  assert.equal(run.measuredCost.components.immutableEvidenceByteLength, 277857)
  assert.equal(run.measuredRisk.riskPoints, 17)
  return run
}

function measure({ request, compilation, baselineRun }) {
  const sourceDocuments = compilation.artifacts.sourceCapture.documents
  const documentByteLength = sourceDocuments.reduce(
    (total, document) => total + document.byteLength,
    0,
  )
  const diagnosticCodes = [...new Set(diagnostics(compilation).map(
    (diagnostic) => diagnostic.code,
  ))].sort()
  const floorIncrement = 4 + Math.ceil(EXPECTED_SOURCE.byteLength / 16384)
  const floor = baselineRun.measuredCost.inspectionWorkUnits + floorIncrement
  assert.equal(floor, 80, 'Ticket 25 capacity floor must preserve B67 + raw-DOCX increment')
  const actualUnits = sourceDocuments.length * 4
    + Math.ceil(documentByteLength / 16384)
    + diagnostics(compilation).length * 8
  const inactiveClosureUnclassified = diagnosticCodes.includes(
    'DOCX_LISTENING_SOURCE_INCOMPLETE',
  )
  const riskPoints = inactiveClosureUnclassified ? 8 : 0
  return {
    baseline: {
      inspectionWorkUnits: baselineRun.measuredCost.inspectionWorkUnits,
      immutableDocumentCount: baselineRun.measuredCost.components.immutableDocumentCount,
      immutableEvidenceByteLength: baselineRun.measuredCost.components.immutableEvidenceByteLength,
      riskPoints: baselineRun.measuredRisk.riskPoints,
    },
    floor: {
      formula: 'B + 4 per digest-verified raw DOCX + ceil(raw DOCX bytes / 16384)',
      rawDocxByteLength: EXPECTED_SOURCE.byteLength,
      incrementWorkUnits: floorIncrement,
      inspectionWorkUnits: floor,
      status: 'floor_not_complete_envelope_estimate',
    },
    actual: {
      model: 'ticket-25-docx-source-adapter-inspection-units-v1',
      sourceDocumentCount: sourceDocuments.length,
      sourceDocumentByteLength: documentByteLength,
      diagnosticCount: diagnostics(compilation).length,
      diagnosticCodes,
      inspectionWorkUnits: actualUnits,
      risk: {
        model: 'ticket-25-source-adapter-risk-points-v1',
        sourceAdapterUnavailable: false,
        profileUnproven: false,
        inactiveClosureUnclassified,
        diagnosticCodeCount: diagnosticCodes.length,
        riskPoints,
        band: riskPoints === 0 ? 'low' : 'medium',
      },
    },
    requestDocumentKeys: request.evidence.documents.map((document) => document.inputKey),
  }
}

const before = protectedState()
const docxBytes = readFileSync(abs(SOURCE_REL))
assert.equal(docxBytes.byteLength, EXPECTED_SOURCE.byteLength)
assert.equal(sha256(docxBytes), EXPECTED_SOURCE.sha256)

const proof = makePaper2025IDocxSourceProof(docxBytes)
assert.deepEqual(proof.familyCounts, EXPECTED_FAMILIES)
assert.equal(proof.officialAnswerCount, 45)
assert.equal(proof.inactiveListening.questions.length, 20)
assert.deepEqual(
  proof.inactiveListening.questions.map((question) => question.questionNo),
  Array.from({ length: 20 }, (_, index) => index + 1),
)
assert.equal(
  proof.inactiveListening.questions.every((question) =>
    Object.keys(question.options).join('') === 'ABC'
    && Object.hasOwn(question.options, question.answer)),
  true,
)
assert.deepEqual(proof.inactiveListening.transcript, {
  expectedSegmentCount: 10,
  segmentIds: [],
  segments: [],
  coverage: 'incomplete_source',
})
assert.deepEqual(proof.inactiveListening.timing, { disposition: 'not_supplied' })
assert.deepEqual(proof.inactiveListening.audio, {
  disposition: 'not_supplied',
  packageEntries: [],
})

const request = buildDocxCanonicalImportRequest({
  docxBytes,
  source: proof.source,
  originalName: '2025-nck1-answer-source.docx',
})
assert.deepEqual(request.authority, canonicalAuthorityRef)
assert.deepEqual(
  request.evidence.documents.map((document) => document.inputKey),
  ['source_docx', 'docx_source_envelope'],
)
assert.equal(
  request.evidence.documents.some((document) =>
    document.declared.mediaType === 'application/vnd.eqb.canonical-fixture+json'
    || document.inputKey === 'paper_asset'
    || document.inputKey === 'official_answers'),
  false,
  'the DOCX path must not include a legacy projection fallback',
)

const first = compileCanonicalPaper(request)
const second = compileCanonicalPaper(request)
assert.equal(first.disposition, 'incomplete_source')
assert.equal(digestJson(first), digestJson(second), 'DOCX compilation must be deterministic')
assert.equal(first.artifacts.sourceCapture.assertions.length, 45)
assertDiagnostic(first, 'DOCX_LISTENING_SOURCE_INCOMPLETE')
assert.equal(Object.hasOwn(first.artifacts, 'canonicalPaper'), false)
assert.deepEqual(first.artifacts.normalizationReport.inactiveSourceClosures, [])

const missingDocument = structuredClone(request)
missingDocument.evidence.documents = missingDocument.evidence.documents.filter(
  (document) => document.inputKey !== 'source_docx',
)
const missingResult = compileCanonicalPaper(missingDocument)
assert.notEqual(missingResult.disposition, 'ready')
assertDiagnostic(missingResult, 'DOCX_SOURCE_DOCUMENT_MISSING')

const driftedDocument = structuredClone(request)
const rawDocument = driftedDocument.evidence.documents.find(
  (document) => document.inputKey === 'source_docx',
)
rawDocument.bytes = new Uint8Array([...rawDocument.bytes, 0])
const driftedResult = compileCanonicalPaper(driftedDocument)
assert.notEqual(driftedResult.disposition, 'ready')
assertDiagnostic(driftedResult, 'DOCX_SOURCE_DIGEST_MISMATCH')

const forgedEnvelopeSemantics = mutateEnvelope(request, (envelope) => {
  const reading = envelope.source.groups.find((group) => group.slotId === 'reading.a')
  const text = reading?.content?.blocks?.[0]?.inlines?.find(
    (inline) => inline.kind === 'text',
  )
  assert.ok(text, 'paper-2025-i source proof must expose one Reading A text node')
  text.text = 'SYNCHRONIZED FORGERY NOT PRESENT IN THE IMMUTABLE DOCX'
})
const forgedEnvelopeResult = compileCanonicalPaper(forgedEnvelopeSemantics)
assert.notEqual(
  forgedEnvelopeResult.disposition,
  'ready',
  'caller-authored envelope semantics must not override the immutable DOCX',
)
assertDiagnostic(forgedEnvelopeResult, 'DOCX_SOURCE_DERIVATION_MISMATCH')

const nonDocxBytes = new Uint8Array([0x00])
const nonDocxSource = structuredClone(proof.source)
nonDocxSource.profileInstructionSourceDigest = sha256(nonDocxBytes)
for (const observation of nonDocxSource.observations) {
  observation.span = { start: 0, end: nonDocxBytes.byteLength }
}
const synchronizedNonDocx = buildDocxCanonicalImportRequest({
  docxBytes: nonDocxBytes,
  source: nonDocxSource,
  originalName: 'forged.docx',
})
const synchronizedNonDocxResult = compileCanonicalPaper(synchronizedNonDocx)
assert.notEqual(
  synchronizedNonDocxResult.disposition,
  'ready',
  'declared DOCX media type and synchronized envelope metadata cannot admit arbitrary bytes',
)
assertDiagnostic(synchronizedNonDocxResult, 'DOCX_SOURCE_DOCUMENT_INVALID')

const malformedWithLegacyFixture = structuredClone(request)
const malformedEnvelope = malformedWithLegacyFixture.evidence.documents.find(
  (document) => document.inputKey === 'docx_source_envelope',
)
malformedEnvelope.bytes = new TextEncoder().encode('{}')
malformedWithLegacyFixture.evidence.documents.push(
  structuredClone(makeReadyCanonicalFixture().request.evidence.documents[0]),
)
const malformedResult = compileCanonicalPaper(malformedWithLegacyFixture)
assert.notEqual(malformedResult.disposition, 'ready')
assertDiagnostic(malformedResult, 'DOCX_SOURCE_ENVELOPE_INVALID')

const unknownDiagnosticShape = mutateEnvelope(request, (envelope) => {
  envelope.unexpectedDiagnosticShape = true
})
const shapeResult = compileCanonicalPaper(unknownDiagnosticShape)
assert.notEqual(shapeResult.disposition, 'ready')
assertDiagnostic(shapeResult, 'DOCX_SOURCE_ENVELOPE_INVALID')

const unprovedProfile = mutateEnvelope(request, (envelope) => {
  envelope.source.profileId = 'unproved-profile'
})
const profileResult = compileCanonicalPaper(unprovedProfile)
assert.notEqual(profileResult.disposition, 'ready')
assertDiagnostic(profileResult, 'DOCX_SOURCE_DERIVATION_MISMATCH')

const unboundProfileDigest = mutateEnvelope(request, (envelope) => {
  envelope.source.profileInstructionSourceDigest = 'forged-profile-digest'
})
const profileDigestResult = compileCanonicalPaper(unboundProfileDigest)
assert.notEqual(profileDigestResult.disposition, 'ready')
assertDiagnostic(profileDigestResult, 'DOCX_SOURCE_PROFILE_UNBOUND')

const conflictingAnswer = mutateEnvelope(request, (envelope) => {
  const original = envelope.source.assertions[0]
  envelope.source.assertions.push({
    ...original,
    assertionId: 'forged-docx-answer-conflict',
    answer: original.answer === 'A' ? 'B' : 'A',
  })
})
const answerResult = compileCanonicalPaper(conflictingAnswer)
assert.equal(answerResult.disposition, 'incomplete_source')
assertDiagnostic(answerResult, 'DOCX_SOURCE_DERIVATION_MISMATCH')

const baselineRun = baseline()
const after = protectedState()
assert.deepEqual(after, before, 'Ticket 25 compiler proof must not mutate frozen corpus state')
const measurement = measure({ request, compilation: first, baselineRun })

const evidence = {
  schemaVersion: 'paper-canonical-docx-source-adapter-proof-v1',
  ticket: '25-generic-docx-source-adapter-seam-and-nck1-proof',
  binding: {
    authority: canonicalAuthorityRef,
    source: {
      paperId: PAPER_ID,
      path: SOURCE_REL,
      byteLength: EXPECTED_SOURCE.byteLength,
      sha256: EXPECTED_SOURCE.sha256,
      rawTextDigest: proof.rawTextDigest,
    },
    producer: [
      'server/paper-canonical/docxSourceAdapter.mjs',
      SOURCE_PROOF_REL,
      'shared/paper-canonical/compiler.mjs',
    ].map((relativePath) => ({
      path: relativePath,
      sha256: sha256(readFileSync(abs(relativePath))),
    })),
  },
  failClosed: {
    disposition: first.disposition,
    profileId: proof.source.profileId,
    derivedFamilyCounts: proof.familyCounts,
    officialAnswerCount: first.artifacts.sourceCapture.assertions.length,
    inactiveListeningSourceProof: proof.inactiveListening,
    inactiveSlots: first.artifacts.normalizationReport.inactiveSourceClosures,
    diagnosticCodes: diagnostics(first).map((diagnostic) => diagnostic.code),
    compilationDigest: digestJson(first),
  },
  capacity: measurement,
  zeroMutation: {
    mutationCount: 0,
    protectedStateBefore: before,
    protectedStateAfter: after,
    writesPerformedByProof: [],
  },
}

if (process.argv.includes('--write-evidence')) {
  writeFileSync(abs(EVIDENCE_REL), `${JSON.stringify(evidence, null, 2)}\n`)
} else {
  assert.equal(existsSync(abs(EVIDENCE_REL)), true, `${EVIDENCE_REL} must be checked in`)
  assert.deepEqual(readJson(EVIDENCE_REL), evidence, 'Ticket 25 evidence must be reproducible')
}

console.log('paper canonical DOCX source-adapter proof: OK')
