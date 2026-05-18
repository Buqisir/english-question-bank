#!/usr/bin/env node
/**
 * verify-paper-surface-interaction-model-doc
 *
 * Issue #21-B1.5 — PaperSurface Interaction Model ADR.
 *
 * This is a DOC-ONLY verify. It locks down that the interaction model
 * decisions for PaperSurface are recorded in:
 *
 *   docs/adr/0003-paper-surface-interaction-model.md
 *
 * The script must remain cloud-safe:
 *   - no install,
 *   - no build,
 *   - no Vite dev server,
 *   - no Playwright,
 *   - no runtime imports of app/ or server/.
 *
 * It only:
 *   - reads docs/adr/0003-paper-surface-interaction-model.md,
 *   - asserts the file is present and contains the required decisions,
 *   - asserts no runtime code (app/, server/, shared/) is touched in
 *     this PR (best-effort via `git diff --name-only` against the
 *     merge-base; skipped silently if git is unavailable).
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '..')

const ADR_REL = 'docs/adr/0003-paper-surface-interaction-model.md'
const ADR_ABS = path.join(ROOT, ADR_REL)

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

console.log('\n=== PaperSurface Interaction Model ADR (#21-B1.5) ===\n')

/* ─── 1. ADR file is present at the canonical path ───────────────── */

console.log('Test 1: ADR file exists at docs/adr/')

assert(
  `${ADR_REL} exists`,
  existsSync(ADR_ABS),
  `expected ADR at ${ADR_REL}`,
)

if (!existsSync(ADR_ABS)) {
  console.error('\n  ADR file missing; aborting remaining checks.')
  process.exit(1)
}

