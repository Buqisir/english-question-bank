# CR Review — classic-retire-3-cleanup

Reviewer: CR (fresh cold-read subagent, Opus). Baseline: `main` @ cfc3437.
Branch head: `cut/classic-retire-3-cleanup` @ 260d3c1 (3 commits: feat delete /
chore css / test). No uncommitted changes. Cut tier: medium (reversible
product-surface deletion). PA: skipped by plan.

## Verdict

**merge-ready** (one product finding to surface to PM — see MF-1; it does not
block the code correctness of this cut but needs a PM/PO decision + a ledger
entry before close).

Nettoyage is careful and correct: 1204 lines out of App.tsx, 590 out of
App.css, build (tsc -b) clean, full verify suite green (68/68), forbidden scope
untouched. All four DEV-reported deviations verified independently and dispositioned
correctly. The single thing that needs a human decision is a **product** behavior
loss the plan never accounted for (delete-question-group UI), not a code defect.

## Changed Scope (verified from diff, not report)

`git diff main...HEAD --name-only`:
- `app/src/App.tsx` (−1204), `app/src/App.css` (−590 net)
- `scripts/verify-classic-retire-2.mjs`, `verify-concierge-desk.mjs`,
  `verify-h12a-entry-modal.mjs`, `verify-paper-draft.mjs` (updated)
- `scripts/verify-classic-retire-3.mjs` (new), `verify-ci.mjs` + `README.md`
  (registration), `plan.md`

`server/` = 0 files. Forbidden components (EntryModal / ConciergeDesk /
QuestionGroupDetailView / DraftPaperWorkbench / AdminWorkbench) = 0 touched.
Scope clean. `verify-paper-draft.mjs` is beyond the D8 list of 3 but is a
required, proven cut-driven follow-through (see Verification Evidence), not
scope creep.

## Findings

### Must Fix (blocks close, not code correctness)

**MF-1 — Delete-question-group UI silently removed from the entire product,
no ledger entry.**
`handleDeleteQuestionGroup` (App.tsx) was the ONLY UI wiring for the
`deleteQuestionGroup` service (services/questionGroups.ts:306) and
`paperDraft.externalRemoveByGroupId`. Its only render site was the classic
group-list card's 删除题组 icon-button, which D4/D5 correctly deleted. I grepped
concierge / question-detail / admin — **no delete-question-group control exists
anywhere else.** After this cut there is no way for owner (or anyone) to delete a
question group from the UI.

This is in-scope-of-the-deletion but **out of the plan's stated invariants**: the
plan promises "AI 模式行为零变化 / admin 除不再跳排版预览外零变化 / member 零变化."
Losing delete is a behavior change none of those exceptions cover. The plan only
records an EntryModal-create 挂账 (plan.md:87) — there is **no 挂账 line for delete**.
The review prompt says DEV reported this deviation, but it is not recorded in any
tracked artifact (not in plan.md, not in the commit bodies, no pa.md).

Required before close (PM/PO decision — CR does not fix): either (a) confirm
losing the delete-question-group UI is acceptable and record it as an explicit
挂账 in plan.md (matching the EntryModal-create precedent), or (b) restore a
delete entry point in a follow-up. The service + hook method are intact and
untouched, so restoration is cheap. Do not merge-and-forget: the capability
vanished without a paper trail.

### Should Watch (non-blocking)

**SW-1 — verify-paper-draft.mjs config-driver thresholds dropped to `>= 1`.**
`paperDraft.setPaperTitle` / `.setVersionType` assertions went from `>=3`/`>=2`
to `>=1` each (the load + save-paper-set call sites were legitimately deleted).
The drop is justified, but `>=1` is a thin guard — it would still pass if a
future refactor accidentally collapsed workflow-build and objective-build config
driving into one path. Not a blocker (the `replaceDraft`-does-NOT-mutate-config
invariant, the real contract, is fully retained). Watch if a later cut touches
paper-config wiring.

**SW-2 — `paperExports.resetExportStatuses()` now fires on every draft edit
unconditionally.** The old `onDraftEdited` router gated a `previewStatus` reset
on `reason === add/remove/clear`; that gating is gone (previewStatus deleted).
The surviving behavior (always reset export cache) is a superset of the old
export-reset behavior, so no functional regression for the AI/draft path — but
the `reason` parameter is now unused and the handler signature narrowed to `()`.
Confirmed by verify-paper-draft Test 3. No action; noted for the next reader.

### NIT

