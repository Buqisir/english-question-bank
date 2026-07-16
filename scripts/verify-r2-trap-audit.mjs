#!/usr/bin/env node
/**
 * verify-r2-trap-audit.mjs — r2-trap-audit cut (docs/cuts/r2-trap-audit/plan.md
 * Scope 步骤 4).
 *
 * Five groups of assertions:
 *   1. Recomputability — re-running the same read-only judgment logic
 *      (trap-audit-lib.mjs) against the live app/public/paper-assets corpus
 *      reproduces the committed scan-findings.json byte-for-byte (modulo key
 *      order), and scan-report.md's headline counts match. This is the "报告
 *      数字必须可由 findings.json 复算" requirement.
 *   2. Applied-batch integrity — every auto-suspend-eligible finding
 *      (rogueType / labelExplanationContradiction / structuralIncompleteness)
 *      has a `suspension` field on the matching trap in the live corpus with
 *      a legal `level` (badge|row) and `reason` (a real checkId); every
 *      evidenceFieldLeak finding has NOT been suspended (owner-review-only
 *      bucket, plan.md Forbidden boundary).
 *   3. Zero rogue types unsuspended — "latest 零野类型" reframed per the
 *      Forbidden rule (this cut may never rewrite `primaryType` itself): no
 *      rogueType finding is missing its suspension.
 *   4. Real-module behavior, against a self-contained synthetic fixture so
 *      this proof does not depend on what the current corpus happens to
 *      contain — `buildPaperAssetSurfaceModel` (client adapter) is a PLAIN
 *      PASSTHROUGH (plan.md contract: adapter only transmits `trapSuspension`,
 *      it never hides trapLabel/trapExplanation/etc. itself — that gating
 *      decision belongs to the consumer) plus a general (suspension-agnostic)
 *      crash fix for an unrecognized primaryType. PaperAssetAnalysisPanel.tsx
 *      (the actual gating owner) is checked by static source assertion here
 *      (repo convention for .tsx display logic with no jsdom harness) and by
 *      real rendered behavior in DP-2. `loadGroupAnalysisTexts` (server
 *      analysisText.mjs, which does its own gating directly) is checked as a
 *      real module call: skips a row-suspended option's explanation from the
 *      "干扰项：" line, keeps a badge-suspended one.
 *   5. Real-module behavior, against the actual live corpus — the one
 *      confirmed rogueType/badge record (`paper-2023-i` q-2023-i-025/B)
 *      passes its suspension through the real adapter with a non-empty
 *      trapExplanation (describeTrap does not crash), not a synthetic
 *      stand-in; the panel-level badge-hiding is proven in DP-2 against this
 *      exact record.
 */

import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  AUTO_SUSPEND_CHECK_IDS,
  CHECK_IDS,
  evaluateOption,
} from './trap-audit-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const paperAssetsDir = path.join(rootDir, 'app', 'public', 'paper-assets')
const cutDir = path.join(rootDir, 'docs', 'cuts', 'r2-trap-audit')
const findingsPath = path.join(cutDir, 'scan-findings.json')
const reportPath = path.join(cutDir, 'scan-report.md')

