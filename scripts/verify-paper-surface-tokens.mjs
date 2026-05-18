#!/usr/bin/env node
/**
 * verify-paper-surface-tokens
 *
 * Issue #21-B1 / Issue #30 gate 2 — A-thin CSS strategy.
 *
 * Locks down the contract for `shared/papersurface/tokens.mjs`:
 *
 *   1. The shared module exists at the canonical path.
 *   2. It exports PRIMITIVE values only (string / number / boolean /
 *      null). It does NOT export any CSS text, HTML text, JSX, or
 *      React types. It does NOT import React, app/, or server/.
 *   3. The React prototype imports the tokens and injects them as CSS
 *      custom properties on the surface root.
 *   4. `paperSurfacePrototype.css` consumes those CSS variables via
 *      `var(--pi-paper-...)` instead of hardcoding the canonical token
 *      values directly for the shared fields.
 *   5. `server/print-renderer.mjs` is unchanged in this PR (B1 does
 *      NOT touch the server). The current server font-stack divergence
 *      is recorded in `paperSurfaceServerCurrent` (or in the docs).
 *   6. `docs/paper-surface-spike-follow-up.md` records the A-thin
 *      decision and that B2 must resolve server adoption + rerun
 *      visual QA.
 *   7. No package.json / lockfile / reading-analysis / server diff
 *      is introduced by this PR.
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

function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

console.log('\n=== Paper Surface shared tokens (#21-B1, A-thin) ===\n')

const TOKENS_REL = 'shared/papersurface/tokens.mjs'
const TOKENS_DTS_REL = 'shared/papersurface/tokens.d.ts'
const PROTOTYPE_TSX_REL =
  'app/src/features/paper-intelligence/paperSurfacePrototype/PaperSurfacePrototype.tsx'
const PROTOTYPE_CSS_REL =
  'app/src/features/paper-intelligence/paperSurfacePrototype/paperSurfacePrototype.css'
const FOLLOW_UP_REL = 'docs/paper-surface-spike-follow-up.md'
const SERVER_PRINT_RENDERER_REL = 'server/print-renderer.mjs'

/* ─── 1. Shared module exists ────────────────────────────────────── */

console.log('Test 1: shared/papersurface/tokens.mjs exists')

assert(
  'shared/papersurface/tokens.mjs file exists',
  existsSync(path.join(ROOT, TOKENS_REL)),
  TOKENS_REL,
)
assert(
  'shared/papersurface/tokens.d.ts file exists',
  existsSync(path.join(ROOT, TOKENS_DTS_REL)),
  TOKENS_DTS_REL,
)

const tokensSrc = readSrc(TOKENS_REL)
const tokensSrcNoComments = stripJsComments(tokensSrc)
const tokensDtsSrc = readSrc(TOKENS_DTS_REL)

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
assert(
  'tokens.mjs exports `paperSurfaceServerCurrent` (server divergence note)',
  typeof tokensModule.paperSurfaceServerCurrent === 'object' &&
    tokensModule.paperSurfaceServerCurrent !== null,
  'paperSurfaceServerCurrent export missing',
)

