#!/usr/bin/env node

/**
 * The only producer for the paper-2026-i v44 Ticket 35 authority successor. It never rewrites
 * v2 bytes: it derives a new Candidate -> Confirmation -> Canonical chain
 * from the frozen Ticket 26 capture, then atomically publishes source asset v3.
 */

import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import { digestJson, sha256, stableStringify, withoutKey } from '../shared/paper-canonical/stable.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const paperId = 'paper-2026-i'
const successorAuthorityVersion = '44'
const sourceAssetVersion = 3
const expectedOccurrenceDigest =
  'sha256:f864c176a692e39611bd08f3574f2e626934554b7056057e54f78ac145b40cd4'
const manifestV2Path = 'docs/cuts/paper-canonical-unification/migration/manifest-v2.json'
const predecessorRoot = 'test-fixtures/paper-canonical/publications/ticket-32-remaining-v1/store'
const successorRoot = 'test-fixtures/paper-import/paper-canonical-ticket-35-authority-successor/paper-2026-i-v1'
const successorRegistryPath =
  'docs/cuts/paper-canonical-unification/migration/paper-2026-i-ticket-35-authority-successor-v1.json'
const accountingPath =
  'docs/cuts/paper-canonical-unification/migration/paper-2026-i-ticket-35-authority-successor-publication-accounting-v1.json'

function absolutePath(relativePath) {
  assert.equal(typeof relativePath, 'string', 'repository path must be a string')
  assert.equal(relativePath.startsWith('/'), false, `${relativePath} must be repository-relative`)
  assert.equal(relativePath.includes('..'), false, `${relativePath} must not escape the repository`)
  const target = resolve(repositoryRoot, relativePath)
  assert.equal(target.startsWith(`${repositoryRoot}${sep}`), true, `${relativePath} must remain inside the repository`)
  return target
}

function bytes(relativePath) {
  return new Uint8Array(readFileSync(absolutePath(relativePath)))
}

function json(relativePath) {
  return JSON.parse(new TextDecoder().decode(bytes(relativePath)))
}

function stableBytes(value) {
  return new TextEncoder().encode(`${stableStringify(value)}\n`)
}

function descriptor(relativePath, value, semanticKey) {
  const valueBytes = value instanceof Uint8Array ? value : stableBytes(value)
  return {
    path: relativePath,
    byteLength: valueBytes.byteLength,
    fileSha256: sha256(valueBytes),
    ...(semanticKey ? { [semanticKey]: digestJson(value) } : {}),
  }
}

function writeExact(relativePath, value) {
  const output = value instanceof Uint8Array ? value : stableBytes(value)
  const target = absolutePath(relativePath)
  if (existsSync(target)) {
    assert.deepEqual(
      new Uint8Array(readFileSync(target)),
      output,
      `${relativePath} already exists with different immutable bytes`,
    )
    return false
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, output)
  return true
}

function treeSnapshot(relativeRoot) {
  const root = absolutePath(relativeRoot)
  const files = []
  const visit = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const next = join(directory, entry.name)
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      assert.equal(entry.isSymbolicLink(), false, `${relativeRoot}/${relative} cannot be a symlink`)
      if (entry.isDirectory()) visit(next, relative)
      else {
        assert.equal(entry.isFile(), true, `${relativeRoot}/${relative} must be a regular file`)
        const value = new Uint8Array(readFileSync(next))
        files.push({ path: relative, byteLength: value.byteLength, sha256: sha256(value) })
      }
    }
  }
  visit(root)
  return { root: relativeRoot, files, treeDigest: digestJson(files) }
}

function compactSnapshot(snapshot) {
  return { root: snapshot.root, fileCount: snapshot.files.length, treeDigest: snapshot.treeDigest }
}

function recordForPaper() {
  const manifest = json(manifestV2Path)
  assert.equal(manifest.manifestDigest, digestJson(withoutKey(manifest, 'manifestDigest')), 'frozen migration manifest must close')
  const matches = manifest.papers.filter((record) => record.paperId === paperId)
  assert.equal(matches.length, 1, 'frozen migration manifest must contain one paper-2026-i record')
  return matches[0]
}

