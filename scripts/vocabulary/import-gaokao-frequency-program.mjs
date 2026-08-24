#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { replaceVocabularyProgram } from '../../server/vocabulary/vocabularyStore.mjs'

const rootDir = path.resolve(import.meta.dirname, '../..')
const programId = 'gaokao-curriculum-3000-frequency-v1'

function parseArgs(argv) {
  const result = { publish: false, goldenSample: false, availability: 'hidden' }
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === '--publish') {
      result.publish = true
      continue
    }
    if (key === '--golden-sample') {
      result.goldenSample = true
      continue
    }
    if (key === '--available') {
      result.availability = 'available'
      continue
    }
    const value = argv[index + 1]
    if (!key.startsWith('--') || value == null) throw new Error(`Invalid argument near ${key}`)
    result[key.slice(2)] = value
    index += 1
  }
  for (const required of ['learning', 'visual', 'american-audio', 'british-audio']) {
    if (!result[required]) throw new Error(`Missing --${required}`)
  }
  if (result.goldenSample && result.availability !== 'hidden') {
    throw new Error('The golden sample must remain hidden')
  }
  return result
}

function readJson(filePath) {
  return JSON.parse(readFileSync(path.resolve(filePath), 'utf8'))
}

function exactly(entries, expected, label) {
  if (!Array.isArray(entries) || entries.length !== expected) {
    throw new Error(`${label} must contain exactly ${expected} entries`)
  }
  return entries
}

function uniqueMap(entries, key, label) {
  const result = new Map(entries.map((entry) => [entry[key], entry]))
  if (result.size !== entries.length) throw new Error(`${label} contains duplicate ${key}`)
  return result
}

function resolvePublicAsset(manifest, entry) {
  const webPath = entry.path.startsWith('/')
    ? entry.path
    : `${String(manifest.publicBasePath ?? '').replace(/\/$/u, '')}/${entry.path}`
  if (!webPath.startsWith('/vocabulary-assets/')) throw new Error(`Asset path is outside vocabulary-assets: ${webPath}`)
  const filePath = path.join(rootDir, 'app/public', webPath.slice(1))
  if (!existsSync(filePath)) throw new Error(`Missing asset file: ${webPath}`)
  const sha256 = createHash('sha256').update(readFileSync(filePath)).digest('hex')
  if (sha256 !== entry.sha256) throw new Error(`Asset hash mismatch: ${webPath}`)
  return webPath
}

const args = parseArgs(process.argv.slice(2))
const sourceMap = readJson(path.join(rootDir, 'data/vocabulary/gaokao-frequency-source-map-v1.json'))
const sourceLedger = readJson(path.join(rootDir, 'data/vocabulary/gaokao-frequency-source-ledger-v1.json'))
const learning = readJson(args.learning)
const visual = readJson(args.visual)
const americanAudio = readJson(args['american-audio'])
const britishAudio = readJson(args['british-audio'])
const expectedEntryCount = args.goldenSample ? 90 : 3000

if (sourceMap.programId !== programId || sourceLedger.programId !== programId) throw new Error('Gaokao source identity mismatch')
exactly(sourceMap.entries, 3000, 'source map')
exactly(sourceLedger.entries, 3000, 'source ledger')
exactly(learning.entries, expectedEntryCount, 'reviewed learning content')
exactly(visual.entries, expectedEntryCount, 'visual manifest')
exactly(americanAudio.entries, expectedEntryCount, 'American audio manifest')
exactly(britishAudio.entries, expectedEntryCount, 'British audio manifest')
if (sourceLedger.counts.approved !== 3000 || sourceLedger.counts.blocked !== 0) throw new Error('Every source receipt must be approved')

