#!/usr/bin/env node
/**
 * verify-draft-workbench-visual-unify
 *
 * Cut draft-workbench-visual-unify (P0+P1, owner-approved plan). Design
 * review found the draft-paper workbench visually cut off from the rest
 * of the app: 55 hardcoded hex/rgba values in
 * `app/src/features/draft-paper/DraftPaperWorkbench.css`, a flat A4 sheet
 * with no shadow, a ghost-weight "保存" button competing with "取消", and
 * a native <details>/<summary> export menu that clips at the viewport edge.
 *
 * This script locks down the resulting contract:
 *
 *   1. DraftPaperWorkbench.css has zero DESIGN.md-palette hex hardcodes
 *      outside a small, explicitly-listed whitelist (opaque white used as
 *      a foreground color on a colored/dark background — the same
 *      convention App.css's `.primary-button` already uses).
 *   2. `.draft-a4-sheet` carries a real box-shadow (D1 — Resting elevation),
 *      not `none`.
 *   3. `.draft-workbench-shell` background resolves through a CSS var, not
 *      a literal hex (D3 — page-base token).
 *   4. The export menu is no longer a native `<details>`/`<summary>` (D5) —
 *      it is a custom floating panel wired for aria-expanded, outside-click
 *      dismiss, and Escape dismiss.
 *   5. The save-space dialog's primary "保存" action opts into the shared
 *      `.primary-button` accent treatment (D2), and the generic ghost-button
 *      selector explicitly excludes it so specificity doesn't clobber it.
 *
 * Cloud-safe: no browser, no build, no server — pure source-text checks.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE, '..')

let passed = 0
let failed = 0

function assert(name, condition, detail) {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}: ${detail || 'failed'}`)
  }
}

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf-8')
}

console.log('\n=== draft-workbench-visual-unify ===\n')

const CSS_REL = 'app/src/features/draft-paper/DraftPaperWorkbench.css'
const TSX_REL = 'app/src/features/draft-paper/DraftPaperWorkbench.tsx'

assert(`${CSS_REL} exists`, existsSync(path.join(ROOT, CSS_REL)), CSS_REL)
assert(`${TSX_REL} exists`, existsSync(path.join(ROOT, TSX_REL)), TSX_REL)

const cssSrc = readSrc(CSS_REL)
const tsxSrc = readSrc(TSX_REL)

/* ─── 1. Palette hex hardcode count === 0 (whitelist-adjusted) ──────── */

console.log('Test 1: DraftPaperWorkbench.css palette hardcodes are zero (whitelist below)')

// Strip /* ... */ comments first so prose like "no token exists for the
// #92400e original" doesn't get flagged as a live declaration. Preserve
// line numbers by replacing comment bodies with matching-length blanks
// (minus newlines, which are kept) rather than deleting them outright.
const cssSrcNoComments = cssSrc.replace(/\/\*[\s\S]*?\*\//g, (m) =>
  m.replace(/[^\n]/g, ' '),
)

// Every hex literal in the (comment-stripped) file, with its 1-indexed
// line number.
const hexMatches = [...cssSrcNoComments.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map((m) => {
  const upto = cssSrcNoComments.slice(0, m.index)
  const line = upto.split('\n').length
  return { value: m[0], line }
})

// Whitelist: opaque white (#ffffff / #FFFFFF) used as a foreground color
// on an accent/dark background — the same "white text on colored surface"
// convention App.css's `.primary-button` hardcodes (`color: #ffffff`).
// There is no DESIGN.md token for "foreground-on-accent"; App.css itself
// treats it as a neutral utility value, not a palette color choice.
//
// ui-p1-panels #15/#9: line numbers re-pinned after this cut inserted the
// draft-family :focus-visible block (item #9) above the toolbar rules and
// converted `.draft-version-toggle button.active`'s own `#ffffff` to a
// token (item #15's teal-50/teal-800 chip 选中态, no longer white-on-
// solid-teal at all) — that state's whitelist slot is retired, not
// re-pinned, since the declaration itself is gone.
// warm-paper-promotion: re-pinned again — .draft-preview-desk's 暖纸桌 token
// comment (+4 lines) and .draft-a4-sheet's Resting-shadow confirmation
// comment (+3 lines) push the second #ffffff (.draft-undo-toast color) from
// L374 to L381; the first (.draft-export-menu-trigger color) at L188 sits
// above both edits and is unaffected.
// draft-desk-a: re-pinned again — the outline→rail restructure (retired
// .draft-outline-*/.draft-workbench-layout, added the desk/rail/overlay
// block) sits entirely between the two whitelisted lines and is net +70
// lines, pushing the second #ffffff (.draft-undo-toast color) from L381 to
// L451; the first (.draft-export-menu-trigger color) at L188 sits above the
// edited region and is unaffected.
// motion-pass: re-pinned again — the `.draft-undo-toast` entrance-animation
// `animation:` declaration was inserted one line above `color: #ffffff`
// (motion-pass plan.md #6, audit #5), pushing it from L451 to L452; the
// trailing @keyframes block lands after this rule and does not affect
// either whitelisted line.
const WHITELISTED_LINES = new Set([188, 452])

const unexpectedHex = hexMatches.filter(
  (m) => !(m.value.toLowerCase() === '#ffffff' && WHITELISTED_LINES.has(m.line)),
)

assert(
  'zero non-whitelisted hex literals in DraftPaperWorkbench.css',
  unexpectedHex.length === 0,
  `found: ${unexpectedHex.map((m) => `${m.value}@L${m.line}`).join(', ')}`,
)

assert(
  'every whitelisted line still actually contains #ffffff (whitelist not stale)',
  [...WHITELISTED_LINES].every((line) =>
    hexMatches.some((m) => m.line === line && m.value.toLowerCase() === '#ffffff'),
  ),
  'a whitelisted line no longer contains #ffffff — tighten the whitelist',
)

/* ─── 2. D1: .draft-a4-sheet carries a Resting-tier shadow ──────────── */

console.log('\nTest 2: .draft-a4-sheet has a real box-shadow (D1)')

const a4SheetBlockMatch = cssSrc.match(/\.draft-a4-sheet\s*\{([^}]*)\}/)
assert('.draft-a4-sheet rule block found', Boolean(a4SheetBlockMatch), 'selector not found')
if (a4SheetBlockMatch) {
  const block = a4SheetBlockMatch[1]
  assert(
    '.draft-a4-sheet box-shadow is not "none"',
    /box-shadow\s*:\s*(?!none\b)/.test(block),
    `block: ${block.trim()}`,
  )
  assert(
    '.draft-a4-sheet box-shadow uses an ink-tinted rgba (not pure black)',
    /box-shadow\s*:\s*[^;]*rgba\(\s*30\s*,\s*30\s*,\s*28\s*,/.test(block),
    `block: ${block.trim()}`,
  )
}

/* ─── 3. D3: shell background resolves through a CSS var ────────────── */

console.log('\nTest 3: .draft-workbench-shell background is token-driven (D3)')

const shellBlockMatch = cssSrc.match(/\.draft-workbench-shell\s*\{([^}]*)\}/)
assert('.draft-workbench-shell rule block found', Boolean(shellBlockMatch), 'selector not found')
if (shellBlockMatch) {
  const block = shellBlockMatch[1]
  assert(
    '.draft-workbench-shell background uses var(--surface)',
    /background\s*:\s*var\(\s*--surface\s*\)/.test(block),
    `block: ${block.trim()}`,
  )
}

