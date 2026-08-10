#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const rootDir = path.resolve(import.meta.dirname, '../..')
const ASSET_VERSION = 'koboyo-v1'
const PUBLIC_BASE = '/vocabulary-assets/wanwei-round-one-v1'

function flagValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

async function loadCalibrationModules() {
  const require = createRequire(import.meta.url)
  const typescriptEntry = require.resolve('typescript', { paths: [path.join(rootDir, 'app')] })
  const ts = await import(pathToFileURL(typescriptEntry).href)
  const sourceDir = path.join(rootDir, 'app/src/features/vocabulary-review')
  const runtimeDir = mkdtempSync(path.join(tmpdir(), 'eqb-vocabulary-visuals-'))
  try {
    for (const moduleName of ['calibrationVocabularyLearningContent', 'calibrationVocabularyProgram', 'vocabularyVisualManifest']) {
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
    const programModule = await import(pathToFileURL(path.join(runtimeDir, 'calibrationVocabularyProgram.js')).href)
    const visualModule = await import(pathToFileURL(path.join(runtimeDir, 'vocabularyVisualManifest.js')).href)
    return { ...programModule, ...visualModule }
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true })
  }
}

function inspectSvg(svg, label) {
  const viewBox = svg.match(/\bviewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/u)
  if (!viewBox) throw new Error(`${label} has no supported viewBox`)
  if (!svg.includes('currentColor')) throw new Error(`${label} does not use currentColor`)
  if (/<image\b[^>]*(?:href|xlink:href)="https?:/iu.test(svg)) throw new Error(`${label} remotely hotlinks an image`)
  return {
    width: Number(viewBox[1]),
    height: Number(viewBox[2]),
    sha256: createHash('sha256').update(svg).digest('hex'),
  }
}

const batchesDir = flagValue('--batches-dir')
const outputPath = flagValue('--output')
const assetsOutputDir = flagValue('--assets-output-dir')
const copyAssets = process.argv.includes('--copy-assets')
if (!batchesDir || !outputPath || !assetsOutputDir) {
  throw new Error('Usage: --batches-dir DIR --output FILE --assets-output-dir DIR [--copy-assets]')
}

const sourceMap = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/wanwei-round-one-source-map-v1.json'), 'utf8'))
const sourceByHeadword = new Map(sourceMap.entries.map((entry) => [entry.headword, entry]))
const { calibrationVocabularyProgram, vocabularyVisualManifest } = await loadCalibrationModules()
const collected = []
const sourceFiles = new Map()

for (const entry of calibrationVocabularyProgram.entries) {
  const source = sourceByHeadword.get(entry.headword)
  const visual = vocabularyVisualManifest[entry.visualKey]
  const repoAsset = path.join(rootDir, 'app/public', visual.src)
  const svg = readFileSync(repoAsset, 'utf8')
  const dimensions = inspectSvg(svg, repoAsset)
  const filename = `${source.id}--${visual.koboyoSlug}.svg`
  collected.push({
    entryId: source.id,
    headword: source.headword,
    visualKey: entry.visualKey,
    slug: visual.koboyoSlug,
    width: dimensions.width,
    height: dimensions.height,
    sha256: dimensions.sha256,
    path: `${PUBLIC_BASE}/visuals/${ASSET_VERSION}/${filename}`,
    alt: visual.alt,
    version: ASSET_VERSION,
  })
  sourceFiles.set(source.id, { sourceFile: repoAsset, filename })
}

for (const directoryName of readdirSync(batchesDir).filter((name) => name.startsWith('visual-')).sort()) {
  const directory = path.join(batchesDir, directoryName)
  const manifestPath = path.join(directory, 'manifest.json')
  if (!existsSync(manifestPath)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const manifestEntries = Array.isArray(manifest) ? manifest : manifest.entries
  if (!Array.isArray(manifestEntries)) throw new Error(`${manifestPath} has no entries array`)
  for (const candidate of manifestEntries) {
    const source = sourceByHeadword.get(candidate.headword)
    if (!source) throw new Error(`${manifestPath} has unknown headword ${candidate.headword}`)
    const sourceFile = path.resolve(directory, candidate.path)
    const svg = readFileSync(sourceFile, 'utf8')
    const dimensions = inspectSvg(svg, sourceFile)
    if (Math.abs(dimensions.width - Number(candidate.width)) > 0.51
        || Math.abs(dimensions.height - Number(candidate.height)) > 0.51) {
      throw new Error(`${sourceFile} dimensions disagree with its manifest`)
    }
    const filename = `${source.id}--${candidate.slug}.svg`
    collected.push({
      entryId: source.id,
      headword: source.headword,
      visualKey: source.id,
      slug: candidate.slug,
      width: dimensions.width,
      height: dimensions.height,
      sha256: dimensions.sha256,
      path: `${PUBLIC_BASE}/visuals/${ASSET_VERSION}/${filename}`,
      alt: candidate.alt,
      version: ASSET_VERSION,
    })
    sourceFiles.set(source.id, { sourceFile, filename })
  }
}

const entryIds = new Set(collected.map((entry) => entry.entryId))
const slugs = new Set(collected.map((entry) => entry.slug))
const paths = new Set(collected.map((entry) => entry.path))
const entriesBySlug = Map.groupBy(collected, (entry) => entry.slug)
const entriesByHash = Map.groupBy(collected, (entry) => entry.sha256)
const chineseAltCount = collected.filter((entry) => /[\u3400-\u9fff]/u.test(entry.alt)).length
const report = {
  schemaVersion: 'wanwei-visual-assembly-report-v1',
  entries: collected.length,
  uniqueEntryIds: entryIds.size,
  uniqueSlugs: slugs.size,
  uniquePaths: paths.size,
  uniqueAssetHashes: entriesByHash.size,
  chineseAltCount,
  duplicateSlugs: [...entriesBySlug]
    .filter(([, entries]) => entries.length > 1)
    .map(([slug, entries]) => ({ slug, headwords: entries.map((entry) => entry.headword) })),
  duplicateAssetHashes: [...entriesByHash]
    .filter(([, entries]) => entries.length > 1)
    .map(([sha256, entries]) => ({ sha256, headwords: entries.map((entry) => entry.headword) })),
  missingEntryIds: sourceMap.entries.filter((entry) => !entryIds.has(entry.id)).slice(0, 20).map((entry) => entry.id),
}

if (collected.length !== 1600 || entryIds.size !== 1600 || slugs.size !== 1600 || paths.size !== 1600
    || entriesByHash.size !== 1600 || chineseAltCount !== 1600) {
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = 1
} else {
  const entries = collected.sort((left, right) => {
    const leftOrder = sourceMap.entries.find((entry) => entry.id === left.entryId).sourceOrder
    const rightOrder = sourceMap.entries.find((entry) => entry.id === right.entryId).sourceOrder
    return leftOrder - rightOrder
  })
  if (copyAssets) {
    mkdirSync(assetsOutputDir, { recursive: true })
    for (const [entryId, asset] of sourceFiles) {
      if (!entryIds.has(entryId)) throw new Error(`Unexpected generated asset ${entryId}`)
      copyFileSync(asset.sourceFile, path.join(assetsOutputDir, asset.filename))
    }
  }
  writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 'wanwei-visual-manifest-v1', version: ASSET_VERSION, entries }, null, 2)}\n`)
  console.log(JSON.stringify({ ...report, outputPath, assetsOutputDir, copied: copyAssets ? sourceFiles.size : 0 }, null, 2))
}
