#!/usr/bin/env node

/**
 * Ticket 30 joins the three accepted v41 confirmation lanes without
 * re-materializing them. It proves their bytes still equal their exact PASS
 * commits, derives only the two remaining sources through their accepted
 * public seams, and records a versioned 33-paper unpublished aggregate.
 *
 * `--write` is intentionally narrow: it creates only the Ticket 30 candidate
 * root plus its successor manifest, ledger, and zero-write evidence. It never
 * writes a source capture lane, a shared authority, a publisher/current ref,
 * a corpus asset, or the database.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  resolveCanonicalAuthority,
  trustedDocxCandidateAuthorityRef,
  trustedLegacyCaptureCandidateAuthorityRef,
} from '../shared/paper-canonical/authority.mjs'
import {
  digestJson,
  sha256,
  stableStringify,
  withoutKey,
} from '../shared/paper-canonical/stable.mjs'
import {
  confirmCanonicalCandidate,
  importCanonicalCandidate,
} from '../server/paper-canonical/trustedDocxCanonicalImport.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

const ticketPath = 'docs/cuts/paper-canonical-unification/tickets/30-integrate-confirmed-canonical-corpus.md'
const sourceBaseCommit = 'f9753974dbf77c85fe17d667c124044c37583180'
const laneForkBaseCommit = '3e707415a10e606f8ace5d0aea84267ddefbe7a9'

const sourceCaptureV1Root = 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1'
const sourceCaptureV2Root = 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v2'
const docxSourcePath = 'test-fixtures/paper-import/paper-2025-i-docx-source-adapter/2025-nck1-answer-source.docx'
const docxSourceName = '2025-nck1-answer-source.docx'

const predecessorManifestPath = 'docs/cuts/paper-canonical-unification/migration/manifest-v1.json'
const predecessorLedgerPath = 'docs/cuts/paper-canonical-unification/migration/ledger-v1.json'
const manifestPath = 'docs/cuts/paper-canonical-unification/migration/manifest-v2.json'
const ledgerPath = 'docs/cuts/paper-canonical-unification/migration/ledger-v2.json'
const zeroWriteEvidencePath = 'docs/cuts/paper-canonical-unification/migration/integrated-corpus-zero-write-evidence-v1.json'
const outputRoot = 'test-fixtures/paper-import/paper-canonical-integrated-corpus/ticket-30-v1'

const laneConfigs = Object.freeze([
  Object.freeze({
    ticket: 27,
    commit: '5cab456282803c9ca4de71cef960be5b83438710',
    root: 'test-fixtures/paper-import/paper-canonical-confirmation-lanes/ticket-27-nck1-v1',
    candidateFile: 'import-candidate-v1.json',
    expectedPaperCount: 16,
  }),
  Object.freeze({
    ticket: 28,
    commit: 'e2d1eece81df1c64711fac20fae3111248da05c6',
    root: 'test-fixtures/paper-import/paper-canonical-confirmation-lanes/ticket-28-national-legacy-v1',
    candidateFile: 'candidate-v1.json',
    expectedPaperCount: 9,
  }),
  Object.freeze({
    ticket: 29,
    commit: 'fd033b09d5add2be4ea8713b7c661ea4d9305e8b',
    root: 'test-fixtures/paper-import/paper-canonical-confirmation-lanes/ticket-29-zhejiang-legacy-v1',
    candidateFile: 'import-candidate-v1.json',
    expectedPaperCount: 6,
  }),
])

const protectedRoots = Object.freeze([
  'app/public/paper-assets',
  'data/question-bank.sqlite',
  'scripts/import-pipeline/papers',
  'server/paper-canonical',
  'shared/paper-canonical',
  'standards/paper-canonical',
  predecessorManifestPath,
  predecessorLedgerPath,
  sourceCaptureV1Root,
  sourceCaptureV2Root,
  docxSourcePath,
  ...laneConfigs.map((lane) => lane.root),
])

function absolutePath(relativePath) {
  return resolve(repositoryRoot, relativePath)
}

function canonicalJson(value) {
  return `${stableStringify(value)}\n`
}

function jsonValue(value) {
  return JSON.parse(stableStringify(value))
}

function readBytes(relativePath) {
  return new Uint8Array(readFileSync(absolutePath(relativePath)))
}

function readJson(relativePath) {
  return JSON.parse(new TextDecoder().decode(readBytes(relativePath)))
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    ...options,
  }).trim()
}

function gitBytes(args) {
  return new Uint8Array(execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: null,
  }))
}

function listFiles(relativePath) {
  const root = absolutePath(relativePath)
  if (!existsSync(root)) return []
  const stat = statSync(root)
  if (stat.isFile()) return [{ path: '', bytes: new Uint8Array(readFileSync(root)) }]
  assert.equal(stat.isDirectory(), true, `${relativePath} must be a file or directory`)
  const files = []
  function visit(currentPath, prefix) {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const nextPath = join(currentPath, entry.name)
      const nextRelativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      assert.equal(entry.isSymbolicLink(), false, `${relativePath}/${nextRelativePath} cannot be a symlink`)
      if (entry.isDirectory()) visit(nextPath, nextRelativePath)
      else {
        assert.equal(entry.isFile(), true, `${relativePath}/${nextRelativePath} must be a regular file`)
        files.push({ path: nextRelativePath, bytes: new Uint8Array(readFileSync(nextPath)) })
      }
    }
  }
  visit(root, '')
  return files
}

function fileInfo(relativePath, bytes = readBytes(relativePath)) {
  return {
    path: relativePath,
    fileSha256: sha256(bytes),
    byteLength: bytes.byteLength,
  }
}

function protectedState() {
  const files = protectedRoots.flatMap((root) => listFiles(root).map(({ path, bytes }) => ({
    path: path ? `${root}/${path}` : root,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  }))).sort((left, right) => left.path.localeCompare(right.path))
  return {
    paths: [...protectedRoots],
    fileCount: files.length,
    digest: digestJson(files),
  }
}

function authorityRefForManifest(version) {
  const manifest = readJson(`standards/paper-canonical/manifest-v${version}.json`)
  return {
    manifestId: manifest.manifestId,
    manifestVersion: manifest.version,
    manifestDigest: digestJson(manifest),
  }
}

function assertAuthorities() {
  const v37 = authorityRefForManifest('37')
  const v41 = authorityRefForManifest('41')
  const v42 = authorityRefForManifest('42')

  assert.deepEqual(v37, trustedDocxCandidateAuthorityRef, 'Ticket 30 DOCX Candidate authority must remain v37')
  assert.deepEqual(v42, trustedLegacyCaptureCandidateAuthorityRef, 'Ticket 30 legacy Candidate authority must remain v42')
  for (const authority of [v37, v41, v42]) {
    const resolved = resolveCanonicalAuthority(authority)
    assert.equal(resolved.ok, true, `authority v${authority.manifestVersion} must resolve`)
  }
  return { v37, v41, v42 }
}

function assertProtectedLaneDiffs() {
  const laneProtectedRoots = [
    'app',
    'server',
    'shared',
    'standards',
    'docs/agents',
    'docs/cuts/paper-canonical-unification/migration',
  ]
  for (const lane of laneConfigs) {
    const parents = git(['rev-list', '--parents', '-n', '1', lane.commit]).split(/\s+/)
    assert.deepEqual(
      parents,
      [lane.commit, laneForkBaseCommit],
      `Ticket ${lane.ticket} must remain a direct child of the preserved lane fork base`,
    )
    const protectedDiff = git([
      'diff', '--name-only', laneForkBaseCommit, lane.commit, '--', ...laneProtectedRoots,
    ])
    assert.equal(protectedDiff, '', `Ticket ${lane.ticket} must not write protected shared paths`)
  }
}

function assertIntegrationTopology() {
  git(['cat-file', '-e', `${sourceBaseCommit}^{commit}`])
  git(['merge-base', '--is-ancestor', laneForkBaseCommit, sourceBaseCommit])
  git(['merge-base', '--is-ancestor', sourceBaseCommit, 'HEAD'])
  assertProtectedLaneDiffs()

  for (const lane of laneConfigs) git(['merge-base', '--is-ancestor', lane.commit, 'HEAD'])

  const firstParentMerges = git(['rev-list', '--first-parent', '--parents', `${sourceBaseCommit}..HEAD`])
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(' '))
    .filter((parts) => parts.length === 3)
    .map((parts) => parts[2])
    .filter((commit) => laneConfigs.some((lane) => lane.commit === commit))
    .reverse()
  assert.deepEqual(
    firstParentMerges,
    laneConfigs.map((lane) => lane.commit),
    'Ticket 30 must retain the exact 27 → 28 → 29 merge order',
  )

  const sharedChange = git([
    'diff', '--name-only', sourceBaseCommit, 'HEAD', '--', 'app', 'server', 'shared', 'standards',
  ])
  assert.equal(sharedChange, '', 'Ticket 30 must not alter shared adapter/schema/authority/renderer behavior')
}

function assertTreeMatchesCommit(lane) {
  const expectedPaths = git(['ls-tree', '-r', '--name-only', lane.commit, '--', lane.root])
    .split('\n')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
  const actualPaths = listFiles(lane.root)
    .map(({ path }) => `${lane.root}/${path}`)
    .sort((left, right) => left.localeCompare(right))
  assert.deepEqual(actualPaths, expectedPaths, `Ticket ${lane.ticket} output tree must remain byte-identical to its PASS commit`)

  const records = []
  for (const relativePath of expectedPaths) {
    const current = readBytes(relativePath)
    const committed = gitBytes(['show', `${lane.commit}:${relativePath}`])
    assert.deepEqual(current, committed, `Ticket ${lane.ticket} artifact drifted: ${relativePath}`)
    records.push({ path: relativePath, byteLength: current.byteLength, sha256: sha256(current) })
  }
  return {
    fileCount: records.length,
    treeDigest: digestJson(records),
  }
}

function batchAt(root) {
  const path = `${root}/batch-evidence.json`
  const bytes = readBytes(path)
  const batch = JSON.parse(new TextDecoder().decode(bytes))
  assert.equal(batch.batchDigest, digestJson(withoutKey(batch, 'batchDigest')), `${path} digest must bind its full batch`)
  return { path, bytes, batch }
}

function assertSharedSourceContinuity() {
  const v1 = batchAt(sourceCaptureV1Root)
  const v2 = batchAt(sourceCaptureV2Root)
  assert.deepEqual(v1.batch.membership, {
    frozenPaperCount: 33,
    excludedPaperIds: ['paper-2025-i', 'paper-2026-i'],
    materializedPaperCount: 31,
    paperIds: v1.batch.membership.paperIds,
  })
  assert.deepEqual(v2.batch.membership, {
    frozenPaperCount: 33,
    excludedPaperIds: ['paper-2025-i'],
    materializedPaperCount: 32,
    paperIds: v2.batch.membership.paperIds,
  })

  const v1Ids = v1.batch.membership.paperIds
  const v2Ids = v2.batch.membership.paperIds
  assert.equal(new Set(v1Ids).size, 31, 'v1 source captures must have 31 unique members')
  assert.equal(new Set(v2Ids).size, 32, 'v2 source captures must have 32 unique members')
  assert.deepEqual(
    v2Ids.filter((paperId) => paperId !== 'paper-2026-i'),
    v1Ids,
    'v2 must retain v1’s 31 frozen paper identities in order',
  )
  assert.ok(v2Ids.includes('paper-2026-i'), 'v2 must add paper-2026-i exactly once')

  const v1ById = new Map(v1.batch.papers.map((paper) => [paper.paperId, paper]))
  const v2ById = new Map(v2.batch.papers.map((paper) => [paper.paperId, paper]))
  for (const paperId of v1Ids) {
    const leftRoot = `${sourceCaptureV1Root}/${paperId}`
    const rightRoot = `${sourceCaptureV2Root}/${paperId}`
    const leftFiles = listFiles(leftRoot)
    const rightFiles = listFiles(rightRoot)
    assert.deepEqual(
      leftFiles.map((file) => file.path),
      rightFiles.map((file) => file.path),
      `${paperId} v1/v2 source capture trees must have the same file names`,
    )
    for (let index = 0; index < leftFiles.length; index++) {
      assert.deepEqual(
        leftFiles[index].bytes,
        rightFiles[index].bytes,
        `${paperId} v1/v2 source capture bytes must remain identical`,
      )
    }
    assert.equal(v1ById.get(paperId).capture.captureId, v2ById.get(paperId).capture.captureId)
    assert.equal(v1ById.get(paperId).capture.digest, v2ById.get(paperId).capture.digest)
  }
  return {
    v1: {
      ...fileInfo(v1.path, v1.bytes),
      batchDigest: v1.batch.batchDigest,
      paperCount: v1Ids.length,
    },
    v2: {
      ...fileInfo(v2.path, v2.bytes),
      batchDigest: v2.batch.batchDigest,
      paperCount: v2Ids.length,
    },
    sharedLegacyCaptureCount: v1Ids.length,
    addedV42LegacyPaperId: 'paper-2026-i',
    byteIdentical: true,
  }
}

function candidateBody(candidate) {
  const { candidateDigest: _candidateDigest, sourceBytes: _sourceBytes, ...body } = candidate
  return body
}

function storedCandidate(candidate) {
  const { sourceBytes: _sourceBytes, ...stored } = candidate
  return jsonValue(stored)
}

function candidateFromArtifact(artifact) {
  return artifact?.candidate?.candidateDigest ? artifact.candidate : artifact
}

function confirmationFromArtifact(artifact) {
  return artifact?.teacherConfirmation || artifact?.confirmation || artifact
}

function canonicalFromArtifact(artifact) {
  return artifact?.canonicalPaper || artifact
}

function laneMembership(evidence) {
  const membership = evidence.membership || {}
  return membership.paperIds || membership.approvedPaperIds || []
}

function laneArtifactPaths(lane, paperId) {
  return {
    candidate: `${lane.root}/${paperId}/${lane.candidateFile}`,
    confirmation: `${lane.root}/${paperId}/teacher-confirmation-v1.json`,
    canonical: `${lane.root}/${paperId}/canonical-paper-v1.json`,
  }
}

function assertNoPublication(value, label) {
  assert.equal(Object.hasOwn(value, 'publication'), false, `${label} cannot expose a publication`)
  assert.equal(Object.hasOwn(value, 'current'), false, `${label} cannot expose a current ref`)
}

function inspectLane(lane, v41) {
  const committedTree = assertTreeMatchesCommit(lane)
  const evidencePath = `${lane.root}/lane-evidence-v1.json`
  const evidenceBytes = readBytes(evidencePath)
  const evidence = JSON.parse(new TextDecoder().decode(evidenceBytes))
  const evidenceDigestKey = Object.hasOwn(evidence, 'evidenceDigest')
    ? 'evidenceDigest'
    : (Object.hasOwn(evidence, 'artifactDigest') ? 'artifactDigest' : null)
  if (evidenceDigestKey) {
    assert.equal(
      evidence[evidenceDigestKey],
      digestJson(withoutKey(evidence, evidenceDigestKey)),
      `Ticket ${lane.ticket} lane evidence digest must bind all records`,
    )
  }
  const paperIds = laneMembership(evidence)
  assert.equal(paperIds.length, lane.expectedPaperCount, `Ticket ${lane.ticket} membership count drifted`)
  assert.equal(new Set(paperIds).size, lane.expectedPaperCount, `Ticket ${lane.ticket} membership must be unique`)

  const expectedFiles = [
    'lane-evidence-v1.json',
    ...paperIds.flatMap((paperId) => [
      `${paperId}/${lane.candidateFile}`,
      `${paperId}/teacher-confirmation-v1.json`,
      `${paperId}/canonical-paper-v1.json`,
    ]),
  ].sort((left, right) => left.localeCompare(right))
  assert.deepEqual(
    listFiles(lane.root).map((file) => file.path),
    expectedFiles,
    `Ticket ${lane.ticket} must retain exactly its accepted artifact set`,
  )

  const records = paperIds.map((paperId) => {
    const paths = laneArtifactPaths(lane, paperId)
    const candidateBytes = readBytes(paths.candidate)
    const confirmationBytes = readBytes(paths.confirmation)
    const canonicalBytes = readBytes(paths.canonical)
    const candidate = candidateFromArtifact(JSON.parse(new TextDecoder().decode(candidateBytes)))
    const confirmation = confirmationFromArtifact(JSON.parse(new TextDecoder().decode(confirmationBytes)))
    const canonical = canonicalFromArtifact(JSON.parse(new TextDecoder().decode(canonicalBytes)))
    assert.equal(candidate.candidateDigest, digestJson(candidateBody(candidate)), `${paperId} stored Candidate digest must be exact`)
    assert.deepEqual(candidate.authority, v41, `${paperId} must retain its accepted v41 Candidate authority`)
    assert.deepEqual(candidate.issues, [], `${paperId} cannot retain unresolved Candidate issues`)
    assert.equal(candidate.source.paperId, paperId)

    const sourceCapturePath = `${sourceCaptureV1Root}/${paperId}/source-capture-v1.json`
    const sourceCaptureBytes = readBytes(sourceCapturePath)
    const sourceCapture = JSON.parse(new TextDecoder().decode(sourceCaptureBytes))
    assert.equal(candidate.source.sha256, sha256(sourceCaptureBytes), `${paperId} Candidate must bind exact v41 source capture bytes`)
    assert.equal(candidate.source.byteLength, sourceCaptureBytes.byteLength)
    assert.equal(candidate.source.captureId, sourceCapture.captureId)
    assert.equal(candidate.source.captureDigest, sourceCapture.digest)
    assert.deepEqual(confirmation, {
      schemaVersion: 'teacher-confirmation-v1',
      candidateDigest: candidate.candidateDigest,
      sourceDigest: candidate.source.sha256,
      confirmed: true,
    }, `${paperId} Teacher Confirmation must bind the exact source and Candidate`)
    assert.equal(canonical.paperPlan?.completeness?.status, 'complete', `${paperId} must have one complete Canonical Paper`)
    assert.deepEqual(canonical.paperPlan.authorityRef, candidate.authority, `${paperId} Canonical Paper authority must bind its Candidate authority`)
    assertNoPublication(canonical, `${paperId} Canonical Paper`)

    return {
      paperId,
      profileId: candidate.interpretation?.profileId,
      sourceType: 'legacy-json',
      authority: jsonValue(candidate.authority),
      sourceCapture: {
        ...fileInfo(sourceCapturePath, sourceCaptureBytes),
        sourceCaptureId: sourceCapture.captureId,
        sourceCaptureDigest: sourceCapture.digest,
      },
      candidate: {
        ...fileInfo(paths.candidate, candidateBytes),
        candidateDigest: candidate.candidateDigest,
      },
      confirmation: {
        ...fileInfo(paths.confirmation, confirmationBytes),
        confirmationDigest: digestJson(confirmation),
        candidateDigest: confirmation.candidateDigest,
        sourceDigest: confirmation.sourceDigest,
      },
      canonicalPaper: {
        ...fileInfo(paths.canonical, canonicalBytes),
        canonicalPaperDigest: digestJson(canonical),
        groupCount: canonical.questionGroups.length,
        completeness: 'complete',
        publication: 'unpublished',
      },
      lane: {
        ticket: lane.ticket,
        commit: lane.commit,
        evidencePath,
        evidenceDigest: evidence.evidenceDigest,
      },
    }
  })
  return {
    lane: {
      ticket: lane.ticket,
      commit: lane.commit,
      artifactRoot: lane.root,
      ...committedTree,
      evidence: {
        ...fileInfo(evidencePath, evidenceBytes),
        evidenceDigest: evidence.evidenceDigest,
      },
      paperIds: [...paperIds],
    },
    records,
  }
}

function sourceCaptureForDocx(candidate) {
  const source = {
    path: docxSourcePath,
    ...jsonValue(candidate.source),
  }
  const body = {
    schemaVersion: 'ticket-30-trusted-docx-source-capture-v1',
    paperId: 'paper-2025-i',
    sourceType: 'trusted-docx',
    authority: jsonValue(candidate.authority),
    source,
  }
  const digest = digestJson(body)
  return {
    ...body,
    captureId: `source-capture:${digest.slice('sha256:'.length, 28)}`,
    digest,
  }
}

function deriveRemainderPaper({ paperId, sourceType, input, operatorChoices, authority, sourceCapturePath }) {
  const first = importCanonicalCandidate(input, operatorChoices)
  const second = importCanonicalCandidate(input, operatorChoices)
  assert.ok(first.candidate, `${paperId} must derive one Candidate`)
  assert.deepEqual(storedCandidate(first.candidate), storedCandidate(second.candidate), `${paperId} Candidate derivation must be deterministic`)
  const candidate = first.candidate
  assert.deepEqual(candidate.authority, authority, `${paperId} must use its accepted authority`)
  assert.deepEqual(candidate.issues, [], `${paperId} cannot retain unresolved Candidate issues`)
  assert.equal(candidate.candidateDigest, digestJson(candidateBody(candidate)), `${paperId} Candidate digest must bind exact semantics`)
  assert.equal(candidate.interpretation?.paperId, paperId)

  const confirmation = {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: candidate.candidateDigest,
    sourceDigest: candidate.source.sha256,
    confirmed: true,
  }
  const confirmed = confirmCanonicalCandidate(candidate, confirmation)
  assert.ok(confirmed.canonicalPaper, `${paperId} Confirmation must produce one Canonical Paper`)
  assert.equal('unresolvedIssues' in confirmed, false, `${paperId} cannot retain partial unresolved output`)
  assert.equal('publication' in confirmed, false, `${paperId} confirmation cannot publish`)
  assert.deepEqual(confirmed.confirmation, {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: candidate.candidateDigest,
    sourceDigest: candidate.source.sha256,
  })
  assert.equal(confirmed.canonicalPaper.paperPlan?.completeness?.status, 'complete')
  assertNoPublication(confirmed.canonicalPaper, `${paperId} Canonical Paper`)

  const candidateText = canonicalJson(storedCandidate(candidate))
  const confirmationText = canonicalJson(confirmation)
  const sourceCaptureBytes = sourceCapturePath ? readBytes(sourceCapturePath) : null
  const sourceCapture = sourceCapturePath ? JSON.parse(new TextDecoder().decode(sourceCaptureBytes)) : sourceCaptureForDocx(candidate)
  const sourceCaptureText = sourceCapturePath ? null : canonicalJson(sourceCapture)
  const sourceCaptureRelativePath = sourceCapturePath || `${outputRoot}/${paperId}/source-capture-v1.json`
  const canonicalArtifact = {
    schemaVersion: 'ticket-30-integrated-canonical-paper-v1',
    paperId,
    sourceType,
    sourceCapture: {
      path: sourceCaptureRelativePath,
      captureId: sourceCapture.captureId,
      captureDigest: sourceCapture.digest,
    },
    candidateDigest: candidate.candidateDigest,
    sourceDigest: candidate.source.sha256,
    confirmation: jsonValue(confirmed.confirmation),
    canonicalPaper: jsonValue(confirmed.canonicalPaper),
  }
  const canonicalText = canonicalJson(canonicalArtifact)
  const candidatePath = `${outputRoot}/${paperId}/import-candidate-v1.json`
  const confirmationPath = `${outputRoot}/${paperId}/teacher-confirmation-v1.json`
  const canonicalPath = `${outputRoot}/${paperId}/canonical-paper-v1.json`
  const files = new Map([
    [candidatePath, candidateText],
    [confirmationPath, confirmationText],
    [canonicalPath, canonicalText],
  ])
  if (sourceCaptureText) files.set(sourceCaptureRelativePath, sourceCaptureText)

  const sourceCaptureFileBytes = sourceCaptureBytes || new TextEncoder().encode(sourceCaptureText)
  assert.equal(candidate.source.sha256, sha256(sourceCapturePath ? sourceCaptureFileBytes : readBytes(docxSourcePath)), `${paperId} Candidate must bind its immutable source bytes`)
  if (sourceType === 'legacy-json') {
    assert.equal(candidate.source.mediaType, 'application/vnd.eqb.ticket-26-source-capture+json')
    assert.equal(candidate.source.captureId, sourceCapture.captureId)
    assert.equal(candidate.source.captureDigest, sourceCapture.digest)
  } else {
    assert.equal(candidate.source.mediaType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    assert.equal(Object.hasOwn(candidate.source, 'captureId'), false, 'DOCX source must not be represented as a legacy capture input')
  }

  return {
    files,
    record: {
      paperId,
      profileId: candidate.interpretation.profileId,
      sourceType,
      authority: jsonValue(candidate.authority),
      sourceCapture: {
        ...fileInfo(sourceCaptureRelativePath, sourceCaptureFileBytes),
        sourceCaptureId: sourceCapture.captureId,
        sourceCaptureDigest: sourceCapture.digest,
      },
      candidate: {
        ...fileInfo(candidatePath, new TextEncoder().encode(candidateText)),
        candidateDigest: candidate.candidateDigest,
      },
      confirmation: {
        ...fileInfo(confirmationPath, new TextEncoder().encode(confirmationText)),
        confirmationDigest: digestJson(confirmation),
        candidateDigest: confirmation.candidateDigest,
        sourceDigest: confirmation.sourceDigest,
      },
      canonicalPaper: {
        ...fileInfo(canonicalPath, new TextEncoder().encode(canonicalText)),
        canonicalPaperDigest: digestJson(confirmed.canonicalPaper),
        groupCount: confirmed.canonicalPaper.questionGroups.length,
        completeness: 'complete',
        publication: 'unpublished',
      },
      lane: null,
    },
  }
}

function deriveRemainder(authorities) {
  const docx = deriveRemainderPaper({
    paperId: 'paper-2025-i',
    sourceType: 'trusted-docx',
    input: readBytes(docxSourcePath),
    operatorChoices: { originalName: docxSourceName },
    authority: authorities.v37,
    sourceCapturePath: null,
  })
  const legacySourceCapturePath = `${sourceCaptureV2Root}/paper-2026-i/source-capture-v1.json`
  const legacy = deriveRemainderPaper({
    paperId: 'paper-2026-i',
    sourceType: 'legacy-json',
    input: {
      kind: 'ticket-26-source-capture-v1',
      sourceCaptureBytes: readBytes(legacySourceCapturePath),
    },
    operatorChoices: undefined,
    authority: authorities.v42,
    sourceCapturePath: legacySourceCapturePath,
  })
  assert.equal(docx.record.authority.manifestVersion, '37')
  assert.equal(legacy.record.authority.manifestVersion, '42')
  assert.notEqual(docx.record.sourceType, legacy.record.sourceType, 'the two seam-pair sources must remain type-separated')
  return {
    files: new Map([...docx.files, ...legacy.files]),
    records: [docx.record, legacy.record],
  }
}

function countBy(records, selector) {
  return Object.fromEntries([...records.reduce((counts, record) => {
    const key = selector(record)
    counts.set(key, (counts.get(key) || 0) + 1)
    return counts
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function buildManifest({ records, lanes, continuity }) {
  const predecessorManifestBytes = readBytes(predecessorManifestPath)
  const predecessorLedgerBytes = readBytes(predecessorLedgerPath)
  const predecessorManifest = JSON.parse(new TextDecoder().decode(predecessorManifestBytes))
  const predecessorLedger = JSON.parse(new TextDecoder().decode(predecessorLedgerBytes))
  const expectedPaperIds = predecessorManifest.corpusInputs.latestPaperIds
  assert.equal(expectedPaperIds.length, 33, 'the frozen source manifest must retain the 33-paper denominator')
  assert.equal(new Set(expectedPaperIds).size, 33, 'the frozen source manifest denominator must be unique')
  assert.deepEqual(records.map((record) => record.paperId), expectedPaperIds, 'integrated membership must match the frozen corpus exactly')
  assert.equal(new Set(records.map((record) => record.paperId)).size, 33, 'integrated membership must not duplicate a paper')

  const sourceTypes = countBy(records, (record) => record.sourceType)
  const authorityVersions = countBy(records, (record) => record.authority.manifestVersion)
  const profileIds = countBy(records, (record) => record.profileId)
  assert.deepEqual(sourceTypes, { 'legacy-json': 32, 'trusted-docx': 1 })
  assert.deepEqual(authorityVersions, { '37': 1, '41': 31, '42': 1 })
  assert.deepEqual(profileIds, predecessorManifest.census.profileCandidateTotals)
  assert.ok(records.every((record) => record.confirmation.candidateDigest === record.candidate.candidateDigest))
  assert.ok(records.every((record) => record.confirmation.sourceDigest.startsWith('sha256:')))
  assert.ok(records.every((record) => record.canonicalPaper.completeness === 'complete' && record.canonicalPaper.publication === 'unpublished'))

  const body = {
    schemaVersion: 'paper-canonical-migration-manifest-v2',
    version: '2',
    manifestId: 'paper-canonical-migration',
    predecessor: {
      manifest: {
        ...fileInfo(predecessorManifestPath, predecessorManifestBytes),
        manifestDigest: predecessorManifest.manifestDigest,
      },
      ledger: {
        ...fileInfo(predecessorLedgerPath, predecessorLedgerBytes),
        ledgerDigest: predecessorLedger.ledgerDigest,
      },
    },
    ticket: {
      path: ticketPath,
      sourceBaseCommit,
      laneForkBaseCommit,
      laneCommits: laneConfigs.map((lane) => ({ ticket: lane.ticket, commit: lane.commit })),
    },
    frozenCensus: jsonValue(predecessorManifest.census),
    sourceContinuity: jsonValue(continuity),
    lanes: lanes.map((lane) => jsonValue(lane)),
    membership: {
      paperIds: [...expectedPaperIds],
      sourceCaptures: records.length,
      importCandidates: records.length,
      teacherConfirmations: records.length,
      completeUnpublishedCanonicalPapers: records.length,
      unresolvedPapers: 0,
      duplicatePaperIds: [],
      missingPaperIds: [],
      sourceTypeCounts: sourceTypes,
      authorityManifestVersionCounts: authorityVersions,
    },
    papers: records.map((record) => jsonValue(record)),
    publication: {
      publications: 0,
      currentRefs: 0,
      canonicalSelections: 0,
    },
    sharedBehaviorChanges: [],
  }
  return {
    ...body,
    manifestDigest: digestJson(body),
  }
}

function buildLedger({ manifest, manifestText, protectedSnapshot }) {
  const predecessorLedgerBytes = readBytes(predecessorLedgerPath)
  const predecessorLedger = JSON.parse(new TextDecoder().decode(predecessorLedgerBytes))
  const body = {
    schemaVersion: 'paper-canonical-migration-ledger-v2',
    version: '2',
    ledgerId: 'paper-canonical-migration',
    predecessor: {
      ...fileInfo(predecessorLedgerPath, predecessorLedgerBytes),
      ledgerDigest: predecessorLedger.ledgerDigest,
    },
    manifest: {
      ...fileInfo(manifestPath, new TextEncoder().encode(manifestText)),
      manifestDigest: manifest.manifestDigest,
    },
    accounting: {
      paper: {
        inScope: 33,
        pending: 0,
        blocked: 0,
        readyUnpublished: 33,
        publishedUnverified: 0,
        canonicalSelected: 0,
        rolledBack: 0,
      },
      source: {
        sourceCaptures: 33,
        legacyJson: 32,
        trustedDocx: 1,
      },
      candidate: {
        importCandidates: 33,
        teacherConfirmations: 33,
        completeUnpublishedCanonicalPapers: 33,
        unresolvedPapers: 0,
      },
      publication: {
        publications: 0,
        currentRefs: 0,
        canonicalSelections: 0,
        rollbackTargets: 0,
      },
    },
    zeroMutation: {
      mode: 'ticket-30-unpublished-integration',
      protectedStateBefore: protectedSnapshot,
      protectedStateAfter: protectedSnapshot,
      equal: true,
      mutationCount: 0,
      writesPerformedByIntegration: [],
    },
    scopeBoundary: {
      noSourceCaptureRewrite: true,
      noAuthorityVersionChange: true,
      noSharedAdapterSchemaRendererChange: true,
      noPublication: true,
      noCurrentRefs: true,
      noProductionOrR2: true,
      noTicket31Implementation: true,
    },
  }
  return {
    ...body,
    ledgerDigest: digestJson(body),
  }
}

function buildZeroWriteEvidence({ manifest, manifestText, ledger, ledgerText, continuity, protectedSnapshot }) {
  const body = {
    schemaVersion: 'ticket-30-integrated-corpus-zero-write-evidence-v1',
    ticket: {
      path: ticketPath,
      sourceBaseCommit,
      laneForkBaseCommit,
      laneCommits: laneConfigs.map((lane) => ({ ticket: lane.ticket, commit: lane.commit })),
    },
    aggregate: {
      membershipDigest: digestJson(manifest.papers.map((record) => ({
        paperId: record.paperId,
        sourceCaptureDigest: record.sourceCapture.sourceCaptureDigest,
        candidateDigest: record.candidate.candidateDigest,
        confirmationDigest: record.confirmation.confirmationDigest,
        canonicalPaperDigest: record.canonicalPaper.canonicalPaperDigest,
      }))),
      paperCount: manifest.membership.paperIds.length,
      sourceCaptures: manifest.membership.sourceCaptures,
      importCandidates: manifest.membership.importCandidates,
      teacherConfirmations: manifest.membership.teacherConfirmations,
      completeUnpublishedCanonicalPapers: manifest.membership.completeUnpublishedCanonicalPapers,
      unresolvedPapers: manifest.membership.unresolvedPapers,
      publications: manifest.publication.publications,
      currentRefs: manifest.publication.currentRefs,
      sourceTypeCounts: manifest.membership.sourceTypeCounts,
      authorityManifestVersionCounts: manifest.membership.authorityManifestVersionCounts,
    },
    sourceContinuity: jsonValue(continuity),
    artifacts: {
      manifest: {
        ...fileInfo(manifestPath, new TextEncoder().encode(manifestText)),
        manifestDigest: manifest.manifestDigest,
      },
      ledger: {
        ...fileInfo(ledgerPath, new TextEncoder().encode(ledgerText)),
        ledgerDigest: ledger.ledgerDigest,
      },
      candidateRoot: outputRoot,
    },
    zeroMutation: {
      protectedStateBefore: protectedSnapshot,
      protectedStateAfter: protectedSnapshot,
      equal: true,
      mutationCount: 0,
      writesPerformedByVerification: [],
    },
    invariants: {
      allOrNoneCanonicalOutcome: true,
      allCanonicalPapersUnpublished: true,
      noDuplicatePaperIds: true,
      noMissingPaperIds: true,
      noUnresolvedPapers: true,
      noPublicationOrCurrentRefs: true,
      sourceTypeSeparation: true,
    },
  }
  return {
    ...body,
    evidenceDigest: digestJson(body),
  }
}

function deriveArtifacts() {
  assertIntegrationTopology()
  const authorities = assertAuthorities()
  const continuity = assertSharedSourceContinuity()
  const lanes = laneConfigs.map((lane) => inspectLane(lane, authorities.v41))
  const laneRecords = lanes.flatMap((lane) => lane.records)
  assert.equal(laneRecords.length, 31, 'the three accepted lanes must contribute exactly 31 papers')

  const remainder = deriveRemainder(authorities)
  const byPaperId = new Map([...laneRecords, ...remainder.records].map((record) => [record.paperId, record]))
  assert.equal(byPaperId.size, 33, 'the integrated corpus must have 33 unique members before accounting')
  const predecessorManifest = readJson(predecessorManifestPath)
  const records = predecessorManifest.corpusInputs.latestPaperIds.map((paperId) => {
    const record = byPaperId.get(paperId)
    assert.ok(record, `integrated corpus is missing ${paperId}`)
    return record
  })

  const protectedSnapshot = protectedState()
  const manifest = buildManifest({
    records,
    lanes: lanes.map((lane) => lane.lane),
    continuity,
  })
  assert.equal(manifest.manifestDigest, digestJson(withoutKey(manifest, 'manifestDigest')))
  const manifestText = canonicalJson(manifest)
  const ledger = buildLedger({ manifest, manifestText, protectedSnapshot })
  assert.equal(ledger.ledgerDigest, digestJson(withoutKey(ledger, 'ledgerDigest')))
  const ledgerText = canonicalJson(ledger)
  const evidence = buildZeroWriteEvidence({
    manifest,
    manifestText,
    ledger,
    ledgerText,
    continuity,
    protectedSnapshot,
  })
  assert.equal(evidence.evidenceDigest, digestJson(withoutKey(evidence, 'evidenceDigest')))

  const files = new Map(remainder.files)
  files.set(manifestPath, manifestText)
  files.set(ledgerPath, ledgerText)
  files.set(zeroWriteEvidencePath, canonicalJson(evidence))
  return {
    files,
    protectedSnapshot,
    summary: {
      sourceBaseCommit,
      laneForkBaseCommit,
      laneCommits: laneConfigs.map((lane) => ({ ticket: lane.ticket, commit: lane.commit })),
      paperCount: 33,
      sourceCaptures: 33,
      importCandidates: 33,
      teacherConfirmations: 33,
      completeUnpublishedCanonicalPapers: 33,
      sourceTypeCounts: manifest.membership.sourceTypeCounts,
      authorityManifestVersionCounts: manifest.membership.authorityManifestVersionCounts,
      manifest: { path: manifestPath, digest: manifest.manifestDigest },
      ledger: { path: ledgerPath, digest: ledger.ledgerDigest },
      zeroWriteEvidence: { path: zeroWriteEvidencePath, digest: evidence.evidenceDigest },
    },
  }
}

function expectedOutputFiles(files) {
  return [...files.keys()].sort((left, right) => left.localeCompare(right))
}

function verifyWrittenArtifacts(derived) {
  for (const [relativePath, expected] of derived.files) {
    assert.equal(existsSync(absolutePath(relativePath)), true, `Ticket 30 artifact is missing: ${relativePath}`)
    const actual = new TextDecoder().decode(readBytes(relativePath))
    assert.equal(actual, expected, `Ticket 30 artifact does not deterministically replay: ${relativePath}`)
  }
  const expectedRoot = expectedOutputFiles(new Map([...derived.files].filter(([path]) => path.startsWith(`${outputRoot}/`))))
    .map((path) => path.slice(`${outputRoot}/`.length))
  assert.deepEqual(
    listFiles(outputRoot).map((file) => file.path),
    expectedRoot,
    'Ticket 30 candidate root must contain exactly its two-paper artifact set',
  )
  assert.deepEqual(protectedState(), derived.protectedSnapshot, 'Ticket 30 must preserve all protected source and publication state')
}

async function writeArtifacts(derived) {
  const targets = expectedOutputFiles(derived.files)
  for (const relativePath of targets) {
    assert.equal(existsSync(absolutePath(relativePath)), false, `refusing to overwrite an existing Ticket 30 artifact: ${relativePath}`)
  }
  const temporaryRoot = await mkdtemp(join(repositoryRoot, '.ticket-30-integrated-'))
  const renamed = []
  try {
    for (const [relativePath, text] of derived.files) {
      const staged = join(temporaryRoot, relativePath)
      await mkdir(dirname(staged), { recursive: true })
      await writeFile(staged, text, 'utf8')
    }
    for (const relativePath of targets) {
      const destination = absolutePath(relativePath)
      await mkdir(dirname(destination), { recursive: true })
      await rename(join(temporaryRoot, relativePath), destination)
      renamed.push(relativePath)
    }
  } catch (error) {
    await Promise.all(renamed.map((relativePath) => rm(absolutePath(relativePath), { force: true })))
    throw error
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

async function main() {
  const args = process.argv.slice(2)
  assert.ok(
    args.length === 0 || (args.length === 1 && args[0] === '--write'),
    'usage: node scripts/verify-paper-canonical-ticket-30-integrated-corpus.mjs [--write]',
  )
  const write = args[0] === '--write'
  const derived = deriveArtifacts()
  if (write) await writeArtifacts(derived)
  const replay = write ? deriveArtifacts() : derived
  verifyWrittenArtifacts(replay)
  console.log(JSON.stringify({ status: 'PASS', ticket: 30, ...replay.summary }))
}

await main()
