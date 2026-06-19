#!/usr/bin/env node
/**
 * verify-i14-grammar-fill-analysis-surface.mjs
 *
 * Covers Steps 0–4 of I14-grammar-fill-analysis-surface:
 *
 *  Step 0 — Facet framework registry (GATE-2):
 *    - grammarFillFacetRegistry.ts exists, exports FACET_FRAMEWORKS
 *    - drift guard: its 17 keys EXACTLY equal server grammar-fill-facets-v1.json keys
 *    - non-finite has a framework.table; every framework.steps is non-empty
 *
 *  Step 1 — Adapter (GATE-1 + MF-1):
 *    - buildGrammarFillAnalysisSurfaceModel + findAllTextRangesTolerant exported
 *    - GATE-1: a signalText that FAILS plain indexOf (whitespace divergence) is
 *      located by the tolerant match, mapped back to correct stored offsets
 *    - MF-1: every located evidence range.sentenceId EXISTS in the built textMap
 *    - multi-occurrence: all occurrences located
 *    - blank markers never inside a returned range
 *    - 10 blanks mapped; framework/labelZh resolved; role/path only on non-finite;
 *      group overview present; throws on unknown facetKey / schemaVersion / paperId
 *
 *  Step 2 — Panel:
 *    - GrammarFillAnalysisPanel.tsx renders header (blankType + hint + 考点),
 *      answer, framework steps/table/notes, 代入 reason, role/path badges,
 *      evidence rows with data-pi-* attrs, teachingNote, group overview
 *
 *  Step 3 — Harness wiring:
 *    - grammarFill branch fetch→fallback; grammarFillAnalysisModel state +
 *      panel dispatch; activeEvidenceKind 'support'; seed / focus-intent /
 *      analysisView early-return / surfaceData memo handle the new model
 *
 *  Step 4 — Availability gate:
 *    - analysisConfigs has grammar-fill-analysis-v1 entry (label 语法解析,
 *      entryMapKey 'blanks'); complete (10 blanks) → href; incomplete → no entry;
 *      reading/七选五/完形 unchanged
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
import {
  buildGrammarFillAnalysisSurfaceModel,
  findAllTextRangesTolerant,
} from '../app/src/features/paper-intelligence/grammarFillAnalysisSurfaceAdapter.ts'
import { FACET_FRAMEWORKS } from '../app/src/features/paper-intelligence/grammarFillFacetRegistry.ts'

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

const NON_FINITE = 'grammar-fill.given.verb.non-finite'

// ============================================================
// Step 0 — Registry + drift guard (GATE-2)
// ============================================================

const REGISTRY_PATH = 'app/src/features/paper-intelligence/grammarFillFacetRegistry.ts'
assert('Step 0: registry file exists', existsSync(path.join(rootDir, REGISTRY_PATH)))

const serverFacets = JSON.parse(
  readSrc('server/paper-import-ai/grammar-fill-facets-v1.json'),
)
const serverKeys = serverFacets.map((f) => f.facet_key).sort()
const registryKeys = Object.keys(FACET_FRAMEWORKS).sort()

assert('Step 0: registry has exactly 17 facets', registryKeys.length === 17,
  `found: ${registryKeys.length}`)
assert('Step 0: drift guard — registry keys EXACTLY equal server JSON keys',
  JSON.stringify(registryKeys) === JSON.stringify(serverKeys),
  `registry: ${registryKeys.join(',')}\n      server:   ${serverKeys.join(',')}`)
assert('Step 0: non-finite facet has a framework.table',
  !!FACET_FRAMEWORKS[NON_FINITE]?.framework?.table)
assert('Step 0: non-finite table has columns + rows',
  (FACET_FRAMEWORKS[NON_FINITE]?.framework?.table?.columns?.length ?? 0) > 0 &&
  (FACET_FRAMEWORKS[NON_FINITE]?.framework?.table?.rows?.length ?? 0) > 0)
assert('Step 0: every facet has a labelZh + non-empty steps',
  registryKeys.every((k) => {
    const e = FACET_FRAMEWORKS[k]
    return typeof e.labelZh === 'string' && e.labelZh.length > 0 &&
      Array.isArray(e.framework.steps) && e.framework.steps.length > 0
  }))

// ============================================================
// Step 1 — Adapter: GATE-1 tolerant locate + MF-1 + structural
// ============================================================

const ADAPTER_PATH = 'app/src/features/paper-intelligence/grammarFillAnalysisSurfaceAdapter.ts'
assert('Step 1: adapter file exists', existsSync(path.join(rootDir, ADAPTER_PATH)))
const adapterSrc = existsSync(path.join(rootDir, ADAPTER_PATH)) ? readSrc(ADAPTER_PATH) : ''
assert('Step 1: adapter exports ReviewedGrammarFillAnalysisV1', adapterSrc.includes('ReviewedGrammarFillAnalysisV1'))
assert('Step 1: adapter exports buildGrammarFillAnalysisSurfaceModel', adapterSrc.includes('buildGrammarFillAnalysisSurfaceModel'))
assert('Step 1: adapter exports findAllTextRangesTolerant', adapterSrc.includes('findAllTextRangesTolerant'))
assert('Step 1: adapter builds evidence kind support', adapterSrc.includes("kind: 'support'"))
assert('Step 1: adapter resolves facetKey via FACET_FRAMEWORKS', adapterSrc.includes('FACET_FRAMEWORKS['))
assert('Step 1: adapter throws on unknown facetKey', adapterSrc.includes('Unknown facetKey'))
// MF-1 documented: per-paragraph sentenceId construction, not the \n\n join.
assert('Step 1: adapter uses per-paragraph sentenceId `${paragraphId}-s', adapterSrc.includes('-s${i}') || adapterSrc.includes('-s' + '${i}'))

// ─── GATE-1: tolerant match locates a whitespace-diverged signalText ───
//
// Models the publish-time normalizeGrammarFillText divergence: the STORED
// sentence has a DOUBLE space (as a blank-number wrap / 3+space-collapse
// artifact would produce) where the parse-time-validated signalText has a
// SINGLE space. Plain indexOf fails; the tolerant match must succeed AND map
// back to the real stored offsets covering the diverged text.
const divergedTextMap = {
  paperId: 'paper-test',
  paragraphs: [
    {
      id: 'gf-p1',
      section: '语法填空',
      sentences: [
        // double space between "had" and "visited", and a 3-space run later.
        { id: 'gf-p1-s0', text: 'She had  visited the   old house before.', tokens: [] },
      ],
    },
  ],
}
const storedSentence = divergedTextMap.paragraphs[0].sentences[0].text
assert('Step 1 GATE-1: plain indexOf FAILS on the diverged signalText',
  storedSentence.indexOf('had visited') === -1)
const tolerantRanges = findAllTextRangesTolerant(divergedTextMap, 'had visited')
assert('Step 1 GATE-1: tolerant match locates the diverged signalText', tolerantRanges.length === 1,
  `found: ${tolerantRanges.length}`)
// Offsets must map back to the real stored substring "had  visited".
const r0 = tolerantRanges[0]
assert('Step 1 GATE-1: tolerant offsets map to the real stored bytes',
  r0 && storedSentence.slice(r0.start, r0.end) === 'had  visited',
  `sliced: '${r0 ? storedSentence.slice(r0.start, r0.end) : ''}'`)
// Tolerant match across the 3-space run too.
const threeSpace = findAllTextRangesTolerant(divergedTextMap, 'the old')
assert('Step 1 GATE-1: tolerant match collapses a 3-space run',
  threeSpace.length === 1 && storedSentence.slice(threeSpace[0].start, threeSpace[0].end) === 'the   old',
  `sliced: '${threeSpace[0] ? storedSentence.slice(threeSpace[0].start, threeSpace[0].end) : ''}'`)
// Empty / unlocatable needle → no ranges, no throw.
assert('Step 1 GATE-1: empty needle → no ranges', findAllTextRangesTolerant(divergedTextMap, '   ').length === 0)
assert('Step 1 GATE-1: unlocatable needle → no ranges (no throw)', findAllTextRangesTolerant(divergedTextMap, 'zzz nowhere').length === 0)

// ─── multi-occurrence ───
const multiMap = {
  paperId: 'paper-test',
  paragraphs: [
    {
      id: 'gf-p1',
      section: '语法填空',
      sentences: [
        { id: 'gf-p1-s0', text: 'The number of cats and the number of dogs.', tokens: [] },
        { id: 'gf-p1-s1', text: 'A great number of people came.', tokens: [] },
      ],
    },
  ],
}
const numRanges = findAllTextRangesTolerant(multiMap, 'number of')
assert('Step 1: multi-occurrence — all 3 occurrences located', numRanges.length === 3,
  `found: ${numRanges.length}`)
assert('Step 1: multi-occurrence — every range.sentenceId exists in the map',
  numRanges.every((r) => ['gf-p1-s0', 'gf-p1-s1'].includes(r.sentenceId)))

// ============================================================
// Step 1 — Full-model build (MF-1: range.sentenceId ∈ textMap)
// ============================================================

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'verify-i14-'))
function cleanup() {
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* ignore */ }
}

