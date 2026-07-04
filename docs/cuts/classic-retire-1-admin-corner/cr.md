# CR — classic-retire-1-admin-corner (刀 1「管理角落」)

- Reviewer: fresh CR subagent (Opus), cold read, did not implement.
- Baseline: `main` … HEAD `6e87660`.
- Verdict: **APPROVE**

## Changed Scope

`git diff --name-only main...HEAD` — 4 files, zero server/, zero forbidden components:

- `app/src/App.tsx` (viewMode 收窄 / topbar 收敛 / adminRouteActive / workflow JSX 迁出)
- `app/src/features/admin/AdminWorkbench.tsx` (new)
- `app/src/features/admin/adminWorkbench.css` (new, 34 lines)
- `docs/cuts/classic-retire-1-admin-corner/plan.md` (contract)

PA downgrade (no-PA) re-checked and accepted: purely additive/reorder front-end,
no schema, no data contract, no route semantics change, all through existing
owner-only APIs and `isOwnerView` gating, whole-cut revertible. Downgrade holds.

## Verification Evidence (re-run, not copied)

Run in the full repo checkout on the branch HEAD (server + DB present):

- `pnpm -C app exec tsc --noEmit` → exit 0.
- `pnpm -C app run build` → built OK (pre-existing >500 kB chunk warning only).
- `pnpm -C app run verify:all` → **PASS 66 / SKIP 0 / FAIL 0**.
  - DEV reported 65/1/0; actual is 66/0/0 (the i16a off-repo fixture was present
    in this checkout so it ran instead of skipping). Green is real.
  - Note: a bare worktree without `server/node_modules` + DB fails 14
    server-boot tests purely for environmental reasons; those are NOT diff-induced
    (diff touches zero server files). The authoritative run is the full-repo one
    above.

Residual-reference sweep (all clean):

- No `viewMode === 'workflow'`, no `setViewMode('workflow')`, no `'workflow'` in
  the union — `viewMode` is now `'list' | 'detail' | 'preview'`.
- `showWorkflowQuestionGroups` fully deleted, no remaining callers.
- `handleLoadPaperSet` / `loadPaperStatus` correctly RETAINED — still used by the
  preview/save panel (App.tsx:5378), plan only removed the workflow-card 「载入
  题集」button, not the handler.
- `ClipboardList` import retained — still used by other buttons (App.tsx:5041,5469).

Behavior wiring confirmed by reading source, not the report:

- `openWorkflowDraft` → `setImportOpen(true)` (App.tsx:2978); the import modal
  (App.tsx:5484) and EntryModal render OUTSIDE the `!adminRouteActive` gate, so
  they overlay the admin workbench correctly. Reachability of `setImportOpen`
  from admin confirmed.
- `handleBuildWorkflowPaperSet` — the trailing `setViewMode('preview')` +
  `loadPreviewForBasketItems` jump is removed; save + `refreshPaperWorkflows`
  kept; feedback now inline in AdminWorkbench via `paperBuildStatus` /
  `paperBuildResult` (`.workflow-build-feedback` success/error span). Contract met.
- `paperWorkflows` seeding effect (App.tsx:1130-1148, `fetchPaperWorkflows()`) is
  UNTOUCHED by the diff, so the admin panel loads its data on mount exactly as the
  old workflow tab did — not stuck in perpetual 'loading'.
- Backfill handler `handleBackfillTopicLabels` + `backfillTopicLabels` import
  stayed in App.tsx (per plan warning) and are wired live into AdminWorkbench via
  props.

Member-view zero-change:

- `adminRouteActive` init returns false when `!isOwnerView` (App.tsx:788).
- 「管理」button wrapped in `{isOwnerView && …}` (App.tsx:3401).
- Member hitting `?view=admin` → init false → AdminWorkbench never renders. Same
  security posture as paper-import.

CSS reuse: reuses existing `library-panel` / `workflow-view` / `workflow-card` /
`panel-heading` classes; adds only 4 new selectors. tokens.css untouched. Minimal.

## Findings

### Must Fix

