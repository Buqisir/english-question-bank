/**
 * I18/I19 — Writing analysis backfill service.
 *
 * Three exports for the driver pipeline:
 *   listWritingAnalysisWork     — scan paper-assets for writing groups (application + continuation)
 *   validateWritingAnalysisCandidate — hard gate + soft warning
 *   persistWritingAnalysisGroup — write/merge writing-analysis-v1.json envelope
 *
 * MF-1 (I19): persistWritingAnalysisGroup projection branches by taskType;
 *   continuation stores {taskType, modelAnswer, continuationDesign, highlightExpressions}.
 * MF-2 (I19): vocab gate uses tracked paper-asset.json (materialText+starters) as allowlist;
 *   FAIL-HARD if guokao-vocab-checker skill is absent.
 * SW-2 (I19): continuation soft-warning floor is 120 (application keeps 60).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'

const WRITING_ANALYSIS_FILENAME = 'writing-analysis-v1.json'
const WRITING_ANALYSIS_SCHEMA_VERSION = 'writing-analysis-v1'

// Path to guokao-vocab-checker skill check.py
const VOCAB_CHECKER_SCRIPT = path.join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.claude/skills/guokao-vocab-checker/scripts/check.py'
)

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
    .replace(/[''ʼ]/g, "'") // curly single quotes / apostrophe → '
    .replace(/[""]/g, '"') // curly double quotes → "
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
 * Scan paper-assets and return one work item per writing group (application or
 * continuation) that has not yet been analysed (no writing-analysis-v1.json for
 * that groupId).
 *
 * For application groups, the expected analysed groupId key equals the groupId.
 * For continuation groups, the expected analysed groupId key is
 * `group-<id>-writing-continuation` (same as the groupId itself if the paper
 * uses that naming convention).
 *
 * @param {object} args
 * @param {string} args.paperAssetsDir
 * @param {function} [args.warn]
 * @param {'application'|'continuation'|'all'} [args.taskTypeFilter] default 'all'
 * @returns {Array<{paperId: string, groupId: string, writingTask: object}>}
 */
