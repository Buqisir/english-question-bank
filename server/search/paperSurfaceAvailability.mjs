import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'

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
      const { assetPath, analysisPath } = resolvePaperAssetReadPaths(paperAssetsDir, entry.name)
      if (!existsSync(assetPath) || !existsSync(analysisPath)) continue

      try {
        const asset = readJsonFile(assetPath)
        const analysis = readJsonFile(analysisPath)
        const paperId = String(asset?.paper?.paperId || entry.name)
        if (analysis?.schemaVersion !== 'reading-choice-analysis-v1') continue
        if (analysis?.paperId !== paperId) continue

        const groups = asset?.content?.groups && typeof asset.content.groups === 'object'
          ? Object.values(asset.content.groups)
          : []
        for (const group of groups) {
          const groupId = String(group?.groupId || '')
          const questionIds = Array.isArray(group?.questionIds) ? group.questionIds.map(String) : []
          if (!groupId || group?.groupType !== 'reading' || questionIds.length === 0) continue
          if (Array.isArray(analysis?.targetGroups) && !analysis.targetGroups.includes(groupId)) continue
          const hasReviewedAnalysisForEveryQuestion = questionIds.every((questionId) =>
            Boolean(analysis?.questions?.[questionId]),
          )
          if (!hasReviewedAnalysisForEveryQuestion) continue

          availabilityByGroupId.set(groupId, {
            href: buildPaperSurfaceHref({
              source: 'paper-asset',
              paperId,
              groupId,
              questionId: questionIds[0],
            }),
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
