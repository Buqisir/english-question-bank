#!/usr/bin/env node
/**
 * Verification: C6b-1 — option-anchored PaperSurface analysis panel.
 *
 * Locks the right-panel interaction cut:
 * - host owns activeOptionLabel
 * - question changes seed the correct option + support evidence
 * - option rows switch the radio accordion, evidence rows draw lines
 * - trapEvidence resolves to PaperSurface trap rows
 * - unsupportedClaim without trapEvidence clears the line
 * - no PaperSurface renderer changes
 * - later C6b entry-gate/search/API cuts may coexist without failing this
 *   right-panel interaction guard
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`)
  }
}

function assertEqual(name, actual, expected) {
  assert(
    name,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  )
}

const here = path.dirname(new URL(import.meta.url).pathname)
const root = path.resolve(here, '..')

function read(relPath) {
  return readFileSync(path.join(root, relPath), 'utf8')
}

function readJson(relPath) {
  return JSON.parse(read(relPath))
}

function gitLines(command) {
  try {
    return execSync(command, { cwd: root, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const changedFiles = Array.from(
  new Set([
    ...gitLines('git diff --name-only github/main...HEAD'),
    ...gitLines('git diff --cached --name-only'),
    ...gitLines('git diff --name-only'),
  ]),
)

console.log('=== C6b-1: option-anchored PaperSurface analysis panel ===\n')

/* ───────────────────── 1. Scope guard ───────────────────── */

console.log('-- 1. Scope guard --')

const allowed = new Set([
  'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx',
  'app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts',
  'app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css',
  'app/src/features/paper-intelligence/paperSurfaceHostInteraction.ts',
  'app/src/concierge/ConciergeGroupCard.tsx',
  'app/src/domain/questionBank.ts',
  'app/src/features/paper-intelligence/paperIntelligenceRoute.ts',
  'server/api.mjs',
  'scripts/verify-c6a3-reading-analysis-bridge.mjs',
  'scripts/verify-c6a4-paper-asset-analysis-loader.mjs',
  'scripts/verify-c6a5-search-entry-e2e.mjs',
  'scripts/verify-c6a6b-open-reading-b-analysis-entry.mjs',
  'scripts/verify-c6a9-open-reading-cd-analysis-entry.mjs',
  'scripts/verify-c6b1-option-anchored-analysis.mjs',
  'scripts/verify-c6b2-analysis-entry-gate.mjs',
])

for (const file of changedFiles) {
  assert(`changed file allowed: ${file}`, allowed.has(file), 'unexpected C6b-1 file')
}

assert(
  'PaperSurface.tsx unchanged',
  !changedFiles.includes('app/src/shared-ui/papersurface/PaperSurface.tsx'),
)
assert(
  'PaperSurface.css unchanged',
  !changedFiles.includes('app/src/shared-ui/papersurface/PaperSurface.css'),
)
assert(
  'shared/papersurface unchanged',
  !changedFiles.some((file) => file.startsWith('shared/papersurface/')),
)
assert(
  'paper-asset JSON unchanged',
  !changedFiles.some((file) => file.startsWith('app/public/paper-assets/')),
)
assert(
  'legacy reports unchanged',
  !changedFiles.some((file) => file.startsWith('app/public/reports/')),
)

/* ───────────────────── 2. Host state contract ───────────────────── */

console.log('\n-- 2. Host state contract --')

const host = read('app/src/features/paper-intelligence/paperSurfaceHostInteraction.ts')

assert('host state contains activeOptionLabel', host.includes('activeOptionLabel: string | null'))
assert('initial activeOptionLabel is null', host.includes('activeOptionLabel: null'))
assert('request-lecture-focus accepts optionLabel', host.includes('optionLabel?: string | null'))
assert('request-lecture-focus accepts evidenceId', host.includes('evidenceId?: string | null'))
assert(
  'request-lecture-focus writes activeOptionLabel',
  /activeOptionLabel:\s*shouldClearLegacyFocus\s*\?\s*null\s*:\s*action\.optionLabel\s*\?\?\s*null/.test(host),
)
assert(
  'request-lecture-focus writes activeEvidenceId',
  /activeEvidenceId:\s*shouldClearLegacyFocus\s*\?\s*null\s*:\s*action\.evidenceId\s*\?\?\s*null/.test(host),
)
assert('legacy focus toggle guard is explicit', host.includes('shouldClearLegacyFocus'))
assert('legacy focus toggle only applies when optionLabel is absent', host.includes('action.optionLabel === undefined'))
assert('legacy focus toggle only applies when evidenceId is absent', host.includes('action.evidenceId === undefined'))
assert('seed-option-evidence action exists', host.includes("type: 'seed-option-evidence'"))
assert('select-option-evidence action accepts nullable evidence', host.includes("type: 'select-option-evidence'; optionLabel: string; evidenceId: string | null"))
assert('select-option-evidence can clear activeEvidenceId', host.includes('activeEvidenceId: action.evidenceId'))

/* ───────────────────── 3. Adapter trap evidence contract ───────────────────── */

console.log('\n-- 3. Adapter trap evidence contract --')

const adapter = read('app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts')

