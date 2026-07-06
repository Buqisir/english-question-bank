#!/usr/bin/env node
// KEEP: tests the paper-import ENGINE (publisher/validator) contracts, not the
// retired C7 UI/routes. See ADR-0016. Do not delete when retiring import UI.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { publishPaperImportPackage } from '../server/paper-import/publisher.mjs'
import { cleanupPaperImportTempArtifacts, resolvePaperAssetReadPaths } from '../server/paper-import/storage.mjs'
import { readImportPackageFromDirectory } from '../server/paper-import/validator.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const fixtureDir = path.join(rootDir, 'test-fixtures/paper-import/paper-2024-jslk-english')

let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function tableExists(db, tableName) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName),
  )
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-c7-publish-'))
const dbPath = path.join(tempRoot, 'question-bank.sqlite')
const paperAssetsDir = path.join(tempRoot, 'paper-assets')
const paperId = 'paper-2024-jslk-english'
const db = new DatabaseSync(dbPath)

try {
  db.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  const files = readImportPackageFromDirectory(fixtureDir)

  const invalidDb = new DatabaseSync(path.join(tempRoot, 'invalid.sqlite'))
  const invalidRoot = path.join(tempRoot, 'invalid-paper-assets')
  const invalid = publishPaperImportPackage({
    files: files.filter((file) => file.fileName !== 'reading-choice-analysis-v1.json'),
    db: invalidDb,
    paperAssetsDir: invalidRoot,
  })
  assert('validate failure returns validation_failed', invalid.status === 'validation_failed')
  assert('validate failure writes no files', !existsSync(invalidRoot))
  assert('validate failure writes no DB tables', !tableExists(invalidDb, 'paper_asset_versions'))
  invalidDb.close()

  const writeFailDb = new DatabaseSync(path.join(tempRoot, 'write-fail.sqlite'))
  const fileInsteadOfRoot = path.join(tempRoot, 'paper-assets-file')
  writeFileSync(fileInsteadOfRoot, 'not a directory')
  let writeFailure = null
  try {
    publishPaperImportPackage({ files, db: writeFailDb, paperAssetsDir: fileInsteadOfRoot })
  } catch (error) {
    writeFailure = error
  }
  assert('versioned file write failure throws before DB transaction', Boolean(writeFailure))
  assert('versioned file write failure creates no DB tables', !tableExists(writeFailDb, 'paper_asset_versions'))
  writeFailDb.close()

  const first = publishPaperImportPackage({ files, db, paperAssetsDir })
  assert('first publish succeeds', first.ok, JSON.stringify(first, null, 2))
  assert('first publish creates v1 dir', existsSync(path.join(paperAssetsDir, `${paperId}/versions/v1/paper-asset.json`)))
  assert('first publish creates latest dir', existsSync(path.join(paperAssetsDir, `${paperId}/latest/paper-asset.json`)))
  assert(
    'latest assetVersion is v1 after first publish',
    readJson(path.join(paperAssetsDir, `${paperId}/latest/paper-asset.json`)).paper.assetVersion === 1,
  )
  assert(
    'publish returns QA links (4 Reading + 七选五 if present)',
    Array.isArray(first.publish?.qaLinks) && first.publish.qaLinks.length >= 4,
  )
  assert(
    'QA links include latest and version hrefs',
    first.publish.qaLinks.every((link) => link.latestHref.includes('source=paper-asset') && link.versionHref.includes('version=v1')),
  )
  assert(
    'DB has Reading A-D groups',
    db.prepare("SELECT COUNT(*) AS count FROM question_groups WHERE group_type = 'reading'").get().count === 4,
  )
  assert(
    'DB has all imported questions',
    db.prepare('SELECT COUNT(*) AS count FROM questions').get().count === 65,
  )
  assert(
    'DB has one published paper asset version row',
    db.prepare('SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?').get(paperId).count === 1,
  )

  const existingTagDb = new DatabaseSync(path.join(tempRoot, 'existing-tag.sqlite'))
  const existingTagAssets = path.join(tempRoot, 'existing-tag-paper-assets')
  existingTagDb.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  existingTagDb.prepare(
    "INSERT INTO tags (id, name, category, description, is_active) VALUES ('tag-existing-2024', '2024', '教师标签', '', 1)",
  ).run()
  const existingTagPublish = publishPaperImportPackage({ files, db: existingTagDb, paperAssetsDir: existingTagAssets })
  assert('publish reuses existing tag names without UNIQUE failure', existingTagPublish.ok)
  assert(
    'existing 2024 tag remains single row after publish',
    existingTagDb.prepare("SELECT COUNT(*) AS count FROM tags WHERE name = '2024'").get().count === 1,
  )
  assert(
    'existing 2024 tag is linked to imported groups',
    existingTagDb.prepare(
      "SELECT COUNT(*) AS count FROM tag_links WHERE tag_id = 'tag-existing-2024' AND target_type = 'question_group'",
    ).get().count > 0,
  )
  existingTagDb.close()

  const dbOnlyVersionDb = new DatabaseSync(path.join(tempRoot, 'db-only-version.sqlite'))
  const dbOnlyVersionAssets = path.join(tempRoot, 'db-only-version-paper-assets')
  dbOnlyVersionDb.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  dbOnlyVersionDb.exec(`
    CREATE TABLE IF NOT EXISTS paper_asset_versions (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      asset_version INTEGER NOT NULL,
      version_name TEXT NOT NULL,
      version_dir TEXT NOT NULL,
      source_file_sha256 TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(paper_id, asset_version)
    )
  `)
  dbOnlyVersionDb.prepare(
    `
    INSERT INTO paper_asset_versions (id, paper_id, asset_version, version_name, version_dir, source_file_sha256, status)
    VALUES ('pav-db-only-v1', ?, 1, 'v1', 'missing-on-disk', 'sha', 'published')
    `,
  ).run(paperId)
  const dbOnlyPublish = publishPaperImportPackage({ files, db: dbOnlyVersionDb, paperAssetsDir: dbOnlyVersionAssets })
  assert('publish skips DB-only existing version', dbOnlyPublish.publish?.assetVersion === 2)
  assert('DB-only version publish creates v2 dir', existsSync(path.join(dbOnlyVersionAssets, `${paperId}/versions/v2/paper-asset.json`)))
  assert(
    'DB-only version publish preserves both DB rows',
    dbOnlyVersionDb.prepare('SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?').get(paperId).count === 2,
  )
  dbOnlyVersionDb.close()

  const latestDir = path.join(paperAssetsDir, `${paperId}/latest`)
  const hiddenLatest = path.join(paperAssetsDir, `${paperId}/.latest-prev-window-test`)
  renameSync(latestDir, hiddenLatest)
  const fallbackPaths = resolvePaperAssetReadPaths(paperAssetsDir, paperId)
  assert('missing latest read falls back to latest version dir', fallbackPaths.assetPath.includes('/versions/v1/paper-asset.json'))
  assert('missing latest fallback reads v1 asset', readJson(fallbackPaths.assetPath).paper.assetVersion === 1)
  renameSync(hiddenLatest, latestDir)

  const latestBeforeFailureBytes = readFileSync(path.join(paperAssetsDir, `${paperId}/latest/paper-asset.json`))

  let forcedFailure = null
  try {
    publishPaperImportPackage({ files, db, paperAssetsDir, forceDbFailure: true })
  } catch (error) {
    forcedFailure = error
  }
  assert('forced DB failure throws', Boolean(forcedFailure))
  assert('failed v2 dir was removed', !existsSync(path.join(paperAssetsDir, `${paperId}/versions/v2`)))
  assert(
    'latest remains old v1 after DB failure',
    readJson(path.join(paperAssetsDir, `${paperId}/latest/paper-asset.json`)).paper.assetVersion === 1,
  )
  assert(
    'latest bytes remain unchanged after DB failure',
    Buffer.compare(latestBeforeFailureBytes, readFileSync(path.join(paperAssetsDir, `${paperId}/latest/paper-asset.json`))) === 0,
  )
  assert(
    'DB published version count remains one after failure',
    db.prepare('SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?').get(paperId).count === 1,
  )

  const second = publishPaperImportPackage({ files, db, paperAssetsDir })
  assert('second publish succeeds after failed v2 attempt', second.ok)
  assert('second publish reuses v2 after failed attempt', second.publish?.assetVersion === 2)
  assert('second publish creates v2 dir', existsSync(path.join(paperAssetsDir, `${paperId}/versions/v2/paper-asset.json`)))
  assert(
    'latest swaps to v2 after second publish',
    readJson(path.join(paperAssetsDir, `${paperId}/latest/paper-asset.json`)).paper.assetVersion === 2,
  )
  assert(
    'DB has v1 and v2 published version rows',
    db.prepare("SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ? AND status = 'published'").get(paperId).count === 2,
  )
  assert(
    'import run audit preserves success/fail/success sequence',
    db.prepare('SELECT COUNT(*) AS count FROM paper_import_runs WHERE paper_id = ?').get(paperId).count === 3,
  )

  const staleLatestTmp = path.join(paperAssetsDir, `${paperId}/.latest-tmp-stale`)
  const staleLatestPrev = path.join(paperAssetsDir, `${paperId}/.latest-prev-stale`)
  const staleVersionTmp = path.join(paperAssetsDir, `${paperId}/versions/.tmp-v3-stale`)
  mkdirSync(staleLatestTmp, { recursive: true })
  mkdirSync(staleLatestPrev, { recursive: true })
  mkdirSync(staleVersionTmp, { recursive: true })
  const removed = cleanupPaperImportTempArtifacts(paperAssetsDir)
  assert('cleanup removes stale latest temp dirs', !existsSync(staleLatestTmp) && !existsSync(staleLatestPrev))
  assert('cleanup removes stale version temp dirs', !existsSync(staleVersionTmp))
  assert('cleanup reports removed temp artifacts', removed.length >= 3)
} finally {
  db.close()
  rmSync(tempRoot, { recursive: true, force: true })
}

if (failed > 0) {
  console.error(`\nC7 paper import publish verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC7 paper import publish verify PASSED: ${passed} passed, ${failed} failed`)
