// server/figures/paperFigures.mjs — figure-render cut (fig-token P0).
//
// Server-side helper for print-renderer.mjs: given a question-group id,
// find the paper-asset
// that owns it and return that paper's figures/manifest.json entries plus
// the on-disk baseDir the figure PNGs live under (`<baseDir>/figures/`).
//
// Read-only (paper-asset.json / figures/** are data-side read-only per
// plan.md Forbidden — this module only reads, never writes). Deliberately
// re-implements the small directory-scan `server/api.mjs`'s
// `findPaperAssetGroup` already does, rather than exporting/importing that
// function, to keep this cut's footprint on server/api.mjs to the single
// `paperAssetsDir` plumbing line documented in the completion report — see
// that report's "beyond the plan's literal Allowed list" note.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

/**
 * @param {string | null | undefined} paperAssetsDir
 * @param {string | null | undefined} groupId
 * @returns {{ paperId: string, baseDir: string, figures: ReadonlyArray<object> } | null}
 *   null when paperAssetsDir/groupId is missing, or no paper-asset owns
 *   this groupId (the overwhelmingly common case — DB-only groups, or
 *   paper-asset groups whose paper has no figures/manifest.json still
 *   resolve with `figures: []`, never null, so callers can cache the
 *   "no figures" result without re-scanning).
 */
export function resolveGroupFigures(paperAssetsDir, groupId) {
  if (!groupId || !paperAssetsDir || !existsSync(paperAssetsDir)) return null

  let entries
  try {
    entries = readdirSync(paperAssetsDir, { withFileTypes: true })
  } catch {
    return null
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    let paths
    try {
      paths = resolvePaperAssetReadPaths(paperAssetsDir, entry.name)
    } catch {
      continue
    }
    if (!existsSync(paths.assetPath)) continue

    let asset
    try {
      asset = readJsonFile(paths.assetPath)
    } catch {
      continue
    }
    if (!asset?.content?.groups?.[groupId]) continue

    const manifestPath = path.join(paths.baseDir, 'figures', 'manifest.json')
    let figures = []
    if (existsSync(manifestPath)) {
      try {
        const manifest = readJsonFile(manifestPath)
        figures = Array.isArray(manifest?.figures) ? manifest.figures : []
      } catch {
        figures = []
      }
    }
    return { paperId: entry.name, baseDir: paths.baseDir, figures }
  }

  return null
}
