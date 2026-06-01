import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const readingChoiceAnalysisFileName = 'reading-choice-analysis-v1.json'
const sevenChoicesAnalysisFileName = 'seven-choices-analysis-v1.json'
const clozeAnalysisFileName = 'cloze-analysis-v1.json'
const grammarFillAnalysisFileName = 'grammar-fill-analysis-v1.json'

function readJsonMaybe(filePath) {
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

export function resolvePaperAssetReadPaths(paperAssetsDir, paperId, version = null) {
  const paperDir = path.join(paperAssetsDir, paperId)
  if (version) {
    return {
      baseDir: path.join(paperDir, 'versions', version),
      assetPath: path.join(paperDir, 'versions', version, 'paper-asset.json'),
      analysisPath: path.join(paperDir, 'versions', version, 'analyses', readingChoiceAnalysisFileName),
    }
  }
  const latestBaseDir = path.join(paperDir, 'latest')
  if (existsSync(path.join(latestBaseDir, 'paper-asset.json'))) {
    return {
      baseDir: latestBaseDir,
      assetPath: path.join(latestBaseDir, 'paper-asset.json'),
      analysisPath: path.join(latestBaseDir, 'analyses', readingChoiceAnalysisFileName),
    }
  }
  const versions = listPaperAssetVersions(paperAssetsDir, paperId)
  if (versions.length > 0) {
    const latestVersion = `v${versions[versions.length - 1]}`
    return {
      baseDir: path.join(paperDir, 'versions', latestVersion),
      assetPath: path.join(paperDir, 'versions', latestVersion, 'paper-asset.json'),
      analysisPath: path.join(paperDir, 'versions', latestVersion, 'analyses', readingChoiceAnalysisFileName),
    }
  }
  return {
    baseDir: paperDir,
    assetPath: path.join(paperDir, 'paper-asset.json'),
    analysisPath: path.join(paperDir, 'analyses', readingChoiceAnalysisFileName),
  }
}

export function listPaperAssetVersions(paperAssetsDir, paperId) {
  const versionsDir = path.join(paperAssetsDir, paperId, 'versions')
  if (!existsSync(versionsDir)) return []
  return readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+$/.test(entry.name))
    .map((entry) => Number(entry.name.slice(1)))
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b)
}

export function computeNextPaperAssetVersion(paperAssetsDir, paperId) {
  const versions = listPaperAssetVersions(paperAssetsDir, paperId)
  return versions.length > 0 ? versions[versions.length - 1] + 1 : 1
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function makeVersionedArtifacts(packageData, version) {
  const paperAsset = JSON.parse(JSON.stringify(packageData.paperAsset))
  const answerKey = JSON.parse(JSON.stringify(packageData.answerKey))
  const importMeta = JSON.parse(JSON.stringify(packageData.importMeta))
  const readingAnalysis = JSON.parse(JSON.stringify(packageData.readingAnalysis))

  paperAsset.paper.assetVersion = version
  paperAsset.paper.status = 'published'
  answerKey.sourceAssetVersion = version
  readingAnalysis.sourceAssetVersion = version

  const scAnalysis = packageData.scAnalysis
    ? JSON.parse(JSON.stringify(packageData.scAnalysis))
    : null
  if (scAnalysis) scAnalysis.sourceAssetVersion = version

  const clozeAnalysis = packageData.clozeAnalysis
    ? JSON.parse(JSON.stringify(packageData.clozeAnalysis))
    : null
  if (clozeAnalysis) clozeAnalysis.sourceAssetVersion = version

  const grammarFillAnalysis = packageData.grammarFillAnalysis
    ? JSON.parse(JSON.stringify(packageData.grammarFillAnalysis))
    : null
  if (grammarFillAnalysis) grammarFillAnalysis.sourceAssetVersion = version

  return { paperAsset, answerKey, importMeta, readingAnalysis, scAnalysis, clozeAnalysis, grammarFillAnalysis }
}

export function writePaperImportVersion({
  paperAssetsDir,
  packageData,
  validationReport,
  publishReport,
  version,
}) {
  const paperId = packageData.paperAsset.paper.paperId
  const paperDir = path.join(paperAssetsDir, paperId)
  const versionsDir = path.join(paperDir, 'versions')
  mkdirSync(versionsDir, { recursive: true })

  const versionName = `v${version}`
  const versionDir = path.join(versionsDir, versionName)
  if (existsSync(versionDir)) {
    throw new Error(`${paperId} ${versionName} already exists`)
  }

  const tempDir = path.join(versionsDir, `.tmp-${versionName}-${randomUUID()}`)
  mkdirSync(path.join(tempDir, 'raw'), { recursive: true })
  mkdirSync(path.join(tempDir, 'analyses'), { recursive: true })

  const artifacts = makeVersionedArtifacts(packageData, version)
  try {
    writeFileSync(path.join(tempDir, 'raw', packageData.sourceDocx.fileName), packageData.sourceDocx.buffer)
    writeJson(path.join(tempDir, 'paper-asset.json'), artifacts.paperAsset)
    writeJson(path.join(tempDir, 'answer-key.json'), artifacts.answerKey)
    writeJson(path.join(tempDir, 'import-meta.json'), artifacts.importMeta)
    writeJson(path.join(tempDir, 'analyses', readingChoiceAnalysisFileName), artifacts.readingAnalysis)
    if (artifacts.scAnalysis) {
      writeJson(path.join(tempDir, 'analyses', sevenChoicesAnalysisFileName), artifacts.scAnalysis)
    }
    if (artifacts.clozeAnalysis) {
      writeJson(path.join(tempDir, 'analyses', clozeAnalysisFileName), artifacts.clozeAnalysis)
    }
    if (artifacts.grammarFillAnalysis) {
      writeJson(path.join(tempDir, 'analyses', grammarFillAnalysisFileName), artifacts.grammarFillAnalysis)
    }
    writeJson(path.join(tempDir, 'validation-report.json'), validationReport)
    writeJson(path.join(tempDir, 'publish-report.json'), publishReport)

    renameSync(tempDir, versionDir)
  } catch (error) {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true })
    throw error
  }
  return { versionName, versionDir, artifacts }
}