const REQUIRED_TOKEN_KEYS = [
  'paperFontStack',
  'paperInk',
  'paperMuted',
  'paperRule',
  'passageLineHeight',
  'questionLineHeight',
  'passageIndent',
  'optionsGridColumns',
  'optionsGridGapX',
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
for (const [key, value] of Object.entries(tokensModule.paperSurfaceServerCurrent)) {
  assert(
    `paperSurfaceServerCurrent.${key} is a primitive`,
    PRIMITIVE_TYPES.has(typeof value) || value === null,
    `non-primitive value at key ${key}`,
  )
}

// Specific value sanity: the canonical font stack must mention Times
// New Roman + the宋体 chain. This is the value that will eventually
// flow to the server in B2; we lock it down here so a B1 follow-up
// cannot quietly drift it.
assert(
  'paperSurfaceTokens.paperFontStack mentions "Times New Roman"',
  /Times New Roman/.test(String(tokensModule.paperSurfaceTokens.paperFontStack)),
  `got: ${tokensModule.paperSurfaceTokens.paperFontStack}`,
)
assert(
  'paperSurfaceTokens.paperFontStack mentions "SimSun" (宋体)',
  /SimSun/.test(String(tokensModule.paperSurfaceTokens.paperFontStack)),
  `got: ${tokensModule.paperSurfaceTokens.paperFontStack}`,
)
assert(
  'paperSurfaceTokens.paperFontStack mentions "Songti SC"',
  /Songti SC/.test(String(tokensModule.paperSurfaceTokens.paperFontStack)),
  `got: ${tokensModule.paperSurfaceTokens.paperFontStack}`,
)
assert(
  'paperSurfaceServerCurrent.fontStack records the current server divergence',
  /Times New Roman/.test(
    String(tokensModule.paperSurfaceServerCurrent.fontStack),
  ),
  `got: ${tokensModule.paperSurfaceServerCurrent.fontStack}`,
)

// Forbid surprise extra exports that aren't primitive bags. (We allow
// only the two named exports — anything else means someone slipped in
// a helper / CSS string / JSX.)
const ALLOWED_EXPORTS = new Set(['paperSurfaceTokens', 'paperSurfaceServerCurrent'])
const unexpectedExports = Object.keys(tokensModule).filter(
  (k) => !ALLOWED_EXPORTS.has(k) && k !== 'default',
)
assert(
  'tokens.mjs exposes only the two allowed named exports',
  unexpectedExports.length === 0,
  `unexpected exports: ${unexpectedExports.join(', ')}`,
)

/* ─── 3. tokens.d.ts shape ───────────────────────────────────────── */

console.log('\nTest 3: tokens.d.ts is types-only')

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
  'tokens.d.ts declares paperSurfaceServerCurrent value (declare-only)',
  /export\s+const\s+paperSurfaceServerCurrent\s*:/.test(tokensDtsSrc),
  'paperSurfaceServerCurrent declaration missing',
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

/* ─── 4. React prototype consumes tokens correctly ───────────────── */

console.log('\nTest 4: React prototype imports tokens and injects CSS vars')

const prototypeSrc = readSrc(PROTOTYPE_TSX_REL)

assert(
  'Prototype imports paperSurfaceTokens from shared/papersurface/tokens.mjs',
  /import\s*\{\s*paperSurfaceTokens\s*\}\s*from\s*['"][^'"]*shared\/papersurface\/tokens\.mjs['"]/.test(
    prototypeSrc,
  ),
  'shared tokens import missing or wrong path',
)

const REQUIRED_INJECTIONS = [
  ['--pi-paper-font-stack', 'paperFontStack'],
  ['--pi-paper-ink', 'paperInk'],
  ['--pi-paper-muted', 'paperMuted'],
  ['--pi-paper-rule', 'paperRule'],
  ['--pi-paper-passage-line-height', 'passageLineHeight'],
  ['--pi-paper-question-line-height', 'questionLineHeight'],
  ['--pi-paper-passage-indent', 'passageIndent'],
  ['--pi-paper-options-grid-columns', 'optionsGridColumns'],
  ['--pi-paper-options-grid-gap-x', 'optionsGridGapX'],
]
for (const [cssVar, tokenKey] of REQUIRED_INJECTIONS) {
  const re = new RegExp(
    `['"]${cssVar.replace(/-/g, '\\-')}['"]\\s*:\\s*paperSurfaceTokens\\.${tokenKey}\\b`,
  )
  assert(
    `Prototype injects ${cssVar} from paperSurfaceTokens.${tokenKey}`,
    re.test(prototypeSrc),
    `injection missing for ${cssVar}`,
  )
}

assert(
  'Prototype applies the injected style on the surface root (style={paperSurfaceTokenStyle})',
  /style=\{\s*paperSurfaceTokenStyle\s*\}/.test(prototypeSrc),
  'style={paperSurfaceTokenStyle} not applied to the surface root',
)
assert(
  'Surface root style is applied to all return paths (loading + error + ready)',
  (prototypeSrc.match(/style=\{\s*paperSurfaceTokenStyle\s*\}/g) || []).length >= 3,
  'expected at least 3 style={paperSurfaceTokenStyle} sites',
)

/* ─── 5. CSS consumes the shared CSS variables ───────────────────── */

console.log('\nTest 5: CSS consumes var(--pi-paper-...) for shared tokens')

const cssSrc = readSrc(PROTOTYPE_CSS_REL)
const cssSrcNoComments = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '')

const REQUIRED_VAR_USAGES = [
  '--pi-paper-font-stack',
  '--pi-paper-ink',
  '--pi-paper-muted',
  '--pi-paper-rule',
  '--pi-paper-passage-line-height',
  '--pi-paper-question-line-height',
  '--pi-paper-passage-indent',
  '--pi-paper-options-grid-columns',
  '--pi-paper-options-grid-gap-x',
]
for (const v of REQUIRED_VAR_USAGES) {
  const escaped = v.replace(/-/g, '\\-')
  const re = new RegExp(`var\\(\\s*${escaped}\\b`)
  assert(
    `CSS consumes var(${v})`,
    re.test(cssSrcNoComments),
    `var(${v}) not used`,
  )
}

// Comments-stripped: the CSS file MUST NOT redeclare the canonical
// values for shared tokens. The whole point of A-thin is that those
// values live in tokens.mjs only.
const FORBIDDEN_LITERALS = [
  // Font literals — the stack now lives in shared tokens.
  /"Times New Roman"/,
  /"SimSun"/,
  /"Songti SC"/,
  /"STSong"/,
  // Canonical color literals.
  /#111\b/,
  /#555\b/,
  /#d9d9d9\b/i,
  // Canonical line-heights.
  /line-height\s*:\s*1\.85\b/,
  /line-height\s*:\s*1\.7\b/,
]
for (const re of FORBIDDEN_LITERALS) {
  assert(
    `CSS does not hardcode the canonical token literal /${re.source}/`,
    !re.test(cssSrcNoComments),
    'shared token value found duplicated in CSS',
  )
}

