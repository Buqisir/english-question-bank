#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
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
  publishPaperImportPackage as publishPaperImportPackageRaw,
  recoverInterruptedPaperImportPublish,
} from '../server/paper-import/publisher.mjs'
import {
  makePublicValidationReport,
  validatePaperImportPackage,
  readImportPackageFromDirectory,
} from '../server/paper-import/validator.mjs'
import {
  readPaperAssetNormalizationBundle,
  swapPaperImportLatest,
  writePaperImportVersion,
} from '../server/paper-import/storage.mjs'
import {
  validatePaperNormalizedGroupsSidecar,
} from '../server/paper-import/normalization.mjs'
import { makeCanonicalImportAdmissionRequest } from '../test-fixtures/paper-canonical/foundationFixture.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = path.join(
  rootDir,
  'test-fixtures/paper-import/paper-2024-jslk-english',
)
const schemaSql = readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8')
const paperId = 'paper-2024-jslk-english'
const sidecarFileName = 'paper-normalized-groups-v1.json'

function publishPaperImportPackage(args) {
  const filesByName = Object.fromEntries(
    args.files.map((file) => [file.fileName, file.buffer]),
  )
  return publishPaperImportPackageRaw({
    ...args,
    canonicalRequest: makeCanonicalImportAdmissionRequest({
      paperId,
      paperAssetBytes: filesByName['paper-asset.json'],
      answerKeyBytes: filesByName['answer-key.json'],
    }),
  })
}

const crashChildConfig = process.env.EQB_PAPER_IMPORT_CRASH_CHILD
if (crashChildConfig) {
  const { dbPath, paperAssetsDir } = JSON.parse(crashChildConfig)
  const childDb = new DatabaseSync(dbPath)
  publishPaperImportPackage({
    files: readImportPackageFromDirectory(fixtureDir),
    db: childDb,
    paperAssetsDir,
    failurePoint: 'process-exit-after-latest-swap',
  })
  throw new Error('Crash child returned without exiting')
}

function cloneFiles(files) {
  return files.map((file) => ({
    ...file,
    buffer: Buffer.from(file.buffer),
  }))
}

function mutateJsonFile(files, fileName, mutator) {
  const next = cloneFiles(files)
  const file = next.find((entry) => entry.fileName === fileName)
  assert.ok(file, `fixture must contain ${fileName}`)
  const value = JSON.parse(file.buffer.toString('utf8'))
  mutator(value)
  file.buffer = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
  return next
}

function tableExists(db, tableName) {
  return Boolean(
    db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(tableName),
  )
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function snapshotTree(dirPath, relativePath = '') {
  if (!existsSync(dirPath)) return {}
  const snapshot = {}
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const childRelativePath = path.join(relativePath, entry.name)
    const childPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      Object.assign(snapshot, snapshotTree(childPath, childRelativePath))
    } else {
      snapshot[childRelativePath] = readFileSync(childPath).toString('base64')
    }
  }
  return snapshot
}

function snapshotPublishedDb(db) {
  const tables = [
    'sources',
    'passages',
    'question_groups',
    'questions',
    'options',
    'tags',
    'tag_links',
    'paper_asset_versions',
  ]
  return Object.fromEntries(
    tables.map((tableName) => [
      tableName,
      db.prepare(`SELECT * FROM ${tableName} ORDER BY rowid`).all(),
    ]),
  )
}

function assertSidecarIsClean(sidecar) {
  assert.deepEqual(Object.keys(sidecar).sort(), [
    'groups',
    'normalizerVersion',
    'paperId',
    'schemaVersion',
    'sourceAssetVersion',
  ])
  const serialized = JSON.stringify(sidecar)
  for (const forbidden of [
    'source.pdf',
    'source.docx',
    'answerKey',
    'generatedAt',
    'renderer',
    rootDir,
  ]) {
    assert.equal(serialized.includes(forbidden), false, `sidecar leaks ${forbidden}`)
  }
}

function runCrashChild({ dbPath, paperAssetsDir }) {
  return spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: {
      ...process.env,
      EQB_PAPER_IMPORT_CRASH_CHILD: JSON.stringify({
        dbPath,
        paperAssetsDir,
      }),
    },
    encoding: 'utf8',
  })
}

