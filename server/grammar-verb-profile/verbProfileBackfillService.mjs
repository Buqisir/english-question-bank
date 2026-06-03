import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'
import { callChatCompletionsJson } from '../ai-providers/chatCompletions.mjs'
import { normalizeDeepSeekModel } from '../ai-providers/deepseek.mjs'
import {
  analyzeGrammarFillVerbProfile,
  extractFiniteVerbBlanks,
} from '../paper-import-ai/analyzeGrammarFillVerbProfile.mjs'
import { readVerbProfileSidecar, writeVerbProfileSidecar } from './verbProfileSidecar.mjs'

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

/**
 * Build a provider caller bound to a key (client-supplied or env-welded). The
 * analyzer only invokes it for blanks the deterministic pass cannot decide, so
 * on data with only obvious finite forms (e.g. the live "are" blank) no key is
 * needed at all.
 */
export function makeDeepSeekProviderCaller({ apiKey, model } = {}) {
  const key = String(apiKey || process.env.DEEPSEEK_API_KEY || '').trim()
  return ({ messages }) =>
    callChatCompletionsJson({
      baseUrl: DEEPSEEK_BASE_URL,
      apiKey: key,
      model: normalizeDeepSeekModel(model),
      messages,
      provider: 'deepseek',
    })
}

/**
 * I16·C — production glue between the pure backfill orchestrator and the
 * filesystem / AI. Walks paper-assets, finds grammar-fill analyses, diffs their
 * finite-verb blanks against any existing sidecar (idempotency), and exposes
 * classify / persist for backfillVerbProfiles().
 */

const GRAMMAR_FILL_ANALYSIS_FILENAME = 'grammar-fill-analysis-v1.json'
const GRAMMAR_FILL_ANALYSIS_SCHEMA = 'grammar-fill-analysis-v1'

/**
 * List grammar-fill groups that still have ≥1 unprofiled finite-verb blank.
 * skipped counts grammar-fill groups with no finite blanks OR already fully profiled.
 */
export function listGrammarFillVerbWork({ paperAssetsDir, warn = console.warn }) {
  const groups = []
  let skipped = 0

  if (!existsSync(paperAssetsDir)) return { groups, skipped }

  for (const entry of readdirSync(paperAssetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    try {
      const { baseDir } = resolvePaperAssetReadPaths(paperAssetsDir, entry.name)
      const analysisPath = path.join(baseDir, 'analyses', GRAMMAR_FILL_ANALYSIS_FILENAME)
      if (!existsSync(analysisPath)) continue

      const analysis = JSON.parse(readFileSync(analysisPath, 'utf8'))
      if (analysis?.schemaVersion !== GRAMMAR_FILL_ANALYSIS_SCHEMA) continue

      const finiteBlanks = extractFiniteVerbBlanks(analysis)
      if (finiteBlanks.length === 0) {
        skipped += 1
        continue
      }

      // Use the analysis's logical paperId (== asset.paper.paperId, what the
      // teaching-facets index matches the sidecar against). For these assets it
      // equals the dir name, which is the same assumption #180 retrieval makes.
      const paperId = analysis.paperId || entry.name
      const groupId = Array.isArray(analysis.targetGroups) ? analysis.targetGroups[0] : ''
      const sidecar = readVerbProfileSidecar(paperAssetsDir, paperId)
      const profiledIds = new Set(Object.keys(sidecar?.blanks || {}))
      const unprofiled = finiteBlanks.filter((b) => !profiledIds.has(b.questionId))

      if (unprofiled.length === 0) {
        skipped += 1
        continue
      }

      groups.push({ paperId, groupId, blanks: unprofiled })
    } catch (error) {
      warn(`[verb-profile] ignored invalid paper asset in ${entry.name}:`, error)
    }
  }

  return { groups, skipped }
}

/** Classify one group's unprofiled finite blanks (deterministic-first, AI fallback). */
export function classifyVerbProfileGroup(group, { providerCaller, model } = {}) {
  return analyzeGrammarFillVerbProfile(group.blanks, { providerCaller, model })
}

/** Persist one group's profiles into its sidecar (atomic merge). */
export function persistVerbProfileGroup({ paperAssetsDir }, group, profiles) {
  return writeVerbProfileSidecar({ paperAssetsDir, paperId: group.paperId, blanks: profiles })
}
