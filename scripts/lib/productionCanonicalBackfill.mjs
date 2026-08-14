import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { createCanonicalConsumerRuntime } from '../../server/paper-canonical/consumerRuntime.mjs'
import { ensureCanonicalPublicationDatabaseShape } from '../../server/paper-canonical/publication.mjs'

const SOURCE_STORES = [
  'test-fixtures/paper-canonical/publications/ticket-31-canary-v1/store',
  'test-fixtures/paper-canonical/publications/ticket-32-remaining-v1/store',
]
const EXPECTED_PAPERS = 33
const EXPECTED_ROWS = 36
const EXPECTED_CURRENT_ROWS = 33
const sourceInventoryByRepoRoot = new Map()

export class CanonicalPublicationBackfillError extends Error {
  constructor(code, message, details = null) {
    super(message)
    this.name = 'CanonicalPublicationBackfillError'
    this.code = code
    this.details = details
  }
}

function fail(code, message, details = null) {
  throw new CanonicalPublicationBackfillError(code, message, details)
}

function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function listFiles(rootDir, relativeDir = '') {
  const absoluteDir = path.join(rootDir, relativeDir)
  if (!existsSync(absoluteDir)) return []
  return readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name)
    if (entry.isDirectory()) return listFiles(rootDir, relativePath)
    if (entry.isFile()) return [relativePath]
    return []
  })
}

function canonicalRow(row) {
  return {
    paperId: row.paper_id,
    versionName: row.version_name,
    sourceAssetVersion: Number(row.source_asset_version),
    publicationDigest: row.publication_digest,
    isCurrent: Number(row.is_current),
    createdAt: row.created_at,
  }
}

function sameRow(left, right) {
  return left.paperId === right.paperId
    && left.versionName === right.versionName
    && left.sourceAssetVersion === right.sourceAssetVersion
    && left.publicationDigest === right.publicationDigest
    && left.isCurrent === right.isCurrent
}

function rowKey(row) {
  return `${row.paperId}\u0000${row.versionName}`
}

function validateRuntime({ db, rootDir, paperIds }) {
  const runtime = createCanonicalConsumerRuntime({ rootDir, db })
  let screenReady = 0
  let printPdfReady = 0
  for (const paperId of paperIds) {
    const screen = runtime.load({ paperId, consumerId: 'screen' })
    assert.equal(screen.disposition, 'ready', `${paperId} Screen must be ready`)
    screenReady += 1
    const printPdf = runtime.load({ paperId, consumerId: 'print_pdf' })
    assert.equal(printPdf.disposition, 'ready', `${paperId} Print/PDF must be ready`)
    printPdfReady += 1
  }
  return { screenReady, printPdfReady }
}