const files = readImportPackageFromDirectory(fixtureDir)
const validation = validatePaperImportPackage(files, {
  now: '2026-07-24T00:00:00.000Z',
})
assert.equal(validation.ok, true)
assert.deepEqual(
  validation.normalizationGroups.map(({ groupId, status }) => [groupId, status]),
  [
    ['group-2024-jslk-cloze', 'ready'],
    ['group-2024-jslk-grammar-fill', 'ready'],
  ],
)
assert.equal(
  validation.packageData.normalizedGroupsSidecar.schemaVersion,
  'paper-normalized-groups-v1',
)
assert.equal(
  makePublicValidationReport(validation).normalizationGroups.length,
  2,
)
assertSidecarIsClean(validation.packageData.normalizedGroupsSidecar)
assert.equal(
  validatePaperNormalizedGroupsSidecar({
    paperAsset: validation.packageData.paperAsset,
    sidecar: {
      ...validation.packageData.normalizedGroupsSidecar,
      generatedAt: 'forbidden',
    },
  }).ok,
  false,
)

const needsReviewFiles = mutateJsonFile(files, 'paper-asset.json', (asset) => {
  asset.content.groups[
    'group-2024-jslk-grammar-fill'
  ].passage.paragraphs[0].text = 'This supported group has no marker.'
})
const needsReview = validatePaperImportPackage(needsReviewFiles)
assert.equal(needsReview.ok, false)
assert.ok(
  needsReview.blockingIssues.some(
    ({ code, groupId }) =>
      code === 'normalization.needsReview' &&
      groupId === 'group-2024-jslk-grammar-fill',
  ),
)