/* ─── 4. D5: export menu is a custom floating panel, not <details> ──── */

console.log('\nTest 4: export menu is a custom floating panel (D5), not native <details>')

// Strip // line comments so prose mentioning "<details>" doesn't trip the
// JSX-tag check.
const tsxSrcNoLineComments = tsxSrc.replace(/(^|[^:])\/\/[^\n]*/g, '$1')

assert(
  'DraftPaperWorkbench.tsx contains no <details JSX tag',
  !/<details[\s>]/.test(tsxSrcNoLineComments),
  '<details found — export menu still native',
)
assert(
  'DraftPaperWorkbench.tsx contains no <summary JSX tag',
  !/<summary[\s>]/.test(tsxSrcNoLineComments),
  '<summary found — export menu still native',
)
assert(
  'export menu trigger has aria-expanded wired to open state',
  /aria-expanded=\{exportMenuOpen\}/.test(tsxSrc),
  'aria-expanded={exportMenuOpen} not found on trigger',
)
assert(
  'export menu closes on Escape',
  /event\.key === 'Escape'/.test(tsxSrc) && /setExportMenuOpen\(false\)/.test(tsxSrc),
  'Escape-dismiss wiring not found',
)
assert(
  'export menu closes on outside click (ref containment check)',
  /exportMenuRef\.current\s*&&\s*!exportMenuRef\.current\.contains\(/.test(tsxSrc),
  'outside-click dismiss wiring not found',
)

const exportPanelBlockMatch = cssSrc.match(/\.draft-export-menu-panel\s*\{([^}]*)\}/)
assert('.draft-export-menu-panel rule block found', Boolean(exportPanelBlockMatch), 'selector not found')
if (exportPanelBlockMatch) {
  const block = exportPanelBlockMatch[1]
  assert(
    '.draft-export-menu-panel has a Floating-tier box-shadow',
    /box-shadow\s*:/.test(block),
    `block: ${block.trim()}`,
  )
  assert(
    '.draft-export-menu-panel is right-anchored to its trigger (right: 0)',
    /right\s*:\s*0\b/.test(block),
    `block: ${block.trim()}`,
  )
  assert(
    '.draft-export-menu-panel clamps its width to the viewport (no unbounded overflow)',
    /max-width\s*:\s*calc\(100vw/.test(block),
    `block: ${block.trim()}`,
  )
}

/* ─── 5. D2: save-space dialog primary button opts into .primary-button ─ */

console.log('\nTest 5: save-space dialog "保存" button uses the shared primary-button treatment (D2)')

assert(
  'submit button in the save-space dialog has className="primary-button"',
  /type="submit"\s+className="primary-button"/.test(tsxSrc),
  'primary-button class not found on the submit/save button',
)

const dialogActionsSelectorMatch = cssSrc.match(/\.draft-dialog-actions button([^,{]*)[,{]/)
assert(
  'the shared ghost-button selector explicitly excludes .primary-button (so specificity does not clobber it)',
  Boolean(dialogActionsSelectorMatch) && /:not\(\.primary-button\)/.test(dialogActionsSelectorMatch[0]),
  `selector: ${dialogActionsSelectorMatch ? dialogActionsSelectorMatch[0] : 'not found'}`,
)

/* ─── Summary ─────────────────────────────────────────────────────── */

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
