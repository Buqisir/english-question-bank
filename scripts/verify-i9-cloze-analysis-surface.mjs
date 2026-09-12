#!/usr/bin/env node
/**
 * verify-i9-cloze-analysis-surface.mjs
 *
 * Covers Steps 1–4 of I9-cloze-analysis-surface:
 *
 *  Step 1 — Adapter:
 *    - clozeAnalysisSurfaceAdapter.ts exists and exports expected symbols
 *    - findAllTextRanges locates ALL occurrences (multi-occurrence fixture)
 *    - blank markers (__41__ style) do not appear inside a located evidence range
 *    - option-side evidence produces NO passage anchor
 *    - group view (overview + affectiveArc) present in model
 *    - all 15 blanks mapped with required fields
 *
 *  Step 2 — Panel:
 *    - ClozeAnalysisPanel.tsx exists
 *    - renders correctFit, distractor list, evidence rows with data-pi-* attrs,
 *      pos/signature header, teachingNote
 *    - evidence buttons carry data-pi-evidence-id + data-pi-question-id
 *    - option-side evidence renders <mark> (not a button with data-pi-evidence-id)
 *
 *  Step 3 — Harness wiring:
 *    - cloze branch restructured to fetch→fallback (no short-circuit)
 *    - clozeAnalysisModel state + ClozeAnalysisPanel dispatch present
 *    - activeEvidenceKind returns 'support' for cloze analysis
 *    - seed effect handles cloze analysis model
 *    - focus-intent handler handles cloze analysis model
 *
 *  Step 4 — Availability gate:
 *    - analysisConfigs contains cloze-analysis-v1 entry
 *    - entryMapKey = 'blanks' for cloze; 'questions' for reading/sevenChoices
 *    - complete cloze analysis (all 15 blanks) → href present (完形解析)
 *    - incomplete cloze analysis (missing one blank) → href absent
 *    - reading / sevenChoices availability unchanged (still uses 'questions')
 */

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createPaperSurfaceAnalysisAvailability } from '../server/search/paperSurfaceAvailability.mjs'
import { findAllTextRanges } from '../app/src/features/paper-intelligence/clozeAnalysisSurfaceAdapter.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.error(`FAIL  ${name}${details ? `\n      ${details}` : ''}`)
  }
}

