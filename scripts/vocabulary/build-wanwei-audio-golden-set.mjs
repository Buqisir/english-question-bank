#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const rootDir = path.resolve(import.meta.dirname, '../..')
const outputFlag = process.argv.indexOf('--output')
const outputPath = outputFlag >= 0 ? path.resolve(process.argv[outputFlag + 1]) : null
if (!outputPath) throw new Error('Usage: build-wanwei-audio-golden-set.mjs --output FILE')

const riskGroups = {
  'ultra-short': [1, 797, 770, 1039, 1191, 858, 538, 669, 164, 271, 436],
  heteronym: [987, 324, 971, 327, 1466, 255, 67, 239, 344, 1216, 449, 226, 660, 1017, 702, 1034],
  'british-vowel': [536, 652, 715, 614, 747, 767, 494, 18, 1261, 1188, 670, 911, 553, 1228],
  forms: [618, 605, 729, 820, 954, 1504, 1148, 1224, 848, 1040],
  abbreviation: [933, 699, 1245, 1167, 1248],
}

async function loadCalibrationProgram() {
  const require = createRequire(import.meta.url)
  const typescriptEntry = require.resolve('typescript', { paths: [path.join(rootDir, 'app')] })
  const ts = await import(pathToFileURL(typescriptEntry).href)
  const sourceDir = path.join(rootDir, 'app/src/features/vocabulary-review')
  const runtimeDir = mkdtempSync(path.join(tmpdir(), 'eqb-vocabulary-audio-golden-'))
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

const sourceMap = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/wanwei-round-one-source-map-v1.json'), 'utf8'))
const learning = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/wanwei-learning-content-v1.json'), 'utf8'))
const audioScript = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/wanwei-audio-script-v1.json'), 'utf8'))
const calibration = await loadCalibrationProgram()

const sourceByOrder = new Map(sourceMap.entries.map((entry) => [entry.sourceOrder, entry]))
const learningByOrder = new Map(learning.entries.map((entry) => [entry.sourceOrder, entry]))
const calibrationByOrder = new Map(calibration.entries.map((entry) => [entry.source.globalOrder, entry]))
const audioById = new Map(audioScript.entries.map((entry) => [entry.id, entry]))

const categoryByOrder = new Map()
for (const [category, orders] of Object.entries(riskGroups)) {
  for (const sourceOrder of orders) {
    if (categoryByOrder.has(sourceOrder)) throw new Error(`Golden sourceOrder ${sourceOrder} appears in more than one category`)
    categoryByOrder.set(sourceOrder, category)
  }
}

const entries = [...categoryByOrder]
  .sort(([left], [right]) => left - right)
  .map(([sourceOrder, category]) => {
    const source = sourceByOrder.get(sourceOrder)
    const calibrationEntry = calibrationByOrder.get(sourceOrder)
    const generatedEntry = learningByOrder.get(sourceOrder)
    const content = calibrationEntry ? {
      phonetic: calibrationEntry.phonetic,
      teachingSense: calibrationEntry.teachingSense,
      pronunciationMode: calibrationEntry.learning.pronunciationGuide.mode,
    } : generatedEntry
    const audio = source && audioById.get(source.id)
    if (!source || !content || !audio?.audio?.text) {
      throw new Error(`Golden sourceOrder ${sourceOrder} is missing source, learning, or audio content`)
    }
    return {
      entryId: source.id,
      sourceOrder,
      headword: source.headword,
      audioText: audio.audio.text,
      phonetic: content.phonetic,
      teachingSense: content.teachingSense,
      pronunciationMode: content.pronunciationMode,
      riskCategory: category,
      reviewStatus: 'pending',
    }
  })

if (entries.length !== 56 || new Set(entries.map((entry) => entry.entryId)).size !== 56) {
  throw new Error(`Golden set must contain exactly 56 unique entries, received ${entries.length}`)
}

writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: 'wanwei-audio-golden-set-v1',
  voice: 'eqb-british-teacher-v1',
  purpose: '孤立词起音、尾音、重音、英式元音、目标义读音、词形与缩写生产门禁',
  requiredChecks: ['start', 'ending', 'stress', 'british-vowel', 'target-sense-pronunciation', 'voice-consistency'],
  entries,
}, null, 2)}\n`)

console.log(JSON.stringify({ outputPath, entries: entries.length, categories: Object.keys(riskGroups) }, null, 2))