let passed = 0
let failed = 0
function assert(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`)
  }
}

console.log('r2-trap-audit verify')

// ============================================================
// 1 + 3. Recompute findings live from the corpus, compare to committed
//        scan-findings.json / scan-report.md
// ============================================================

function listPaperIds() {
  return readdirSync(paperAssetsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

const liveFindings = []
let liveTotalTraps = 0
for (const paperId of listPaperIds()) {
  const analysisPath = path.join(paperAssetsDir, paperId, 'latest', 'analyses', 'reading-choice-analysis-v1.json')
  if (!existsSync(analysisPath)) continue
  const analysis = readJson(analysisPath)
  for (const [questionId, question] of Object.entries(analysis.questions || {})) {
    for (const option of question.optionAnalysis || []) {
      if (option?.status !== 'wrong' || !option.trap) continue
      liveTotalTraps += 1
      for (const hit of evaluateOption(option)) {
        liveFindings.push({
          paperId,
          questionId,
          optionLabel: option.label,
          primaryType: option.trap.primaryType,
          checkId: hit.checkId,
          level: hit.level,
          ...(hit.missing ? { missing: hit.missing } : {}),
        })
      }
    }
  }
}

assert('scan-findings.json exists (committed by trap-audit-scan.mjs)', existsSync(findingsPath))
assert('scan-report.md exists (committed by trap-audit-scan.mjs)', existsSync(reportPath))

if (existsSync(findingsPath)) {
  const committedFindings = readJson(findingsPath)
  const normalize = (list) => list
    .map((f) => JSON.stringify(f, Object.keys(f).sort()))
    .sort()
  assert(
    'live corpus re-scan reproduces committed scan-findings.json exactly (recomputability)',
    JSON.stringify(normalize(liveFindings)) === JSON.stringify(normalize(committedFindings)),
    `live=${liveFindings.length} findings, committed=${committedFindings.length} findings — run \`node scripts/trap-audit-scan.mjs\` again and commit the refreshed output if the corpus changed`,
  )
}

if (existsSync(reportPath)) {
  const report = readFileSync(reportPath, 'utf8')
  assert(
    `scan-report.md's trap total (${liveTotalTraps}) matches the live corpus`,
    report.includes(`**${liveTotalTraps}**`),
  )
}

// ============================================================
// 2. Applied-batch integrity on the live corpus
// ============================================================

const LEGAL_LEVELS = new Set(['badge', 'row'])
const LEGAL_REASONS = new Set(Object.values(CHECK_IDS))

for (const finding of liveFindings) {
  const analysisPath = path.join(paperAssetsDir, finding.paperId, 'latest', 'analyses', 'reading-choice-analysis-v1.json')
  const analysis = readJson(analysisPath)
  const option = analysis.questions?.[finding.questionId]?.optionAnalysis?.find((item) => item.label === finding.optionLabel)
  const suspension = option?.trap?.suspension
  const label = `${finding.paperId}/${finding.questionId}/${finding.optionLabel} (${finding.checkId})`

  if (AUTO_SUSPEND_CHECK_IDS.has(finding.checkId)) {
    assert(`${label}: auto-suspend-eligible finding has a suspension field`, Boolean(suspension))
    if (suspension) {
      assert(`${label}: suspension.level is legal (badge|row)`, LEGAL_LEVELS.has(suspension.level), `got ${suspension.level}`)
      assert(`${label}: suspension.reason is a legal checkId`, LEGAL_REASONS.has(suspension.reason), `got ${suspension.reason}`)
      assert(`${label}: suspension.reason matches this finding's checkId`, suspension.reason === finding.checkId)
      assert(`${label}: suspension.level matches this finding's judged level`, suspension.level === finding.level)
    }
  } else {
    // evidenceFieldLeak — plan.md Forbidden: this cut never suspends this
    // bucket, it is the second-段 owner judgment battle's job.
    assert(`${label}: evidenceFieldLeak finding is NOT auto-suspended (owner-review-only)`, !suspension)
  }
}

assert(
  'zero rogueType findings missing their suspension ("latest 零野类型" reframed: primaryType itself is never rewritten, plan.md Forbidden)',
  liveFindings.filter((f) => f.checkId === CHECK_IDS.ROGUE_TYPE).every((f) => {
    const analysisPath = path.join(paperAssetsDir, f.paperId, 'latest', 'analyses', 'reading-choice-analysis-v1.json')
    const analysis = readJson(analysisPath)
    const option = analysis.questions?.[f.questionId]?.optionAnalysis?.find((item) => item.label === f.optionLabel)
    return Boolean(option?.trap?.suspension)
  }),
)

