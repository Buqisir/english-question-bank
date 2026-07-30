#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  loadPaperForConsumptionSync,
  publishCanonicalPaperPublication,
  recoverCanonicalPaperPublication,
  rollbackCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import {
  publishPaperImportPackage,
  rollbackPaperImportPublication,
} from '../server/paper-import/publisher.mjs'
import { readImportPackageFromDirectory } from '../server/paper-import/validator.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import {
  makeCanonicalImportAdmissionRequest,
  makeReadyCanonicalFixture,
} from '../test-fixtures/paper-canonical/foundationFixture.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const importFixtureDir = path.join(
  repositoryRoot,
  'test-fixtures/paper-import/paper-2024-jslk-english',
)
const importPaperId = 'paper-2024-jslk-english'

const crashChildConfig = process.env.EQB_CANONICAL_IMPORT_RECOVERY_CHILD
if (crashChildConfig) {
  const { dbPath, paperAssetsDir } = JSON.parse(crashChildConfig)
  const childFiles = readImportPackageFromDirectory(importFixtureDir)
  const childByName = Object.fromEntries(
    childFiles.map(({ fileName, buffer }) => [fileName, buffer]),
  )
  const childDb = new DatabaseSync(dbPath)
  publishPaperImportPackage({
    files: childFiles,
    db: childDb,
    paperAssetsDir,
    canonicalRequest: makeCanonicalImportAdmissionRequest({
      paperId: importPaperId,
      paperAssetBytes: childByName['paper-asset.json'],
      answerKeyBytes: childByName['answer-key.json'],
    }),
    failurePoint: 'process-exit-after-version-rename',
  })
  throw new Error('Crash child returned without exiting')
}

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

  const beforePreCommitRestart = {
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
      paperId: initial.source.paperId,
    }).status,
    'pre_commit_rolled_back',
  )
  assert.deepEqual(snapshotTree(publicationRoot), beforePreCommitRestart.tree)
  assert.deepEqual(snapshotDatabase(db), beforePreCommitRestart.database)

  for (const failurePoint of [
    'during-latest-swap',
    'after-latest-before-commit',
  ]) {
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
        failurePoint,
      }),
      { code: 'CANONICAL_PUBLICATION_FORCED_FAILURE' },
    )
    assert.deepEqual(snapshotTree(publicationRoot), beforePreCommitFailure.tree)
    assert.deepEqual(snapshotDatabase(db), beforePreCommitFailure.database)
  }

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
      'normalization-report-v18.json',
    ),
    '{"corrupt":true}\n',
  )
  const corrupt = loadPaperForConsumptionSync(
    {
      paperId: initial.source.paperId,
      version: 'v2',
      consumerContract: consumerContractRefs.screen,
    },
    currentStore,
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

const importFiles = readImportPackageFromDirectory(importFixtureDir)
const importRoot = mkdtempSync(path.join(tmpdir(), 'eqb-public-import-recovery-'))
const importDbPath = path.join(importRoot, 'question-bank.sqlite')
const importAssets = path.join(importRoot, 'paper-assets')
let importDb = new DatabaseSync(importDbPath)
importDb.exec(readFileSync(path.join(repositoryRoot, 'data/sql/schema.sql'), 'utf8'))

function canonicalRequestFor(files) {
  const byName = Object.fromEntries(files.map(({ fileName, buffer }) => [fileName, buffer]))
  return makeCanonicalImportAdmissionRequest({
    paperId: importPaperId,
    paperAssetBytes: byName['paper-asset.json'],
    answerKeyBytes: byName['answer-key.json'],
  })
}

function publishImport(files, options = {}) {
  return publishPaperImportPackage({
    files,
    db: importDb,
    paperAssetsDir: importAssets,
    canonicalRequest: canonicalRequestFor(files),
    ...options,
  })
}

function getCurrentCanonicalPublicationVersion(database, paperId) {
  return Number(database.prepare(
    `
    SELECT source_asset_version
    FROM canonical_paper_publications
    WHERE paper_id = ? AND is_current = 1
    `,
  ).get(paperId)?.source_asset_version)
}

try {
  assert.equal(publishImport(importFiles).status, 'published')
  const latestBeforePreCommitCrash = snapshotTree(
    path.join(importAssets, importPaperId, 'latest'),
  )
  const databaseBeforePreCommitCrash = snapshotDatabase(importDb)
  importDb.close()
  const crash = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: {
      ...process.env,
      EQB_CANONICAL_IMPORT_RECOVERY_CHILD: JSON.stringify({
        dbPath: importDbPath,
        paperAssetsDir: importAssets,
      }),
    },
    encoding: 'utf8',
  })
  assert.equal(crash.status, 87, crash.stderr || crash.stdout)
  importDb = new DatabaseSync(importDbPath)
  assert.deepEqual(
    snapshotTree(path.join(importAssets, importPaperId, 'latest')),
    latestBeforePreCommitCrash,
  )
  assert.deepEqual(snapshotDatabase(importDb), databaseBeforePreCommitCrash)
  const preCommitRetry = publishImport(importFiles)
  assert.equal(preCommitRetry.status, 'published')
  assert.equal(preCommitRetry.publish.assetVersion, 2)

  assert.throws(
    () => publishImport(importFiles, { failurePoint: 'after-commit' }),
    { code: 'CANONICAL_PUBLICATION_FORCED_RELOAD_FAILURE' },
  )
  assert.equal(
    existsSync(path.join(importAssets, importPaperId, '.latest-swap.json')),
    true,
  )
  importDb.close()
  importDb = new DatabaseSync(importDbPath)
  const retry = publishImport(importFiles)
  assert.equal(retry.status, 'idempotent')
  assert.equal(retry.publish.assetVersion, 3)
  assert.equal(
    existsSync(path.join(importAssets, importPaperId, '.latest-swap.json')),
    false,
  )

  assert.throws(
    () => publishImport(importFiles, { failurePoint: 'after-commit' }),
    { code: 'CANONICAL_PUBLICATION_FORCED_RELOAD_FAILURE' },
  )
  importDb.close()
  importDb = new DatabaseSync(importDbPath)
  const conflictingFiles = importFiles.map((file) => ({
    ...file,
    buffer: file.fileName === 'paper-asset.json'
      ? Buffer.concat([file.buffer, Buffer.from(' ')])
      : Buffer.from(file.buffer),
  }))
  const conflict = publishImport(conflictingFiles)
  assert.equal(conflict.status, 'canonical_admission_failed')
  assert.equal(
    conflict.canonicalAdmission.diagnostics[0].code,
    'CANONICAL_PUBLICATION_IDENTITY_CONFLICT',
  )
  assert.equal(
    getCurrentCanonicalPublicationVersion(importDb, importPaperId),
    4,
  )

  const beforeFailedRollback = {
    tree: snapshotTree(importAssets),
    database: snapshotDatabase(importDb),
  }
  assert.throws(
    () => rollbackPaperImportPublication({
      db: importDb,
      paperAssetsDir: importAssets,
      paperId: importPaperId,
      versionName: 'v1',
      failurePoint: 'after-latest-before-commit',
    }),
    /Forced rollback failure/,
  )
  assert.deepEqual(snapshotTree(importAssets), beforeFailedRollback.tree)
  assert.deepEqual(snapshotDatabase(importDb), beforeFailedRollback.database)

  assert.throws(
    () => rollbackPaperImportPublication({
      db: importDb,
      paperAssetsDir: importAssets,
      paperId: importPaperId,
      versionName: 'v1',
      failurePoint: 'after-commit',
    }),
    { code: 'CANONICAL_PUBLICATION_FORCED_RELOAD_FAILURE' },
  )
  importDb.close()
  importDb = new DatabaseSync(importDbPath)
  const recoveredRollback = rollbackPaperImportPublication({
    db: importDb,
    paperAssetsDir: importAssets,
    paperId: importPaperId,
    versionName: 'v1',
  })
  assert.equal(recoveredRollback.status, 'idempotent')
  assert.deepEqual(Object.keys(recoveredRollback.consumers).sort(), [
    'print_pdf',
    'screen',
  ])
  const latestRefPath = path.join(
    importAssets,
    importPaperId,
    'latest',
    'canonical-paper-publication-ref-v1.json',
  )
  const latestRefBytes = readFileSync(latestRefPath)
  const staleLatestRef = JSON.parse(latestRefBytes.toString('utf8'))
  staleLatestRef.versionName = 'v2'
  writeFileSync(latestRefPath, `${JSON.stringify(staleLatestRef, null, 2)}\n`)
  assert.throws(
    () => rollbackPaperImportPublication({
      db: importDb,
      paperAssetsDir: importAssets,
      paperId: importPaperId,
      versionName: 'v1',
    }),
    { code: 'PUBLICATION_REF_DISAGREEMENT' },
  )
  writeFileSync(latestRefPath, latestRefBytes)
  assert.equal(
    JSON.parse(
      readFileSync(
        path.join(importAssets, importPaperId, 'latest', 'paper-asset.json'),
        'utf8',
      ),
    ).paper.assetVersion,
    1,
  )
} finally {
  importDb.close()
  rmSync(importRoot, { recursive: true, force: true })
}

console.log('PASS canonical import recovery, retry, and rollback')
