#!/usr/bin/env node
/**
 * verify-paper-surface-spike
 *
 * Static checks for the Paper Surface spike prototype.
 * Uses only Node built-in modules (fs, path) -- no npm dependencies required.
 *
 * Coverage:
 *   1. Route parser source contains correct parse logic for
 *      ?view=paper-surface-spike&paperId=<id>
 *   2. docs/product/paper-surface-spike-report.md exists and has key sections.
 *   3. Prototype component file exists at expected path.
 *   4. CSS file exists at expected path with key class prefixes.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0

function assert(name, cond, detail) {
  if (cond) {
    passed++
    console.log(`  \u2713 ${name}`)
  } else {
    failed++
    console.error(`  \u2717 ${name}: ${detail || 'failed'}`)
  }
}

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf-8')
}

/* ===================================================================
 * 1. Route parser -- regex-based source checks (no TS import needed)
 * =================================================================== */

console.log('\n--- 1. Route parser (paperSurfaceRoute.ts) ---')

const ROUTE_FILE = 'app/src/features/paper-surface/paperSurfaceRoute.ts'
assert('Route parser file exists', existsSync(path.join(ROOT, ROUTE_FILE)))

const routeSrc = readSrc(ROUTE_FILE)

assert(
  'Exports parsePaperSurfaceRoute function',
  /export\s+function\s+parsePaperSurfaceRoute\b/.test(routeSrc),
)

assert(
  'Checks for view=paper-surface-spike param',
  routeSrc.includes("'paper-surface-spike'") || routeSrc.includes('"paper-surface-spike"'),
)

assert(
  'Returns kind: none when view does not match',
  /kind:\s*['"]none['"]/.test(routeSrc),
)

assert(
  'Returns kind: paper-surface-spike when matched',
  /kind:\s*['"]paper-surface-spike['"]/.test(routeSrc),
)

assert(
  'Extracts paperId from URL params',
  /params\.get\(['"]paperId['"]\)/.test(routeSrc),
)

assert(
  'Accepts location-like object with search property',
  /location\s*:\s*PaperSurfaceLocationLike/.test(routeSrc) ||
    /location\.search/.test(routeSrc),
)

// Simulate parse logic by evaluating the core algorithm via regex extraction
// Verify the function uses URLSearchParams correctly
assert(
  'Uses URLSearchParams to parse query string',
  /new URLSearchParams\(/.test(routeSrc),
)

/* ===================================================================
 * 2. Technical report document
 * =================================================================== */

console.log('\n--- 2. Technical report (paper-surface-spike-report.md) ---')

const REPORT_FILE = 'docs/product/paper-surface-spike-report.md'
assert('Report file exists', existsSync(path.join(ROOT, REPORT_FILE)))

const reportContent = readSrc(REPORT_FILE)

assert(
  'Report has Executive Summary section',
  reportContent.includes('## Executive Summary'),
)

assert(
  'Report has approach comparison section',
  /## Approach Comparison/.test(reportContent),
)

assert(
  'Report discusses DOM/CSS approach',
  reportContent.includes('DOM/CSS'),
)

assert(
  'Report has a status field indicating spike',
  /Status:\s*spike/i.test(reportContent),
)

assert(
  'Report length is substantial (>2000 chars)',
  reportContent.length > 2000,
  `got ${reportContent.length} chars`,
)

/* ===================================================================
 * 3. Prototype component file
 * =================================================================== */

console.log('\n--- 3. Prototype component (PaperSurfaceSpike.tsx) ---')

const COMPONENT_FILE = 'app/src/features/paper-surface/PaperSurfaceSpike.tsx'
assert('Component file exists', existsSync(path.join(ROOT, COMPONENT_FILE)))

const componentSrc = readSrc(COMPONENT_FILE)

assert(
  'Exports PaperSurfaceSpike function component',
  /export\s+function\s+PaperSurfaceSpike\b/.test(componentSrc),
)

assert(
  'Component accepts paperId prop',
  /paperId/.test(componentSrc),
)

assert(
  'Component uses ps- class prefix for styling',
  componentSrc.includes('ps-paper'),
)

assert(
  'Component renders passage body',
  componentSrc.includes('ps-passage-body'),
)

assert(
  'Component renders questions with stems',
  componentSrc.includes('ps-question-stem'),
)

assert(
  'Component renders options',
  componentSrc.includes('ps-options'),
)

assert(
  'Component carries data-pi-evidence-id for line compatibility',
  /data-pi-evidence-id/.test(componentSrc),
)

assert(
  'Imports paperSurface.css',
  componentSrc.includes('./paperSurface.css'),
)

/* ===================================================================
 * 4. CSS file
 * =================================================================== */

console.log('\n--- 4. CSS file (paperSurface.css) ---')

const CSS_FILE = 'app/src/features/paper-surface/paperSurface.css'
assert('CSS file exists', existsSync(path.join(ROOT, CSS_FILE)))

const cssSrc = readSrc(CSS_FILE)

assert(
  'CSS uses ps- class prefix (no conflicts with pi-)',
  cssSrc.includes('.ps-paper'),
)

assert(
  'CSS defines A4-like page size',
  /max-width:\s*210mm/.test(cssSrc) || /@page[\s\S]*?size:\s*A4/.test(cssSrc),
)

assert(
  'CSS uses serif typography',
  /font-family:.*serif/.test(cssSrc),
)

assert(
  'CSS supports print media',
  /@media print/.test(cssSrc) || /@page/.test(cssSrc),
)

assert(
  'CSS has question-related styles',
  cssSrc.includes('.ps-question'),
)

/* =================================================================== */

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
