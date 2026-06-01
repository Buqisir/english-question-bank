import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'

const analysisConfigs = [
  {
    schemaVersion: 'reading-choice-analysis-v1',
    fileName: 'reading-choice-analysis-v1.json',
    groupType: 'reading',
    label: '阅读解析',
    // Default: completeness keyed under analysis.questions[questionId]
    entryMapKey: 'questions',
  },
  {
    schemaVersion: 'seven-choices-analysis-v1',
    fileName: 'seven-choices-analysis-v1.json',
    groupType: 'sevenChoices',
    label: '七选五解析',
    entryMapKey: 'questions',
  },
  {
    schemaVersion: 'cloze-analysis-v1',
    fileName: 'cloze-analysis-v1.json',
    groupType: 'cloze',
    label: '完形解析',
    // Cloze analysis keys per-blank entries under 'blanks', not 'questions' (PA MF-1).
    entryMapKey: 'blanks',
  },
  {
    schemaVersion: 'grammar-fill-analysis-v1',
    fileName: 'grammar-fill-analysis-v1.json',
    groupType: 'grammarFill',
    label: '语法解析',
    // Grammar-fill analysis keys per-blank entries under 'blanks' (I14).
    entryMapKey: 'blanks',
  },
]

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function buildPaperSurfaceHref(args) {
  const params = new URLSearchParams()
  params.set('view', 'paper-intelligence')
  if (args.source && args.source !== 'legacy-report') {
    params.set('source', args.source)
  }
  params.set('paperId', args.paperId)
  params.set('surface', 'paper')
  if (args.groupId) {
    params.set('groupId', args.groupId)
  }
  if (args.questionId) {
    params.set('questionId', args.questionId)
  }
  return `?${params.toString()}`
}

export function createPaperSurfaceAnalysisAvailability({ paperAssetsDir, warn = console.warn }) {
  let availabilityByGroupIdCache = null

  function addAvailabilityForAnalysis({ availabilityByGroupId, asset, analysis, config, paperId }) {
    if (analysis?.schemaVersion !== config.schemaVersion) return
    if (analysis?.paperId !== paperId) return

    const groups = asset?.content?.groups && typeof asset.content.groups === 'object'
      ? Object.values(asset.content.groups)
      : []
    for (const group of groups) {
      const groupId = String(group?.groupId || '')
      const questionIds = Array.isArray(group?.questionIds) ? group.questionIds.map(String) : []
      if (!groupId || group?.groupType !== config.groupType || questionIds.length === 0) continue
      if (Array.isArray(analysis?.targetGroups) && !analysis.targetGroups.includes(groupId)) continue
      const entryMapKey = config.entryMapKey ?? 'questions'
      const hasReviewedAnalysisForEveryQuestion = questionIds.every((questionId) =>
        Boolean(analysis?.[entryMapKey]?.[questionId]),
      )
      if (!hasReviewedAnalysisForEveryQuestion) continue

      availabilityByGroupId.set(groupId, {
        href: buildPaperSurfaceHref({
          source: 'paper-asset',
          paperId,
          groupId,
          questionId: questionIds[0],
        }),
        label: config.label,
      })
    }
  }

  function getByGroupId() {
    if (availabilityByGroupIdCache) {
      return availabilityByGroupIdCache
    }

    const availabilityByGroupId = new Map()
    if (!existsSync(paperAssetsDir)) {
      availabilityByGroupIdCache = availabilityByGroupId
      return availabilityByGroupId
    }

    for (const entry of readdirSync(paperAssetsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue

      const assetDir = path.join(paperAssetsDir, entry.name)
      const { assetPath, baseDir } = resolvePaperAssetReadPaths(paperAssetsDir, entry.name)
      if (!existsSync(assetPath)) continue

      try {
        const asset = readJsonFile(assetPath)
        const paperId = String(asset?.paper?.paperId || entry.name)

        for (const config of analysisConfigs) {
          const analysisPath = path.join(baseDir, 'analyses', config.fileName)
          if (!existsSync(analysisPath)) continue
          const analysis = readJsonFile(analysisPath)
          addAvailabilityForAnalysis({
            availabilityByGroupId,
            asset,
            analysis,
            config,
            paperId,
          })
        }
      } catch (error) {
        warn(`[paper-surface-analysis] ignored invalid paper asset analysis in ${assetDir}:`, error)
      }
    }

    availabilityByGroupIdCache = availabilityByGroupId
    return availabilityByGroupId
  }

  function invalidate() {
    availabilityByGroupIdCache = null
  }

  return {
    getByGroupId,
    invalidate,
  }
}
