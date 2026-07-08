#!/usr/bin/env node
/**
 * verify-paper-surface-tokens
 *
 * Issue #21-B1 / Issue #30 gate 2 — A-thin CSS strategy.
 * 刀⑤ render-fidelity Chunk A — the token contract is rebased on the
 * production PaperSurface module (the prototype it originally described
 * is deleted in this same cut, Chunk E) and on the typography primitives
 * added for docs/product/exam-paper-format-standards.md v2.
 *
 * Locks down the contract for `shared/papersurface/tokens.mjs`:
 *
 *   1. The shared module + its `.d.ts`/`.d.mts` companions exist.
 *   2. It exports PRIMITIVE values only (string / number / boolean /
 *      null). It does NOT export any CSS text, HTML text, JSX, or
 *      React types. It does NOT import React, app/, or server/.
 *   3. The typography primitives required by standard v2 §1-§3 are
 *      present with the values the standard requires (10.5pt/14px body,
 *      1.714 fixed line-height, 24mm/91px + 21mm/79px margins, split
 *      EN/ZH/heading font stacks).
 *   4. `PaperSurface.tsx` (the production module) and `WritingPaperPage.tsx`
 *      both import the tokens and inject them as CSS custom properties on
 *      their own root — each needs its own injection because CSS custom
 *      properties inherit down the tree, not up, and WritingPaperPage
 *      wraps PaperSurface as a child.
 *   5. `PaperSurface.css` and `writingPaperPage.css` consume those CSS
 *      variables via `var(--ps-...)` instead of hardcoding the canonical
 *      token values directly for the shared fields.
 *
 * NOT yet asserted here (deliberately, per the render-fidelity plan):
 *   - Server consumption (`server/print-renderer.mjs` /
 *     `server/exports/docxRenderer.mjs`) — that lands in Chunk B/C.
 *
 * The script is cloud-safe:
 *   - never spawns a browser,
 *   - never starts a build,
 *   - never needs node_modules,
 *   - only reads source files + runs `git diff` against merge-base.
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
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    issues.push(`${name}: ${detail || 'failed'}`)
    console.error(`  ✗ ${name}: ${detail || 'failed'}`)
  }
}

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf-8')
}

function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

console.log('\n=== Paper Surface shared tokens (刀⑤ render-fidelity Chunk A) ===\n')

const TOKENS_REL = 'shared/papersurface/tokens.mjs'
const TOKENS_DTS_REL = 'shared/papersurface/tokens.d.ts'
const TOKENS_DMTS_REL = 'shared/papersurface/tokens.d.mts'
const PAPER_SURFACE_TSX_REL = 'app/src/shared-ui/papersurface/PaperSurface.tsx'
const PAPER_SURFACE_CSS_REL = 'app/src/shared-ui/papersurface/PaperSurface.css'
const WRITING_PAGE_TSX_REL = 'app/src/features/paper-intelligence/WritingPaperPage.tsx'
const WRITING_PAGE_CSS_REL = 'app/src/features/paper-intelligence/writingPaperPage.css'

/* ─── 1. Shared module exists ────────────────────────────────────── */

console.log('Test 1: shared/papersurface/tokens.mjs + declaration companions exist')

for (const rel of [TOKENS_REL, TOKENS_DTS_REL, TOKENS_DMTS_REL]) {
  assert(`${rel} file exists`, existsSync(path.join(ROOT, rel)), rel)
}

const tokensSrc = readSrc(TOKENS_REL)
const tokensSrcNoComments = stripJsComments(tokensSrc)
const tokensDtsSrc = readSrc(TOKENS_DTS_REL)
const tokensDmtsSrc = readSrc(TOKENS_DMTS_REL)

/* ─── 2. Module is pure ESM primitives ───────────────────────────── */

console.log('\nTest 2: module exports primitive values only')

