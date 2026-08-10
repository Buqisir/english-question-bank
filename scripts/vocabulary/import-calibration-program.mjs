import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { replaceVocabularyProgram } from '../../server/vocabulary/vocabularyStore.mjs'

const rootDir = path.resolve(import.meta.dirname, '../..')
const publish = process.argv.includes('--publish')
const dbPath = process.env.QUESTION_BANK_DB || path.join(rootDir, 'data/question-bank.sqlite')

async function loadCalibrationModules() {
  const require = createRequire(import.meta.url)
  const typescriptEntry = require.resolve('typescript', { paths: [path.join(rootDir, 'app')] })
  const ts = await import(pathToFileURL(typescriptEntry).href)
  const sourceDir = path.join(rootDir, 'app/src/features/vocabulary-review')
  const runtimeDir = mkdtempSync(path.join(tmpdir(), 'eqb-vocabulary-calibration-'))
  const moduleNames = [
    'calibrationVocabularyLearningContent',
    'calibrationVocabularyProgram',
    'vocabularyVisualManifest',
  ]
  try {
    for (const moduleName of moduleNames) {
      const source = readFileSync(path.join(sourceDir, `${moduleName}.ts`), 'utf8')
      const output = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: `${moduleName}.ts`,
      }).outputText.replace(
        "from './calibrationVocabularyLearningContent'",
        "from './calibrationVocabularyLearningContent.js'",
      )
      writeFileSync(path.join(runtimeDir, `${moduleName}.js`), output)
    }
    const programModule = await import(pathToFileURL(path.join(runtimeDir, 'calibrationVocabularyProgram.js')).href)
    const visualModule = await import(pathToFileURL(path.join(runtimeDir, 'vocabularyVisualManifest.js')).href)
    return { ...programModule, ...visualModule }
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true })
  }
}

function plannedAudioPath(entryId) {
  return `/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-teacher-v1/${entryId}.mp3`
}

const { calibrationVocabularyProgram, vocabularyVisualManifest } = await loadCalibrationModules()
const program = {
  id: 'wanwei-round-one-v1',
  version: '2026-08-07-calibration-v1',
  title: calibrationVocabularyProgram.title,
  subtitle: '完整1600词课程 · 当前30词校准批次',
  sourceTitle: calibrationVocabularyProgram.sourceTitle,
  sourceEdition: calibrationVocabularyProgram.entries[0]?.source.edition ?? '',
  totalPlannedEntries: 1600,
  groups: calibrationVocabularyProgram.groups.map((group) => ({
    ...group,
    stage: 'core',
  })),
  entries: calibrationVocabularyProgram.entries.map((entry) => {
    const visual = vocabularyVisualManifest[entry.visualKey]
    const groupId = calibrationVocabularyProgram.groups.find((group) => group.group === entry.source.group)?.id
    return {
      ...entry,
      groupId,
      examFrequency: entry.examFrequency,
      pronunciationMode: entry.learning.pronunciationGuide.mode,
      syllables: entry.learning.pronunciationGuide.parts,
      example: {
        ...entry.learning.example,
        reviewStatus: 'approved',
      },
      visual: {
        key: entry.visualKey,
        version: 'wanwei-calibration-v1',
        path: visual.src,
        alt: `${entry.headword}：${visual.alt}`,
      },
      audio: {
        key: entry.id,
        version: 'eqb-british-teacher-v1',
        path: plannedAudioPath(entry.id),
        voice: 'eqb-british-teacher-v1',
      },
    }
  }),
}

const report = {
  mode: publish ? 'publish' : 'dry-run',
  dbPath,
  programId: program.id,
  groupCount: program.groups.length,
  entryCount: program.entries.length,
  plannedTotal: program.totalPlannedEntries,
  uniqueVisualKeys: new Set(program.entries.map((entry) => entry.visual.key)).size,
  uniqueAudioKeys: new Set(program.entries.map((entry) => entry.audio.key)).size,
}

if (report.entryCount !== 30 || report.uniqueVisualKeys !== 30 || report.uniqueAudioKeys !== 30) {
  throw new Error(`Calibration import invariant failed: ${JSON.stringify(report)}`)
}

if (publish) {
  const db = new DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA foreign_keys = ON')
    Object.assign(report, replaceVocabularyProgram(db, program))
  } finally {
    db.close()
  }
}

console.log(JSON.stringify(report, null, 2))
