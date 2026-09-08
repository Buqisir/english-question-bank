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
 * Phase 2 (isolated regression fixture; explicit --db for a corpus audit):
 *   every published paper_asset_versions row and every sources.file_ref
 *   paper id must have a renderable dir, and every disk dir must be known
 *   to the DB. The V0 development seed is not the served corpus inventory.
 *   --db <path> audits a selected DB read-only against --paper-assets <dir>
 *   (default: the tracked serve tree). Missing/malformed audit inputs fail.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const { values: args } = parseArgs({ options: { db: { type: 'string' }, 'paper-assets': { type: 'string' } } })
if (Object.values(args).some((value) => !value.trim())) throw new Error('Audit paths must be non-empty')
if (args['paper-assets'] && !args.db) throw new Error('--paper-assets requires --db')
const paperAssetsDir = path.resolve(args['paper-assets'] || path.join(rootDir, 'app', 'public', 'paper-assets'))

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

// Renderable per the frontend contract in
// PaperIntelligencePaperSurfaceHarness: /paper-assets/<id>/latest/paper-asset.json,
// falling back to legacy flat /paper-assets/<id>/paper-asset.json.
function renderableAssetPath(paperId) {
  const latest = path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json')
  if (existsSync(latest)) return latest
  const flat = path.join(paperAssetsDir, paperId, 'paper-asset.json')
  if (existsSync(flat)) return flat
  return null
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
  assert(
    `${paperId}: paper.paperId matches dir name`,
    asset?.paper?.paperId === paperId,
    `paper.paperId=${asset?.paper?.paperId}`,
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

// ─── Phase 2: one strict inventory audit, exercised by fixtures and --db ───
function auditReferences(db, diskIds, renderable) {
  const publishedIds = db
    .prepare(`SELECT DISTINCT paper_id FROM paper_asset_versions WHERE status = 'published'`)
    .all()
    .map((r) => r.paper_id)

  const fileRefIds = db
    .prepare(`SELECT DISTINCT file_ref FROM sources WHERE file_ref LIKE 'paper-assets/%'`)
    .all()
    .map((r) => r.file_ref.split('/')[1])

  const dbPaperIds = new Set([...publishedIds, ...fileRefIds])
  return [
    ...[...dbPaperIds].filter((id) => !renderable(id)).map((id) => `DB→disk ${id}`),
    ...diskIds.filter((id) => !dbPaperIds.has(id)).map((id) => `disk→DB ${id}`),
  ]
}

const fixture = new DatabaseSync(':memory:')
fixture.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
try {
  fixture.exec(`
    INSERT INTO sources (id, source_type, file_ref) VALUES ('source-fixture', 'self_made', 'paper-assets/paper-source/latest');
    INSERT INTO paper_asset_versions (id, paper_id, asset_version, version_name, version_dir, status)
      VALUES ('version-fixture', 'paper-published', 1, 'v1', 'paper-published/versions/v1', 'published');
  `)
  const diskIds = ['paper-source', 'paper-published']
  const audit = (ids = diskIds) => auditReferences(fixture, ids, (id) => ids.includes(id))
  assert('fixture: both source-only and published-only references pass', audit().length === 0)
  assert('fixture: disk orphan rejected', audit([...diskIds, 'paper-orphan']).join() === 'disk→DB paper-orphan')
  assert('fixture: missing published asset rejected', audit(['paper-source']).join() === 'DB→disk paper-published')
  assert('fixture: missing source-only asset rejected', audit(['paper-published']).join() === 'DB→disk paper-source')
  assert('fixture: known but unrenderable asset rejected',
    auditReferences(fixture, diskIds, (id) => id !== 'paper-source').join() === 'DB→disk paper-source')
  fixture.exec("UPDATE paper_asset_versions SET status = 'failed'")
  assert('fixture: failed publication cannot hide a disk orphan', audit().join() === 'disk→DB paper-published')
} finally {
  fixture.close()
}

if (args.db) {
  const db = new DatabaseSync(path.resolve(args.db), { readOnly: true })
  try {
    const errors = auditReferences(db, diskPaperIds, renderableAssetPath)
    assert('explicit corpus DB ↔ disk inventory', errors.length === 0, errors.join('\n  '))
  } finally {
    db.close()
  }
} else {
  console.log('SCOPE: tracked disk + isolated DB regressions; no deployment/local corpus DB audit requested (use --db).')
}

console.log()
if (failed > 0) {
  console.error(`${failed} failed / ${passed} passed`)
  process.exit(1)
}
console.log(`all ${passed} checks passed`)
