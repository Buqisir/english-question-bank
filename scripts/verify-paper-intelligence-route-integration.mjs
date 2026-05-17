#!/usr/bin/env node
/**
 * Verification: Paper Intelligence → App Shell route integration.
 *
 * Cut A static checks (still in force):
 *   1. main.tsx does NOT directly render PaperIntelligencePreview.
 *   2. App.tsx renders PaperIntelligencePreview when piRoute is active.
 *   3. PaperIntelligencePreview props type includes basket bridge fields.
 *   4. report.json passages all have questionGroupId.
 *   5. All questionGroupIds resolve to sampleQuestionGroups entries.
 *   6. reading-analysis route still exists in main.tsx.
 *   7. No fuzzy matching logic (passageTitle / section guess).
 *
 * Cut B additions (P0 watch from PR #15 review):
 *   8. App fetch-effect guards: each workbench fetch effect early-returns
 *      when piRoute.kind === 'paper-intelligence' AND lists piRoute.kind
 *      in its dependency array (so Cut C return-to-workbench retriggers
 *      the load).
 *   9. PI feature-directory isolation: nothing under
 *      app/src/features/paper-intelligence/** may import App-internal
 *      basket / draft modules (usePaperDraft / questionGroupById /
 *      QuestionGroupCard / paperDraftModel / paperBlocks / sample data).
 *  10. PaperIntelligencePreview props-only contract: it does not import
 *      any App-internal module, and it never references QuestionGroupCard
 *      or paperDraft directly. The basket bridge flows through props.
 *  11. Cut A no-op marker for onAddQuestionGroup is gone; the real
 *      handler resolves questionGroupId via questionGroupById and calls
 *      paperDraft.addGroups (or addGroupsToBasket).
 */

import { readFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0
const issues = []

function assert(name, condition, detail) {
  if (condition) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    issues.push(`${name}: ${detail || 'failed'}`)
    console.error(`  \u2717 ${name}: ${detail || 'failed'}`)
  }
}

// ─── Load sources ───

const mainSrc = readFileSync(path.join(ROOT, 'app/src/main.tsx'), 'utf-8')
const appSrc = readFileSync(path.join(ROOT, 'app/src/App.tsx'), 'utf-8')
const piPreviewSrc = readFileSync(
  path.join(ROOT, 'app/src/features/paper-intelligence/PaperIntelligencePreview.tsx'),
  'utf-8',
)
const piTypesSrc = readFileSync(
  path.join(ROOT, 'app/src/features/paper-intelligence/paperIntelligenceTypes.ts'),
  'utf-8',
)
const reportJson = JSON.parse(
  readFileSync(
    path.join(ROOT, 'app/public/reports/paper-intelligence/paper-2024-xkb1-reading/report.json'),
    'utf-8',
  ),
)
const sampleGroupsSrc = readFileSync(
  path.join(ROOT, 'app/src/data/sampleQuestionGroups.ts'),
  'utf-8',
)

console.log('\n=== Paper Intelligence Route Integration (Cut A) ===\n')

// ─── Test 1: main.tsx does NOT directly render PaperIntelligencePreview ───

console.log('Test 1: main.tsx no longer directly renders PaperIntelligencePreview')

assert(
  'main.tsx does not contain <PaperIntelligencePreview',
  !mainSrc.includes('<PaperIntelligencePreview'),
  'main.tsx still renders PaperIntelligencePreview directly',
)

assert(
  'main.tsx does not import PaperIntelligencePreview component',
  !mainSrc.includes("import { PaperIntelligencePreview }"),
  'main.tsx still imports PaperIntelligencePreview',
)

assert(
  'main.tsx passes piRoute prop to App',
  mainSrc.includes('piRoute={piRoute}') || mainSrc.includes('piRoute='),
  'main.tsx does not pass piRoute to App',
)

// ─── Test 2: App.tsx renders PaperIntelligencePreview ───

console.log('\nTest 2: App.tsx handles Paper Intelligence route rendering')

assert(
  'App.tsx imports PaperIntelligencePreview',
  appSrc.includes("import { PaperIntelligencePreview }") ||
    appSrc.includes("import {PaperIntelligencePreview}"),
  'App.tsx does not import PaperIntelligencePreview',
)

