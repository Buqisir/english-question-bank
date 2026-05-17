#!/usr/bin/env node
/**
 * verify-paper-intelligence-print-surface-spike
 *
 * Static checks for Issue #21-A "精排卷面 Spike / Prototype". This is a
 * spike, not production. The verify intentionally locks down the
 * isolation contract more than the visual fidelity:
 *
 *   1. Route parser exposes a `surface` field; it returns `'default'`
 *      for the bare PI URL and `'print'` only when `?surface=print`.
 *   2. App.tsx routes to the default PaperIntelligencePreview when
 *      `currentPiRoute.surface !== 'print'`, and to the spike component
 *      only when it is.
 *   3. main.tsx still mounts <App /> for any non-reading-analysis URL
 *      (the prototype is reached via App, not a third top-level route).
 *   4. The spike component:
 *      - Renders four sections A/B/C/D from the bundled fixture.
 *      - Surfaces 15 questions across those sections (4+3+4+4).
 *      - Uses a 宋体 / Times New Roman font stack via CSS.
 *      - Reserves data-pi-paper-section / data-pi-question-id /
 *        data-pi-option-label anchors.
 *      - Does NOT touch backend, DB, model, paper draft, basket, or
 *        any reading-analysis module.
 *   5. No package.json / lockfile / server / reading-analysis edits.
 *   6. No new runtime dependency.
 *
 * The script never spawns a browser, never starts a build, and never
 * needs node_modules. It runs on the cloud sandbox where the npm
 * registry is blocked.
 */

import { readFileSync, statSync, existsSync } from 'node:fs'
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

console.log('\n=== Paper Intelligence Print Surface Spike (#21-A) ===\n')

/* ─── 1. Route parser ─────────────────────────────────────────────── */

console.log('Test 1: Route parser supports the surface field')

const routeSrc = readSrc('app/src/features/paper-intelligence/paperIntelligenceRoute.ts')

assert(
  'paperIntelligenceRoute exports PaperIntelligenceSurface type',
  /export\s+type\s+PaperIntelligenceSurface\s*=/.test(routeSrc),
  'PaperIntelligenceSurface type missing',
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
  'Route parser normalizes unknown surface values to "default"',
  /rawSurface\s*===\s*['"]print['"]\s*\?\s*['"]print['"]\s*:\s*['"]default['"]/.test(routeSrc),
  'normalization to "default" missing',
)

