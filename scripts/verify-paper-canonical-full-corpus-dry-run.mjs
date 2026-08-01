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

function fileRecord(tree, relativePath) {
  return tree.files.find((file) => file.relativePath === relativePath) || null
}

function document({ inputKey, roles, bytes, mediaType, originalName }) {
  if (!bytes) return null
  return { inputKey, roles, bytes, declared: { mediaType, originalName } }
}

function profileNeedsInactiveListening(profileId) {
  return profileId === 'nck1'
}

function sourceEnvelope({ paperId, profileId, sourceAssetVersion }) {
  return Buffer.from(JSON.stringify({
    paperId,
    profileId,
    sourceAssetVersion,
    profileInstructionSourceDigest: null,
    observations: [],
    assertions: [],
    groups: [],
    transformations: [],
    inactiveSlots: {},
    inactiveSourceClosures: [],
  }))
}

function requestForPaper(paper) {
  const latestRoot = path.join('app/public/paper-assets', paper.paperId, 'latest')
  const assetBytes = readFileSync(abs(path.join(latestRoot, 'paper-asset.json')))
  const answerBytes = readFileSync(abs(path.join(latestRoot, 'answer-key.json')))
  const importMetaPath = path.join(latestRoot, 'import-meta.json')
  const sourceAssetVersion = JSON.parse(answerBytes).sourceAssetVersion
  const documents = [
    document({
      inputKey: 'canonical_source_envelope',
      roles: ['operator_assertions'],
      bytes: sourceEnvelope({
        paperId: paper.paperId,
        profileId: paper.profileCandidate.candidateProfileId,
        sourceAssetVersion,
      }),
      mediaType: 'application/vnd.eqb.canonical-fixture+json',
      originalName: 'ticket-22-source-envelope.json',
    }),
    document({
      inputKey: 'paper_asset',
      roles: ['question_source'],
      bytes: assetBytes,
      mediaType: 'application/json',
      originalName: 'paper-asset.json',
    }),
    document({
      inputKey: 'official_answers',
      roles: ['official_answer_source'],
      bytes: answerBytes,
      mediaType: 'application/json',
      originalName: 'answer-key.json',
    }),
  ]
  if (existsSync(abs(importMetaPath))) documents.push(document({
    inputKey: 'source_provenance',
    roles: ['source_provenance'],
    bytes: readFileSync(abs(importMetaPath)),
    mediaType: 'application/json',
    originalName: 'import-meta.json',
  }))
  const listening = [
    ['questions', 'application/vnd.eqb.listening-questions+json', ['structured_source', 'question_source']],
    ['answers', 'application/vnd.eqb.listening-answers+json', ['structured_source', 'official_answer_source']],
    ['transcript', 'application/vnd.eqb.listening-transcript+json', ['structured_source', 'transcript_source']],
  ]
  for (const [name, mediaType, roles] of listening) {
    const rel = path.join(latestRoot, 'listening', `${name}.json`)
    if (existsSync(abs(rel))) documents.push(document({
      inputKey: `listening_${name}`,
      roles,
      bytes: readFileSync(abs(rel)),
      mediaType,
      originalName: `${name}.json`,
    }))
  }
  return { authority: canonicalAuthorityRef, evidence: { documents } }
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
    else mechanisms.add('restore_or_bound_missing_immutable_source_evidence')
  }
  return [...mechanisms].sort()
}

