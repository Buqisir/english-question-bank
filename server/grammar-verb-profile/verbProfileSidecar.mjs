import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'

/**
 * I16·C — verb-profile sidecar persistence.
 *
 * The sidecar lives next to grammar-fill-analysis-v1.json so the teaching-facets
 * index reads it in the same baseDir walk. It NEVER patches the frozen analysis.
 *
 * MF-1: resolve the SAME baseDir the index reads via resolvePaperAssetReadPaths
 * (which falls back to versions/<latest> when there is no latest/ dir), never a
 * hardcoded latest/.
 */

export const VERB_PROFILE_SIDECAR_FILENAME = 'grammar-fill-verb-profile-v1.json'
export const VERB_PROFILE_SCHEMA_VERSION = 'grammar-fill-verb-profile-v1'

function sidecarPathFor(paperAssetsDir, paperId) {
  const { baseDir } = resolvePaperAssetReadPaths(paperAssetsDir, paperId)
  return path.join(baseDir, 'analyses', VERB_PROFILE_SIDECAR_FILENAME)
}

/** Read the existing sidecar for a paper, or null if absent/invalid. */
export function readVerbProfileSidecar(paperAssetsDir, paperId) {
  const filePath = sidecarPathFor(paperAssetsDir, paperId)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Write/merge the sidecar for one paper. Existing per-blank profiles are kept
 * (idempotent merge) and the incoming ones override matching questionIds.
 * Atomic temp+rename so a crash never leaves a half-written sidecar.
 *
 * @param {object} args
 * @param {string} args.paperAssetsDir
 * @param {string} args.paperId
 * @param {Record<string,{tense,voice,agreement,method?}>} args.blanks
 * @returns {{ filePath: string, blankCount: number }}
 */
export function writeVerbProfileSidecar({ paperAssetsDir, paperId, blanks }) {
  const filePath = sidecarPathFor(paperAssetsDir, paperId)
  const dir = path.dirname(filePath)
  mkdirSync(dir, { recursive: true })

  const prior = readVerbProfileSidecar(paperAssetsDir, paperId)
  const mergedBlanks = { ...(prior?.blanks || {}), ...blanks }

  const payload = {
    schemaVersion: VERB_PROFILE_SCHEMA_VERSION,
    paperId,
    blanks: mergedBlanks,
  }

  const tempPath = path.join(dir, `.${VERB_PROFILE_SIDECAR_FILENAME}.tmp-${randomUUID()}`)
  try {
    writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`)
    renameSync(tempPath, filePath)
  } catch (error) {
    if (existsSync(tempPath)) rmSync(tempPath, { force: true })
    throw error
  }

  return { filePath, blankCount: Object.keys(mergedBlanks).length }
}
