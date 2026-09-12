import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { defineRoute } from '../router/index.mjs'

const safePaperId = /^[a-z0-9][a-z0-9._-]{0,127}$/u

function currentPublication(db, paperId) {
  return db.prepare(`
    SELECT paper_id, version_name, source_asset_version, publication_digest
    FROM canonical_paper_publications
    WHERE paper_id = ? AND is_current = 1
  `).get(paperId)
}

export function readCurrentListeningMaterialProjection({
  db,
  paperAssetsDir,
  paperId,
  topic = {},
}) {
  if (!safePaperId.test(paperId) || paperId === '.' || paperId === '..') return null
  const current = currentPublication(db, paperId)
  if (!current) return null
  const filePath = path.join(
    paperAssetsDir,
    paperId,
    'versions',
    current.version_name,
    'analyses/listening-analysis-v1.json',
  )
  if (!existsSync(filePath)) return null
  const analysis = JSON.parse(readFileSync(filePath, 'utf8'))
  if (
    analysis.paperId !== current.paper_id
    || analysis.sourceAssetVersion !== Number(current.source_asset_version)
  ) throw new Error('Current listening analysis does not match its canonical Publication')

  const materials = Object.values(analysis.materials || {})
    .filter((material) => ['theme', 'themeGroup', 'subtopic'].every((key) =>
      !topic[key] || material.topic?.[key] === topic[key]))
    .map((material) => ({
      segmentId: material.segmentId,
      questionIds: [...material.questionIds],
      topic: structuredClone(material.topic),
      summaryZh: material.summaryZh,
      similarityText: material.summaryZh,
    }))
  return {
    schemaVersion: 'current-listening-material-projection-v1',
    paperId,
    sourceAssetVersion: Number(current.source_asset_version),
    versionName: current.version_name,
    publicationDigest: current.publication_digest,
    materials,
  }
}

export function createListeningMaterialProjectionRoutes() {
  return [defineRoute(
    'GET',
    /^\/api\/papers\/([^/]+)\/listening-materials$/u,
    ({ response, match, url, context }) => {
      const paperId = decodeURIComponent(match[1])
      const db = context.openDatabase()
      try {
        const projection = readCurrentListeningMaterialProjection({
          db,
          paperAssetsDir: context.paperAssetsDir,
          paperId,
          topic: {
            theme: url.searchParams.get('theme') || '',
            themeGroup: url.searchParams.get('themeGroup') || '',
            subtopic: url.searchParams.get('subtopic') || '',
          },
        })
        if (!projection) {
          context.sendJson(response, 404, { error: 'Published listening materials not found' })
          return
        }
        context.sendJson(response, 200, projection)
      } finally {
        db.close()
      }
    },
  )]
}
