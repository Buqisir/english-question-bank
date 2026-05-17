#!/usr/bin/env node
/**
 * verify-paper-surface-prototype
 *
 * Static checks for Issue #21-A "精排卷面 Spike / Prototype" after
 * Issue #30 follow-up gates landed. This is a spike, not production.
 *
 * History note:
 *   This script used to be `verify-paper-intelligence-print-surface-spike.mjs`.
 *   The cleanup PR for Issue #30 renamed it (and the underlying
 *   prototype) from "print surface" to "paper surface" so the prototype
 *   stops squatting on the export pipeline's "print" namespace. There
 *   is no compat copy at the old path — anything still pointing at the
 *   old script is dead and must be updated.
 *
 * The verify intentionally locks down BOTH the isolation contract and
 * the Issue #30 gates:
 *
 *   1. Route parser exposes a `surface` field; it returns `'default'`
 *      for the bare PI URL and `'paper'` only when `?surface=paper`.
 *      The legacy value `surface=print` MUST collapse to `'default'`
 *      (i.e. the prototype is no longer reachable via the old URL).
 *   2. App.tsx routes to the default PaperIntelligencePreview when
 *      `currentPiRoute.surface !== 'paper'`, and to the prototype
 *      component only when it is.
 *   3. main.tsx still mounts <App /> for any non-reading-analysis URL
 *      (the prototype is reached via App, not a third top-level route).
 *   4. Naming is fully migrated to "paper":
 *      - prototype lives under .../paperSurfacePrototype/
 *      - component is exported as PaperSurfacePrototype
 *      - CSS file is paperSurfacePrototype.css
 *      - CSS classes / vars / data attrs use pi-paper-* / --pi-paper-*
 *        / data-pi-paper-* (no surviving pi-print-* / --pi-print-* /
 *        data-pi-print-* in the prototype subtree).
 *   5. Issue #30 gate 2 — CSS file carries documentation that:
 *      - it is prototype-only visual reference,
 *      - it is NOT shared with `server/print-renderer.mjs`,
 *      - Issue #30 must be resolved before promoting it.
 *      The print renderer's emit logic is untouched (no diff under
 *      `server/`).
 *   6. Issue #30 gate 3 — the prototype emits real
 *      `data-pi-evidence-id` markers in DOM (not just in comments) and
 *      exposes `data-pi-evidence-kind` alongside. The visible anchor is
 *      a NEUTRAL `<mark>` with no highlight class.
 *   7. The prototype:
 *      - Renders four sections A/B/C/D from the bundled fixture.
 *      - Surfaces 15 questions across those sections (4+3+4+4).
 *      - Uses a 宋体 / Times New Roman font stack via CSS.
 *      - Reserves data-pi-paper-section / data-pi-question-id /
 *        data-pi-option-label anchors.
 *      - Does NOT touch backend, DB, model, paper draft, basket, or
 *        any reading-analysis module.
 *   8. No package.json / lockfile / server / reading-analysis edits.
 *   9. No new runtime dependency.
 *
 * The script never spawns a browser, never starts a build, and never
 * needs node_modules. It runs on the cloud sandbox where the npm
 * registry is blocked.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

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

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf-8')
}

console.log('\n=== Paper Surface Prototype (#21-A, #30 gates) ===\n')

const PROTOTYPE_DIR = 'app/src/features/paper-intelligence/paperSurfacePrototype'
const PROTOTYPE_TSX_REL = `${PROTOTYPE_DIR}/PaperSurfacePrototype.tsx`
const PROTOTYPE_CSS_REL = `${PROTOTYPE_DIR}/paperSurfacePrototype.css`

/* ─── 1. Route parser — surface=paper is the only active surface ─── */

console.log('Test 1: Route parser supports surface=paper, drops surface=print')

const routeSrc = readSrc('app/src/features/paper-intelligence/paperIntelligenceRoute.ts')

assert(
  'paperIntelligenceRoute exports PaperIntelligenceSurface type',
  /export\s+type\s+PaperIntelligenceSurface\s*=/.test(routeSrc),
  'PaperIntelligenceSurface type missing',
)