// versions/ untouched — this cut only ever reads/writes latest/.
const versionsDirs = listPaperIds()
  .map((paperId) => path.join(paperAssetsDir, paperId, 'versions'))
  .filter((dir) => existsSync(dir))
assert('no versions/ directory was created or modified by this cut (none existed pre-cut; none exist now)', versionsDirs.length === 0)

// ============================================================
// 4. Real-module behavior — self-contained synthetic fixture
// ============================================================

function buildFixtureAsset(groupId, questionId) {
  return {
    schemaVersion: 'paper-asset-v1',
    paper: { paperId: 'paper-fixture-r2', title: 'Fixture', subject: 'english', source: 'fixture', assetVersion: 1, status: 'published' },
    sources: { primarySourceType: 'docx' },
    layoutTree: { parts: [] },
    content: {
      blocks: [],
      groups: {
        [groupId]: {
          groupId,
          groupType: 'reading',
          title: 'Reading A',
          questionIds: [questionId],
          passage: { paragraphs: [{ paragraphId: 'p1', text: 'Fixture passage text for the r2-trap-audit verify script.' }] },
        },
      },
      questions: {
        [questionId]: {
          questionId,
          questionNo: 21,
          groupId,
          stem: 'Fixture stem?',
          options: [
            { label: 'A', text: 'Correct option.' },
            { label: 'B', text: 'Wrong option (badge-suspended).' },
            { label: 'C', text: 'Wrong option (row-suspended).' },
            { label: 'D', text: 'Wrong option (not suspended, control).' },
          ],
        },
      },
    },
    answerKey: { answers: { [questionId]: { questionId, questionNo: 21, answer: 'A' } } },
    analysis: {},
  }
}

function buildFixtureAnalysis(groupId, questionId) {
  return {
    schemaVersion: 'reading-choice-analysis-v1',
    paperId: 'paper-fixture-r2',
    sourceAssetVersion: 1,
    targetGroups: [groupId],
    groups: { [groupId]: {} },
    questions: {
      [questionId]: {
        skill: { primary: 'detail' },
        questionFocus: 'fixture focus',
        stemTranslationZh: '',
        optionAnalysis: [
          { label: 'A', optionTranslationZh: '', status: 'correct', evidence: [] },
          {
            label: 'B',
            optionTranslationZh: '',
            status: 'wrong',
            trap: {
              primaryType: 'unsupportedClaim',
              claim: 'fixture claim B',
              explanation: 'BADGE_EXPLANATION_MARKER',
              suspension: { level: 'badge', reason: 'labelExplanationContradiction', suspendedAt: '2026-07-16' },
            },
          },
          {
            label: 'C',
            optionTranslationZh: '',
            status: 'wrong',
            trap: {
              primaryType: 'entityMismatch',
              sourceQuote: '', // deliberately empty — structuralIncompleteness in real life
              sourceEntity: '',
              optionText: 'fixture option C',
              optionEntity: '',
              explanation: 'ROW_EXPLANATION_MARKER',
              suspension: { level: 'row', reason: 'structuralIncompleteness', suspendedAt: '2026-07-16' },
            },
          },
          {
            label: 'D',
            optionTranslationZh: '',
            status: 'wrong',
            trap: {
              primaryType: 'scopeShift',
              subtype: 'overgeneralization',
              sourceQuote: 'q', sourceHighlight: 'q', optionText: 'fixture option D', optionHighlight: 'q',
              explanation: 'CONTROL_EXPLANATION_MARKER',
            },
          },
        ],
        locationParaphrases: [],
      },
    },
  }
}