const sourceById = uniqueMap(sourceMap.entries, 'id', 'source map')
const receiptById = uniqueMap(sourceLedger.entries, 'entryId', 'source ledger')
const learningById = uniqueMap(learning.entries, 'entryId', 'learning content')
const visualById = uniqueMap(visual.entries, 'entryId', 'visual manifest')
const americanById = uniqueMap(americanAudio.entries, 'entryId', 'American audio manifest')
const britishById = uniqueMap(britishAudio.entries, 'entryId', 'British audio manifest')
let selectedSourceIds = sourceMap.entries.map((entry) => entry.id)
if (args.goldenSample) {
  const goldenSample = readJson(path.join(rootDir, 'data/vocabulary/gaokao-frequency-golden-sample-v1.json'))
  exactly(goldenSample.entries, 90, 'golden sample')
  if (goldenSample.programId !== programId) throw new Error('Golden sample program identity mismatch')
  selectedSourceIds = goldenSample.entries.map((entry) => entry.entryId)
  if (learning.entries.map((entry) => entry.entryId).join('\n') !== selectedSourceIds.join('\n')) {
    throw new Error('Reviewed learning content must match the frozen golden sample order')
  }
}
const selectedSources = selectedSourceIds.map((entryId) => {
  const source = sourceById.get(entryId)
  if (!source) throw new Error(`Golden sample entry is outside the source map: ${entryId}`)
  return source
})

const groups = Array.from({ length: 61 }, (_, index) => {
  const day = index + 1
  const dayEntries = sourceMap.entries.filter((entry) => entry.day === day)
  const first = dayEntries[0]
  const last = dayEntries.at(-1)
  if (!first || dayEntries.length !== (day <= 18 ? 60 : day <= 41 ? 40 : 50)) throw new Error(`Invalid Day ${day} load`)
  return {
    id: `gaokao-frequency-day-${String(day).padStart(2, '0')}`,
    stage: first.stage,
    week: Math.ceil(day / 5),
    group: day,
    sourceLabel: `Day ${day} · No. ${first.sourceGroup}–${last.sourceGroup}`,
    startOrder: first.sourceOrder,
    endOrder: last.sourceOrder,
  }
})
const groupByDay = new Map(groups.map((group) => [group.group, group]))

const entries = selectedSources.map((source) => {
  const receipt = receiptById.get(source.id)
  const content = learningById.get(source.id)
  const visualEntry = visualById.get(source.id)
  const americanEntry = americanById.get(source.id)
  const britishEntry = britishById.get(source.id)
  if (!content || !visualEntry || !americanEntry || !britishEntry) throw new Error(`Missing content or asset for ${source.id}`)
  if (receipt.entryId !== source.id || receipt.verdict !== 'approved') throw new Error(`Source receipt mismatch for ${source.id}`)
  if (content.headword !== source.headword || content.independentReview?.status !== 'approved') {
    throw new Error(`Learning content is not independently approved for ${source.id}`)
  }
  if (
    !Array.isArray(content.sourceMeanings) ||
    !Array.isArray(receipt.observedSourceMeanings) ||
    content.sourceMeanings.length !== receipt.observedSourceMeanings.length ||
    content.sourceMeanings.some((meaning, index) => meaning !== receipt.observedSourceMeanings[index])
  ) {
    throw new Error(`Learning source meanings mismatch for ${source.id}`)
  }
  const candidates = exactly(content.examples, 3, `examples for ${source.id}`).map((example) => ({
    ...example,
    version: 'gaokao-frequency-examples-v1',
    reviewStatus: 'approved',
  }))
  if (candidates.map((candidate) => candidate.candidateId).join(',') !== 'a,b,c') throw new Error(`Examples must be ordered a,b,c for ${source.id}`)
  for (const candidate of candidates) {
    if (!content.teachingSenses.includes(candidate.teachingSense) || !candidate.english.includes(candidate.highlight)) {
      throw new Error(`Invalid example contract for ${source.id}/${candidate.candidateId}`)
    }
  }
  if (visualEntry.headword !== source.headword || americanEntry.headword && americanEntry.headword !== source.headword || britishEntry.headword && britishEntry.headword !== source.headword) {
    throw new Error(`Asset identity mismatch for ${source.id}`)
  }
  const visualPath = resolvePublicAsset(visual, visualEntry)
  const americanPath = resolvePublicAsset(americanAudio, americanEntry)
  const britishPath = resolvePublicAsset(britishAudio, britishEntry)
  const americanAsset = { key: `${source.id}:american`, version: americanAudio.version, path: americanPath, voice: americanAudio.voice }
  const britishAsset = { key: `${source.id}:british`, version: britishAudio.version, path: britishPath, voice: britishAudio.voice }
  return {
    id: source.id,
    groupId: groupByDay.get(source.day).id,
    headword: source.headword,
    phonetic: content.phonetics.british,
    phonetics: content.phonetics,
    partOfSpeech: receipt.observedPartOfSpeech,
    sourceMeanings: receipt.observedSourceMeanings,
    teachingSense: content.teachingSenses.join('；'),
    teachingSenses: content.teachingSenses,
    pronunciationMode: content.pronunciationMode,
    syllables: content.pronunciationParts.british,
    pronunciationParts: content.pronunciationParts,
    example: { ...candidates[0], reviewStatus: 'approved' },
    exampleCandidates: candidates,
    visual: {
      key: visualEntry.visualKey,
      version: visual.version,
      path: visualPath,
      alt: visualEntry.alt,
      ...(visualEntry.binding ? { binding: visualEntry.binding } : {}),
    },
    audio: americanAsset,
    audioVariants: { american: americanAsset, british: britishAsset },
    source: {
      stage: source.stage,
      day: source.day,
      sourceOrder: source.sourceOrder,
      printedPage: source.printedPage,
      verification: 'page-checked',
      metadata: {
        frequencyStage: source.stage,
        frequencyRank: source.frequencyRank,
        sourceGroup: source.sourceGroup,
        curriculumTag: source.curriculumTag,
        pdfPage: source.pdfPage,
        pageImageSha256: source.pageImageSha256,
      },
    },
  }
})

