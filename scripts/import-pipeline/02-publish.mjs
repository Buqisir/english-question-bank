/**
 * 02-publish.mjs <configPath> [--publish]
 *
 * Loads groups.json + analysis-<key>.json, validates each present analysis,
 * assembles the package, overrides import-meta.json paper fields from config.provenance,
 * and (only with --publish) writes to DB and paper-assets.
 *
 * Without --publish: dry-run only — prints corrected import-meta paper block.
 *
 * Usage:
 *   node .scratch/import-pilot/02-publish.mjs papers/paper-2024-i/config.json
 *   node .scratch/import-pilot/02-publish.mjs papers/paper-2024-i/config.json --publish
 */

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildPaperImportAiPackageFiles } from '../../server/paper-import-ai/packageBuilder.mjs'
import { analyzeReadingImportCandidate } from '../../server/paper-import-ai/analyzeReading.mjs'
import { analyzeSevenChoicesImportCandidate } from '../../server/paper-import-ai/analyzeSevenChoices.mjs'
import { analyzeClozeImportCandidate } from '../../server/paper-import-ai/analyzeCloze.mjs'
import { analyzeGrammarFillImportCandidate } from '../../server/paper-import-ai/analyzeGrammarFill.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

// ---- Args ----
const configPath = process.argv[2]
const doPublish = process.argv.includes('--publish')

if (!configPath) {
  console.error('Usage: node 02-publish.mjs <configPath> [--publish]')
  process.exit(1)
}

const config = JSON.parse(readFileSync(configPath, 'utf8'))
const { docxPath, paperId, provenance } = config
const outDir = path.join(__dirname, 'papers', paperId)

// ---- Load groups ----
const groupsPath = path.join(outDir, 'groups.json')
if (!existsSync(groupsPath)) {
  console.error(`groups.json not found: ${groupsPath} — run 01-split.mjs first`)
  process.exit(1)
}
const { paper, readingGroups, seven, cloze, grammar, application, continuation } = JSON.parse(
  readFileSync(groupsPath, 'utf8')
)

// Add real sourceHash from DOCX
if (existsSync(docxPath)) {
  const buf = readFileSync(docxPath)
  paper.sourceHash = createHash('sha256').update(buf).digest('hex')
  paper.sourceFilename = path.basename(docxPath)
} else {
  console.warn(`WARN: DOCX not found at ${docxPath}; sourceHash will be 'pending'`)
}

// ---- Load analysis files ----
const analysisMissing = []
const analysesByGroupId = {}

function tryLoadAnalysis(key, groupId) {
  const p = path.join(outDir, `analysis-${key}.json`)
  if (!existsSync(p)) {
    analysisMissing.push(key)
    return null
  }
  return JSON.parse(readFileSync(p, 'utf8'))
}

const readingLetters = ['a', 'b', 'c', 'd']
for (const [i, group] of readingGroups.entries()) {
  const letter = readingLetters[i]
  const analysis = tryLoadAnalysis(`reading-${letter}`, group.groupId)
  if (analysis) analysesByGroupId[group.groupId] = analysis
}

const sevenAnalysis = tryLoadAnalysis('seven', seven.groupId)
const clozeAnalysis = tryLoadAnalysis('cloze', cloze.groupId)
const grammarAnalysis = tryLoadAnalysis('grammar', grammar.groupId)

if (analysisMissing.length > 0) {
  console.log(`\nMissing analyses (${analysisMissing.length}): ${analysisMissing.join(', ')}`)
  console.log('Proceeding with dry-run for present analyses only.')
}

// ---- Validate present analyses ----
console.log('\n[Validate] Running analysis validation for present analyses...')

function makeInjectedProvider(rawText) {
  return {
    providerCallers: {
      deepseek: async () => ({ rawText, provider: 'claude', model: 'opus', latencyMs: 0 }),
    },
    providerRetries: 0,
    analysisRetries: 0,
  }
}

const validationErrors = []

for (const [i, group] of readingGroups.entries()) {
  const letter = readingLetters[i]
  const analysis = analysesByGroupId[group.groupId]
  if (!analysis) continue
  try {
    const injected = makeInjectedProvider(JSON.stringify(analysis))
    await analyzeReadingImportCandidate({ paper, group, providerId: 'deepseek-v4-pro' }, injected)
    console.log(`   [OK] reading-${letter}`)
  } catch (err) {
    console.log(`   [FAIL] reading-${letter}: ${err.message}`)
    validationErrors.push(`reading-${letter}: ${err.message}`)
  }
}

if (sevenAnalysis) {
  try {
    const injected = makeInjectedProvider(JSON.stringify(sevenAnalysis))
    await analyzeSevenChoicesImportCandidate({ paper, group: seven, providerId: 'deepseek-v4-pro' }, injected)
    console.log(`   [OK] seven`)
  } catch (err) {
    console.log(`   [FAIL] seven: ${err.message}`)
    validationErrors.push(`seven: ${err.message}`)
  }
}

if (clozeAnalysis) {
  try {
    const injected = makeInjectedProvider(JSON.stringify(clozeAnalysis))
    await analyzeClozeImportCandidate({ paper, group: cloze, providerId: 'deepseek-v4-pro' }, injected)
    console.log(`   [OK] cloze`)
  } catch (err) {
    console.log(`   [FAIL] cloze: ${err.message}`)
    validationErrors.push(`cloze: ${err.message}`)
  }
}

