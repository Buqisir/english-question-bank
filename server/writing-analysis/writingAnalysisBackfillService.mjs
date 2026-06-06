/**
 * I18 — Writing analysis backfill service.
 *
 * Three exports for the driver pipeline:
 *   listWritingAnalysisWork     — scan paper-assets for application writing groups
 *   validateWritingAnalysisCandidate — hard gate + soft warning (plan Locked #5)
 *   persistWritingAnalysisGroup — write/merge writing-analysis-v1.json envelope
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'

const WRITING_ANALYSIS_FILENAME = 'writing-analysis-v1.json'
const WRITING_ANALYSIS_SCHEMA_VERSION = 'writing-analysis-v1'

// ─── normalize helpers ───────────────────────────────────────────────────────

/**
 * Normalize whitespace and punctuation variants so substring matching is
 * reliable across model output and stored text.
 * - Collapse runs of whitespace/newlines to single space
 * - Unify curly/straight quotes and apostrophes → straight
 * - Unify en-dash/em-dash/hyphen → hyphen
 */
function normalizeForSubstring(s) {
  return String(s)
    .replace(/[‘’ʼ]/g, "'") // curly single quotes / apostrophe → '
    .replace(/[“”]/g, '"') // curly double quotes → "
    .replace(/[–—]/g, '-') // en-dash / em-dash → hyphen
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
}

// ─── count words (rough: split on whitespace) ───────────────────────────────

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length
}

// ─── listWritingAnalysisWork ─────────────────────────────────────────────────

/**
 * Scan paper-assets and return one work item per application writing group
 * that has not yet been analysed (no writing-analysis-v1.json for that groupId).
 *
 * @param {object} args
 * @param {string} args.paperAssetsDir
 * @param {function} [args.warn]
 * @returns {Array<{paperId: string, groupId: string, writingTask: object}>}
 */
export function listWritingAnalysisWork({ paperAssetsDir, warn = console.warn }) {
  const work = []

  if (!existsSync(paperAssetsDir)) return work

  for (const entry of readdirSync(paperAssetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const paperId = entry.name

    try {
      const { baseDir, assetPath } = resolvePaperAssetReadPaths(paperAssetsDir, paperId)
      if (!existsSync(assetPath)) continue

      const asset = JSON.parse(readFileSync(assetPath, 'utf8'))
      const content = asset?.content
      if (!content) continue

      const groups = content.groups || {}
      const writingTasks = content.writingTasks || {}

      // Read existing analysis file to know which groupIds are already done
      const analysisFilePath = path.join(baseDir, 'analyses', WRITING_ANALYSIS_FILENAME)
      let existingGroups = {}
      if (existsSync(analysisFilePath)) {
        try {
          const existing = JSON.parse(readFileSync(analysisFilePath, 'utf8'))
          if (existing?.schemaVersion === WRITING_ANALYSIS_SCHEMA_VERSION) {
            existingGroups = existing.groups || {}
          }
        } catch {
          // treat as empty
        }
      }

      for (const [groupId, group] of Object.entries(groups)) {
        if (group.groupType !== 'writing') continue
        if (!group.writingTaskId) continue

        const writingTask = writingTasks[group.writingTaskId]
        if (!writingTask) continue
        if (writingTask.taskType !== 'application') continue

        // Skip if already persisted
        if (existingGroups[groupId]?.writing) continue

        work.push({ paperId, groupId, writingTask })
      }
    } catch (error) {
      warn(`[writing-analysis] ignored invalid paper asset in ${paperId}:`, error)
    }
  }

  return work
}

// ─── validateWritingAnalysisCandidate ────────────────────────────────────────

/**
 * Hard gate: throw if candidate fails required checks.
 * Soft warning: console.warn if modelAnswer word count is outside [60, 180].
 *
 * Plan Locked #5 checks:
 *   - taskType === 'application'
 *   - modelAnswer non-empty
 *   - highlightExpressions length 3–5
 *   - each text non-empty AND (normalized) is a substring of modelAnswer
 *   - each note non-empty
 *
 * @param {object} candidate - the parsed JSON from the agent's .out.json
 *   Expected shape: { taskType, modelAnswer, highlightExpressions }
 *   (audit field present in agent output is ignored / not stored)
 * @throws {Error} if any hard gate fails
 */
export function validateWritingAnalysisCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('validateWritingAnalysisCandidate: candidate is not an object.')
  }

  // Hard: taskType
  if (candidate.taskType !== 'application') {
    throw new Error(`taskType must be 'application', got: ${candidate.taskType}`)
  }

  // Hard: modelAnswer non-empty
  if (!candidate.modelAnswer || typeof candidate.modelAnswer !== 'string' || !candidate.modelAnswer.trim()) {
    throw new Error('modelAnswer is empty or missing.')
  }

  // Hard: highlightExpressions length 3–5
  const hx = candidate.highlightExpressions
  if (!Array.isArray(hx)) {
    throw new Error('highlightExpressions must be an array.')
  }
  if (hx.length < 3 || hx.length > 5) {
    throw new Error(`highlightExpressions must have 3–5 items, got ${hx.length}.`)
  }

  // Hard: each item text non-empty + is substring of modelAnswer; note non-empty
  const normAnswer = normalizeForSubstring(candidate.modelAnswer)
  for (let i = 0; i < hx.length; i++) {
    const item = hx[i]
    if (!item || typeof item !== 'object') {
      throw new Error(`highlightExpressions[${i}] is not an object.`)
    }
    if (!item.text || typeof item.text !== 'string' || !item.text.trim()) {
      throw new Error(`highlightExpressions[${i}].text is empty or missing.`)
    }
    if (!item.note || typeof item.note !== 'string' || !item.note.trim()) {
      throw new Error(`highlightExpressions[${i}].note is empty or missing.`)
    }
    const normText = normalizeForSubstring(item.text)
    if (!normAnswer.includes(normText)) {
      throw new Error(
        `highlightExpressions[${i}].text not found in modelAnswer after normalization.\n` +
          `  text:   ${JSON.stringify(item.text)}\n` +
          `  answer: ${JSON.stringify(candidate.modelAnswer).slice(0, 200)}`
      )
    }
  }

  // Soft: word count warning
  const wc = wordCount(candidate.modelAnswer)
  if (wc < 60 || wc > 180) {
    console.warn(
      `[writing-analysis] WARNING: modelAnswer word count ${wc} is outside expected range [60, 180].`
    )
  }
}

