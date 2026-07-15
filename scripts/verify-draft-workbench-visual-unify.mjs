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
// draft-desk-b step3: added a THIRD whitelisted line — `.draft-a4-repaginating`
// (the "重新排版中…" badge, PO-2 简单版) is `background: var(--ink); color:
// #ffffff;`, the exact same "opaque white foreground on a dark/ink surface"
// convention as the other two whitelisted declarations, now at L294. Its rule
// block sits between `.draft-a4-sheet` and `.draft-undo-toast` in the file, so
// this insertion (+24 lines) also pushes `.draft-undo-toast`'s own `color:
// #ffffff` from L452 to L476; `.draft-export-menu-trigger`'s at L188 sits
// above the edited region and is unaffected.
// draft-desk-b step4 (SW-I): re-pinned again — `.draft-a4-repaginating--error`
// (the error-state sibling of the L294 badge) was inserted directly below
// `.draft-a4-repaginating`'s closing brace; it introduces NO new hex literal
// (its own `background` is `var(--eqb-color-danger)`, a token reference, not a
// literal) so the whitelist itself doesn't grow — the insertion (+10 lines)
// only pushes `.draft-undo-toast`'s `color: #ffffff` from L476 to L486; the
// other two whitelisted lines (L188, L294) sit above the edited region and are
// unaffected.
// print-form: re-pinned again — the `.draft-paper-meta-row`/`.draft-form-toggle`
// rules (Must Do 3, +16 lines) were inserted above `.draft-a4-repaginating`,
// pushing its `#ffffff` from L294 to L310; the `.draft-group-actions
// .draft-group-suggestion` rules (Must Do 5, +22 lines, no new hex literal —
// its own colors are all token references) were inserted above
// `.draft-undo-toast`, pushing its `#ffffff` from L486 to L524.
// `.draft-export-menu-trigger`'s at L188 sits above both edited regions and
// is unaffected.
// a3-imposition: re-pinned again — `.draft-paper-col.is-a3` and
// `.draft-a4-sheet.is-a3` (both no new hex literal — no `#ffffff` in either)
// were inserted above `.draft-a4-repaginating`, pushing its `#ffffff` from
// L310 to L327; `.draft-seam-suggestion`/`.draft-seam-suggestion:hover`
// (also no new hex literal — token references only) were inserted above
// `.draft-undo-toast`, pushing its `#ffffff` from L524 to L564.
// `.draft-export-menu-trigger`'s at L188 sits above every edited region and
// is unaffected.
// motion-press-exit: re-pinned again — three separate insertions, none
// containing a new `#ffffff` literal, land between the whitelisted lines:
// (a) a press-feedback `transition`/comment above `.draft-export-menu-trigger`
// pushes it from L188 to L190; (b) the export-menu press/entrance rules +
// keyframe (all token/var-based) sit between it and `.draft-a4-repaginating`,
// pushing that one from L327 to L352; (c) the rail-item transition +
// draft-version-toggle transition (both token-based) plus the
// draft-undo-toast keyframe→transition rewrite (same property count, no new
// hex) push `.draft-undo-toast`'s own `#ffffff` from L564 to L593.
// workbench-header-unify: re-pinned again — `.draft-toolbar` and its group
// clusters retired (net -34 lines incl. the replacement comment), and new
// blocks were inserted (`.draft-more-menu*`/`.draft-topbar-wide-toggle`
// above `.draft-loading`, the rail sticky-offset/meta comment above
// `.draft-paper-rail`) — none of the new blocks introduce a hex literal
// (all token/var-based). Net effect: `.draft-export-menu-trigger`'s
// `#ffffff` moves from L190 to L161, `.draft-a4-repaginating`'s from L352
// to L373, `.draft-undo-toast`'s from L593 to L630.
const WHITELISTED_LINES = new Set([161, 373, 630])

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
