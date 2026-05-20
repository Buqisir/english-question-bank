/**
 * verify-c5b-structure-brace.mjs
 *
 * C5b verify script — Structure Brace (hotfix: white paper left padding).
 *
 * Asserts:
 *   1. StructureBraceOverlay queries .ps-page or otherwise measures
 *      the white page rect.
 *   2. Brace placement is no longer hardcoded to left: 0.
 *   3. Brace remains pointer-events: none.
 *   4. Brace z-index remains below evidence line; do not raise it
 *      above rail (z-index <= 4, evidence line is z:5, rail is z:25).
 *   5. Passage mode still measures .ps-passage-body only.
 *   6. No forbidden file changes.
 *   7. No connector line / arrow / gradient / glow / shadow.
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    passed++
    console.log(`  \u2713 ${label}`)
  } else {
    failed++
    console.error(`  \u2717 FAIL: ${label}`)
  }
}

// ─── Load source files ───

const bracePath = resolve(
  ROOT,
  'app/src/features/paper-intelligence/structureBrace.tsx',
)
const braceSrc = readFileSync(bracePath, 'utf8')

const cssPath = resolve(
  ROOT,
  'app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css',
)
const cssSrc = readFileSync(cssPath, 'utf8')

// ─── 1. StructureBraceOverlay queries .ps-page ───

console.log('\n--- C5b: Brace measures .ps-page rect ---\n')

assert(
  braceSrc.includes('.ps-page'),
  'structureBrace.tsx references .ps-page selector',
)

assert(
  braceSrc.includes('querySelector') && braceSrc.includes('.ps-page'),
  'structureBrace.tsx queries .ps-page via querySelector',
)

assert(
  braceSrc.includes('pageRect') || braceSrc.includes('getBoundingClientRect'),
  'structureBrace.tsx measures page rect (pageRect or getBoundingClientRect)',
)

// ─── 2. Brace placement is NOT hardcoded to left: 0 ───

console.log('\n--- C5b: No hardcoded left:0 placement ---\n')

// The brace x coordinate must be computed from pageRect, not hardcoded.
// Check that the component does NOT use a static `left: 0` or `x: 0`
// for the brace position. It should compute x from pageRect.
assert(
  !braceSrc.match(/left:\s*['"]?0['"]?/),
  'structureBrace.tsx does not hardcode left: 0',
)
assert(
  !braceSrc.match(/left:\s*0[,;}\s]/),
  'structureBrace.tsx does not use left:0 in inline style',
)

// The brace must use pageRect in its x computation.
assert(
  braceSrc.includes('pageRect.left') || braceSrc.includes('pageRect'),
  'structureBrace.tsx computes x from pageRect (white paper)',
)

// ─── 3. Brace remains pointer-events: none ───

console.log('\n--- C5b: pointer-events: none ---\n')

assert(
  cssSrc.includes('pointer-events: none') &&
    cssSrc.includes('pi-ps-structure-brace-overlay'),
  'CSS: .pi-ps-structure-brace-overlay has pointer-events: none',
)

// Also check the component doesn't override pointer-events.
const hasInlinePointerEvents = braceSrc.match(
  /pointerEvents\s*:\s*['"](?!none)/,
)
assert(
  !hasInlinePointerEvents,
  'structureBrace.tsx does not override pointer-events away from none',
)

// ─── 4. Brace z-index below evidence line (<=4) ───

console.log('\n--- C5b: z-index below evidence line ---\n')

// Extract z-index from the CSS for the brace overlay.
const braceZMatch = cssSrc.match(
  /\.pi-ps-structure-brace-overlay\s*\{[^}]*z-index:\s*(\d+)/,
)
assert(!!braceZMatch, 'CSS: brace overlay has z-index declaration')

if (braceZMatch) {
  const braceZ = parseInt(braceZMatch[1], 10)
  assert(braceZ <= 4, `CSS: brace z-index (${braceZ}) is <= 4 (below evidence line z:5)`)
  assert(braceZ < 25, `CSS: brace z-index (${braceZ}) is below rail (z:25)`)
}

// Check the component doesn't set a high z-index inline.
const inlineZMatch = braceSrc.match(/zIndex\s*:\s*(\d+)/)
if (inlineZMatch) {
  const inlineZ = parseInt(inlineZMatch[1], 10)
  assert(inlineZ <= 4, `TSX: inline z-index (${inlineZ}) is <= 4`)
} else {
  assert(true, 'TSX: no inline z-index override (relies on CSS)')
}

// ─── 5. Passage mode measures .ps-passage-body only ───

console.log('\n--- C5b: Passage mode measures .ps-passage-body ---\n')

assert(
  braceSrc.includes('.ps-passage-body'),
  'structureBrace.tsx references .ps-passage-body for passage mode',
)

// Passage mode must NOT measure the whole section element or questions.
// It should specifically target .ps-passage-body inside the section.
assert(
  braceSrc.includes("querySelector") &&
    braceSrc.includes('.ps-passage-body'),
  'structureBrace.tsx queries .ps-passage-body via querySelector',
)

// ─── 6. No forbidden file changes ───

console.log('\n--- C5b: Forbidden file changes check ---\n')

const forbiddenPaths = [
  'app/src/shared-ui/papersurface/PaperSurface.tsx',
  'app/src/shared-ui/papersurface/PaperSurface.css',
  'shared/papersurface/',
  'app/public/reports/',
  'app/src/features/paper-intelligence/adapter/',
  'server/',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
]

function checkForbidden(pattern, label) {
  try {
    const diff = execSync(`git diff --name-only HEAD -- "${pattern}"`, {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim()
    assert(diff === '', `${label} not modified`)
  } catch {
    try {
      const diff = execSync(`git diff --name-only main -- "${pattern}"`, {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim()
      assert(diff === '', `${label} not modified (vs main)`)
    } catch {
      // git diff unavailable — check the file is present and unmodified
      // by inspecting staged changes
      try {
        const staged = execSync(`git diff --cached --name-only -- "${pattern}"`, {
          cwd: ROOT,
          encoding: 'utf8',
        }).trim()
        assert(staged === '', `${label} not staged for modification`)
      } catch {
        console.log(`  \u26A0 Cannot verify ${label} (git unavailable)`)
      }
    }
  }
}

for (const fp of forbiddenPaths) {
  checkForbidden(fp, fp)
}

// ─── 7. No connector line / arrow / gradient / glow / shadow ───

console.log('\n--- C5b: No visual embellishments ---\n')

// Check structureBrace.tsx
const forbiddenVisuals = [
  { pattern: /\barrow\b/i, label: 'arrow' },
  { pattern: /\bconnector\b/i, label: 'connector line' },
  { pattern: /\bgradient\b/i, label: 'gradient' },
  { pattern: /\bglow\b/i, label: 'glow' },
  { pattern: /box-shadow|boxShadow/i, label: 'shadow' },
  { pattern: /filter:\s*drop-shadow|dropShadow/i, label: 'drop-shadow' },
]

for (const { pattern, label } of forbiddenVisuals) {
  assert(
    !pattern.test(braceSrc),
    `structureBrace.tsx has no ${label}`,
  )
}

// Check the brace-specific CSS rules for forbidden visuals.
// Extract the brace overlay rules.
const braceCSS = cssSrc.slice(
  cssSrc.indexOf('.pi-ps-structure-brace-overlay'),
)

for (const { pattern, label } of forbiddenVisuals) {
  // Only check within brace-related CSS (after the brace overlay selector).
  const braceCssSection = braceCSS.slice(0, braceCSS.indexOf('/* ---') > 0 ? braceCSS.indexOf('/* ---') : braceCSS.length)
  assert(
    !pattern.test(braceCssSection),
    `Brace CSS has no ${label}`,
  )
}

// ─── Additional structural checks ───

console.log('\n--- C5b: Additional structural checks ---\n')

// The brace overlay must be hidden at <=1199px.
assert(
  cssSrc.includes('max-width: 1199px') &&
    cssSrc.includes('.pi-ps-structure-brace-overlay') &&
    cssSrc.includes('display: none'),
  'CSS: brace hidden at <=1199px (display: none in stacked media query)',
)

// The harness-left must have position: relative for the absolute brace.
assert(
  cssSrc.includes('.pi-ps-harness-left') && cssSrc.includes('position: relative'),
  'CSS: .pi-ps-harness-left has position: relative (brace positioning context)',
)

// The brace overlay SVG must be position: absolute with inset: 0.
assert(
  cssSrc.includes('position: absolute') &&
    cssSrc.includes('inset: 0') &&
    cssSrc.includes('.pi-ps-structure-brace-overlay'),
  'CSS: brace overlay is position: absolute with inset: 0',
)

// ─── Summary ───

console.log(`\n${'='.repeat(50)}`)
console.log(`  C5b verify: ${passed} passed, ${failed} failed`)
console.log(`${'='.repeat(50)}\n`)

if (failed > 0) {
  process.exit(1)
}
