# CR — cloze-panel-polish (CR-lite)

Reviewer: fresh CR context (reviewer ≠ implementer). Base `2134e3e6` (merge-base
with `main`) → `82f488d`. Cut tier: L3 (user-visible UI, no data/persistence/export).

## Changed Scope

6 files, exactly the plan's allowed set:

- `ClozeAnalysisPanel.tsx` — info layering + `useState<Set<questionId>>` collapse.
- `GrammarFillAnalysisPanel.tsx` — same pattern.
- `clozeAnalysisSurfaceAdapter.ts` — `+typeLabel` field + `CLOZE_EVIDENCE_TYPE_LABELS`.
- `grammarFillAnalysisSurfaceAdapter.ts` — `+typeLabel` field + `GRAMMAR_FILL_EVIDENCE_TYPE_LABELS`.
- `paperIntelligencePaperSurfaceHarness.css` — new pi-cloze/pi-gf panel styling.
- `docs/cuts/cloze-panel-polish/plan.md` — contract落档.

No server, no `pnpm-lock.yaml`, no verify scripts, no other题型 panels touched
(confirmed from `git diff --stat`, not from the report). Forbidden scope clean.

## Findings

### Must Fix
None.

### Should Fix (non-blocking hygiene)

1. **`min-height: 30px` added to the shared `.pi-seven-panel-actions button,
   .pi-seven-details-toggle` rule** (css ~L1592-1606). The selector extension to
   include `.pi-cloze-details-toggle, .pi-gf-details-toggle` is the intended
   button-visual reuse the plan granted. But the *new* `min-height: 30px` property
   in that same block now also applies to the seven-choices / pi-ps toggles, which
   is out of the declared "不改其他题型面板" scope. With global `box-sizing:
   border-box` (index.css L52) and the existing padding(10px)+border(2px)+~18px
   line box, the visible delta on pi-seven is likely 0–1px, so it is cosmetically
   negligible — not a merge blocker. Clean fix: move `min-height: 30px` into the
   dedicated `.pi-cloze-details-toggle, .pi-gf-details-toggle` block that already
   exists lower in the file (currently only carries margins), leaving pi-seven's
   shared rule untouched.

### Should Watch (record, do not block)

2. **`typeLabel` adapter field is unexercised by verify.** i9/i14 assert the
   evidence-anchor literals and adapter shape via source-string checks but never
   touch `typeLabel`. It is proven only by (a) TS totality — the `Record<…Type,
   string>` maps are exhaustive or the build fails, and `tsc -b` passed; (b) the
   `?? item.type` fallback. Both enums verified exhaustive against the upstream
   contracts (`cloze-analysis-v1.contract.md` closed vocab = 5/5;
   `grammar-fill-analysis-v1.contract.md` closed vocab = 12/12). Low residual risk;
   flagged only because no runtime assertion guards a future contract addition —
   if the contract grows a 6th cloze type, TS catches the map but nothing catches a
   drift between the union type and the contract md.

3. **Dark mode not adapted** — plan explicitly allowed ("没有就不新增"). The new
   rules mix `var(--pi-ps-insight-*)` tokens (theme-following) with hardcoded warm
   palette values (not theme-following). Base has no dark mode, so moot today. If a
   dark theme is ever introduced, the hardcoded badge/tag/distractor colors will
   not follow it. Accepted for this cut.

4. **≤1199px stacked view not screenshot-QA'd** — DEV self-reported. CSS reads
   correct: `@media (max-width:1199px){ .pi-*-blank-card { width:100% } }`, header
   uses `flex-wrap`, touch target `min-height:30px`. Owner is a one-on-one teacher
   (primarily desktop). Low risk; owner PO QA at discretion.

## Verification Evidence (re-run independently in the worktree)

- `node scripts/verify-i9-cloze-analysis-surface.mjs` → **64 passed, 0 failed**.
- `node scripts/verify-i14-grammar-fill-analysis-surface.mjs` → **67 passed, 0 failed**.
- `pnpm -C app run verify:all` → **65 PASS / 1 SKIP / 0 FAIL**. The single skip is
  `verify-i16a-teaching-dimension-search.mjs` (off-repo fixture absent) — pre-existing,
  NOT one of this cut's scripts. Confirmed the skip is not a masked failure of the change.