assert(
  'tokens.mjs has zero `import` statements (no app/server/React deps)',
  !/^\s*import\s/m.test(tokensSrcNoComments),
  'tokens.mjs must not import anything',
)
assert(
  'tokens.mjs does not reference React',
  !/\breact\b/i.test(tokensSrcNoComments),
  'react reference found in tokens.mjs',
)
assert(
  'tokens.mjs does not reference JSX (`<` followed by tag char)',
  !/<[A-Za-z][A-Za-z0-9]*\s/.test(tokensSrcNoComments),
  'tokens.mjs must not contain JSX',
)
assert(
  'tokens.mjs does not contain `</` JSX close',
  !/<\//.test(tokensSrcNoComments),
  'tokens.mjs must not contain JSX',
)
// CSS-string smell tests: forbid declarations like `font-family:` or
// `--var:` inside the JS source. Tokens are PRIMITIVE values, not
// pre-baked CSS strings.
assert(
  'tokens.mjs does not embed CSS declarations (`prop:` followed by `;`)',
  !/font-family\s*:|line-height\s*:[^.\d]|--[a-z][a-z0-9-]*\s*:/i.test(
    tokensSrcNoComments,
  ),
  'tokens.mjs looks like it is exporting raw CSS, not primitives',
)
assert(
  'tokens.mjs does not embed HTML (`<html`, `<body`, `<style`, `<div`)',
  !/<\s*(html|body|style|div|p|section|article|mark)\b/i.test(tokensSrcNoComments),
  'HTML-looking tag found in tokens.mjs',
)

// Dynamic import + value-shape check.
const tokensModule = await import(`file://${path.join(ROOT, TOKENS_REL)}`)
assert(
  'tokens.mjs exports `paperSurfaceTokens`',
  typeof tokensModule.paperSurfaceTokens === 'object' &&
    tokensModule.paperSurfaceTokens !== null,
  'paperSurfaceTokens export missing or wrong shape',
)

const REQUIRED_TOKEN_KEYS = [
  'paperFontStack',
  'paperFontStackEn',
  'paperFontStackZh',
  'paperFontStackHeading',
  'paperInk',
  'paperMuted',
  'paperRule',
  'paperFontSizePt',
  'paperFontSizePx',
  'paperLineHeight',
  'passageIndent',
  'optionsGridColumns',
  'optionsGridGapX',
  'paperBlankWidth',
  'pageMarginX',
  'pageMarginTop',
]
for (const key of REQUIRED_TOKEN_KEYS) {
  assert(
    `paperSurfaceTokens.${key} is defined`,
    Object.prototype.hasOwnProperty.call(tokensModule.paperSurfaceTokens, key),
    `missing key: ${key}`,
  )
}

// Every value must be a primitive.
const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean'])
for (const [key, value] of Object.entries(tokensModule.paperSurfaceTokens)) {
  assert(
    `paperSurfaceTokens.${key} is a primitive (got ${typeof value})`,
    PRIMITIVE_TYPES.has(typeof value) || value === null,
    `non-primitive value at key ${key}`,
  )
}

// Forbid surprise extra exports that aren't primitive bags. (We allow
// only the one named export — anything else means someone slipped in
// a helper / CSS string / JSX.)
const ALLOWED_EXPORTS = new Set(['paperSurfaceTokens'])
const unexpectedExports = Object.keys(tokensModule).filter(
  (k) => !ALLOWED_EXPORTS.has(k) && k !== 'default',
)
assert(
  'tokens.mjs exposes only the allowed named export (no `paperSurfaceServerCurrent` design note — retired in 刀⑤ Chunk A, the B1 "server untouched" clause is void)',
  unexpectedExports.length === 0,
  `unexpected exports: ${unexpectedExports.join(', ')}`,
)

/* ─── 3. Standard v2 §1-§3 typography primitives ─────────────────── */

console.log('\nTest 3: typography primitives match standard v2 §1-§3')

const t = tokensModule.paperSurfaceTokens

assert(
  'paperFontSizePt is 10.5 (standard §2, 五号)',
  t.paperFontSizePt === 10.5,
  `got: ${t.paperFontSizePt}`,
)
assert(
  'paperFontSizePx is 14px (794px screen equivalent of 10.5pt)',
  t.paperFontSizePx === '14px',
  `got: ${t.paperFontSizePx}`,
)
assert(
  'paperLineHeight is the fixed 18pt/10.5pt ≈1.714 baseline (standard §3), replacing the 1.85/1.7 split',
  Math.abs(t.paperLineHeight - 1.714) < 0.001,
  `got: ${t.paperLineHeight}`,
)
assert(
  'pageMarginX is 91px (standard §1, 24mm left/right)',
  t.pageMarginX === '91px',
  `got: ${t.pageMarginX}`,
)
assert(
  'pageMarginTop is 79px (standard §1, ≈21mm top)',
  t.pageMarginTop === '79px',
  `got: ${t.pageMarginTop}`,
)
assert(
  'paperFontStackEn mentions "Times New Roman" (standard §2, EN body)',
  /Times New Roman/.test(String(t.paperFontStackEn)),
  `got: ${t.paperFontStackEn}`,
)
assert(
  'paperFontStackZh mentions "SimSun" (standard §2, 书宋)',
  /SimSun/.test(String(t.paperFontStackZh)),
  `got: ${t.paperFontStackZh}`,
)
assert(
  'paperFontStackHeading mentions "SimHei" (standard §2, 部标题中黑)',
  /SimHei/.test(String(t.paperFontStackHeading)),
  `got: ${t.paperFontStackHeading}`,
)
assert(
  'paperFontStack (mixed) still mentions "Times New Roman" and "SimSun" for inline CN/EN body text',
  /Times New Roman/.test(String(t.paperFontStack)) && /SimSun/.test(String(t.paperFontStack)),
  `got: ${t.paperFontStack}`,
)
assert(
  'no more split passageLineHeight / questionLineHeight keys (standard §3 unifies to one line-height)',
  !Object.prototype.hasOwnProperty.call(t, 'passageLineHeight') &&
    !Object.prototype.hasOwnProperty.call(t, 'questionLineHeight'),
  'stale split line-height keys still present',
)

