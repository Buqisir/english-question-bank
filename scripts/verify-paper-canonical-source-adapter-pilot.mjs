#!/usr/bin/env node

/**
 * Ticket 24: replay the one approved immutable-source-adapter candidate
 * without publishing, migrating, or changing any frozen corpus byte.
 *
 * The Ticket 22 dry run intentionally supplied only the frozen latest tree
 * and therefore measured SOURCE_ADAPTER_UNSUPPORTED. This verifier binds the
 * separately reviewed, registered envelope to those frozen historical bytes,
 * measures the full source-evidence cost with the same deterministic model,
 * and makes an over-capacity result a verified fail-closed outcome.
 */

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
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

import { resolveCanonicalAuthority } from '../shared/paper-canonical/authority.mjs'
import {
  canonicalAuthorityRef,
  compileCanonicalPaper,
} from '../shared/paper-canonical/compiler.mjs'
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const EXPECTED_BRANCH = 'codex/paper-canonical-unification-20260725'
const TICKET_FIXED_POINT = '46c3a1717c1fa3b9496b8dc63a04f07dba923c84'
const PAPER_ID = 'paper-2026-i'
const DRY_RUN_REL = 'docs/cuts/paper-canonical-unification/migration/full-corpus-zero-write-dry-run-v1.json'
const REQUEST_REL = 'test-fixtures/paper-import/paper-2026-i-canonical-pilot/canonical-evidence/canonical-import-request-v35.json'
const EVIDENCE_REL = 'docs/cuts/paper-canonical-unification/migration/paper-2026-i-source-adapter-pilot-v1.json'
const IMMUTABLE_ROOTS = Object.freeze([
  'app/public/paper-assets',
  'data/question-bank.sqlite',
  'scripts/import-pipeline/papers',
  'standards/paper-canonical',
  'shared/paper-canonical',
  'test-fixtures/paper-canonical/evidence',
  'test-fixtures/paper-import/paper-2026-i-canonical-pilot',
  DRY_RUN_REL,
  'docs/cuts/paper-canonical-unification/migration/ledger-v1.json',
  'docs/cuts/paper-canonical-unification/migration/manifest-v1.json',
])
const EXPECTED_FAMILY_COUNTS = Object.freeze({
  'application-writing': 1,
  cloze: 1,
  'continuation-writing': 1,
  'grammar-fill': 1,
  reading: 4,
  'seven-choices': 1,
})
const CAPACITY = Object.freeze({
  paperCount: 1,
  inspectionWorkUnits: 88,
  riskPoints: 17,
  maxDiagnosticClusterPapers: 5,
  maxDiagnosticClusterUnits: 328,
})

function abs(rel) {
  return path.join(ROOT, rel)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]))
  }
  return value
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

function digestJson(value) {
  return `sha256:${sha256(stableStringify(value))}`
}

function withoutKey(value, key) {
  const copy = { ...value }
  delete copy[key]
  return copy
}

