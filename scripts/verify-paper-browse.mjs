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
 *     (编辑/删除/加入草稿卷) are untouched. (答案对比统计 dropped from this
 *     list by detail-slim, owner 2026-07-08 — see verify-classic-retire-2.mjs.)
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
 * 11-14. paper-browse-polish (owner 实测 4 病根修复), anchored on the REAL
 *     paper-960d0f8d fixture (the actual asset the owner play-tested):
 *     11. numeric-stem suppression — a cloze/grammar-fill question whose
 *         stored stem is just its bare questionNo (e.g. stem "56" for
 *         questionNo 56) renders as "" instead of duplicating the "56."
 *         label ("56. 56").
 *     12. old-form grammar-fill blank normalization — 960d0f8d's stored
 *         grammar-fill passage uses the I15 in-passage-editor form
 *         (`56._____`, `57._____(absorb)`); buildGrammarFillPaperView's
 *         rail-mode textMap normalizes it to the `__NN__ (hint)` form
 *         `paperBlankPattern` (shared/papersurface/blankPattern.mjs)
 *         matches, without touching the harness's separate I15 in-passage
 *         adapter (grammarFillAnalysisSurfaceAdapter.ts).
 *     13. writing-block dedup — PaperBrowsePage computes a writingSkipIndices
 *         set (via writingPageModel.mjs's findWritingBlockRange) and does
 *         not render a writing group's own chrome blocks (part/section
 *         heading, instruction, answerBox) a second time at the top level.
 *     14. starter no-double-prefix — buildWritingPageModel does not
 *         re-prefix a continuation starter that already carries its own
 *         "Paragraph N:" prefix (960d0f8d's stored continuationStarters).
 * 15-17. surface-question-policy (owner 验收三反馈修复):
 *     15. PaperSurface.tsx source carries the empty-stem policy (options
 *         collapse onto one line; empty-stem-no-options renders nothing),
 *         plus the real 960d0f8d/2026-i cloze fixtures still produce the
 *         {stem: '', options: [...]} shape that triggers the one-line
 *         branch (the adapter-level half of "source-level ok + adapter-
 *         fed behavioral" per the cut's verify contract).
 *     16. grammar rows suppressed — a real grammarFill question with an
 *         empty stem AND no options (no stored blank.prompt) exists in
 *         the 960d0f8d/2026-i fixtures, the exact data shape that hits
 *         PaperSurface's "return null" branch.
 *     17. Application-letter scaffold — 960d0f8d's real Dear Chris/Yours
 *         paragraphs extract into the answer box's given top/bottom and
 *         are stripped from the passage textMap; 2026-i's application
 *         task has no Dear paragraph at all (an opinion-column submission,
 *         not a letter) — corrects the "2026-i also has a Dear Kate
 *         scaffold" premise floated at cut kickoff, and proves current
 *         (empty-box) behavior is preserved for that shape.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findWritingBlockRange } from '../app/src/features/paper-intelligence/writingPageModel.mjs'

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
// paper-row-browse-entry 起，href→paperId 解析收敛进共享的
// parsePaperIdFromHref（concierge/paperSurfaceHref.ts），详情页入口与
// 首页卷行入口共用。断言改钉两段：入口调用共享解析 + 共享解析真的取 paperId。
assert(
  'openPaperBrowseFromDetail parses paperId via the shared helper',
  /parsePaperIdFromHref\s*\(\s*detail\.paperSurfaceHref\s*\)/.test(openFromDetailBody),
  'does not call parsePaperIdFromHref on the href',
)
const hrefHelperSrc = read('app/src/concierge/paperSurfaceHref.ts')
assert(
  'shared href helper parses paperId out of the query string',
  /params\.get\(\s*['"]paperId['"]\s*\)/.test(hrefHelperSrc),
  'paperSurfaceHref.ts does not parse paperId',
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
// 'answerCompareStats' dropped from this list — detail-slim (owner
// 2026-07-08) deletes that surface entirely; verify-classic-retire-2.mjs
// now owns the absence guard for it.
for (const marker of ['编辑', '删除', '加入草稿卷']) {
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

// ─── 11-12. Real paper-960d0f8d fixture: numeric-stem suppression +
//            old-form grammar-fill blank normalization ───

const { buildClozePaperView } = await import(
  '../app/src/features/paper-intelligence/clozePaperViewAdapter.ts'
)
const { buildGrammarFillPaperView } = await import(
  '../app/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts'
)
const { buildWritingPageModel, extractApplicationScaffold } = await import(
  '../app/src/features/paper-intelligence/writingPageModel.mjs'
)
const { buildWritingPaperView } = await import(
  '../app/src/features/paper-intelligence/writingPaperViewAdapter.ts'
)

const asset960d0f8d = JSON.parse(
  read('app/public/paper-assets/paper-960d0f8d/latest/paper-asset.json'),
)

// 960d0f8d's real stored data has bare-numeric stems ("56" for questionNo
// 56) — the exact shape that produced the owner-observed "56. 56" bug.
const rawGrammarFillQ56Stem = asset960d0f8d.content.questions['q-960d0f8d-056']?.stem
assert(
  '960d0f8d fixture sanity: stored grammarFill stem is bare numeric "56" (proves the bug had real data to trigger on)',
  rawGrammarFillQ56Stem === '56',
  `got: ${JSON.stringify(rawGrammarFillQ56Stem)}`,
)

const clozeModel960 = buildClozePaperView({
  asset: asset960d0f8d,
  groupId: 'group-960d0f8d-cloze',
})
assert(
  '960d0f8d cloze: numeric-only stems are suppressed to "" (no "41. 41" duplicate)',
  clozeModel960.surfaceData.questions.length > 0 &&
    clozeModel960.surfaceData.questions.every((q) => q.stem === ''),
  JSON.stringify(clozeModel960.surfaceData.questions.map((q) => q.stem)),
)

const grammarFillModel960 = buildGrammarFillPaperView({
  asset: asset960d0f8d,
  groupId: 'group-960d0f8d-grammar-fill',
})
assert(
  '960d0f8d grammarFill: numeric-only stems are suppressed to "" (no "56. 56" duplicate)',
  grammarFillModel960.surfaceData.questions.length > 0 &&
    grammarFillModel960.surfaceData.questions.every((q) => q.stem === ''),
  JSON.stringify(grammarFillModel960.surfaceData.questions.map((q) => q.stem)),
)

const grammarFillParagraphText960 = grammarFillModel960.surfaceData.textMap.paragraphs
  .flatMap((p) => p.sentences.map((s) => s.text))
  .join(' ')
assert(
  '960d0f8d grammarFill: stored old-form blank "56._____" is gone from the rail-mode textMap',
  !/\d{1,3}\._{2,}/.test(grammarFillParagraphText960),
  grammarFillParagraphText960.slice(0, 120),
)
assert(
  '960d0f8d grammarFill: rail-mode textMap now carries __56__ (paperBlankPattern form)',
  /__56__/.test(grammarFillParagraphText960),
  grammarFillParagraphText960.slice(0, 120),
)
assert(
  '960d0f8d grammarFill: normalized blank keeps its (hint) — "__57__ (absorb)"',
  /__57__\s*\(absorb\)/.test(grammarFillParagraphText960),
  grammarFillParagraphText960.slice(0, 120),
)

// The harness's clickable I15 in-passage path is built by a *different*
// adapter (grammarFillAnalysisSurfaceAdapter.ts) that never calls
// buildGrammarFillPaperView, so normalizing this textMap cannot break it.
assert(
  "grammarFillAnalysisSurfaceAdapter.ts (harness's I15 in-passage adapter) does not import buildGrammarFillPaperView — the normalize-for-rail transform is isolated to the rail path",
  !read('app/src/features/paper-intelligence/grammarFillAnalysisSurfaceAdapter.ts').includes(
    'buildGrammarFillPaperView',
  ),
)

// ─── 13. Real paper-960d0f8d fixture: writing-block dedup ───

const writingGroupBlocks960 = asset960d0f8d.content.blocks
  .map((b, i) => ({ b, i }))
  .filter(({ b }) => b.type === 'group' && asset960d0f8d.content.groups[b.groupId]?.groupType === 'writing')
assert(
  '960d0f8d fixture has two writing groups (application + continuation) to prove dedup against',
  writingGroupBlocks960.length === 2,
  `found ${writingGroupBlocks960.length}`,
)
const writingSkip960 = new Set()
for (const { b } of writingGroupBlocks960) {
  const group = asset960d0f8d.content.groups[b.groupId]
  const range = findWritingBlockRange(asset960d0f8d, group)
  assert(`960d0f8d writing group ${b.groupId}: findWritingBlockRange resolves a range`, Boolean(range))
  for (let i = range.startIdx; i <= range.endIdx; i += 1) {
    if (i !== range.groupIdx) writingSkip960.add(i)
  }
}
assert(
  "PaperBrowsePage.tsx computes a writingSkipIndices set from findWritingBlockRange and skips those indices in the top-level render",
  /findWritingBlockRange/.test(pageSrc) &&
    /writingSkipIndices/.test(pageSrc) &&
    /writingSkipIndices\.has\(index\)/.test(pageSrc),
  'missing writingSkipIndices wiring in PaperBrowsePage.tsx',
)
assert(
  "960d0f8d fixture: writingSkipIndices covers each writing group's answerBox block (no top-level double-render of the answer box)",
  writingGroupBlocks960.every(({ b }) => {
    const idx = asset960d0f8d.content.blocks.findIndex(
      (bl) => bl.type === 'answerBox' && bl.writingTaskId === asset960d0f8d.content.groups[b.groupId].writingTaskId,
    )
    return idx >= 0 && writingSkip960.has(idx)
  }),
)
assert(
  "960d0f8d fixture: writingSkipIndices never includes a writing group's own block index (still rendered once, via the group card)",
  writingGroupBlocks960.every(({ i }) => !writingSkip960.has(i)),
)

// ─── 14. Real paper-960d0f8d fixture: starter no-double-prefix ───

const continuationGroup960 = Object.values(asset960d0f8d.content.groups).find(
  (g) => g.groupType === 'writing' && asset960d0f8d.content.writingTasks?.[g.writingTaskId]?.taskType === 'continuation',
)
const continuationTask960 = asset960d0f8d.content.writingTasks[continuationGroup960.writingTaskId]
assert(
  '960d0f8d fixture sanity: stored continuationStarters already carry their own "Paragraph N:" prefix (the exact shape that used to double-prefix)',
  continuationTask960.continuationStarters.every((s) => /^Paragraph \d+:/.test(s)),
  JSON.stringify(continuationTask960.continuationStarters),
)
const continuationPageModel960 = buildWritingPageModel(asset960d0f8d, continuationGroup960, continuationTask960)
const continuationBox960 = continuationPageModel960.blocks.find((b) => b.kind === 'answerBox')
assert(
  '960d0f8d continuation: answerBox givenTop is NOT double-prefixed ("Paragraph 1: Paragraph 1:")',
  Boolean(continuationBox960) && continuationBox960.givenTop.every((line) => !/^Paragraph \d+:\s*Paragraph \d+:/.test(line)),
  JSON.stringify(continuationBox960?.givenTop),
)
assert(
  '960d0f8d continuation: the stale doubled-prefix instruction block (960d0f8d storage bug) is folded into the answer box, not rendered a second time as a standalone instruction',
  !continuationPageModel960.blocks.some(
    (b) => b.kind === 'instruction' && /Paragraph \d+:\s*Paragraph \d+:/.test(b.text),
  ),
  JSON.stringify(continuationPageModel960.blocks.filter((b) => b.kind === 'instruction').map((b) => b.text)),
)

// ─── 15. surface-question-policy: cloze one-line policy ───

const paperSurfaceSrc = read('app/src/shared-ui/papersurface/PaperSurface.tsx')
const paperSurfaceCssSrc = read('app/src/shared-ui/papersurface/PaperSurface.css')

assert(
  'PaperSurface.tsx: empty stem + options collapses onto one line (ps-question-options-inline)',
  /!trimmedStem\s*&&\s*hasOptions/.test(paperSurfaceSrc) &&
    paperSurfaceSrc.includes('ps-question-options-inline'),
  'missing the empty-stem + options one-line branch',
)
assert(
  'PaperSurface.css declares .ps-question-options-inline',
  paperSurfaceCssSrc.includes('.ps-question-options-inline'),
  'missing .ps-question-options-inline rule',
)

for (const [label, model] of [
  ['960d0f8d', clozeModel960],
  ['2026-i', buildClozePaperView({ asset, groupId: 'group-2026-i-cloze' })],
]) {
  assert(
    `${label} cloze: every question has empty stem + non-empty options (triggers the one-line branch)`,
    model.surfaceData.questions.length > 0 &&
      model.surfaceData.questions.every((q) => q.stem === '' && q.options.length > 0),
    JSON.stringify(model.surfaceData.questions.map((q) => ({ stem: q.stem, n: q.options.length }))),
  )
}

// ─── 16. surface-question-policy: grammar rows suppressed ───

assert(
  'PaperSurface.tsx: empty stem + no options renders nothing (return null)',
  /!trimmedStem\s*&&\s*!hasOptions[\s\S]{0,40}return null/.test(paperSurfaceSrc),
  'missing the empty-stem + no-options suppression branch',
)

const grammarFillModel2026i = buildGrammarFillPaperView({
  asset,
  groupId: 'group-2026-i-grammar-fill',
})
const suppressedQuestions2026i = grammarFillModel2026i.surfaceData.questions.filter(
  (q) => q.stem === '' && q.options.length === 0,
)
assert(
  '2026-i grammarFill fixture: EVERY question has empty stem + no options (synthetic prompt option retired — hints render in-passage; all rail rows suppressed)',
  suppressedQuestions2026i.length === grammarFillModel2026i.surfaceData.questions.length && grammarFillModel2026i.surfaceData.questions.length > 0,
  JSON.stringify(grammarFillModel2026i.surfaceData.questions.map((q) => ({ no: q.questionNo, stem: q.stem, n: q.options.length }))),
)
const suppressedQuestions960 = grammarFillModel960.surfaceData.questions.filter(
  (q) => q.stem === '' && q.options.length === 0,
)
assert(
  '960d0f8d grammarFill fixture: every question has empty stem + no options (no stored blank.prompt anywhere in this paper)',
  suppressedQuestions960.length === grammarFillModel960.surfaceData.questions.length,
  JSON.stringify(grammarFillModel960.surfaceData.questions.map((q) => ({ no: q.questionNo, stem: q.stem, n: q.options.length }))),
)

// ─── 17. surface-question-policy: application-letter scaffold ───

// 960d0f8d: real Dear Chris / Yours, Li Hua paragraphs.
const appGroup960 = asset960d0f8d.content.groups['group-960d0f8d-writing-application']
const appTask960 = asset960d0f8d.content.writingTasks[appGroup960.writingTaskId]
assert(
  '960d0f8d fixture sanity: application task has a "Dear Chris," paragraph (proves the scaffold has real data to trigger on)',
  (appGroup960.passage?.paragraphs ?? []).some((p) => /^Dear\b.*,?\s*$/.test(p.text.trim())),
)

const scaffold960 = extractApplicationScaffold(appGroup960.passage?.paragraphs ?? [])
assert(
  '960d0f8d application scaffold extracts givenTop = ["Dear Chris,", opening sentence]',
  Boolean(scaffold960) &&
    scaffold960.top.length === 2 &&
    scaffold960.top[0] === 'Dear Chris,' &&
    /^I.m Li Hua/.test(scaffold960.top[1]),
  JSON.stringify(scaffold960?.top),
)
assert(
  '960d0f8d application scaffold extracts givenBottom = ["Yours,", "Li Hua"]',
  Boolean(scaffold960) &&
    scaffold960.bottom.length === 2 &&
    scaffold960.bottom[0] === 'Yours,' &&
    scaffold960.bottom[1] === 'Li Hua',
  JSON.stringify(scaffold960?.bottom),
)

const appPageModel960 = buildWritingPageModel(asset960d0f8d, appGroup960, appTask960)
const appBox960 = appPageModel960.blocks.find((b) => b.kind === 'answerBox')
assert(
  '960d0f8d application answerBox: givenTop/givenBottom carry the extracted scaffold (routed through the existing applicationGiven top/bottom mechanism)',
  Boolean(appBox960) &&
    JSON.stringify(appBox960.givenTop) === JSON.stringify(scaffold960.top) &&
    JSON.stringify(appBox960.givenBottom) === JSON.stringify(scaffold960.bottom),
  JSON.stringify(appBox960),
)

const appPaperView960 = buildWritingPaperView({ asset: asset960d0f8d, groupId: 'group-960d0f8d-writing-application' })
const appPassageText960 = appPaperView960.surfaceData.textMap.paragraphs
  .flatMap((p) => p.sentences.map((s) => s.text))
  .join(' ')
assert(
  '960d0f8d application: "Dear Chris" / "Yours," no longer appear in the passage textMap (scaffold routed into the answer box instead of duplicating in the passage)',
  !/Dear Chris/.test(appPassageText960) && !/\bYours,/.test(appPassageText960),
  appPassageText960,
)

// 2026-i: no Dear paragraph at all — this is an opinion-column submission,
// NOT a letter (corrects the "2026-i also has a Dear Kate scaffold" premise
// floated at cut kickoff). Current (empty-box) behavior must be preserved.
const appGroup2026i = asset.content.groups['group-2026-i-writing-application']
const appTask2026i = asset.content.writingTasks[appGroup2026i.writingTaskId]
assert(
  '2026-i fixture sanity: application task has NO "Dear" paragraph (it is an opinion-column submission, not a letter)',
  !(appGroup2026i.passage?.paragraphs ?? []).some((p) => /^Dear\b/.test(p.text.trim())),
  JSON.stringify((appGroup2026i.passage?.paragraphs ?? []).map((p) => p.text)),
)
assert(
  '2026-i application scaffold extraction returns null (no Dear paragraph to extract)',
  extractApplicationScaffold(appGroup2026i.passage?.paragraphs ?? []) === null,
)
const appPageModel2026i = buildWritingPageModel(asset, appGroup2026i, appTask2026i)
const appBox2026i = appPageModel2026i.blocks.find((b) => b.kind === 'answerBox')
assert(
  '2026-i application answerBox: givenBottom stays empty (current behavior preserved — no scaffold to route)',
  Boolean(appBox2026i) && appBox2026i.givenBottom.length === 0,
  JSON.stringify(appBox2026i),
)

if (failed > 0) {
  console.error(`\npaper-browse verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\npaper-browse verify passed: ${passed} passed, 0 failed`)