const adr = readFileSync(ADR_ABS, 'utf-8')
// `adrPlain` is the ADR with inline markdown emphasis / code-fence ticks
// stripped, so phrase regexes don't have to thread through `**bold**`,
// `*italic*`, or `` `code` `` runs.
const adrPlain = adr.replace(/\*\*/g, '').replace(/`/g, '')

/* ─── 2. Title and identity ──────────────────────────────────────── */

console.log('\nTest 2: ADR title and identity')

assert(
  'ADR has a top-level "PaperSurface Interaction Model" heading',
  /^#\s+PaperSurface\s+Interaction\s+Model\b/m.test(adr),
  'top-level title missing',
)
assert(
  'ADR references issue #21-B1.5',
  /#21-B1\.5/.test(adr),
  'issue tag #21-B1.5 missing',
)

/* ─── 3. Section 1 — PaperSurface positioning ────────────────────── */

console.log('\nTest 3: PaperSurface positioning (substrate, not engine)')

assert(
  'ADR names PaperSurface as "interactive teaching paper substrate"',
  /interactive\s+teaching\s+paper\s+substrate/i.test(adr),
  'positioning phrase missing',
)
assert(
  'ADR lists data-* anchors as a PaperSurface responsibility',
  /data-\*\s+anchors/i.test(adrPlain),
  'data-* anchors not mentioned in ownership',
)
assert(
  'ADR says PaperSurface emits focus intent',
  /emit(s|ting)?\s+focus\s+intent/i.test(adr),
  'focus intent emission not stated',
)
assert(
  'ADR says PaperSurface does NOT fetch / model / persist / render explanation',
  /PaperSurface\s+does\s+not\s+fetch[\s\S]{0,200}does\s+not\s+(?:run\s+)?model\s+calls[\s\S]{0,200}does\s+not\s+persist[\s\S]{0,200}does\s+not\s+render\s+explanation\s+content/i.test(
    adr,
  ),
  'fetch/model/persist/render-explanation negative list missing',
)

/* ─── 4. Section 2 — TextMap / AnnotationModel layering ──────────── */

console.log('\nTest 4: TextMap / AnnotationModel layering')

assert(
  'ADR mentions PaperTextMap',
  /PaperTextMap/.test(adr),
  'PaperTextMap not named',
)
assert(
  'ADR mentions PaperAnnotationModel',
  /PaperAnnotationModel/.test(adr),
  'PaperAnnotationModel not named',
)
assert(
  'ADR states TextMap and AnnotationModel are layered',
  /TextMap\s+and\s+AnnotationModel\s+are\s+layered/i.test(adr),
  'layering statement missing',
)
assert(
  'ADR says TextMap does not contain active / selected / hover state',
  /TextMap\s+does\s+not\s+contain\s+active,\s+selected,\s+or\s+hover\s+state/i.test(
    adr,
  ),
  'TextMap state-exclusion clause missing',
)
assert(
  'ADR says every annotation references a TextMap anchor',
  /[Ee]very\s+annotation\s+references\s+a\s+TextMap\s+anchor/.test(adr),
  'annotation-references-TextMap-anchor clause missing',
)
assert(
  'ADR says annotation payload is NOT rendered by PaperSurface',
  /not\s+rendered\s+by\s+PaperSurface/i.test(adr),
  'annotation-not-rendered-by-PaperSurface clause missing',
)

/* ─── 5. Section 3 — Data fine, DOM restrained ───────────────────── */

console.log('\nTest 5: data fine, DOM restrained')

assert(
  'ADR says the DOM is not full-text token-level wrapped',
  /DOM\s+is\s+not\s+full-text\s+token-level\s+wrapped/i.test(adr),
  'full-text token DOM negative not stated',
)
assert(
  'ADR allows data to be word-precise but DOM only thickens where interaction is attached',
  /data\s+can\s+be\s+word-precise[\s\S]{0,200}DOM\s+only\s+thickens\s+where\s+interaction\s+is\s+actually\s+attached/i.test(
    adr,
  ),
  'data-fine-DOM-restrained one-liner missing',
)

/* ─── 6. Section 4 — Entry / visual restraint, single slot ───────── */

console.log('\nTest 6: entry restraint and right-panel single slot')

assert(
  'ADR forbids derived-word badges in the always-on layer',
  /derived-word\s+badges/i.test(adr),
  'derived-word badge restriction missing',
)
assert(
  'ADR forbids per-sentence / long-sentence icons in the always-on layer',
  /per-sentence\s+icons|long-sentence\s+icons/i.test(adr),
  'sentence-icon restriction missing',
)
assert(
  'ADR says the right panel is a single slot, not a tab navigation surface',
  /right\s+panel\s+is\s+a\s+single\s+slot[\s\S]{0,120}not\s+a\s+tab\s+navigation\s+surface/i.test(
    adr,
  ),
  'single-slot vs. tab-navigation clause missing',
)
assert(
  'ADR forbids multi-tab panel / eight stacked sections',
  /[Nn]o\s+multi-tab\s+panel,?\s+no\s+eight\s+stacked\s+sections/.test(adr),
  'multi-tab / stacked-sections negative missing',
)

/* ─── 7. Section 5 — Two primary modes, explicit ─────────────────── */

console.log('\nTest 7: two primary modes (Question / Reading-assist), explicit switch')

assert(
  'ADR names two modes: Question (讲题) and Reading-assist (阅读辅助)',
  /two\s+modes[\s\S]{0,160}Question\s*\(\s*讲题\s*\)[\s\S]{0,160}Reading-assist\s*\(\s*阅读辅助\s*\)/i.test(
    adr,
  ),
  'two-modes phrasing missing',
)
assert(
  'ADR requires switching between modes to be explicit',
  /[Ss]witching\s+between\s+them\s+is\s+\*\*explicit\*\*/.test(adr),
  'explicit-switch clause missing',
)
assert(
  'ADR says mode switch must not change overall layout',
  /mode\s+switch\s+must\s+not\s+change\s+the\s+overall\s+layout/i.test(adr),
  'no-layout-change-on-mode-switch clause missing',
)

/* ─── 8. Section 6 — Focus state direction ───────────────────────── */

console.log('\nTest 8: focus state direction (ActiveFocus union, no PaperSurface state ownership)')

assert(
  'ADR sketches the ActiveFocus union with question / option / text-annotation / passage-insight',
  /type\s+ActiveFocus[\s\S]{0,400}question[\s\S]{0,160}option[\s\S]{0,160}text-annotation[\s\S]{0,160}passage-insight/.test(
    adr,
  ),
  'ActiveFocus union shape missing',
)
assert(
  'ADR says PaperSurface does not own active state',
  /PaperSurface\s+does\s+not\s+own\s+active\s+state/i.test(adr),
  'PaperSurface-not-owner-of-active-state clause missing',
)
assert(
  'ADR says PaperSurface receives focus as props and emits focus intent',
  /receives\s+focus\s+as\s+props[\s\S]{0,200}emits\s+focus\s+intent/i.test(adr),
  'props-in / focus-intent-out clause missing',
)

/* ─── 9. Section 7 — B3 anchor reservations ──────────────────────── */

console.log('\nTest 9: B3 PaperSurface Module anchor reservations')

const REQUIRED_ANCHORS = [
  'data-pi-paper-section',
  'data-pi-paper-paragraph-id',
  'data-pi-paper-sentence-id',
  'data-pi-question-id',
  'data-pi-option-label',
  'data-pi-evidence-id',
  'data-pi-evidence-kind',
  'data-pi-text-annotation-id',
  'data-pi-text-annotation-kind',
]
for (const anchor of REQUIRED_ANCHORS) {
  assert(
    `ADR reserves \`${anchor}\``,
    new RegExp(`\\b${anchor.replace(/-/g, '\\-')}\\b`).test(adr),
    `${anchor} not reserved`,
  )
}
assert(
  'ADR requires B3 to emit data-pi-paper-sentence-id (the sentence anchor) up front',
  /B3\s+must\s+already\s+emit\s+`data-pi-paper-sentence-id`/i.test(adr),
  'B3 sentence-anchor requirement missing',
)
assert(
  'ADR forbids B3 from emitting a token span per word',
  /not\s+emit\s+a\s+token\s+span\s+per\s+word/i.test(adrPlain),
  'B3 token-span negative missing',
)
assert(
  'ADR requires a single unified text-annotation channel',
  /single\s+unified\s+text-annotation\s+channel/i.test(adr),
  'unified text-annotation channel clause missing',
)

