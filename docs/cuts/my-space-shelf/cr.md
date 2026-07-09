# my-space-shelf — cr.md (CR-lite, cold read)

Reviewer context: fresh CR subagent, did not implement. Diff read cold via
`git diff 63c84c3 bd5f606` (branch `my-space-shelf-card-shelf`, single impl
commit `bd5f606`, PR #284). No pa.md (reversible UI-only cut, self-authored
plan — see process note).

## Changed Scope

Exactly the plan's assigned set, nothing more:

- `app/src/features/my-space/MySpacePage.tsx` — render tree rebuilt (folder
  tree + file rows → chip filter + card grid), delete confirm moved from
  `window.confirm` to a custom `role="alertdialog"` modal, 3 folder-CRUD
  handlers removed.
- `app/src/features/my-space/MySpacePage.css` — full token-only rewrite.
- `scripts/verify-my-space-shelf.mjs` (new, registered in `verify-ci.mjs` +
  `README.md`).
- `scripts/verify-error-copy-mainline.mjs` — describeError count 6→3.
- `scripts/verify-c8-my-space-contracts.mjs` — confirm assertion flipped.
- `docs/cuts/my-space-shelf/plan.md`.

Forbidden set (`server/**`, `App.tsx`, `tokens.css`, `App.css`, `shared/**`,
`draft-paper/**`, `services/mySpace.ts`) confirmed untouched from the diff
name-list, not the report.

## Independent Verification Evidence

Re-ran, did not copy report numbers:

- `verify-my-space-shelf.mjs` → 17 passed, 0 failed.
- `verify-error-copy-mainline.mjs` → 18 passed, 0 failed.
- `verify-c8-my-space-contracts.mjs` → 84 passed, 0 failed.
- Hex grep on `MySpacePage.css` → NO HEX FOUND (empty allowlist honest).
- `describeError(` count in MySpacePage.tsx → 3 (matches new assertion).
- `window.confirm` in MySpacePage.tsx → 0.
- New script registered in `verify-ci.mjs` registry (confirmed present, not
  hand-run-only).