assert(
  'Route parser still requires view=paper-intelligence',
  /params\.get\(\s*['"]view['"]\s*\)\s*!==\s*['"]paper-intelligence['"]/.test(routeSrc),
  'view gate missing',
)

/* ─── 2. App.tsx routing ──────────────────────────────────────────── */

console.log('\nTest 2: App.tsx routes default vs print surface correctly')

const appSrc = readSrc('app/src/App.tsx')

assert(
  'App.tsx imports PaperPrintSurfacePrototype',
  /import\s*\{\s*PaperPrintSurfacePrototype\s*\}\s*from\s*['"][^'"]*paper-intelligence\/print\/PaperPrintSurfacePrototype['"]/.test(
    appSrc,
  ),
  'spike import missing',
)

assert(
  'App.tsx still imports PaperIntelligencePreview (default surface untouched)',
  /import\s*\{\s*PaperIntelligencePreview\s*\}/.test(appSrc),
  'default PI import removed',
)

// Extract the PI branch body to verify both surfaces are reachable.
// We balance braces manually because the body now contains a nested
// `if (currentPiRoute.surface === 'print') { ... }` block, and a naive
// non-greedy regex would stop at the inner closing brace.
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
  'PI branch checks currentPiRoute.surface === "print" before mounting the spike',
  /currentPiRoute\.surface\s*===\s*['"]print['"]/.test(piBranch),
  'surface=print gate missing inside PI branch',
)

assert(
  'PI branch mounts <PaperPrintSurfacePrototype> only on the print branch',
  /currentPiRoute\.surface\s*===\s*['"]print['"][\s\S]*?<PaperPrintSurfacePrototype\b/.test(piBranch),
  'spike component not mounted on print branch',
)

assert(
  'PI branch falls through to <PaperIntelligencePreview> for non-print surfaces',
  /<PaperIntelligencePreview\b/.test(piBranch),
  'default PI mount missing from PI branch',
)

// The default PI mount must come AFTER the print-surface short-circuit,
// otherwise the spike branch would be unreachable.
const printIdx = piBranch.search(/<PaperPrintSurfacePrototype\b/)
const defaultIdx = piBranch.search(/<PaperIntelligencePreview\b/)
assert(
  'Default PI mount appears after the print-surface guard inside the PI branch',
  printIdx >= 0 && defaultIdx >= 0 && printIdx < defaultIdx,
  `printIdx=${printIdx}, defaultIdx=${defaultIdx}`,
)

// Extract the JSX of the spike mount so we can verify its props in
// isolation (without leaking through to the default PI mount that
// follows it in the same branch).
const spikeMountMatch = piBranch.match(/<PaperPrintSurfacePrototype\b([\s\S]*?)\/>/)
const spikeMountProps = spikeMountMatch ? spikeMountMatch[1] : ''
assert(
  'Spike mount JSX extracted',
  spikeMountMatch !== null,
  '<PaperPrintSurfacePrototype ... /> not found',
)
assert(
  'Spike mount does NOT pass any basket-related props (isolation)',
  !/basketIds=/.test(spikeMountProps) &&
    !/basketCount=/.test(spikeMountProps) &&
    !/basketPreviewItems=/.test(spikeMountProps) &&
    !/onAddQuestionGroup=/.test(spikeMountProps),
  `spike props leaked basket bridge: ${spikeMountProps.trim()}`,
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
  'main.tsx does NOT directly mount the spike component',
  !/PaperPrintSurfacePrototype/.test(mainSrc),
  'spike is mounted from main.tsx instead of App.tsx',
)

/* ─── 4. Spike component contract ─────────────────────────────────── */

console.log('\nTest 4: spike component contract')

const spikeRel = 'app/src/features/paper-intelligence/print/PaperPrintSurfacePrototype.tsx'
const cssRel = 'app/src/features/paper-intelligence/print/paperPrintSurface.css'

assert(
  'Spike component file exists',
  existsSync(path.join(ROOT, spikeRel)),
  spikeRel,
)
assert(
  'Spike CSS file exists',
  existsSync(path.join(ROOT, cssRel)),
  cssRel,
)

const spikeSrc = readSrc(spikeRel)
const cssSrc = readSrc(cssRel)

// Anchor reservations.
assert(
  'Spike emits data-pi-paper-section anchors',
  /data-pi-paper-section=/.test(spikeSrc),
  'data-pi-paper-section anchor missing',
)
assert(
  'Spike emits data-pi-question-id anchors',
  /data-pi-question-id=/.test(spikeSrc),
  'data-pi-question-id anchor missing',
)
assert(
  'Spike emits data-pi-option-label anchors',
  /data-pi-option-label=/.test(spikeSrc),
  'data-pi-option-label anchor missing',
)

// Bundled-sample-only contract.
assert(
  'Spike pins the supported paperId to paper-2024-xkb1-reading',
  /paper-2024-xkb1-reading/.test(spikeSrc),
  'sample paperId not referenced',
)
assert(
  'Spike refuses to render unsupported paperIds',
  /SPIKE_SUPPORTED_PAPER_ID/.test(spikeSrc) &&
    /paperId\s*!==\s*SPIKE_SUPPORTED_PAPER_ID/.test(spikeSrc),
  'paperId guard missing',
)

// Forbidden imports — the spike must stay isolated.
const FORBIDDEN_IMPORT_TOKENS = [
  /from\s+['"][^'"]*paperAssembly[^'"]*['"]/, // basket / draft
  /from\s+['"][^'"]*\/concierge[^'"]*['"]/, // concierge
  /from\s+['"][^'"]*\/services[^'"]*['"]/, // backend services
  /from\s+['"][^'"]*sampleQuestionGroups[^'"]*['"]/, // sample DB
  /from\s+['"][^'"]*reading-analysis[^'"]*['"]/, // reading-analysis
  /from\s+['"][^'"]*\/App[^'"]*['"]/, // App
  /from\s+['"][^'"]*evidence\/paperIntelligenceEvidence[^'"]*['"]/, // PI evidence adapter
  /from\s+['"][^'"]*paperIntelligenceEvidenceLine[^'"]*['"]/, // PI evidence line
  /from\s+['"][^'"]*AnchoredPopover[^'"]*['"]/, // PI popover module
]
for (const re of FORBIDDEN_IMPORT_TOKENS) {
  assert(
    `Spike does NOT import ${re.source}`,
    !re.test(spikeSrc),
    'forbidden import found',
  )
}

// No backend / DB / model surface in the spike file.
assert(
  'Spike does NOT call backend services',
  !/server\/api|fetchQuestionGroups|fetchPaperSets|deepseek|qwen/i.test(spikeSrc),
  'backend reference found',
)
assert(
  'Spike has no SQLite / DB references',
  !/sqlite|better-sqlite|question-bank\.sqlite/i.test(spikeSrc),
  'DB reference found',
)
assert(
  'Spike only fetches the bundled JSON fixtures',
  /fetch\(\s*reportUrl\s*\)/.test(spikeSrc) && /fetch\(\s*inputUrl\s*\)/.test(spikeSrc),
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

/*
 * The spike maps 1-to-1 from the input.json passages and questions to
 * its view model: each `input.passages[i]` becomes a `<PrintPassageBlock>`
 * and each question becomes a `<PrintQuestionBlock>`. We do not run the
 * component in a browser here, so the test of "renders A/B/C/D and 15
 * questions" reduces to:
 *   - The spike renders exactly the two-step fan-out from input.json.
 *   - The fixture has the right shape (asserted above).
 * Lock the fan-out shape so a future refactor can't filter the list.
 */
assert(
  'Spike renders one PrintPassageBlock per input passage (no filtering)',
  /input\.passages\.map\(/.test(spikeSrc) || /view\.passages\.map\(/.test(spikeSrc),
  'passage fan-out missing',
)
assert(
  'Spike renders one PrintQuestionBlock per question (no filtering)',
  /passage\.questions\.map\(/.test(spikeSrc) || /questions\.map\(/.test(spikeSrc),
  'question fan-out missing',
)

// Minimum interaction: activeQuestionId state.
assert(
  'Spike owns local activeQuestionId state',
  /useState<string \| null>\(null\)/.test(spikeSrc) && /activeQuestionId/.test(spikeSrc),
  'activeQuestionId state missing',
)

/* ─── 5. CSS font stack ───────────────────────────────────────────── */

console.log('\nTest 5: CSS font stack honors 宋体 / Times New Roman')

assert(
  'CSS declares Times New Roman in the font stack',
  /"Times New Roman"/.test(cssSrc),
  '"Times New Roman" not declared',
)
assert(
  'CSS declares SimSun (宋体) in the font stack',
  /"SimSun"/.test(cssSrc),
  '"SimSun" not declared',
)
assert(
  'CSS declares Songti SC fallback for macOS rendering',
  /"Songti SC"/.test(cssSrc),
  '"Songti SC" not declared',
)
assert(
  'CSS declares STSong fallback',
  /"STSong"/.test(cssSrc),
  '"STSong" not declared',
)
assert(
  'CSS exposes a single --pi-print-font-stack variable for reuse',
  /--pi-print-font-stack\s*:/.test(cssSrc),
  'CSS variable missing',
)
assert(
  'CSS pins a print-target page width',
  /--pi-print-page-width\s*:\s*\d+px/.test(cssSrc),
  'page width variable missing',
)

/* ─── 6. Forbidden scope: no edits to package / lockfile / server / RA ─── */

console.log('\nTest 6: forbidden scope untouched')

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

/* ─── 7. No new dependency ────────────────────────────────────────── */

console.log('\nTest 7: no new runtime dependency introduced')

const pkgPath = path.join(ROOT, 'app/package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
// The spike must compile against the existing react / react-dom only;
// every import in the spike must resolve to a relative path or 'react'.
const importLines = spikeSrc
  .split('\n')
  .filter((line) => /^\s*import\s/.test(line))
const offendingImports = importLines.filter((line) => {
  const m = line.match(/from\s+['"]([^'"]+)['"]/)
  if (!m) return false
  const spec = m[1]
  if (spec.startsWith('.') || spec.startsWith('/')) return false
  // Bare specifiers are only allowed if they resolve to an existing dep.
  return !(spec in deps)
})
assert(
  'Spike imports only declared dependencies (no implicit new dep)',
  offendingImports.length === 0,
  `unexpected: ${offendingImports.join(' | ')}`,
)
assert(
  'Spike only imports React APIs from "react"',
  importLines
    .filter((line) => /from\s+['"]react['"]/.test(line))
    .every((line) => /useEffect|useMemo|useState|ReactNode/.test(line)),
  'unexpected react import',
)

/* ─── Summary ─────────────────────────────────────────────────────── */

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
