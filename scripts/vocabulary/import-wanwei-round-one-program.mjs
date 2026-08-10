#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { replaceVocabularyProgram } from '../../server/vocabulary/vocabularyStore.mjs'

const rootDir = path.resolve(import.meta.dirname, '../..')

function parseArgs(argv) {
  const result = { publish: false }
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === '--publish') {
      result.publish = true
      continue
    }
    const value = argv[index + 1]
    if (!key.startsWith('--') || value == null) throw new Error(`Invalid argument near ${key}`)
    result[key.slice(2)] = value
    index += 1
  }
  for (const required of ['learning', 'visual', 'audio', 'examples']) {
    if (!result[required]) throw new Error(`Missing --${required}`)
  }
  return result
}

async function loadCalibrationProgram() {
  const require = createRequire(import.meta.url)
  const typescriptEntry = require.resolve('typescript', { paths: [path.join(rootDir, 'app')] })
  const ts = await import(pathToFileURL(typescriptEntry).href)
  const sourceDir = path.join(rootDir, 'app/src/features/vocabulary-review')
  const runtimeDir = mkdtempSync(path.join(tmpdir(), 'eqb-vocabulary-calibration-'))
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

function exactly(entries, expected, label) {
  if (!Array.isArray(entries) || entries.length !== expected) {
    throw new Error(`${label} must contain exactly ${expected} entries`)
  }
  return entries
}

const args = parseArgs(process.argv.slice(2))
const sourceMap = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/wanwei-round-one-source-map-v1.json'), 'utf8'))
const sourceLedger = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/source-evidence/wanwei-page-review-ledger-v1.json'), 'utf8'))
const learning = JSON.parse(readFileSync(path.resolve(args.learning), 'utf8'))
const visual = JSON.parse(readFileSync(path.resolve(args.visual), 'utf8'))
const audio = JSON.parse(readFileSync(path.resolve(args.audio), 'utf8'))
const examples = JSON.parse(readFileSync(path.resolve(args.examples), 'utf8'))
const calibration = await loadCalibrationProgram()

exactly(sourceMap.entries, 1600, 'source map')
exactly(sourceLedger.entries, 1600, 'source page ledger')
for (const binding of Object.values(sourceLedger.contentBindings)) {
  const bytes = readFileSync(path.join(rootDir, binding.path))
  if (createHash('sha256').update(bytes).digest('hex') !== binding.sha256) {
    throw new Error(`Source-reviewed content binding changed: ${binding.path}`)
  }
}
exactly(learning.entries, 1570, 'reviewed learning content')
exactly(visual.entries, 1600, 'visual manifest')
exactly(audio.entries, 1600, 'audio manifest')
exactly(examples.entries, 1600, 'example candidates')
if (learning.entries.some((entry) => entry.example?.reviewStatus !== 'approved')) {
  throw new Error('Every generated example must be independently approved')
}
if (audio.voice !== 'eqb-british-teacher-v1' || audio.entries.some((entry) => entry.voice !== 'eqb-british-teacher-v1')) {
  throw new Error('Every audio asset must use eqb-british-teacher-v1')
}

const learningByOrder = new Map(learning.entries.map((entry) => [entry.sourceOrder, entry]))
const calibrationByOrder = new Map(calibration.entries.map((entry) => [entry.source.globalOrder, entry]))
const visualById = new Map(visual.entries.map((entry) => [entry.entryId, entry]))
const audioById = new Map(audio.entries.map((entry) => [entry.entryId, entry]))
const examplesById = new Map(examples.entries.map((entry) => [entry.entryId, entry]))
if (learningByOrder.size !== 1570 || calibrationByOrder.size !== 30 || visualById.size !== 1600 || audioById.size !== 1600 || examplesById.size !== 1600) {
  throw new Error('Duplicate sourceOrder or asset entryId detected')
}

const groupsByNumber = new Map(sourceMap.groups.map((group) => [group.groupNumber, group]))
const entries = sourceMap.entries.map((source) => {
  const calibrationEntry = calibrationByOrder.get(source.sourceOrder)
  const generatedEntry = learningByOrder.get(source.sourceOrder)
  const content = calibrationEntry ? {
    phonetic: calibrationEntry.phonetic,
    partOfSpeech: calibrationEntry.partOfSpeech,
    sourceMeanings: calibrationEntry.sourceMeanings,
    teachingSense: calibrationEntry.teachingSense,
    examFrequency: calibrationEntry.examFrequency,
    pronunciationMode: calibrationEntry.learning.pronunciationGuide.mode,
    syllables: calibrationEntry.learning.pronunciationGuide.parts,
    example: { ...calibrationEntry.learning.example, reviewStatus: 'approved' },
  } : generatedEntry
  if (!content || content.id && content.id !== source.id || content.headword && content.headword !== source.headword) {
    throw new Error(`Learning content identity mismatch at sourceOrder ${source.sourceOrder}`)
  }
  const visualEntry = visualById.get(source.id)
  const audioEntry = audioById.get(source.id)
  const exampleEntry = examplesById.get(source.id)
  if (!visualEntry || !audioEntry || !exampleEntry) throw new Error(`Missing asset for ${source.id}`)
  const candidates = exactly(exampleEntry.candidates, 3, `example candidates for ${source.id}`)
  if (exampleEntry.sourceOrder !== source.sourceOrder || exampleEntry.headword !== source.headword) {
    throw new Error(`Example candidate identity mismatch at sourceOrder ${source.sourceOrder}`)
  }
  if (candidates.map((candidate) => candidate.candidateId).join(',') !== 'a,b,c') {
    throw new Error(`Example candidates must be ordered a,b,c for ${source.id}`)
  }
  for (const candidate of candidates) {
    if (candidate.version !== 'wanwei-examples-v1' || candidate.reviewStatus !== 'approved') {
      throw new Error(`Example candidate is not approved at ${source.id}/${candidate.candidateId}`)
    }
    if (candidate.teachingSense !== content.teachingSense || !candidate.english.includes(candidate.highlight)) {
      throw new Error(`Example candidate teaching sense or highlight mismatch at ${source.id}/${candidate.candidateId}`)
    }
  }
  const candidateA = candidates[0]
  if (candidateA.english !== content.example.english || candidateA.chinese !== content.example.chinese || candidateA.highlight !== content.example.highlight) {
    throw new Error(`Example candidate A changed the approved sentence at ${source.id}`)
  }
  const group = groupsByNumber.get(source.day)
  return {
    id: source.id,
    groupId: group.id,
    headword: source.headword,
    phonetic: content.phonetic,
    partOfSpeech: content.partOfSpeech,
    sourceMeanings: content.sourceMeanings,
    teachingSense: content.teachingSense,
    examFrequency: content.examFrequency,
    pronunciationMode: content.pronunciationMode,
    syllables: content.syllables,
    example: content.example,
    exampleCandidates: candidates,
    visual: {
      key: visualEntry.visualKey,
      version: visualEntry.version,
      path: visualEntry.path,
      alt: visualEntry.alt,
    },
    audio: {
      key: audioEntry.entryId,
      version: audioEntry.version,
      path: `/vocabulary-assets/wanwei-round-one-v1/audio/${audioEntry.version}/${audioEntry.path}`,
      voice: audioEntry.voice,
    },
    source: {
      stage: source.stage,
      day: source.day,
      sourceOrder: source.sourceOrder,
      printedPage: source.printedPage,
      verification: source.verification,
    },
  }
})

const program = {
  id: sourceMap.programId,
  version: '2026-08-10-examples-v1',
  title: '中考词汇一轮',
  subtitle: '万唯一轮完整1600词',
  sourceTitle: sourceMap.sourceTitle,
  sourceEdition: sourceMap.sourceEdition,
  totalPlannedEntries: 1600,
  groups: sourceMap.groups.map((group) => ({ ...group, group: group.groupNumber })),
  entries,
}

for (const [index, entry] of program.entries.entries()) {
  const receipt = sourceLedger.entries[index]
  if (
    receipt.entryId !== entry.id
    || receipt.observedPhonetic !== entry.phonetic
    || receipt.observedPartOfSpeech !== entry.partOfSpeech
  ) {
    throw new Error(`Final learning content is not bound to source receipt at sourceOrder ${index + 1}`)
  }
}

const report = {
  mode: args.publish ? 'publish' : 'dry-run',
  programId: program.id,
  groupCount: program.groups.length,
  entryCount: program.entries.length,
  uniqueVisuals: new Set(program.entries.map((entry) => entry.visual.path)).size,
  uniqueAudio: new Set(program.entries.map((entry) => entry.audio.path)).size,
}
if (report.groupCount !== 60 || report.entryCount !== 1600 || report.uniqueVisuals !== 1600 || report.uniqueAudio !== 1600) {
  throw new Error(`Full-program invariant failed: ${JSON.stringify(report)}`)
}

if (args.publish) {
  const dbPath = args.db || process.env.QUESTION_BANK_DB
  if (!dbPath) {
    throw new Error('Publishing requires an explicit --db path or QUESTION_BANK_DB; the importer never defaults to the live repository database')
  }
  const db = new DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA foreign_keys = ON')
    Object.assign(report, replaceVocabularyProgram(db, program))
  } finally {
    db.close()
  }
}
console.log(JSON.stringify(report, null, 2))