assert(
  'App.tsx imports PaperIntelligenceRouteMatch type',
  appSrc.includes('PaperIntelligenceRouteMatch'),
  'App.tsx does not reference PaperIntelligenceRouteMatch',
)

assert(
  'App.tsx renders PaperIntelligencePreview when piRoute active',
  appSrc.includes('<PaperIntelligencePreview'),
  'App.tsx does not contain <PaperIntelligencePreview',
)

assert(
  'App.tsx checks piRoute.kind === paper-intelligence',
  appSrc.includes("piRoute.kind === 'paper-intelligence'"),
  'App.tsx does not check piRoute.kind',
)

assert(
  'App.tsx passes paperId prop to PaperIntelligencePreview',
  appSrc.includes('paperId={piRoute.paperId}'),
  'Missing paperId prop pass-through',
)

assert(
  'App.tsx passes basketIds prop',
  appSrc.includes('basketIds={'),
  'Missing basketIds prop',
)

assert(
  'App.tsx passes availableQuestionGroupIds prop',
  appSrc.includes('availableQuestionGroupIds={'),
  'Missing availableQuestionGroupIds prop',
)

assert(
  'App.tsx passes onAddQuestionGroup prop',
  appSrc.includes('onAddQuestionGroup={'),
  'Missing onAddQuestionGroup prop',
)

assert(
  'App.tsx passes basketCount prop',
  appSrc.includes('basketCount={'),
  'Missing basketCount prop',
)

assert(
  'App.tsx passes onBackToWorkbench prop',
  appSrc.includes('onBackToWorkbench={'),
  'Missing onBackToWorkbench prop',
)

// ─── Test 3: PaperIntelligencePreview props include basket bridge fields ───

console.log('\nTest 3: PaperIntelligencePreview props type includes basket bridge')

assert(
  'Props type has basketIds',
  piPreviewSrc.includes('basketIds'),
  'Missing basketIds in props',
)

assert(
  'Props type has availableQuestionGroupIds',
  piPreviewSrc.includes('availableQuestionGroupIds'),
  'Missing availableQuestionGroupIds in props',
)

assert(
  'Props type has onAddQuestionGroup',
  piPreviewSrc.includes('onAddQuestionGroup'),
  'Missing onAddQuestionGroup in props',
)

assert(
  'Props type has basketCount',
  piPreviewSrc.includes('basketCount'),
  'Missing basketCount in props',
)

assert(
  'Props type has onBackToWorkbench',
  piPreviewSrc.includes('onBackToWorkbench'),
  'Missing onBackToWorkbench in props',
)

// ─── Test 4: report.json passages all have questionGroupId ───

console.log('\nTest 4: report.json passages all have questionGroupId')

const passages = reportJson.passages || []
assert(
  'Report has 4 passages',
  passages.length === 4,
  `Got ${passages.length} passages`,
)

const expectedSections = ['A', 'B', 'C', 'D']
for (const section of expectedSections) {
  const passage = passages.find((p) => p.paperSection === section)
  assert(
    `Passage ${section} exists`,
    Boolean(passage),
    `Missing passage ${section}`,
  )
  assert(
    `Passage ${section} has questionGroupId`,
    Boolean(passage && passage.questionGroupId),
    `Passage ${section} missing questionGroupId`,
  )
  assert(
    `Passage ${section} questionGroupId is a stable id (g-2024-xkb1-${section.toLowerCase()})`,
    passage && passage.questionGroupId === `g-2024-xkb1-${section.toLowerCase()}`,
    `Got: ${passage?.questionGroupId}`,
  )
}

// ─── Test 5: All questionGroupIds resolve to sampleQuestionGroups ───

console.log('\nTest 5: questionGroupIds resolve to sampleQuestionGroups')

const expectedIds = ['g-2024-xkb1-a', 'g-2024-xkb1-b', 'g-2024-xkb1-c', 'g-2024-xkb1-d']
for (const id of expectedIds) {
  assert(
    `sampleQuestionGroups contains ${id}`,
    sampleGroupsSrc.includes(`'${id}'`) || sampleGroupsSrc.includes(`"${id}"`),
    `${id} not found in sampleQuestionGroups.ts`,
  )
}

// ─── Test 6: reading-analysis route still exists ───

console.log('\nTest 6: reading-analysis route intact')

assert(
  'main.tsx imports ReadingAnalysisDemoRoute',
  mainSrc.includes('ReadingAnalysisDemoRoute'),
  'Missing ReadingAnalysisDemoRoute import',
)

