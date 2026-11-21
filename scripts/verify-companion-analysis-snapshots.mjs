#!/usr/bin/env node
// Pins the teacher-analysis HTML for every in-repo paper fixture by digest, so
// a refactor of server/exports/companion-analysis/ shows at once whether the
// output moved. An intended layout change re-pins with --update and the diff
// of the snapshot file shows which papers it touched.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildCompanionAnalysisHtml, loadCompanionAnalysisSource } from '../server/exports/companionAnalysisRenderer.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const snapshotPath = path.join(rootDir, 'test-fixtures', 'companion-analysis-snapshots.json')
const assetDirs = ['test-fixtures/retired-paper-assets', 'app/public/paper-assets']

const actual = {}
for (const relativeDir of assetDirs) {
  const paperAssetsDir = path.join(rootDir, relativeDir)
  for (const paperId of readdirSync(paperAssetsDir).sort()) {
    let source
    try {
      source = loadCompanionAnalysisSource({ paperAssetsDir, paperId })
    } catch (error) {
      if (error.code === 'COMPANION_ANALYSIS_NOT_FOUND') continue
      throw error
    }
    const html = buildCompanionAnalysisHtml(source)
    actual[`${relativeDir}/${paperId}`] = createHash('sha256').update(html).digest('hex')
  }
}
assert.ok(Object.keys(actual).length >= 5, 'expected at least five fixtures with analyses')

if (process.argv.includes('--update')) {
  writeFileSync(snapshotPath, `${JSON.stringify(actual, null, 2)}\n`)
  console.log(`Pinned ${Object.keys(actual).length} companion-analysis snapshots`)
} else {
  assert.ok(existsSync(snapshotPath), 'snapshot file missing; run with --update')
  const expected = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  const changed = Object.keys({ ...expected, ...actual }).filter(key => expected[key] !== actual[key])
  assert.deepEqual(changed, [], `companion-analysis HTML changed for: ${changed.join(', ')} (re-pin with --update if intended)`)
  console.log(`Companion-analysis snapshots unchanged (${Object.keys(actual).length} papers)`)
}