export function removePaperImportVersion({ paperAssetsDir, paperId, versionName }) {
  const versionDir = path.join(paperAssetsDir, paperId, 'versions', versionName)
  if (existsSync(versionDir)) {
    rmSync(versionDir, { recursive: true, force: true })
  }
}

export function swapPaperImportLatest({ paperAssetsDir, paperId, versionDir }) {
  const paperDir = path.join(paperAssetsDir, paperId)
  const tempLatest = path.join(paperDir, `.latest-tmp-${randomUUID()}`)
  const latestDir = path.join(paperDir, 'latest')
  const previousLatest = path.join(paperDir, `.latest-prev-${randomUUID()}`)

  mkdirSync(path.join(tempLatest, 'analyses'), { recursive: true })
  for (const fileName of ['paper-asset.json', 'answer-key.json', 'import-meta.json']) {
    writeFileSync(path.join(tempLatest, fileName), readFileSync(path.join(versionDir, fileName)))
  }
  writeFileSync(
    path.join(tempLatest, 'analyses', readingChoiceAnalysisFileName),
    readFileSync(path.join(versionDir, 'analyses', readingChoiceAnalysisFileName)),
  )
  const scAnalysisPath = path.join(versionDir, 'analyses', sevenChoicesAnalysisFileName)
  if (existsSync(scAnalysisPath)) {
    writeFileSync(
      path.join(tempLatest, 'analyses', sevenChoicesAnalysisFileName),
      readFileSync(scAnalysisPath),
    )
  }
  const clozeAnalysisPath = path.join(versionDir, 'analyses', clozeAnalysisFileName)
  if (existsSync(clozeAnalysisPath)) {
    writeFileSync(
      path.join(tempLatest, 'analyses', clozeAnalysisFileName),
      readFileSync(clozeAnalysisPath),
    )
  }
  const grammarFillAnalysisPath = path.join(versionDir, 'analyses', grammarFillAnalysisFileName)
  if (existsSync(grammarFillAnalysisPath)) {
    writeFileSync(
      path.join(tempLatest, 'analyses', grammarFillAnalysisFileName),
      readFileSync(grammarFillAnalysisPath),
    )
  }

  let movedPrevious = false
  try {
    if (existsSync(latestDir)) {
      renameSync(latestDir, previousLatest)
      movedPrevious = true
    }
    renameSync(tempLatest, latestDir)
    if (movedPrevious) rmSync(previousLatest, { recursive: true, force: true })
  } catch (error) {
    try {
      if (existsSync(tempLatest)) rmSync(tempLatest, { recursive: true, force: true })
      if (movedPrevious && existsSync(previousLatest) && !existsSync(latestDir)) {
        renameSync(previousLatest, latestDir)
      }
    } catch {
      // Preserve the original swap failure.
    }
    throw error
  }

  return latestDir
}

export function cleanupPaperImportTempArtifacts(paperAssetsDir) {
  if (!existsSync(paperAssetsDir)) return []
  const removed = []
  for (const paperEntry of readdirSync(paperAssetsDir, { withFileTypes: true })) {
    if (!paperEntry.isDirectory()) continue
    const paperDir = path.join(paperAssetsDir, paperEntry.name)
    for (const entry of readdirSync(paperDir, { withFileTypes: true })) {
      if (entry.isDirectory() && (/^\.latest-tmp-/.test(entry.name) || /^\.latest-prev-/.test(entry.name))) {
        const target = path.join(paperDir, entry.name)
        rmSync(target, { recursive: true, force: true })
        removed.push(target)
      }
    }
    const versionsDir = path.join(paperDir, 'versions')
    if (!existsSync(versionsDir)) continue
    for (const entry of readdirSync(versionsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && /^\.tmp-/.test(entry.name)) {
        const target = path.join(versionsDir, entry.name)
        rmSync(target, { recursive: true, force: true })
        removed.push(target)
      }
    }
  }
  return removed
}

export function readLatestPaperAssetVersion(paperAssetsDir, paperId) {
  const paths = resolvePaperAssetReadPaths(paperAssetsDir, paperId)
  const asset = readJsonMaybe(paths.assetPath)
  return asset?.paper?.assetVersion || null
}