Assertion strength check (can they fail if behavior regresses?):
- error-copy 6→3 is a mechanical call-site recount reflecting the 3 deleted
  handlers; the load-bearing negative-regex ("no raw error.message /
  String(error) leaks") is untouched and still enforced. Not a weakened gate.
- c8-my-space confirm assertion flip is *stronger*: was
  `includes('window.confirm')`, now `!includes('window.confirm') &&
  includes('my-space-confirm-dialog')` — asserts both the removal and the
  replacement. The `my-space-folders` class-name assertion (line 138) stays
  green because the chip-row container keeps that class. Semantically
  equivalent / stronger, not neutered.

## Findings

### Must Fix
None. Business-logic保真 verified: `downloadArtifact` / `openSourceDraft`
unchanged; delete split into `requestDeleteArtifact` (opens dialog) +
`confirmDeleteArtifact` (same body as old `removeArtifact` after the confirm:
same `deleteMySpaceArtifact(id)` → `load(selectedFolderId)` → "文件已删除。").
Cancel path (`setConfirmTarget(null)`, no side effect) is equivalent to
`window.confirm` returning false. No semantic drift.

### Should Fix (non-blocking; owner call in current "磨顺" phase)

1. **Dialog focus management is absent; the Escape handler is effectively
   dead in the default state.** `MySpacePage.tsx:199-206`: `onKeyDown` sits on
   the backdrop (`role="presentation"`, not focusable). On open, focus is not
   moved into the dialog — it stays on the trigger 删除 button, which lives in
   the card (a sibling subtree of the backdrop). KeyDown bubbles through the
   focused element's ancestors, never the backdrop, so **Esc does nothing
   until the user Tabs into the dialog.** There is also no focus trap and no
   focus restore on close. The ARIA *markup* (role=alertdialog / aria-modal /
   aria-label) is correct, so plan Locked-Decision 7 ("aria semantics not
   downgraded") is met on the narrow letter — but `window.confirm` gave real
   focus + working Esc + inert background, and this custom modal regresses all
   three. Mouse path (the QA'd path) works fine; keyboard/AT path is degraded.
   Recommended follow-up: autofocus 取消 on open and move the Esc handler to a
   document/dialog listener (or focus the dialog container). Not a merge
   blocker for a single-user, mouse-driven teacher tool, but it is the one
   real quality gap in the diff.

### Should Watch (record, do not auto-schedule)

2. **Orphan smoke `scripts/smoke-c8-my-space.mjs` is now stale against the new
   UI.** Confirmed NOT in `verify-ci.mjs` and NOT in `README.md` (DEV's claim
   is accurate — it gates nothing). It targets removed selectors
   `.my-space-folder-row`, `.my-space-artifact-row`, `.my-space-artifact-
   actions`, and the aria-label "删除文件夹". Note it also exercises a
   **folder-delete flow this cut intentionally removed**, so it cannot be
   trivially "reselector-ed" — its folder-delete step tests a feature that no
   longer exists. Disposition recommendation: **ledger it** (挂账), not a
   本刀 fix. A future cut should either retire the script or rewrite it against
   card selectors and drop the folder-delete step. Minimum-cost mitigation if
   kept: a header comment marking it stale so a future runner is not misled.

3. **`renameMySpaceFolder` / `deleteMySpaceFolder` are now unused exports.**
   Only `createMySpaceFolder` still has a consumer
   (`DraftPaperWorkbench.tsx:350`). This matches JC-1's intent (services left
   untouched, folder rename/delete UI dropped from this page, low-frequency
   运维兜底 still reachable via the live server endpoints). Defensible — the
   functions map to real API routes and a future icon-affordance cut could
   re-mount them. Watch only: if no re-mount lands, a later cleanup cut should
   decide keep-vs-remove. Not dead code that breaks anything (TS does not error
   on unused exports; tree-shaking drops them from the bundle).

### Nits (do not schedule)

- `MySpacePage.css` uses `font-size: 12.5px` in two rules — a hardcoded size,
  not a palette hex, so outside this cut's "0 hex" contract; noting for token
  hygiene only.
- `.my-space-grid` div carries `aria-label` without a `role` (generic element)
  — some AT/axe ignore it. Old code put aria-label on `<section>`/`<aside>`
  landmarks. Minor; the `<main>` landmark still frames the region.
- Header "共 N 份" reflects the *filtered* count when a folder chip is active
  (fetchMySpace returns filtered artifacts). Reasonable as "共 N 份 of the
  current view"; flag only in case owner expected a global total.

## Self-Review Blind Spots (for any later Big CR)

- I did not run the full `verify:all` (69) or `pnpm build` — trusted DEV's
  已证实 claim per the dispatch instruction and instead re-ran the 3 scripts
  whose assertions this diff changed plus confirmed the new script is in the CI
  registry. If a Big CR wants belt-and-suspenders, re-run `verify:all` + build
  on a clean checkout.
- I did not run browser QA myself (DEV reports空态/有文件态/删除双路径 passed).
  My focus-management finding is by static reasoning about event bubbling, not
  a live keyboard test — verify by opening the dialog and pressing Esc without
  Tabbing first.

## Failure / Attack Angle

- **How this hides behind green:** the new verify is entirely structural
  (class/token/text presence + hex-zero grep). It proves the *shell* (grid
  track, primary/danger classes, no window.confirm, chips gated) but exercises
  **no runtime behavior** — delete, download, and the confirm round-trip are
  unproven by any registered test (same as before this cut; no coverage
  regression, but also no new safety net on the delete path). A future refactor
  could break `confirmDeleteArtifact`'s wiring and every listed verify would
  stay green. The negative-regex in error-copy is the only behavioral guard and
  it only guards error-copy leakage, not delete correctness.
- **Stale fallback:** none reachable — `window.confirm` and the folder-CRUD
  handlers are fully removed from the page, not left behind a flag.
- **Future-agent misuse:** the orphan smoke (Should Watch 2) is the trap — an
  agent who runs it manually gets a red that looks like this cut broke My
  Space, when in fact the smoke tests a deliberately-removed flow.

## Process (not a code-review conclusion; recorded per dispatch)

- DEV pushed the branch and opened PR #284 **before** the CR gate, and created
  a branded branch name (`my-space-shelf-card-shelf`) — a contract violation of
  the "CR before merge / don't self-open PRs to main" workflow. Does not change
  the code verdict, but recorded here and should be reflected in the takeover
  status ledger.
- `plan.md` was self-authored by the implementing DEV session (no PA). For a
  reversible, UI-only, no-schema/contract cut this is an allowed PA-lite
  downgrade; the plan documents JC-1/JC-2 judgment calls inspectably, which is
  the right mitigation. Accepted.

## Recommendation

**APPROVE** — mergeable. No Must Fix: business logic is preserved, scope did
not drift, forbidden files are untouched, the two contract-verify edits are
equivalent-or-stronger (not weakened gates), token discipline is real (0 hex,
independently confirmed), and the specificity self-fix uses proper
parent-qualification (`.my-space-card-actions .my-space-card-primary`, 0,2,0 >
the `button` reset's 0,1,1) + `:hover:not(:disabled)`, not `!important`.

Owner decides Should Fix #1 (dialog focus/Esc) — recommend a small follow-up
cut rather than blocking this merge, given the mouse path works and the product
is single-user mouse-driven. Should Watch #2 (orphan smoke) should be
ledgered.