{
  const groupId = 'group-fixture-reading-a'
  const questionId = 'q-fixture-021'
  const { buildPaperAssetSurfaceModel } = await import('../app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts')
  const model = buildPaperAssetSurfaceModel({
    asset: buildFixtureAsset(groupId, questionId),
    analysis: buildFixtureAnalysis(groupId, questionId),
    groupId,
  })
  const view = model.analysisByQuestionId[questionId]
  const optionB = view.options.find((o) => o.label === 'B')
  const optionC = view.options.find((o) => o.label === 'C')
  const optionD = view.options.find((o) => o.label === 'D')

  // Adapter contract (plan.md): a plain passthrough of `trap.suspension` as
  // `trapSuspension` — it does NOT hide trapLabel/trapSecondaryLabel/
  // trapSubtype/trapExplanation/trapEvidenceRows itself (that gating
  // decision belongs to the consumer: PaperAssetAnalysisPanel.tsx below via
  // static source check, and analysisText.mjs's own real-module check
  // further down). What the adapter DOES own: never crashing on an
  // unrecognized primaryType (describeTrap's former assertNever throw,
  // fixed generally — not suspension-gated) and transmitting the
  // suspension level/reason faithfully.
  assert('fixture badge option B: trapSuspension passthrough is {level:"badge", reason:...}', optionB.trapSuspension?.level === 'badge' && optionB.trapSuspension?.reason === 'labelExplanationContradiction')
  assert('fixture badge option B: trapLabel NOT hidden by the adapter (panel\'s job)', typeof optionB.trapLabel === 'string' && optionB.trapLabel.length > 0)
  assert('fixture badge option B: trapExplanation computed (adapter does not crash/gate)', optionB.trapExplanation === 'BADGE_EXPLANATION_MARKER')

  assert('fixture row option C: trapSuspension passthrough is {level:"row", reason:...}', optionC.trapSuspension?.level === 'row' && optionC.trapSuspension?.reason === 'structuralIncompleteness')
  assert('fixture row option C: trapExplanation still computed by the adapter (ROW_EXPLANATION_MARKER field was present)', optionC.trapExplanation === 'ROW_EXPLANATION_MARKER')

  assert('fixture control option D (unsuspended): trapSuspension is null', optionD.trapSuspension === null)
  assert('fixture control option D (unsuspended): trapLabel present', typeof optionD.trapLabel === 'string' && optionD.trapLabel.length > 0)
  assert('fixture control option D (unsuspended): trapExplanation present', optionD.trapExplanation === 'CONTROL_EXPLANATION_MARKER')
}

// ── PaperAssetAnalysisPanel.tsx (panel) — static source check ─────────────
// This repo's convention for .tsx display logic (verify-analysis-layering.mjs,
// verify-reading-analysis-retire.mjs): "no jsdom/testing-library harness
// exists" for these panels, so gating logic is proven by source assertion
// here, and REAL rendered behavior (badge hides the type badge, keeps the
// explanation; a normal option still shows its badge) is proven in DP-2
// (docs/cuts/r2-trap-audit/qa/dp2-r2-trap-audit.mjs) against real corpus
// data (paper-2023-i's one confirmed rogueType/badge record). The `row`
// level has zero real instances in the corpus today (this cut's own scan:
// structuralIncompleteness hit 0/1395) — DP-2 cannot behaviorally exercise
// a case that does not exist on disk, so this static check is the only
// proof available for the row branch until a real one appears; noted as a
// self-review blind spot in the completion report.
{
  const panelSrc = readFileSync(path.join(rootDir, 'app/src/features/paper-intelligence/PaperAssetAnalysisPanel.tsx'), 'utf8')
  assert(
    'PaperAssetAnalysisPanel.tsx reads option.trapSuspension (gating lives here, not the adapter)',
    panelSrc.includes('option.trapSuspension'),
  )
  assert(
    'PaperAssetAnalysisPanel.tsx hides the type badge for badge/row suspension',
    /hideTypeBadgeAndMeta[\s\S]{0,80}option\.trapLabel/.test(panelSrc) || /!hideTypeBadgeAndMeta && option\.trapLabel/.test(panelSrc),
  )
  assert(
    'PaperAssetAnalysisPanel.tsx skips the ENTIRE trap detail block for row-level suspension (整行不显)',
    /hideTrapDetailEntirely \? null/.test(panelSrc),
  )
}