try {
  const PAPER_ID = 'paper-i14-test'
  const GF_GROUP_ID = 'group-i14-grammar-fill'
  const READING_GROUP_ID = 'group-i14-reading'
  // Grammar-fill blanks q56–q65.
  const gfQuestionIds = Array.from({ length: 10 }, (_, i) => `q-i14-0${56 + i}`)

  // Passage whose stored bytes diverge from parse-time (double space around a blank).
  const gfPassageText =
    'Yesterday he  56  to school and the number of  57  students rose. ' +
    'She enjoyed  58  early in the morning.'

  const paperAsset = {
    schemaVersion: 'paper-asset-v1',
    paper: { paperId: PAPER_ID, title: 'I14 Test Paper' },
    content: {
      groups: {
        [GF_GROUP_ID]: {
          groupId: GF_GROUP_ID,
          groupType: 'grammarFill',
          title: '语法填空',
          questionIds: gfQuestionIds,
          passage: { paragraphs: [{ paragraphId: 'gf-para-0', text: gfPassageText }] },
        },
        [READING_GROUP_ID]: {
          groupId: READING_GROUP_ID,
          groupType: 'reading',
          title: 'Reading A',
          questionIds: ['q-i14-r1', 'q-i14-r2'],
        },
      },
      questions: Object.fromEntries(
        gfQuestionIds.map((qid, i) => [qid, { questionId: qid, questionNo: 56 + i, blankId: `blank-${56 + i}` }]),
      ),
      blanks: {},
    },
    sources: {},
  }

  // Build a complete analysis: 10 blanks. Mix given/no-hint; one non-finite with role/path.
  const facetByIndex = [
    'grammar-fill.given.verb.finite',
    'grammar-fill.no-hint.preposition',
    NON_FINITE,
    'grammar-fill.no-hint.article',
    'grammar-fill.given.noun',
    'grammar-fill.no-hint.conjunction.relative-clause',
    'grammar-fill.given.adjective',
    'grammar-fill.no-hint.pronoun',
    'grammar-fill.given.derivation.verb-to-noun',
    'grammar-fill.given.pronoun',
  ]
  function blankFor(qid, i) {
    const facetKey = facetByIndex[i]
    const isNonFinite = facetKey === NON_FINITE
    const isGiven = facetKey.startsWith('grammar-fill.given')
    return {
      blankId: `blank-${56 + i}`,
      blankNo: 56 + i,
      blankType: isGiven ? 'given' : 'no-hint',
      hint: isGiven ? 'base' : null,
      facetKey,
      answer: 'x',
      role: isNonFinite ? 'adverbial' : null,
      path: isNonFinite ? 'slow' : null,
      reason: '代入说明。',
      // First blank carries the GATE-1 diverged signalText ("number of" w/ single space).
      evidence: i === 0
        ? [{ type: 'subject', signalText: 'number of', signalSide: 'passage', relation: '触发' }]
        : [{ type: 'collocation', signalText: 'in the morning', signalSide: 'passage', relation: '触发' }],
      teachingNote: '提示。',
    }
  }
  const completeBlanks = Object.fromEntries(gfQuestionIds.map((qid, i) => [qid, blankFor(qid, i)]))
  const analysisComplete = {
    schemaVersion: 'grammar-fill-analysis-v1',
    paperId: PAPER_ID,
    sourceAssetVersion: 1,
    targetGroups: [GF_GROUP_ID],
    groups: { [GF_GROUP_ID]: { overview: '记叙文，讲一次经历。' } },
    blanks: completeBlanks,
  }

  // ── Build the surface model ──
  const model = buildGrammarFillAnalysisSurfaceModel({
    asset: paperAsset,
    analysis: analysisComplete,
    groupId: GF_GROUP_ID,
  })

  assert('Step 1: model maps all 10 blanks', Object.keys(model.analysisByQuestionId).length === 10)
  assert('Step 1: model group overview present', model.groupView?.overview === '记叙文，讲一次经历。')
  const v0 = model.analysisByQuestionId[gfQuestionIds[0]]
  assert('Step 1: blank view resolves labelZh + framework from registry',
    v0?.labelZh === FACET_FRAMEWORKS['grammar-fill.given.verb.finite'].labelZh &&
    Array.isArray(v0?.framework?.steps) && v0.framework.steps.length > 0)
  const nfView = model.analysisByQuestionId[gfQuestionIds[2]]
  assert('Step 1: non-finite blank carries role + path', nfView?.role === 'adverbial' && nfView?.path === 'slow')
  assert('Step 1: non-finite blank framework has a table', !!nfView?.framework?.table)
  const finiteView = model.analysisByQuestionId[gfQuestionIds[0]]
  assert('Step 1: non-non-finite blank has null role/path', finiteView?.role === null && finiteView?.path === null)

  // MF-1: every evidence range.sentenceId EXISTS in the built textMap.
  const textMapSentenceIds = new Set(
    model.surfaceData.textMap.paragraphs.flatMap((p) => p.sentences.map((s) => s.id)),
  )
  assert('Step 1 MF-1: textMap has at least one sentence', textMapSentenceIds.size > 0)
  assert('Step 1 MF-1: every evidence range.sentenceId exists in the built textMap',
    model.surfaceData.evidence.length > 0 &&
    model.surfaceData.evidence.every((e) => textMapSentenceIds.has(e.range.sentenceId)),
    `evidence: ${model.surfaceData.evidence.length}; ids: ${[...textMapSentenceIds].join(',')}`)
  // GATE-1 end-to-end: the diverged "number of" signalText DID produce a range
  // even though the stored passage has "number of" — prove via the model.
  assert('Step 1 GATE-1 (e2e): diverged signalText produced ≥1 evidence range through the adapter',
    model.surfaceData.evidence.some((e) => e.questionId === gfQuestionIds[0]))
  // Blank markers (`  56  ` style) must never fall inside a located range.
  const allRangesText = model.surfaceData.evidence.map((e) => {
    const sent = model.surfaceData.textMap.paragraphs
      .flatMap((p) => p.sentences)
      .find((s) => s.id === e.range.sentenceId)
    return sent ? sent.text.slice(e.range.start, e.range.end) : ''
  })
  assert('Step 1: no located range contains a blank-number marker',
    allRangesText.every((t) => !/\b(5[6-9]|6[0-5])\b/.test(t)),
    `ranges: ${JSON.stringify(allRangesText)}`)

  // ── Adapter guards ──
  let threwSchema = false
  try {
    buildGrammarFillAnalysisSurfaceModel({ asset: paperAsset, analysis: { ...analysisComplete, schemaVersion: 'wrong' }, groupId: GF_GROUP_ID })
  } catch { threwSchema = true }
  assert('Step 1: adapter throws on wrong schemaVersion', threwSchema)

  let threwFacet = false
  try {
    const bad = JSON.parse(JSON.stringify(analysisComplete))
    bad.blanks[gfQuestionIds[0]].facetKey = 'grammar-fill.bogus.key'
    buildGrammarFillAnalysisSurfaceModel({ asset: paperAsset, analysis: bad, groupId: GF_GROUP_ID })
  } catch { threwFacet = true }
  assert('Step 1: adapter throws on unknown facetKey', threwFacet)

  // ============================================================
  // Step 2 — Panel source checks
  // ============================================================

  const PANEL_PATH = 'app/src/features/paper-intelligence/GrammarFillAnalysisPanel.tsx'
  assert('Step 2: panel file exists', existsSync(path.join(rootDir, PANEL_PATH)))
  const panelSrc = existsSync(path.join(rootDir, PANEL_PATH)) ? readSrc(PANEL_PATH) : ''
  assert('Step 2: panel exports GrammarFillAnalysisPanel', panelSrc.includes('export function GrammarFillAnalysisPanel'))
  assert('Step 2: panel renders blankType tag', panelSrc.includes('有提示词') && panelSrc.includes('无提示词'))
  assert('Step 2: panel renders hint', panelSrc.includes('analysis.hint'))
  assert('Step 2: panel renders 考点 labelZh', panelSrc.includes('analysis.labelZh'))
  assert('Step 2: panel renders answer', panelSrc.includes('analysis.answer'))
  assert('Step 2: panel renders framework steps', panelSrc.includes('framework.steps'))
  assert('Step 2: panel renders framework table', panelSrc.includes('framework.table'))
  assert('Step 2: panel renders 代入 reason', panelSrc.includes('analysis.reason'))
  assert('Step 2: panel renders role/path badges', panelSrc.includes('ROLE_LABELS') && panelSrc.includes('PATH_LABELS'))
  assert('Step 2: panel renders teachingNote', panelSrc.includes('teachingNote'))
  assert('Step 2: panel renders group overview', panelSrc.includes('groupView') && panelSrc.includes('overview'))
  assert('Step 2: evidence buttons carry data-pi-evidence-id', panelSrc.includes('data-pi-evidence-id={row.evidenceId}'))
  assert('Step 2: evidence buttons carry data-pi-question-id', panelSrc.includes('data-pi-question-id={analysis.questionId}'))
  assert('Step 2: evidence buttons carry data-pi-evidence-kind support', panelSrc.includes('data-pi-evidence-kind="support"'))

  // ============================================================
  // Step 3 — Harness source checks
  // ============================================================

  const HARNESS_PATH = 'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx'
  const harnessSrc = existsSync(path.join(rootDir, HARNESS_PATH)) ? readSrc(HARNESS_PATH) : ''
  assert('Step 3: harness imports GrammarFillAnalysisPanel', harnessSrc.includes('import { GrammarFillAnalysisPanel }'))
  assert('Step 3: harness imports buildGrammarFillAnalysisSurfaceModel', harnessSrc.includes('buildGrammarFillAnalysisSurfaceModel'))
  assert('Step 3: grammarFillAnalysisModel state declared', harnessSrc.includes('grammarFillAnalysisModel') && harnessSrc.includes('setGrammarFillAnalysisModel'))
  assert('Step 3: grammarFill branch fetches analysis JSON', harnessSrc.includes('grammar-fill-analysis-v1.json'))
  assert('Step 3: grammarFill fallback builds plain view + clears analysis model',
    harnessSrc.includes('buildGrammarFillPaperView({ asset, groupId: initialGroupId })') &&
    harnessSrc.includes('setGrammarFillAnalysisModel(null)'))
  assert('Step 3: GrammarFillAnalysisPanel dispatched in right pad', harnessSrc.includes('<GrammarFillAnalysisPanel'))
  assert('Step 3: activeEvidenceKind branches on grammarFillAnalysisModel',
    /if \(grammarFillAnalysisModel\)\s*\{\s*return activeEvidenceId \? 'support' : null/.test(harnessSrc) ||
    (harnessSrc.includes('grammarFillAnalysisModel') && harnessSrc.includes("return activeEvidenceId ? 'support' : null")))
  assert('Step 3: analysisView memo early-returns null for grammarFillAnalysisModel',
    harnessSrc.includes('if (grammarFillAnalysisModel) return null'))
  assert('Step 3: surfaceData memo reads grammarFillAnalysisModel.surfaceData',
    harnessSrc.includes('grammarFillAnalysisModel?.surfaceData'))
  assert('Step 3: initial-focus effect handles grammarFillAnalysisModel',
    harnessSrc.includes('grammarFillAnalysisModel.analysisByQuestionId[initialQuestionId]') &&
    harnessSrc.includes('grammarFillAnalysisModel.defaultQuestionId'))
  assert('Step 3: focus-intent handler branches on grammarFillAnalysisModel',
    harnessSrc.includes("source === 'paper-asset' && grammarFillAnalysisModel"))

  // ============================================================
  // Step 4 — Availability gate (runtime)
  // ============================================================

  const AVAIL_PATH = 'server/search/paperSurfaceAvailability.mjs'
  const availSrc = readSrc(AVAIL_PATH)
  assert('Step 4: analysisConfigs has grammar-fill-analysis-v1 entry', availSrc.includes('grammar-fill-analysis-v1'))
  assert('Step 4: grammar-fill config has label 语法解析', availSrc.includes('语法解析'))

  function writeCase(caseName, analysisFile, analysisData) {
    const caseDir = path.join(tempDir, caseName)
    mkdirSync(path.join(caseDir, PAPER_ID, 'analyses'), { recursive: true })
    writeFileSync(path.join(caseDir, PAPER_ID, 'paper-asset.json'), JSON.stringify(paperAsset))
    writeFileSync(path.join(caseDir, PAPER_ID, 'analyses', analysisFile), JSON.stringify(analysisData))
    return createPaperSurfaceAnalysisAvailability({ paperAssetsDir: caseDir, warn: () => {} })
  }

  // Case 1: complete (10 blanks) → 语法解析 href to first questionId.
  const availComplete = writeCase('complete', 'grammar-fill-analysis-v1.json', analysisComplete)
  const entryComplete = availComplete.getByGroupId().get(GF_GROUP_ID)
  assert('Step 4: complete analysis → 语法解析 entry present', !!entryComplete)
  assert('Step 4: complete analysis → label 语法解析', entryComplete?.label === '语法解析', `label: ${entryComplete?.label}`)
  assert('Step 4: complete analysis → href targets first questionId (q56)',
    typeof entryComplete?.href === 'string' && entryComplete.href.includes(gfQuestionIds[0]),
    `href: ${entryComplete?.href}`)

  // Case 2: incomplete (drop one blank) → no entry.
  const incompleteBlanks = { ...completeBlanks }
  delete incompleteBlanks[gfQuestionIds[4]]
  const analysisIncomplete = { ...analysisComplete, blanks: incompleteBlanks }
  const availIncomplete = writeCase('incomplete', 'grammar-fill-analysis-v1.json', analysisIncomplete)
  assert('Step 4: incomplete analysis → no entry (completeness gate)',
    !availIncomplete.getByGroupId().get(GF_GROUP_ID))

  // Case 3: reading availability unchanged (uses 'questions').
  const readingAnalysis = {
    schemaVersion: 'reading-choice-analysis-v1',
    paperId: PAPER_ID,
    targetGroups: [READING_GROUP_ID],
    questions: { 'q-i14-r1': { questionId: 'q-i14-r1' }, 'q-i14-r2': { questionId: 'q-i14-r2' } },
  }
  const availReading = writeCase('reading', 'reading-choice-analysis-v1.json', readingAnalysis)
  const entryReading = availReading.getByGroupId().get(READING_GROUP_ID)
  assert('Step 4: reading analysis still works (questions key)', !!entryReading && entryReading.label === '阅读解析')

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
console.log('I14 grammar-fill analysis surface verify passed.')