export function listWritingAnalysisWork({ paperAssetsDir, warn = console.warn, taskTypeFilter = 'all' }) {
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

        const taskType = writingTask.taskType
        if (taskType !== 'application' && taskType !== 'continuation') continue

        // Apply optional task type filter
        if (taskTypeFilter !== 'all' && taskType !== taskTypeFilter) continue

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

// ─── runVocabGate ─────────────────────────────────────────────────────────────

/**
 * Run the guokao-vocab-checker gate on a text string, using the paper-asset's
 * materialText + continuationStarters as the allowed-words source.
 *
 * MF-2 contract:
 *   - allowlist source = tracked paper-asset.json (materialText + starters) — NOT gitignored .in.json
 *   - FAIL-HARD if the skill is absent (never silent-pass)
 *   - Pass condition = GENUINE_OOV empty (anchored to gate_check.py)
 *
 * @param {object} args
 * @param {string} args.textToCheck - text to check for OOV words
 * @param {string} args.allowlistText - materialText + starters concatenated (allowlist source)
 * @returns {{ clean: boolean, genuineOov: string[], suspect: string[], raw: string }}
 * @throws {Error} if skill is absent or check.py invocation fails
 */
export function runVocabGate({ textToCheck, allowlistText }) {
  // MF-2: FAIL-HARD if skill absent
  if (!existsSync(VOCAB_CHECKER_SCRIPT)) {
    throw new Error(
      `[vocab-gate] FAIL-HARD: guokao-vocab-checker skill not found at ${VOCAB_CHECKER_SCRIPT}. ` +
      `Ensure the skill is installed before running the vocab gate. Never silent-pass.`
    )
  }

  // Write text to check to a temp file so check.py can ingest it
  const tmpDir = path.join(process.env.TMPDIR || '/tmp', 'wa-vocab-gate')
  mkdirSync(tmpDir, { recursive: true })
  const tmpId = randomUUID()
  const textFile = path.join(tmpDir, `${tmpId}.txt`)
  const allowlistFile = path.join(tmpDir, `${tmpId}.allowlist.txt`)

  try {
    writeFileSync(textFile, textToCheck, 'utf8')
    writeFileSync(allowlistFile, allowlistText, 'utf8')

    // Build inline Python that mimics gate_check.py logic but reads from
    // the tracked paper-asset allowlist (not .in.json) — MF-2 anchor.
    const inlineScript = `
import json, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(${JSON.stringify(VOCAB_CHECKER_SCRIPT)})))
import check

text_file = sys.argv[1]
allowlist_file = sys.argv[2]

ma = open(text_file, encoding="utf-8").read()
allowlist_src = open(allowlist_file, encoding="utf-8").read()

src_words = set(w.lower() for w in re.findall(r"[A-Za-z]+", allowlist_src))
caps = set(w.lower() for w in re.findall(r"\\b[A-Z][a-z]+", ma + " " + allowlist_src))

r = check.check_text(ma)
oov = [w for w, _ in r["unannotated_oov_words"]]
genuine = [w for w in oov if w not in src_words and w not in caps]
suspect = [f"{w}<-{root}" for w, root, _ in r["suspect_derived_words"]
           if w not in src_words and w not in caps]

if genuine:
    print("GENUINE_OOV:", " ".join(sorted(genuine)))
else:
    print("CLEAN")
if suspect:
    print("SUSPECT:", " ".join(suspect))
`
    const scriptFile = path.join(tmpDir, `${tmpId}.gate.py`)
    writeFileSync(scriptFile, inlineScript, 'utf8')

    const raw = execFileSync('python3', [scriptFile, textFile, allowlistFile], {
      encoding: 'utf8',
      timeout: 30000,
    })

    const genuineOov = []
    const suspect = []
    let clean = true

    for (const line of raw.split('\n')) {
      if (line.startsWith('GENUINE_OOV:')) {
        const words = line.replace('GENUINE_OOV:', '').trim().split(/\s+/).filter(Boolean)
        genuineOov.push(...words)
        if (words.length > 0) clean = false
      } else if (line.startsWith('SUSPECT:')) {
        const words = line.replace('SUSPECT:', '').trim().split(/\s+/).filter(Boolean)
        suspect.push(...words)
      }
    }

    return { clean, genuineOov, suspect, raw: raw.trim() }
  } finally {
    for (const f of [textFile, allowlistFile]) {
      try { rmSync(f, { force: true }) } catch { /* ignore */ }
    }
    try { rmSync(path.join(tmpDir, `${tmpId}.gate.py`), { force: true }) } catch { /* ignore */ }
  }
}

// ─── validateWritingAnalysisCandidate ────────────────────────────────────────

/**
 * Hard gate: throw if candidate fails required checks.
 * Soft warning: console.warn if modelAnswer word count is outside expected range.
 *
 * Application checks (plan Locked #5 / I18):
 *   - taskType === 'application'
 *   - modelAnswer non-empty
 *   - highlightExpressions length 3–5
 *   - each text non-empty AND (normalized) is a substring of modelAnswer
 *   - each note non-empty
 *
 * Continuation checks (I19 MF-1):
 *   - taskType === 'continuation'
 *   - modelAnswer non-empty
 *   - continuationDesign.theme non-empty
 *   - continuationDesign.paragraphs exactly 2, each non-empty
 *   - highlightExpressions 3–5
 *   - each text normalized is a substring of modelAnswer; note non-empty
 *   Soft warning: word count outside [120, 200] (SW-2: floor 120 for continuation)
 *
 * Vocab gate (MF-2): called separately via runVocabGate; this function does NOT
 * invoke the gate — the driver pipeline calls runVocabGate before this validator.
 *
 * @param {object} candidate - the parsed JSON from the agent's .out.json
 * @throws {Error} if any hard gate fails
 */
export function validateWritingAnalysisCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('validateWritingAnalysisCandidate: candidate is not an object.')
  }

  // Hard: taskType must be application or continuation (MF-1: widen from application-only)
  if (candidate.taskType !== 'application' && candidate.taskType !== 'continuation') {
    throw new Error(`taskType must be 'application' or 'continuation', got: ${candidate.taskType}`)
  }

  // Hard: modelAnswer non-empty
  if (!candidate.modelAnswer || typeof candidate.modelAnswer !== 'string' || !candidate.modelAnswer.trim()) {
    throw new Error('modelAnswer is empty or missing.')
  }

  // Hard: continuation-specific structural checks (MF-1)
  if (candidate.taskType === 'continuation') {
    const cd = candidate.continuationDesign
    if (!cd || typeof cd !== 'object') {
      throw new Error('continuationDesign is missing or not an object.')
    }
    if (!cd.theme || typeof cd.theme !== 'string' || !cd.theme.trim()) {
      throw new Error('continuationDesign.theme is empty or missing.')
    }
    if (!Array.isArray(cd.paragraphs)) {
      throw new Error('continuationDesign.paragraphs must be an array.')
    }
    if (cd.paragraphs.length !== 2) {
      throw new Error(
        `continuationDesign.paragraphs must have exactly 2 items, got ${cd.paragraphs.length}.`
      )
    }
    for (let i = 0; i < 2; i++) {
      if (!cd.paragraphs[i] || typeof cd.paragraphs[i] !== 'string' || !cd.paragraphs[i].trim()) {
        throw new Error(`continuationDesign.paragraphs[${i}] is empty or missing.`)
      }
    }
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

  // Soft: word count warning (SW-2: continuation floor = 120, application floor = 60)
  const wc = wordCount(candidate.modelAnswer)
  if (candidate.taskType === 'continuation') {
    if (wc < 120 || wc > 200) {
      console.warn(
        `[writing-analysis] WARNING: continuation modelAnswer word count ${wc} is outside expected range [120, 200].`
      )
    }
  } else {
    if (wc < 60 || wc > 180) {
      console.warn(
        `[writing-analysis] WARNING: application modelAnswer word count ${wc} is outside expected range [60, 180].`
      )
    }
  }
}

