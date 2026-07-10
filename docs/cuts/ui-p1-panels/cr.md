# CR — ui-p1-panels (fresh cold read)

Baseline `09f6c47..d712963`, branch `cut/ui-p1-panels`. Reviewer did not write this code.

## Verdict: APPROVE (no Must Fix) — 0 MF / 5 SW

CI gate green, forbidden scope clean, 灰区 respected, palette guard re-pin honest.
The two items closest to a defect (subtype fallback, 340px unclamp override) are
functional against all shipped data / current bundler order; both are non-blocking
robustness recommendations. No code defect blocks merge. Owner visual QA still owed
(see SW-5) — the `qa/` dir is empty.

## Changed Scope (verified from `git diff --name-only`)
ConciergeDesk.css(new)/.tsx, DraftPaperWorkbench.css/.tsx, paperBrowsePage.css,
PaperIntelligencePreview.tsx, distractorLabels.ts(new), paperIntelligence.css,
paperIntelligencePaperSurfaceHarness.css, QuestionGroupDetailView.css(new)/.tsx,
scripts/verify-draft-workbench-visual-unify.mjs.

Forbidden untouched — confirmed from the file list, not the report: no `App.css`,
`App.tsx`, `AdminWorkbench`, `server/**`, `shared-ui/papersurface/**`. (The lone
grep hit `paperIntelligencePaperSurfaceHarness.css` is the *harness* under
`app/src/features/paper-intelligence/`, which plan 并行边界 explicitly grants this
cut — it is not the forbidden `shared-ui/papersurface`.)

## Axis findings

**#4 enum completeness — COMPLETE for the real source.** distractorLabels is
imported only in PaperIntelligencePreview, which loads exclusively from
`/reports/paper-intelligence/<id>/report.json`. That fixture's full enum is
3 categories (`detail_word_misleading`/`not_mentioned`/`common_sense_distractor`)
+ 5 subtypes (`object_mismatch`/`opposite_direction`/`scope_shift`/
`half_right_half_wrong`/`cause_effect_shift`) — the dictionary maps every one, zero
misses. The camelCase subtypes in `paper-assets/*/reading-choice-analysis-v1.json`
(`understatement`, `oppositeTrend`, …) flow through a *different* pipeline
(`paperAssetSurfaceAdapter` → `formatTrapSubtype`), never through distractorLabels,
so they are not a bareword risk here. See SW-1 for the fallback quality note.

**灰区 discipline — respected.** DraftPaperWorkbench's new `savedToastMessage` +
`savedToastTimerRef` are pure display state mirroring the existing `draft-undo-toast`;
`saveToMySpace` still calls the same store fn, only its post-success *display*
changed (close dialog + toast). ConciergeDesk added **no** state — no diff to
`useConciergeDesk.ts`; it reuses `actions.reset()` and `setFilterPanelExpanded`, and
the loading skeleton reuses existing `.concierge-skeleton-feed` classes. No
reducer/contract touched.

**Palette guard re-pin — honest, not放水.** Whitelist `{149,163,349}` → `{188,374}`.
Confirmed 188 and 374 are the *only* two `#ffffff` in the file, both
foreground-on-accent/ink (legit per the script's own rationale). The version-toggle
slot was correctly *retired* (item #15 converted that `#ffffff` to a token, so the
declaration no longer exists). Guard re-run: 20 passed / 0 failed.

**Non-CI failures — pre-existing, not cut-introduced.** `verify:all` (verify-ci) =
73 PASS / 1 SKIP / 0 FAIL. Spot-checked the touched-surface non-CI scripts:
cut-d1 74/0, preview 25/0, harness 81/0, concierge-local-search 60/0 all pass. The
one failure I found — interactive-preview `✗ V2 line module renders <path
class="pi-line-path">` — is in `paperIntelligenceEvidenceLine` (V2 line module),
a file **not in this diff**; the verify script itself is byte-identical to baseline.
Pre-existing.

**#7 un-screenshotted states — source-verified correct.** Disabled filter toggle:
render condition now includes `state.kind === 'loading'` with `disabled={loading}`
and a matching `:disabled` CSS rule — no unmount/width-jump. No-result CTA: uses
`catalogPaperCount = catalogFeed.length` (true full-catalog N) and `actions.reset()`
(sets intent '', state 'empty' → default feed). Both correct.

**#14 save flow — correct.** `saveToMySpace` sets `'saving'` before the await
(submit button `disabled` → no double-submit), closes dialog on success so repeat
save is impossible, error keeps dialog open. The removed `spaceStatus==='saved'`
branch had no other reader (the `'saved'` at line 493 is the unrelated *autosave*
`saveStatus`). Dead `'saved'` value left in the `spaceStatus` union — harmless.

## Should Watch (non-blocking)

- **SW-1 — subtype fallback still renders English.** `humanizeUnknown` returns the
  de-underscored token (`understatement` → `understatement`), so any *future*
  prompt subtype not in the dict would show a bareword — the exact "裸奔" the audit
  named, just prettier. No shipped/observable data triggers it today (category is a
  closed enum, all subtypes covered), so non-blocking. Cheap hardening per the plan:
  fall back to a generic Chinese label (e.g. 「其他干扰机制」) instead of the raw word.
- **SW-2 — 340px unclamp relies on CSS source order.** `.detail-passage-text`
  (`max-height:none`) and App.css `.passage-text` (`max-height:340px`) have *equal*
  specificity; the unclamp + 16px serif win only because the component CSS is
  imported after `App.css` (App.tsx:6) in the module graph. Functional now, but a
  future refactor / CSS chunk reorder could silently re-clamp. Harden by raising
  specificity (`.passage-text.detail-passage-text` or `pre.detail-passage-text`).
- **SW-3 — teal-50 literal drift.** paperIntelligence.css hardcodes `#EAF1ED` for
  the chip 选中态, while DraftPaperWorkbench.css expresses the same "teal-50" as
  `color-mix(--eqb-color-primary 10%, white)` (≈#E5EDE9). Two different values for
  one design concept; paperIntelligence.css has no palette guard so it slipped
  through. Prefer one token/value.
- **SW-4 — dead `'saved'` in `spaceStatus` union** (DraftPaperWorkbench). No setter
  reaches it anymore; harmless, drop when convenient.
- **SW-5 — QA evidence absent.** `docs/cuts/ui-p1-panels/qa/` is empty; plan #5/#7
  and the member-view-meta-hidden case require screenshots. Source-verified by CR,
  but owner visual QA (serif vs 整卷页, member sees no schema/prompt/model meta,
  悬浮钮 not over 指导语) must land before/at merge.

## Failure / Attack Angle
The most plausible silent failure is SW-2: if Vite ever emits `App.css` after the
detail sheet, the passage box re-clamps to 340px/14px sans-serif with **no error and
no failing test** — #5's whole deliverable evaporates invisibly. Second: SW-1 is a
latent bareword that a *new prompt version* (not a code change here) would surface
directly in a teacher's face. Neither is triggered by current inputs.

## Self-Review Blind Spots
- I confirmed distractorLabels' only consumer is PaperIntelligencePreview via grep;
  I did not exhaustively prove no future report.json variant carries camelCase
  subtypes — the type is `string|null`, so schema drift is possible but unobservable
  in-repo.
- SW-2 load-order conclusion is reasoned from the import graph, not from an actual
  built-CSS byte order — I did not run a production build to confirm the emitted
  cascade order.
- Visual/contrast correctness of #12/#13 color swaps (danger 浅底, muted token
  升档) is source-level only; not pixel/contrast-measured (owner QA territory).