function loadAcceptedSourceInventory(repoRoot) {
  const cached = sourceInventoryByRepoRoot.get(repoRoot)
  if (cached) return cached
  const rows = []
  const assets = []
  const currentPaperIds = []
  const seenRows = new Set()
  const seenPapers = new Set()

  for (const relativeStore of SOURCE_STORES) {
    const storeRoot = path.join(repoRoot, relativeStore)
    const dbPath = path.join(storeRoot, 'publication.sqlite')
    if (!existsSync(dbPath)) {
      fail('CANONICAL_BACKFILL_SOURCE_UNAVAILABLE', `Accepted publication index is missing: ${relativeStore}`)
    }
    const db = new DatabaseSync(dbPath, { readOnly: true })
    const storeRows = db.prepare(`
      SELECT paper_id, version_name, source_asset_version,
             publication_digest, is_current, created_at
      FROM canonical_paper_publications
      ORDER BY paper_id, version_name
    `).all().map(canonicalRow)
    const storeCurrentPaperIds = storeRows
      .filter((row) => row.isCurrent === 1)
      .map((row) => row.paperId)
      .sort()

    validateRuntime({ db, rootDir: storeRoot, paperIds: storeCurrentPaperIds })
    db.close()

    for (const row of storeRows) {
      const key = rowKey(row)
      if (seenRows.has(key)) {
        fail('CANONICAL_BACKFILL_SOURCE_CONFLICT', `Duplicate accepted publication identity: ${key}`)
      }
      seenRows.add(key)
      rows.push(row)
    }

    for (const paperId of storeCurrentPaperIds) {
      if (seenPapers.has(paperId)) {
        fail('CANONICAL_BACKFILL_SOURCE_CONFLICT', `Duplicate accepted current paper: ${paperId}`)
      }
      seenPapers.add(paperId)
      currentPaperIds.push(paperId)
      const latestRefPath = path.join(
        storeRoot,
        paperId,
        'latest',
        'canonical-paper-publication-ref-v1.json',
      )
      const latestRef = readJson(latestRefPath)
      const currentRow = storeRows.find(
        (row) => row.paperId === paperId && row.isCurrent === 1,
      )
      if (
        !currentRow
        || latestRef.paperId !== currentRow.paperId
        || latestRef.versionName !== currentRow.versionName
        || Number(latestRef.sourceAssetVersion) !== currentRow.sourceAssetVersion
        || latestRef.publicationDigest !== currentRow.publicationDigest
      ) {
        fail('CANONICAL_BACKFILL_SOURCE_CONFLICT', `Accepted current ref disagrees with its publication index: ${paperId}`)
      }
    }

    for (const paperId of storeCurrentPaperIds) {
      const paperRoot = path.join(storeRoot, paperId)
      const relativePaths = [
        ...listFiles(paperRoot, 'versions'),
        path.join('latest', 'canonical-paper-publication-ref-v1.json'),
      ].sort()
      for (const relativePath of relativePaths) {
        const sourcePath = path.join(paperRoot, relativePath)
        const bytes = readFileSync(sourcePath)
        assets.push({
          paperId,
          relativePath,
          sourcePath,
          sha256: sha256Bytes(bytes),
          byteLength: bytes.byteLength,
        })
      }
    }
  }

  currentPaperIds.sort()
  rows.sort((left, right) => rowKey(left).localeCompare(rowKey(right)))
  assets.sort((left, right) => (
    `${left.paperId}/${left.relativePath}`.localeCompare(`${right.paperId}/${right.relativePath}`)
  ))

  assert.equal(currentPaperIds.length, EXPECTED_PAPERS, 'accepted current paper denominator')
  assert.equal(new Set(currentPaperIds).size, EXPECTED_PAPERS, 'accepted current paper uniqueness')
  assert.equal(rows.length, EXPECTED_ROWS, 'accepted publication row denominator')
  assert.equal(rows.filter((row) => row.isCurrent === 1).length, EXPECTED_CURRENT_ROWS, 'accepted current row denominator')
  const inventory = { rows, assets, currentPaperIds }
  sourceInventoryByRepoRoot.set(repoRoot, inventory)
  return inventory
}

