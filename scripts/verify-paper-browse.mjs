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
 *     `[card]`, i.e. no whole-paper aggregate add). [updated by similar-rail
 *     (E2), see item 53+: a second, plan-authorized call site was added for
 *     the 配相似 result list's multi-select "加入草稿卷" — still not a
 *     whole-paper aggregate add, see that item's assertion comment.]
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
 * 22-25. flow-panel 刀 1（整卷页一页两姿态 — 布局重排 + 讲评栏骨架）:
 *     22. PaperBrowsePage declares a `lectureOpen` boolean state defaulting
 *         to `false` (讲评栏默认收起) and a 讲评 handle button that toggles
 *         it — the handle renders unconditionally (always visible), the
 *         panel + backdrop render only when `lectureOpen`.
 *     23. `buildAnswerRowText` (moved from the撤刀 flow-hover Chunk B,
 *         7c13124) is present with its three key branches: writing groups
 *         return `null` (no answer row at all), no-answerKey-hit groups
 *         fall back to "答案未入库", and matched entries are sorted by
 *         questionNo before joining.
 *     24. [RETIRED by flow-panel 刀 2 — see 26-33 below] The 讲评栏
 *         deep-link ("深读解析" → old解析页) that used to gate on
 *         `card.hasPaperSurfaceAnalysis && card.paperSurfaceHref` is gone;
 *         the 讲评栏 body now renders the full解析面板 in place instead of
 *         linking out. The assertion for this item was removed, not left
 *         red — the behavior it proved no longer exists by design.
 *     25. paperBrowsePage.css: `.paper-browse-shell` no longer centers
 *         itself with `max-width` + `margin: 0 auto` (rail glued to the
 *         viewport edge instead of a centered shell), and a `min-width:
 *         1200px` breakpoint switches the 讲评栏 from a docked third grid
 *         column to a `position: fixed` drawer with a backdrop.
 * 18-21. seven-options-on-paper (owner 2026-07-08 拍板): 七选五卷面在正文
 *        之后渲染 A-G 选项池，纯展示、不参与交互（see
 *        docs/cuts/seven-options-on-paper/plan.md）:
 *     18. `PaperSurfaceProps.optionBank` exists in shared/papersurface/
 *         types.d.ts, and PaperSurface.tsx reads it + renders it ONLY
 *         when non-empty (C1/C2) — source-level checks, plus the new
 *         `PaperSurfaceOptionBank` renderer carries no anchor attribute
 *         and no click handler (C3).
 *     19. Both real PaperSurface mount points (PaperBrowsePage.tsx /
 *         PaperIntelligencePaperSurfaceHarness.tsx) wire `optionBank=`
 *         from the sevenChoices model's existing `.options` field — no
 *         adapter change — and every other groupType/source passes
 *         `undefined` (C4/C5).
 *     20. Real paper-2026-i fixture: `buildSevenChoicesSurfaceModel`'s
 *         `.options` has all 7 A-G entries with non-empty label/text —
 *         proves the non-empty render branch has real data to trigger on.
 *     21. QuestionGroupDetailView.tsx does not import PaperSurface (C6 —
 *         confirms the detail page is genuinely out of this cut's scope,
 *         not just "happens to look unaffected").
 * 26-33. flow-panel 刀 2（点题联动 + 五解析面板搬家统一宽度）:
 *     26. PaperBrowsePage imports the five paper-intelligence解析面板
 *         (SevenChoicesAnalysisPanel / PaperAssetAnalysisPanel /
 *         ClozeAnalysisPanel / GrammarFillAnalysisPanel /
 *         WritingAnalysisPanel), the two analysis adapters
 *         (buildClozeAnalysisSurfaceModel / buildGrammarFillAnalysisSurfaceModel),
 *         and `paperIntelligence.css` (随面板 import 生效, unmodified).
 *     27. `onFocusIntent`/`lectureFocus` on each group's PaperSurface mount
 *         are conditioned on `lectureOpen`: 挑题态 keeps the 刀 1 shape
 *         exactly (`onFocusIntent={... : () => {}}`, `lectureFocus={... :
 *         null}` — the no-op/null branch of the ternary), so PaperSurface
 *         stays read-only/silent whenever the handle is collapsed.
 *     28. The cloze/grammar-fill/writing lecture-analysis fetch effect is
 *         gated on `lectureOpen` (`if (!lectureOpen) return`) — 挑题态 全程
 *         零新增请求 is a source-level invariant, not just a runtime one.
 *     29. `selectLectureQuestion` seeds `evidenceId`/`optionLabel` from the
 *         active group's analysis model (cloze → first non-option-side
 *         evidence row, grammarFill → first evidence row, reading →
 *         supportEvidenceId + answer) — mirrors
 *         `PaperIntelligencePaperSurfaceHarness`'s `request-lecture-focus`
 *         branch.
 *     30. A missing/failed cloze/grammarFill/writing analysis renders
 *         "解析未发布" in the 讲评栏 instead of crashing (graceful
 *         degradation string present in source).
 *     31. The retired 深读解析 deep-link is gone: no `paperSurfaceHref` or
 *         「深读解析」 string remains in PaperBrowsePage.tsx.
 *     32. `paperBrowsePage.css` scopes the五面板 width-normalization to a
 *         `.paper-browse-lecture-analysis` container selector — `pi-*`
 *         rules in `paperIntelligence.css` are not edited by this cut.
 *     33. Real paper-2026-i fixture: `buildClozeAnalysisSurfaceModel` /
 *         `buildGrammarFillAnalysisSurfaceModel` each resolve against the
 *         fixture's cloze/grammar-fill analysis files without throwing —
 *         proves the 按需补拉 adapter calls have real data to run against.
 * 34-38. flow-panel 刀 2 修复轮 (dao2-fix, owner 2026-07-09 实测拍板的两个
 *        卷面显影 parity 缺口):
 *     34. 七选五原文高亮: PaperBrowsePage imports (only-import contract)
 *         `useSevenChoicesPaperHighlights`, wires it with `enabled:
 *         lectureOpen && panelGroupModel?.kind === 'sevenChoices'` and
 *         `leftScrollerRef: scrollerRef` (the whole-paper 卷面容器, per
 *         plan — not a per-group local container).
 *     35. The overlay's render condition mirrors the hook's `enabled` gate
 *         exactly (`panelGroupModel?.kind === 'sevenChoices'`, not just
 *         `marks.length > 0`) — the hook does not clear `marks` on
 *         disable, so a looser render guard would flash a previous 题组's
 *         stale marks when 讲评栏 switches away from 七选五.
 *     36. paperBrowsePage.css never imports the Forbidden
 *         `paperIntelligencePaperSurfaceHarness.css` (where the source
 *         `.pi-seven-blank-overlay`/`.pi-seven-clue-mark*` rules live);
 *         the highlight colors are a hand-copied local rule set under
 *         `.paper-browse-seven-*` class names instead, anchored by
 *         `position: relative` on `.paper-browse-content`.
 *     37. 阅读动线: an effect scrolls the active `[data-paper-evidence-id]`
 *         anchor into view (mirrors
 *         `PaperIntelligencePaperSurfaceHarness.tsx`'s "Auto-scroll active
 *         evidence" effect), gated to `groupModels[...]?.kind ===
 *         'reading'` only — 完形/语法填空 stay "原位型" (证据高亮, no
 *         scroll) and 七选五 stays "混血" (衔接句高亮 via item 34, no
 *         阅读式动线), per the plan's 卷面显影原则.
 *     38. Real paper-2026-i fixture: the sevenChoices model has at least
 *         one chain with non-empty `leftHighlights` — proves the
 *         highlight hook has real geometry data to render against, not
 *         just an always-empty no-op.
 * 39-43. flow-panel 刀 2 修复轮 ③ (阅读跨栏证据动线 — the third dao2-fix
 *        layer, owner 2026-07-09 实测拍板):
 *     39. PaperBrowsePage imports `PaperIntelligenceEvidenceLine` from
 *         `paper-intelligence/preview/paperIntelligenceEvidenceLine`
 *         (import-only contract — the component + its geometry helper
 *         module are never edited by this cut).
 *     40. The component mounts only when 讲评开 AND the current讲评栏
 *         target题组 is a reading group (`lectureOpen && panelGroupModel
 *         ?.kind === 'reading'`) — 卷面显影原则: 完形/语法填空(原位型)只给
 *         证据高亮, 七选五(混血)只给衔接句高亮 (item 34), 写作无证据概念;
 *         none of them mount the cross-column line.
 *     41. Wiring: `containerRef={shellRef}` / `leftScrollerRef={scrollerRef}`
 *         / `rightPanelRef={rightPanelRef}` / `leftSelectorPreset="paper-
 *         surface"` — the shellRef is attached to `.paper-browse-shell`
 *         (already `position: relative`) and rightPanelRef to the 讲评栏
 *         `<aside>`, mirroring the harness's shellRef/leftScrollerRef/
 *         rightPanelRef triple exactly.
 *     42. paperBrowsePage.css hand-copies ONLY the support/trap stroke
 *         palette (grep-confirmed to exist solely in the Forbidden
 *         `paperIntelligencePaperSurfaceHarness.css:684-691`, renamed from
 *         `.pi-ps-harness-shell` to `.paper-browse-shell`) — the base
 *         `.pi-line-overlay`/`.pi-line-path` rules are NOT duplicated
 *         because they already exist unscoped in the already-imported
 *         `paperIntelligence.css`. Neither `PaperBrowsePage.tsx` nor
 *         `paperBrowsePage.css` references the Forbidden harness
 *         stylesheet. A `max-width: 1199.98px` rule hides the line
 *         (owner-authorized narrowing: the 讲评栏 drawer at that breakpoint
 *         detaches from the grid and floats over the卷面, so cross-column
 *         geometry stops making visual sense).
 *     43. Real paper-2026-i fixture: the reading group's
 *         `evidenceKindById` has both 'support' and 'trap' entries —
 *         proves the activeEvidenceKind derivation (which drives the
 *         palette split in item 42) has real data on both branches to
 *         exercise, not just an always-'support' no-op.
 * 44-52. one-sheet-paper (毛边⑤ — 整卷页「一张连续卷」，
 *        docs/cuts/one-sheet-paper/plan.md):
 *     44. PaperBrowsePage computes a `scissorPlan` (useMemo) purely from
 *         per-section group counts (multi-group section → each group gets
 *         its own line; single-group section → its leading 指导语 merges
 *         into the group card) — no hardcoded groupType list.
 *     45. Writing groups are excluded from the DOM scissor-line/merge
 *         machinery (they get a CSS-only sibling-selector line instead,
 *         since their section heading/instruction are already claimed by
 *         the Forbidden `findWritingBlockRange`/WritingPaperPage chrome).
 *     46. `renderGroupCard` renders the `.paper-browse-scissor-line` div
 *         sibling + folds a merged 指导语 in as the card's own first child.
 *     47-48. `.paper-browse-content` is the single sheet (one background/
 *         box-shadow/page-margin padding via the shared --ps-* tokens);
 *         nested PaperSurface/WritingPaperPage chrome (`.ps-surface`/
 *         `.ps-page`/`.pi-writing-page`) is retired (scoped overrides,
 *         source files untouched).
 *     49-50. The dashed scissor-line rule exists; the writing-section line
 *         is CSS-only (sibling selector + `::before` on the Forbidden
 *         `.pi-writing-section` element, no edit to that file).
 *     51-52. Real paper-2026-i fixture: re-running the scissorPlan
 *         algorithm against the real blocks array confirms all four
 *         reading groups get a standalone line each (①-④, before each
 *         article's letter) and the three single-group non-writing
 *         sections (七选五/完形/语法填空) merge their 指导语 into the group
 *         card instead (⑤-⑦; ⑧-⑨ are the two writing sections, covered by
 *         the CSS-only path in items 49-50).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findWritingBlockRange } from '../app/src/features/paper-intelligence/writingPageModel.mjs'
import { buildPaperAssetSurfaceModel } from '../app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts'

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
const reducedMotionScrollSrc = read('app/src/features/shared/reducedMotionScroll.ts')
const conciergeGroupCardSrc = read('app/src/concierge/ConciergeGroupCard.tsx')
const verifyCiSrc = read('scripts/verify-ci.mjs')
const readmeSrc = read('scripts/README.md')
const railViewSrc = read('app/src/features/paper-browse/SimilarQuestionsRailView.tsx')
const similarServiceSrc = read('app/src/services/similarQuestions.ts')
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
// flow-panel 刀 2: PaperSurface is now interactive in 讲评态 (lectureOpen),
// but 挑题态 must keep the exact 刀 1 read-only shape — the false branch of
// each ternary is still a static no-op/null, not a real handler/focus.
assert(
  'PaperSurface lectureFocus falls back to a static null when the group is not the 讲评栏 target',
  /lectureFocus=\{isPanelGroup\s*\?\s*lectureFocusForSelection\s*:\s*null\}/.test(pageSrc),
  'lectureFocus does not have a static-null fallback branch — 挑题态/non-target groups may leak focus',
)
assert(
  'PaperSurface onFocusIntent falls back to a static no-op when lectureOpen is false',
  /onFocusIntent=\{lectureOpen\s*\?\s*\(intent\)\s*=>\s*handleGroupFocusIntent\(groupId,\s*intent\)\s*:\s*\(\)\s*=>\s*\{\}\}/.test(
    pageSrc,
  ),
  'onFocusIntent does not have a static no-op fallback branch — 挑题态 may be wiring interaction',
)
assert(
  'PaperBrowsePage has no "移出" (remove-from-basket) affordance',
  !pageSrc.includes('移出'),
  '移出 affordance found — out of scope per plan',
)
assert(
  // similar-rail (E2) adds a second, plan-authorized call site (plan point
  // 5: reuse App.addGroupsToBasket for the multi-select "加入草稿卷" in the
  // 配相似 result list). Still no whole-paper aggregate add: the per-card
  // site stays [card] (single group) and the new site is a user-picked
  // subset (`cards`, built from a Set of checkbox selections), never "every
  // group on the page".
  'PaperBrowsePage calls onAddGroupsToBasket at exactly two call sites (per-card [card] + similar-rail user-picked subset), no whole-paper aggregate add',
  (pageSrc.match(/onAddGroupsToBasket\(/g) || []).length === 2 &&
    /onAddGroupsToBasket\(\[card\]\)/.test(pageSrc) &&
    /onAddGroupsToBasket\(cards\)/.test(pageSrc),
  'expected exactly two onAddGroupsToBasket call sites: [card] (per-card) and (cards) (similar-rail multi-select)',
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

// ─── 18-21. seven-options-on-paper: 七选五 A-G option pool on screen ───

const harnessSrc = read('app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx')
const paperSurfaceTypesSrc = read('shared/papersurface/types.d.ts')
const detailViewSrcForOptionBank = detailViewSrc

assert(
  'shared/papersurface/types.d.ts: PaperSurfaceProps declares optionBank',
  /readonly optionBank\?:\s*ReadonlyArray<PaperQuestionOption>/.test(paperSurfaceTypesSrc),
  'missing optionBank field on PaperSurfaceProps',
)
assert(
  'PaperSurface.tsx destructures optionBank from props',
  /const\s*\{[\s\S]{0,400}\boptionBank\b[\s\S]{0,400}\}\s*=\s*props/.test(paperSurfaceSrc),
  'optionBank is not destructured from props',
)
assert(
  'PaperSurface.tsx renders the option bank only when non-empty (C1/C2)',
  /\{optionBank\s*&&\s*optionBank\.length\s*>\s*0\s*&&\s*\(/.test(paperSurfaceSrc) &&
    /<PaperSurfaceOptionBank\s+options=\{optionBank\}\s*\/>/.test(paperSurfaceSrc),
  'missing the optionBank && optionBank.length > 0 render guard',
)

const optionBankFnBody =
  paperSurfaceSrc.match(/function PaperSurfaceOptionBank\([\s\S]*?\n\}/)?.[0] || ''
assert('PaperSurfaceOptionBank function body extracted', optionBankFnBody.length > 0)
assert(
  'PaperSurfaceOptionBank carries no data-paper-*/data-pi-* anchor attribute (C3)',
  !optionBankFnBody.includes('paperSurfaceAnchorAttrs') && !/data-p[ai]-/.test(optionBankFnBody),
  optionBankFnBody,
)
assert(
  'PaperSurfaceOptionBank has no onClick / focus wiring (C3)',
  !/onClick|onFocusIntent/.test(optionBankFnBody),
  optionBankFnBody,
)
assert(
  'PaperSurface.css declares .ps-option-bank / .ps-option-bank-item',
  paperSurfaceCssSrc.includes('.ps-option-bank') && paperSurfaceCssSrc.includes('.ps-option-bank-item'),
  'missing .ps-option-bank rules',
)

assert(
  "PaperBrowsePage.tsx wires optionBank from entry.model.options for sevenChoices, undefined otherwise (C4/C5)",
  /optionBank=\{entry\.kind === 'sevenChoices' \? entry\.model\.options : undefined\}/.test(pageSrc),
  'missing optionBank wiring in PaperBrowsePage.tsx',
)
assert(
  "PaperIntelligencePaperSurfaceHarness.tsx wires optionBank from sevenChoicesModel?.options (C4/C5)",
  /optionBank=\{sevenChoicesModel\?\.options\}/.test(harnessSrc),
  'missing optionBank wiring in PaperIntelligencePaperSurfaceHarness.tsx',
)

assert(
  'QuestionGroupDetailView.tsx does not import PaperSurface (C6 — detail page stays out of scope)',
  !/from\s*['"][^'"]*shared-ui\/papersurface\/PaperSurface['"]/.test(detailViewSrcForOptionBank),
  'QuestionGroupDetailView.tsx unexpectedly imports PaperSurface',
)

const { buildSevenChoicesSurfaceModel } = await import(
  '../app/src/features/paper-intelligence/sevenChoicesSurfaceAdapter.ts'
)
const sevenChoicesAnalysis2026i = JSON.parse(
  read('app/public/paper-assets/paper-2026-i/latest/analyses/seven-choices-analysis-v1.json'),
)
const sevenChoicesModel2026i = buildSevenChoicesSurfaceModel({
  asset,
  analysis: sevenChoicesAnalysis2026i,
  groupId: 'group-2026-i-seven-choices',
})
assert(
  'paper-2026-i sevenChoices model: .options has all 7 A-G entries with non-empty label/text',
  sevenChoicesModel2026i.options.length === 7 &&
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].every((label, i) =>
      sevenChoicesModel2026i.options[i]?.label === label && Boolean(sevenChoicesModel2026i.options[i]?.text),
    ),
  JSON.stringify(sevenChoicesModel2026i.options.map((o) => o.label)),
)

// ─── 22-25. flow-panel 刀 1: 一页两姿态布局 + 讲评栏骨架 ───

const pageCssSrc = read('app/src/features/paper-browse/paperBrowsePage.css')

assert(
  // flow-panel 刀 3 narrows this from a literal `useState(false)`: the
  // initial value now seeds from the `lecture` prop (入口带态 lecture=1
  // opens 讲评态 on load) via a lazy initializer, defaulting to false when
  // the prop is absent/falsy — same net default, new source.
  'PaperBrowsePage seeds lectureOpen from the lecture prop (defaults to false when absent)',
  /const\s*\[\s*lectureOpen\s*,\s*setLectureOpen\s*\]\s*=\s*useState\s*\(\s*\(\)\s*=>\s*Boolean\(lecture\)\s*\)/.test(
    pageSrc,
  ),
  'missing lectureOpen useState(() => Boolean(lecture))',
)
assert(
  'PaperBrowsePage renders a 讲评 handle button unconditionally (always visible)',
  /<button[\s\S]{0,200}paper-browse-lecture-handle[\s\S]{0,200}讲评/.test(pageSrc) &&
    !/\{lectureOpen\s*&&\s*\(?\s*<button[\s\S]{0,120}paper-browse-lecture-handle/.test(pageSrc),
  'handle button missing, or gated behind lectureOpen (should always render)',
)
assert(
  'PaperBrowsePage toggles lectureOpen via setLectureOpen((open) => !open) on the handle click',
  /setLectureOpen\s*\(\s*\(\s*open\s*\)\s*=>\s*!open\s*\)/.test(pageSrc),
  'missing the toggle handler',
)
assert(
  'PaperBrowsePage gates the lecture panel + backdrop behind lectureOpen (not rendered when collapsed)',
  /\{lectureOpen\s*&&[\s\S]{0,80}paper-browse-lecture-panel/.test(pageSrc) &&
    /\{lectureOpen\s*&&[\s\S]{0,80}paper-browse-lecture-backdrop/.test(pageSrc),
  'panel or backdrop not gated on lectureOpen',
)

const buildAnswerRowFnBody =
  pageSrc.match(/function buildAnswerRowText\([\s\S]*?\n\}/)?.[0] || ''
assert('buildAnswerRowText function body extracted from PaperBrowsePage.tsx', buildAnswerRowFnBody.length > 0)
assert(
  'buildAnswerRowText: writing groups return null (no answer row at all)',
  /groupType\s*===\s*['"]writing['"]\s*\)\s*return null/.test(buildAnswerRowFnBody),
  buildAnswerRowFnBody,
)
assert(
  'buildAnswerRowText: no-hit groups fall back to "答案未入库"',
  /entries\.length\s*===\s*0\s*\)\s*return\s*['"]答案未入库['"]/.test(buildAnswerRowFnBody),
  buildAnswerRowFnBody,
)
assert(
  'buildAnswerRowText: matched entries sorted by questionNo before joining',
  /\.sort\(\s*\(a,\s*b\)\s*=>\s*a\.questionNo\s*-\s*b\.questionNo\s*\)/.test(buildAnswerRowFnBody) &&
    /\.join\(/.test(buildAnswerRowFnBody),
  buildAnswerRowFnBody,
)

// ─── 26-32. flow-panel 刀 2: 点题联动 + 五解析面板搬家 ───

assert(
  'PaperBrowsePage imports the five paper-intelligence解析面板',
  [
    /import\s*\{\s*SevenChoicesAnalysisPanel\s*\}\s*from\s*['"]\.\.\/paper-intelligence\/SevenChoicesAnalysisPanel['"]/,
    /import\s*\{\s*PaperAssetAnalysisPanel\s*\}\s*from\s*['"]\.\.\/paper-intelligence\/PaperAssetAnalysisPanel['"]/,
    /import\s*\{\s*ClozeAnalysisPanel\s*\}\s*from\s*['"]\.\.\/paper-intelligence\/ClozeAnalysisPanel['"]/,
    /import\s*\{\s*GrammarFillAnalysisPanel\s*\}\s*from\s*['"]\.\.\/paper-intelligence\/GrammarFillAnalysisPanel['"]/,
    /import\s*\{\s*WritingAnalysisPanel\s*\}\s*from\s*['"]\.\.\/paper-intelligence\/WritingAnalysisPanel['"]/,
  ].every((re) => re.test(pageSrc)),
  'missing one or more of the five analysis panel imports',
)
assert(
  'PaperBrowsePage imports the cloze/grammar-fill analysis adapters + paperIntelligence.css',
  /buildClozeAnalysisSurfaceModel/.test(pageSrc) &&
    /buildGrammarFillAnalysisSurfaceModel/.test(pageSrc) &&
    /import\s*['"]\.\.\/paper-intelligence\/paperIntelligence\.css['"]/.test(pageSrc),
  'missing analysis adapter imports or the paperIntelligence.css import',
)
assert(
  'lecture-analysis fetch effect is gated on lectureOpen (zero new requests in 挑题态)',
  /if\s*\(!lectureOpen\)\s*return/.test(pageSrc),
  'missing the lectureOpen early-return guard on the lazy analysis fetch effect',
)
assert(
  'selectLectureQuestion seeds cloze/grammarFill/reading evidence, mirroring the harness request-lecture-focus branch',
  /lectureEntry\?\.kind\s*===\s*['"]cloze['"]/.test(pageSrc) &&
    /lectureEntry\?\.kind\s*===\s*['"]grammarFill['"]/.test(pageSrc) &&
    /plainEntry\?\.kind\s*===\s*['"]reading['"]/.test(pageSrc) &&
    /supportEvidenceId/.test(pageSrc),
  'missing one or more of the seed branches in selectLectureQuestion',
)
assert(
  '讲评栏 shows "解析未发布" when a cloze/grammarFill/writing analysis is missing/unavailable',
  (pageSrc.match(/解析未发布/g) || []).length >= 3,
  'expected the "解析未发布" fallback string on all three lazily-fetched group types',
)
assert(
  '深读解析 deep-link is fully retired — no paperSurfaceHref/深读解析 reference remains',
  !/paperSurfaceHref/.test(pageSrc) && !/深读解析/.test(pageSrc),
  'a retired deep-link reference is still present',
)
assert(
  'paperBrowsePage.css normalizes 五面板 width via a .paper-browse-lecture-analysis container selector',
  /\.paper-browse-lecture-analysis\b/.test(pageCssSrc),
  'missing the .paper-browse-lecture-analysis container selector',
)

// Behavioral: the cloze/grammar-fill analysis adapters this cut newly
// wires into the lecture panel actually resolve against the real
// paper-2026-i analysis fixtures (proves the 按需补拉 call has real data
// to run against, not just a source-shape match).
const cloze2026iAsset = JSON.parse(
  read('app/public/paper-assets/paper-2026-i/latest/paper-asset.json'),
)
const cloze2026iAnalysis = JSON.parse(
  read('app/public/paper-assets/paper-2026-i/latest/analyses/cloze-analysis-v1.json'),
)
const grammarFill2026iAnalysis = JSON.parse(
  read('app/public/paper-assets/paper-2026-i/latest/analyses/grammar-fill-analysis-v1.json'),
)
try {
  const { buildClozeAnalysisSurfaceModel } = await import(
    path.join(rootDir, 'app', 'src', 'features', 'paper-intelligence', 'clozeAnalysisSurfaceAdapter.ts')
  )
  const clozeModel = buildClozeAnalysisSurfaceModel({
    asset: cloze2026iAsset,
    analysis: cloze2026iAnalysis,
    groupId: 'group-2026-i-cloze',
  })
  assert(
    'buildClozeAnalysisSurfaceModel resolves against the real paper-2026-i cloze-analysis-v1 fixture',
    Object.keys(clozeModel.analysisByQuestionId).length > 0,
    'analysisByQuestionId is empty',
  )
} catch (e) {
  assert('buildClozeAnalysisSurfaceModel resolves against the real paper-2026-i fixture', false, String(e))
}
try {
  const { buildGrammarFillAnalysisSurfaceModel } = await import(
    path.join(
      rootDir,
      'app',
      'src',
      'features',
      'paper-intelligence',
      'grammarFillAnalysisSurfaceAdapter.ts',
    )
  )
  const grammarFillModel = buildGrammarFillAnalysisSurfaceModel({
    asset: cloze2026iAsset,
    analysis: grammarFill2026iAnalysis,
    groupId: 'group-2026-i-grammar-fill',
  })
  assert(
    'buildGrammarFillAnalysisSurfaceModel resolves against the real paper-2026-i grammar-fill-analysis-v1 fixture',
    Object.keys(grammarFillModel.analysisByQuestionId).length > 0,
    'analysisByQuestionId is empty',
  )
} catch (e) {
  assert(
    'buildGrammarFillAnalysisSurfaceModel resolves against the real paper-2026-i fixture',
    false,
    String(e),
  )
}

// Fixture-shape checks against the real paper-2026-i asset. NOTE (CR
// 刀1): this does NOT execute buildAnswerRowText/buildGroupRangeLabel
// (they are not exported) — it only proves the fixture data the source
// branches consume is present and well-formed. Output-level evidence
// comes from browser QA; an execution-level regression test would need
// the helpers exported first.
const readingGroup2026i = asset.content.groups['group-2026-i-reading-a']
assert(
  '2026-i fixture sanity: a reading group with answerKey entries exists',
  Boolean(readingGroup2026i) &&
    readingGroup2026i.questionIds.some((qid) => asset.answerKey.answers[qid]),
  'fixture missing group-2026-i-reading-a or its answerKey coverage',
)
const writingGroup2026i = Object.values(asset.content.groups).find((g) => g.groupType === 'writing')
assert(
  '2026-i fixture: a writing group exists to prove the no-answer-row branch',
  Boolean(writingGroup2026i),
)

// ─── 34-38. flow-panel 刀 2 修复轮 (dao2-fix): 七选五原文高亮接线 +
//     阅读动线 parity — owner 2026-07-09 实测抓到的两个卷面显影缺口 ───

assert(
  'PaperBrowsePage imports useSevenChoicesPaperHighlights (only-import contract — the hook file itself is untouched)',
  /import\s*\{\s*useSevenChoicesPaperHighlights\s*\}\s*from\s*['"]\.\.\/paper-intelligence\/useSevenChoicesPaperHighlights\.ts['"]/.test(
    pageSrc,
  ),
  'missing the useSevenChoicesPaperHighlights import',
)
assert(
  'useSevenChoicesPaperHighlights is enabled only when 讲评栏当前面板组是七选五, scoped to the whole-paper scroller',
  /enabled:\s*lectureOpen\s*&&\s*panelGroupModel\?\.kind\s*===\s*['"]sevenChoices['"]/.test(pageSrc) &&
    /leftScrollerRef:\s*scrollerRef/.test(pageSrc),
  'missing the lectureOpen+sevenChoices enabled gate or the scrollerRef wiring',
)
assert(
  '七选五高亮覆盖层的渲染门控与 hook 的 enabled 同款 (panelGroupModel?.kind, not just marks.length) — avoids a stale-marks ghost overlay after switching to another 题组',
  /lectureOpen\s*&&\s*panelGroupModel\?\.kind\s*===\s*['"]sevenChoices['"]\s*&&\s*sevenChoiceOverlay\.marks\.length\s*>\s*0/.test(
    pageSrc,
  ),
  'overlay render condition does not match the enabled gate — risk of ghost marks from a previous group',
)
assert(
  'paperBrowsePage.css never imports the Forbidden paperIntelligencePaperSurfaceHarness.css (colors come from the shared paperSurfaceLectureHighlights.css instead — flow-panel 刀 3)',
  !/paperIntelligencePaperSurfaceHarness\.css/.test(pageSrc),
  'PaperBrowsePage.tsx imports the harness-only stylesheet — Forbidden scope violation',
)
// flow-panel 刀 3: the .paper-browse-seven-blank-overlay / .paper-browse-
// seven-clue-mark rules moved out of paperBrowsePage.css into the shared
// paperSurfaceLectureHighlights.css (single source with the harness's
// equivalent .pi-seven-* marks) — check the shared file directly, plus
// that paperBrowsePage.css actually @imports it. .paper-browse-content's
// own position:relative anchor stays page-local (not part of the shared
// file) and is still checked against pageCssSrc.
const lectureHighlightsCssSrc = read(
  'app/src/features/paper-intelligence/paperSurfaceLectureHighlights.css',
)
const harnessCssSrc = read(
  'app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css',
)
assert(
  'paperBrowsePage.css @imports the shared paperSurfaceLectureHighlights.css',
  /@import\s*["']\.\.\/paper-intelligence\/paperSurfaceLectureHighlights\.css["']/.test(pageCssSrc),
  'missing the @import of the shared highlights stylesheet',
)
assert(
  'shared paperSurfaceLectureHighlights.css defines the .pi-seven-blank-overlay / .paper-browse-seven-blank-overlay + .pi-seven-clue-mark / .paper-browse-seven-clue-mark rules (grouped selectors, single source for both consumers)',
  /\.pi-seven-blank-overlay,[\s\S]{0,40}\.paper-browse-seven-blank-overlay\s*\{[^}]*position:\s*absolute/.test(
    lectureHighlightsCssSrc,
  ) &&
    /\.pi-seven-clue-mark,[\s\S]{0,40}\.paper-browse-seven-clue-mark\s*\{[^}]*position:\s*absolute/.test(
      lectureHighlightsCssSrc,
    ),
  'missing the grouped overlay/mark rules in the shared stylesheet',
)
assert(
  'paperBrowsePage.css no longer hand-copies .paper-browse-seven-blank-overlay / .paper-browse-seven-clue-mark itself (moved to the shared file, not duplicated)',
  !/\.paper-browse-seven-blank-overlay\s*\{/.test(pageCssSrc) &&
    !/\.paper-browse-seven-clue-mark\s*\{/.test(pageCssSrc),
  'paperBrowsePage.css still declares these rules locally — not a single source',
)
assert(
  '.paper-browse-content establishes position: relative for the shared overlay to anchor against (page-local, stays in paperBrowsePage.css)',
  /\.paper-browse-content\s*\{[^}]*position:\s*relative/.test(pageCssSrc),
  'missing the position: relative anchor on .paper-browse-content',
)
assert(
  'paper-2026-i sevenChoices model: at least one chain has non-empty leftHighlights ranges (proves the highlight hook has real geometry data to consume, not just an empty-marks no-op)',
  sevenChoicesModel2026i.chains.length > 0 &&
    sevenChoicesModel2026i.chains.some((chain) => chain.leftHighlights.length > 0),
  'no chain has leftHighlights — useSevenChoicesPaperHighlights would always render zero marks for this fixture',
)
assert(
  '阅读动线: an effect scrolls the active [data-paper-evidence-id] anchor into view, gated to reading groups only (完形/语法填空/七选五 stay 原位/混血 per 卷面显影原则, no scroll)',
  /data-paper-evidence-id/.test(pageSrc) &&
    /groupModels\[lectureSelection\.groupId\]\?\.kind\s*!==\s*['"]reading['"]\)\s*return/.test(pageSrc),
  'missing the evidence-scroll effect, or it is not gated to reading-only groups',
)
// motion-press-exit: the inline matchMedia/reduced ternary that used to
// live directly in this effect was pulled into a shared helper
// (`features/shared/reducedMotionScroll.ts`, reused by 4 call sites incl.
// this one) — check the reduced-motion branch lives in the helper AND this
// page's effect actually calls it, instead of requiring the pattern inline.
assert(
  '阅读动线 effect honors prefers-reduced-motion (smooth by default, auto when reduced)',
  /matchMedia\(['"]\(prefers-reduced-motion:\s*reduce\)['"]\)\.matches/.test(reducedMotionScrollSrc) &&
    /reduced\s*\?\s*['"]auto['"]\s*:\s*['"]smooth['"]/.test(reducedMotionScrollSrc) &&
    /scrollIntoView\(\{[^}]*behavior:\s*scrollBehavior\(\)/.test(pageSrc),
  'missing the reduced-motion branch on the evidence-scroll effect',
)

assert(
  'paperBrowsePage.css: .paper-browse-shell is not centered via max-width + margin auto (rail glued to viewport edge)',
  /\.paper-browse-shell\s*\{[^}]*\}/.exec(pageCssSrc) &&
    !/\.paper-browse-shell\s*\{[^}]*max-width[^}]*\}/.test(pageCssSrc),
  'shell rule still constrains max-width — rail would stay centered, not edge-glued',
)
assert(
  'paperBrowsePage.css: a min-width: 1200px breakpoint docks the lecture panel as a sticky grid column',
  /@media \(min-width: 1200px\)\s*\{\s*\.paper-browse-lecture-panel\s*\{[^}]*position:\s*sticky/.test(
    pageCssSrc,
  ),
  'missing the docked (sticky) desktop lecture panel rule',
)
assert(
  'paperBrowsePage.css: a max-width: 1199.98px breakpoint turns the lecture panel into a fixed drawer with a backdrop',
  /@media \(max-width: 1199\.98px\)\s*\{\s*\.paper-browse-lecture-panel\s*\{[^}]*position:\s*fixed/.test(
    pageCssSrc,
  ) && pageCssSrc.includes('.paper-browse-lecture-backdrop'),
  'missing the narrow-viewport fixed-drawer + backdrop rule',
)

// ─── 39-43. flow-panel 刀 2 修复轮 ③: 阅读跨栏证据动线 ───

assert(
  'PaperBrowsePage imports PaperIntelligenceEvidenceLine (only-import contract — component + geometry untouched)',
  /import\s*\{\s*PaperIntelligenceEvidenceLine\s*\}\s*from\s*['"]\.\.\/paper-intelligence\/preview\/paperIntelligenceEvidenceLine['"]/.test(
    pageSrc,
  ),
  'missing the PaperIntelligenceEvidenceLine import',
)
assert(
  'PaperIntelligenceEvidenceLine mounts only when 讲评开 AND the panel目标题组是阅读题组 (卷面显影原则: 完形/语法填空/七选五/写作 do not get the motion line)',
  /\{lectureOpen\s*&&\s*panelGroupModel\?\.kind\s*===\s*['"]reading['"]\s*&&\s*\(\s*\n\s*<PaperIntelligenceEvidenceLine/.test(
    pageSrc,
  ),
  'evidence line render condition is missing or not gated to lectureOpen+reading',
)
assert(
  'PaperIntelligenceEvidenceLine wired with shellRef/scrollerRef/rightPanelRef + leftSelectorPreset="paper-surface"',
  /containerRef=\{shellRef\}/.test(pageSrc) &&
    /leftScrollerRef=\{scrollerRef\}/.test(pageSrc) &&
    /rightPanelRef=\{rightPanelRef\}/.test(pageSrc) &&
    /leftSelectorPreset="paper-surface"/.test(pageSrc),
  'missing one or more of the containerRef/leftScrollerRef/rightPanelRef/leftSelectorPreset props',
)
assert(
  '.paper-browse-shell carries ref={shellRef} and the 讲评栏 <aside> carries ref={rightPanelRef}',
  /className=\{`paper-browse-shell[\s\S]{0,120}`\}\s*\n\s*ref=\{shellRef\}/.test(pageSrc) &&
    /<aside className="paper-browse-lecture-panel" aria-label="讲评" ref=\{rightPanelRef\}>/.test(pageSrc),
  'shellRef or rightPanelRef is not attached to the expected DOM node',
)
assert(
  'PaperBrowsePage.tsx does not import the Forbidden paperIntelligencePaperSurfaceHarness.css (no such import statement)',
  !/import\s*['"][^'"]*paperIntelligencePaperSurfaceHarness\.css['"]/.test(pageSrc),
  'a Forbidden stylesheet import leaked into PaperBrowsePage.tsx',
)
assert(
  'paperBrowsePage.css does not @import the Forbidden paperIntelligencePaperSurfaceHarness.css (a plain source-comment citation of the file as a hand-copy origin is fine)',
  !/@import[^;]*paperIntelligencePaperSurfaceHarness\.css/.test(pageCssSrc),
  'a Forbidden stylesheet @import leaked into paperBrowsePage.css',
)
// flow-panel 刀 3: the .paper-browse-shell-scoped support/trap stroke
// palette moved out of paperBrowsePage.css into the shared
// paperSurfaceLectureHighlights.css (single source with the harness's
// .pi-ps-harness-shell-scoped copy) — check the shared file, plus that
// pageCssSrc no longer duplicates it.
assert(
  'shared paperSurfaceLectureHighlights.css carries the support/trap stroke palette for BOTH .paper-browse-shell and .pi-ps-harness-shell scopes (grouped selectors, single source)',
  /\.paper-browse-shell \.pi-line-path--support[\s\S]{0,200}stroke:\s*rgba\(16,\s*185,\s*129,\s*0\.65\)/.test(
    lectureHighlightsCssSrc,
  ) &&
    /\.pi-ps-harness-shell \.pi-line-path--support[\s\S]{0,200}stroke:\s*rgba\(16,\s*185,\s*129,\s*0\.65\)/.test(
      lectureHighlightsCssSrc,
    ) &&
    /\.paper-browse-shell \.pi-line-path--trap[\s\S]{0,200}stroke:\s*rgba\(245,\s*158,\s*11,\s*0\.85\)/.test(
      lectureHighlightsCssSrc,
    ) &&
    /\.pi-ps-harness-shell \.pi-line-path--trap[\s\S]{0,200}stroke:\s*rgba\(245,\s*158,\s*11,\s*0\.85\)/.test(
      lectureHighlightsCssSrc,
    ),
  'missing one or more of the support/trap palette rules in the shared stylesheet',
)
assert(
  'paperBrowsePage.css no longer hand-copies the support/trap stroke palette itself (moved to the shared file, not duplicated)',
  !/\.paper-browse-shell \.pi-line-path--support/.test(pageCssSrc) &&
    !/\.paper-browse-shell \.pi-line-path--trap/.test(pageCssSrc),
  'paperBrowsePage.css still declares the support/trap palette locally — not a single source',
)
assert(
  'paperIntelligencePaperSurfaceHarness.css @imports the shared paperSurfaceLectureHighlights.css and no longer hand-copies the support/trap palette or the seven-choices overlay/mark base rules itself',
  /@import\s*["']\.\/paperSurfaceLectureHighlights\.css["']/.test(harnessCssSrc) &&
    !/\.pi-ps-harness-shell \.pi-line-path--support/.test(harnessCssSrc) &&
    !/\.pi-ps-harness-shell \.pi-line-path--trap/.test(harnessCssSrc) &&
    !/\.pi-seven-blank-overlay\s*\{/.test(harnessCssSrc) &&
    !/\.pi-seven-clue-mark\s*\{/.test(harnessCssSrc),
  'harness stylesheet missing the shared-file @import, or still hand-copies rules that should have moved',
)
assert(
  'paperIntelligencePaperSurfaceHarness.css still declares .pi-seven-option-card[data-seven-color] (untouched consumer, not accidentally deleted with the clue-mark selector it used to share a rule with)',
  /\.pi-seven-option-card\[data-seven-color='0'\][\s\S]{0,20}\.pi-seven-option-jump-chip\[data-seven-color='0'\]\s*\{/.test(
    harnessCssSrc,
  ),
  'option-card/jump-chip color-variant rule is missing — may have been deleted along with the clue-mark extraction',
)
assert(
  'paperBrowsePage.css hides the evidence line below the 1200px docked-三栏 breakpoint (drawer geometry is not meaningful)',
  /@media \(max-width: 1199\.98px\)\s*\{\s*\.paper-browse-shell \.pi-line-overlay\s*\{\s*display:\s*none/.test(
    pageCssSrc,
  ),
  'missing the narrow-viewport display:none rule for .paper-browse-shell .pi-line-overlay',
)
assert(
  'paper-2026-i reading group evidenceKindById has both support and trap entries (real data for the activeEvidenceKind palette split)',
  (() => {
    const readingModel2026i = buildPaperAssetSurfaceModel({
      asset,
      analysis: JSON.parse(
        read('app/public/paper-assets/paper-2026-i/latest/analyses/reading-choice-analysis-v1.json'),
      ),
      groupId: 'group-2026-i-reading-a',
    })
    const kinds = new Set(Object.values(readingModel2026i.evidenceKindById))
    return kinds.has('support') && kinds.has('trap')
  })(),
  'reading group evidenceKindById does not exercise both support and trap kinds',
)

// ─── 44-56. flow-panel 刀 3: 入口带态 + 链接迁移 + URL/popstate + 样式抽
//     共享 + 小尾巴 ───

console.log('\n-- 44-56. flow-panel 刀 3 --')

// 44-46. App.tsx: paperBrowseRoute URL contract extended with
// questionId/lecture; openPaperBrowse takes an options bag; popstate
// listener replays the boot-read parse.
assert(
  'App.tsx boot-reads questionId/lecture into paperBrowseRoute (刀 3 URL contract extension)',
  /questionId:\s*params\.get\(\s*['"]questionId['"]\s*\)/.test(appSrc) &&
    /lecture:\s*params\.get\(\s*['"]lecture['"]\s*\)\s*===\s*['"]1['"]/.test(appSrc),
  'missing questionId/lecture boot-read on paperBrowseRoute',
)
assert(
  // similar-entrypoints (E3) adds `similar` alongside `questionId`/`lecture`
  // in the same options-bag → URL/state pipeline.
  'openPaperBrowse accepts an options bag (questionId/lecture/similar) and writes them into the URL + paperBrowseRoute',
  /const openPaperBrowse\s*=\s*useCallback\s*\(\s*\(paperId[^{]*options\?\s*:\s*OpenPaperBrowseOptions[^{]*\{/.test(
    appSrc,
  ) &&
    /setPaperBrowseRoute\(\{\s*active:\s*true,\s*paperId,\s*focusGroupId:\s*focusGroupId\s*\|\|\s*null,\s*questionId,\s*lecture,\s*similar\s*\}\)/.test(
      appSrc,
    ),
  'openPaperBrowse does not accept/thread the options bag',
)
assert(
  'App.tsx defines openPaperBrowseLectureFromDetail (detail-page 看解析 SPA fast-path, opens 讲评态 with questionId)',
  /const openPaperBrowseLectureFromDetail\s*=\s*useCallback/.test(appSrc) &&
    /openPaperBrowse\(paperId,\s*groupId,\s*\{\s*questionId,\s*lecture:\s*true\s*\}\)/.test(appSrc),
  'missing openPaperBrowseLectureFromDetail or it does not open 讲评态',
)
assert(
  'App.tsx wires onOpenPaperBrowseLecture={openPaperBrowseLectureFromDetail} into QuestionGroupDetailView',
  /onOpenPaperBrowseLecture=\{openPaperBrowseLectureFromDetail\}/.test(appSrc),
  'missing onOpenPaperBrowseLecture prop wiring',
)
assert(
  'App.tsx passes questionId/lecture through to <PaperBrowsePage>',
  /questionId=\{paperBrowseRoute\.questionId\}/.test(appSrc) &&
    /lecture=\{paperBrowseRoute\.lecture\}/.test(appSrc),
  'missing questionId/lecture prop pass-through to PaperBrowsePage',
)
assert(
  'App.tsx registers a popstate listener that replays the four-route boot-read parse',
  /window\.addEventListener\(\s*['"]popstate['"]\s*,\s*onPopState\s*\)/.test(appSrc) &&
    /setAdminRouteActive\(isOwnerView\s*&&\s*view\s*===\s*['"]admin['"]\)/.test(appSrc) &&
    /setMySpaceRouteActive\(view\s*===\s*['"]my-space['"]\)/.test(appSrc) &&
    /setDraftPaperRoute\(\{\s*\n\s*active:\s*view\s*===\s*['"]draft-paper['"]/.test(appSrc) &&
    /setPaperBrowseRoute\(\{\s*\n\s*active:\s*view\s*===\s*['"]paper-browse['"]/.test(appSrc),
  'missing the popstate listener or it does not sync all four route states',
)
assert(
  'popstate handler falls back to a full reload for view=paper-intelligence / view=reading-analysis (routes this component cannot assemble from state)',
  /view\s*===\s*['"]paper-intelligence['"]\s*\|\|\s*view\s*===\s*['"]reading-analysis['"][\s\S]{0,80}window\.location\.reload\(\)/.test(
    appSrc,
  ),
  'missing the reload fallback for SPA-uncarried views',
)
assert(
  // similar-entrypoints (E3) adds `similar` to the stripped-param list too —
  // otherwise a stale similar=1 would leak into the workbench URL.
  'paperBrowseOnBackToWorkbench strips questionId/lecture/similar from the URL alongside view/paperId/focusGroupId',
  /for\s*\(const param of \[\s*['"]view['"]\s*,\s*['"]paperId['"]\s*,\s*['"]focusGroupId['"]\s*,\s*['"]questionId['"]\s*,\s*['"]lecture['"]\s*,\s*['"]similar['"]\s*\]\)/.test(
    appSrc,
  ),
  'paperBrowseOnBackToWorkbench does not strip the new params — stale questionId/lecture/similar would leak into the workbench URL',
)

// 47-48. ConciergeGroupCard.tsx / QuestionGroupDetailView.tsx: 看解析 href
// migration to buildPaperBrowseLectureHref.
assert(
  // similar-entrypoints (E3) adds a second named import (buildPaperBrowseSimilarHref)
  // to the same import statement, for the sibling 配相似 entry.
  "ConciergeGroupCard imports buildPaperBrowseLectureHref and uses it to build the 看解析 href (search-card entry, plain <a href> — no SPA intercept, ConciergeDesk/ConciergePaperRow are out of this cut's Scope whitelist)",
  /import\s*\{\s*buildPaperBrowseLectureHref[\s\S]{0,80}\}\s*from\s*['"]\.\/paperSurfaceHref\.ts['"]/.test(
    conciergeGroupCardSrc,
  ) &&
    /buildPaperBrowseLectureHref\(group\.paperSurfaceHref\)/.test(conciergeGroupCardSrc),
  'missing the import or the href-building call',
)
assert(
  'paperSurfaceHref.ts exports buildPaperBrowseLectureHref, converting the server paper-intelligence href into a paper-browse 讲评态 href (view/paperId/focusGroupId/questionId/lecture=1)',
  /export function buildPaperBrowseLectureHref/.test(hrefHelperSrc) &&
    /nextParams\.set\(\s*['"]view['"]\s*,\s*['"]paper-browse['"]\s*\)/.test(hrefHelperSrc) &&
    /nextParams\.set\(\s*['"]lecture['"]\s*,\s*['"]1['"]\s*\)/.test(hrefHelperSrc),
  'buildPaperBrowseLectureHref missing or does not build a paper-browse&lecture=1 href',
)
assert(
  'QuestionGroupDetailView 看解析 entry uses buildPaperBrowseLectureHref for its href and intercepts plain left-clicks via onOpenPaperBrowseLecture (SPA fast-path); the <a href> fallback keeps 中键/新标签 working',
  /href=\{buildPaperBrowseLectureHref\(selectedDetail\.paperSurfaceHref\)/.test(detailViewSrc) &&
    /onOpenPaperBrowseLecture\(selectedDetail\)/.test(detailViewSrc) &&
    /event\.metaKey\s*\|\|\s*event\.ctrlKey\s*\|\|\s*event\.shiftKey\s*\|\|\s*event\.altKey/.test(detailViewSrc),
  'missing the migrated href, the SPA click-intercept, or the modifier-key bailout',
)
assert(
  'QuestionGroupDetailView props type declares onOpenPaperBrowseLecture, separate from onOpenPaperBrowse (看解析 ≠ 看整卷)',
  /onOpenPaperBrowseLecture:\s*\(detail:\s*QuestionGroupDetail\)\s*=>\s*void/.test(detailViewSrc),
  'missing onOpenPaperBrowseLecture in props type',
)

// 49-53. PaperBrowsePage.tsx: questionId deep-link selection, URL
// replaceState sync, scrollspy-clear race fix, cross-group jitter debounce,
// narrow-drawer empty-state copy.
assert(
  'PaperBrowsePage declares questionId/lecture props and seeds a deep-link selection effect that calls selectLectureQuestion once asset (and, for cloze/grammarFill/writing, lectureAnalysisFetched) are ready',
  /questionId\?:\s*string\s*\|\s*null/.test(pageSrc) &&
    /lecture\?:\s*boolean/.test(pageSrc) &&
    /deepLinkQuestionAppliedRef/.test(pageSrc) &&
    /selectLectureQuestion\(targetGroupId,\s*questionId\)/.test(pageSrc),
  'missing the questionId/lecture props or the deep-link selection effect',
)
assert(
  // similar-entrypoints (E3) extends this effect's deps with
  // similarView/similarSeed so it can also sync `similar=1` in/out of the URL.
  'PaperBrowsePage replaceState-syncs lectureOpen/lectureSelection/similarView/similarSeed into the URL (lecture=1 + focusGroupId/questionId when selected, similar=1 when the CTA result is open; all cleared when 讲评关)',
  /\}, \[lectureOpen, lectureSelection, similarView, similarSeed\]\)/.test(pageSrc) &&
    /window\.history\.replaceState\(window\.history\.state,\s*['"]['"],\s*nextUrl\)/.test(pageSrc) &&
    /urlSyncMountedRef/.test(pageSrc),
  'missing the URL-sync effect, or it does not skip the first mount commit',
)
assert(
  '刀 3 小尾巴 ①: the scrollspy clear-effect only clears when activeAnchor is a real group id (asset.content.groups[activeAnchor]) AND is not suppressed during programmatic scroll',
  /isProgrammaticScrollRef\.current\)\s*return/.test(pageSrc) &&
    /!activeAnchor\s*\|\|\s*!asset\?\.content\.groups\[activeAnchor\]\)\s*return/.test(pageSrc) &&
    /suppressScrollspyClear/.test(pageSrc),
  'missing the real-group guard, the suppression-ref check, or suppressScrollspyClear is not wired into the programmatic scroll call sites',
)
assert(
  'suppressScrollspyClear is called before every programmatic scrollIntoView (rail click / deep-link focus / evidence scroll) so the clear-effect race cannot wipe a just-made selection mid-settle',
  (pageSrc.match(/suppressScrollspyClear\(\)/g) || []).length >= 3,
  'expected suppressScrollspyClear() at all three programmatic-scroll call sites',
)
assert(
  '刀 3 小尾巴 ②: the scrollspy IntersectionObserver debounces setActiveAnchor (slow cross-group scroll should not flicker)',
  /debounceTimer\s*=\s*window\.setTimeout\(\s*\(\)\s*=>\s*\{\s*\n\s*debounceTimer\s*=\s*null\s*\n\s*setActiveAnchor\(current\)/.test(
    pageSrc,
  ),
  'missing the debounced setActiveAnchor commit in the scrollspy observer',
)
assert(
  '刀 3 小尾巴 ③: the narrow-drawer empty-state copy is actionable copy, not "滚动到题组查看速览" (fails to read in the drawer-over-content context)',
  !/滚动到题组查看速览/.test(pageSrc) && /滚动卷面或点选题目后，这里显示讲评/.test(pageSrc),
  'empty-state copy was not updated',
)
assert(
  '刀 3 追刀 (owner QA): selecting a sevenChoices question auto-expands its accordion chain — selectLectureQuestion seeds openSevenChoiceQuestionIds (append-only, manual toggles untouched)',
  /groupType\s*===\s*'sevenChoices'/.test(pageSrc) &&
    /setOpenSevenChoiceQuestionIds\(\(prev\)\s*=>\s*\(prev\.includes\(questionId\)\s*\?\s*prev\s*:\s*\[\.\.\.prev,\s*questionId\]\)\)/.test(
      pageSrc,
    ),
  'selectLectureQuestion does not seed openSevenChoiceQuestionIds for sevenChoices groups',
)

// ─── paper-passage-letter: screen-face passage-letter derivation ───
//
// PaperSurfaceSection derives the A/B/C/D passage letter from its
// `section` prop via /([A-D])$/ (app/src/shared-ui/papersurface/
// PaperSurface.tsx). `section` is exactly what these real adapters put
// on the surface model's textMap.paragraphs (PaperSurface's own
// `sections` memo is `Array.from(new Set(paragraphs.map(p => p.section)))`).
// This behaviorally exercises the SAME real adapters + real paper-2026-i
// asset PaperBrowsePage feeds into PaperSurface, rather than re-deriving
// the regex in the test.
{
  const readingAnalysis2026i = JSON.parse(
    read('app/public/paper-assets/paper-2026-i/latest/analyses/reading-choice-analysis-v1.json'),
  )
  for (const [groupId, expectedLetter] of [
    ['group-2026-i-reading-a', 'A'],
    ['group-2026-i-reading-b', 'B'],
    ['group-2026-i-reading-c', 'C'],
    ['group-2026-i-reading-d', 'D'],
  ]) {
    const model = buildPaperAssetSurfaceModel({ asset, analysis: readingAnalysis2026i, groupId })
    const sections = new Set(model.surfaceData.textMap.paragraphs.map((p) => p.section))
    assert(
      `paper-passage-letter: ${groupId}'s real surface-model section ("${[...sections].join(',')}") matches /([A-D])$/ as "${expectedLetter}" (screen-face passage-letter derivation input)`,
      sections.size === 1 && /([A-D])$/.exec([...sections][0])?.[1] === expectedLetter,
      `sections=${JSON.stringify([...sections])}`,
    )
  }

  const clozeModel = buildClozePaperView({ asset, groupId: 'group-2026-i-cloze' })
  const clozeSections = new Set(clozeModel.surfaceData.textMap.paragraphs.map((p) => p.section))
  assert(
    'paper-passage-letter: real 完形填空 (cloze) group section never matches /([A-D])$/ (non-reading groups render no passage letter)',
    [...clozeSections].every((s) => !/([A-D])$/.test(s)),
    `sections=${JSON.stringify([...clozeSections])}`,
  )

  const grammarFillModel = buildGrammarFillPaperView({ asset, groupId: 'group-2026-i-grammar-fill' })
  const grammarFillSections = new Set(grammarFillModel.surfaceData.textMap.paragraphs.map((p) => p.section))
  assert(
    'paper-passage-letter: real 语法填空 (grammarFill) group section never matches /([A-D])$/ (non-reading groups render no passage letter)',
    [...grammarFillSections].every((s) => !/([A-D])$/.test(s)),
    `sections=${JSON.stringify([...grammarFillSections])}`,
  )
}

// ─── 44-52. one-sheet-paper (毛边⑤): single-sheet layout + 剪刀线语义 ───
//
// docs/cuts/one-sheet-paper/plan.md. Source-level checks on the scissor-line
// computation (`scissorPlan`) plus the single-sheet CSS shell, then a
// behavioral re-run of the SAME算法（sectionGroupCounts → scissorGroupIndices
// / mergedGroupByInstructionIndex）against the real paper-2026-i blocks array
// — proves the 9-line plan (4 reading + 5 single-group sections, 2 of which
// render via the writing CSS-sibling path instead of a DOM div) has real
// data landing in each bucket, not just a source-level pattern match.

assert(
  '44. PaperBrowsePage computes a scissorPlan (useMemo) keyed off per-section group counts (not a hardcoded groupType list)',
  /const scissorPlan = useMemo\(/.test(pageSrc) &&
    /sectionGroupCounts/.test(pageSrc) &&
    /scissorGroupIndices/.test(pageSrc) &&
    /mergedGroupByInstructionIndex/.test(pageSrc),
  'missing the scissorPlan useMemo / sectionGroupCounts derivation',
)
assert(
  '45. scissorPlan excludes writing groups from the DOM scissor-line + merge machinery (writing gets a CSS-only sibling-selector line instead — see item 50)',
  /group\.groupType === 'writing'\) continue/.test(pageSrc),
  'missing the writing-group exclusion in the scissorPlan group loop',
)
assert(
  '46. renderGroupCard renders .paper-browse-scissor-line as a zero-footprint overlay child of the card (scissor-select-feel: no longer a flow sibling before it) when showScissorLine is set, and folds a merged 指导语 in as well',
  /showScissorLine && \(\s*<div className="paper-browse-scissor-line"/.test(pageSrc) &&
    /options\?\.mergedInstructionText &&/.test(pageSrc),
  'missing the scissor-line overlay render or merged-instruction render in renderGroupCard',
)

assert(
  '47. paperBrowsePage.css: .paper-browse-content is the single sheet — one background + one box-shadow, page-margin padding driven by the shared --ps-page-margin tokens',
  /\.paper-browse-content \{[^}]*background:\s*#fff/.test(pageCssSrc) &&
    /\.paper-browse-content \{[^}]*box-shadow:/.test(pageCssSrc) &&
    /\.paper-browse-content \{[^}]*padding:\s*var\(--ps-page-margin-top/.test(pageCssSrc),
  'missing the single-sheet background/box-shadow/padding on .paper-browse-content',
)
assert(
  '48. paperBrowsePage.css retires each nested PaperSurface/WritingPaperPage\'s own texture+shadow+padding when mounted inside the one sheet (.ps-surface / .ps-page / .pi-writing-page all zeroed, scoped under .paper-browse-content)',
  /\.paper-browse-content \.ps-surface \{/.test(pageCssSrc) &&
    /\.paper-browse-content \.ps-page \{/.test(pageCssSrc) &&
    /\.paper-browse-content \.pi-writing-page \{/.test(pageCssSrc),
  'missing the scoped retirement rules for nested PaperSurface/WritingPaperPage chrome',
)
assert(
  '49. paperBrowsePage.css declares the dashed .paper-browse-scissor-line rule as a zero-footprint overlay (position: absolute, no margin — scissor-select-feel retired the flow-affecting margin so the line never doubles up the block gap; screen-only, this stylesheet is never consumed by print/export) plus the hover selection band on .paper-browse-group-card::after',
  /\.paper-browse-scissor-line \{[^}]*position:\s*absolute[^}]*border-top:\s*1px dashed/.test(pageCssSrc) &&
    /\.paper-browse-group-card::after \{[^}]*border-top:\s*1px dashed/.test(pageCssSrc),
  'missing .paper-browse-scissor-line overlay rule or .paper-browse-group-card::after hover band rule',
)
assert(
  '50. paperBrowsePage.css draws the writing-section scissor line via a CSS-only sibling selector on the Forbidden .pi-writing-section element (no edit to writingPageModel.mjs/WritingPaperPage.tsx) instead of a DOM div',
  /\.paper-browse-content \.pi-writing-section \+ \*/.test(pageCssSrc) &&
    /\.paper-browse-content \.pi-writing-section \+ \*::before/.test(pageCssSrc),
  'missing the CSS-only writing-section scissor line sibling-selector rules',
)

// ─── 51-52. Real paper-2026-i fixture: re-run the scissorPlan algorithm ───

{
  const blocks = asset.content.blocks
  const sectionGroupCounts = new Map()
  let sectionId = null
  for (const block of blocks) {
    if (block.type === 'sectionHeading') {
      sectionId = block.sectionId
      if (!sectionGroupCounts.has(sectionId)) sectionGroupCounts.set(sectionId, 0)
    } else if (block.type === 'group' && sectionId) {
      sectionGroupCounts.set(sectionId, (sectionGroupCounts.get(sectionId) ?? 0) + 1)
    }
  }

  const scissorGroupIds = new Set()
  const mergedGroupIds = new Set()
  sectionId = null
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]
    if (block.type === 'sectionHeading') {
      sectionId = block.sectionId
      continue
    }
    if (block.type !== 'group') continue
    const group = asset.content.groups[block.groupId]
    if (!group || group.groupType === 'writing') continue
    const count = sectionId ? sectionGroupCounts.get(sectionId) ?? 0 : 0
    if (count > 1) {
      scissorGroupIds.add(block.groupId)
      continue
    }
    if (count === 1) {
      const prev = blocks[i - 1]
      if (prev && prev.type === 'instruction') {
        mergedGroupIds.add(block.groupId)
      } else {
        scissorGroupIds.add(block.groupId)
      }
    }
  }

  assert(
    '51. paper-2026-i: all four reading groups (multi-group section) get a standalone scissor line each — line sits at the group card itself, i.e. right before each article\'s letter',
    ['group-2026-i-reading-a', 'group-2026-i-reading-b', 'group-2026-i-reading-c', 'group-2026-i-reading-d'].every(
      (id) => scissorGroupIds.has(id),
    ),
    `scissorGroupIds=${JSON.stringify([...scissorGroupIds])}`,
  )
  assert(
    '52. paper-2026-i: the three single-group non-writing sections (七选五/完形/语法填空) each fold their leading 指导语 into the group card (merged unit) instead of getting a standalone pre-card line',
    ['group-2026-i-seven-choices', 'group-2026-i-cloze', 'group-2026-i-grammar-fill'].every((id) =>
      mergedGroupIds.has(id),
    ) &&
      !['group-2026-i-seven-choices', 'group-2026-i-cloze', 'group-2026-i-grammar-fill'].some((id) =>
        scissorGroupIds.has(id),
      ),
    `mergedGroupIds=${JSON.stringify([...mergedGroupIds])}, scissorGroupIds=${JSON.stringify([...scissorGroupIds])}`,
  )
}

// ─── 53-59. similar-rail (E2 — 讲评栏「配相似」UI, docs/cuts/similar-rail/plan.md) ───

assert(
  '53. PaperBrowsePage declares a similarView view state (\'analysis\'|\'similar\') and the CTA only renders when a question is selected AND its groupType is one of the four E1-supported types (program.md Q5 — writing/listening excluded)',
  /const\s*\[\s*similarView\s*,\s*setSimilarView\s*\]\s*=\s*useState<'analysis' \| 'similar'>/.test(pageSrc) &&
    /hasActiveQuestion && activeQuestionId && SIMILAR_SUPPORTED_GROUP_TYPES\.has\(group\.groupType\)/.test(pageSrc) &&
    /SIMILAR_SUPPORTED_GROUP_TYPES = new Set\(\['reading', 'cloze', 'sevenChoices', 'grammarFill'\]\)/.test(pageSrc),
  'missing similarView state, the CTA gate, or the 4-groupType whitelist',
)
assert(
  '54. selectLectureQuestion (换题) resets similarView back to \'analysis\' on every call; the separate scroll-away-clears-lectureSelection effect does NOT touch similarView (结果列表 persists across scroll, only resets on explicit换题/返回)',
  /function selectLectureQuestion\([\s\S]*?setSimilarView\('analysis'\)/.test(pageSrc) &&
    !/setLectureSelection\(\(prev\) => \(prev && prev\.groupId !== activeAnchor \? null : prev\)\)\)[\s\S]{0,80}setSimilarView/.test(
      pageSrc,
    ),
  'similarView is not reset inside selectLectureQuestion, or is wrongly coupled to the scroll-away clear effect',
)
assert(
  '55. (engine-rewire 撤刀) SimilarQuestionsRailView no longer suppresses the SW-1 constant-discourse reason — 真值落库后 discourse_type 不再恒真, isConstantDiscourseReason is fully removed and reasons render unfiltered',
  !/isConstantDiscourseReason/.test(railViewSrc) && /\{reasons\.map\(\(reason, index\) =>/.test(railViewSrc),
  'expected isConstantDiscourseReason to be removed and reasons.map to render the full reasons array unfiltered',
)
assert(
  '56. SW-2: the "含 N 题" matchedQuestionIds chip only renders when matchedQuestionIds.length > 0 — no assumption of non-empty',
  /matchedQuestionIds\.length > 0 &&[\s\S]{0,120}含 \{matchedQuestionIds\.length\} 题/.test(railViewSrc),
  'missing the matchedQuestionIds.length > 0 guard around the "含 N 题" chip',
)
assert(
  '57. SW-3: a thin candidate (questionGroupById has no card for result.groupId) disables its checkbox and carries an explanatory title, but the card itself still renders (池子诚实, not hidden)',
  /const isThin = !card/.test(railViewSrc) &&
    /disabled=\{isThin\}/.test(railViewSrc) &&
    /title=\{isThin \? '该卷未入库存，暂不能加入' : undefined\}/.test(railViewSrc),
  'missing the thin-candidate disabled checkbox + title, or the card is conditionally hidden instead',
)
assert(
  '58. similarQuestions.ts POSTs `{ seeds: [{ questionId }] }` to /api/similar-questions (E1 contract, server/search/similarQuestions.mjs parseSeedQuestionIds) and reuses the shared errorMessageFromResponse convention (draftPapers.ts pattern)',
  /apiPath\('\/api\/similar-questions'\)/.test(similarServiceSrc) &&
    /seeds:\s*\[\{\s*questionId:\s*seedQuestionId\s*\}\]/.test(similarServiceSrc) &&
    /errorMessageFromResponse as readError/.test(similarServiceSrc),
  'similarQuestions.ts request shape or error-handling convention drifted from the E1 contract / draftPapers.ts pattern',
)
const handleSimilarAddToDraftBody =
  pageSrc.match(/function handleSimilarAddToDraft\(\): void \{([\s\S]*?)\n  \}\n/)?.[1] || ''
assert(
  '59. handleSimilarAddToDraft reuses App.addGroupsToBasket (no new draft-add endpoint/path) and clears the selection Set after adding, without closing the result list (view stays \'similar\')',
  handleSimilarAddToDraftBody.length > 0 &&
    /onAddGroupsToBasket\(cards\)/.test(handleSimilarAddToDraftBody) &&
    /setSimilarSelectedGroupIds\(new Set\(\)\)/.test(handleSimilarAddToDraftBody) &&
    !handleSimilarAddToDraftBody.includes('setSimilarView'),
  'handleSimilarAddToDraft does not reuse onAddGroupsToBasket(cards), does not clear selection, or wrongly closes the result list',
)

// ─── 60-67. lecture-rail-scroll-fix (讲评态 cloze/七选五 点空显解析) ───

assert(
  "60. PaperBrowsePage: blankFocusMode local type widened to include 'paper-blank'",
  /let blankFocusMode:\s*'rail'\s*\|\s*'in-passage'\s*\|\s*'paper-blank'\s*\|\s*undefined/.test(pageSrc),
  "missing the widened blankFocusMode local type",
)
assert(
  "61. PaperBrowsePage: 讲评态 cloze/sevenChoices wire blankFocusMode='paper-blank', independent of whether lectureEntry has resolved",
  /if \(lectureOpen && \(entry\.kind === 'cloze' \|\| entry\.kind === 'sevenChoices'\)\) \{\s*\n\s*blankFocusMode = 'paper-blank'/.test(
    pageSrc,
  ),
  "missing the lectureOpen-gated, lectureEntry-independent 'paper-blank' wiring",
)
assert(
  '62. PaperBrowsePage: every blankFocusMode assignment is gated on lectureOpen (挑题态 stays undefined — no click-noise)',
  (pageSrc.match(/blankFocusMode = /g) || []).length === 2 &&
    /lectureOpen && entry\.kind === 'grammarFill'[\s\S]{0,160}blankFocusMode = 'in-passage'/.test(pageSrc) &&
    /if \(lectureOpen && \(entry\.kind === 'cloze'[\s\S]{0,120}blankFocusMode = 'paper-blank'/.test(pageSrc),
  'a blankFocusMode assignment is not lectureOpen-gated, or the count drifted',
)
assert(
  "63. PaperSurface.tsx: the __global__ option-pool and rail suppression conditions are narrowed to blankFocus?.renderer !== 'grammar-fill' (was bare !blankFocus) — 'paper-blank' mode no longer suppresses either",
  (paperSurfaceSrc.match(/blankFocus\?\.renderer !== 'grammar-fill'/g) || []).length === 2 &&
    !/&&\s*!blankFocus\s*&&/.test(paperSurfaceSrc),
  "expected exactly 2 occurrences of the narrowed condition and zero remaining bare '!blankFocus' suppression checks",
)
assert(
  "64. PaperSurface.tsx: 'paper-blank' mode has its own clickable-blank renderer (renderTextWithClickablePaperBlanks) isolated from I15's grammar-fill renderer, with a defensive static-span fallback when a blank number resolves to no question",
  /function renderTextWithClickablePaperBlanks/.test(paperSurfaceSrc) &&
    /blankFocus\?\.renderer === 'paper-blank'[\s\S]{0,40}renderTextWithClickablePaperBlanks/.test(paperSurfaceSrc) &&
    /if \(questionId\) \{[\s\S]{0,700}\} else \{[\s\S]{0,120}<span key=\{key\} className="ps-paper-blank">/.test(
      paperSurfaceSrc,
    ),
  'missing the isolated paper-blank renderer or its non-interactive fallback span',
)
assert(
  "65. PaperSurface.tsx: 'rail'/'in-passage' behavior is untouched — the historical static span renderer (paperBlankPattern loop, {match[1]} content, .ps-paper-blank class) and renderTextWithGrammarFillBlanks both still exist byte-for-byte",
  /paperBlankPattern\.exec\(text\)\) !== null\) \{[\s\S]{0,200}\{match\[1\]\}/.test(paperSurfaceSrc) &&
    /function renderTextWithGrammarFillBlanks/.test(paperSurfaceSrc),
  'the historical rail-mode static renderer or the grammar-fill renderer appears to have been disturbed',
)
assert(
  '66. PaperSurface.css declares a clickable paper-blank button variant that keeps the .ps-paper-blank box (button.ps-paper-blank.ps-paper-blank--clickable) plus hover/focus-visible affordance and an --active focused state',
  /button\.ps-paper-blank\.ps-paper-blank--clickable/.test(paperSurfaceCssSrc) &&
    /\.ps-paper-blank--clickable:hover/.test(paperSurfaceCssSrc) &&
    /\.ps-paper-blank--clickable:focus-visible/.test(paperSurfaceCssSrc) &&
    /\.ps-paper-blank--active/.test(paperSurfaceCssSrc),
  'missing the paper-blank clickable button CSS variant',
)
assert(
  '67. paperBrowsePage.css: 讲评态 (.paper-browse-shell--lecture-open) hides .paper-browse-group-actions — base state AND the :hover/:focus-within reveal rules (paper-blank buttons trigger :focus-within on click, which must not resurface the 加入草稿卷 button)',
  /\.paper-browse-shell--lecture-open \.paper-browse-group-actions,/.test(pageCssSrc) &&
    /\.paper-browse-shell--lecture-open \.paper-browse-group-card:hover \.paper-browse-group-actions,/.test(
      pageCssSrc,
    ) &&
    /\.paper-browse-shell--lecture-open \.paper-browse-group-card:focus-within \.paper-browse-group-actions \{\s*\n\s*display:\s*none;/.test(
      pageCssSrc,
    ),
  'missing the 讲评态 group-actions hide rule (base + hover + focus-within)',
)

// ─── 68-70. lecture-rail-scroll-fix QA round（真机 QA 抓出的两笔）───

assert(
  '68. PaperBrowsePage: 七选五 blank→questionId 映射从 asset 补喂（sevenChoices 的 surfaceData.questions 有意为空——A-G 池走 optionBank——不补喂则所有空降级为不可点 span），且 prop 已传入 PaperSurface',
  /blankFocusMode === 'paper-blank' && entry\.kind === 'sevenChoices'/.test(pageSrc) &&
    /blankQuestionIdByNo\[String\(no\)\] = questionId/.test(pageSrc) &&
    /blankQuestionIdByNo=\{blankQuestionIdByNo\}/.test(pageSrc),
  'missing the sevenChoices blankQuestionIdByNo supplemental mapping or the prop wiring',
)
assert(
  '69. PaperSurface: blankQuestionIdByNo 补充映射只填缺口、从不覆盖 questions 派生条目（questions-derived wins on conflict）',
  /readonly blankQuestionIdByNo\?: Record<string, string>/.test(paperSurfaceSrc) &&
    /if \(no && id && !questionIdByNo\.has\(no\)\) questionIdByNo\.set\(no, id\)/.test(paperSurfaceSrc),
  'missing the fill-gaps-only supplemental blankQuestionIdByNo merge',
)
assert(
  '70. scrollToAnchor 沉降巡检修（留观① QA 定性归刀）：setTimeout 驱动（遮挡态 rAF 冻结时 smooth 动画走不完，定时器照跑）、每拍重查询锚点（detached 节点防御）、静止 ≥3 拍且偏离 >4px 才 behavior:auto 硬校准、wheel/touchstart/keydown 立即取消、5s 到点退出',
  /stillChecks >= 3 && Math\.abs\(top\) > 4/.test(pageSrc) &&
    /timer = setTimeout\(settle, 150\)/.test(pageSrc) &&
    /scrollerRef\.current\?\.querySelector<HTMLElement>/.test(pageSrc) &&
    /window\.addEventListener\('wheel', cancel, \{ passive: true \}\)/.test(pageSrc) &&
    /window\.addEventListener\('touchstart', cancel, \{ passive: true \}\)/.test(pageSrc) &&
    /window\.addEventListener\('keydown', cancel\)/.test(pageSrc) &&
    /performance\.now\(\) > deadline/.test(pageSrc) &&
    !/requestAnimationFrame\(settle\)/.test(pageSrc),
  'missing the setTimeout-driven settle loop (re-query, still-checks gate, user-input cancel, deadline) or a leftover rAF-driven variant',
)
assert(
  '71. scrollToAnchor 重入防护（CR D-MF1）：retire-then-replace——入口先退掉上一轮巡检（scrollSettleCancelRef），cancel 自清把手（仅当把手仍指向自己），杜绝连点 rail 项时双循环互抢滚动',
  /scrollSettleCancelRef\.current\?\.\(\)/.test(pageSrc) &&
    /scrollSettleCancelRef\.current = cancel/.test(pageSrc) &&
    /if \(scrollSettleCancelRef\.current === cancel\) scrollSettleCancelRef\.current = null/.test(pageSrc),
  'missing the retire-then-replace reentry guard on the settle loop',
)

if (failed > 0) {
  console.error(`\npaper-browse verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\npaper-browse verify passed: ${passed} passed, 0 failed`)