function readJson(rel) {
  return JSON.parse(readFileSync(abs(rel), 'utf8'))
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function assertPreflight() {
  assert.equal(
    git(['branch', '--show-current']),
    EXPECTED_BRANCH,
    'Ticket 24 must run from its declared worktree branch',
  )
  git(['merge-base', '--is-ancestor', TICKET_FIXED_POINT, 'HEAD'])
  const diff = spawnSync(
    'git',
    ['diff', '--quiet', TICKET_FIXED_POINT, '--', ...IMMUTABLE_ROOTS],
    { cwd: ROOT, stdio: 'ignore' },
  )
  assert.equal(
    diff.status,
    0,
    'Ticket 24 may not change frozen corpus, historical source, authority, or publication inputs',
  )
}

function walkFiles(rel) {
  const target = abs(rel)
  if (!existsSync(target)) return []
  const stat = statSync(target)
  if (stat.isFile()) return [{ rel, bytes: readFileSync(target) }]
  if (!stat.isDirectory()) throw new Error(`unsupported immutable input: ${rel}`)
  const files = []
  function visit(currentRel) {
    for (const entry of readdirSync(abs(currentRel), { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const nextRel = path.posix.join(currentRel, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`symlink is not immutable evidence: ${nextRel}`)
      if (entry.isDirectory()) visit(nextRel)
      else if (entry.isFile()) files.push({ rel: nextRel, bytes: readFileSync(abs(nextRel)) })
      else throw new Error(`unsupported immutable entry: ${nextRel}`)
    }
  }
  visit(rel)
  return files
}

function immutableState() {
  const files = IMMUTABLE_ROOTS.flatMap(walkFiles)
    .map(({ rel, bytes }) => ({
      path: rel,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
  return {
    paths: IMMUTABLE_ROOTS,
    fileCount: files.length,
    digest: digestJson(files),
  }
}

function assertMatchingBytes(leftRel, rightRel, label) {
  const left = readFileSync(abs(leftRel))
  const right = readFileSync(abs(rightRel))
  assert.equal(
    sha256(left),
    sha256(right),
    `${label} must bind byte-identical immutable evidence`,
  )
  return {
    leftPath: leftRel,
    rightPath: rightRel,
    byteLength: left.byteLength,
    sha256: sha256(left),
  }
}

function ticket22Baseline() {
  const dryRun = readJson(DRY_RUN_REL)
  const run = dryRun.runs.find((candidate) => candidate.paperId === PAPER_ID)
  assert.ok(run, 'Ticket 22 evidence must retain paper-2026-i')
  assert.equal(run.disposition, 'unsupported', 'Ticket 22 baseline must remain unsupported')
  assert.equal(run.measuredCost.inspectionWorkUnits, CAPACITY.inspectionWorkUnits)
  assert.equal(run.measuredRisk.riskPoints, CAPACITY.riskPoints)
  assert.deepEqual(run.compilerDerivedRecoveryActions, [
    'supply_registered_immutable_source_adapter',
  ])
  for (const ref of run.immutableEvidenceRefs) {
    const bytes = readFileSync(abs(ref.path))
    assert.equal(bytes.byteLength, ref.byteLength, `${ref.path} byte length drifted from Ticket 22`)
    assert.equal(sha256(bytes), ref.sha256, `${ref.path} digest drifted from Ticket 22`)
  }
  return {
    evidencePath: DRY_RUN_REL,
    evidenceSha256: sha256(readFileSync(abs(DRY_RUN_REL))),
    authority: run.authority,
    immutableDocumentCount: run.measuredCost.components.immutableDocumentCount,
    immutableEvidenceByteLength: run.measuredCost.components.immutableEvidenceByteLength,
    diagnosticCodes: [...new Set(run.diagnostics.map((diagnostic) => diagnostic.code))].sort(),
    diagnosticDigest: run.diagnosticDigest,
    compilerRequestDigest: run.compilerRequestDigest,
    measuredCost: run.measuredCost,
    measuredRisk: run.measuredRisk,
  }
}

function registeredEnvelope() {
  const resolution = resolveCanonicalAuthority(canonicalAuthorityRef)
  assert.equal(resolution.ok, true, 'current authority must resolve before source-adapter measurement')
  const adapter = resolution.closure.artifacts.adapter.adapters.find(
    (candidate) => candidate.adapterId === 'canonical-fixture-evidence',
  )
  assert.deepEqual(adapter, {
    adapterId: 'canonical-fixture-evidence',
    mediaType: 'application/vnd.eqb.canonical-fixture+json',
    version: '1',
  })
  return adapter
}

function loadPilotRequest() {
  const envelope = readJson(REQUEST_REL)
  const request = loadCanonicalImportRequest(abs(REQUEST_REL))
  assert.deepEqual(request.authority, canonicalAuthorityRef)
  assert.equal(request.evidence.documents.length, 18)
  const descriptors = new Map(envelope.evidence.documents.map((document) => [
    document.inputKey,
    document,
  ]))
  const requestDir = path.posix.dirname(REQUEST_REL)
  const documents = request.evidence.documents.map((document) => {
    const descriptor = descriptors.get(document.inputKey)
    assert.ok(descriptor, `request envelope must describe ${document.inputKey}`)
    return {
      inputKey: document.inputKey,
      roles: document.roles,
      mediaType: document.declared?.mediaType || 'application/octet-stream',
      originalName: document.declared?.originalName || null,
      path: path.posix.join(requestDir, descriptor.path),
      byteLength: document.bytes.byteLength,
      sha256: sha256(document.bytes),
    }
  })
  const sourceEnvelope = documents.find(
    (document) => document.inputKey === 'canonical_source_envelope',
  )
  assert.ok(sourceEnvelope, 'pilot request must carry one source envelope')
  assert.deepEqual(sourceEnvelope.roles, ['operator_assertions'])
  assert.equal(
    sourceEnvelope.mediaType,
    'application/vnd.eqb.canonical-fixture+json',
  )
  return { request, documents, sourceEnvelope }
}

function assertEnvelopeFailsClosed(request) {
  const absent = structuredClone(request)
  absent.evidence.documents = absent.evidence.documents.filter(
    (document) => document.inputKey !== 'canonical_source_envelope',
  )
  const absentResult = compileCanonicalPaper(absent)
  assert.equal(absentResult.disposition, 'unsupported')
  assert.equal(
    absentResult.artifacts.normalizationReport.diagnostics.some(
      (diagnostic) => diagnostic.code === 'SOURCE_ADAPTER_UNSUPPORTED',
    ),
    true,
    'without the registered envelope, compilation must not infer source semantics',
  )

  const unreadable = structuredClone(request)
  unreadable.evidence.documents.find(
    (document) => document.inputKey === 'canonical_source_envelope',
  ).bytes = new TextEncoder().encode('{')
  const unreadableResult = compileCanonicalPaper(unreadable)
  assert.equal(unreadableResult.disposition, 'incomplete_source')
  assert.equal(
    unreadableResult.artifacts.normalizationReport.diagnostics.some(
      (diagnostic) => diagnostic.code === 'SOURCE_DOCUMENT_UNREADABLE',
    ),
    true,
    'a malformed immutable envelope must fail closed instead of falling back',
  )
}

function familyCounts(groups) {
  return Object.fromEntries([...new Set(groups.map(
    (group) => group.contractRef.familyContractId,
  ))].sort().map((family) => [
    family,
    groups.filter((group) => group.contractRef.familyContractId === family).length,
  ]))
}

function comparableMeasurement({ documents, compilation }) {
  const diagnostics = compilation.artifacts.normalizationReport.diagnostics
  const evidenceByteLength = documents.reduce(
    (sum, document) => sum + document.byteLength,
    0,
  )
  const diagnosticCodeCount = new Set(diagnostics.map(
    (diagnostic) => diagnostic.code,
  )).size
  const sourceSpanRefCount = diagnostics.reduce(
    (sum, diagnostic) => sum + (diagnostic.sourceSpanRefs?.length || 0),
    0,
  )
  const inactiveClosures = compilation.artifacts.normalizationReport
    .inactiveSourceClosures || []
  const profileRef = compilation.artifacts.canonicalPaper.paperPlan.profileRef
  assert.equal(profileRef.profileId, 'nck1')
  assert.deepEqual(
    inactiveClosures.map((closure) => closure.status).sort(),
    ['closed', 'closed'],
    'the registered envelope must close both inactive Listening source slots',
  )
  const factors = {
    sourceAdapterUnavailable: diagnostics.some(
      (diagnostic) => diagnostic.code === 'SOURCE_ADAPTER_UNSUPPORTED',
    ),
    profileUnproven: false,
    inactiveClosureUnclassified: false,
    compilerDiagnosticCodeCount: diagnosticCodeCount,
  }
  const inspectionWorkUnits = documents.length * 4
    + Math.ceil(evidenceByteLength / 16384)
    + diagnostics.length * 8
    + sourceSpanRefCount
  const riskPoints = (factors.sourceAdapterUnavailable ? 8 : 0)
    + (factors.profileUnproven ? 5 : 0)
    + (factors.inactiveClosureUnclassified ? 3 : 0)
    + Math.min(4, diagnosticCodeCount)
  return {
    measuredCost: {
      model: 'ticket-22-frozen-evidence-inspection-units-v1',
      components: {
        immutableDocumentCount: documents.length,
        immutableEvidenceByteLength: evidenceByteLength,
        compilerDiagnosticCount: diagnostics.length,
        compilerDiagnosticCodeCount: diagnosticCodeCount,
        compilerSourceSpanRefCount: sourceSpanRefCount,
        closureDiagnosisCount: 0,
      },
      inspectionWorkUnits,
    },
    measuredRisk: {
      model: 'ticket-22-source-closure-risk-points-v1',
      factors,
      riskPoints,
      band: riskPoints >= 12 ? 'high' : riskPoints >= 6 ? 'moderate' : 'low',
    },
  }
}

function buildEvidence({ beforeState }) {
  const baseline = ticket22Baseline()
  const adapter = registeredEnvelope()
  const { request, documents, sourceEnvelope } = loadPilotRequest()
  assertEnvelopeFailsClosed(request)
  const compilation = compileCanonicalPaper(request)
  assert.equal(
    compilation.disposition,
    'ready',
    JSON.stringify(compilation.artifacts.normalizationReport.diagnostics, null, 2),
  )
  const diagnostics = compilation.artifacts.normalizationReport.diagnostics
  assert.deepEqual(diagnostics, [])
  const groups = compilation.artifacts.canonicalPaper.questionGroups
  const families = familyCounts(groups)
  assert.deepEqual(families, EXPECTED_FAMILY_COUNTS)
  const measurement = comparableMeasurement({ documents, compilation })
  assert.ok(
    measurement.measuredCost.inspectionWorkUnits > CAPACITY.inspectionWorkUnits,
    'the source-adapter pilot must fail closed if its measured work no longer fits the approved 88-unit capacity',
  )
  const capacityDecision = {
    approved: CAPACITY,
    observed: {
      paperCount: 1,
      inspectionWorkUnits: measurement.measuredCost.inspectionWorkUnits,
      riskPoints: measurement.measuredRisk.riskPoints,
    },
    decision: 'fail_closed',
    reasons: [
      `inspection_work_units_${measurement.measuredCost.inspectionWorkUnits}_exceed_approved_${CAPACITY.inspectionWorkUnits}`,
    ],
  }
  const historicalByteBindings = [
    assertMatchingBytes(
      'app/public/paper-assets/paper-2026-i/latest/paper-asset.json',
      'test-fixtures/paper-import/paper-2026-i-canonical-pilot/paper-asset.json',
      'paper asset',
    ),
    assertMatchingBytes(
      'app/public/paper-assets/paper-2026-i/latest/answer-key.json',
      'test-fixtures/paper-import/paper-2026-i-canonical-pilot/answer-key.json',
      'official answer lead',
    ),
    assertMatchingBytes(
      'app/public/paper-assets/paper-2026-i/latest/import-meta.json',
      'test-fixtures/paper-import/paper-2026-i-canonical-pilot/import-meta.json',
      'source provenance',
    ),
    assertMatchingBytes(
      'scripts/import-pipeline/papers/paper-2026-i/source/paper.pdf',
      'test-fixtures/paper-import/paper-2026-i-canonical-pilot/paper.pdf',
      'question-source PDF',
    ),
    assertMatchingBytes(
      'scripts/import-pipeline/papers/paper-2026-i/source/answers.pdf',
      'test-fixtures/paper-import/paper-2026-i-canonical-pilot/canonical-evidence/06-source_answers_pdf.pdf',
      'official-answer PDF',
    ),
  ]
  const result = {
    schemaVersion: 'paper-canonical-source-adapter-pilot-v1',
    ticket: '24-costed-immutable-source-adapter-pilot',
    binding: {
      ticketFixedPoint: TICKET_FIXED_POINT,
      expectedBranch: EXPECTED_BRANCH,
      paperId: PAPER_ID,
      authority: canonicalAuthorityRef,
      ticket22Evidence: baseline.evidencePath,
      ticket22EvidenceSha256: baseline.evidenceSha256,
      sourceEnvelopeRequest: REQUEST_REL,
      sourceEnvelopeRequestSha256: sha256(readFileSync(abs(REQUEST_REL))),
    },
    ticket22Baseline: baseline,
    sourceEnvelope: {
      registeredAdapter: adapter,
      documentCount: documents.length,
      byteLength: documents.reduce((sum, document) => sum + document.byteLength, 0),
      requestDigest: digestJson(documents.map(({ path: _path, ...document }) => document)),
      envelopeDocument: sourceEnvelope,
      documents,
      historicalByteBindings,
    },
    compile: {
      disposition: compilation.disposition,
      diagnosticCodes: [],
      diagnosticCount: 0,
      familyCounts: families,
      sourceCapture: {
        captureId: compilation.artifacts.sourceCapture.captureId,
        digest: compilation.artifacts.sourceCapture.digest,
        documentCount: compilation.artifacts.sourceCapture.documents.length,
        observationCount: compilation.artifacts.sourceCapture.observations.length,
        assertionCount: compilation.artifacts.sourceCapture.assertions.length,
        sourceSpanCount: compilation.artifacts.sourceCapture.sourceSpans.length,
      },
      semanticDigest: compilation.artifacts.normalizationReport.semanticDigest,
      inactiveSourceClosureCount: compilation.artifacts.normalizationReport
        .inactiveSourceClosures.length,
    },
    diagnosticShape: {
      ticket22: {
        disposition: 'unsupported',
        diagnosticCodes: baseline.diagnosticCodes,
        familyStatus: 'not_derivable_without_registered_source_adapter',
      },
      sourceAdapterPilot: {
        disposition: compilation.disposition,
        diagnosticCodes: [],
        familyCounts: families,
      },
    },
    ...measurement,
    capacity: capacityDecision,
    zeroMutation: {
      protectedStateBefore: beforeState,
      protectedStateAfter: null,
      mutationCount: 0,
      writesPerformedByCompile: [],
      ticketEvidenceWrite: EVIDENCE_REL,
    },
  }
  return result
}

function main() {
  const writeEvidence = process.argv.includes('--write-evidence')
  assert.equal(
    process.argv.length,
    writeEvidence ? 3 : 2,
    'Usage: node scripts/verify-paper-canonical-source-adapter-pilot.mjs [--write-evidence]',
  )
  assertPreflight()
  const beforeState = immutableState()
  const evidence = buildEvidence({ beforeState })
  const afterState = immutableState()
  assert.deepEqual(
    afterState,
    beforeState,
    'concurrent writer detected: immutable source, corpus, or publication state changed during pilot compile',
  )
  evidence.zeroMutation.protectedStateAfter = afterState
  assert.equal(evidence.capacity.decision, 'fail_closed')
  const sealedEvidence = {
    ...evidence,
    evidenceDigest: digestJson(evidence),
  }
  const bytes = Buffer.from(`${JSON.stringify(stableValue(sealedEvidence), null, 2)}\n`)
  if (writeEvidence) {
    writeFileSync(abs(EVIDENCE_REL), bytes)
    console.log(`WROTE ${EVIDENCE_REL}`)
  } else {
    const checkedIn = JSON.parse(readFileSync(abs(EVIDENCE_REL), 'utf8'))
    assert.equal(
      checkedIn.evidenceDigest,
      digestJson(withoutKey(checkedIn, 'evidenceDigest')),
      'checked-in source-adapter pilot evidence must close its own stable fields',
    )
    assert.deepEqual(
      readFileSync(abs(EVIDENCE_REL)),
      bytes,
      'checked-in Ticket 24 pilot evidence drifted',
    )
  }
  console.log(
    `PASS source-adapter pilot fail-closed: ${sealedEvidence.measuredCost.inspectionWorkUnits} units > ${CAPACITY.inspectionWorkUnits} approved`,
  )
}

main()