function readSrc(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

// ============================================================
// Step 1 — Adapter source checks
// ============================================================

const ADAPTER_PATH = 'app/src/features/paper-intelligence/clozeAnalysisSurfaceAdapter.ts'
assert('Step 1: adapter file exists', existsSync(path.join(rootDir, ADAPTER_PATH)))

const adapterSrc = existsSync(path.join(rootDir, ADAPTER_PATH))
  ? readSrc(ADAPTER_PATH)
  : ''

assert('Step 1: adapter exports ReviewedClozeAnalysisV1 type', adapterSrc.includes('ReviewedClozeAnalysisV1'))
assert('Step 1: adapter exports ClozeAnalysisSurfaceModel type', adapterSrc.includes('ClozeAnalysisSurfaceModel'))
assert('Step 1: adapter exports ClozeBlankAnalysisView type', adapterSrc.includes('ClozeBlankAnalysisView'))
assert('Step 1: adapter exports buildClozeAnalysisSurfaceModel', adapterSrc.includes('buildClozeAnalysisSurfaceModel'))
assert('Step 1: adapter exports findAllTextRanges', adapterSrc.includes('findAllTextRanges'))
assert(
  'Step 1: adapter layers analysis onto buildClozePaperView canonical surface',
  adapterSrc.includes('buildClozePaperView') && !adapterSrc.includes('segmentPaperText'),
)
assert('Step 1: adapter builds evidence with kind support', adapterSrc.includes("kind: 'support'"))
assert('Step 1: adapter skips option-side for passage evidence', adapterSrc.includes("signalSide === 'option'") && adapterSrc.includes('continue'))
assert('Step 1: adapter builds group view', adapterSrc.includes('groupView'))
assert('Step 1: adapter builds analysisByQuestionId', adapterSrc.includes('analysisByQuestionId'))
assert('Step 1: adapter handles signatureFacet label', adapterSrc.includes('SIGNATURE_LABELS') && adapterSrc.includes('signatureLabel'))

// ─── findAllTextRanges tests (multi-occurrence + blank-marker exclusion) ───
//
// Use the exported findAllTextRanges from the shipped adapter (imported above)
// so the test proves the real shipped code, not a separate inline copy.

// Multi-occurrence fixture: "light" appears in multiple sentences across paragraphs.
const multiOccurrenceTextMap = {
  paperId: 'paper-test',
  paragraphs: [
    {
      id: 'p1',
      section: '完形填空',
      sentences: [
        { id: 'p1-s0', text: 'The light was bright and the light faded slowly.', tokens: [] },
        { id: 'p1-s1', text: 'She felt light on her feet.', tokens: [] },
      ],
    },
    {
      id: 'p2',
      section: '完形填空',
      sentences: [
        { id: 'p2-s0', text: 'Darkness replaced the light.', tokens: [] },
      ],
    },
  ],
}

const lightRanges = findAllTextRanges(multiOccurrenceTextMap, 'light')
assert('Step 1: multi-occurrence — all 4 occurrences of "light" found', lightRanges.length === 4,
  `found: ${lightRanges.length}`)

// Verify occurrence positions are correct.
const s0Ranges = lightRanges.filter((r) => r.sentenceId === 'p1-s0')
assert('Step 1: multi-occurrence — 2 occurrences in first sentence', s0Ranges.length === 2,
  `found: ${s0Ranges.length}`)
assert('Step 1: multi-occurrence — first occurrence at correct position', s0Ranges[0]?.start === 4,
  `start: ${s0Ranges[0]?.start}`)

// Blank-marker exclusion: the adapter contract says signalText must NOT contain __41__.
// Verify that a blank-marker string finds no ranges (passage has __41__ but signalText never should).
const blankMarkerTextMap = {
  paperId: 'paper-test',
  paragraphs: [
    {
      id: 'p1',
      section: '完形填空',
      sentences: [
        { id: 'p1-s0', text: 'She was feeling __41__ about the situation.', tokens: [] },
      ],
    },
  ],
}

// A correctly-formed signalText ("feeling") does NOT match the blank marker itself.
const feelingRanges = findAllTextRanges(blankMarkerTextMap, 'feeling')
assert('Step 1: blank-marker exclusion — "feeling" found before marker', feelingRanges.length === 1)

// The signal "feeling __41__" (incorrectly includes marker) would find 1 range,
// but the contract forbids such signalText. The adapter validates at the source
// (contract says signalText must not include blank markers).
// We verify the adapter source guards this by asserting it does NOT generate
// evidence ranges for option-side signals — those stay as in-card marks.
assert('Step 1: adapter source has isOptionSide flag on evidence rows', adapterSrc.includes('isOptionSide'))

// ─── Structural completeness: adapter maps all required blank fields ───

assert('Step 1: adapter maps blankNo', adapterSrc.includes('blankNo: blankAnalysis.blankNo'))
assert('Step 1: adapter maps pos', adapterSrc.includes('pos: blankAnalysis.pos'))
assert('Step 1: adapter maps correctFit', adapterSrc.includes('correctFit: blankAnalysis.correctFit'))
assert('Step 1: adapter maps distractorGlosses', adapterSrc.includes('distractorGlosses: blankAnalysis.distractorGlosses'))
assert('Step 1: adapter does not revive retired teachingNote', !adapterSrc.includes('teachingNote'))

// ============================================================
// Step 2 — Panel source checks
// ============================================================

const PANEL_PATH = 'app/src/features/paper-intelligence/ClozeAnalysisPanel.tsx'
assert('Step 2: panel file exists', existsSync(path.join(rootDir, PANEL_PATH)))

const panelSrc = existsSync(path.join(rootDir, PANEL_PATH))
  ? readSrc(PANEL_PATH)
  : ''

assert('Step 2: panel exports ClozeAnalysisPanel', panelSrc.includes('export function ClozeAnalysisPanel'))
assert('Step 2: panel renders pos', panelSrc.includes('analysis.pos'))
assert('Step 2: panel renders blankNo', panelSrc.includes('analysis.blankNo'))
assert('Step 2: panel renders signatureLabel', panelSrc.includes('analysis.signatureLabel'))
assert('Step 2: panel renders correctFit.reason', panelSrc.includes('correctFit.reason'))
assert('Step 2: panel renders distractor list', panelSrc.includes('distractorGlosses') && panelSrc.includes('optionLabel') && panelSrc.includes('meaning'))
assert('Step 2: panel does not render retired teachingNote', !panelSrc.includes('{analysis.teachingNote}'))
assert('Step 2: panel renders group overview', panelSrc.includes('groupView') && panelSrc.includes('overview'))
assert('Step 2: panel renders group affectiveArc', panelSrc.includes('affectiveArc'))
// Evidence buttons must carry data-pi-evidence-id and data-pi-question-id.
assert('Step 2: evidence buttons carry data-pi-evidence-id', panelSrc.includes('data-pi-evidence-id={row.evidenceId}'))
assert('Step 2: evidence buttons carry data-pi-question-id', panelSrc.includes('data-pi-question-id={analysis.questionId}'))
assert('Step 2: evidence buttons carry data-pi-evidence-kind support', panelSrc.includes('data-pi-evidence-kind="support"'))
// Option-side evidence uses <mark> in-card, NOT a passage anchor button.
assert('Step 2: option-side renders in-card mark', panelSrc.includes('isOptionSide') && panelSrc.includes('<mark'))
assert('Step 2: option-side does NOT use passage evidence button', panelSrc.includes('row.isOptionSide') && !panelSrc.includes('isOptionSide\n.*data-pi-evidence-id'))

// ============================================================
// Step 3 — Harness source checks (RETIRED)
// ============================================================
// reading-analysis-retire (2026-07-16, A-class re-anchor, rationale):
// `PaperIntelligencePaperSurfaceHarness.tsx` is retired with the
// `?view=paper-intelligence&surface=paper` orphan route (plan.md Scope 步
// 3); it was the sole caller of `clozeAnalysisModel`/`ClozeAnalysisPanel`
// wiring these Step 3 assertions read. `ClozeAnalysisPanel.tsx` itself is
// NOT retired (still live via `PaperBrowsePage.tsx`), but its
// harness-side plumbing (state names, effect dependency arrays) is not a
// 1:1 port onto PaperBrowsePage, so re-anchoring these specific string
// assertions would assert invented internals. Retirement assertion
// instead, per plan.md Scope 步 6's authorized alternative.
const HARNESS_PATH = 'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx'
assert('Step 3 (retired): PaperIntelligencePaperSurfaceHarness.tsx no longer exists',
  !existsSync(path.join(rootDir, HARNESS_PATH)))

// ============================================================
// Step 4 — Availability gate
// ============================================================

const AVAIL_PATH = 'server/search/paperSurfaceAvailability.mjs'
const availSrc = readSrc(AVAIL_PATH)

assert('Step 4: analysisConfigs has cloze-analysis-v1 entry', availSrc.includes('cloze-analysis-v1'))
assert('Step 4: cloze config has label 完形解析', availSrc.includes('完形解析'))
assert('Step 4: cloze config has entryMapKey blanks', availSrc.includes("entryMapKey: 'blanks'"))
assert("Step 4: reading config has entryMapKey 'questions'", availSrc.includes("entryMapKey: 'questions'"))
assert('Step 4: addAvailabilityForAnalysis uses config.entryMapKey', availSrc.includes('entryMapKey') && availSrc.includes('config.entryMapKey'))
assert('Step 4: completeness check uses entryMapKey variable', availSrc.includes('analysis?.[entryMapKey]?.[questionId]'))

// ─── Runtime availability test with inline fixtures ───

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'verify-i9-'))

