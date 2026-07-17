#!/usr/bin/env node
/**
 * verify-r2-trap-audit.mjs — r2-trap-audit cut (docs/cuts/r2-trap-audit/plan.md
 * Scope 步骤 4), updated post rulings.md 判例战役收官 (2026-07-16, CL-1~CL-7).
 *
 * Groups of assertions:
 *   1. Recomputability, whitelist-adjusted — re-running the same read-only
 *      judgment logic (trap-audit-lib.mjs) against the live
 *      app/public/paper-assets corpus, MINUS any hit that
 *      docs/cuts/r2-trap-audit/adjudications.json marks as owner-adjudicated
 *      (rulings.md CL-1: legitimate quote-of-original-text-for-contrast,
 *      still mechanically indistinguishable from a real word-hook after the
 *      R6 fix), reproduces the committed scan-findings.json byte-for-byte
 *      (modulo key order); scan-report.md's headline counts match. This is
 *      the "报告数字必须可由 findings.json 复算" requirement, now adjudication-
 *      aware since the scanner itself filters adjudicated hits out of
 *      scan-findings.json (trap-audit-scan.mjs).
 *   2. Applied-batch integrity — for every RAW (pre-whitelist) auto-suspend-
 *      eligible finding: if it is owner-adjudicated, the ruling already
 *      resolved it (回牌 = suspension removed, label kept; no live
 *      auto-suspend-eligible finding in this corpus is currently an
 *      unresolved improve-type ruling), so it must have NO suspension left;
 *      otherwise it must still carry a legal suspension (level/reason). Every
 *      evidenceFieldLeak finding has NOT been suspended regardless (owner-
 *      review-only bucket, plan.md Forbidden boundary).
 *   3. Adjudications integrity — every entry in adjudications.json points to
 *      a `ruling` (CL-N) that actually exists as a "### CL-N" heading in
 *      rulings.md, and the exact (paperId/questionId/optionLabel/checkId)
 *      it names is still a real raw hit of evaluateOption() against the live
 *      corpus (the whitelist entry isn't stale / doesn't reference a record
 *      that no longer produces that hit).
 *   4. Recast trap structural completeness — the five trap objects rulings.md
 *      改判 into a different primaryType (2023-yi/q024-D, 2025-ii/q032-D,
 *      960d0f8d/q026-C → sourceLexicalTrap; zj-2020-jan/q021-C →
 *      entityMismatch; 2023-i/q025-B → unsupportedClaim) each pass
 *      structuralIncompletenessFields() with zero missing fields (reusing
 *      trap-audit-lib.mjs's own per-type shape, so this can never drift from
 *      what the scanner itself checks).
 *   5. Zero suspension left in the whole corpus — all 8 items in the ruling
 *      batch (rulings.md「本批处置清单」) had their `suspension` field
 *      removed, whether the disposition was 回牌 (label kept) or 改判
 *      (trap object recast); no other item in the corpus was ever suspended
 *      (plan.md step 3 auto-suspend batch was exactly these 8).
 *   6. Real-module behavior, against a self-contained synthetic fixture so
 *      this proof does not depend on what the current corpus happens to
 *      contain (the corpus itself has zero live suspended records post-
 *      ruling) — `buildPaperAssetSurfaceModel` (client adapter) is a PLAIN
 *      PASSTHROUGH (plan.md contract: adapter only transmits `trapSuspension`,
 *      it never hides trapLabel/trapExplanation/etc. itself — that gating
 *      decision belongs to the consumer) plus a general (suspension-agnostic)
 *      crash fix for an unrecognized primaryType. PaperAssetAnalysisPanel.tsx
 *      (the actual gating owner) is checked by static source assertion here
 *      (repo convention for .tsx display logic with no jsdom harness) and by
 *      real rendered behavior in DP-2. `loadGroupAnalysisTexts` (server
 *      analysisText.mjs, which does its own gating directly) is checked as a
 *      real module call: skips a row-suspended option's explanation from the
 *      "干扰项：" line, keeps a badge-suspended one. This fixture is the ONLY
 *      proof of the suspension-gating mechanism now that the corpus has no
 *      live suspended record — the mechanism itself is untouched by this
 *      cut's data rulings, just currently unexercised by real data (noted in
 *      the completion report as an intentional, not accidental, gap).
 */

import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  AUTO_SUSPEND_CHECK_IDS,
  CHECK_IDS,
  evaluateOption,
  structuralIncompletenessFields,
} from './trap-audit-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const paperAssetsDir = path.join(rootDir, 'app', 'public', 'paper-assets')
const cutDir = path.join(rootDir, 'docs', 'cuts', 'r2-trap-audit')
const findingsPath = path.join(cutDir, 'scan-findings.json')
const reportPath = path.join(cutDir, 'scan-report.md')
const adjudicationsPath = path.join(cutDir, 'adjudications.json')
const rulingsPath = path.join(cutDir, 'rulings.md')

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