assert(
  'main.tsx imports parseReadingAnalysisRoute',
  mainSrc.includes('parseReadingAnalysisRoute'),
  'Missing parseReadingAnalysisRoute import',
)

assert(
  'main.tsx renders ReadingAnalysisDemoRoute on reading-analysis route',
  mainSrc.includes('<ReadingAnalysisDemoRoute'),
  'Missing <ReadingAnalysisDemoRoute rendering',
)

// ─── Test 7: No fuzzy matching logic ───

console.log('\nTest 7: No fuzzy matching (no passageTitle/section guess)')

assert(
  'PaperIntelligencePreview does not fuzzy-match by passageTitle',
  !piPreviewSrc.includes('passageTitle') ||
    (piPreviewSrc.includes('passageTitle') && !piPreviewSrc.includes('passageTitle ===')),
  'Contains passageTitle equality check (fuzzy match)',
)

// Check that App.tsx does not do fuzzy matching between PI passages and question groups
assert(
  'App.tsx does not contain passageTitle-to-group matching',
  !appSrc.includes('passageTitle ===') && !appSrc.includes('section ==='),
  'App.tsx contains fuzzy matching logic',
)

assert(
  'paperIntelligenceTypes includes questionGroupId field',
  piTypesSrc.includes('questionGroupId'),
  'PassageReport missing questionGroupId',
)

// ─── Test 8: PI-route fetch-effect guards (Cut B P0 watch) ───

console.log('\nTest 8: App fetch effects guard against piRoute.kind === paper-intelligence')

/**
 * Extract every `useEffect((...) => { ... }, [deps])` block from App.tsx.
 *
 * We can't lean on the TypeScript AST (the verify script runs raw via the
 * strip-types loader), so we balance braces / brackets manually after
 * locating each `useEffect(` opener. The result is the full source slice
 * for each effect including its dep array tail.
 */