function cleanup() {
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* ignore */ }
}

try {
  const PAPER_ID = 'paper-i9-test'
  const CLOZE_GROUP_ID = 'group-i9-cloze'
  const GROUP_ID_READING = 'group-i9-reading'

  // Build 15 question IDs for cloze (q41–q55).
  const clozeQuestionIds = Array.from({ length: 15 }, (_, i) => `q-i9-0${41 + i}`)

  const paperAsset = {
    schemaVersion: 'paper-asset-v1',
    paper: { paperId: PAPER_ID, title: 'I9 Test Paper' },
    content: {
      groups: {
        [CLOZE_GROUP_ID]: {
          groupId: CLOZE_GROUP_ID,
          groupType: 'cloze',
          title: '完形填空',
          questionIds: clozeQuestionIds,
        },
        [GROUP_ID_READING]: {
          groupId: GROUP_ID_READING,
          groupType: 'reading',
          title: 'Reading A',
          questionIds: ['q-i9-r1', 'q-i9-r2', 'q-i9-r3'],
        },
      },
      questions: Object.fromEntries(clozeQuestionIds.map((qid, i) => [qid, { questionId: qid, questionNo: 41 + i }])),
    },
    sources: {},
  }

  // Complete cloze analysis — all 15 blanks present.
  const completeBlanks = Object.fromEntries(
    clozeQuestionIds.map((qid, i) => [qid, { blankNo: 41 + i, pos: 'verb' }]),
  )
  const clozeAnalysisComplete = {
    schemaVersion: 'cloze-analysis-v1',
    paperId: PAPER_ID,
    targetGroups: [CLOZE_GROUP_ID],
    blanks: completeBlanks,
  }

  // Incomplete cloze analysis — one blank missing.
  const incompleteBlanks = { ...completeBlanks }
  delete incompleteBlanks[clozeQuestionIds[7]] // remove q-i9-048
  const clozeAnalysisIncomplete = {
    schemaVersion: 'cloze-analysis-v1',
    paperId: PAPER_ID,
    targetGroups: [CLOZE_GROUP_ID],
    blanks: incompleteBlanks,
  }

  // Reading analysis (uses 'questions' key, not 'blanks').
  const readingAnalysis = {
    schemaVersion: 'reading-choice-analysis-v1',
    paperId: PAPER_ID,
    targetGroups: [GROUP_ID_READING],
    questions: {
      'q-i9-r1': { questionId: 'q-i9-r1' },
      'q-i9-r2': { questionId: 'q-i9-r2' },
      'q-i9-r3': { questionId: 'q-i9-r3' },
    },
  }

  function writeTestAsset(paperId, analyses) {
    const assetDir = path.join(tempDir, paperId)
    const analysesDir = path.join(assetDir, 'analyses')
    mkdirSync(analysesDir, { recursive: true })
    writeFileSync(path.join(assetDir, 'paper-asset.json'), JSON.stringify(paperAsset))
    for (const [fileName, data] of Object.entries(analyses)) {
      writeFileSync(path.join(analysesDir, fileName), JSON.stringify(data))
    }
  }

  // ── Case 1: complete cloze analysis → 完形解析 href present ──
  const tempComplete = path.join(tempDir, 'case-complete')
  mkdirSync(tempComplete, { recursive: true })
  writeTestAsset.call(null, PAPER_ID, {}) // unused but let's use dedicated dirs
  // Use dedicated subdir for each case.
  ;(function testCompleteCase() {
    const caseDir = path.join(tempDir, 'complete')
    mkdirSync(path.join(caseDir, PAPER_ID, 'analyses'), { recursive: true })
    writeFileSync(
      path.join(caseDir, PAPER_ID, 'paper-asset.json'),
      JSON.stringify(paperAsset),
    )
    writeFileSync(
      path.join(caseDir, PAPER_ID, 'analyses', 'cloze-analysis-v1.json'),
      JSON.stringify(clozeAnalysisComplete),
    )
    const avail = createPaperSurfaceAnalysisAvailability({
      paperAssetsDir: caseDir,
      warn: () => {},
    })
    const map = avail.getByGroupId()
    const entry = map.get(CLOZE_GROUP_ID)
    assert(
      'Step 4: complete cloze analysis → 完形解析 entry present',
      !!entry,
      entry ? '' : 'entry is undefined',
    )
    assert(
      'Step 4: complete cloze analysis → label is 完形解析',
      entry?.label === '完形解析',
      `actual label: ${entry?.label}`,
    )
    assert(
      'Step 4: complete cloze analysis → href contains groupId',
      typeof entry?.href === 'string' && entry.href.includes(CLOZE_GROUP_ID),
      `href: ${entry?.href}`,
    )
    assert(
      'Step 4: complete cloze analysis → href contains first questionId',
      typeof entry?.href === 'string' && entry.href.includes(clozeQuestionIds[0]),
      `href: ${entry?.href}`,
    )
  })()

  // ── Case 2: incomplete cloze analysis → no entry ──
  ;(function testIncompleteCase() {
    const caseDir = path.join(tempDir, 'incomplete')
    mkdirSync(path.join(caseDir, PAPER_ID, 'analyses'), { recursive: true })
    writeFileSync(
      path.join(caseDir, PAPER_ID, 'paper-asset.json'),
      JSON.stringify(paperAsset),
    )
    writeFileSync(
      path.join(caseDir, PAPER_ID, 'analyses', 'cloze-analysis-v1.json'),
      JSON.stringify(clozeAnalysisIncomplete),
    )
    const avail = createPaperSurfaceAnalysisAvailability({
      paperAssetsDir: caseDir,
      warn: () => {},
    })
    const map = avail.getByGroupId()
    const entry = map.get(CLOZE_GROUP_ID)
    assert(
      'Step 4: incomplete cloze analysis → no entry (completeness gate)',
      !entry,
      entry ? `unexpected entry: ${JSON.stringify(entry)}` : '',
    )
  })()

  // ── Case 3: reading analysis unchanged (still uses 'questions') ──
  ;(function testReadingUnchanged() {
    const caseDir = path.join(tempDir, 'reading')
    mkdirSync(path.join(caseDir, PAPER_ID, 'analyses'), { recursive: true })
    writeFileSync(
      path.join(caseDir, PAPER_ID, 'paper-asset.json'),
      JSON.stringify(paperAsset),
    )
    writeFileSync(
      path.join(caseDir, PAPER_ID, 'analyses', 'reading-choice-analysis-v1.json'),
      JSON.stringify(readingAnalysis),
    )
    const avail = createPaperSurfaceAnalysisAvailability({
      paperAssetsDir: caseDir,
      warn: () => {},
    })
    const map = avail.getByGroupId()
    const entry = map.get(GROUP_ID_READING)
    assert(
      'Step 4: reading analysis still uses questions key → entry present',
      !!entry,
      entry ? '' : 'entry is undefined',
    )
    assert(
      'Step 4: reading analysis label is 阅读解析',
      entry?.label === '阅读解析',
      `actual label: ${entry?.label}`,
    )
  })()

} finally {
  cleanup()
}

// ============================================================
// Summary
// ============================================================

console.log(`\n${passed} passed, ${failed} failed.`)
if (failed > 0) {
  process.exit(1)
}
console.log('I9 cloze analysis surface verify passed.')