function predecessorSnapshot(record) {
  const versionRoot = `${predecessorRoot}/${paperId}/versions/v2`
  const publicationPath = `${versionRoot}/canonical/canonical-paper-publication-v43.json`
  const publication = json(publicationPath)
  return {
    authority: publication.authority,
    sourceCapture: record.sourceCapture,
    candidate: record.candidate,
    confirmation: record.confirmation,
    canonicalPaper: record.canonicalPaper,
    publication: {
      path: publicationPath,
      byteLength: bytes(publicationPath).byteLength,
      fileSha256: sha256(bytes(publicationPath)),
      publicationDigest: publication.publicationDigest,
      versionName: 'v2',
      sourceAssetVersion: 2,
    },
    immutableVersionTree: compactSnapshot(treeSnapshot(versionRoot)),
  }
}

function materializeAuthorityArtifacts() {
  const rhythm = json('standards/paper-canonical/rendering/grammar-fill-rhythm-v7.json')
  const rhythmSchema = json('schemas/paper-canonical/grammar-fill-rhythm-v7.schema.json')
  const manifest = json('standards/paper-canonical/manifest-v44.json')
  assert.equal(rhythm.schemaVersion, 'grammar-fill-rhythm-v7')
  assert.equal(rhythm.version, '7')
  assert.equal(rhythm.publicArtifactOracle.sourceAssetVersion, sourceAssetVersion)
  assert.equal(rhythm.publicArtifactOracle.expectedProjectedOccurrenceDigest, expectedOccurrenceDigest)
  assert.deepEqual(rhythmSchema.const, rhythm)
  assert.equal(
    manifest.artifacts.find((artifact) => artifact.id === 'renderer-grammar-fill-rhythm')?.sha256,
    digestJson(rhythm),
  )
  return { rhythm, manifest }
}

function persistedCandidate(candidate) {
  const { sourceBytes: _sourceBytes, ...artifact } = candidate
  return artifact
}

function successorRegistry({ record, predecessor, candidate, confirmation, canonicalPaper }) {
  const candidatePath = `${successorRoot}/import-candidate-v1.json`
  const confirmationPath = `${successorRoot}/teacher-confirmation-v1.json`
  const canonicalPath = `${successorRoot}/canonical-paper-v1.json`
  const body = {
    schemaVersion: 'paper-2026-i-ticket-35-authority-successor-v1',
    correctionId: 'paper-2026-i-v43-grammar-fill-rule-successor',
    paperId,
    sourceType: 'legacy-json',
    authority: canonicalPaper.paperPlan.authorityRef,
    predecessor: {
      authority: predecessor.authority,
      publicationDigest: predecessor.publication.publicationDigest,
      versionName: predecessor.publication.versionName,
      sourceAssetVersion: predecessor.publication.sourceAssetVersion,
    },
    sourceCapture: record.sourceCapture,
    candidate: {
      ...descriptor(candidatePath, candidate, 'candidateDigest'),
      candidateDigest: candidate.candidateDigest,
    },
    confirmation: {
      ...descriptor(confirmationPath, confirmation, 'confirmationDigest'),
      confirmationDigest: digestJson(confirmation),
      candidateDigest: confirmation.candidateDigest,
      sourceDigest: confirmation.sourceDigest,
    },
    canonicalPaper: {
      ...descriptor(canonicalPath, canonicalPaper, 'canonicalPaperDigest'),
      canonicalPaperDigest: digestJson(canonicalPaper),
      completeness: 'complete',
      publication: 'unpublished',
    },
    sourceBinding: {
      sourceCaptureDigest: record.sourceCapture.sourceCaptureDigest,
      sourceDigest: confirmation.sourceDigest,
      officialAnswerInputKey: 'latest_official_answer_lead',
      expectedProjectedOccurrenceDigest: expectedOccurrenceDigest,
    },
  }
  return { ...body, evidenceDigest: digestJson(body) }
}

