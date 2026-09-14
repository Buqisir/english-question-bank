import path from 'node:path'
import { readFileSync } from 'node:fs'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'

// Publication validates the complete paper before committing this index.
// Discovery reads that index and its small plan, not a new full-corpus Screen
// validation. Opening a paper and exporting still use canonicalConsumerRuntime.
export function listCanonicalPaperCatalog({ db, rootDir, paperId = null }) {
  if (!db.prepare("SELECT name FROM sqlite_master WHERE name = 'canonical_paper_publications'").get()) return []
  const refs = db.prepare(`SELECT paper_id, version_name, source_asset_version, publication_digest, created_at
    FROM canonical_paper_publications WHERE is_current = 1${paperId ? ' AND paper_id = ?' : ''}`).all(...(paperId ? [paperId] : []))
  const papers = []
  for (const ref of refs) {
    try {
      if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(ref.paper_id) || ref.paper_id.includes('..') || !/^v\d+$/.test(ref.version_name)) continue
      const latest = JSON.parse(readFileSync(path.join(rootDir, ref.paper_id, 'latest/canonical-paper-publication-ref-v1.json')))
      if (latest.paperId !== ref.paper_id || latest.versionName !== ref.version_name || latest.sourceAssetVersion !== ref.source_asset_version || latest.publicationDigest !== ref.publication_digest) continue
      const plan = JSON.parse(readFileSync(path.join(rootDir, ref.paper_id, 'versions', ref.version_name, 'canonical/canonical-paper-plan-v1.json')))
      if (plan.paperId !== ref.paper_id) continue
      const groupIds = plan.slotBindings.filter(slot => slot.state === 'bound').map(slot => slot.groupRef.groupId)
      const asset = JSON.parse(readFileSync(resolvePaperAssetReadPaths(rootDir, ref.paper_id).assetPath))
      if (asset.paper?.paperId !== ref.paper_id || groupIds.some(id => asset.content?.groups?.[id]?.groupId !== id)) continue
      const blockIds = asset.content.blocks.filter(block => block.type === 'group').map(block => block.groupId)
      if (!groupIds.length || blockIds.length !== groupIds.length || new Set(blockIds).size !== groupIds.length || blockIds.some(id => !groupIds.includes(id))) continue
      papers.push({ paperId: ref.paper_id, publishedAt: ref.created_at, asset, groupIds })
    } catch {
      // Missing/unreadable projections are not advertised. Deep integrity errors
      // are reported by the authoritative consumption endpoint on open/export.
    }
  }
  return papers
}