function extractUseEffects(src) {
  const effects = []
  const re = /useEffect\s*\(\s*\(\)\s*=>\s*\{/g
  let match
  while ((match = re.exec(src)) !== null) {
    const start = match.index
    let i = match.index + match[0].length
    let depth = 1
    while (i < src.length && depth > 0) {
      const ch = src[i]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      i++
    }
    // We're now just after the closing `}` of the callback. Scan to the
    // matching `)` of the useEffect call (skipping the deps array).
    while (i < src.length && src[i] !== ')') {
      i++
    }
    if (i < src.length) i++
    effects.push(src.slice(start, i))
  }
  return effects
}

const allEffects = extractUseEffects(appSrc)

// Workbench-only fetch effects we need to gate. Mapping: effect must
// contain at least one of these fetch-fn references.
const workbenchFetchTokens = [
  'fetchQuestionGroups(',
  'fetchImportFiles(',
  'fetchImportBundles(',
  'fetchImportBatches(',
  'fetchPaperSets(',
  'fetchPaperWorkflows(',
]

const workbenchFetchEffects = allEffects.filter((effect) =>
  workbenchFetchTokens.some((token) => effect.includes(token)),
)

assert(
  'App.tsx still has the workbench fetch effects (>= 4 useEffect blocks)',
  workbenchFetchEffects.length >= 4,
  `found ${workbenchFetchEffects.length}`,
)

for (const token of workbenchFetchTokens) {
  const owners = workbenchFetchEffects.filter((effect) => effect.includes(token))
  assert(
    `${token} guarded by piRoute.kind early return`,
    owners.length > 0 &&
      owners.every((effect) =>
        /if\s*\(\s*piRoute\.kind\s*===\s*['"]paper-intelligence['"]\s*\)\s*return/.test(effect),
      ),
    'missing early-return guard',
  )
  assert(
    `${token} effect's dependency array includes piRoute.kind`,
    owners.length > 0 &&
      owners.every((effect) => {
        // The dep array is the last `[ ... ]` in the slice.
        const m = effect.match(/\[([^\]]*)\]\s*\)\s*$/)
        return m !== null && m[1].includes('piRoute.kind')
      }),
    'piRoute.kind missing from dep array',
  )
}

// ─── Test 9: PI feature-directory isolation ───

console.log('\nTest 9: app/src/features/paper-intelligence/** does NOT reach into App internals')

const piFeatureDir = path.join(ROOT, 'app/src/features/paper-intelligence')

async function listFeatureFiles(dir) {
  const out = []
  const entries = await readdir(dir)
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const st = await stat(full)
    if (st.isDirectory()) {
      out.push(...(await listFeatureFiles(full)))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const piFiles = await listFeatureFiles(piFeatureDir)
const piSourcesByPath = new Map(piFiles.map((file) => [file, readFileSync(file, 'utf-8')]))

assert(
  'PI feature directory has source files to inspect',
  piFiles.length > 0,
  '',
)

/**
 * Forbidden references — any of these strings appearing anywhere under
 * features/paper-intelligence/** is a hard fail. PaperIntelligencePreview
 * only knows questionGroupId; resolution to QuestionGroupCard happens
 * inside App.tsx, never here.
 */
const FORBIDDEN_TOKENS = [
  'usePaperDraft',
  'questionGroupById',
  'QuestionGroupCard',
  'paperDraftModel',
  'paperAssembly',
  'sampleQuestionGroups',
  'usePaperBlocks',
  'PaperBlock',
]

for (const token of FORBIDDEN_TOKENS) {
  const offenders = []
  for (const [file, src] of piSourcesByPath.entries()) {
    if (src.includes(token)) {
      offenders.push(path.relative(ROOT, file))
    }
  }
  assert(
    `PI feature dir does not reference "${token}"`,
    offenders.length === 0,
    `offending files: ${offenders.join(', ')}`,
  )
}

// PaperIntelligencePreview must not import anything from App, paperAssembly,
// or any concierge / data / domain / services internals.
const piPreviewImportLines = piPreviewSrc
  .split('\n')
  .filter((line) => /^\s*import\s/.test(line))
  .join('\n')

const FORBIDDEN_IMPORT_PATHS = [
  '../../App',
  '../../paperAssembly',
  '../../concierge',
  '../../services',
  '../../data/sampleQuestionGroups',
]

for (const imp of FORBIDDEN_IMPORT_PATHS) {
  assert(
    `PaperIntelligencePreview does not import from "${imp}"`,
    !piPreviewImportLines.includes(imp),
    'forbidden import path',
  )
}

// PaperIntelligencePreview props are still the only basket bridge.
assert(
  'PaperIntelligencePreview Props type names basketIds, availableQuestionGroupIds, onAddQuestionGroup',
  /\bbasketIds:\s*Set<string>/.test(piPreviewSrc) &&
    /\bavailableQuestionGroupIds:\s*Set<string>/.test(piPreviewSrc) &&
    /\bonAddQuestionGroup:\s*\(questionGroupId:\s*string\)\s*=>\s*void/.test(piPreviewSrc),
  '',
)

// ─── Test 10: Cut A no-op is gone, real onAddQuestionGroup wired ───

console.log('\nTest 10: piOnAddQuestionGroup is no longer a no-op (Cut A marker removed)')

assert(
  'App.tsx no longer carries the Cut A "wired but intentionally no-op" marker for onAddQuestionGroup',
  !appSrc.includes("Cut A: wired but intentionally no-op. Cut B will implement"),
  'Cut A marker still present',
)

// Extract the piOnAddQuestionGroup useCallback body so we can prove it
// actually does work. Tolerant matcher: any non-empty body that mentions
// the resolution path.
const piAddCallback =
  appSrc.match(/const piOnAddQuestionGroup\s*=\s*useCallback\s*\(([\s\S]*?)\n\s*\)\s*\n/)?.[1] ||
  ''

assert(
  'piOnAddQuestionGroup useCallback body extracted',
  piAddCallback.length > 0,
  '',
)

assert(
  'piOnAddQuestionGroup body resolves questionGroupId via questionGroupById',
  /questionGroupById\.get\(/.test(piAddCallback),
  'missing questionGroupById.get(...) lookup',
)

assert(
  'piOnAddQuestionGroup body calls a real basket-add path (paperDraft.addGroups or addGroupsToBasket)',
  /paperDraft\.addGroups\(/.test(piAddCallback) || /addGroupsToBasket\(/.test(piAddCallback),
  'no basket-add call in handler body',
)

// ─── Summary ───

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
if (issues.length > 0) {
  console.log('\nIssues:')
  issues.forEach((i) => console.log(`  - ${i}`))
}
process.exit(failed > 0 ? 1 : 0)