async function materializeSuccessor({ record, predecessor }) {
  const sourceCaptureBytes = bytes(record.sourceCapture.path)
  const { importPaper2026ISuccessorCandidate, confirmCanonicalCandidate } = await import('../shared/paper-canonical/compiler.mjs')
  const imported = importPaper2026ISuccessorCandidate(sourceCaptureBytes)
  assert.ok(imported.candidate, 'the frozen source capture must derive one successor Candidate')
  assert.deepEqual(imported.issues, [], 'the successor Candidate must have no issues')
  assert.equal(imported.candidate.authority.manifestVersion, successorAuthorityVersion, 'only paper-2026-i receives the v44 successor authority')
  const confirmation = {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: imported.candidate.candidateDigest,
    sourceDigest: imported.candidate.source.sha256,
    confirmed: true,
  }
  const confirmed = confirmCanonicalCandidate(imported.candidate, confirmation)
  assert.ok(confirmed.canonicalPaper, 'the exact confirmed successor Candidate must derive one Canonical Paper')
  assert.equal(confirmed.canonicalPaper.paperPlan.authorityRef.manifestVersion, successorAuthorityVersion, 'successor Canonical Paper must retain v44')
  const candidate = persistedCandidate(imported.candidate)
  const canonicalPaper = confirmed.canonicalPaper
  writeExact(`${successorRoot}/import-candidate-v1.json`, candidate)
  writeExact(`${successorRoot}/teacher-confirmation-v1.json`, confirmation)
  writeExact(`${successorRoot}/canonical-paper-v1.json`, canonicalPaper)
  const registry = successorRegistry({ record, predecessor, candidate, confirmation, canonicalPaper })
  writeExact(successorRegistryPath, registry)
  return { candidate, confirmation, canonicalPaper, registry, sourceCaptureBytes }
}

async function publishSuccessor({ materialized }) {
  const { publishCanonicalPaperPublication } = await import('../server/paper-canonical/publication.mjs')
  const dbPath = absolutePath(`${predecessorRoot}/publication.sqlite`)
  const db = new DatabaseSync(dbPath)
  try {
    const published = publishCanonicalPaperPublication({
      rootDir: absolutePath(predecessorRoot),
      db,
      sourceAssetVersion,
      registeredConfirmation: {
        schemaVersion: 'registered-confirmed-canonical-admission-v1',
        paperId,
        sourceBytes: materialized.sourceCaptureBytes,
        candidateBytes: bytes(`${successorRoot}/import-candidate-v1.json`),
        confirmationBytes: bytes(`${successorRoot}/teacher-confirmation-v1.json`),
        canonicalPaperBytes: bytes(`${successorRoot}/canonical-paper-v1.json`),
      },
    })
    assert.ok(
      ['published', 'idempotent'].includes(published.status),
      `successor publication must publish once or retry identically: ${JSON.stringify(published)}`,
    )
    assert.equal(published.versionName, 'v3', 'successor publication must occupy immutable version v3')
    return published
  } finally {
    db.close()
  }
}

