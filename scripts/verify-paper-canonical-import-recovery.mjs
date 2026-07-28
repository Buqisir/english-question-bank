#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
  recoverCanonicalPaperPublication,
  rollbackCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'

function withTrailingSourceWhitespace(fixture) {
  const changed = structuredClone(fixture)
  const document = changed.request.evidence.documents[0]
  document.bytes = Buffer.concat([Buffer.from(document.bytes), Buffer.from(' ')])
  changed.sourceAsset = document.bytes
  return changed
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

function snapshotDatabase(database) {
  return database.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all().map(({ name, sql }) => ({
    name,
    sql,
    rows: database.prepare(
      `SELECT * FROM "${name.replaceAll('"', '""')}"`,
    ).all(),
  }))
}

const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-canonical-recovery-'))
const dbPath = path.join(rootDir, 'publication.sqlite')
let db = new DatabaseSync(dbPath)
const publicationRoot = path.join(rootDir, 'publications')

try {
  const initial = makeReadyCanonicalFixture()
  assert.equal(
    publishCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      request: initial.request,
      sourceAssetVersion: 1,
      sourceAsset: initial.sourceAsset,
    }).status,
    'published',
  )

  const conflictingV1 = withTrailingSourceWhitespace(initial)
  const beforeConflict = {
    tree: snapshotTree(publicationRoot),
    database: snapshotDatabase(db),
  }
  assert.throws(
    () => publishCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      request: conflictingV1.request,
      sourceAssetVersion: 1,
      sourceAsset: conflictingV1.sourceAsset,
    }),
    { code: 'CANONICAL_PUBLICATION_IDENTITY_CONFLICT' },
  )
  assert.deepEqual(snapshotTree(publicationRoot), beforeConflict.tree)
  assert.deepEqual(snapshotDatabase(db), beforeConflict.database)

  const beforePreCommitFailure = {
    tree: snapshotTree(publicationRoot),
    database: snapshotDatabase(db),
  }
  assert.throws(
    () => publishCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      request: initial.request,
      sourceAssetVersion: 2,
      sourceAsset: initial.sourceAsset,
      failurePoint: 'after-latest-before-commit',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_FAILURE' },
  )
  assert.deepEqual(snapshotTree(publicationRoot), beforePreCommitFailure.tree)
  assert.deepEqual(snapshotDatabase(db), beforePreCommitFailure.database)

  assert.throws(
    () => publishCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      request: initial.request,
      sourceAssetVersion: 2,
      sourceAsset: initial.sourceAsset,
      failurePoint: 'after-commit',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_FAILURE' },
  )
  db.close()
  db = new DatabaseSync(dbPath)
  assert.equal(
    recoverCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      paperId: initial.source.paperId,
    }).status,
    'post_commit_recovered',
  )
  const store = createFileSystemCanonicalPublicationStore({
    rootDir: publicationRoot,
    db,
  })
  const recovered = await loadPaperForConsumption({
    paperId: initial.source.paperId,
    consumerContract: consumerContractRefs.screen,
  }, store)
  assert.equal(recovered.disposition, 'ready')
  assert.equal(recovered.sourceAssetVersion, 2)

  const beforeIdenticalRetry = {
    tree: snapshotTree(publicationRoot),
    database: snapshotDatabase(db),
  }
  const identicalRetry = publishCanonicalPaperPublication({
    rootDir: publicationRoot,
    db,
    request: initial.request,
    sourceAssetVersion: 2,
    sourceAsset: initial.sourceAsset,
  })
  assert.equal(identicalRetry.status, 'idempotent')
  assert.deepEqual(snapshotTree(publicationRoot), beforeIdenticalRetry.tree)
  assert.deepEqual(snapshotDatabase(db), beforeIdenticalRetry.database)

  const conflictingV2 = withTrailingSourceWhitespace(initial)
  assert.throws(
    () => publishCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      request: conflictingV2.request,
      sourceAssetVersion: 2,
      sourceAsset: conflictingV2.sourceAsset,
    }),
    { code: 'CANONICAL_PUBLICATION_IDENTITY_CONFLICT' },
  )

  const beforeRollbackFailure = {
    tree: snapshotTree(publicationRoot),
    database: snapshotDatabase(db),
  }
  assert.throws(
    () => rollbackCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      paperId: initial.source.paperId,
      versionName: 'v1',
      failurePoint: 'after-latest-before-commit',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_FAILURE' },
  )
  assert.deepEqual(snapshotTree(publicationRoot), beforeRollbackFailure.tree)
  assert.deepEqual(snapshotDatabase(db), beforeRollbackFailure.database)

  assert.throws(
    () => rollbackCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      paperId: initial.source.paperId,
      versionName: 'v1',
      failurePoint: 'after-commit',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_FAILURE' },
  )
  db.close()
  db = new DatabaseSync(dbPath)
  assert.equal(
    recoverCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      paperId: initial.source.paperId,
    }).status,
    'post_commit_recovered',
  )
  const rolledBack = rollbackCanonicalPaperPublication({
    rootDir: publicationRoot,
    db,
    paperId: initial.source.paperId,
    versionName: 'v1',
  })
  assert.equal(rolledBack.status, 'idempotent')
  assert.deepEqual(Object.keys(rolledBack.consumers).sort(), [
    'print_pdf',
    'screen',
  ])
  assert.equal(
    Object.values(rolledBack.consumers).every((consumption) =>
      consumption.selections.every((selection) => selection.mode === 'canonical')),
    true,
  )

  const currentStore = createFileSystemCanonicalPublicationStore({
    rootDir: publicationRoot,
    db,
  })
  const currentAfterRollback = await loadPaperForConsumption({
    paperId: initial.source.paperId,
    consumerContract: consumerContractRefs.screen,
  }, currentStore)
  assert.equal(currentAfterRollback.disposition, 'ready')
  assert.equal(currentAfterRollback.sourceAssetVersion, 1)

  writeFileSync(
    path.join(
      publicationRoot,
      initial.source.paperId,
      'versions',
      'v2',
      'canonical',
      'normalization-report-v12.json',
    ),
    '{"corrupt":true}\n',
  )
  const corrupt = await loadPaperForConsumption(
    {
      paperId: initial.source.paperId,
      version: 'v2',
      consumerContract: consumerContractRefs.screen,
    },
    {
      ...currentStore,
      async projectLegacyFamily({ familyContractId }) {
        return [{ kind: 'legacy_family', familyContractId }]
      },
    },
  )
  assert.equal(corrupt.disposition, 'incompatible')
  assert.notEqual(
    corrupt.selections?.some((selection) => selection.mode === 'legacy'),
    true,
  )

  const beforeCorruptRollback = {
    tree: snapshotTree(publicationRoot),
    database: snapshotDatabase(db),
  }
  assert.throws(
    () => rollbackCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      paperId: initial.source.paperId,
      versionName: 'v2',
    }),
    { code: 'CANONICAL_PUBLICATION_ARTIFACT_DIGEST_INVALID' },
  )
  assert.deepEqual(snapshotTree(publicationRoot), beforeCorruptRollback.tree)
  assert.deepEqual(snapshotDatabase(db), beforeCorruptRollback.database)

  const stale = await loadPaperForConsumption(
    {
      paperId: initial.source.paperId,
      consumerContract: consumerContractRefs.screen,
    },
    {
      ...currentStore,
      readPublishedRefs() {
        return {
          current: {
            paperId: initial.source.paperId,
            versionName: 'v1',
            sourceAssetVersion: 1,
            publicationDigest: rolledBack.publicationDigest,
          },
          latest: {
            paperId: initial.source.paperId,
            versionName: 'v2',
            sourceAssetVersion: 2,
            publicationDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
        }
      },
    },
  )
  assert.equal(stale.disposition, 'retryable_unavailable')
  assert.equal(stale.diagnostics[0].code, 'PUBLICATION_REF_DISAGREEMENT')
} finally {
  db.close()
  rmSync(rootDir, { recursive: true, force: true })
}

console.log('PASS canonical import recovery, retry, and rollback')
