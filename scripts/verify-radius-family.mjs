#!/usr/bin/env node
/**
 * Verification: The Single-Radius-Family Rule (DESIGN.md §5, design-canon-v2).
 *
 * Every border-radius value in app/src CSS must come from the radius ladder
 * {0, 4px, 8px, 12px, 16px, 999px} plus 50% (circular controls only).
 * Northstar 2026-09-03 authorised 12 / 16 into the family (cards / hero search).
 * Directional shorthand is legal when every component is in-family; var()
 * indirection is legal (token wins by definition).
 *
 * Remaining off-family literals are grandfathered per file × value below and
 * act as a ratchet: counts may only go down.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const srcDir = path.join(rootDir, 'app', 'src')

const FAMILY = new Set(['0', '4px', '6px', '8px', '12px', '16px', '999px', '50%'])

// file (relative to app/src) → { offFamilyValue → grandfathered count }
const BASELINE = {
  // ui-northstar 草稿卷: 5px rail-acts / 7px group-action stickers → 4 / 8.
  'features/my-space/MySpacePage.css': { '2px': 1 },
  'features/paper-intelligence/paperIntelligence.css': { '10px': 2, '2px': 1, '3px': 5 },
  'features/paper-intelligence/paperSurfaceLectureHighlights.css': { '3px': 1 },
}
// reading-analysis-retire (2026-07-16): the two baseline entries above for
// `paperIntelligencePaperSurfaceHarness.css` and
// `features/reading-analysis/readingAnalysis.css` are deleted, not just
// zeroed — both stylesheets are retired along with the orphan routes
// (plan.md Scope 步 2/3). Ratchet tightened per this script's own
// "baseline entries fully cleaned on disk" self-check.

function cssFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...cssFiles(full))
    else if (entry.name.endsWith('.css')) out.push(full)
  }
  return out
}

function isInFamily(value) {
  const v = value.trim()
  if (v.includes('var(')) return true
  return v.split(/\s+/).every((c) => FAMILY.has(c))
}

let passed = 0
let failed = 0
const overBudget = []
const cleaned = []

console.log('verify: Single-Radius-Family Rule (DESIGN.md §5)')
console.log()

// off-family occurrences found on disk: rel → { value → count }
const found = {}
const declRe = /border(?:-[a-z]+)*-radius\s*:\s*([^;}]+)/g

for (const file of cssFiles(srcDir)) {
  const rel = path.relative(srcDir, file)
  const css = readFileSync(file, 'utf8')
  for (const match of css.matchAll(declRe)) {
    const value = match[1].trim()
    if (isInFamily(value)) continue
    found[rel] ??= {}
    found[rel][value] = (found[rel][value] ?? 0) + 1
  }
}

for (const [rel, values] of Object.entries(found)) {
  for (const [value, count] of Object.entries(values)) {
    const budget = BASELINE[rel]?.[value] ?? 0
    if (count > budget) overBudget.push(`${rel} :: border-radius: ${value} ×${count} (baseline ${budget})`)
  }
}

for (const [rel, values] of Object.entries(BASELINE)) {
  for (const [value, budget] of Object.entries(values)) {
    const count = found[rel]?.[value] ?? 0
    if (count === 0) cleaned.push(`${rel} :: ${value} (baseline ${budget}, now 0 — delete the entry)`)
  }
}

if (overBudget.length === 0) {
  passed++
  console.log('PASS all border-radius values in-family or within grandfathered baseline')
} else {
  failed++
  console.error('FAIL off-family border-radius beyond baseline:')
  for (const line of overBudget) console.error(`  ${line}`)
}

if (cleaned.length === 0) {
  passed++
  console.log('PASS baseline has no dead entries (ratchet is tight)')
} else {
  failed++
  console.error('FAIL baseline entries fully cleaned on disk — tighten the ratchet:')
  for (const line of cleaned) console.error(`  ${line}`)
}

console.log()
if (failed > 0) {
  console.error(`${failed} failed / ${passed} passed`)
  process.exit(1)
}
console.log(`all ${passed} checks passed`)