- `pnpm -C app run build` (`tsc -b && vite build`) → clean, no warnings/errors.
- Verify scripts unchanged (0 assertion edits) — confirmed from the diff, matching
  DEV's claim. i9 L188-189 / i14 L353-354 assert the exact literals
  `data-pi-evidence-id={row.evidenceId}` / `data-pi-question-id={analysis.questionId}`,
  which are byte-preserved in the branch; the assertions would fail if the anchor
  were dropped.

### Review-focus dispositions
1. **Evidence-connection protocol intact.** `data-pi-evidence-id` /
   `data-pi-question-id` / `data-pi-evidence-kind="support"` / `aria-pressed` /
   `onClick={() => onSelectEvidence(row.evidenceId)}` are byte-identical; the only
   in-button change is the type-label span `row.type` → `row.typeLabel` (display
   text, not an anchor). Buttons live inside `{detailsOpen && …}` — collapsed =
   not in DOM = the plan's拍板 behavior. No stale-state leak: `expandedDetails` is
   per-questionId memory; a revisited blank re-showing expanded is the *declared*
   strategy (comment + plan allowed "按 questionId 记忆"), not a bug. Empty focus
   (`analysis === null`) yields `detailsOpen = false` correctly.
2. **Adapter shape.** `typeLabel` is a pure additive field (`+` only; no existing
   field renamed/removed). Fallback implemented. Enums exhaustive vs contract + TS-total.
3. **CSS discipline.** Every color in the added rules is REUSED from the existing
   palette (classified all 13 added color tokens against the base file: 0 net-new).
   No new design system. The `--seven-border` focus-outline pattern is copied verbatim
   from pi-seven (css L1649/1721). Shared-selector pollution: see Should Fix #1.
4. **简介折叠刀 preserved.** `<details open={!hasActiveQuestion}>` + summary "文章简介"
   intact in both panels; only a stale "separate cut" comment was removed. The new
   blank-card toggle is a separate `<button>`+state mechanism with distinct class
   names — no collision with the native `<details>` group-overview.
5. **Scope.** Adapter touch limited to the plan-allowed label mapping; no shape drift.

## Failure / Attack Angle

The realistic failure mode is a **runtime collapse regression the string-based
verify cannot see**: i9/i14 assert that `data-pi-evidence-id={row.evidenceId}`
*exists in source*, not that clicking it after expanding still drives the
cross-column line. A future refactor could keep the literal string but break the
render path and stay green. For THIS diff that risk is contained — the button JSX
is unchanged and merely wrapped in a conditional, and DEV browser-QA'd the
expand→click→line path. The second angle is the shared-rule `min-height` (Should
Fix #1) silently nudging pi-seven's buttons; negligible but it is the kind of
out-of-scope side-effect that accumulates if repeated. Neither rises to blocking.

## Self-Review Blind Spots

- I did not run the app in a browser; the expand→click→evidence-line behavior and
  the actual rendered pixel height of pi-seven toggles under the new `min-height`
  are verified by reasoning + DEV's self-report, not by me observing the DOM.
- The `≤1199px` stacked layout is judged from CSS reading only.
- I confirmed enum exhaustiveness against the two contract `.md` files, but the
  runtime evidence `type` ultimately comes from parsed report JSON; if any live
  fixture carried a `type` outside the union, the `?? item.type` fallback would
  display the raw slug (graceful, not a crash) — I did not scan all fixtures.

## Residual Risk

Low. No correctness / contract / persistence / export surface touched. The additive
adapter field is TS-total and build-proven; the anchor protocol is byte-preserved
and assertion-guarded; scope is clean. Remaining risk is cosmetic (min-height
side-effect, mobile/dark unscreenshotted) and explicitly plan-accepted.

## Recommendation

**APPROVE** — mergeable as-is. No Must Fix. Should Fix #1 (relocate `min-height`
off the shared pi-seven rule) is recommended hygiene but non-blocking; the owner's
PO QA covers the mobile/dark Should-Watch items.