/* ─── 4. tokens.d.ts / tokens.d.mts shape ────────────────────────── */

console.log('\nTest 4: tokens.d.ts / tokens.d.mts are types-only and in sync')

assert(
  'tokens.d.ts declares PaperSurfaceTokens type',
  /export\s+type\s+PaperSurfaceTokens\b/.test(tokensDtsSrc),
  'PaperSurfaceTokens type missing',
)
assert(
  'tokens.d.ts declares paperSurfaceTokens value (declare-only)',
  /export\s+const\s+paperSurfaceTokens\s*:/.test(tokensDtsSrc),
  'paperSurfaceTokens declaration missing',
)
assert(
  'tokens.d.ts contains no runtime initializers (`export const X = {`)',
  !/export\s+const\s+\w+\s*=/.test(tokensDtsSrc),
  'tokens.d.ts must not carry runtime values',
)
assert(
  'tokens.d.ts does not import React',
  !/from\s+['"]react['"]/.test(tokensDtsSrc),
  'react import in tokens.d.ts',
)
for (const key of REQUIRED_TOKEN_KEYS) {
  const re = new RegExp(`readonly\\s+${key}\\s*:`)
  assert(
    `tokens.d.ts declares readonly ${key}`,
    re.test(tokensDtsSrc),
    `${key} declaration missing from tokens.d.ts`,
  )
  assert(
    `tokens.d.mts declares readonly ${key}`,
    re.test(tokensDmtsSrc),
    `${key} declaration missing from tokens.d.mts`,
  )
}
assert(
  'tokens.d.ts no longer declares the retired paperSurfaceServerCurrent design note',
  !/paperSurfaceServerCurrent/.test(tokensDtsSrc),
  'stale paperSurfaceServerCurrent declaration found in tokens.d.ts',
)
assert(
  'tokens.d.mts no longer declares the retired paperSurfaceServerCurrent design note',
  !/paperSurfaceServerCurrent/.test(tokensDmtsSrc),
  'stale paperSurfaceServerCurrent declaration found in tokens.d.mts',
)

/* ─── 5. Production PaperSurface module consumes tokens correctly ─── */

console.log('\nTest 5: PaperSurface.tsx imports tokens and injects CSS vars')

const paperSurfaceTsxSrc = readSrc(PAPER_SURFACE_TSX_REL)

assert(
  'PaperSurface.tsx imports paperSurfaceTokens from shared/papersurface/tokens.mjs',
  /import\s*\{\s*paperSurfaceTokens\s*\}\s*from\s*['"][^'"]*shared\/papersurface\/tokens\.mjs['"]/.test(
    paperSurfaceTsxSrc,
  ),
  'shared tokens import missing or wrong path',
)

const REQUIRED_PS_INJECTIONS = [
  ['--ps-font-stack', 'paperFontStack'],
  ['--ps-ink', 'paperInk'],
  ['--ps-muted', 'paperMuted'],
  ['--ps-rule', 'paperRule'],
  ['--ps-font-size', 'paperFontSizePx'],
  ['--ps-line-height', 'paperLineHeight'],
  ['--ps-passage-indent', 'passageIndent'],
  ['--ps-options-grid-columns', 'optionsGridColumns'],
  ['--ps-options-grid-gap-x', 'optionsGridGapX'],
  ['--ps-paper-blank-width', 'paperBlankWidth'],
  ['--ps-page-margin-x', 'pageMarginX'],
  ['--ps-page-margin-top', 'pageMarginTop'],
]
for (const [cssVar, tokenKey] of REQUIRED_PS_INJECTIONS) {
  const re = new RegExp(
    `['"]${cssVar.replace(/-/g, '\\-')}['"]\\s*:\\s*paperSurfaceTokens\\.${tokenKey}\\b`,
  )
  assert(
    `PaperSurface.tsx injects ${cssVar} from paperSurfaceTokens.${tokenKey}`,
    re.test(paperSurfaceTsxSrc),
    `injection missing for ${cssVar}`,
  )
}

/* ─── 6. WritingPaperPage consumes tokens on its OWN root ────────── */

console.log('\nTest 6: WritingPaperPage.tsx imports tokens and injects its own CSS vars')

const writingPageTsxSrc = readSrc(WRITING_PAGE_TSX_REL)

assert(
  'WritingPaperPage.tsx imports paperSurfaceTokens from shared/papersurface/tokens.mjs',
  /import\s*\{\s*paperSurfaceTokens\s*\}\s*from\s*['"][^'"]*shared\/papersurface\/tokens\.mjs['"]/.test(
    writingPageTsxSrc,
  ),
  'shared tokens import missing or wrong path in WritingPaperPage.tsx',
)

const REQUIRED_WP_INJECTIONS = [
  ['--ps-font-stack', 'paperFontStack'],
  ['--ps-font-size', 'paperFontSizePx'],
  ['--ps-line-height', 'paperLineHeight'],
  ['--ps-page-margin-x', 'pageMarginX'],
  ['--ps-page-margin-top', 'pageMarginTop'],
]
for (const [cssVar, tokenKey] of REQUIRED_WP_INJECTIONS) {
  const re = new RegExp(
    `['"]${cssVar.replace(/-/g, '\\-')}['"]\\s*:\\s*paperSurfaceTokens\\.${tokenKey}\\b`,
  )
  assert(
    `WritingPaperPage.tsx injects ${cssVar} from paperSurfaceTokens.${tokenKey}`,
    re.test(writingPageTsxSrc),
    `injection missing for ${cssVar}`,
  )
}
assert(
  'WritingPaperPage.tsx applies the injected style to the root element',
  /style=\{\s*writingPageTokenStyle\s*\}/.test(writingPageTsxSrc),
  'style={writingPageTokenStyle} not applied to pi-writing-page root',
)

/* ─── 7. CSS consumes the shared CSS variables (no re-hardcoding) ─── */

console.log('\nTest 7: CSS files consume var(--ps-...) instead of re-hardcoding token values')

const paperSurfaceCssSrc = readSrc(PAPER_SURFACE_CSS_REL)
const paperSurfaceCssNoComments = paperSurfaceCssSrc.replace(/\/\*[\s\S]*?\*\//g, '')
const writingPageCssSrc = readSrc(WRITING_PAGE_CSS_REL)
const writingPageCssNoComments = writingPageCssSrc.replace(/\/\*[\s\S]*?\*\//g, '')

const REQUIRED_PS_CSS_VARS = [
  '--ps-font-stack',
  '--ps-font-size',
  '--ps-line-height',
  '--ps-page-margin-x',
  '--ps-page-margin-top',
]
for (const v of REQUIRED_PS_CSS_VARS) {
  const escaped = v.replace(/-/g, '\\-')
  const re = new RegExp(`var\\(\\s*${escaped}\\b`)
  assert(
    `PaperSurface.css consumes var(${v})`,
    re.test(paperSurfaceCssNoComments),
    `var(${v}) not used in PaperSurface.css`,
  )
  assert(
    `writingPaperPage.css consumes var(${v})`,
    re.test(writingPageCssNoComments),
    `var(${v}) not used in writingPaperPage.css`,
  )
}

// Comments-stripped: neither CSS file may redeclare the canonical
// 16px / old line-height literals the token migration retired.
const FORBIDDEN_CSS_LITERALS = [
  /font-size\s*:\s*16px\b/,
  /line-height\s*:\s*1\.85\b/,
  /line-height\s*:\s*1\.7\b/,
  /line-height\s*:\s*1\.6\b/,
  /padding\s*:\s*56px\b/,
]
for (const re of FORBIDDEN_CSS_LITERALS) {
  assert(
    `PaperSurface.css does not hardcode the retired literal /${re.source}/`,
    !re.test(paperSurfaceCssNoComments),
    'retired token literal found duplicated in PaperSurface.css',
  )
  assert(
    `writingPaperPage.css does not hardcode the retired literal /${re.source}/`,
    !re.test(writingPageCssNoComments),
    'retired token literal found duplicated in writingPaperPage.css',
  )
}

/* ─── 8. Forbidden scope: no edits to package / lockfile / server ─── */

console.log('\nTest 8: forbidden scope untouched')

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
  const candidates = ['github/main', 'origin/main', 'main']
  for (const ref of candidates) {
    try {
      const out = execSync(`git merge-base HEAD ${ref}`, {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .toString()
        .trim()
      if (out) return out
    } catch {
      // Try the next remote/local candidate.
    }
  }
  return 'HEAD'
})()

const changed = safeGitDiffNames(`${baseRef}...HEAD`)

const FORBIDDEN_PATHS = [
  /^app\/package\.json$/,
  /^app\/pnpm-lock\.yaml$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^server\//,
  /^app\/src\/features\/reading-analysis\//,
  /^docs\/product\//,
]
for (const re of FORBIDDEN_PATHS) {
  const offenders = changed.filter((p) => re.test(p))
  assert(
    `No edits to ${re.source}`,
    offenders.length === 0,
    `offenders: ${offenders.join(', ')}`,
  )
}

/* ─── 9. Vite fs.allow is narrow (PR #32 review fix) ─────────────── */

console.log('\nTest 9: app/vite.config.ts server.fs.allow is narrowly scoped')

const VITE_CONFIG_REL = 'app/vite.config.ts'
assert(
  'app/vite.config.ts exists',
  existsSync(path.join(ROOT, VITE_CONFIG_REL)),
  VITE_CONFIG_REL,
)
const viteConfigSrc = readSrc(VITE_CONFIG_REL)
const viteConfigNoComments = viteConfigSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

assert(
  'vite.config.ts allow-lists the app package root (`path.resolve(__dirname)`) explicitly',
  /path\.resolve\(\s*__dirname\s*\)/.test(viteConfigNoComments),
  'expected fs.allow to include path.resolve(__dirname)',
)
assert(
  'vite.config.ts allow-lists `path.resolve(__dirname, "../shared")`',
  /path\.resolve\(\s*__dirname\s*,\s*['"]\.\.\/shared['"]\s*\)/.test(
    viteConfigNoComments,
  ),
  'expected fs.allow to include path.resolve(__dirname, "../shared")',
)
assert(
  'vite.config.ts does NOT allow-list the repo root (`path.resolve(__dirname, "..")`)',
  !/path\.resolve\(\s*__dirname\s*,\s*['"]\.\.['"]\s*\)/.test(viteConfigNoComments),
  'fs.allow must not include the whole repo root',
)
assert(
  'vite.config.ts does NOT allow-list bare ".." or "../"',
  !/allow\s*:\s*\[[^\]]*['"]\.\.\/?['"][^\]]*\]/s.test(viteConfigNoComments),
  'fs.allow must not include a bare ".." entry',
)
assert(
  'vite.config.ts does NOT allow-list "/" or filesystem root',
  !/allow\s*:\s*\[[^\]]*['"]\/['"][^\]]*\]/s.test(viteConfigNoComments) &&
    !/path\.resolve\(\s*['"]\/['"]\s*\)/.test(viteConfigNoComments),
  'fs.allow must not include "/" or any absolute root path',
)
assert(
  'vite.config.ts does NOT allow-list `process.cwd()` (which would resolve to repo root)',
  !/allow\s*:\s*\[[^\]]*process\.cwd\(\)[^\]]*\]/s.test(viteConfigNoComments),
  'fs.allow must not include process.cwd()',
)
assert(
  'vite.config.ts does NOT use `searchForWorkspaceRoot` (whole-workspace allow)',
  !/searchForWorkspaceRoot/.test(viteConfigNoComments),
  'searchForWorkspaceRoot would broaden fs.allow to the whole workspace',
)

const allowEntries = [
  ...viteConfigNoComments.matchAll(/path\.resolve\(\s*__dirname\s*\)/g),
].map(() => '.')
allowEntries.push(
  ...viteConfigNoComments.matchAll(
    /path\.resolve\(\s*__dirname\s*,\s*['"]([^'"]+)['"]\s*\)/g,
  ).map((m) => m[1]),
)
assert(
  'every fs.allow entry resolves to app root or "../shared" / inside it',
  allowEntries.length > 0 &&
    allowEntries.every(
      (p) => p === '.' || p === '../shared' || p.startsWith('../shared/'),
    ),
  `entries: ${allowEntries.join(', ')}`,
)

/* ─── Summary ────────────────────────────────────────────────────── */

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
