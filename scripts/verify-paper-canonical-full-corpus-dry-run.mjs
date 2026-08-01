#!/usr/bin/env node

/**
 * Ticket 22: compile the frozen migration denominator through the public
 * compiler without mutating corpus state. `--write-evidence` is deliberately
 * limited to the one checked-in diagnostic record below; the compiler itself
 * is never given a store, database, or publication path.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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

import { canonicalAuthorityRef } from '../shared/paper-canonical/authority.mjs'
import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const EXPECTED_BRANCH = 'codex/paper-canonical-unification-20260725'
const TICKET_FIXED_POINT = '95439efb625199fabe7361bfca10bb8fe833f396'
const MANIFEST_REL = 'docs/cuts/paper-canonical-unification/migration/manifest-v1.json'
const LEDGER_REL = 'docs/cuts/paper-canonical-unification/migration/ledger-v1.json'
const EVIDENCE_REL = 'docs/cuts/paper-canonical-unification/migration/full-corpus-zero-write-dry-run-v1.json'
const PROTECTED_ROOTS = Object.freeze([
  'app/public/paper-assets',
  'data/question-bank.sqlite',
  'scripts/import-pipeline/papers',
  'standards/paper-canonical',
  'shared/paper-canonical',
  MANIFEST_REL,
  LEDGER_REL,
])
const EXPECTED_DENOMINATOR = Object.freeze({
  papers: 33,
  groups: 273,
  objectiveQuestions: 1530,
  questionOwnedAbcdSets: 1035,
})

function abs(rel) {
  return path.join(ROOT, rel)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]))
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

function walkFiles(rel) {
  const target = abs(rel)
  if (!existsSync(target)) return []
  const stat = statSync(target)
  if (stat.isFile()) return [{ rel, bytes: readFileSync(target) }]
  if (!stat.isDirectory()) throw new Error(`unsupported protected path: ${rel}`)
  const files = []
  function visit(currentRel) {
    for (const entry of readdirSync(abs(currentRel), { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const nextRel = path.posix.join(currentRel, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`symlink is not an immutable input: ${nextRel}`)
      if (entry.isDirectory()) visit(nextRel)
      else if (entry.isFile()) files.push({ rel: nextRel, bytes: readFileSync(abs(nextRel)) })
      else throw new Error(`unsupported protected entry: ${nextRel}`)
    }
  }
  visit(rel)
  return files
}

function protectedState() {
  const files = PROTECTED_ROOTS.flatMap(walkFiles).map(({ rel, bytes }) => ({
    path: rel,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  })).sort((left, right) => left.path.localeCompare(right.path))
  return {
    paths: PROTECTED_ROOTS,
    fileCount: files.length,
    digest: digestJson(files),
  }
}

function assertPreflight({ allowEvidenceWrite }) {
  const branch = git(['branch', '--show-current'])
  const head = git(['rev-parse', 'HEAD'])
  const status = git(['status', '--porcelain=v1'])
  assert.equal(branch, EXPECTED_BRANCH, 'Ticket 22 branch must match the declared worktree')
  assert.equal(
    git(['merge-base', '--is-ancestor', TICKET_FIXED_POINT, 'HEAD']) || '',
    '',
    'Ticket 22 must run from the declared fixed-point lineage',
  )
  if (head !== TICKET_FIXED_POINT) {
    execFileSync('git', [
      'diff', '--quiet', TICKET_FIXED_POINT, '--', ...PROTECTED_ROOTS,
    ], { cwd: ROOT, stdio: 'ignore' })
  }
  const changed = status.split('\n').filter(Boolean).map((line) => line.slice(3))
  const permitted = new Set(allowEvidenceWrite ? [EVIDENCE_REL] : [])
  assert.equal(
    changed.every((file) => permitted.has(file)),
    true,
    `worktree is not clean for Ticket 22: ${changed.join(', ')}`,
  )
  return { branch, head }
}

function document({ inputKey, roles, bytes, mediaType, originalName }) {
  assert.ok(bytes instanceof Uint8Array, `${inputKey} requires immutable bytes`)
  return { inputKey, roles, bytes, declared: { mediaType, originalName } }
}

function documentRolesFor(file) {
  if (file.role === 'asset-projection') return ['legacy_projection']
  if (file.role === 'official-answer-lead') return ['official_answer_lead']
  if (file.role === 'source-provenance') return ['source_provenance']
  if (file.role === 'analysis-supplement') return ['analysis_supplement']
  return ['frozen_latest_evidence']
}

function mediaTypeFor(file) {
  if (file.path.endsWith('.json')) return 'application/json'
  return 'application/octet-stream'
}

function frozenEvidenceRefs(paper) {
  assert.ok(Array.isArray(paper.latestTree?.files) && paper.latestTree.files.length > 0, `${paper.paperId} must retain frozen latest files`)
  return paper.latestTree.files
    .map((file) => ({
      path: file.path,
      relativePath: file.relativePath,
      role: file.role,
      byteLength: file.byteLength,
      sha256: file.sha256,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
}

function assertFrozenLatestTree(paper) {
  const latestRoot = path.posix.join('app/public/paper-assets', paper.paperId, 'latest')
  const expected = frozenEvidenceRefs(paper)
  const actual = walkFiles(latestRoot).map(({ rel, bytes }) => ({
    path: rel,
    relativePath: path.posix.relative(latestRoot, rel),
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  })).sort((left, right) => left.path.localeCompare(right.path))
  assert.deepEqual(
    actual.map(({ path: filePath, relativePath, byteLength, sha256: digest }) => ({ path: filePath, relativePath, byteLength, sha256: digest })),
    expected.map(({ path: filePath, relativePath, byteLength, sha256: digest }) => ({ path: filePath, relativePath, byteLength, sha256: digest })),
    `${paper.paperId} latest tree must match the frozen manifest before compilation`,
  )
  return expected
}

function requestForPaper(paper) {
  const evidenceRefs = assertFrozenLatestTree(paper)
  const documents = evidenceRefs.map((file, index) => document({
    inputKey: `frozen_latest_${String(index + 1).padStart(2, '0')}_${file.relativePath.replaceAll(/[^a-zA-Z0-9]+/g, '_')}`,
    roles: documentRolesFor(file),
    bytes: readFileSync(abs(file.path)),
    mediaType: mediaTypeFor(file),
    originalName: path.posix.basename(file.path),
  }))
  assert.equal(
    documents.some((item) => item.declared.mediaType === 'application/vnd.eqb.canonical-fixture+json' || item.roles.includes('operator_assertions')),
    false,
    'Ticket 22 compiler requests must not synthesize fixture or operator-assertion evidence',
  )
  return { authority: canonicalAuthorityRef, evidence: { documents }, evidenceRefs }
}

function requestFingerprint(request) {
  return digestJson(request.evidence.documents.map((item) => ({
    inputKey: item.inputKey,
    roles: item.roles,
    mediaType: item.declared.mediaType,
    originalName: item.declared.originalName,
    sha256: sha256(item.bytes),
  })))
}

function assertProfileCandidateCannotAffectRequest(paper, request) {
  const candidateChanged = structuredClone(paper)
  candidateChanged.profileCandidate = {
    status: 'candidate_not_source_confirmed',
    candidateProfileId: 'intentionally-ignored',
  }
  assert.equal(
    requestFingerprint(requestForPaper(candidateChanged)),
    requestFingerprint(request),
    `${paper.paperId} compiler request must not depend on the manifest Profile candidate`,
  )
}

function recoveryMechanisms(diagnostics) {
  const mechanisms = new Set()
  for (const item of diagnostics) {
    const code = item.code || ''
    if (code.startsWith('READING_')) mechanisms.add('restore_reviewed_reading_source_evidence')
    else if (code.startsWith('GRAMMAR_FILL_')) mechanisms.add('restore_reviewed_grammar_fill_prompt_evidence')
    else if (code.startsWith('APPLICATION_')) mechanisms.add('restore_reviewed_application_writing_evidence')
    else if (code.startsWith('CONTINUATION_')) mechanisms.add('restore_reviewed_continuation_writing_evidence')
    else if (code.startsWith('LISTENING_') || code.startsWith('INACTIVE_SOURCE_')) mechanisms.add('restore_or_close_inactive_listening_evidence')
    else if (code.startsWith('OFFICIAL_ANSWER_')) mechanisms.add('restore_immutable_official_answer_evidence')
    else if (code.startsWith('PROFILE_')) mechanisms.add('verify_profile_from_source_evidence')
    else if (code === 'SOURCE_ADAPTER_UNSUPPORTED') mechanisms.add('supply_registered_immutable_source_adapter')
    else mechanisms.add('restore_or_bound_missing_immutable_source_evidence')
  }
  return [...mechanisms].sort()
}

function evidenceRefsForRole(evidenceRefs, role) {
  return evidenceRefs.filter((item) => item.role === role)
}

function evidenceBoundDiagnosis(code, evidenceRefs) {
  assert.ok(evidenceRefs.length > 0, `${code} must bind exact frozen evidence`)
  return { code, evidenceRefs }
}

function closureDiagnostic({ evidenceRefs }) {
  const source = evidenceRefsForRole(evidenceRefs, 'asset-projection')
  const answer = evidenceRefsForRole(evidenceRefs, 'official-answer-lead')
  const provenance = evidenceRefsForRole(evidenceRefs, 'source-provenance')
  const analysisSupplements = evidenceRefsForRole(evidenceRefs, 'analysis-supplement')
  const profileEvidence = [...source, ...provenance]
  return {
    questionSource: {
      status: source.length > 0 ? 'legacy_projection_available_not_source_capture_closed' : 'missing',
      diagnoses: [evidenceBoundDiagnosis(
        source.length > 0 ? 'QUESTION_SOURCE_CAPTURE_NOT_PRESENT_IN_FROZEN_LATEST' : 'QUESTION_SOURCE_PROJECTION_MISSING',
        source.length > 0 ? source : evidenceRefs,
      )],
    },
    officialAnswerSource: {
      status: answer.length > 0 ? 'answer_key_lead_available_not_official_source_capture_closed' : 'missing',
      diagnoses: [evidenceBoundDiagnosis(
        answer.length > 0 ? 'OFFICIAL_ANSWER_SOURCE_CAPTURE_NOT_PRESENT_IN_FROZEN_LATEST' : 'OFFICIAL_ANSWER_MISSING',
        answer.length > 0 ? answer : evidenceRefs,
      )],
    },
    analysisSupplements: {
      status: analysisSupplements.length > 0 ? 'available_but_not_canonical_source_capture' : 'none_present',
      diagnoses: [evidenceBoundDiagnosis(
        analysisSupplements.length > 0 ? 'ANALYSIS_SUPPLEMENT_NOT_CANONICAL_SOURCE_CAPTURE' : 'ANALYSIS_SUPPLEMENT_ABSENT',
        analysisSupplements.length > 0 ? analysisSupplements : evidenceRefs,
      )],
    },
    profile: {
      status: 'unresolved_without_source_proof',
      profileId: null,
      diagnoses: [evidenceBoundDiagnosis('PROFILE_SOURCE_PROOF_MISSING', profileEvidence)],
    },
    inactiveClosure: {
      status: 'unclassified_without_source_proven_profile',
      diagnoses: [evidenceBoundDiagnosis(
        'INACTIVE_SOURCE_CLOSURE_UNCLASSIFIED_WITHOUT_SOURCE_PROVEN_PROFILE',
        profileEvidence,
      )],
    },
  }
}

function evidenceBoundCompilerDiagnostics(diagnostics, evidenceRefs) {
  return diagnostics.map(({ code, disposition, path: diagnosticPath, sourceSpanRefs }) => ({
    code,
    disposition,
    path: diagnosticPath,
    sourceSpanRefs: [...sourceSpanRefs].sort(),
    evidenceRefs,
  })).sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)))
}

function compilerDerivedFamily(diagnostics) {
  const familyByPrefix = [
    ['APPLICATION_', 'application-writing'],
    ['CONTINUATION_', 'continuation-writing'],
    ['GRAMMAR_FILL_', 'grammar-fill'],
    ['READING_', 'reading'],
    ['SEVEN_CHOICES_', 'seven-choices'],
    ['CLOZE_', 'cloze'],
    ['LISTENING_', 'listening'],
  ]
  const families = [...new Set(diagnostics.flatMap((item) =>
    familyByPrefix.filter(([prefix]) => item.code.startsWith(prefix)).map(([, family]) => family),
  ))].sort()
  return {
    status: families.length > 0 ? 'derived_from_compiler_diagnostic_codes' : 'not_derivable_without_registered_source_adapter',
    families,
    diagnosticCodes: [...new Set(diagnostics.map((item) => item.code))].sort(),
  }
}

function deterministicMeasurement({ request, diagnostics, closure }) {
  const evidenceByteLength = request.evidenceRefs.reduce((sum, item) => sum + item.byteLength, 0)
  const diagnosticCodeCount = new Set(diagnostics.map((item) => item.code)).size
  const sourceSpanRefCount = diagnostics.reduce((sum, item) => sum + item.sourceSpanRefs.length, 0)
  const closureDiagnosisCount = Object.values(closure).reduce((sum, item) => sum + item.diagnoses.length, 0)
  const sourceAdapterUnavailable = diagnostics.some((item) => item.code === 'SOURCE_ADAPTER_UNSUPPORTED')
  const profileUnproven = closure.profile.status === 'unresolved_without_source_proof'
  const inactiveUnclassified = closure.inactiveClosure.status === 'unclassified_without_source_proven_profile'
  const workUnits = request.evidenceRefs.length * 4
    + Math.ceil(evidenceByteLength / 16384)
    + diagnostics.length * 8
    + closureDiagnosisCount * 2
    + sourceSpanRefCount
  const riskPoints = (sourceAdapterUnavailable ? 8 : 0)
    + (profileUnproven ? 5 : 0)
    + (inactiveUnclassified ? 3 : 0)
    + Math.min(4, diagnosticCodeCount)
  return {
    measuredCost: {
      model: 'ticket-22-frozen-evidence-inspection-units-v1',
      components: {
        immutableDocumentCount: request.evidenceRefs.length,
        immutableEvidenceByteLength: evidenceByteLength,
        compilerDiagnosticCount: diagnostics.length,
        compilerDiagnosticCodeCount: diagnosticCodeCount,
        compilerSourceSpanRefCount: sourceSpanRefCount,
        closureDiagnosisCount,
      },
      inspectionWorkUnits: workUnits,
    },
    measuredRisk: {
      model: 'ticket-22-source-closure-risk-points-v1',
      factors: {
        sourceAdapterUnavailable,
        profileUnproven,
        inactiveClosureUnclassified: inactiveUnclassified,
        compilerDiagnosticCodeCount: diagnosticCodeCount,
      },
      riskPoints,
      band: riskPoints >= 12 ? 'high' : riskPoints >= 6 ? 'moderate' : 'low',
    },
  }
}

function assertEvidenceBoundRun(run) {
  assert.equal(Object.hasOwn(run, 'family'), false, 'Ticket 22 must not copy family counts from the migration manifest')
  assert.equal(Object.hasOwn(run, 'allowedRecoveryActions'), false, 'Ticket 22 must not mix ledger recovery guesses into compiler recovery')
  assert.equal(Object.hasOwn(run.closure, 'attachments'), false, 'analysis supplements must not be classified as attachments')
  for (const diagnostic of run.diagnostics) {
    assert.ok(
      diagnostic.sourceSpanRefs.length > 0 || diagnostic.evidenceRefs.length > 0,
      `compiler diagnostic ${diagnostic.code} must bind source spans or exact evidence`,
    )
  }
  for (const category of Object.values(run.closure)) {
    for (const diagnosis of category.diagnoses) {
      assert.ok(diagnosis.evidenceRefs.length > 0, `closure diagnosis ${diagnosis.code} must bind exact evidence`)
    }
  }
  assert.equal(
    run.measuredCost.model,
    'ticket-22-frozen-evidence-inspection-units-v1',
    'Ticket 22 cost must name its deterministic model',
  )
  assert.equal(
    run.measuredRisk.model,
    'ticket-22-source-closure-risk-points-v1',
    'Ticket 22 risk must name its deterministic model',
  )
}

function buildEvidence({ manifest, ledger, beforeState }) {
  assert.equal(
    manifest.manifestDigest,
    digestJson(withoutKey(manifest, 'manifestDigest')),
    'frozen migration manifest digest must close its exact bytes',
  )
  assert.equal(
    ledger.ledgerDigest,
    digestJson(withoutKey(ledger, 'ledgerDigest')),
    'frozen migration ledger digest must close its exact bytes',
  )
  assert.equal(ledger.manifestDigest, manifest.manifestDigest, 'ledger must bind the frozen manifest digest')
  assert.equal(manifest.authority.manifest.version, canonicalAuthorityRef.manifestVersion, 'frozen authority version must match the public compiler')
  assert.equal(manifest.authority.manifest.authorityDigest, canonicalAuthorityRef.manifestDigest, 'frozen authority digest must match the public compiler')
  assert.deepEqual(manifest.census.denominator, EXPECTED_DENOMINATOR, 'frozen denominator must remain exact')
  assert.equal(manifest.corpusInputs.latestPaperIds.length, EXPECTED_DENOMINATOR.papers, 'manifest must list every frozen paper')
  const queueByPaperId = new Map(ledger.queue?.entries
    .filter((entry) => entry.scope === 'whole-paper')
    .map((entry) => [entry.paperId, entry]))
  assert.equal(queueByPaperId.size, EXPECTED_DENOMINATOR.papers, 'ledger must retain one whole-paper entry per frozen paper')
  assert.deepEqual(
    [...queueByPaperId.keys()].sort(),
    [...manifest.corpusInputs.latestPaperIds].sort(),
    'ledger and manifest denominators must agree exactly',
  )
  const runs = manifest.papers.map((paper) => {
    const queue = queueByPaperId.get(paper.paperId)
    assert.ok(queue, `ledger lacks frozen queue entry for ${paper.paperId}`)
    const request = requestForPaper(paper)
    assertProfileCandidateCannotAffectRequest(paper, request)
    const compilation = compileCanonicalPaper(request)
    const rawDiagnostics = compilation.artifacts.normalizationReport.diagnostics
    const diagnostics = evidenceBoundCompilerDiagnostics(rawDiagnostics, request.evidenceRefs)
    const closure = closureDiagnostic({ evidenceRefs: request.evidenceRefs })
    const measurement = deterministicMeasurement({
      request,
      diagnostics: rawDiagnostics,
      closure,
    })
    return {
      paperId: paper.paperId,
      orderKey: queue.orderKey,
      disposition: compilation.disposition,
      authority: compilation.artifacts.normalizationReport.authority,
      immutableEvidenceRefs: request.evidenceRefs,
      compilerRequestDigest: requestFingerprint(request),
      compilerDerivedFamily: compilerDerivedFamily(rawDiagnostics),
      closure,
      diagnostics,
      diagnosticDigest: digestJson(diagnostics),
      compilerDerivedRecoveryActions: recoveryMechanisms(rawDiagnostics),
      ...measurement,
    }
  })
  for (const run of runs) assertEvidenceBoundRun(run)
  const dispositionCounts = Object.fromEntries(
    ['ready', 'needs_review', 'unsupported', 'incomplete_source', 'answer_conflict']
      .map((disposition) => [disposition, runs.filter((run) => run.disposition === disposition).length]),
  )
  assert.equal(Object.values(dispositionCounts).reduce((sum, count) => sum + count, 0), EXPECTED_DENOMINATOR.papers, 'each frozen paper must have exactly one disposition')
  const diagnosticCodeCounts = Object.fromEntries([...new Set(runs.flatMap((run) => run.diagnostics.map((item) => item.code)))]
    .sort()
    .map((code) => [code, runs.reduce((count, run) => count + run.diagnostics.filter((item) => item.code === code).length, 0)]))
  const mechanismCounts = Object.fromEntries([...new Set(runs.flatMap((run) => run.compilerDerivedRecoveryActions))]
    .sort()
    .map((mechanism) => [mechanism, runs.filter((run) => run.compilerDerivedRecoveryActions.includes(mechanism)).map((run) => run.paperId)]))
  return {
    schemaVersion: 'paper-canonical-full-corpus-zero-write-dry-run-v1',
    ticket: '22-full-corpus-zero-write-dry-run',
    binding: {
      ticketFixedPoint: TICKET_FIXED_POINT,
      expectedBranch: EXPECTED_BRANCH,
      frozenManifestPath: MANIFEST_REL,
      frozenManifestDigest: manifest.manifestDigest,
      frozenLedgerPath: LEDGER_REL,
      frozenLedgerDigest: ledger.ledgerDigest,
      authority: manifest.authority,
    },
    denominator: manifest.census.denominator,
    summary: {
      dispositionCounts,
      diagnosticCodeCounts,
      sharedRecoveryMechanisms: mechanismCounts,
      readyPlusBlockedCount: Object.values(dispositionCounts).reduce((sum, count) => sum + count, 0),
    },
    runs,
    zeroMutation: {
      protectedStateBefore: beforeState,
      protectedStateAfter: null,
      mutationCount: 0,
      writesPerformedByDiagnostic: [],
      ticketEvidenceWrite: EVIDENCE_REL,
    },
  }
}

function main() {
  const writeEvidence = process.argv.includes('--write-evidence')
  assert.equal(process.argv.length, writeEvidence ? 3 : 2, 'Usage: node scripts/verify-paper-canonical-full-corpus-dry-run.mjs [--write-evidence]')
  assertPreflight({ allowEvidenceWrite: writeEvidence })
  const manifest = readJson(MANIFEST_REL)
  const ledger = readJson(LEDGER_REL)
  const beforeState = protectedState()
  const evidence = buildEvidence({ manifest, ledger, beforeState })
  const afterState = protectedState()
  assert.deepEqual(afterState, beforeState, 'concurrent writer detected: protected corpus state changed during zero-write compile')
  evidence.zeroMutation.protectedStateAfter = afterState
  const bytes = Buffer.from(`${JSON.stringify(stableValue(evidence), null, 2)}\n`)
  if (writeEvidence) {
    writeFileSync(abs(EVIDENCE_REL), bytes)
    console.log(`WROTE ${EVIDENCE_REL}`)
  } else {
    assert.deepEqual(readFileSync(abs(EVIDENCE_REL)), bytes, 'checked-in Ticket 22 diagnostic evidence drifted')
    console.log(`PASS ${EVIDENCE_REL} is reproducible`)
  }
  console.log(`PASS full-corpus zero-write compile: ${stableStringify(evidence.summary.dispositionCounts)}`)
}

main()