None.

### Should Watch (non-blocking; do not absorb into this cut)

- **SW-1 — no popstate/back-button re-sync (pre-existing app-wide).** The admin
  route uses `pushState` on enter / `replaceState` on exit but registers no
  `popstate` listener — identical to paper-import, my-space, draft-paper, which
  also have no popstate handler anywhere in App.tsx. So pressing browser Back from
  the admin URL will NOT flip React state back; the app relies on the in-app
  「退出管理」toggle. This is the established route model, not a regression this cut
  introduces. Flag only so PM QA knows Back-button behavior is out of scope here.

- **SW-2 — i16b App.tsx button assertion is now weaker than it reads.** The
  literal string `给题库打主题标签` moved out of App.tsx into AdminWorkbench.tsx.
  The i16b assertion "App.tsx has 给题库打主题标签 trigger button" still passes,
  but only via its `|| appSource.includes('backfill')` fallback branch (App.tsx
  still contains `backfillTopicLabels` etc.). The underlying capability (live
  backfill trigger) IS genuinely preserved and wired, so this is a real green, not
  a fake one — but the assertion no longer pins the actual button. If the button
  regressed silently in the future, i16b would not catch it. Record for the guard
  ledger; not a blocker for this merge.

- **SW-3 — AI floating 草稿卷 chip overlays the admin workbench.** The
  `homeMode === 'ai'` floating basket chip (App.tsx:5461) renders regardless of
  `adminRouteActive`. An owner who enters admin while in AI home mode will see the
  chip float over the admin panel. Cosmetic; PM QA to judge whether it's
  acceptable.

## Self-Review Blind Spots

- I did not exercise the admin workbench in a browser (build/tsc/verify only).
  The owner-facing assertions in the plan — 「管理」toggle in/out, `?view=admin`
  direct entry, import modal opening from admin, 生成整卷题集 no longer jumping to
  preview, 生成草稿 flow — are behavior-in-DOM claims that only browser QA can
  fully prove. Listed below for PM.
- I confirmed `paperWorkflows` load path is untouched but did not verify the panel
  visually renders the seeded workflow cards under the new admin layout CSS.
- I did not check keyboard focus / a11y of the new `aria-pressed` toggle beyond
  reading the attribute.

## For PM Browser QA (owner视角 — only a browser can prove)

1. Owner topbar shows exactly one curation entry「管理」(4 old buttons + backfill
   summary gone).
2. 「管理」toggles in and out; label flips 管理 / 退出管理; `?view=admin` in URL
   on enter, cleared on exit.
3. Direct `?view=admin` load lands owner in admin.
4. 导入资料 / 整卷导入 / AI 导题 modals open from the admin 导入 section.
5. 生成整卷题集 saves + shows inline feedback and does NOT jump to 排版预览.
6. 生成草稿 opens the import modal over admin.
7. 加入草稿卷 / 全部加入 / 刷新状态 all work in admin.
8. Classic home tabs show only 题组/详情/预览 (no 试卷 tab).
9. Member (non-owner): no 「管理」button; `?view=admin` does nothing; everything
   else unchanged.

## Failure / Attack Angle

- The most plausible fake-green here was i16b passing while the backfill button was
  actually dead. Checked: string moved out of App.tsx, assertion survives on the
  `backfill` fallback, but the handler + service import + live prop wiring are all
  present — capability genuinely intact (SW-2 records the weakened assertion).
- A future agent could misread SW-1 as "admin has full URL routing" and build
  Back-button-dependent flows on top; it does not. The route is toggle-authoritative.
- A stale fallback would be a leftover `viewMode === 'workflow'` branch; swept and
  confirmed absent.

## Residual Risk

Low. Front-end reorder behind existing owner gating, whole-cut revertible, green on
a real server-backed verify run. Remaining risk is entirely visual/interaction,
covered by the PM QA checklist above.

## Recommendation

**APPROVE.** No Must Fix. SW-1/2/3 are non-blocking; SW-2 belongs in the guard
ledger for a later hardening pass, not this cut.
