import { existsSync, readdirSync, readFileSync } from 'node:fs'

import {
  readPaperAssetNormalizationBundle,
  resolvePaperAssetReadPaths,
} from './paper-import/storage.mjs'
import {
  buildExactPaperGroupSourceSlice,
} from '../shared/paper-normalization/exactPaperGroupSourceSlice.mjs'
import {
  normalizePaperGroup,
} from '../shared/paper-normalization/normalizePaperGroup.mjs'

const COMPATIBILITY_GROUPS = new Set([
  'paper-2026-i:group-2026-i-cloze',
  'paper-2026-i:group-2026-i-grammar-fill',
  'paper-960d0f8d:group-960d0f8d-grammar-fill',
])

function legacyResult({ paperId, groupId, reason, issues = [] }) {
  return {
    status: 'legacy',
    diagnostic: {
      status: 'legacy',
      source: 'legacy',
      paperId,
      groupId,
      reason,
      ...(issues.length > 0 ? { issues } : {}),
    },
  }
}

/**
 * Selects a complete canonical group for Print HTML or an explicit legacy
 * fallback. A rejected/missing sidecar is never consumed partially.
 */
export function resolveCanonicalPrintGroup({ paperAssetsDir, groupId }) {
  if (!paperAssetsDir || !existsSync(paperAssetsDir)) {
    return { status: 'not_found' }
  }

  for (const entry of readdirSync(paperAssetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    let bundle
    let sidecarIssues = []
    try {
      bundle = readPaperAssetNormalizationBundle(
        paperAssetsDir,
        entry.name,
      )
    } catch (error) {
      sidecarIssues = [
        {
          code:
            error?.code === 'PAPER_NORMALIZED_GROUPS_SIDECAR_REJECTED'
              ? error.code
              : 'PAPER_NORMALIZED_GROUPS_SIDECAR_INVALID',
          message: error instanceof Error ? error.message : String(error),
        },
      ]
      try {
        const paths = resolvePaperAssetReadPaths(paperAssetsDir, entry.name)
        bundle = {
          ...paths,
          paperAsset: JSON.parse(readFileSync(paths.assetPath, 'utf8')),
          normalizedGroupsSidecar: null,
        }
      } catch {
        continue
      }
    }

    const asset = bundle.paperAsset
    if (!asset?.content?.groups?.[groupId]) continue

    const paperId = asset?.paper?.paperId ?? entry.name
    if (!COMPATIBILITY_GROUPS.has(`${paperId}:${groupId}`)) {
      return legacyResult({
        paperId,
        groupId,
        reason: 'canonical_not_enabled_for_group',
        issues: sidecarIssues,
      })
    }

    const sidecarEntry = bundle.normalizedGroupsSidecar?.groups?.[groupId]
    if (sidecarEntry) {
      return {
        status: 'ready',
        group: sidecarEntry.canonicalGroup,
        diagnostic: {
          status: 'ready',
          source: 'sidecar',
          paperId,
          groupId,
        },
      }
    }

    const normalized = normalizePaperGroup(
      buildExactPaperGroupSourceSlice(asset, groupId),
    )
    if (normalized.status === 'ready') {
      return {
        status: 'ready',
        group: normalized.group,
        diagnostic: {
          status: 'ready',
          source: 'compatibility',
          paperId,
          groupId,
          ...(sidecarIssues.length > 0
            ? { artifact: 'rejected', issues: sidecarIssues }
            : {}),
        },
      }
    }
    return legacyResult({
      paperId,
      groupId,
      reason: 'compatibility_needs_review',
      issues: normalized.issues,
    })
  }

  return { status: 'not_found' }
}