assert('adapter exposes trapEvidenceRows on options', adapter.includes('trapEvidenceRows: PaperAssetEvidenceRowView[]'))
assert('adapter builds trap evidence from OptionAnalysisItem.trapEvidence', adapter.includes('option.trapEvidence ?? []'))
assert('adapter resolves trap quote through textMap', adapter.includes('resolveQuoteInTextMap(item.paragraphId, item.quote, textMap)'))
assert('adapter emits PaperEvidence kind trap', adapter.includes("kind: 'trap'"))
assert('adapter uses stable trap evidence ids', adapter.includes("`${questionId}-trap-${option.label.toLowerCase()}-${index + 1}`"))
assert('adapter drops unresolved trap rows', adapter.includes('evidenceIdSet.has(evidenceId)'))
assert('adapter keeps support evidence rows', adapter.includes('supportEvidenceRows: PaperAssetEvidenceRowView[]'))
assert('adapter exposes trap primary type', adapter.includes('trapPrimaryType: trap?.primaryType ?? null'))
assert('adapter exposes trap secondary label', adapter.includes('trapSecondaryLabel: trap?.secondaryType'))
assert('adapter exposes trap subtype', adapter.includes("trap && 'subtype' in trap"))

const adapterModulePath = path.join(
  root,
  'app',
  'src',
  'features',
  'paper-intelligence',
  'paperAssetSurfaceAdapter.ts',
)
const { buildPaperAssetSurfaceModel } = await import(adapterModulePath)
const asset = readJson('test-fixtures/paper-assets/paper-2024-jslk-english/paper-asset.json')
const analysis = readJson(
  'test-fixtures/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json',
)
const model = buildPaperAssetSurfaceModel({
  asset,
  analysis,
  groupId: 'group-2024-jslk-reading-d',
})
const q32 = model.analysisByQuestionId['q-2024-jslk-032']
const q32A = q32.options.find((option) => option.label === 'A')
const q32B = q32.options.find((option) => option.label === 'B')
const q32C = q32.options.find((option) => option.label === 'C')

assertEqual('Reading D Q32 answer is C', q32.answer, 'C')
assert('Q32 correct option has seeded support evidence id', Boolean(q32.supportEvidenceId))
assert('Q32 option C is correct', q32C?.status === 'correct')
assert('Q32 option B has resolved trap evidence', (q32B?.trapEvidenceRows.length ?? 0) > 0)
assertEqual(
  'Q32 option B first trap row kind is trap',
  model.evidenceKindById[q32B?.trapEvidenceRows[0]?.evidenceId ?? ''],
  'trap',
)
assertEqual('Q32 option A is unsupportedClaim', q32A?.trapPrimaryType, 'unsupportedClaim')
assertEqual('Q32 option A has no trap evidence rows', q32A?.trapEvidenceRows.length, 0)

/* ───────────────────── 4. Harness UI contract ───────────────────── */

console.log('\n-- 4. Harness UI contract --')

const harness = read('app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx')

assert('harness destructures activeOptionLabel', harness.includes('activeOptionLabel,'))
assert('paper-asset initial focus seeds option label', harness.includes('optionLabel: candidateAnalysis?.answer ?? null'))
assert('paper-asset initial focus seeds support evidence', harness.includes('evidenceId: candidateAnalysis?.supportEvidenceId ?? null'))
assert('paper-asset question click seeds option label', harness.includes('optionLabel: nextAnalysis?.answer ?? null'))
assert('paper-asset question click seeds evidence', harness.includes('evidenceId: nextAnalysis?.supportEvidenceId ?? null'))
assert('paper-asset reseed uses seed-option-evidence', harness.includes("type: 'seed-option-evidence'"))
assert('option click uses select-option-evidence', harness.includes("type: 'select-option-evidence'"))
assert('panel receives activeOptionLabel prop', harness.includes('activeOptionLabel={activeOptionLabel}'))
assert('panel receives onSelectOption prop', harness.includes('onSelectOption={handleSelectPaperAssetOption}'))
assert('accordion class rendered', harness.includes('pi-ps-analysis-options--accordion'))
assert('option rows are buttons', harness.includes('className="pi-ps-analysis-option-row"'))
assert('option rows expose aria-expanded', harness.includes('aria-expanded={isActive}'))
assert('correct detail title is 答案依据', harness.includes('<h4>答案依据</h4>'))
assert('wrong detail title is 干扰解析', harness.includes('<h4>干扰解析</h4>'))
assert('unsupportedClaim without line is explicit', harness.includes('原文未提及。此选项不连接原文证据线。'))
assert('wrong option fallback can clear evidence line', harness.includes('option.trapEvidenceRows[0]?.evidenceId ?? null'))
assert('support evidence row carries support kind', harness.includes('data-pi-evidence-kind="support"'))
assert('trap evidence row carries trap kind', harness.includes('data-pi-evidence-kind="trap"'))

const optionRowIndex = harness.indexOf('className="pi-ps-analysis-option-row"')
const optionRowBlock = harness.slice(optionRowIndex, optionRowIndex + 500)
assert('option row is not a line source', !optionRowBlock.includes('data-pi-evidence-id'))

/* ───────────────────── 5. CSS contract ───────────────────── */

console.log('\n-- 5. CSS contract --')

const css = read('app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css')

assert('accordion styles exist', css.includes('.pi-ps-analysis-options--accordion'))
assert('active option section highlight exists', css.includes('.pi-ps-analysis-option-section--active'))
assert('option row reset exists', css.includes('button.pi-ps-analysis-option-row'))
assert('correct option badge style exists', css.includes('.pi-ps-analysis-option-badge--correct'))
assert('trap option badge style exists', css.includes('.pi-ps-analysis-option-badge--trap'))
assert('option detail style exists', css.includes('.pi-ps-analysis-option-detail'))
assert('unsupported no-line style exists', css.includes('.pi-ps-analysis-no-line'))
assert('trap selected evidence row style preserved', css.includes('button.pi-ps-analysis-distractor--selected'))

console.log(`\nC6b-1 option-anchored verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