const program = {
  id: programId,
  version: args.goldenSample ? '2026-08-11-golden-v1' : '2026-08-11-v1',
  title: '高中课标3000词',
  subtitle: '频序版 · 61个学习日',
  sourceTitle: sourceMap.sourceTitle,
  sourceEdition: sourceMap.sourceEdition,
  totalPlannedEntries: 3000,
  availability: args.availability,
  structure: {
    dayCount: 61,
    weekCount: 13,
    daysPerWeek: 5,
    stages: [
      { key: 'high_frequency', label: '高频词汇', entryCount: 1080, dayStart: 1, dayEnd: 18 },
      { key: 'mid_frequency', label: '中频词汇', entryCount: 920, dayStart: 19, dayEnd: 41 },
      { key: 'low_frequency', label: '低频词汇', entryCount: 1000, dayStart: 42, dayEnd: 61 },
    ],
  },
  groups,
  entries,
}

const report = {
  mode: args.publish ? 'publish' : 'dry-run',
  scope: args.goldenSample ? 'golden-sample' : 'full-program',
  availability: program.availability,
  programId,
  groupCount: groups.length,
  entryCount: entries.length,
  stageCounts: Object.fromEntries(program.structure.stages.map((stage) => [stage.key, entries.filter((entry) => entry.source.stage === stage.key).length])),
  uniqueVisuals: new Set(entries.map((entry) => entry.visual.path)).size,
  uniqueAmericanAudio: new Set(entries.map((entry) => entry.audioVariants.american.path)).size,
  uniqueBritishAudio: new Set(entries.map((entry) => entry.audioVariants.british.path)).size,
}
const expectedStageCounts = args.goldenSample
  ? { high_frequency: 30, mid_frequency: 30, low_frequency: 30 }
  : { high_frequency: 1080, mid_frequency: 920, low_frequency: 1000 }
if (
  report.groupCount !== 61
  || report.entryCount !== expectedEntryCount
  || report.uniqueVisuals !== expectedEntryCount
  || report.uniqueAmericanAudio !== expectedEntryCount
  || report.uniqueBritishAudio !== expectedEntryCount
  || Object.entries(expectedStageCounts).some(([stage, count]) => report.stageCounts[stage] !== count)
) {
  throw new Error(`${args.goldenSample ? 'Golden-sample' : 'Full-program'} invariant failed: ${JSON.stringify(report)}`)
}
if (args.publish) {
  const dbPath = args.db || process.env.QUESTION_BANK_DB
  if (!dbPath) throw new Error('Publishing requires an explicit --db path or QUESTION_BANK_DB')
  const db = new DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA foreign_keys = ON')
    Object.assign(report, replaceVocabularyProgram(db, program))
  } finally {
    db.close()
  }
}
console.log(JSON.stringify(report, null, 2))
