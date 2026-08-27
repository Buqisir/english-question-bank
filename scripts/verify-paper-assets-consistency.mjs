#!/usr/bin/env node
/**
 * Verification: DB ↔ paper-assets consistency (data-orphan-cleanup cut).
 *
 * Guards the invariant that broke three papers before 2026-07:
 *   - a paper dir on disk that the web cannot render (no latest/ and no
 *     legacy flat paper-asset.json) — e.g. paper-960d0f8d before repair;
 *   - a paper dir unknown to the DB — e.g. paper-2024-jslk-english,
 *     which polluted every production R2 backup run;
 *   - DB rows whose assets are gone — e.g. paper-fe8e7a65 /
 *     paper-ee10da87, searchable but 404 on click-through.
 *
 * Phase 1 (always runs, CI-safe — paper-assets latest/ is git-tracked):
 *   every dir under app/public/paper-assets/ must be renderable by the
 *   frontend contract (latest/paper-asset.json, or legacy flat
 *   paper-asset.json), the JSON must parse, and paper.paperId must match
 *   the dir name. Stale .latest-tmp-* / .latest-prev-* swap residue fails.
 *
 * Phase 2 (only when data/question-bank.sqlite exists — local/production):
 *   every published paper_asset_versions row and every sources.file_ref
 *   paper id must have a renderable dir, and every disk dir must be known
 *   to the DB. When the DB is absent (clean CI checkout), phase 2 is
 *   skipped via exit code 2 per the verify-ci.mjs skip convention.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const paperAssetsDir = path.join(rootDir, 'app', 'public', 'paper-assets')
const dbPath = path.join(rootDir, 'data', 'question-bank.sqlite')

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`PASS ${name}`)
  } else {
    failed++
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`)
  }
}

// Renderable per either public contract: legacy latest/flat paper-asset.json,
// or a Canonical latest ref that resolves to its immutable version asset.
function renderableAssetPath(paperId) {
  const latest = path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json')
  if (existsSync(latest)) return latest
  const flat = path.join(paperAssetsDir, paperId, 'paper-asset.json')
  if (existsSync(flat)) return flat
  const refPath = canonicalPublicationRefPath(paperId)
  if (!refPath) return null
  try {
    const ref = JSON.parse(readFileSync(refPath, 'utf8'))
    if (
      ref?.paperId !== paperId
      || !/^v\d+$/.test(ref?.versionName || '')
    ) return null
    const canonicalAsset = path.join(
      paperAssetsDir,
      paperId,
      'versions',
      ref.versionName,
      'paper-asset.json',
    )
    return existsSync(canonicalAsset) ? canonicalAsset : null
  } catch {
    return null
  }
}

function canonicalPublicationRefPath(paperId) {
  const refPath = path.join(
    paperAssetsDir,
    paperId,
    'latest',
    'canonical-paper-publication-ref-v1.json',
  )
  return existsSync(refPath) ? refPath : null
}

// Backup-suffixed files (foo.bak, foo.bak.20260716, foo.orig, editor foo~)
// anywhere under a paper dir. paper-assets is a public serve path — backups
// belong outside it.
function listBackupFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...listBackupFiles(full))
    else if (/(\.bak(\.|$)|\.orig$|~$)/.test(entry.name)) found.push(path.relative(paperAssetsDir, full))
  }
  return found
}

console.log('verify: DB ↔ paper-assets consistency')
console.log()

// ─── Phase 1: disk invariants ────────────────────────────────────────────────

const diskPaperIds = readdirSync(paperAssetsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)

assert('paper-assets dir has at least one paper', diskPaperIds.length > 0)

for (const paperId of diskPaperIds) {
  const assetPath = renderableAssetPath(paperId)
  assert(
    `${paperId}: renderable (latest/ or legacy flat paper-asset.json)`,
    assetPath !== null,
    `no latest/paper-asset.json and no flat paper-asset.json under ${paperId}/`,
  )
  if (!assetPath) continue

  let asset = null
  try {
    asset = JSON.parse(readFileSync(assetPath, 'utf8'))
  } catch (error) {
    assert(`${paperId}: paper-asset.json parses`, false, String(error))
    continue
  }
  const canonicalVersionRoot = `${path.join(
    paperAssetsDir,
    paperId,
    'versions',
  )}${path.sep}`
  const assetPaperId = assetPath.startsWith(canonicalVersionRoot)
    ? asset?.paperId
    : asset?.paper?.paperId
  assert(
    `${paperId}: asset paperId matches dir name`,
    assetPaperId === paperId,
    `asset paperId=${assetPaperId}`,
  )

  const residue = readdirSync(path.join(paperAssetsDir, paperId), { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\.latest-(tmp|prev)-/.test(e.name))
    .map((e) => e.name)
  assert(
    `${paperId}: no stale latest-swap residue`,
    residue.length === 0,
    residue.join(', '),
  )

  // Backup files must never sit in the serve path (jslk backup-501 incident
  // class; 44 grammar-facets-v2 migration .bak leftovers cleaned 2026-07-16).
  const backups = listBackupFiles(path.join(paperAssetsDir, paperId))
  assert(
    `${paperId}: no backup files in serve path`,
    backups.length === 0,
    backups.join(', '),
  )
}

// ─── Phase 2: DB cross-check (skip on clean CI checkout) ────────────────────

if (!existsSync(dbPath)) {
  if (failed > 0) {
    console.error(`\n${failed} failed / ${passed} passed`)
    process.exit(1)
  }
  console.log(`\ndisk invariants: ${passed} passed`)
  console.log('SKIP: data/question-bank.sqlite absent — DB cross-check not run')
  process.exit(2)
}

const { DatabaseSync } = await import('node:sqlite')
const db = new DatabaseSync(dbPath, { readOnly: true })

const publishedIds = db
  .prepare(`SELECT DISTINCT paper_id FROM paper_asset_versions WHERE status = 'published'`)
  .all()
  .map((r) => r.paper_id)

const fileRefIds = db
  .prepare(`SELECT DISTINCT file_ref FROM sources WHERE file_ref LIKE 'paper-assets/%'`)
  .all()
  .map((r) => r.file_ref.split('/')[1])

const hasCanonicalPublicationTable = Boolean(
  db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'canonical_paper_publications'",
  ).get(),
)
const canonicalPublicationIds = hasCanonicalPublicationTable
  ? db
      .prepare('SELECT DISTINCT paper_id FROM canonical_paper_publications WHERE is_current = 1')
      .all()
      .map((r) => r.paper_id)
  : []

db.close()

const dbPaperIds = new Set([
  ...publishedIds,
  ...fileRefIds,
  ...canonicalPublicationIds,
])

for (const paperId of dbPaperIds) {
  assert(
    `DB→disk ${paperId}: assets renderable on disk`,
    renderableAssetPath(paperId) !== null,
    'DB references this paper but the web would 404 on it',
  )
}

for (const paperId of diskPaperIds) {
  assert(
    `disk→DB ${paperId}: known to the DB`,
    dbPaperIds.has(paperId),
    'disk orphan — dir exists but no DB row references it',
  )
}

console.log()
if (failed > 0) {
  console.error(`${failed} failed / ${passed} passed`)
  process.exit(1)
}
console.log(`all ${passed} checks passed`)
