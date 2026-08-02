#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  publishCanonicalPaperPublication,
  recoverCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import { registeredConfirmedCanonicalAdmissionSchemaVersion } from '../server/paper-canonical/registeredConfirmedCanonicalAdmission.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'

const records = {
  historicV41: {
    paperId: 'paper-960d0f8d',
    authorityVersion: '41',
    source: 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/paper-960d0f8d/source-capture-v1.json',
    candidate: 'test-fixtures/paper-import/paper-canonical-confirmation-lanes/ticket-27-nck1-v1/paper-960d0f8d/import-candidate-v1.json',
    confirmation: 'test-fixtures/paper-import/paper-canonical-confirmation-lanes/ticket-27-nck1-v1/paper-960d0f8d/teacher-confirmation-v1.json',
    canonical: 'test-fixtures/paper-import/paper-canonical-confirmation-lanes/ticket-27-nck1-v1/paper-960d0f8d/canonical-paper-v1.json',
  },
  currentV42: {
    paperId: 'paper-2026-i',
    authorityVersion: '42',
    source: 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v2/paper-2026-i/source-capture-v1.json',
    candidate: 'test-fixtures/paper-import/paper-canonical-integrated-corpus/ticket-30-v1/paper-2026-i/import-candidate-v1.json',
    confirmation: 'test-fixtures/paper-import/paper-canonical-integrated-corpus/ticket-30-v1/paper-2026-i/teacher-confirmation-v1.json',
    canonical: 'test-fixtures/paper-import/paper-canonical-integrated-corpus/ticket-30-v1/paper-2026-i/canonical-paper-v1.json',
  },
  richDocxV37: {
    paperId: 'paper-2025-i',
    authorityVersion: '37',
    source: 'test-fixtures/paper-import/paper-2025-i-docx-source-adapter/2025-nck1-answer-source.docx',
    candidate: 'test-fixtures/paper-import/paper-canonical-integrated-corpus/ticket-30-v1/paper-2025-i/import-candidate-v1.json',
    confirmation: 'test-fixtures/paper-import/paper-canonical-integrated-corpus/ticket-30-v1/paper-2025-i/teacher-confirmation-v1.json',
    canonical: 'test-fixtures/paper-import/paper-canonical-integrated-corpus/ticket-30-v1/paper-2025-i/canonical-paper-v1.json',
  },
}

function bytes(filePath) {
  return new Uint8Array(readFileSync(filePath))
}

function evidence(record) {
  return {
    schemaVersion: registeredConfirmedCanonicalAdmissionSchemaVersion,
    paperId: record.paperId,
    sourceBytes: bytes(record.source),
    candidateBytes: bytes(record.candidate),
    confirmationBytes: bytes(record.confirmation),
    canonicalPaperBytes: bytes(record.canonical),
  }
}

function snapshotTree(rootDir) {
  if (!existsSync(rootDir)) return []
  const entries = []
  function visit(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = path.join(prefix, entry.name)
      if (entry.isDirectory()) {
        entries.push({ path: `${relativePath}/`, bytes: null })
        visit(path.join(dir, entry.name), relativePath)
      } else {
        entries.push({
          path: relativePath,
          bytes: readFileSync(path.join(dir, entry.name)).toString('base64'),
        })
      }
    }
  }
  visit(rootDir)
  return entries
}

function snapshotDatabase(db) {
  return db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all().map(({ name, sql }) => ({
    name,
    sql,
    rows: db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all(),
  }))
}

function jsonBytes(value, mutate) {
  const parsed = JSON.parse(new TextDecoder().decode(value))
  mutate(parsed)
  return new TextEncoder().encode(JSON.stringify(parsed))
}

function candidateFrom(value) {
  return value.candidate || value
}

function canonicalFrom(value) {
  return value.canonicalPaper || value
}

function restampCandidate(candidate) {
  const body = { ...candidate }
  delete body.candidateDigest
  delete body.sourceBytes
  candidate.candidateDigest = digestJson(body)
}

const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-registered-confirmation-'))
const dbPath = path.join(rootDir, 'publication.sqlite')
const publicationRoot = path.join(rootDir, 'publications')
let db = new DatabaseSync(dbPath)