function publicationAccounting({ record, predecessor, materialized, published }) {
  const currentPath = `${predecessorRoot}/${paperId}/latest/canonical-paper-publication-ref-v1.json`
  const publicationPath = `${predecessorRoot}/${paperId}/versions/v3/canonical/canonical-paper-publication-v44.json`
  const current = json(currentPath)
  const publication = json(publicationPath)
  const oldTree = compactSnapshot(treeSnapshot(`${predecessorRoot}/${paperId}/versions/v2`))
  assert.deepEqual(oldTree, predecessor.immutableVersionTree, 'v2 immutable version bytes must remain unchanged')
  assert.equal(current.versionName, 'v3', 'latest must move only to the successor')
  assert.equal(current.publicationDigest, publication.publicationDigest, 'latest must bind the successor publication digest')
  assert.equal(publication.authority.manifestVersion, successorAuthorityVersion, 'successor publication must retain v44')
  const canonicalGroups = materialized.canonicalPaper.questionGroups
  const predecessorCanonicalArtifact = json(record.canonicalPaper.path)
  const predecessorCanonical = (
    predecessorCanonicalArtifact.canonicalPaper
    || predecessorCanonicalArtifact
  ).questionGroups
  const countQuestions = (groups) => groups.reduce((total, group) => total + group.questionRefs.length, 0)
  assert.equal(canonicalGroups.length, predecessorCanonical.length, 'successor group count must not change')
  assert.equal(countQuestions(canonicalGroups), countQuestions(predecessorCanonical), 'successor question count must not change')
  const db = new DatabaseSync(absolutePath(`${predecessorRoot}/publication.sqlite`), { readOnly: true })
  let rows
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get()
    assert.equal(integrity.integrity_check, 'ok', 'successor SQLite index must be healthy')
    rows = db.prepare('SELECT version_name, source_asset_version, publication_digest, is_current FROM canonical_paper_publications WHERE paper_id = ? ORDER BY version_name').all(paperId).map((row) => ({ ...row }))
  } finally {
    db.close()
  }
  assert.equal(rows.length, 3, 'paper-2026-i retains one predecessor and two successors immutable publication')
  assert.deepEqual(rows.filter((row) => row.is_current === 1).map((row) => row.version_name), ['v3'], 'only v3 is current')
  for (const suffix of ['-wal', '-shm', '-journal']) assert.equal(existsSync(`${absolutePath(`${predecessorRoot}/publication.sqlite`)}${suffix}`), false, `SQLite must not retain ${suffix.slice(1)} sidecar`)
  assert.equal(existsSync(absolutePath(`${predecessorRoot}/${paperId}/.canonical-latest-swap-v1.json`)), false, 'successor must leave no recovery journal')
  const body = {
    schemaVersion: 'paper-2026-i-ticket-35-authority-successor-publication-accounting-v1',
    status: 'PASS',
    correctionId: materialized.registry.correctionId,
    paperId,
    predecessor,
    successor: {
      authority: publication.authority,
      sourceCapture: record.sourceCapture,
      candidate: materialized.registry.candidate,
      confirmation: materialized.registry.confirmation,
      canonicalPaper: materialized.registry.canonicalPaper,
      publication: {
        path: publicationPath,
        byteLength: bytes(publicationPath).byteLength,
        fileSha256: sha256(bytes(publicationPath)),
        versionName: 'v3',
        sourceAssetVersion,
        publicationDigest: publication.publicationDigest,
      },
      latest: {
        path: currentPath,
        byteLength: bytes(currentPath).byteLength,
        fileSha256: sha256(bytes(currentPath)),
        identity: current,
      },
    },
    durableIndex: {
      path: `${predecessorRoot}/publication.sqlite`,
      byteLength: bytes(`${predecessorRoot}/publication.sqlite`).byteLength,
      fileSha256: sha256(bytes(`${predecessorRoot}/publication.sqlite`)),
      integrityCheck: 'ok',
      paper2026IRows: rows,
      residualJournal: null,
      sqliteSidecars: [],
    },
    logicalCounts: {
      frozenCorpus: { papers: 33, groups: 273, questions: 1530, questionOwnedOptions: 4140 },
      paper2026ISuccessor: { groups: canonicalGroups.length, questions: countQuestions(canonicalGroups) },
      predecessorEquivalent: true,
    },
    immutablePredecessorVersionUnchanged: true,
    publishStatus: 'published_or_idempotent',
    identicalRetry: 'required-on-check',
  }
  return { ...body, evidenceDigest: digestJson(body) }
}

function parseMode(argv) {
  const args = new Set(argv)
  for (const arg of args) assert.equal(['--produce', '--check'].includes(arg), true, `unknown argument ${arg}`)
  assert.equal(args.has('--produce') !== args.has('--check'), true, 'choose exactly one of --produce or --check')
  return args.has('--produce') ? 'produce' : 'check'
}

const mode = parseMode(process.argv.slice(2))
materializeAuthorityArtifacts()
const record = recordForPaper()
const predecessor = predecessorSnapshot(record)
const materialized = await materializeSuccessor({ record, predecessor })
const published = await publishSuccessor({ materialized })
const accounting = publicationAccounting({ record, predecessor, materialized, published })
if (mode === 'produce') writeExact(accountingPath, accounting)
else assert.deepEqual(json(accountingPath), accounting, 'successor accounting must be deterministic and current')

console.log(JSON.stringify({
  status: 'PASS',
  mode,
  paperId,
  publication: {
    status: published.status,
    versionName: published.versionName,
    publicationDigest: published.publicationDigest,
  },
  authority: materialized.canonicalPaper.paperPlan.authorityRef,
  candidateDigest: materialized.candidate.candidateDigest,
  canonicalPaperDigest: digestJson(materialized.canonicalPaper),
  expectedOccurrenceDigest,
}))