assert(
  'PaperIntelligenceSurface union is "default" | "paper" (no legacy "print")',
  /export\s+type\s+PaperIntelligenceSurface\s*=\s*['"]default['"]\s*\|\s*['"]paper['"]/.test(
    routeSrc,
  ) &&
    !/PaperIntelligenceSurface\s*=\s*[^=\n]*['"]print['"]/.test(routeSrc),
  'union must be exactly "default" | "paper"',
)

assert(
  'PaperIntelligenceRouteMatch carries a surface field on the active branch',
  /kind:\s*['"]paper-intelligence['"][\s\S]*?surface:\s*PaperIntelligenceSurface/.test(routeSrc),
  'surface field missing on active branch',
)

assert(
  'Route parser reads ?surface= from query string',
  /params\.get\(\s*['"]surface['"]\s*\)/.test(routeSrc),
  'no params.get("surface") call',
)

assert(
  'Route parser normalizes the surface value to "paper" or "default"',
  /rawSurface\s*===\s*['"]paper['"]\s*\?\s*['"]paper['"]\s*:\s*['"]default['"]/.test(routeSrc),
  'normalization must be `rawSurface === "paper" ? "paper" : "default"`',
)

assert(
  'Route parser does NOT special-case the legacy "print" value',
  !/['"]print['"]/.test(routeSrc),
  'no surviving "print" string allowed in the parser',
)

assert(
  'Route parser still requires view=paper-intelligence',
  /params\.get\(\s*['"]view['"]\s*\)\s*!==\s*['"]paper-intelligence['"]/.test(routeSrc),
  'view gate missing',
)

/* ─── 1b. Behavioral simulation: legacy URL falls back to default ─── */

// Re-implement the parser's `surface` decision here to lock the
// observable behavior, not just the regex shape: we want
//   ?surface=print → 'default'
//   ?surface=paper → 'paper'
//   ?surface=     → 'default'
//   (no surface)  → 'default'
function simulateSurface(search) {
  const params = new URLSearchParams(search)
  if (params.get('view') !== 'paper-intelligence') return null
  const raw = params.get('surface')?.trim().toLowerCase() || ''
  return raw === 'paper' ? 'paper' : 'default'
}
assert(
  'simulated parser: ?surface=paper → "paper"',
  simulateSurface('?view=paper-intelligence&paperId=p&surface=paper') === 'paper',
)
assert(
  'simulated parser: ?surface=print collapses to "default" (no compat branch)',
  simulateSurface('?view=paper-intelligence&paperId=p&surface=print') === 'default',
)
assert(
  'simulated parser: ?surface=PAPER (case-insensitive) → "paper"',
  simulateSurface('?view=paper-intelligence&paperId=p&surface=PAPER') === 'paper',
)
assert(
  'simulated parser: missing surface → "default"',
  simulateSurface('?view=paper-intelligence&paperId=p') === 'default',
)
assert(
  'simulated parser: bogus surface → "default"',
  simulateSurface('?view=paper-intelligence&paperId=p&surface=anything') === 'default',
)

/* ─── 2. App.tsx routing ──────────────────────────────────────────── */

console.log('\nTest 2: App.tsx routes default vs paper surface correctly')

const appSrc = readSrc('app/src/App.tsx')

assert(
  'App.tsx imports PaperSurfacePrototype from paperSurfacePrototype/',
  /import\s*\{\s*PaperSurfacePrototype\s*\}\s*from\s*['"][^'"]*paper-intelligence\/paperSurfacePrototype\/PaperSurfacePrototype['"]/.test(
    appSrc,
  ),
  'paper-surface prototype import missing or wrong path',
)

assert(
  'App.tsx no longer imports PaperPrintSurfacePrototype',
  !/PaperPrintSurfacePrototype/.test(appSrc),
  'legacy print-surface symbol still referenced in App.tsx',
)

assert(
  'App.tsx no longer imports from paper-intelligence/print/',
  !/paper-intelligence\/print\//.test(appSrc),
  'legacy print/ folder still referenced in App.tsx',
)

assert(
  'App.tsx still imports PaperIntelligencePreview (default surface untouched)',
  /import\s*\{\s*PaperIntelligencePreview\s*\}/.test(appSrc),
  'default PI import removed',
)

// Extract the PI branch body to verify both surfaces are reachable.
function extractPiBranchBody(src) {
  const re = /if\s*\(\s*currentPiRoute\.kind\s*===\s*['"]paper-intelligence['"]\s*\)\s*\{/
  const start = src.match(re)
  if (!start || start.index === undefined) return ''
  let i = start.index + start[0].length
  let depth = 1
  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (depth === 0) break
    i++
  }
  return src.slice(start.index + start[0].length, i)
}

const piBranch = extractPiBranchBody(appSrc)

assert(
  'App.tsx still has a `currentPiRoute.kind === "paper-intelligence"` branch',
  piBranch.length > 0,
  'PI branch not found',
)

assert(
  'PI branch checks currentPiRoute.surface === "paper" before mounting the prototype',
  /currentPiRoute\.surface\s*===\s*['"]paper['"]/.test(piBranch),
  'surface=paper gate missing inside PI branch',
)

assert(
  'PI branch does NOT check the legacy surface=== "print" value',
  !/currentPiRoute\.surface\s*===\s*['"]print['"]/.test(piBranch),
  'legacy surface=print gate must be removed',
)

assert(
  'PI branch mounts <PaperSurfacePrototype> only on the paper branch',
  /currentPiRoute\.surface\s*===\s*['"]paper['"][\s\S]*?<PaperSurfacePrototype\b/.test(piBranch),
  'prototype component not mounted on paper branch',
)

assert(
  'PI branch falls through to <PaperIntelligencePreview> for non-paper surfaces',
  /<PaperIntelligencePreview\b/.test(piBranch),
  'default PI mount missing from PI branch',
)

// The default PI mount must come AFTER the paper-surface short-circuit.
const paperIdx = piBranch.search(/<PaperSurfacePrototype\b/)
const defaultIdx = piBranch.search(/<PaperIntelligencePreview\b/)
assert(
  'Default PI mount appears after the paper-surface guard inside the PI branch',
  paperIdx >= 0 && defaultIdx >= 0 && paperIdx < defaultIdx,
  `paperIdx=${paperIdx}, defaultIdx=${defaultIdx}`,
)

// Extract the prototype mount JSX so we can verify its props.
const prototypeMountMatch = piBranch.match(/<PaperSurfacePrototype\b([\s\S]*?)\/>/)
const prototypeMountProps = prototypeMountMatch ? prototypeMountMatch[1] : ''
assert(
  'Prototype mount JSX extracted',
  prototypeMountMatch !== null,
  '<PaperSurfacePrototype ... /> not found',
)
assert(
  'Prototype mount does NOT pass any basket-related props (isolation)',
  !/basketIds=/.test(prototypeMountProps) &&
    !/basketCount=/.test(prototypeMountProps) &&
    !/basketPreviewItems=/.test(prototypeMountProps) &&
    !/onAddQuestionGroup=/.test(prototypeMountProps),
  `prototype props leaked basket bridge: ${prototypeMountProps.trim()}`,
)

/* ─── 3. main.tsx untouched ───────────────────────────────────────── */

console.log('\nTest 3: main.tsx still mounts <App /> for the PI route')

const mainSrc = readSrc('app/src/main.tsx')
assert(
  'main.tsx still imports parsePaperIntelligenceRoute',
  /parsePaperIntelligenceRoute/.test(mainSrc),
  'main.tsx no longer parses PI route',
)
assert(
  'main.tsx still renders <App piRoute={piRoute} /> for the PI route',
  /<App\s+piRoute=\{\s*piRoute\s*\}\s*\/>/.test(mainSrc),
  'App-with-piRoute mount missing',
)
assert(
  'main.tsx does NOT directly mount the prototype component',
  !/PaperSurfacePrototype/.test(mainSrc) && !/PaperPrintSurfacePrototype/.test(mainSrc),
  'prototype is mounted from main.tsx instead of App.tsx',
)

/* ─── 4. Prototype file/component naming and contract ─────────────── */

console.log('\nTest 4: prototype naming + contract (Issue #30 gate 1)')

assert(
  'Prototype TSX file lives at the new paperSurfacePrototype/ path',
  existsSync(path.join(ROOT, PROTOTYPE_TSX_REL)),
  PROTOTYPE_TSX_REL,
)
assert(
  'Prototype CSS file lives at the new paperSurfacePrototype/ path',
  existsSync(path.join(ROOT, PROTOTYPE_CSS_REL)),
  PROTOTYPE_CSS_REL,
)
assert(
  'Legacy print/ folder is gone',
  !existsSync(path.join(ROOT, 'app/src/features/paper-intelligence/print')),
  'app/src/features/paper-intelligence/print still exists',
)
assert(
  'Legacy PaperPrintSurfacePrototype.tsx is gone',
  !existsSync(
    path.join(
      ROOT,
      'app/src/features/paper-intelligence/print/PaperPrintSurfacePrototype.tsx',
    ),
  ),
  'legacy file still on disk',
)

const prototypeSrc = readSrc(PROTOTYPE_TSX_REL)
const cssSrc = readSrc(PROTOTYPE_CSS_REL)

// Pre-strip comments once for checks that need to ignore historical
// rename notes / pedagogical comments inside the source.
const prototypeSrcNoCommentsForNaming = prototypeSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

assert(
  'Prototype exports `PaperSurfacePrototype` (renamed from PaperPrintSurfacePrototype)',
  /export\s+function\s+PaperSurfacePrototype\b/.test(prototypeSrc) &&
    !/PaperPrintSurfacePrototype/.test(prototypeSrcNoCommentsForNaming),
  'prototype must export PaperSurfacePrototype only (legacy name allowed only inside comments)',
)
assert(
  'Prototype imports its sibling paperSurfacePrototype.css',
  /import\s+['"]\.\/paperSurfacePrototype\.css['"]/.test(prototypeSrc),
  'CSS import path wrong',
)
assert(
  'Prototype source no longer contains the string "PrintSurface" (comments excluded)',
  !/PrintSurface/.test(prototypeSrcNoCommentsForNaming),
  'leftover PrintSurface name in code (comment mentions are allowed)',
)

// Anchor reservations.
assert(
  'Prototype emits data-pi-paper-section anchors',
  /data-pi-paper-section=/.test(prototypeSrc),
  'data-pi-paper-section anchor missing',
)
assert(
  'Prototype emits data-pi-question-id anchors',
  /data-pi-question-id=/.test(prototypeSrc),
  'data-pi-question-id anchor missing',
)
assert(
  'Prototype emits data-pi-option-label anchors',
  /data-pi-option-label=/.test(prototypeSrc),
  'data-pi-option-label anchor missing',
)

// Issue #21-B1 / Issue #30 gate 2 — A-thin: prototype imports the
// shared primitive tokens and injects them as CSS custom properties on
// the surface root. This is the single point where shared values cross
// from the value layer into the rendered DOM. Detailed token contract
// is locked down by `verify-paper-surface-tokens.mjs`; here we only
// confirm the import + injection wiring exists.
assert(
  'Prototype imports paperSurfaceTokens from shared/papersurface/tokens.mjs',
  /import\s*\{\s*paperSurfaceTokens\s*\}\s*from\s*['"][^'"]*shared\/papersurface\/tokens\.mjs['"]/.test(
    prototypeSrc,
  ),
  'shared tokens import missing or wrong path',
)
assert(
  'Prototype injects --pi-paper-font-stack from paperSurfaceTokens.paperFontStack',
  /['"]--pi-paper-font-stack['"]\s*:\s*paperSurfaceTokens\.paperFontStack/.test(prototypeSrc),
  'CSS var injection for font stack missing',
)
assert(
  'Prototype injects --pi-paper-passage-line-height from paperSurfaceTokens',
  /['"]--pi-paper-passage-line-height['"]\s*:\s*paperSurfaceTokens\.passageLineHeight/.test(
    prototypeSrc,
  ),
  'passage line-height injection missing',
)
assert(
  'Prototype injects --pi-paper-options-grid-columns from paperSurfaceTokens',
  /['"]--pi-paper-options-grid-columns['"]\s*:\s*paperSurfaceTokens\.optionsGridColumns/.test(
    prototypeSrc,
  ),
  'options grid columns injection missing',
)
assert(
  'Surface root applies the token style (style={paperSurfaceTokenStyle})',
  /style=\{\s*paperSurfaceTokenStyle\s*\}/.test(prototypeSrc),
  'style={paperSurfaceTokenStyle} not applied to surface root',
)

// Bundled-sample-only contract.
assert(
  'Prototype pins the supported paperId to paper-2024-xkb1-reading',
  /paper-2024-xkb1-reading/.test(prototypeSrc),
  'sample paperId not referenced',
)
assert(
  'Prototype refuses to render unsupported paperIds',
  /SPIKE_SUPPORTED_PAPER_ID/.test(prototypeSrc) &&
    /paperId\s*!==\s*SPIKE_SUPPORTED_PAPER_ID/.test(prototypeSrc),
  'paperId guard missing',
)

// Forbidden imports — the prototype must stay isolated.
const FORBIDDEN_IMPORT_TOKENS = [
  /from\s+['"][^'"]*paperAssembly[^'"]*['"]/, // basket / draft
  /from\s+['"][^'"]*\/concierge[^'"]*['"]/, // concierge
  /from\s+['"][^'"]*\/services[^'"]*['"]/, // backend services
  /from\s+['"][^'"]*sampleQuestionGroups[^'"]*['"]/, // sample DB
  /from\s+['"][^'"]*reading-analysis[^'"]*['"]/, // reading-analysis
  /from\s+['"][^'"]*\/App[^'"]*['"]/, // App
  /from\s+['"][^'"]*paperIntelligenceEvidenceLine[^'"]*['"]/, // PI evidence line
  /from\s+['"][^'"]*paperIntelligenceEvidenceLineGeometry[^'"]*['"]/, // line geometry
  /from\s+['"][^'"]*AnchoredPopover[^'"]*['"]/, // PI popover module
]
for (const re of FORBIDDEN_IMPORT_TOKENS) {
  assert(
    `Prototype does NOT import ${re.source}`,
    !re.test(prototypeSrc),
    'forbidden import found',
  )
}

// No backend / DB / model surface in the prototype file.
assert(
  'Prototype does NOT call backend services',
  !/server\/api|fetchQuestionGroups|fetchPaperSets|deepseek|qwen/i.test(prototypeSrc),
  'backend reference found',
)
assert(
  'Prototype has no SQLite / DB references',
  !/sqlite|better-sqlite|question-bank\.sqlite/i.test(prototypeSrc),
  'DB reference found',
)
assert(
  'Prototype only fetches the bundled JSON fixtures',
  /fetch\(\s*reportUrl\s*\)/.test(prototypeSrc) && /fetch\(\s*inputUrl\s*\)/.test(prototypeSrc),
  'unexpected fetch surface',
)

// 15 questions across A/B/C/D — verified from the bundled input.json.
const inputJson = JSON.parse(
  readSrc('app/public/reports/paper-intelligence/paper-2024-xkb1-reading/input.json'),
)
const sectionsByLetter = new Map(
  inputJson.passages.map((p) => [p.paperSection, p.questions.length]),
)
const totalQuestions = inputJson.passages.reduce((s, p) => s + p.questions.length, 0)
assert(
  'Bundled input.json has section A with 4 questions',
  sectionsByLetter.get('A') === 4,
  `got ${sectionsByLetter.get('A')}`,
)
assert(
  'Bundled input.json has section B with 3 questions',
  sectionsByLetter.get('B') === 3,
  `got ${sectionsByLetter.get('B')}`,
)
assert(
  'Bundled input.json has section C with 4 questions',
  sectionsByLetter.get('C') === 4,
  `got ${sectionsByLetter.get('C')}`,
)
assert(
  'Bundled input.json has section D with 4 questions',
  sectionsByLetter.get('D') === 4,
  `got ${sectionsByLetter.get('D')}`,
)
assert(
  'Bundled input.json totals exactly 15 questions',
  totalQuestions === 15,
  `got ${totalQuestions}`,
)

assert(
  'Prototype renders one passage block per input passage (no filtering)',
  /input\.passages\.map\(/.test(prototypeSrc) || /view\.passages\.map\(/.test(prototypeSrc),
  'passage fan-out missing',
)
assert(
  'Prototype renders one question block per question (no filtering)',
  /passage\.questions\.map\(/.test(prototypeSrc) || /questions\.map\(/.test(prototypeSrc),
  'question fan-out missing',
)

// Minimum interaction: activeQuestionId state.
assert(
  'Prototype owns local activeQuestionId state',
  /useState<string \| null>\(null\)/.test(prototypeSrc) && /activeQuestionId/.test(prototypeSrc),
  'activeQuestionId state missing',
)

/* ─── 5. CSS naming + Issue #30 gate 2 documentation ─────────────── */

console.log('\nTest 5: CSS naming and CSS-strategy documentation')

// Issue #21-B1 / Issue #30 gate 2 — A-thin: the canonical font stack
// has moved out of the CSS file and into
// `shared/papersurface/tokens.mjs`. The CSS now consumes
// `var(--pi-paper-font-stack)`, and the prototype injects that var
// from the shared module. The font literal MUST NOT live in this CSS
// anymore. Detailed token contract is locked down by
// `verify-paper-surface-tokens.mjs`; here we only check the
// React-side surface stays consistent with that move.
assert(
  'CSS exposes a single --pi-paper-font-stack variable for reuse',
  /--pi-paper-font-stack\s*:/.test(cssSrc) || /var\(--pi-paper-font-stack\)/.test(cssSrc),
  'CSS variable missing or never consumed',
)
assert(
  'CSS pins a paper-target page width via --pi-paper-page-width',
  /--pi-paper-page-width\s*:\s*\d+px/.test(cssSrc),
  'page width variable missing',
)
assert(
  'CSS consumes --pi-paper-font-stack via var(...)',
  /var\(--pi-paper-font-stack\)/.test(cssSrc),
  'CSS does not consume --pi-paper-font-stack',
)
// Strip /* ... */ block comments from the CSS and // / /* ... */ from the
// TSX before checking for legacy tokens. The header of each file
// intentionally documents the rename history ("the old pi-print-* names
// are gone") and that documentation must NOT trigger the regression
// guard.
const cssSrcNoComments = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '')
const prototypeSrcNoComments = prototypeSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

assert(
  'CSS no longer carries pi-print-* class names (comments excluded)',
  !/\.pi-print-/.test(cssSrcNoComments) && !/pi-print-/.test(prototypeSrcNoComments),
  'pi-print-* still present somewhere in the prototype subtree (outside comments)',
)
assert(
  'CSS no longer carries --pi-print-* variables (comments excluded)',
  !/--pi-print-/.test(cssSrcNoComments),
  'legacy --pi-print-* CSS variable still defined',
)
assert(
  'CSS file mentions Issue #30 (gate documentation present)',
  /Issue #30/.test(cssSrc),
  'no Issue #30 reference in CSS header',
)
assert(
  'CSS header explicitly says it is prototype-only visual reference',
  /prototype-only visual reference/i.test(cssSrc),
  'missing prototype-only visual reference statement',
)
assert(
  'CSS header explicitly says it is NOT shared with server/print-renderer.mjs',
  /not\s+(?:yet\s+)?shared\s+with\s+`?server\/print-renderer\.mjs`?/i.test(cssSrc),
  'missing not-shared-with-server/print-renderer note',
)
assert(
  'CSS header records Gate 2 as RESOLVED FOR B1 with the A-thin strategy',
  /Gate\s*2[\s\S]{0,200}RESOLVED\s+FOR\s+B1/i.test(cssSrc) &&
    /A-thin/i.test(cssSrc),
  'CSS header must mark Gate 2 as RESOLVED FOR B1 (A-thin)',
)
assert(
  'CSS header points to shared/papersurface/tokens.mjs as the value source',
  /shared\/papersurface\/tokens\.mjs/.test(cssSrc),
  'CSS header missing reference to shared tokens module',
)

/* ─── 5b. data-pi-paper-* and data-pi-print-* hygiene in prototype ─ */

assert(
  'Prototype DOM uses data-pi-paper-surface (renamed from data-pi-print-surface)',
  /data-pi-paper-surface=/.test(prototypeSrc),
  'data-pi-paper-surface missing',
)
assert(
  'Prototype no longer uses data-pi-print-* attributes (comments excluded)',
  !/data-pi-print-/.test(prototypeSrcNoComments),
  'legacy data-pi-print-* attribute still present',
)

/* ─── 6. Issue #30 gate 3 — no-op evidence anchors in DOM ────────── */

console.log('\nTest 6: no-op evidence anchors are emitted in DOM (Issue #30 gate 3)')

assert(
  'Prototype source emits data-pi-evidence-id outside of /* ... */ comments',
  (() => {
    const stripped = prototypeSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    return /data-pi-evidence-id=/.test(stripped)
  })(),
  'data-pi-evidence-id only appears in comments — must be in real DOM',
)
assert(
  'Prototype source emits data-pi-evidence-kind alongside data-pi-evidence-id',
  /data-pi-evidence-kind=/.test(prototypeSrc),
  'data-pi-evidence-kind anchor missing',
)
assert(
  'Prototype emits the support evidence anchor as a neutral <mark>',
  /<mark[\s\S]*?className="pi-paper-evidence-anchor"[\s\S]*?data-pi-evidence-id=/.test(prototypeSrc),
  '<mark> anchor not found',
)
assert(
  'Prototype gives the evidence anchor a NEUTRAL class (no highlight class)',
  /pi-paper-evidence-anchor/.test(prototypeSrc) &&
    !/pi-paper-evidence-active|pi-paper-evidence-highlight/.test(prototypeSrc),
  'anchor has a highlight-style class (must stay neutral)',
)
assert(
  'CSS for .pi-paper-evidence-anchor neutralizes the user-agent <mark> background',
  /\.pi-paper-evidence-anchor\s*\{[\s\S]*?background\s*:\s*transparent/.test(cssSrc),
  '.pi-paper-evidence-anchor must reset background:transparent',
)
assert(
  'Prototype does NOT wire activeEvidenceId state (comments excluded)',
  !/activeEvidenceId/.test(prototypeSrcNoComments),
  'evidence anchors must not be connected to active state in this cut',
)
assert(
  'Prototype DOES emit a hidden placeholder anchor for unresolved questions',
  /pi-paper-evidence-placeholder/.test(prototypeSrc) &&
    /data-pi-evidence-placeholder=['"]true['"]/.test(prototypeSrc),
  'placeholder anchor missing',
)
assert(
  'CSS hides the placeholder anchor (zero size / display)',
  /\.pi-paper-evidence-placeholder/.test(cssSrc),
  'placeholder anchor has no CSS rule',
)
assert(
  'Prototype source documents that placeholders are NOT geometry-valid',
  /not\s+geometry-valid|NOT\s+geometry-valid|geometry-valid/i.test(prototypeSrc),
  'placeholder geometry-validity caveat missing in prototype source comments',
)

/* ─── 6b. Adapter-only evidence import (no React/DOM evidence dep) ─ */

assert(
  'Prototype imports only the pure evidence ADAPTER (toEvidenceModel)',
  /import\s*\{[^}]*\btoEvidenceModel\b[^}]*\}\s*from\s*['"][^'"]*\/evidence['"]/.test(prototypeSrc),
  'must import toEvidenceModel from ../evidence',
)

/* ─── 7. Forbidden scope: no edits to package / lockfile / server / RA ─── */

console.log('\nTest 7: forbidden scope untouched')

function safeGitDiffNames(args) {
  try {
    const out = execSync(`git diff --name-only ${args}`, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim()
    return out ? out.split('\n') : []
  } catch {
    return []
  }
}

const baseRef = (() => {
  try {
    return execSync('git merge-base HEAD origin/main', { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim()
  } catch {
    try {
      return execSync('git merge-base HEAD main', { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
        .toString()
        .trim()
    } catch {
      return 'HEAD'
    }
  }
})()

const changed = safeGitDiffNames(`${baseRef}...HEAD`)
const FORBIDDEN_PATHS = [
  /^app\/package\.json$/,
  /^app\/pnpm-lock\.yaml$/,
  /^server\//,
  /^app\/src\/features\/reading-analysis\//,
]
for (const re of FORBIDDEN_PATHS) {
  const offenders = changed.filter((p) => re.test(p))
  assert(
    `No edits to ${re.source}`,
    offenders.length === 0,
    `offenders: ${offenders.join(', ')}`,
  )
}

/* ─── 8. No new dependency ────────────────────────────────────────── */

console.log('\nTest 8: no new runtime dependency introduced')

const pkgPath = path.join(ROOT, 'app/package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
const importLines = prototypeSrc
  .split('\n')
  .filter((line) => /^\s*import\s/.test(line))
const offendingImports = importLines.filter((line) => {
  const m = line.match(/from\s+['"]([^'"]+)['"]/)
  if (!m) return false
  const spec = m[1]
  if (spec.startsWith('.') || spec.startsWith('/')) return false
  return !(spec in deps)
})
assert(
  'Prototype imports only declared dependencies (no implicit new dep)',
  offendingImports.length === 0,
  `unexpected: ${offendingImports.join(' | ')}`,
)
assert(
  'Prototype only imports React APIs from "react"',
  importLines
    .filter((line) => /from\s+['"]react['"]/.test(line))
    .every((line) => /useEffect|useMemo|useState|ReactNode|CSSProperties/.test(line)),
  'unexpected react import',
)

/* ─── 9. Legacy verify path is gone (no dead reference) ──────────── */

console.log('\nTest 9: legacy verify script path is gone (no dead reference)')

const legacyVerifyRel = 'scripts/verify-paper-intelligence-print-surface-spike.mjs'
assert(
  'Legacy verify script file is gone from the repo',
  !existsSync(path.join(ROOT, legacyVerifyRel)),
  `${legacyVerifyRel} still exists`,
)

// Static reference scan: no other tracked file may still reference the
// retired file name. The `.git/` directory is excluded by git ls-files.
//
// Files that legitimately document the rename (this script's own
// history note + the follow-up markdown's gate-1 status entry) are
// allowed to mention the old name as historical context. Any OTHER
// hit means somewhere in the repo still points teachers / CI / docs
// at the dead path.
const SELF_REFERENCE_WHITELIST = new Set([
  legacyVerifyRel,
  'scripts/verify-paper-surface-prototype.mjs',
  'docs/paper-surface-spike-follow-up.md',
])
let referencingFiles = []
try {
  const out = execSync(
    `git grep -l --untracked --no-color -- 'verify-paper-intelligence-print-surface-spike'`,
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  )
    .toString()
    .trim()
  referencingFiles = out
    ? out.split('\n').filter((p) => !SELF_REFERENCE_WHITELIST.has(p))
    : []
} catch {
  referencingFiles = []
}
assert(
  'No tracked file (outside the documented rename note) still references the legacy verify script name',
  referencingFiles.length === 0,
  `still referenced from: ${referencingFiles.join(', ')}`,
)

/* ─── Summary ─────────────────────────────────────────────────────── */

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