const tempRoot = mkdtempSync(
  path.join(tmpdir(), 'eqb-paper-normalization-import-gate-'),
)
try {
  const directSwapAssets = path.join(tempRoot, 'direct-swap-paper-assets')
  const directSwapPaperDir = path.join(directSwapAssets, paperId)
  for (const version of [1, 2]) {
    const { versionDir } = writePaperImportVersion({
      paperAssetsDir: directSwapAssets,
      packageData: validation.packageData,
      validationReport: { ok: true },
      publishReport: { ok: true },
      version,
    })
    swapPaperImportLatest({
      paperAssetsDir: directSwapAssets,
      paperId,
      versionDir,
    })
    assert.equal(
      existsSync(path.join(directSwapPaperDir, '.latest-swap.json')),
      false,
      `direct swap v${version} must remove its completed journal`,
    )
  }
  assert.equal(
    readJson(path.join(directSwapPaperDir, 'latest', 'paper-asset.json')).paper
      .assetVersion,
    2,
    'a second direct swap must succeed after the first completed swap',
  )

  const invalidDb = new DatabaseSync(path.join(tempRoot, 'invalid.sqlite'))
  const invalidAssets = path.join(tempRoot, 'invalid-paper-assets')
  const invalidPublish = publishPaperImportPackage({
    files: needsReviewFiles,
    db: invalidDb,
    paperAssetsDir: invalidAssets,
  })
  assert.equal(invalidPublish.status, 'validation_failed')
  assert.equal(tableExists(invalidDb, 'paper_asset_versions'), false)
  assert.equal(existsSync(invalidAssets), false)
  invalidDb.close()

  for (const failurePoint of [
    'version-write',
    'sidecar-write',
    'db-write',
    'latest-swap',
  ]) {
    const caseRoot = path.join(tempRoot, failurePoint)
    mkdirSync(caseRoot, { recursive: true })
    const paperAssetsDir = path.join(caseRoot, 'paper-assets')
    const db = new DatabaseSync(path.join(caseRoot, 'question-bank.sqlite'))
    db.exec(schemaSql)

    const first = publishPaperImportPackage({ files, db, paperAssetsDir })
    assert.equal(first.ok, true, `${failurePoint}: seed publish`)
    const latestDir = path.join(paperAssetsDir, paperId, 'latest')
    const latestBeforeFailure = snapshotTree(latestDir)
    const dbBeforeFailure = snapshotPublishedDb(db)

    assert.throws(
      () =>
        publishPaperImportPackage({
          files,
          db,
          paperAssetsDir,
          failurePoint,
        }),
      new RegExp(failurePoint),
    )
    assert.deepEqual(
      snapshotTree(latestDir),
      latestBeforeFailure,
      `${failurePoint}: old latest bytes must remain`,
    )
    assert.equal(
      existsSync(path.join(paperAssetsDir, paperId, 'versions', 'v2')),
      false,
      `${failurePoint}: failed v2 must be removed`,
    )
    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?',
      ).get(paperId).count,
      1,
      `${failurePoint}: published DB version must roll back`,
    )
    assert.deepEqual(
      snapshotPublishedDb(db),
      dbBeforeFailure,
      `${failurePoint}: all published DB state must roll back`,
    )

    const retry = publishPaperImportPackage({ files, db, paperAssetsDir })
    assert.equal(retry.publish.assetVersion, 2, `${failurePoint}: retry reuses v2`)
    for (const base of [
      path.join(paperAssetsDir, paperId, 'versions', 'v2'),
      latestDir,
    ]) {
      const asset = readJson(path.join(base, 'paper-asset.json'))
      const sidecar = readJson(path.join(base, sidecarFileName))
      assert.equal(asset.paper.assetVersion, 2)
      assert.equal(sidecar.sourceAssetVersion, 2)
      assertSidecarIsClean(sidecar)
      assert.equal(
        validatePaperNormalizedGroupsSidecar({ paperAsset: asset, sidecar }).ok,
        true,
      )
    }
    assert.deepEqual(
      readFileSync(path.join(latestDir, sidecarFileName)),
      readFileSync(
        path.join(
          paperAssetsDir,
          paperId,
          'versions',
          'v2',
          sidecarFileName,
        ),
      ),
      `${failurePoint}: latest and version sidecars must be byte-identical`,
    )
    db.close()
  }

  const crashRoot = path.join(tempRoot, 'process-exit-after-latest-swap')
  mkdirSync(crashRoot, { recursive: true })
  const crashAssets = path.join(crashRoot, 'paper-assets')
  const crashDbPath = path.join(crashRoot, 'question-bank.sqlite')
  const crashSeedDb = new DatabaseSync(crashDbPath)
  crashSeedDb.exec(schemaSql)
  const crashSeed = publishPaperImportPackage({
    files,
    db: crashSeedDb,
    paperAssetsDir: crashAssets,
  })
  assert.equal(crashSeed.ok, true)
  const crashLatest = path.join(crashAssets, paperId, 'latest')
  const crashLatestBefore = snapshotTree(crashLatest)
  const crashDbBefore = snapshotPublishedDb(crashSeedDb)
  crashSeedDb.close()

  const crashChild = runCrashChild({
    dbPath: crashDbPath,
    paperAssetsDir: crashAssets,
  })
  assert.equal(
    crashChild.status,
    86,
    `crash child must exit after latest swap: ${crashChild.stderr}`,
  )

  const crashRestartDb = new DatabaseSync(crashDbPath)
  assert.deepEqual(snapshotPublishedDb(crashRestartDb), crashDbBefore)
  assert.equal(
    existsSync(path.join(crashAssets, paperId, 'versions', 'v2')),
    true,
    'crash must occur after v2 and latest swap are durable',
  )
  assert.equal(
    readJson(path.join(crashLatest, 'paper-asset.json')).paper.assetVersion,
    2,
    'crash must expose the post-swap latest before recovery',
  )

  const recovery = recoverInterruptedPaperImportPublish({
    db: crashRestartDb,
    paperAssetsDir: crashAssets,
    paperId,
  })
  assert.equal(recovery.recovered, true)
  assert.deepEqual(
    snapshotTree(crashLatest),
    crashLatestBefore,
    'restart recovery must restore the old latest bytes',
  )
  assert.deepEqual(snapshotPublishedDb(crashRestartDb), crashDbBefore)
  assert.equal(
    existsSync(path.join(crashAssets, paperId, 'versions', 'v2')),
    false,
    'restart recovery must remove failed v2',
  )

  const crashRetry = publishPaperImportPackage({
    files,
    db: crashRestartDb,
    paperAssetsDir: crashAssets,
  })
  assert.equal(crashRetry.publish.assetVersion, 2)
  assert.equal(
    readJson(path.join(crashLatest, 'paper-asset.json')).paper.assetVersion,
    2,
  )
  assert.equal(
    crashRestartDb.prepare(
      'SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?',
    ).get(paperId).count,
    2,
  )
  crashRestartDb.close()

  const automaticRoot = path.join(tempRoot, 'automatic-restart-recovery')
  mkdirSync(automaticRoot, { recursive: true })
  const automaticAssets = path.join(automaticRoot, 'paper-assets')
  const automaticDbPath = path.join(automaticRoot, 'question-bank.sqlite')
  const automaticSeedDb = new DatabaseSync(automaticDbPath)
  automaticSeedDb.exec(schemaSql)
  assert.equal(
    publishPaperImportPackage({
      files,
      db: automaticSeedDb,
      paperAssetsDir: automaticAssets,
    }).publish.assetVersion,
    1,
  )
  automaticSeedDb.close()

  const automaticCrashChild = runCrashChild({
    dbPath: automaticDbPath,
    paperAssetsDir: automaticAssets,
  })
  assert.equal(
    automaticCrashChild.status,
    86,
    `automatic recovery child must exit after latest swap: ${automaticCrashChild.stderr}`,
  )

  const automaticRestartDb = new DatabaseSync(automaticDbPath)
  const automaticRetry = publishPaperImportPackage({
    files,
    db: automaticRestartDb,
    paperAssetsDir: automaticAssets,
  })
  assert.equal(
    automaticRetry.publish.assetVersion,
    2,
    'public publish retry must automatically recover and reuse v2',
  )
  assert.equal(
    automaticRestartDb.prepare(
      'SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?',
    ).get(paperId).count,
    2,
  )
  assert.equal(
    readdirSync(path.join(automaticAssets, paperId)).some(
      (entry) =>
        entry === '.latest-swap.json'
        || entry.startsWith('.latest-prev-')
        || entry.startsWith('.latest-tmp-'),
    ),
    false,
    'automatic recovery must leave no interrupted-swap artifacts',
  )
  automaticRestartDb.close()

  const consumerRoot = path.join(tempRoot, 'consumer')
  mkdirSync(consumerRoot, { recursive: true })
  const consumerDb = new DatabaseSync(
    path.join(consumerRoot, 'question-bank.sqlite'),
  )
  consumerDb.exec(schemaSql)
  const consumerAssets = path.join(consumerRoot, 'paper-assets')
  publishPaperImportPackage({ files, db: consumerDb, paperAssetsDir: consumerAssets })
  const consumerLatest = path.join(consumerAssets, paperId, 'latest')
  const consumerAsset = readJson(path.join(consumerLatest, 'paper-asset.json'))
  const consumerSidecar = readJson(
    path.join(consumerLatest, sidecarFileName),
  )
  assert.equal(
    readPaperAssetNormalizationBundle(
      consumerAssets,
      paperId,
    ).normalizedGroupsSidecar.sourceAssetVersion,
    1,
  )

  writeFileSync(
    path.join(consumerLatest, sidecarFileName),
    `${JSON.stringify(
      { ...consumerSidecar, sourceAssetVersion: 999 },
      null,
      2,
    )}\n`,
  )
  assert.throws(
    () => readPaperAssetNormalizationBundle(consumerAssets, paperId),
    /Rejected stale paper normalization sidecar/,
  )
  const firstGroupId = Object.keys(consumerSidecar.groups)[0]
  const staleFingerprint = structuredClone(consumerSidecar)
  staleFingerprint.groups[firstGroupId].sourceFingerprint = '0'.repeat(64)
  writeFileSync(
    path.join(consumerLatest, sidecarFileName),
    `${JSON.stringify(staleFingerprint, null, 2)}\n`,
  )
  assert.throws(
    () => readPaperAssetNormalizationBundle(consumerAssets, paperId),
    /Rejected stale paper normalization sidecar/,
  )
  assert.equal(
    validatePaperNormalizedGroupsSidecar({
      paperAsset: consumerAsset,
      sidecar: staleFingerprint,
    }).ok,
    false,
  )
  consumerDb.close()
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('paper normalization import gate verify PASSED')
