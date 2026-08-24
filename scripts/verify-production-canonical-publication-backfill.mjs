import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import { runCanonicalPublicationBackfill } from './lib/productionCanonicalBackfill.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'eqb-canonical-production-backfill-'))
const targetDbPath = path.join(tempRoot, 'question-bank.sqlite')
const targetAssetsRoot = path.join(tempRoot, 'paper-assets')

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function createProductionShapedBankFixture() {
  const db = new DatabaseSync(targetDbPath)
  try {
    db.exec(`
      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        year INTEGER,
        region TEXT NOT NULL DEFAULT '',
        paper_name TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE passages (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        discourse_type TEXT,
        word_count INTEGER
      );
      CREATE TABLE question_groups (
        id TEXT PRIMARY KEY,
        passage_id TEXT NOT NULL,
        group_type TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        display_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE questions (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL
      );

      INSERT INTO sources (
        id, source_type, year, region, paper_name
      ) VALUES (
        'source-sentinel', 'fixture', 2026, 'CI', 'Backfill sentinel'
      );
      INSERT INTO passages (
        id, source_id, discourse_type, word_count
      ) VALUES (
        'passage-sentinel', 'source-sentinel', 'narrative', 1
      );
      INSERT INTO question_groups (
        id, passage_id, group_type, title, display_order
      ) VALUES (
        'group-sentinel', 'passage-sentinel', 'reading', 'Sentinel', 1
      );
      INSERT INTO questions (
        id, group_id
      ) VALUES (
        'question-sentinel', 'group-sentinel'
      );
    `)
  } finally {
    db.close()
  }
}

try {
  createProductionShapedBankFixture()
  cpSync(path.join(repoRoot, 'app/public/paper-assets'), targetAssetsRoot, {
    recursive: true,
  })

  const sentinelPath = path.join(
    targetAssetsRoot,
    'paper-2026-i',
    'latest',
    'paper-asset.json',
  )
  const sentinelDigest = sha256(sentinelPath)
  const existingVersionAssetPath = path.join(
    targetAssetsRoot,
    'paper-2026-i',
    'versions',
    'v1',
    'paper-asset.json',
  )
  mkdirSync(path.dirname(existingVersionAssetPath), { recursive: true })
  copyFileSync(sentinelPath, existingVersionAssetPath)
  const existingVersionAssetDigest = sha256(existingVersionAssetPath)

  const dbBefore = new DatabaseSync(targetDbPath, { readOnly: true })
  const bankCountsBefore = dbBefore.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sources) AS sources,
      (SELECT COUNT(*) FROM passages) AS passages,
      (SELECT COUNT(*) FROM question_groups) AS groups,
      (SELECT COUNT(*) FROM questions) AS questions
  `).get()
  dbBefore.close()

  await assert.rejects(
    () => runCanonicalPublicationBackfill({
      repoRoot,
      targetDbPath,
      targetAssetsRoot,
      write: false,
    }),
    (error) => error?.code === 'CANONICAL_PRODUCTION_BACKFILL_REQUIRED',
    'production-shaped target must reproduce the missing-publication failure before backfill',
  )

  const first = await runCanonicalPublicationBackfill({
    repoRoot,
    targetDbPath,
    targetAssetsRoot,
    write: true,
  })
  assert.equal(first.status, 'PASS')
  assert.equal(first.expected.papers, 33)
  assert.equal(first.expected.rows, 36)
  assert.equal(first.expected.currentRows, 33)
  assert.equal(first.runtime.screenReady, 33)
  assert.equal(first.runtime.printPdfReady, 33)
  assert.equal(first.write.databaseRows, 36)
  assert.ok(first.write.assetFiles > 0)

  const second = await runCanonicalPublicationBackfill({
    repoRoot,
    targetDbPath,
    targetAssetsRoot,
    write: true,
  })
  assert.equal(second.status, 'PASS')
  assert.equal(second.write.databaseRows, 0)
  assert.equal(second.write.assetFiles, 0)

  const runtimeOnly = await runCanonicalPublicationBackfill({
    repoRoot,
    targetDbPath,
    targetAssetsRoot,
    write: false,
    runtimeOnly: true,
  })
  assert.equal(runtimeOnly.status, 'PASS')
  assert.equal(runtimeOnly.runtime.screenReady, 33)
  assert.equal(runtimeOnly.runtime.printPdfReady, 33)

  const dbAfter = new DatabaseSync(targetDbPath, { readOnly: true })
  const bankCountsAfter = dbAfter.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sources) AS sources,
      (SELECT COUNT(*) FROM passages) AS passages,
      (SELECT COUNT(*) FROM question_groups) AS groups,
      (SELECT COUNT(*) FROM questions) AS questions
  `).get()
  const publicationCounts = dbAfter.prepare(`
    SELECT
      COUNT(*) AS rows,
      SUM(is_current) AS currentRows,
      COUNT(DISTINCT paper_id) AS papers
    FROM canonical_paper_publications
  `).get()
  dbAfter.close()

  assert.deepEqual(bankCountsAfter, bankCountsBefore)
  assert.deepEqual(
    { ...publicationCounts },
    { rows: 36, currentRows: 33, papers: 33 },
  )
  assert.equal(sha256(sentinelPath), sentinelDigest, 'existing latest paper asset must stay byte-identical')
  assert.equal(
    sha256(existingVersionAssetPath),
    existingVersionAssetDigest,
    'existing versioned paper asset must stay byte-identical',
  )
  assert.ok(
    existsSync(path.join(
      targetAssetsRoot,
      'paper-2026-i',
      'versions',
      'v1',
      'canonical',
      'source-asset.bin',
    )),
    'Canonical source bytes use the dedicated source-asset path instead of overwriting the imported version asset',
  )

  console.log('PASS: production Canonical publication backfill restores 33/33 Screen and Print/PDF consumption without changing bank content')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
