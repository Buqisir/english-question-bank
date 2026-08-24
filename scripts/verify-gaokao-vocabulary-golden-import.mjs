#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  ensureSharedVocabularyShape,
  getVocabularyProgram,
  listVocabularyPrograms,
} from '../server/vocabulary/vocabularyStore.mjs'
import { spawnSync } from 'node:child_process'

const rootDir = path.resolve(import.meta.dirname, '..')
const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-gaokao-golden-import-'))
const dbPath = path.join(tempRoot, 'question-bank-copy.sqlite')
const programId = 'gaokao-curriculum-3000-frequency-v1'
const importer = 'scripts/vocabulary/import-gaokao-frequency-program.mjs'
const contentArgs = [
  '--learning', 'data/vocabulary/gaokao-frequency-golden-learning-reviewed-v1.json',
  '--visual', 'data/vocabulary/gaokao-frequency-golden-visual-manifest-v1.json',
  '--american-audio', 'data/vocabulary/gaokao-frequency-golden-american-audio-manifest-v1.json',
  '--british-audio', 'data/vocabulary/gaokao-frequency-golden-british-audio-manifest-v1.json',
]

function runImporter(args) {
  return spawnSync(process.execPath, [importer, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
  })
}

try {
  const seed = new DatabaseSync(dbPath)
  ensureSharedVocabularyShape(seed)
  seed.prepare(`
    INSERT INTO vocabulary_programs
      (id, version, title, subtitle, source_title, source_edition,
       total_planned_entries, structure_json, availability, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    'visible-sentinel-program', 'sentinel-v1', '现有可见课程', '',
    'verifier fixture', '', 1, '{}', 'available',
  )
  seed.close()

  const imported = runImporter([
    '--golden-sample',
    '--publish',
    '--db', dbPath,
    ...contentArgs,
  ])
  assert.equal(imported.status, 0, imported.stderr || imported.stdout)
  const report = JSON.parse(imported.stdout)
  assert.deepEqual({
    mode: report.mode,
    scope: report.scope,
    availability: report.availability,
    groupCount: report.groupCount,
    entryCount: report.entryCount,
    stageCounts: report.stageCounts,
    uniqueVisuals: report.uniqueVisuals,
    uniqueAmericanAudio: report.uniqueAmericanAudio,
    uniqueBritishAudio: report.uniqueBritishAudio,
  }, {
    mode: 'publish',
    scope: 'golden-sample',
    availability: 'hidden',
    groupCount: 61,
    entryCount: 90,
    stageCounts: { high_frequency: 30, mid_frequency: 30, low_frequency: 30 },
    uniqueVisuals: 90,
    uniqueAmericanAudio: 90,
    uniqueBritishAudio: 90,
  })

  const copiedDb = new DatabaseSync(dbPath, { readOnly: true })
  try {
    assert.deepEqual(listVocabularyPrograms(copiedDb).map((program) => program.id), [
      'visible-sentinel-program',
    ])
    assert.deepEqual(listVocabularyPrograms(copiedDb, { includeHidden: true }).map((program) => ({
      id: program.id,
      availability: program.availability,
    })), [
      { id: 'visible-sentinel-program', availability: 'available' },
      { id: programId, availability: 'hidden' },
    ])
    const program = getVocabularyProgram(copiedDb, programId)
    assert.equal(program.totalPlannedEntries, 3000)
    assert.equal(program.groups.length, 61)
    assert.equal(program.entries.length, 90)
    assert.equal(new Set(program.entries.map((entry) => entry.source.sourceOrder)).size, 90)
    assert.equal(program.entries.filter((entry) => entry.source.stage === 'high_frequency').length, 30)
    assert.equal(program.entries.filter((entry) => entry.source.stage === 'mid_frequency').length, 30)
    assert.equal(program.entries.filter((entry) => entry.source.stage === 'low_frequency').length, 30)
    for (const entry of program.entries) {
      assert.ok(entry.audioVariants?.american?.path, `missing American audio for ${entry.id}`)
      assert.ok(entry.audioVariants?.british?.path, `missing British audio for ${entry.id}`)
    }
  } finally {
    copiedDb.close()
  }

  const tamperedLearningPath = path.join(tempRoot, 'tampered-learning.json')
  const tamperedLearning = JSON.parse(readFileSync(path.join(
    rootDir,
    'data/vocabulary/gaokao-frequency-golden-learning-reviewed-v1.json',
  ), 'utf8'))
  tamperedLearning.entries[0].sourceMeanings = ['被篡改的来源义']
  writeFileSync(tamperedLearningPath, `${JSON.stringify(tamperedLearning, null, 2)}\n`)
  const tamperedSourceMeanings = runImporter([
    '--golden-sample',
    '--learning', tamperedLearningPath,
    ...contentArgs.slice(2),
  ])
  assert.notEqual(tamperedSourceMeanings.status, 0, 'reviewed source meanings must remain bound to the approved receipt')
  assert.match(
    `${tamperedSourceMeanings.stderr}${tamperedSourceMeanings.stdout}`,
    /source meanings mismatch.*gaokao-frequency-0001-the/iu,
  )

  const exposed = runImporter([
    '--golden-sample',
    '--available',
    '--db', dbPath,
    ...contentArgs,
  ])
  assert.notEqual(exposed.status, 0, 'golden sample must not be importable as an available course')
  assert.match(`${exposed.stderr}${exposed.stdout}`, /golden sample.*hidden/iu)

  const weakenedFullGate = runImporter(contentArgs)
  assert.notEqual(weakenedFullGate.status, 0, 'full import must still reject 90-entry manifests')
  assert.match(`${weakenedFullGate.stderr}${weakenedFullGate.stdout}`, /exactly 3000 entries/u)

  console.log('PASS gaokao golden import: 90 hidden entries coexist in a copied database without weakening the 3000-entry gate')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