// ── analysisText.mjs (server) — real module, temp on-disk fixture ─────────

{
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'r2-trap-audit-analysistext-'))
  try {
    const groupId = 'group-fixture-reading-a'
    const questionId = 'q-fixture-021'
    const paperDir = path.join(tempRoot, 'paper-fixture-r2', 'latest')
    mkdirSync(path.join(paperDir, 'analyses'), { recursive: true })
    writeFileSync(
      path.join(paperDir, 'paper-asset.json'),
      JSON.stringify(buildFixtureAsset(groupId, questionId)),
    )
    writeFileSync(
      path.join(paperDir, 'analyses', 'reading-choice-analysis-v1.json'),
      JSON.stringify(buildFixtureAnalysis(groupId, questionId)),
    )

    const { loadGroupAnalysisTexts } = await import('../server/draft-paper/analysisText.mjs')
    const texts = loadGroupAnalysisTexts(
      [{ detail: { id: groupId, groupType: 'reading', questions: [{ id: questionId }] } }],
      { paperAssetsDir: tempRoot },
    )
    const text = texts.get(questionId) || ''
    assert('analysisText: badge-suspended option B explanation IS included ("干扰项：" line)', text.includes('BADGE_EXPLANATION_MARKER'))
    assert('analysisText: row-suspended option C explanation is EXCLUDED', !text.includes('ROW_EXPLANATION_MARKER'))
    assert('analysisText: unsuspended option D explanation IS included', text.includes('CONTROL_EXPLANATION_MARKER'))
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

// ============================================================
// 5. Real-module behavior — actual live corpus (the one confirmed rogueType case)
// ============================================================

{
  const paperId = 'paper-2023-i'
  const questionId = 'q-2023-i-025'
  const assetPath = path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json')
  const analysisPath = path.join(paperAssetsDir, paperId, 'latest', 'analyses', 'reading-choice-analysis-v1.json')
  if (existsSync(assetPath) && existsSync(analysisPath)) {
    const asset = readJson(assetPath)
    const analysis = readJson(analysisPath)
    const groupId = Object.entries(asset.content.groups).find(([, g]) => g.questionIds?.includes(questionId))?.[0]
    assert(`${paperId}: owning reading group found for ${questionId}`, Boolean(groupId))
    if (groupId) {
      const { buildPaperAssetSurfaceModel } = await import('../app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts')
      const model = buildPaperAssetSurfaceModel({ asset, analysis, groupId })
      const optionB = model.analysisByQuestionId[questionId]?.options.find((o) => o.label === 'B')
      assert(
        `${paperId}/${questionId}/B (live rogueType/badge record): trapSuspension passthrough is {level:'badge', reason:'rogueType'}`,
        optionB?.trapSuspension?.level === 'badge' && optionB?.trapSuspension?.reason === 'rogueType',
      )
      assert(
        `${paperId}/${questionId}/B (live rogueType/badge record): trapExplanation non-empty (describeTrap did not crash on the rogue primaryType)`,
        typeof optionB?.trapExplanation === 'string' && optionB.trapExplanation.length > 0,
      )
      // The type badge/兼有/细分 hiding itself is PaperAssetAnalysisPanel.tsx's
      // gating decision, not this adapter's — proven against this exact real
      // record in DP-2 (dp2-r2-trap-audit.mjs's ① scenario, real browser).
    }
  } else {
    assert(`${paperId}: fixture paper present for live-corpus badge assertion`, false, 'paper-2023-i missing — update this block if the corpus paper set changed')
  }
}

// ============================================================

console.log(`\n${passed} passed, ${failed} failed.`)
if (failed > 0) process.exit(1)
console.log('r2-trap-audit verify passed.')
