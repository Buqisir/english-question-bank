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
  // header-unify DP-3 收账（owner 面板实指 2026-07-14）: shell 即桌——
  // 冷灰 --surface + 18px padding 的框是「头下灰缝」病灶，契约翻转为
  // 暖桌底 + 零内边距（与解析页 paper-browse-shell 同构）。
  assert(
    '.draft-workbench-shell background uses var(--paper-desk-bg) (DP-3: shell 即桌)',
    /background\s*:\s*var\(\s*--paper-desk-bg\s*\)/.test(block),
    `block: ${block.trim()}`,
  )
  assert(
    '.draft-workbench-shell has zero padding (DP-3: 头下无冷缝)',
    /padding\s*:\s*0\s*;/.test(block),
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

/* ─── 6. workbench-header-unify: Locked Decision 锚断言（CR SW-2 收账） ── */

console.log('\nTest 6: header-unify locked decisions stay locked (CR SW-2)')

{
  const cssNoComments = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '')
  assert(
    'the retired .draft-toolbar rule block stays out of the CSS (LD1/2)',
    !/\.draft-toolbar[\s,{.]/.test(cssNoComments),
    'a .draft-toolbar selector re-appeared',
  )
}
assert(
  'no draft-toolbar className mounts in the workbench (LD2)',
  !/className="draft-toolbar/.test(tsxSrc),
  'draft-toolbar className re-appeared',
)
{
  const deskBlock = cssSrc.match(/\.draft-preview-desk\s*\{[^}]*\}/)?.[0] || ''
  assert(
    'the desk block carries no margin-top (LD3 — the 18px gray sliver stays dead)',
    deskBlock.length > 0 && !/margin-top/.test(deskBlock),
    deskBlock || '.draft-preview-desk block not found',
  )
}
assert(
  'workbench drives AppTopbar via pageTitleEditable + actionsSlot (LD2)',
  /pageTitleEditable/.test(tsxSrc) && /actionsSlot=/.test(tsxSrc),
  'AppTopbar wiring props missing from DraftPaperWorkbench.tsx',
)

assert(
  'save status is beside the document title, including a visible failure state',
  /pageStatus=\{[\s\S]*?draft-save-status[\s\S]*?role="status"[\s\S]*?保存失败/.test(tsxSrc),
  'save status must not be hidden exclusively inside More',
)

/* ─── Summary ─────────────────────────────────────────────────────── */

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