/* ─── 6. server/print-renderer.mjs is unchanged in this PR ───────── */

console.log('\nTest 6: server/print-renderer.mjs is unchanged')

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
    return execSync('git merge-base HEAD origin/main', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim()
  } catch {
    try {
      return execSync('git merge-base HEAD main', {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .toString()
        .trim()
    } catch {
      return 'HEAD'
    }
  }
})()

const changed = safeGitDiffNames(`${baseRef}...HEAD`)

assert(
  'server/print-renderer.mjs is NOT in the diff',
  !changed.includes(SERVER_PRINT_RENDERER_REL),
  `server/print-renderer.mjs unexpectedly modified`,
)
assert(
  'No file under server/ is in the diff',
  !changed.some((p) => p.startsWith('server/')),
  `server/ changes: ${changed.filter((p) => p.startsWith('server/')).join(', ')}`,
)

// Server divergence is recorded somewhere — either in the tokens
// module itself (preferred) or in the follow-up doc.
const followUpSrc = existsSync(path.join(ROOT, FOLLOW_UP_REL))
  ? readSrc(FOLLOW_UP_REL)
  : ''
const serverDivergenceRecorded =
  /paperSurfaceServerCurrent/.test(tokensSrc) ||
  /paperSurfaceServerCurrent/.test(followUpSrc) ||
  /server\s+adoption/i.test(followUpSrc)
assert(
  'Server-current divergence is recorded (tokens or docs)',
  serverDivergenceRecorded,
  'no record of server divergence found',
)

/* ─── 7. Docs record A-thin + B2 server adoption pending ─────────── */

console.log('\nTest 7: docs record A-thin + B2 server adoption pending')

assert(
  'docs/paper-surface-spike-follow-up.md exists',
  existsSync(path.join(ROOT, FOLLOW_UP_REL)),
  FOLLOW_UP_REL,
)
assert(
  'Follow-up doc marks Gate 2 as RESOLVED FOR B1',
  /Gate\s*2[\s\S]{0,200}RESOLVED\s+FOR\s+B1/i.test(followUpSrc),
  'Gate 2 RESOLVED FOR B1 marker missing',
)
assert(
  'Follow-up doc names the A-thin strategy',
  /A-thin/i.test(followUpSrc),
  'A-thin strategy not named in follow-up',
)
assert(
  'Follow-up doc references shared/papersurface/tokens.mjs',
  /shared\/papersurface\/tokens\.mjs/.test(followUpSrc),
  'shared tokens module not referenced in follow-up',
)
assert(
  'Follow-up doc says server/print-renderer.mjs is intentionally unchanged in B1',
  /server\/print-renderer\.mjs/.test(followUpSrc) &&
    /(unchanged|intentionally\s+(?:un)?touched|not\s+touched)/i.test(followUpSrc),
  'server-untouched note missing in follow-up',
)
assert(
  'Follow-up doc defers server adoption to B2',
  /B2/.test(followUpSrc) &&
    /(server\s+adoption|adopt|visual\s+QA)/i.test(followUpSrc),
  'B2 server-adoption deferral missing',
)
// Overclaim guard: scan the doc with negated paragraphs stripped, so the
// explicit anti-claim (`It does **not** claim the CSS is now fully
// shared`) does not falsely trigger this rule.
const followUpAffirmativeOnly = followUpSrc
  .split(/\n\s*\n/)
  .filter((para) => !/\b(?:not|does\s+not|do\s+not|never|n't)\b/i.test(para))
  .join('\n\n')
assert(
  'Follow-up doc does NOT claim CSS is now fully shared',
  !/(CSS\s+(?:is|are)\s+(?:now\s+)?(?:fully\s+)?(?:shared|aligned|same))/i.test(
    followUpAffirmativeOnly,
  ),
  'follow-up overclaims CSS sharing',
)

/* ─── 8. Forbidden scope: no edits to package / lockfile / RA ────── */

console.log('\nTest 8: forbidden scope untouched')

const FORBIDDEN_PATHS = [
  /^app\/package\.json$/,
  /^app\/pnpm-lock\.yaml$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
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

/* ─── 9. Vite fs.allow is narrow (PR #32 review fix) ─────────────── */

console.log('\nTest 9: app/vite.config.ts server.fs.allow is narrowly scoped')

const VITE_CONFIG_REL = 'app/vite.config.ts'
assert(
  'app/vite.config.ts exists',
  existsSync(path.join(ROOT, VITE_CONFIG_REL)),
  VITE_CONFIG_REL,
)
const viteConfigSrc = readSrc(VITE_CONFIG_REL)
// Strip /* ... */ comments for the structural / regression checks; the
// header comment legitimately explains why repo-root is NOT allowed,
// so it must not be flagged.
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

// Behavioral check: every entry in fs.allow must resolve to the app
// package root or a path strictly under `shared/`. We do not actually
// evaluate the config (no Vite available on the cloud sandbox), but we
// lock down the expected literal shape. Any other shape needs explicit
// reviewer approval.
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