// ─── persistWritingAnalysisGroup ─────────────────────────────────────────────

/**
 * Write (or merge into) the writing-analysis-v1.json envelope for one paper.
 *
 * Merges: existing groupIds are preserved; the incoming groupId is written/
 * overwritten. Only the contract fields are stored — audit and other
 * agent-side fields are discarded.
 *
 * MF-1 (I19): projection branches by taskType:
 *   - application: {taskType, modelAnswer, highlightExpressions}
 *   - continuation: {taskType, modelAnswer, continuationDesign, highlightExpressions}
 *
 * Envelope merge preserves existing application groups when a continuation
 * group is written for the same paper (different groupId keys, no collision).
 *
 * @param {object} ctx
 * @param {string} ctx.paperAssetsDir
 * @param {object} work - { paperId, groupId }
 * @param {object} analysis - validated candidate
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

  // MF-1: Build stored shape — projection branches by taskType
  let writingEntry
  if (analysis.taskType === 'continuation') {
    writingEntry = {
      taskType: analysis.taskType,
      modelAnswer: analysis.modelAnswer,
      continuationDesign: {
        theme: analysis.continuationDesign.theme,
        paragraphs: [
          analysis.continuationDesign.paragraphs[0],
          analysis.continuationDesign.paragraphs[1],
        ],
      },
      highlightExpressions: analysis.highlightExpressions.map(({ text, note }) => ({ text, note })),
    }
  } else {
    // application: original three-field projection
    writingEntry = {
      taskType: analysis.taskType,
      modelAnswer: analysis.modelAnswer,
      highlightExpressions: analysis.highlightExpressions.map(({ text, note }) => ({ text, note })),
    }
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