function publishRegistered(record, sourceAssetVersion = 1, options = {}) {
  return publishCanonicalPaperPublication({
    rootDir: publicationRoot,
    db,
    sourceAssetVersion,
    registeredConfirmation: evidence(record),
    ...options,
  })
}

try {
  db.exec("CREATE TABLE sentinel (id TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO sentinel VALUES ('before', 'unchanged')")

  function rejectsWithoutWrite(label, registeredConfirmation, expectedCode, options = {}) {
    const before = {
      tree: snapshotTree(publicationRoot),
      database: snapshotDatabase(db),
    }
    const result = publishCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      sourceAssetVersion: 1,
      registeredConfirmation,
      ...options,
    })
    assert.equal(result.status, 'admission_failed', label)
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === expectedCode),
      true,
      `${label} reports ${expectedCode}`,
    )
    assert.deepEqual(snapshotTree(publicationRoot), before.tree, `${label} writes no files`)
    assert.deepEqual(snapshotDatabase(db), before.database, `${label} writes no rows`)
  }

  const historic = evidence(records.historicV41)
  const current = evidence(records.currentV42)
  const tamperedCapture = new Uint8Array(historic.sourceBytes)
  tamperedCapture[tamperedCapture.byteLength - 1] ^= 1
  const unknownAuthorityCandidate = jsonBytes(historic.candidateBytes, (value) => {
    const candidate = candidateFrom(value)
    candidate.authority = { ...candidate.authority, manifestVersion: '999' }
    restampCandidate(candidate)
  })
  const selfProvedCandidate = jsonBytes(historic.candidateBytes, (value) => {
    const candidate = candidateFrom(value)
    candidate.interpretation = {
      ...candidate.interpretation,
      paperId: 'paper-self-proved-not-registered',
    }
    restampCandidate(candidate)
  })
  const selfProvedConfirmation = jsonBytes(historic.confirmationBytes, (value) => {
    value.candidateDigest = JSON.parse(new TextDecoder().decode(selfProvedCandidate)).candidateDigest
  })

  rejectsWithoutWrite(
    'unsigned envelope',
    (() => {
      const { confirmationBytes: _confirmationBytes, ...missingConfirmation } = historic
      return missingConfirmation
    })(),
    'CANONICAL_PUBLICATION_REGISTERED_ENVELOPE_INVALID',
  )
  rejectsWithoutWrite(
    'wrong paper',
    { ...historic, paperId: 'paper-not-in-registered-corpus' },
    'CANONICAL_PUBLICATION_REGISTERED_PAPER_UNKNOWN',
  )
  rejectsWithoutWrite(
    'source swap',
    { ...historic, sourceBytes: current.sourceBytes },
    'CANONICAL_PUBLICATION_REGISTERED_EVIDENCE_MISMATCH',
  )
  rejectsWithoutWrite(
    'candidate swap',
    { ...historic, candidateBytes: current.candidateBytes },
    'CANONICAL_PUBLICATION_REGISTERED_EVIDENCE_MISMATCH',
  )
  rejectsWithoutWrite(
    'confirmation swap',
    { ...historic, confirmationBytes: current.confirmationBytes },
    'CANONICAL_PUBLICATION_REGISTERED_EVIDENCE_MISMATCH',
  )
  rejectsWithoutWrite(
    'canonical swap',
    { ...historic, canonicalPaperBytes: current.canonicalPaperBytes },
    'CANONICAL_PUBLICATION_REGISTERED_EVIDENCE_MISMATCH',
  )
  rejectsWithoutWrite(
    'tampered source capture',
    { ...historic, sourceBytes: tamperedCapture },
    'CANONICAL_PUBLICATION_REGISTERED_EVIDENCE_MISMATCH',
  )
  rejectsWithoutWrite(
    'tampered candidate digest',
    {
      ...historic,
      candidateBytes: jsonBytes(historic.candidateBytes, (value) => {
        candidateFrom(value).candidateDigest = 'sha256:forged'
      }),
    },
    'CANONICAL_PUBLICATION_REGISTERED_EVIDENCE_MISMATCH',
  )
  rejectsWithoutWrite(
    'unknown authority version',
    { ...historic, candidateBytes: unknownAuthorityCandidate },
    'CANONICAL_PUBLICATION_REGISTERED_EVIDENCE_MISMATCH',
  )
  rejectsWithoutWrite(
    'candidate self-proof',
    {
      ...historic,
      candidateBytes: selfProvedCandidate,
      confirmationBytes: selfProvedConfirmation,
    },
    'CANONICAL_PUBLICATION_REGISTERED_EVIDENCE_MISMATCH',
  )
  rejectsWithoutWrite(
    'unconfirmed candidate',
    {
      ...historic,
      confirmationBytes: jsonBytes(historic.confirmationBytes, (value) => {
        value.confirmed = false
      }),
    },
    'CANONICAL_PUBLICATION_REGISTERED_EVIDENCE_MISMATCH',
  )
  rejectsWithoutWrite(
    'incomplete canonical paper',
    {
      ...historic,
      canonicalPaperBytes: jsonBytes(historic.canonicalPaperBytes, (value) => {
        canonicalFrom(value).paperPlan.completeness.status = 'incomplete'
      }),
    },
    'CANONICAL_PUBLICATION_REGISTERED_EVIDENCE_MISMATCH',
  )
  rejectsWithoutWrite(
    'caller source override',
    historic,
    'CANONICAL_PUBLICATION_REGISTERED_INPUT_INVALID',
    { sourceAsset: new Uint8Array([0]) },
  )

  const historicPublished = publishRegistered(records.historicV41)
  assert.equal(historicPublished.status, 'published')
  assert.deepEqual(
    Object.values(historicPublished.consumers).map((consumer) => consumer.disposition),
    ['ready', 'ready'],
  )
  assert.equal(
    existsSync(path.join(
      publicationRoot,
      records.historicV41.paperId,
      'versions',
      'v1',
      'canonical',
      'canonical-paper-publication-v41.json',
    )),
    true,
  )
  const beforeRetry = {
    tree: snapshotTree(publicationRoot),
    database: snapshotDatabase(db),
  }
  assert.equal(publishRegistered(records.historicV41).status, 'idempotent')
  assert.deepEqual(snapshotTree(publicationRoot), beforeRetry.tree)
  assert.deepEqual(snapshotDatabase(db), beforeRetry.database)

  const beforeRecovery = {
    tree: snapshotTree(publicationRoot),
    database: snapshotDatabase(db),
  }
  assert.throws(
    () => publishRegistered(records.historicV41, 2, {
      failurePoint: 'after-version-rename-crash',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_CRASH' },
  )
  db.close()
  db = new DatabaseSync(dbPath)
  assert.equal(
    recoverCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      paperId: records.historicV41.paperId,
    }).status,
    'pre_commit_rolled_back',
  )
  assert.deepEqual(snapshotTree(publicationRoot), beforeRecovery.tree)
  assert.deepEqual(snapshotDatabase(db), beforeRecovery.database)

  for (const record of [records.currentV42, records.richDocxV37]) {
    const published = publishRegistered(record)
    assert.equal(published.status, 'published', record.paperId)
    assert.deepEqual(
      Object.values(published.consumers).map((consumer) => consumer.disposition),
      ['ready', 'ready'],
      `${record.paperId} public consumers stay canonical-ready`,
    )
    assert.equal(
      existsSync(path.join(
        publicationRoot,
        record.paperId,
        'versions',
        'v1',
        'canonical',
        `canonical-paper-publication-v${record.authorityVersion}.json`,
      )),
      true,
      `${record.paperId} retains its authority-specific immutable manifest`,
    )
  }

  console.log(JSON.stringify({
    status: 'PASS',
    acceptedAuthorities: ['v41', 'v42', 'v37'],
    rejectedWithoutWrites: 13,
    recovery: 'pre_commit_rolled_back',
  }))
} finally {
  db.close()
  rmSync(rootDir, { recursive: true, force: true })
}