**NIT-1 — Dead CSS left behind.** `.export-button` (5 rules) and
`.export-secondary` in App.css now have zero TSX users (DraftPaperWorkbench uses
`draft-export-*`). DEV deliberately left `.export-button` (deviation #3). Harmless
cruft, no collision risk. Optional sweep in a future cut; the plan's "宁可少删
CSS" bias makes leaving it defensible.

## Self-Review Blind Spots

- I verified no delete-question-group UI exists by grepping concierge /
  question-detail / admin / workbench for `删除题组|onDelete|deleteQuestionGroup|
  handleDelete`. If a delete entry point exists under a differently-named handler
  I did not anticipate, MF-1 would soften to a non-issue. I consider this unlikely
  (the service export has exactly one former caller) but flag it.
- I did not run browser QA. All my checks are static (grep + build + verify). The
  cut is a pure deletion with zero net-new interactive surface, so visual QA risk
  is low, but per AGENTS.md Browser Verification the user-visible removal of the
  classic sidebar/list should still get a real-click pass (confirm AI-mode home,
  detail nav, basket-chip, admin objective-build-no-preview) before RM. That is
  the owner/QA hat's call, not mine.

## Verification Evidence (re-run by CR, not copied)

- `pnpm -C app run build` → tsc -b clean + vite build OK. This is the real
  orphan-state / orphan-import guard the plan relies on (验收 #1); it passed, so
  no deleted symbol left a dangling reference.
- `pnpm -C app run verify:all` → **PASS 68 / SKIP 0 / FAIL 0**, including
  classic-retire-2 (32), classic-retire-3 (17, new), verify-paper-draft (145),
  concierge-desk, h12a.
- `node scripts/verify-cut-artifacts.mjs docs/cuts/classic-retire-3-cleanup
  medium` → PASS 2 / FAIL 0.
- Read every changed assertion in the 4 modified verify scripts. All are
  narrowed-not-weakened: retire-2 flips present→absent AND adds a positive
  onOpenDetail assertion; concierge Test 1 removed a genuine zombie (its mirrored
  source is gone, replacement coverage in retire-3); Test 14 re-pointed to the
  surviving basket-chip aria-label (still asserts 草稿卷); h12a dropped a
  setPreviewDetails assertion for state that no longer exists.
- **Proved verify-paper-draft break is cut-driven** (DEV deviation #1): ran
  `main`'s verify-paper-draft.mjs against the branch App.tsx in-place — it FAILS
  on exactly the deleted classic wrappers (removeFromBasket delegates…,
  handlePaperTitleChange exists…, handleDeleteQuestionGroup uses
  externalRemoveByGroupId, etc.). So updating it in-cut is required follow-through,
  not scope creep. Cleaned up the temp copy.
- **CSS deletion is not over-deletion.** All plan-protected classes survive:
  `.version-toggle`(4) / `.paper-page`(4) / `.paper-meta`(2) / `.basket-item`(2) /
  `.app-shell.home-mode-ai`(22) / base `.eyebrow` (line 32, `color: var(--muted)`).
  The only "protected-looking" removed lines are `.paper-page-header*` — a distinct
  class from `.paper-page`, correctly killed with the preview branch. `.back-button`
  and `.library-panel` appeared as grep flags but their rules survive: DEV split
  grouped comma-selectors so the surviving selector keeps its full declaration
  block (verified `.back-button` retains its `.detail-button`-grouped rule +
  `:hover`). No live TSX user lost its styling.
- New retire-3 script genuinely fails on regression: whole-file `!/homeMode/`,
  the `viewMode === 'list' ? (` preceding-window check proving ConciergeDesk is
  no longer homeMode-gated, and 6 CSS negative-deletion sentinels. Registered in
  verify-ci.mjs (line 82) and README (`yes`) — housekeeping guard satisfied.
- `setAiApiKey`/`setAiModel` removal is safe: their only writers were the deleted
  classic topbar key-input; `aiApiKey` still read 9× by surviving verify/parse
  handlers; `normalizeAiModel`/`DEEPSEEK_MODELS` still used by the `aiModel`
  initializer. tsc confirms no orphan imports.

## Failure / Attack Angle

- **The fake-green that would matter here:** a deleted symbol left silently
  reachable behind a stale path. Attacked via `tsc -b` (would error on any
  dangling reference) + whole-file greps for all 30+ deleted symbols — all zero
  except legitimate comment/`filter-bar-summary`/`saveStatus:`-object-key
  survivors, each inspected.
- **The plausible silent regression:** a user-facing capability disappearing
  because its only mount point was inside the deleted JSX. This is exactly what
  happened with delete-question-group (MF-1) — caught by grepping the service
  export's callers, not by any verify script (no verify covers it, which is itself
  why it slipped past green). This is the one place "verify green" ≠ "no behavior
  loss."
- **Over-deletion of a shared CSS rule** (a grouped selector where a live
  co-selector shares the deleted block): checked by diffing every removed selector
  head against live TSX users and inspecting the split rules. Clean.

## PA-Downgrade Review (plan item 5)

Plan skipped PA with reason "纯删除、git 可逆、无数据契约变化." Per AGENTS.md, PA
is mandatory only for irreversible surfaces / data-contract semantics
(schema, migration, export, anchor protocol, cross-cut architecture); reversible
product-surface work may downgrade. This cut touches App.tsx / App.css / verify
scripts only, server/ untouched, no schema/migration/export-logic change, fully
git-reversible. The downgrade is **legitimate** — CR concurs. (Caveat: had the
plan foreseen the delete-UI loss, a one-line PO product check would have been
worth it; that gap is MF-1, not a PA-tier miss.)

## RM Gate Pre-check

- Artifact gate: PASS 2 / FAIL 0 (medium).
- verify:all: 68/68 green locally.
- New `yes` script registered in verify-ci + README (housekeeping guard green).
- Before merge, RM must still confirm the PR's CI run is green (not only local),
  per AGENTS.md RM gate.

## Recommendation

`APPROVE WITH MUST FIX` — the code is correct, proven, and in scope; merge is
blocked only on PM/PO dispositioning MF-1 (accept the delete-UI loss with an
explicit plan.md 挂账, or restore a delete entry point). SW/NIT are
non-blocking. CR does not fix — PM decides.

---
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