function readTargetRows(db) {
  const table = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = 'canonical_paper_publications'
  `).get()
  if (!table) return []
  return db.prepare(`
    SELECT paper_id, version_name, source_asset_version,
           publication_digest, is_current, created_at
    FROM canonical_paper_publications
    ORDER BY paper_id, version_name
  `).all().map(canonicalRow)
}

function inspectTarget({ inventory, targetDbPath, targetAssetsRoot }) {
  if (!existsSync(targetDbPath) || !statSync(targetDbPath).isFile()) {
    fail('CANONICAL_BACKFILL_TARGET_UNAVAILABLE', `Target database is missing: ${targetDbPath}`)
  }
  if (!existsSync(targetAssetsRoot) || !statSync(targetAssetsRoot).isDirectory()) {
    fail('CANONICAL_BACKFILL_TARGET_UNAVAILABLE', `Target paper-assets root is missing: ${targetAssetsRoot}`)
  }

  const db = new DatabaseSync(targetDbPath, { readOnly: true })
  const targetRows = readTargetRows(db)
  db.close()
  const expectedByKey = new Map(inventory.rows.map((row) => [rowKey(row), row]))
  const targetByKey = new Map(targetRows.map((row) => [rowKey(row), row]))
  const missingRows = []
  const conflictingRows = []

  for (const expected of inventory.rows) {
    const actual = targetByKey.get(rowKey(expected))
    if (!actual) missingRows.push(expected)
    else if (!sameRow(actual, expected)) conflictingRows.push({ expected, actual })
  }
  for (const actual of targetRows) {
    if (
      inventory.currentPaperIds.includes(actual.paperId)
      && !expectedByKey.has(rowKey(actual))
    ) conflictingRows.push({ expected: null, actual })
  }

  const missingAssets = []
  const conflictingAssets = []
  for (const asset of inventory.assets) {
    const targetPath = path.join(targetAssetsRoot, asset.paperId, asset.relativePath)
    if (!existsSync(targetPath)) {
      missingAssets.push({ ...asset, targetPath })
      continue
    }
    const bytes = readFileSync(targetPath)
    const actual = { sha256: sha256Bytes(bytes), byteLength: bytes.byteLength }
    if (actual.sha256 !== asset.sha256 || actual.byteLength !== asset.byteLength) {
      conflictingAssets.push({
        paperId: asset.paperId,
        relativePath: asset.relativePath,
        expected: { sha256: asset.sha256, byteLength: asset.byteLength },
        actual,
      })
    }
  }

  return { targetRows, missingRows, conflictingRows, missingAssets, conflictingAssets }
}

function writeAssetAtomically(asset) {
  mkdirSync(path.dirname(asset.targetPath), { recursive: true })
  const temporaryPath = path.join(
    path.dirname(asset.targetPath),
    `.${path.basename(asset.targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  )
  writeFileSync(temporaryPath, readFileSync(asset.sourcePath), { flag: 'wx' })
  renameSync(temporaryPath, asset.targetPath)
}

function writeRowsAtomically({ targetDbPath, missingRows }) {
  if (missingRows.length === 0) return 0
  const db = new DatabaseSync(targetDbPath)
  ensureCanonicalPublicationDatabaseShape(db)
  const insert = db.prepare(`
    INSERT INTO canonical_paper_publications (
      paper_id, version_name, source_asset_version,
      publication_digest, is_current, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const row of missingRows) {
      insert.run(
        row.paperId,
        row.versionName,
        row.sourceAssetVersion,
        row.publicationDigest,
        row.isCurrent,
        row.createdAt,
      )
    }
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch {}
    db.close()
    throw error
  }
  db.close()
  return missingRows.length
}

function verifyTargetRuntime({ targetDbPath, targetAssetsRoot, paperIds }) {
  const db = new DatabaseSync(targetDbPath, { readOnly: true })
  try {
    return validateRuntime({ db, rootDir: targetAssetsRoot, paperIds })
  } finally {
    db.close()
  }
}

export async function runCanonicalPublicationBackfill({
  repoRoot,
  targetDbPath,
  targetAssetsRoot,
  write = false,
  runtimeOnly = false,
}) {
  const inventory = loadAcceptedSourceInventory(repoRoot)
  const expected = {
    papers: inventory.currentPaperIds.length,
    rows: inventory.rows.length,
    currentRows: inventory.rows.filter((row) => row.isCurrent === 1).length,
    assetFiles: inventory.assets.length,
  }

  if (runtimeOnly) {
    if (write) fail('CANONICAL_BACKFILL_ARGUMENT_INVALID', '--runtime-only cannot be combined with --write')
    const runtime = verifyTargetRuntime({
      targetDbPath,
      targetAssetsRoot,
      paperIds: inventory.currentPaperIds,
    })
    return { status: 'PASS', mode: 'runtime-only', expected, runtime }
  }

  const inspection = inspectTarget({ inventory, targetDbPath, targetAssetsRoot })
  if (inspection.conflictingRows.length || inspection.conflictingAssets.length) {
    fail(
      'CANONICAL_PRODUCTION_BACKFILL_CONFLICT',
      'Production Canonical publication target contains conflicting immutable identities',
      {
        databaseRows: inspection.conflictingRows,
        assetFiles: inspection.conflictingAssets,
      },
    )
  }
  if (!write && (inspection.missingRows.length || inspection.missingAssets.length)) {
    fail(
      'CANONICAL_PRODUCTION_BACKFILL_REQUIRED',
      'Production Canonical publication target is missing accepted publication state',
      {
        databaseRows: inspection.missingRows.length,
        assetFiles: inspection.missingAssets.length,
      },
    )
  }

  let writtenAssetFiles = 0
  let writtenDatabaseRows = 0
  if (write) {
    for (const asset of inspection.missingAssets) {
      writeAssetAtomically(asset)
      writtenAssetFiles += 1
    }
    writtenDatabaseRows = writeRowsAtomically({
      targetDbPath,
      missingRows: inspection.missingRows,
    })
  }

  const finalInspection = inspectTarget({ inventory, targetDbPath, targetAssetsRoot })
  assert.equal(finalInspection.missingRows.length, 0, 'target publication rows close exactly')
  assert.equal(finalInspection.missingAssets.length, 0, 'target publication assets close exactly')
  assert.equal(finalInspection.conflictingRows.length, 0, 'target publication rows remain conflict-free')
  assert.equal(finalInspection.conflictingAssets.length, 0, 'target publication assets remain conflict-free')
  const runtime = verifyTargetRuntime({
    targetDbPath,
    targetAssetsRoot,
    paperIds: inventory.currentPaperIds,
  })
  return {
    status: 'PASS',
    mode: write ? 'write' : 'check',
    expected,
    write: {
      databaseRows: writtenDatabaseRows,
      assetFiles: writtenAssetFiles,
    },
    runtime,
  }
}