if (grammarAnalysis) {
  try {
    const injected = makeInjectedProvider(JSON.stringify(grammarAnalysis))
    await analyzeGrammarFillImportCandidate({ paper, group: grammar, providerId: 'deepseek-v4-pro' }, injected)
    console.log(`   [OK] grammar`)
  } catch (err) {
    console.log(`   [FAIL] grammar: ${err.message}`)
    validationErrors.push(`grammar: ${err.message}`)
  }
}

if (validationErrors.length > 0) {
  console.error(`\nValidation FAILED (${validationErrors.length} error(s)):`)
  validationErrors.forEach((e) => console.error('  -', e))
  if (doPublish) process.exit(1)
}

// ---- Assemble payload ----
const payload = {
  parseResult: { paper, readingGroups },
  analysesByGroupId,
  sevenChoicesGroup: seven,
  sevenChoicesAnalysis: sevenAnalysis,
  clozeGroup: cloze,
  clozeAnalysis: clozeAnalysis,
  grammarFillGroup: grammar,
  grammarFillAnalysis: grammarAnalysis,
  applicationGroup: application,
  continuationGroup: continuation,
}

// Load DOCX buffer for sourceDocx field
let sourceDocxPayload = null
if (existsSync(docxPath)) {
  const buf = readFileSync(docxPath)
  sourceDocxPayload = {
    fileName: path.basename(docxPath),
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: buf,
  }
}

// ---- Dry-run packageBuilder ----
console.log('\n[Package] Dry-running buildPaperImportAiPackageFiles...')
let files
try {
  files = buildPaperImportAiPackageFiles({
    ...payload,
    sourceDocx: sourceDocxPayload,
  })
  console.log(`   OK: ${Array.isArray(files) ? files.length : '?'} files`)
} catch (err) {
  console.error('   FAIL:', err.message)
  if (err.detail) console.error('   detail:', JSON.stringify(err.detail))
  if (doPublish) process.exit(1)
  else {
    console.log('\n(Dry-run: errors above are expected when analyses are missing)')
  }
}

// ---- Override import-meta.json paper fields from provenance ----
if (files && Array.isArray(files) && provenance) {
  const metaFile = files.find(
    (f) => (f.fileName || f.path || f.name || '').includes('import-meta.json')
  )
  if (!metaFile) {
    console.error('\n[import-meta] FATAL: import-meta.json not found in package files; cannot apply provenance.')
    process.exit(1)
  }
  let meta
  try {
    meta = JSON.parse(metaFile.buffer.toString('utf8'))
  } catch (e) {
    console.error('\n[import-meta] FATAL: could not parse import-meta buffer:', e.message)
    process.exit(1)
  }
  const { sourceType, region, paperName, year, defaultTags } = provenance
  meta.paper = meta.paper || {}
  if (sourceType) meta.paper.sourceType = sourceType
  if (region) meta.paper.region = region
  if (paperName) meta.paper.paperName = paperName
  if (year) meta.paper.year = year
  if (defaultTags) meta.paper.defaultTags = defaultTags
  // Write the corrected meta BACK into the package file buffer.
  metaFile.buffer = Buffer.from(`${JSON.stringify(meta, null, 2)}\n`)
  console.log('\n[import-meta] Corrected paper block:')
  console.log(JSON.stringify(meta.paper, null, 2))
}

// ---- Publish (only with --publish and all analyses present) ----
const allAnalysesPresent = analysisMissing.length === 0

if (doPublish) {
  if (!allAnalysesPresent) {
    console.error(`\nCannot publish: missing analyses for ${analysisMissing.join(', ')}`)
    process.exit(1)
  }
  if (!files) {
    console.error('\nCannot publish: package build failed')
    process.exit(1)
  }
  if (validationErrors.length > 0) {
    console.error('\nCannot publish: validation errors present')
    process.exit(1)
  }

  console.log('\n[Publish] Publishing to DB...')
  const { DatabaseSync } = await import('node:sqlite')
  const { publishPaperImportPackage } = await import('../../server/paper-import/publisher.mjs')

  const dbPath = path.join(projectRoot, 'data/question-bank.sqlite')
  const paperAssetsDir = path.join(projectRoot, 'app/public/paper-assets')

  const db = new DatabaseSync(dbPath, { readOnly: false })
  try {
    const result = publishPaperImportPackage({ files, db, paperAssetsDir })
    console.log(`   status: ${result.status}`)
    if (result.publish?.paperId) console.log(`   paperId: ${result.publish.paperId}`)
    if (result.status === 'validation_failed' && result.validation) {
      const { blockingIssues, rejectedFiles } = result.validation
      if (Array.isArray(rejectedFiles) && rejectedFiles.length > 0) {
        console.error(`\n   rejectedFiles (${rejectedFiles.length}):`)
        rejectedFiles.forEach((f) => console.error(`     - ${f.fileName}: ${f.reason}`))
      }
      if (Array.isArray(blockingIssues) && blockingIssues.length > 0) {
        console.error(`\n   blockingIssues (${blockingIssues.length}):`)
        blockingIssues.forEach((issue) => console.error(`     - [${issue.code}] ${issue.message}`))
      }
    }
  } finally {
    db.close()
  }
} else {
  console.log('\n[DRY-RUN] No DB write. Pass --publish to publish.')
  if (!allAnalysesPresent) {
    console.log(`Missing analyses (needed before --publish): ${analysisMissing.join(', ')}`)
  }
}
