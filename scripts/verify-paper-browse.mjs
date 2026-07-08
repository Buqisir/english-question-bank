#!/usr/bin/env node
/**
 * Verification: paper-browse (刀B 整卷预览页 v1).
 *
 * Static/source checks (see docs/cuts/paper-browse/plan.md for the
 * contract) plus one real-fixture structural check against the actual
 * paper-2026-i paper-asset.
 *
 *  1. App.tsx: paperBrowseRoute state seeded from `view=paper-browse` URL
 *     param (boot-read-once pattern, same shape as draftPaperRoute /
 *     mySpaceRouteActive).
 *  2. App.tsx: openPaperBrowse pushes `view=paper-browse&paperId=...` via
 *     history.pushState (never a full reload / location.href).
 *  3. App.tsx: paperBrowseOnBackToWorkbench strips the route params via
 *     history.replaceState — no reload, no location.href assignment.
 *  4. App.tsx: early-return branch renders <PaperBrowsePage ... /> guarded
 *     by paperBrowseRoute.active, alongside the draftPaperRoute /
 *     mySpaceRouteActive / currentPiRoute early-return branches (before
 *     the default workbench return).
 *  5. App.tsx: navigating to draft-paper-workbench / my-space clears
 *     paperBrowseRoute (mutual exclusion between the four routes).
 *  6. App.tsx: the detail page's onOpenPaperBrowse resolves paperId from
 *     paperSurfaceHref, not a new server field.
 *  7. QuestionGroupDetailView.tsx: exactly one new prop
 *     (onOpenPaperBrowse) and one new button ("看整卷"), gated on
 *     `selectedDetail.paperSurfaceHref`; existing detail-page markers
 *     (编辑/删除/加入草稿卷/答案对比统计) are untouched.
 *  8. PaperBrowsePage.tsx: imports PaperSurface from shared-ui/papersurface
 *     and the five paper-intelligence adapters; renders content.blocks in
 *     document order (no sort/reverse); handles every block type
 *     (partHeading/sectionHeading/instruction/group/pageBreakHint) plus a
 *     default placeholder for anything else; PaperSurface is mounted
 *     read-only (`lectureFocus={null}`, `onFocusIntent={() => {}}`); no
 *     "移出" affordance; exactly one addGroupsToBasket call site (per-card
 *     `[card]`, i.e. no whole-paper aggregate add).
 *  9. Real paper-2026-i paper-asset fixture: every groupType present in
 *     the fixture (reading, sevenChoices, cloze, grammarFill, writing) is
 *     handled by PaperBrowsePage.tsx, and the fixture's block-type
 *     sequence is non-empty and starts with a heading (sanity check that
 *     the "stream blocks in order" contract has real data to prove
 *     itself against).
 * 10. Housekeeping: this script is registered in verify-ci.mjs and marked
 *     `yes` in scripts/README.md (paired, per verify-architecture-
 *     housekeeping.mjs's CI-table / registry-parity guard).
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

console.log('paper-browse verify: whole-paper preview page (刀B v1)')

const appSrc = read('app/src/App.tsx')
const detailViewSrc = read('app/src/features/question-detail/QuestionGroupDetailView.tsx')
const pageSrc = read('app/src/features/paper-browse/PaperBrowsePage.tsx')
const verifyCiSrc = read('scripts/verify-ci.mjs')
const readmeSrc = read('scripts/README.md')
const asset = JSON.parse(
  read('app/public/paper-assets/paper-2026-i/latest/paper-asset.json'),
)

// ─── 1-2. App.tsx: paperBrowseRoute state + openPaperBrowse ───

assert(
  'App.tsx declares paperBrowseRoute state seeded from view=paper-browse',
  /const\s*\[\s*paperBrowseRoute\s*,\s*setPaperBrowseRoute\s*\]\s*=\s*useState/.test(appSrc) &&
    /params\.get\(\s*['"]view['"]\s*\)\s*===\s*['"]paper-browse['"]/.test(appSrc),
  'missing paperBrowseRoute useState seeded from the URL',
)

const openPaperBrowseBody =
  appSrc.match(
    /const openPaperBrowse\s*=\s*useCallback\s*\(\s*\(paperId[^{]*\{([\s\S]*?)\n\s*\},\s*\[\]\)/,
  )?.[1] || ''
assert('openPaperBrowse body extracted', openPaperBrowseBody.length > 0)
assert(
  'openPaperBrowse sets view=paper-browse via history.pushState',
  /url\.searchParams\.set\(\s*['"]view['"]\s*,\s*['"]paper-browse['"]\s*\)/.test(openPaperBrowseBody) &&
    /window\.history\.pushState\s*\(/.test(openPaperBrowseBody),
  'missing pushState wiring',
)
assert(
  'openPaperBrowse sets paperId query param',
  /url\.searchParams\.set\(\s*['"]paperId['"]\s*,\s*paperId\s*\)/.test(openPaperBrowseBody),
  'missing paperId param set',
)
assert(
  'openPaperBrowse does not reload the page',
  !/window\.location\.href\s*=/.test(openPaperBrowseBody) &&
    !/window\.location\.reload\s*\(/.test(openPaperBrowseBody),
  'openPaperBrowse touches window.location directly',
)

// ─── 3. paperBrowseOnBackToWorkbench ───

const backBody =
  appSrc.match(
    /const paperBrowseOnBackToWorkbench\s*=\s*useCallback\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\},\s*\[\]\)/,
  )?.[1] || ''
assert('paperBrowseOnBackToWorkbench body extracted', backBody.length > 0)
assert(
  'paperBrowseOnBackToWorkbench rewrites the URL via history.replaceState',
  /window\.history\.replaceState\s*\(/.test(backBody),
  'missing replaceState call',
)
assert(
  'paperBrowseOnBackToWorkbench does not reload the page',
  !/window\.location\.href\s*=/.test(backBody) && !/window\.location\.reload\s*\(/.test(backBody),
  'paperBrowseOnBackToWorkbench touches window.location directly',
)
assert(
  'paperBrowseOnBackToWorkbench flips paperBrowseRoute to inactive',
  /setPaperBrowseRoute\s*\(\s*\{\s*active:\s*false/.test(backBody),
  'missing setPaperBrowseRoute({ active: false, ... })',
)

// ─── 4. Early-return render branch ───

const paperBrowseBranch =
  appSrc.match(
    /if\s*\(\s*paperBrowseRoute\.active[^)]*\)\s*\{([\s\S]*?)\n\s\s\}\n/,
  )?.[1] || ''
assert('paperBrowseRoute early-return branch found', paperBrowseBranch.length > 0)
assert(
  'paperBrowseRoute branch renders <PaperBrowsePage',
  /<PaperBrowsePage\b/.test(paperBrowseBranch),
  'branch does not render PaperBrowsePage',
)
assert(
  'App.tsx imports PaperBrowsePage from features/paper-browse',
  /import\s*\{\s*PaperBrowsePage\s*\}\s*from\s*['"]\.\/features\/paper-browse\/PaperBrowsePage['"]/.test(
    appSrc,
  ),
  'missing PaperBrowsePage import',
)
assert(
  'paperBrowseRoute branch appears before the default workbench return',
  appSrc.indexOf('if (paperBrowseRoute.active') <
    appSrc.lastIndexOf("<div className=\"app-shell home-mode-ai\">"),
  'branch ordered after the default workbench render',
)
assert(
  'paperBrowseRoute branch appears alongside draftPaperRoute/mySpaceRouteActive branches',
  appSrc.indexOf('if (draftPaperRoute.active)') <
    appSrc.indexOf('if (paperBrowseRoute.active') &&
    appSrc.indexOf('if (paperBrowseRoute.active') < appSrc.indexOf("if (currentPiRoute.kind === 'paper-intelligence') {"),
  'branch not ordered with the other route early-returns',
)

// ─── 5. Mutual exclusion with the other three routes ───

const openDraftBody =
  appSrc.match(
    /const openDraftPaperWorkbench\s*=\s*useCallback\s*\(\s*\(draftPaperId[^{]*\{([\s\S]*?)\n\s*\},\s*\[\]\)/,
  )?.[1] || ''
assert(
  'openDraftPaperWorkbench clears paperBrowseRoute',
  /setPaperBrowseRoute\s*\(\s*\{\s*active:\s*false/.test(openDraftBody),
  'openDraftPaperWorkbench does not deactivate paperBrowseRoute',
)

const openMySpaceBody =
  appSrc.match(/const openMySpace\s*=\s*useCallback\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\},\s*\[\]\)/)?.[1] ||
  ''
assert(
  'openMySpace clears paperBrowseRoute',
  /setPaperBrowseRoute\s*\(\s*\{\s*active:\s*false/.test(openMySpaceBody),
  'openMySpace does not deactivate paperBrowseRoute',
)

// ─── 6. Detail-page entry resolves paperId from paperSurfaceHref ───

const openFromDetailBody =
  appSrc.match(
    /const openPaperBrowseFromDetail\s*=\s*useCallback\s*\(\s*\(detail[^{]*\{([\s\S]*?)\n\s*\},\s*\[openPaperBrowse\]\s*,?\s*\)/,
  )?.[1] || ''
assert('openPaperBrowseFromDetail body extracted', openFromDetailBody.length > 0)
assert(
  'openPaperBrowseFromDetail reads detail.paperSurfaceHref',
  /detail\.paperSurfaceHref/.test(openFromDetailBody),
  'does not reference detail.paperSurfaceHref',
)
assert(
  'openPaperBrowseFromDetail parses paperId out of the href query string',
  /params\.get\(\s*['"]paperId['"]\s*\)/.test(openFromDetailBody),
  'does not parse paperId from the href',
)
assert(
  'App.tsx wires onOpenPaperBrowse={openPaperBrowseFromDetail} into QuestionGroupDetailView',
  /onOpenPaperBrowse=\{openPaperBrowseFromDetail\}/.test(appSrc),
  'missing onOpenPaperBrowse prop wiring',
)

// ─── 7. QuestionGroupDetailView.tsx: one prop, one button ───

assert(
  'QuestionGroupDetailView props type declares onOpenPaperBrowse',
  /onOpenPaperBrowse:\s*\(detail:\s*QuestionGroupDetail\)\s*=>\s*void/.test(detailViewSrc),
  'missing onOpenPaperBrowse in props type',
)
assert(
  'QuestionGroupDetailView renders exactly one 看整卷 button',
  (detailViewSrc.match(/看整卷/g) || []).length === 1,
  'expected exactly one 看整卷 occurrence',
)
assert(
  '看整卷 button is gated on selectedDetail.paperSurfaceHref',
  /\{selectedDetail\.paperSurfaceHref\s*&&\s*\(\s*<button[\s\S]*?看整卷/.test(detailViewSrc),
  '看整卷 button is not gated on paperSurfaceHref',
)
assert(
  '看整卷 button calls onOpenPaperBrowse(selectedDetail)',
  /onClick=\{\(\)\s*=>\s*onOpenPaperBrowse\(selectedDetail\)\}/.test(detailViewSrc),
  'missing onOpenPaperBrowse(selectedDetail) click handler',
)
// Existing detail-page surfaces this cut must not disturb (classic-retire-2
// contract; this is a light re-check, not a duplicate of that verify).
for (const marker of ['编辑', '删除', '加入草稿卷', 'answerCompareStats']) {
  assert(
    `QuestionGroupDetailView still contains "${marker}" (untouched by this cut)`,
    detailViewSrc.includes(marker),
    `${marker} missing — detail view scope may have been touched beyond the entry button`,
  )
}

// ─── 8. PaperBrowsePage.tsx source contract ───

assert(
  "PaperBrowsePage imports PaperSurface from '../../shared-ui/papersurface/PaperSurface'",
  /import\s*\{\s*PaperSurface\s*\}\s*from\s*['"]\.\.\/\.\.\/shared-ui\/papersurface\/PaperSurface['"]/.test(
    pageSrc,
  ),
  'missing PaperSurface import',
)
for (const builder of [
  'buildPaperAssetSurfaceModel',
  'buildSevenChoicesSurfaceModel',
  'buildClozePaperView',
  'buildGrammarFillPaperView',
  'buildWritingPaperView',
]) {
  assert(
    `PaperBrowsePage imports ${builder} from features/paper-intelligence`,
    new RegExp(`${builder}[\\s\\S]{0,80}from '\\.\\./paper-intelligence/`).test(pageSrc),
    `missing ${builder} import from paper-intelligence`,
  )
}
assert(
  'PaperBrowsePage renders content.blocks in document order (no sort/reverse)',
  /asset\.content\.blocks\.map\(/.test(pageSrc) &&
    !/content\.blocks[\s\S]{0,40}\.(sort|reverse)\(/.test(pageSrc),
  'blocks are not rendered via a plain in-order .map, or are reordered',
)
for (const blockType of ['partHeading', 'sectionHeading', 'instruction', 'group', 'pageBreakHint']) {
  assert(
    `PaperBrowsePage's block switch handles "${blockType}"`,
    new RegExp(`case\\s*['"]${blockType}['"]\\s*:`).test(pageSrc),
    `missing case '${blockType}':`,
  )
}
assert(
  'PaperBrowsePage has a default placeholder branch for unknown block types',
  /default:[\s\S]{0,200}placeholder/.test(pageSrc),
  'missing default placeholder branch',
)
assert(
  'PaperSurface is mounted read-only: lectureFocus is always null',
  /lectureFocus=\{null\}/.test(pageSrc),
  'lectureFocus is not a static null — page may be wiring interactive focus',
)
assert(
  'PaperSurface onFocusIntent is a no-op',
  /onFocusIntent=\{\(\)\s*=>\s*\{\}\}/.test(pageSrc),
  'onFocusIntent is not a no-op — page may be wiring evidence/annotation interaction',
)
assert(
  'PaperBrowsePage has no "移出" (remove-from-basket) affordance',
  !pageSrc.includes('移出'),
  '移出 affordance found — out of scope per plan',
)
assert(
  'PaperBrowsePage calls onAddGroupsToBasket exactly once (per-card [card], no whole-paper aggregate add)',
  (pageSrc.match(/onAddGroupsToBasket\(/g) || []).length === 1 &&
    /onAddGroupsToBasket\(\[card\]\)/.test(pageSrc),
  'expected exactly one onAddGroupsToBasket([card]) call site',
)

// ─── 9. Real paper-2026-i fixture structural check ───

const blockTypes = asset.content.blocks.map((b) => b.type)
assert('paper-2026-i fixture has a non-empty blocks array', blockTypes.length > 0)
assert(
  'paper-2026-i fixture starts with partHeading then sectionHeading (order sanity check)',
  blockTypes[0] === 'partHeading' && blockTypes[1] === 'sectionHeading',
  `got: ${blockTypes.slice(0, 2).join(', ')}`,
)

const groupTypesInFixture = new Set(
  asset.content.blocks
    .filter((b) => b.type === 'group')
    .map((b) => asset.content.groups[b.groupId]?.groupType),
)
assert(
  'paper-2026-i fixture exercises all five known group types',
  ['reading', 'sevenChoices', 'cloze', 'grammarFill', 'writing'].every((t) =>
    groupTypesInFixture.has(t),
  ),
  `fixture group types: ${[...groupTypesInFixture].join(', ')}`,
)
for (const groupType of groupTypesInFixture) {
  assert(
    `PaperBrowsePage source handles fixture groupType "${groupType}"`,
    pageSrc.includes(`group.groupType === '${groupType}'`),
    `missing group.groupType === '${groupType}' branch`,
  )
}

// Fixture also carries an unsupported block type (answerBox) — proves the
// placeholder path has something real to render against, not just cloze/
// grammarFill/writing instruction rows.
assert(
  'paper-2026-i fixture contains a block type PaperBrowsePage does NOT special-case (answerBox)',
  blockTypes.includes('answerBox') && !/case\s*['"]answerBox['"]\s*:/.test(pageSrc),
  'expected answerBox to fall through to the default placeholder',
)

// ─── 10. Housekeeping pairing ───

assert(
  'verify-ci includes verify-paper-browse.mjs',
  verifyCiSrc.includes('scripts/verify-paper-browse.mjs'),
  'missing from scripts/verify-ci.mjs registry',
)
assert(
  'scripts/README.md documents verify-paper-browse.mjs as yes',
  /`verify-paper-browse\.mjs`[^\n]*\|\s*yes\s*\|/.test(readmeSrc),
  'missing or not marked yes in scripts/README.md',
)

if (failed > 0) {
  console.error(`\npaper-browse verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\npaper-browse verify passed: ${passed} passed, 0 failed`)