/* ─── 10. Section 8 — Out of scope ───────────────────────────────── */

console.log('\nTest 10: out-of-scope list for PaperSurface')

const OUT_OF_SCOPE_ITEMS = [
  /model\s+calls/i,
  /fetching\s+business\s+data/i,
  /rendering\s+annotation\s+content/i,
  /basket\s*\/\s*draft\s*\/\s*persistence/i,
  /export\s*\/\s*PDF/i,
  /tab\s+navigation\s*\/\s*multi-panel\s+layout/i,
  /full-token\s+DOM\s+rendering/i,
  /popover\s+content/i,
]
for (const re of OUT_OF_SCOPE_ITEMS) {
  assert(
    `Out-of-scope list mentions /${re.source}/`,
    re.test(adr),
    `out-of-scope item missing: ${re.source}`,
  )
}

/* ─── 11. No runtime code touched by this PR ─────────────────────── */

console.log('\nTest 11: no runtime code touched by this PR')

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
    return null
  }
}

const baseRef = (() => {
  for (const ref of ['origin/main', 'main']) {
    try {
      const out = execSync(`git merge-base HEAD ${ref}`, {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .toString()
        .trim()
      if (out) return out
    } catch {
      /* try next */
    }
  }
  return null
})()

if (baseRef === null) {
  console.log('  (skipped: no merge-base available; cannot enumerate diff)')
} else {
  const changed = safeGitDiffNames(`${baseRef}...HEAD`) || []
  const FORBIDDEN_RUNTIME_PREFIXES = [
    'app/src/',
    'server/',
    'shared/',
  ]
  const FORBIDDEN_FILES = [
    'app/package.json',
    'app/pnpm-lock.yaml',
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
  ]
  const offenders = changed.filter(
    (p) =>
      FORBIDDEN_RUNTIME_PREFIXES.some((prefix) => p.startsWith(prefix)) ||
      FORBIDDEN_FILES.includes(p),
  )
  assert(
    'No runtime code (app/src, server/, shared/) is in the diff',
    offenders.length === 0,
    `offenders: ${offenders.join(', ')}`,
  )
  assert(
    'No package.json or lockfile is in the diff',
    !changed.some((p) => FORBIDDEN_FILES.includes(p)),
    `lockfile/package offenders present`,
  )
  // Positive scope check: every changed file should be doc / verify-script.
  const ALLOWED_PREFIXES = ['docs/', 'scripts/']
  const stray = changed.filter(
    (p) => !ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix)),
  )
  assert(
    'Every changed file is under docs/ or scripts/',
    stray.length === 0,
    `stray: ${stray.join(', ')}`,
  )
}

/* ─── Summary ────────────────────────────────────────────────────── */

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.error('\n  Issues:')
  for (const i of issues) console.error(`    - ${i}`)
  process.exit(1)
}
