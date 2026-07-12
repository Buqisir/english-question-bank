#!/usr/bin/env node
/**
 * my-space-shelf verify: MySpacePage rebuilt as a token-only card shelf
 * (docs/cuts/my-space-shelf/plan.md), replacing the admin-file-manager
 * two-column layout (folder tree + file rows + triple heading + hardcoded
 * palette). Updated in docs/cuts/dossier-cabinet/plan.md for the month-
 * archive-group + miniature-A4-card + upgraded delete-dialog-copy form.
 *
 * Asserts:
 *   1. MySpacePage.css carries zero hardcoded palette hex (allowlist is
 *      empty — every color is var(--eqb-*)/var(--paper-*) or color-mix()
 *      built from one).
 *   2. MySpacePage.tsx contains no window.confirm; the delete flow uses a
 *      custom confirm dialog instead, with dossier-cabinet's upgraded copy
 *      ("删除草稿卷 PDF" title, "删除 PDF" confirm action).
 *   3. Card grid class exists with the auto-fill/minmax track from the
 *      plan (minmax(200px, 1fr), per dossier-cabinet's miniature-A4 cards).
 *   4. Primary action class (solid var(--eqb-color-primary)) and danger
 *      action class (var(--eqb-color-danger)) both exist.
 *   5. The old triple-heading ("N 个 PDF") text is gone.
 *   6. Folder filter chips are conditional on folders.length > 0 (renders
 *      nothing for 0/1 folders, per plan.md Locked Decision 2).
 *   7. Artifacts are grouped into month-archive sections (dossier-cabinet).
 */

import { readFileSync } from 'node:fs'
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

console.log('my-space-shelf verify: card shelf token/behavior contract')

const CSS_PATH = 'app/src/features/my-space/MySpacePage.css'
const TSX_PATH = 'app/src/features/my-space/MySpacePage.tsx'

const css = read(CSS_PATH)
const tsx = read(TSX_PATH)

// 1. Palette-hex-zero audit. Allowlist is intentionally empty — every color
// in this file is a var(--eqb-*) token or a color-mix() wash of one.
const HEX_ALLOWLIST = []
const hexMatches = css.match(/#[0-9a-fA-F]{3,8}\b/g) || []
const unexpectedHex = hexMatches.filter((hex) => !HEX_ALLOWLIST.includes(hex.toLowerCase()))
assert(
  'MySpacePage.css has zero hardcoded palette hex (allowlist empty)',
  unexpectedHex.length === 0,
  unexpectedHex.join(', '),
)

// 2. No window.confirm — delete uses a custom modal with dossier-cabinet's
// upgraded copy (title + "删除 PDF" confirm action, cancel-then-confirm order).
assert('MySpacePage.tsx does not use window.confirm', !tsx.includes('window.confirm'))
assert(
  'MySpacePage.tsx renders a custom confirm dialog (role="alertdialog")',
  tsx.includes('role="alertdialog"') && tsx.includes('my-space-confirm-dialog'),
)
assert(
  'confirm dialog has the upgraded title + cancel + confirm action copy',
  /删除草稿卷 PDF/.test(tsx) && /取消/.test(tsx) && /删除 PDF/.test(tsx),
)

// 3. Card grid.
assert('MySpacePage.tsx renders a card grid container', tsx.includes('my-space-grid'))
const gridRuleMatch = css.match(/\.my-space-grid\s*\{[^}]*\}/)
assert('MySpacePage.css defines .my-space-grid', Boolean(gridRuleMatch))
assert(
  '.my-space-grid uses the auto-fill/minmax(200px, 1fr) track',
  Boolean(gridRuleMatch) && /repeat\(auto-fill,\s*minmax\(200px,\s*1fr\)\)/.test(gridRuleMatch[0]),
)
assert('MySpacePage.tsx renders card elements with the card class', tsx.includes('my-space-card'))

// 7. Month-archive grouping (dossier-cabinet).
assert(
  'MySpacePage.tsx groups artifacts into month-archive sections',
  tsx.includes('my-space-month-group') && tsx.includes('my-space-month-head'),
)

// 4. Primary + danger action classes.
const primaryRuleMatch = css.match(/\.my-space-card-primary\s*\{[^}]*\}/)
assert('MySpacePage.css defines .my-space-card-primary', Boolean(primaryRuleMatch))
assert(
  '.my-space-card-primary fills solid with the primary token',
  Boolean(primaryRuleMatch) && /background:\s*var\(--eqb-color-primary\)/.test(primaryRuleMatch[0]),
)
assert('MySpacePage.tsx applies the primary action class to 下载 PDF', /my-space-card-primary["'][\s\S]{0,300}下载 PDF/.test(tsx))

const dangerRuleMatch = css.match(/\.my-space-card-danger(?::hover[^{]*)?\s*\{[^}]*\}/g) || []
assert('MySpacePage.css defines .my-space-card-danger rules', dangerRuleMatch.length > 0)
assert(
  '.my-space-card-danger references the danger token',
  dangerRuleMatch.some((rule) => rule.includes('var(--eqb-color-danger)')),
)

// 5. Triple-heading text is gone.
assert('MySpacePage.tsx no longer renders the "N 个 PDF" heading', !tsx.includes('个 PDF'))
assert('MySpacePage.tsx no longer renders the "全部文件" sidebar label', !tsx.includes('全部文件'))

// 6. Folder chips conditional on folders.length > 0.
assert(
  'folder filter chips are gated on folders.length > 0',
  /folders\.length\s*>\s*0\s*&&/.test(tsx),
)
assert('folder chip elements carry the chip class', tsx.includes('my-space-chip'))

if (failed > 0) {
  console.error(`\nmy-space-shelf verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nmy-space-shelf verify passed: ${passed} passed, 0 failed`)
