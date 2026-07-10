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
  'App.tsx checks currentPiRoute.kind === paper-intelligence',
  appSrc.includes("currentPiRoute.kind === 'paper-intelligence'"),
  'App.tsx does not check currentPiRoute.kind',
)

assert(
  'App.tsx passes paperId prop (from currentPiRoute) to PaperIntelligencePreview',
  appSrc.includes('paperId={currentPiRoute.paperId}'),
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
  'App.tsx passes basketPreviewItems prop (Issue #20: PI basket preview entry)',
  appSrc.includes('basketPreviewItems={'),
  'Missing basketPreviewItems prop',
)

assert(
  'App.tsx builds basketPreviewItems from basket via useMemo (no per-render allocation)',
  /piBasketPreviewItems\s*=\s*useMemo\([\s\S]*?basket\.map/.test(appSrc),
  'piBasketPreviewItems is not memoized off `basket`',
)

assert(
  'piBasketPreviewItems projects only the lightweight fields PI needs',
  /piBasketPreviewItems\s*=\s*useMemo\([\s\S]*?paperSection:[\s\S]*?passageTitle:[\s\S]*?groupTypeLabel:[\s\S]*?questionCount:[\s\S]*?totalScore:[\s\S]*?sourcePaperName:/.test(
    appSrc,
  ),
  'piBasketPreviewItems is missing one of the required projection fields (paperSection, passageTitle, groupTypeLabel, questionCount, totalScore, sourcePaperName)',
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
  'Props type has basketPreviewItems (Issue #20: PI basket preview entry)',
  piPreviewSrc.includes('basketPreviewItems'),
  'Missing basketPreviewItems in props',
)

assert(
  'Props type declares basketPreviewItems as a ReadonlyArray of a lightweight projection',
  /basketPreviewItems:\s*ReadonlyArray<\s*BasketPreviewItem\s*>/.test(piPreviewSrc),
  'basketPreviewItems should be ReadonlyArray<BasketPreviewItem> to keep PI immutable on its consumer',
)

assert(
  'PI exports a BasketPreviewItem type so App can satisfy the contract',
  /export\s+type\s+BasketPreviewItem\s*=\s*\{/.test(piPreviewSrc),
  'BasketPreviewItem type is missing from PaperIntelligencePreview module',
)

assert(
  'BasketPreviewItem only carries pre-resolved primitives (no QuestionGroupCard / BasketItem leakage)',
  !/BasketPreviewItem\s*=\s*\{[\s\S]*?(QuestionGroupCard|BasketItem|defaultScore|sectionTitle:\s*string\s*\|\s*null)/.test(
    piPreviewSrc,
  ) &&
    /BasketPreviewItem\s*=\s*\{[\s\S]*?paperSection:\s*string[\s\S]*?passageTitle:\s*string[\s\S]*?groupTypeLabel:\s*string[\s\S]*?questionCount:\s*number[\s\S]*?totalScore:\s*number[\s\S]*?sourcePaperName:\s*string[\s\S]*?\}/.test(
      piPreviewSrc,
    ),
  'BasketPreviewItem must expose only the lightweight inspector fields',
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

// ─── Test 8: PI-route fetch-effect guards (covered by Test 12 with
// currentPiRoute.kind in Cut C; we keep the AST helper definition here
// so Test 12 can call it) ───

console.log('\nTest 8: App still has the workbench fetch effects (helper sanity check)')

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

// (Detailed Cut C guard / dep-array assertions live in Test 12 below where
// they read `currentPiRoute.kind`. The Cut B-era `piRoute.kind`-only loops
// have been removed.)

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
  /paperDraft\.addGroups\(/.test(piAddCallback) ||
    /paperDraftAddGroups\(/.test(piAddCallback) ||
    /addGroupsToBasket\(/.test(piAddCallback),
  'no basket-add call in handler body',
)

// ─── Test 11: Cut C P0 watch — piOnAddQuestionGroup deps are specific ───
//
// Reviewer P0 watch from PR #16: depending on the entire `paperDraft`
// object would invalidate the useCallback every render (since usePaperDraft
// returns a fresh object each render). The Cut C contract is that the deps
// list pins the SPECIFIC handler — `addGroups` (or any aliased handler that
// is itself stabilized via useCallback inside usePaperDraft).

console.log('\nTest 11: piOnAddQuestionGroup deps are specific (no whole-object dependency)')

// The deps list is the trailing `[ ... ]` literal of the useCallback call.
// We can't use a single regex because the body contains `[card]` array
// literals which break a naive `[^\]]*` capture. Instead, scan from
// `const piOnAddQuestionGroup = useCallback(` and balance braces / brackets
// until we reach the deps array at the end.
function extractPiOnAddDeps(src) {
  const re = /const\s+piOnAddQuestionGroup\s*=\s*useCallback\s*\(/
  const start = src.match(re)
  if (!start || start.index === undefined) return ''
  let i = (start.index || 0) + start[0].length
  let depth = 1 // we're inside the useCallback paren
  // Walk until we find the top-level comma that separates body from deps.
  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (ch === '(' || ch === '{' || ch === '[') depth++
    else if (ch === ')' || ch === '}' || ch === ']') depth--
    // The comma we want is at depth === 1 (inside useCallback's outer paren only).
    if (ch === ',' && depth === 1) {
      // Past this comma is the deps literal `[ ... ]`.
      const tail = src.slice(i + 1)
      const m = tail.match(/\s*\[([\s\S]*?)\]\s*\)/)
      return m ? m[1] : ''
    }
    i++
  }
  return ''
}

const piAddCallbackDeps = extractPiOnAddDeps(appSrc)

assert(
  'piOnAddQuestionGroup deps array extracted',
  piAddCallbackDeps.length > 0,
  '',
)

// Whole-object dependency is the failure mode — the deps must NOT mention
// `paperDraft` as a bare identifier. We allow `paperDraftAddGroups` (the
// destructured handler alias) and any other suffixed identifier.
assert(
  'piOnAddQuestionGroup deps do NOT include the bare `paperDraft` object',
  !/\bpaperDraft\b(?!Add|Add[A-Z])/.test(piAddCallbackDeps),
  `deps=[${piAddCallbackDeps.trim()}] still references the whole paperDraft object`,
)

assert(
  'piOnAddQuestionGroup deps include questionGroupById',
  /\bquestionGroupById\b/.test(piAddCallbackDeps),
  `deps=[${piAddCallbackDeps.trim()}]`,
)

assert(
  'piOnAddQuestionGroup deps include the addGroups handler (any stable alias)',
  /\baddGroups\b/.test(piAddCallbackDeps) ||
    /\bpaperDraftAddGroups\b/.test(piAddCallbackDeps) ||
    /\baddGroupsToBasket\b/.test(piAddCallbackDeps),
  `deps=[${piAddCallbackDeps.trim()}] missing addGroups handler reference`,
)

// PI subtree must NOT import basket / draft internals (re-stating the Cut B
// boundary so a future refactor can't sneak the import in via Cut C).
for (const token of ['usePaperDraft', 'QuestionGroupCard', 'questionGroupById']) {
  const offenders = []
  for (const [file, src] of piSourcesByPath.entries()) {
    if (src.includes(token)) {
      offenders.push(path.relative(ROOT, file))
    }
  }
  assert(
    `PI subtree still does NOT reference "${token}" (Cut C boundary preserved)`,
    offenders.length === 0,
    `offending files: ${offenders.join(', ')}`,
  )
}

// ─── Test 12: Cut C return-to-workbench wiring ───

console.log('\nTest 12: Cut C return-to-workbench is wired without full-page reload')

// App.tsx must own a currentPiRoute mirror that actually drives PI rendering.
assert(
  'App.tsx declares a currentPiRoute state seeded from the piRoute prop',
  /const\s*\[\s*currentPiRoute\s*,\s*setCurrentPiRoute\s*\]\s*=\s*useState[\s\S]*?\(\s*piRoute\s*\)/.test(
    appSrc,
  ),
  'missing currentPiRoute useState seeded from piRoute',
)

assert(
  'App.tsx renders PaperIntelligencePreview based on currentPiRoute (NOT the boot prop)',
  /currentPiRoute\.kind\s*===\s*['"]paper-intelligence['"]/.test(appSrc),
  'PI gating still keys off the static piRoute prop',
)

assert(
  'App.tsx pulls paperId from currentPiRoute when rendering PI',
  /paperId\s*=\s*\{\s*currentPiRoute\.paperId\s*\}/.test(appSrc),
  'PI render still threads paperId from the static piRoute prop',
)

// Workbench fetch effects must depend on currentPiRoute.kind so a Cut C
// return-to-workbench actually retriggers the deferred loads.
const workbenchFetchEffectsCutC = extractUseEffects(appSrc).filter((effect) =>
  workbenchFetchTokens.some((token) => effect.includes(token)),
)
for (const token of workbenchFetchTokens) {
  const owners = workbenchFetchEffectsCutC.filter((effect) => effect.includes(token))
  assert(
    `${token} early-return guard reads currentPiRoute.kind`,
    owners.length > 0 &&
      owners.every((effect) =>
        /if\s*\(\s*currentPiRoute\.kind\s*===\s*['"]paper-intelligence['"]\s*\)\s*return/.test(
          effect,
        ),
      ),
    'effect still reads piRoute.kind directly',
  )
  assert(
    `${token} effect's dependency array includes currentPiRoute.kind`,
    owners.length > 0 &&
      owners.every((effect) => {
        const m = effect.match(/\[([^\]]*)\]\s*\)\s*$/)
        return m !== null && m[1].includes('currentPiRoute.kind')
      }),
    'currentPiRoute.kind missing from dep array',
  )
}

// piOnBackToWorkbench must call setCurrentPiRoute({ kind: 'none' }) and
// rewrite the URL via history.replaceState — never via window.location.href
// or window.location.reload.
const piOnBackBody =
  appSrc.match(
    /const piOnBackToWorkbench\s*=\s*useCallback\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*,\s*\[/,
  )?.[1] || ''

assert(
  'piOnBackToWorkbench useCallback body extracted',
  piOnBackBody.length > 0,
  '',
)

assert(
  'piOnBackToWorkbench flips currentPiRoute → { kind: \'none\' }',
  /setCurrentPiRoute\s*\(\s*\{\s*kind\s*:\s*['"]none['"]/.test(piOnBackBody),
  'missing setCurrentPiRoute to none',
)

assert(
  'piOnBackToWorkbench rewrites the URL via history.replaceState',
  /window\.history\.replaceState\s*\(/.test(piOnBackBody),
  'missing history.replaceState call',
)

assert(
  'piOnBackToWorkbench does NOT use window.location.href assignment',
  !/window\.location\.href\s*=/.test(piOnBackBody),
  'piOnBackToWorkbench reassigns window.location.href',
)

assert(
  'piOnBackToWorkbench does NOT call window.location.reload',
  !/window\.location\.reload\s*\(/.test(piOnBackBody),
  'piOnBackToWorkbench calls window.location.reload',
)

assert(
  'piOnBackToWorkbench strips the view query param',
  /searchParams\.delete\(\s*['"]view['"]/.test(piOnBackBody),
  'missing view param strip',
)

assert(
  'piOnBackToWorkbench strips the paperId query param',
  /searchParams\.delete\(\s*['"]paperId['"]/.test(piOnBackBody),
  'missing paperId param strip',
)

// PaperIntelligencePreview must render a back button surface that honors
// the onBackToWorkbench prop without touching window.location itself.
assert(
  'PaperIntelligencePreview top bar surfaces a back-to-workbench button',
  /data-pi-back-to-workbench=\s*['"]true['"]/.test(piPreviewSrc),
  'missing data-pi-back-to-workbench marker',
)

assert(
  'PaperIntelligencePreview top bar surfaces a basket badge with data-pi-basket-count',
  /data-pi-basket-count=/.test(piPreviewSrc),
  'missing data-pi-basket-count marker',
)

// Issue #20: the basket badge is now an interactive button (was a span).
// We require both the toggle marker and the dialog wiring so a future
// refactor can't silently downgrade the entry back to a static badge.
assert(
  'Issue #20: basket badge is rendered as a real <button> trigger',
  /data-pi-basket-toggle="true"/.test(piPreviewSrc) &&
    /<button[\s\S]*?data-pi-basket-toggle="true"/.test(piPreviewSrc),
  'expected a <button data-pi-basket-toggle="true"> in the top bar',
)

assert(
  'Issue #20: basket button announces popover via aria-haspopup="dialog"',
  /aria-haspopup="dialog"/.test(piPreviewSrc),
  'missing aria-haspopup="dialog" on the basket trigger',
)

assert(
  'Issue #20: basket button exposes aria-expanded bound to the open state',
  /aria-expanded=\{isBasketPreviewOpen\}/.test(piPreviewSrc),
  'aria-expanded must reflect isBasketPreviewOpen state',
)

assert(
  'Issue #20: basket popover is rendered into <body> via createPortal (delegated to AnchoredPopover)',
  /<BasketPreviewPopover[\s\S]*?<AnchoredPopover\b/.test(piPreviewSrc) ||
    /BasketPreviewPopover[\s\S]*?<AnchoredPopover\b/.test(piPreviewSrc),
  'expected BasketPreviewPopover to render <AnchoredPopover>',
)

assert(
  'Issue #20: basket popover root carries data-pi-basket-popover="true" smoke selector',
  /data-pi-basket-popover['"]?\s*:\s*['"]true['"]/.test(piPreviewSrc) ||
    /data-pi-basket-popover="true"/.test(piPreviewSrc),
  'expected a data-pi-basket-popover marker on the popover root',
)

assert(
  'Issue #20: basket popover closes on Esc keydown (closeOnEscape on AnchoredPopover)',
  /function BasketPreviewPopover[\s\S]*?<AnchoredPopover[\s\S]*?closeOnEscape/.test(
    piPreviewSrc,
  ),
  'BasketPreviewPopover must pass closeOnEscape to AnchoredPopover',
)

assert(
  'Issue #20: basket popover closes on outside mousedown (closeOnOutsidePointerDown on AnchoredPopover)',
  /function BasketPreviewPopover[\s\S]*?<AnchoredPopover[\s\S]*?closeOnOutsidePointerDown/.test(
    piPreviewSrc,
  ),
  'BasketPreviewPopover must pass closeOnOutsidePointerDown to AnchoredPopover',
)

assert(
  'Issue #20: basket popover empty state copy is present',
  /草稿卷还是空的/.test(piPreviewSrc) && /加入草稿卷/.test(piPreviewSrc),
  'empty-state copy missing — popover would render blank when basket has 0 items',
)

assert(
  'Issue #20: PI top bar uses local UI state (no global activeBasketItemId / route added)',
  /useState[\s\S]*?\bisBasketPreviewOpen\b/.test(piPreviewSrc) &&
    !/activeBasketItemId/.test(piPreviewSrc),
  'expected local isBasketPreviewOpen useState; activeBasketItemId is NOT permitted',
)

// The basket popover must NOT touch any of the question / evidence /
// insight states. Re-verify by scanning for setActiveQuestionId /
// setActiveEvidenceId / setActiveInsightSection inside the basket
// component definitions.
{
  const basketComponentRange =
    piPreviewSrc.match(
      /function\s+PaperIntelligenceTopBar[\s\S]*?function\s+ReportHeader\b/,
    )?.[0] || ''
  const popoverComponentRange =
    piPreviewSrc.match(
      /function\s+BasketPreviewPopover[\s\S]*?function\s+formatBasketScore\b/,
    )?.[0] || ''
  const basketSurface = basketComponentRange + popoverComponentRange
  assert(
    'Issue #20: basket entry components do not call setActiveQuestionId',
    !/setActiveQuestionId\s*\(/.test(basketSurface),
    'basket entry must not mutate activeQuestionId',
  )
  assert(
    'Issue #20: basket entry components do not call setActiveEvidenceId',
    !/setActiveEvidenceId\s*\(/.test(basketSurface),
    'basket entry must not mutate activeEvidenceId',
  )
  assert(
    'Issue #20: basket entry components do not call setActiveInsightSection',
    !/setActiveInsightSection\s*\(/.test(basketSurface),
    'basket entry must not mutate activeInsightSection',
  )
}

// Strip block & line comments before the window.location / history check
// so a comment that mentions the API name doesn't trigger a false positive.
const piPreviewCodeOnly = piPreviewSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

assert(
  'PaperIntelligencePreview never reaches into window.location itself',
  !/window\.location\b/.test(piPreviewCodeOnly),
  'PaperIntelligencePreview touches window.location directly',
)

assert(
  'PaperIntelligencePreview never calls history.replaceState itself',
  !/history\.replaceState\s*\(/.test(piPreviewCodeOnly),
  'PaperIntelligencePreview calls history.replaceState directly',
)

// ─── Test 13: Cut C P0 watch — useConciergeDesk has no auto network ───
//
// Reviewer P0 watch from PR #16: when the App shell renders PI, it still
// calls useConciergeDesk (the hook is composed unconditionally). Cut C
// requirement: useConciergeDesk must NOT fire network / SSE / fetch on
// mount; AI calls only happen via user-initiated submit / retryGroupDetail
// (similar-entrypoints E3 retired triggerSimilar — 配相似 is now a plain
// deep-link with zero network round-trip through this hook). We verify this
// statically: no useEffect inside the hook references runConciergeSearch /
// fetchQuestionGroupDetail (the two network seams).

console.log('\nTest 13: useConciergeDesk does NOT auto-fire network on mount')

const conciergeSrc = readFileSync(
  path.join(ROOT, 'app/src/concierge/useConciergeDesk.ts'),
  'utf-8',
)

const conciergeEffects = extractUseEffects(conciergeSrc)
for (const effect of conciergeEffects) {
  assert(
    'useConciergeDesk useEffect does not call runConciergeSearch',
    !/runConciergeSearch\s*\(/.test(effect),
    'useEffect auto-fires runConciergeSearch',
  )
  assert(
    'useConciergeDesk useEffect does not call fetchQuestionGroupDetail',
    !/fetchQuestionGroupDetail\s*\(/.test(effect),
    'useEffect auto-fires fetchQuestionGroupDetail',
  )
  assert(
    'useConciergeDesk useEffect does not open EventSource / SSE',
    !/new\s+EventSource\s*\(|\.addEventListener\s*\(\s*['"]message['"]/.test(effect),
    'useEffect opens an event stream',
  )
  assert(
    'useConciergeDesk useEffect does not call fetch() at the top',
    !/^\s*fetch\s*\(/m.test(effect),
    'useEffect auto-fires raw fetch()',
  )
}

assert(
  // similar-entrypoints (E3): triggerSimilar retired — search is now only
  // ever user-driven via submit.
  'useConciergeDesk only invokes search via user-driven submit (triggerSimilar retired)',
  /const\s+submit\s*=\s*useCallback/.test(conciergeSrc) &&
    !/triggerSimilar/.test(conciergeSrc) &&
    /await\s+runSearch\s*\(/.test(conciergeSrc),
  'submit flow not detected, or triggerSimilar still present',
)

// ─── Summary ───

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
if (issues.length > 0) {
  console.log('\nIssues:')
  issues.forEach((i) => console.log(`  - ${i}`))
}
process.exit(failed > 0 ? 1 : 0)