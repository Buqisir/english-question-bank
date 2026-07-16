#!/usr/bin/env node
/**
 * Verification: section-chrome-on-solo-surface (RETIRED, 2026-07-16).
 *
 * Owner report (2026-07-08): the Paper Intelligence solo-group harness
 * (`PaperIntelligencePaperSurfaceHarness.tsx`) mounted a single group's
 * PaperSurface with no 节标题/指导语 above it, so this cut brought
 * `groupChromeBlocks.ts`'s `resolveGroupChromeBlocks`/`EMPTY_GROUP_CHROME`
 * into the harness to walk back to the preceding sectionHeading/instruction
 * blocks.
 *
 * reading-analysis-retire (A-class re-anchor, rationale): both the harness
 * AND `groupChromeBlocks.ts` itself are orphan-only files (reachability.md
 * §2 — sole consumer was the harness) retired with the
 * `?view=paper-intelligence&surface=paper` route (plan.md Scope 步 3). This
 * is NOT a re-anchorable assertion — `resolveGroupChromeBlocks` is not a
 * pure function surviving anywhere else to re-test: `PaperBrowsePage.tsx`
 * never needed the extracted walk-back helper because it already renders
 * `content.blocks` in document order (sectionHeading/instruction/group
 * blocks all stream through naturally), which is exactly why this cut's own
 * original comment above says "PaperBrowsePage.tsx already renders these
 * blocks... this cut brings the same two block types... into the harness."
 * With the harness gone, there is no second surface needing the extracted
 * helper. Per plan.md Scope 步 6's authorized alternative, this script is
 * downgraded to a retirement assertion: every file this cut touched or
 * introduced is confirmed gone, and PaperSurface.tsx / PaperSurface.css
 * remain untouched (forbidden-scope guard, still checkable and still
 * meaningful post-retirement).
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

console.log('section-chrome-on-solo-surface verify (retired)')

// ─── Retirement: every file this cut introduced/touched is gone ───
assert(
  'groupChromeBlocks.ts no longer exists (orphan, harness-only)',
  !existsSync(path.join(rootDir, 'app/src/features/paper-intelligence/groupChromeBlocks.ts')),
)
assert(
  'PaperIntelligencePaperSurfaceHarness.tsx no longer exists',
  !existsSync(path.join(rootDir, 'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx')),
)
assert(
  'paperIntelligencePaperSurfaceHarness.css no longer exists',
  !existsSync(path.join(rootDir, 'app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css')),
)

// ─── Forbidden-scope guard (still meaningful): PaperSurface.tsx untouched ───
const paperSurfaceTsxSrc = read('app/src/shared-ui/papersurface/PaperSurface.tsx')
assert(
  'PaperSurface.tsx does not reference groupChrome / groupChromeBlocks',
  !/groupChrome/i.test(paperSurfaceTsxSrc),
)

// ─── Housekeeping ───
const verifyCiSrc = read('scripts/verify-ci.mjs')
assert(
  'registered in scripts/verify-ci.mjs',
  verifyCiSrc.includes('verify-section-chrome-on-solo-surface.mjs'),
)
const readmeSrc = read('scripts/README.md')
assert(
  'registered as `yes` in scripts/README.md',
  /verify-section-chrome-on-solo-surface\.mjs`[^\n]*\|\s*yes\s*\|/.test(readmeSrc),
)

if (failed > 0) {
  console.error(`\nsection-chrome-on-solo-surface verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nsection-chrome-on-solo-surface verify passed: ${passed} passed, 0 failed`)