function closureDiagnostic({ paper, tree, diagnostics }) {
  const source = fileRecord(tree, 'paper-asset.json')
  const answer = fileRecord(tree, 'answer-key.json')
  const attachments = tree.files
    .filter((file) => !['paper-asset.json', 'answer-key.json', 'import-meta.json'].includes(file.relativePath))
    .map((file) => ({ path: file.path, sha256: file.sha256, byteLength: file.byteLength, role: file.role }))
  const codes = new Set(diagnostics.map((item) => item.code))
  return {
    questionSource: {
      status: source ? 'legacy_projection_available_not_source_capture_closed' : 'missing',
      evidenceRefs: source ? [{ path: source.path, sha256: source.sha256, byteLength: source.byteLength }] : [],
      diagnostic: source ? 'QUESTION_SOURCE_CAPTURE_NOT_PRESENT_IN_FROZEN_LATEST' : 'QUESTION_SOURCE_PROJECTION_MISSING',
    },
    officialAnswerSource: {
      status: answer ? 'answer_key_lead_available_not_official_source_capture_closed' : 'missing',
      evidenceRefs: answer ? [{ path: answer.path, sha256: answer.sha256, byteLength: answer.byteLength }] : [],
      diagnostic: codes.has('OFFICIAL_ANSWER_MISSING')
        ? 'OFFICIAL_ANSWER_MISSING'
        : 'OFFICIAL_ANSWER_SOURCE_CAPTURE_NOT_PRESENT_IN_FROZEN_LATEST',
    },
    attachments: {
      status: attachments.length > 0 ? 'available_but_not_complete_source_capture' : 'none_present',
      evidenceRefs: attachments,
      diagnostic: attachments.length > 0
        ? 'ATTACHMENTS_NOT_SUFFICIENT_FOR_CANONICAL_SOURCE_CLOSURE'
        : 'ATTACHMENTS_ABSENT_FROM_FROZEN_LATEST',
    },
    profile: {
      status: 'ledger_candidate_requires_source_proof',
      profileId: paper.profileCandidate.candidateProfileId,
      evidenceRefs: paper.profileCandidate.evidenceRefs || [],
      diagnostic: 'PROFILE_CANDIDATE_NOT_SOURCE_PROVEN',
    },
    inactiveClosure: {
      status: profileNeedsInactiveListening(paper.profileCandidate.candidateProfileId)
        ? (codes.has('INACTIVE_SOURCE_MISSING') ? 'diagnosed_missing' : 'requires_source_closure')
        : 'not_applicable_for_profile',
      diagnostic: profileNeedsInactiveListening(paper.profileCandidate.candidateProfileId)
        ? (codes.has('INACTIVE_SOURCE_MISSING') ? 'INACTIVE_SOURCE_MISSING' : 'INACTIVE_SOURCE_CLOSURE_NOT_REACHED_AFTER_EARLIER_BLOCK')
        : null,
    },
  }
}

function buildEvidence({ manifest, ledger, beforeState, preflight }) {
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
    const compilation = compileCanonicalPaper(requestForPaper(paper))
    const diagnostics = compilation.artifacts.normalizationReport.diagnostics
      .map(({ code, disposition, path: diagnosticPath, sourceSpanRefs }) => ({
        code,
        disposition,
        path: diagnosticPath,
        sourceSpanRefCount: sourceSpanRefs.length,
      }))
      .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)))
    return {
      paperId: paper.paperId,
      orderKey: queue.orderKey,
      disposition: compilation.disposition,
      authority: compilation.artifacts.normalizationReport.authority,
      immutableEvidenceRefs: queue.immutableEvidenceRefs,
      family: Object.fromEntries(Object.entries(paper.families).map(([id, value]) => [id, {
        groupCount: value.groupCount,
        objectiveQuestionCount: value.objectiveQuestionCount,
        questionOwnedAbcdSets: value.questionOwnedAbcdSets,
      }])),
      closure: closureDiagnostic({ paper, tree: paper.latestTree, diagnostics }),
      diagnostics,
      diagnosticDigest: digestJson(diagnostics),
      allowedRecoveryActions: [...new Set([
        ...(queue.recoveryActions || []),
        ...recoveryMechanisms(diagnostics),
      ])].sort(),
      measuredWork: {
        compilerInputDocumentCount: requestForPaper(paper).evidence.documents.length,
        latestFileCount: paper.latestTree.fileCount,
        latestByteLength: paper.latestTree.byteLength,
        diagnosticCount: diagnostics.length,
      },
    }
  })
  const dispositionCounts = Object.fromEntries(
    ['ready', 'needs_review', 'unsupported', 'incomplete_source', 'answer_conflict']
      .map((disposition) => [disposition, runs.filter((run) => run.disposition === disposition).length]),
  )
  assert.equal(Object.values(dispositionCounts).reduce((sum, count) => sum + count, 0), EXPECTED_DENOMINATOR.papers, 'each frozen paper must have exactly one disposition')
  const diagnosticCodeCounts = Object.fromEntries([...new Set(runs.flatMap((run) => run.diagnostics.map((item) => item.code)))]
    .sort()
    .map((code) => [code, runs.reduce((count, run) => count + run.diagnostics.filter((item) => item.code === code).length, 0)]))
  const mechanismCounts = Object.fromEntries([...new Set(runs.flatMap((run) => run.allowedRecoveryActions))]
    .sort()
    .map((mechanism) => [mechanism, runs.filter((run) => run.allowedRecoveryActions.includes(mechanism)).map((run) => run.paperId)]))
  return {
    schemaVersion: 'paper-canonical-full-corpus-zero-write-dry-run-v1',
    ticket: '22-full-corpus-zero-write-dry-run',
    binding: {
      ticketFixedPoint: TICKET_FIXED_POINT,
      invocationHead: preflight.head,
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
  const preflight = assertPreflight({ allowEvidenceWrite: writeEvidence })
  const manifest = readJson(MANIFEST_REL)
  const ledger = readJson(LEDGER_REL)
  const beforeState = protectedState()
  const evidence = buildEvidence({ manifest, ledger, beforeState, preflight })
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
