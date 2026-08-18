#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const rootDir = path.resolve(import.meta.dirname, '../..')

function normalizeHeadword(value) {
  return String(value).normalize('NFKD').toLowerCase().replace(/\([^)]*\)/gu, '').replace(/[^a-z0-9]/gu, '')
}

function posTokens(value) {
  return new Set(String(value).toLowerCase().match(/abbr|adj|adv|art|conj|int|n|num|prep|pron|v/gu) ?? [])
}

function meaningTokens(values) {
  return new Set(values.flatMap((value) => String(value).split(/[；;,，、（）()\s]+/gu)).filter((value) => value.length >= 2))
}

async function loadCalibrationEntries() {
  const require = createRequire(import.meta.url)
  const typescriptEntry = require.resolve('typescript', { paths: [path.join(rootDir, 'app')] })
  const ts = await import(pathToFileURL(typescriptEntry).href)
  const sourceDir = path.join(rootDir, 'app/src/features/vocabulary-review')
  const runtimeDir = mkdtempSync(path.join(tmpdir(), 'eqb-gaokao-overlap-'))
  try {
    for (const moduleName of ['calibrationVocabularyLearningContent', 'calibrationVocabularyProgram']) {
      const source = readFileSync(path.join(sourceDir, `${moduleName}.ts`), 'utf8')
      const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: `${moduleName}.ts`,
      }).outputText.replace("from './calibrationVocabularyLearningContent'", "from './calibrationVocabularyLearningContent.js'")
      writeFileSync(path.join(runtimeDir, `${moduleName}.js`), output)
    }
    const module = await import(pathToFileURL(path.join(runtimeDir, 'calibrationVocabularyProgram.js')).href)
    return module.calibrationVocabularyProgram.entries
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true })
  }
}

const gaokao = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/gaokao-frequency-source-content-v1.json'), 'utf8')).entries
const wanweiLearning = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/wanwei-learning-content-v1.json'), 'utf8')).entries
const wanweiEntries = [...await loadCalibrationEntries(), ...wanweiLearning]
const wanweiByHeadword = new Map()
for (const entry of wanweiEntries) {
  const key = normalizeHeadword(entry.headword)
  if (!wanweiByHeadword.has(key)) wanweiByHeadword.set(key, [])
  wanweiByHeadword.get(key).push(entry)
}

const rows = gaokao.map((entry) => {
  const candidates = wanweiByHeadword.get(normalizeHeadword(entry.headword)) ?? []
  return {
    entryId: entry.entryId,
    sourceOrder: entry.sourceOrder,
    headword: entry.headword,
    frequencyStage: entry.frequencyStage,
    curriculumTag: entry.curriculumTag,
    candidates: candidates.map((candidate) => {
      const gaokaoPos = posTokens(entry.partOfSpeech)
      const wanweiPos = posTokens(candidate.partOfSpeech)
      const gaokaoMeanings = meaningTokens(entry.sourceMeanings)
      const wanweiMeanings = meaningTokens([...candidate.sourceMeanings, candidate.teachingSense])
      return {
        sourceEntryId: candidate.id,
        sourceHeadword: candidate.headword,
        sourcePartOfSpeech: candidate.partOfSpeech,
        sourceTeachingSense: candidate.teachingSense,
        checks: {
          normalizedHeadword: true,
          exactCaseAndPunctuation: candidate.headword === entry.headword,
          partOfSpeechOverlap: [...gaokaoPos].some((value) => wanweiPos.has(value)),
          meaningTokenOverlap: [...gaokaoMeanings].some((value) => wanweiMeanings.has(value)),
          pronunciation: 'review-required',
        },
        reuseApproval: 'review-required',
      }
    }),
  }
})

const result = {
  schemaVersion: 'gaokao-wanwei-overlap-audit-v1',
  policy: 'No asset is reused until headword, part of speech, target pronunciation and teaching sense are all approved.',
  counts: {
    gaokaoEntries: rows.length,
    entriesWithSpellingCandidates: rows.filter((row) => row.candidates.length > 0).length,
    entriesWithoutSpellingCandidates: rows.filter((row) => row.candidates.length === 0).length,
    approvedReuse: 0,
  },
  entries: rows,
}
const outputPath = path.join(rootDir, 'data/vocabulary/gaokao-wanwei-overlap-audit-v1.json')
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result.counts))
