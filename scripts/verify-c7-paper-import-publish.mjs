#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { publishPaperImportPackage } from '../server/paper-import/publisher.mjs'
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
  assert('first publish creates v1 dir', existsSync(path.join(paperAssetsDir, 'paper-2024-jslk-english/versions/v1/paper-asset.json')))
  assert('first publish creates latest dir', existsSync(path.join(paperAssetsDir, 'paper-2024-jslk-english/latest/paper-asset.json')))
  assert(
    'latest assetVersion is v1 after first publish',
    readJson(path.join(paperAssetsDir, 'paper-2024-jslk-english/latest/paper-asset.json')).paper.assetVersion === 1,
  )
  assert(
    'publish returns four QA links',
    Array.isArray(first.publish?.qaLinks) && first.publish.qaLinks.length === 4,
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
    db.prepare('SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?').get('paper-2024-jslk-english').count === 1,
  )
  const latestBeforeFailureBytes = readFileSync(path.join(paperAssetsDir, 'paper-2024-jslk-english/latest/paper-asset.json'))

  let forcedFailure = null
  try {
    publishPaperImportPackage({ files, db, paperAssetsDir, forceDbFailure: true })
  } catch (error) {
    forcedFailure = error
  }
  assert('forced DB failure throws', Boolean(forcedFailure))
  assert('failed v2 dir was removed', !existsSync(path.join(paperAssetsDir, 'paper-2024-jslk-english/versions/v2')))
  assert(
    'latest remains old v1 after DB failure',
    readJson(path.join(paperAssetsDir, 'paper-2024-jslk-english/latest/paper-asset.json')).paper.assetVersion === 1,
  )
  assert(
    'latest bytes remain unchanged after DB failure',
    Buffer.compare(latestBeforeFailureBytes, readFileSync(path.join(paperAssetsDir, 'paper-2024-jslk-english/latest/paper-asset.json'))) === 0,
  )
  assert(
    'DB published version count remains one after failure',
    db.prepare('SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?').get('paper-2024-jslk-english').count === 1,
  )
} finally {
  db.close()
  rmSync(tempRoot, { recursive: true, force: true })
}

if (failed > 0) {
  console.error(`\nC7 paper import publish verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC7 paper import publish verify PASSED: ${passed} passed, ${failed} failed`)