const adjudications = existsSync(adjudicationsPath) ? readJson(adjudicationsPath) : []
function isAdjudicated(finding) {
  return adjudications.some((item) => item.paperId === finding.paperId
    && item.questionId === finding.questionId
    && item.optionLabel === finding.optionLabel
    && item.checkId === finding.checkId)
}

const rawLiveFindings = []
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
        rawLiveFindings.push({
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

// scan-findings.json is written AFTER the scanner filters out adjudicated
// hits (trap-audit-scan.mjs) — so the committed file only ever contains
// unresolved findings. Reproduce that same filter here before comparing.
const liveFindings = rawLiveFindings.filter((f) => !isAdjudicated(f))

assert('scan-findings.json exists (committed by trap-audit-scan.mjs)', existsSync(findingsPath))
assert('scan-report.md exists (committed by trap-audit-scan.mjs)', existsSync(reportPath))

if (existsSync(findingsPath)) {
  const committedFindings = readJson(findingsPath)
  const normalize = (list) => list
    .map((f) => JSON.stringify(f, Object.keys(f).sort()))
    .sort()
  assert(
    'live corpus re-scan (whitelist-filtered) reproduces committed scan-findings.json exactly (recomputability)',
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
// 2. Applied-batch integrity on the live corpus (RAW findings, pre-whitelist)
// ============================================================

const LEGAL_LEVELS = new Set(['badge', 'row'])
const LEGAL_REASONS = new Set(Object.values(CHECK_IDS))

for (const finding of rawLiveFindings) {
  const analysisPath = path.join(paperAssetsDir, finding.paperId, 'latest', 'analyses', 'reading-choice-analysis-v1.json')
  const analysis = readJson(analysisPath)
  const option = analysis.questions?.[finding.questionId]?.optionAnalysis?.find((item) => item.label === finding.optionLabel)
  const suspension = option?.trap?.suspension
  const label = `${finding.paperId}/${finding.questionId}/${finding.optionLabel} (${finding.checkId})`

  if (!AUTO_SUSPEND_CHECK_IDS.has(finding.checkId)) {
    // evidenceFieldLeak — plan.md Forbidden: this cut never suspends this
    // bucket, it is the second-段 owner judgment battle's job.
    assert(`${label}: evidenceFieldLeak finding is NOT auto-suspended (owner-review-only)`, !suspension)
  } else if (isAdjudicated(finding)) {
    // rulings.md CL-1: owner ruled this a false-positive-shaped edge case —
    // 回牌, suspension removed, label/content kept as-is.
    assert(`${label}: owner-adjudicated finding (rulings.md) has had its suspension removed (回牌)`, !suspension)
  } else {
    assert(`${label}: auto-suspend-eligible finding has a suspension field`, Boolean(suspension))
    if (suspension) {
      assert(`${label}: suspension.level is legal (badge|row)`, LEGAL_LEVELS.has(suspension.level), `got ${suspension.level}`)
      assert(`${label}: suspension.reason is a legal checkId`, LEGAL_REASONS.has(suspension.reason), `got ${suspension.reason}`)
      assert(`${label}: suspension.reason matches this finding's checkId`, suspension.reason === finding.checkId)
      assert(`${label}: suspension.level matches this finding's judged level`, suspension.level === finding.level)
    }
  }
}

// versions/ untouched — this cut only ever reads/writes latest/.
const versionsDirs = listPaperIds()
  .map((paperId) => path.join(paperAssetsDir, paperId, 'versions'))
  .filter((dir) => existsSync(dir))
assert('no versions/ directory was created or modified by this cut (none existed pre-cut; none exist now)', versionsDirs.length === 0)

// ============================================================
// 3. Adjudications integrity (docs/cuts/r2-trap-audit/adjudications.json)
// ============================================================

const rulingsText = existsSync(rulingsPath) ? readFileSync(rulingsPath, 'utf8') : ''
for (const item of adjudications) {
  const label = `${item.paperId}/${item.questionId}/${item.optionLabel} (${item.checkId})`
  assert(
    `adjudication ${label}: ruling pointer "${item.ruling}" exists as a "### ${item.ruling} " heading in rulings.md`,
    new RegExp(`^### ${item.ruling} `, 'm').test(rulingsText),
  )
  assert(
    `adjudication ${label}: still a real raw hit of evaluateOption() against the live corpus (not stale)`,
    rawLiveFindings.some((f) => f.paperId === item.paperId
      && f.questionId === item.questionId
      && f.optionLabel === item.optionLabel
      && f.checkId === item.checkId),
  )
}

// ============================================================
// 4. Recast trap structural completeness (rulings.md 改判 ×5)
// ============================================================

const recastTargets = [
  { paperId: 'paper-2023-yi', questionId: 'q-2023-yi-024', optionLabel: 'D', primaryType: 'sourceLexicalTrap', ruling: 'CL-2' },
  { paperId: 'paper-2025-ii', questionId: 'q-2025-ii-032', optionLabel: 'D', primaryType: 'sourceLexicalTrap', ruling: 'CL-3' },
  { paperId: 'paper-960d0f8d', questionId: 'q-960d0f8d-026', optionLabel: 'C', primaryType: 'sourceLexicalTrap', ruling: 'CL-4' },
  { paperId: 'paper-zj-2020-jan', questionId: 'q-zj-2020-jan-021', optionLabel: 'C', primaryType: 'entityMismatch', ruling: 'CL-5' },
  { paperId: 'paper-2023-i', questionId: 'q-2023-i-025', optionLabel: 'B', primaryType: 'unsupportedClaim', ruling: 'CL-7' },
]

for (const target of recastTargets) {
  const analysisPath = path.join(paperAssetsDir, target.paperId, 'latest', 'analyses', 'reading-choice-analysis-v1.json')
  const analysis = readJson(analysisPath)
  const option = analysis.questions?.[target.questionId]?.optionAnalysis?.find((item) => item.label === target.optionLabel)
  const trap = option?.trap
  const label = `${target.paperId}/${target.questionId}/${target.optionLabel} (${target.ruling})`
  assert(`recast ${label}: trap.primaryType is now "${target.primaryType}"`, trap?.primaryType === target.primaryType)
  assert(`recast ${label}: no missing/invalid fields per ${target.primaryType}'s sub-schema`, structuralIncompletenessFields(trap).length === 0, `missing: ${JSON.stringify(structuralIncompletenessFields(trap))}`)
  assert(`recast ${label}: no suspension left (改判 lifts the badge)`, !trap?.suspension)
  if (target.primaryType === 'unsupportedClaim') {
    assert(`recast ${label}: explanation carries no quoted-English-hook (would re-trigger labelExplanationContradiction)`, !evaluateOption(option).some((h) => h.checkId === CHECK_IDS.LABEL_EXPLANATION_CONTRADICTION))
  }
}

// ============================================================
// 5. Zero suspension left anywhere in the corpus
// ============================================================

let liveSuspensionCount = 0
for (const paperId of listPaperIds()) {
  const analysisPath = path.join(paperAssetsDir, paperId, 'latest', 'analyses', 'reading-choice-analysis-v1.json')
  if (!existsSync(analysisPath)) continue
  const analysis = readJson(analysisPath)
  for (const question of Object.values(analysis.questions || {})) {
    for (const option of question.optionAnalysis || []) {
      if (option?.trap?.suspension) liveSuspensionCount += 1
    }
  }
}
assert('zero suspension records left in the live corpus (all 8 batch items resolved by rulings.md)', liveSuspensionCount === 0, `found ${liveSuspensionCount}`)

// ============================================================
// 6. Real-module behavior — self-contained synthetic fixture
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
// 7. Real-module behavior — actual live corpus, the CL-7 recast record
//    (paper-2023-i/q-2023-i-025/B: was the corpus's one confirmed rogueType/
//    badge record pre-ruling; rulings.md CL-7 改判 it to unsupportedClaim
//    and lifted the suspension — this now proves the adapter still renders
//    it cleanly with NO suspension passthrough, not a synthetic stand-in)
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
        `${paperId}/${questionId}/B (CL-7 recast record, post-ruling): trapSuspension is null (badge lifted)`,
        optionB?.trapSuspension === null,
      )
      assert(
        `${paperId}/${questionId}/B (CL-7 recast record, post-ruling): trapExplanation non-empty (describeTrap does not crash on the recast unsupportedClaim shape)`,
        typeof optionB?.trapExplanation === 'string' && optionB.trapExplanation.length > 0,
      )
      assert(
        `${paperId}/${questionId}/B (CL-7 recast record, post-ruling): trapLabel present (type badge no longer suppressed)`,
        typeof optionB?.trapLabel === 'string' && optionB.trapLabel.length > 0,
      )
    }
  } else {
    assert(`${paperId}: fixture paper present for live-corpus recast assertion`, false, 'paper-2023-i missing — update this block if the corpus paper set changed')
  }
}

// ============================================================

console.log(`\n${passed} passed, ${failed} failed.`)
if (failed > 0) process.exit(1)
console.log('r2-trap-audit verify passed.')