// ─── persistWritingAnalysisGroup ─────────────────────────────────────────────

/**
 * Write (or merge into) the writing-analysis-v1.json envelope for one paper.
 *
 * Merges: existing groupIds are preserved; the incoming groupId is written/
 * overwritten. Only the three contract fields (taskType, modelAnswer,
 * highlightExpressions) are stored — audit and other agent-side fields are
 * discarded.
 *
 * @param {object} ctx
 * @param {string} ctx.paperAssetsDir
 * @param {object} work - { paperId, groupId }
 * @param {object} analysis - validated candidate (taskType, modelAnswer, highlightExpressions)
 * @returns {{ filePath: string }}
 */
export function persistWritingAnalysisGroup({ paperAssetsDir }, work, analysis) {
  const { paperId, groupId } = work
  const { baseDir } = resolvePaperAssetReadPaths(paperAssetsDir, paperId)

  const analysisDir = path.join(baseDir, 'analyses')
  mkdirSync(analysisDir, { recursive: true })

  const filePath = path.join(analysisDir, WRITING_ANALYSIS_FILENAME)

  // Read existing file and merge (keep other groupIds intact)
  let existingGroups = {}
  let existingMeta
  if (existsSync(filePath)) {
    try {
      const existing = JSON.parse(readFileSync(filePath, 'utf8'))
      if (existing?.schemaVersion === WRITING_ANALYSIS_SCHEMA_VERSION) {
        existingGroups = existing.groups || {}
        existingMeta = existing.meta
      }
    } catch {
      // treat as empty; will overwrite
    }
  }

  // Build the stored shape — only the three contract fields
  const writingEntry = {
    taskType: analysis.taskType,
    modelAnswer: analysis.modelAnswer,
    highlightExpressions: analysis.highlightExpressions.map(({ text, note }) => ({ text, note })),
  }

  const mergedGroups = {
    ...existingGroups,
    [groupId]: {
      ...(existingGroups[groupId] || {}),
      writing: writingEntry,
    },
  }

  const payload = {
    schemaVersion: WRITING_ANALYSIS_SCHEMA_VERSION,
    paperId,
    ...(existingMeta ? { meta: existingMeta } : {}),
    groups: mergedGroups,
  }

  const tempPath = path.join(analysisDir, `.${WRITING_ANALYSIS_FILENAME}.tmp-${randomUUID()}`)
  try {
    writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`)
    renameSync(tempPath, filePath)
  } catch (error) {
    if (existsSync(tempPath)) rmSync(tempPath, { force: true })
    throw error
  }

  return { filePath }
}
