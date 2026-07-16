#!/usr/bin/env node
/**
 * Verification: The Single-Radius-Family Rule (DESIGN.md §5, design-canon-v2).
 *
 * Every border-radius value in app/src CSS must come from the radius ladder
 * {0, 4px, 6px, 8px, 999px} plus 50% (circular controls only). Directional
 * shorthand is legal when every component is in-family; var() indirection is
 * legal (token wins by definition).
 *
 * The 32 pre-existing off-family literals (5/3/2/12/10/7px, surveyed
 * 2026-07-16) are grandfathered per file × value below and act as a ratchet:
 * counts may only go down. A new off-family radius anywhere — including a
 * grandfathered file exceeding its baseline count — fails. When a baseline
 * entry reaches zero on disk, delete the entry to lock the tightening in.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const srcDir = path.join(rootDir, 'app', 'src')

const FAMILY = new Set(['0', '4px', '6px', '8px', '999px', '50%'])

// file (relative to app/src) → { offFamilyValue → grandfathered count }
const BASELINE = {
  'features/draft-paper/DraftPaperWorkbench.css': { '5px': 1, '7px': 1 },
  'features/my-space/MySpacePage.css': { '10px': 1, '2px': 1 },
  'features/paper-browse/paperBrowsePage.css': { '10px': 1, '12px': 1 },
  'features/paper-intelligence/paperIntelligence.css': { '10px': 2, '12px': 3, '2px': 1, '3px': 5 },
  'features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css': { '2px': 1, '3px': 3, '5px': 6 },
  'features/paper-intelligence/paperSurfaceLectureHighlights.css': { '3px': 1 },
  'features/reading-analysis/readingAnalysis.css': { '2px': 2, '5px': 2 },
}

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
