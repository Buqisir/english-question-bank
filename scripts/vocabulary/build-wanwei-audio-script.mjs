#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const rootDir = path.resolve(import.meta.dirname, '../..')
const spokenTextOverrides = new Map([
  [1228, 'world.'],
])

function flagValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

async function loadCalibrationProgram() {
  const require = createRequire(import.meta.url)
  const typescriptEntry = require.resolve('typescript', { paths: [path.join(rootDir, 'app')] })
  const ts = await import(pathToFileURL(typescriptEntry).href)
  const sourceDir = path.join(rootDir, 'app/src/features/vocabulary-review')
  const runtimeDir = mkdtempSync(path.join(tmpdir(), 'eqb-vocabulary-audio-script-'))
  try {
    for (const moduleName of ['calibrationVocabularyLearningContent', 'calibrationVocabularyProgram']) {
      const source = readFileSync(path.join(sourceDir, `${moduleName}.ts`), 'utf8')
      const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: `${moduleName}.ts`,
      }).outputText.replace(
        "from './calibrationVocabularyLearningContent'",
        "from './calibrationVocabularyLearningContent.js'",
      )
      writeFileSync(path.join(runtimeDir, `${moduleName}.js`), output)
    }
    const module = await import(pathToFileURL(path.join(runtimeDir, 'calibrationVocabularyProgram.js')).href)
    return module.calibrationVocabularyProgram
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true })
  }
}

function spelling(part) {
  return typeof part === 'string' ? part : part.spelling
}

function spokenText(headword, mode, parts) {
  if (mode === 'forms') {
    return [...new Set(parts.map(spelling).map((value) => value.trim()).filter(Boolean))].join(', ')
  }
  return headword.replaceAll('(', '').replaceAll(')', '').replace(/\s+/gu, ' ').trim()
}

const outputPath = flagValue('--output')
if (!outputPath) throw new Error('Usage: build-wanwei-audio-script.mjs --output FILE')

const sourceMap = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/wanwei-round-one-source-map-v1.json'), 'utf8'))
const learning = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/wanwei-learning-content-v1.json'), 'utf8'))
const calibration = await loadCalibrationProgram()
const generatedByOrder = new Map(learning.entries.map((entry) => [entry.sourceOrder, entry]))
const calibrationByOrder = new Map(calibration.entries.map((entry) => [entry.source.globalOrder, entry]))

const entries = sourceMap.entries.map((source) => {
  const calibrationEntry = calibrationByOrder.get(source.sourceOrder)
  const generatedEntry = generatedByOrder.get(source.sourceOrder)
  const mode = calibrationEntry?.learning.pronunciationGuide.mode ?? generatedEntry?.pronunciationMode
  const parts = calibrationEntry?.learning.pronunciationGuide.parts ?? generatedEntry?.syllables
  if (!mode || !Array.isArray(parts) || parts.length === 0) {
    throw new Error(`Missing reviewed pronunciation content for ${source.id}`)
  }
  return {
    id: source.id,
    headword: source.headword,
    audio: { text: spokenTextOverrides.get(source.sourceOrder) ?? spokenText(source.headword, mode, parts) },
  }
})

if (entries.length !== 1600 || new Set(entries.map((entry) => entry.id)).size !== 1600
    || entries.some((entry) => !entry.audio.text)) {
  throw new Error('Audio script must contain exactly 1600 complete, uniquely identified entries')
}

writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: 'wanwei-audio-script-v1',
  voice: 'eqb-british-teacher-v1',
  entries,
}, null, 2)}\n`)
console.log(JSON.stringify({ outputPath, entries: entries.length, voice: 'eqb-british-teacher-v1' }, null, 2))
