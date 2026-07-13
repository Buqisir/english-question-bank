# CR — a3-imposition (fresh Opus, cold read)

- Reviewer ≠ implementer. Baseline `9e8154a` (github/main) .. `HEAD` (9a1907a); commits
  f9007b5 + 9a1907a. Worktree `/Users/huangxuewei/Projects/wt-a3-imposition`.
- Verify not re-run in full (main agent already ran verify-a3-imposition 32/32 incl. Phase B,
  verify-print-form 30/30, verify:all 1499/exit 0). CR independently read the diff, the
  assertions, the seam math, the server judgment table, and the process-cleanup chain.

## Verdict: APPROVE — 0 Must Fix, 4 Should Watch

PA-lite downgrade holds: pure display-layer, opt-in, reversible; server/路由/签名/导出 zero-touch
confirmed from the diff (`git diff --name-only` shows NO `server/` file). Forbidden list respected.

## Changed Scope (7 files, all in-contract)

- `draftPaperPreviewHtml.ts` (+247) — new `applyA3Imposition` + CSS + `A3_FACE_NATIVE_WIDTH_PX`.
- `DraftPaperWorkbench.tsx` (+133) — opt-in composition, seam-anchor effect + render, a3 fit-scale.
- `DraftPaperWorkbench.css` (+40) — `.is-a3` width breakout + `.draft-seam-suggestion`.
- `.github/workflows/verify.yml` (+7), `scripts/README.md` (+1), `scripts/verify-a3-imposition.mjs`
  (new) — registration mandated by Must Do 5; legitimate connected change, not scope creep.
- `scripts/verify-draft-workbench-visual-unify.mjs` (±10) — whitelist line re-pin after CSS insert.

## Verified independently

- **a4 zero-diff (点1) — TRUE by construction, CR-confirmed.** `buildA4PreviewHtml` is byte-identical
  pre→post cut (I diffed `9e8154a` = 76-line file ending at that function; cut only appends after
  it). a4 render returns `base` unwrapped (`printForm==='a3' ? applyA3Imposition(base) : base`);
  `applyA3Imposition` is wired ONLY into the `previewHtml` useMemo → `srcDoc` iframe. `browserPrint`
  writes raw `paginatedHtml` (L850), `exportPdf` does not touch the imposed output → PDF/print
  Forbidden respected.
- **Seam anchor math (点2) — SOUND, no reverse mismatch.** Cross-checked against
  `evaluatePageBreakAcrossPages` (a3: broken iff `firstPage%4∈{2,0}`) and `derivePageBreakSuggestions`
  (paged.js sequential flow). A straddling group's continuation is necessarily the FIRST rendered
  fragment on the page after the boundary and carries the same `data-group-id`, so
  `data-seam-before-group` (= first group id on the following page) always equals the suggestion's
  groupId. The DEV-feared "缝后页首是新题组" case only occurs at a CLEAN between-group boundary — for
  which the server emits NO suggestion, so the seam gets a tag but no pill renders: benign, not a
  misplacement. The seam anchor reuses the exact `getBoundingClientRect().top` math of the already-
  proven `getGroupIframeOffsetTop` (coordinate-consistent; iframe height = full nativeContentHeight
  ⇒ no internal scroll ⇒ viewport-rel == doc-rel), differing only in the query selector.
- **CI wiring (点3) — coherent.** New step sits in the `e2e` job AFTER app deps, server `npm ci`,
  app Playwright install, AND server playwright-core install — all deps Phase B needs are present;
  ports 9897/5187 free on a fresh runner.
- **visual-unify re-pin — legitimate, self-verified.** a3 CSS added NO hex literal to the `.css`
  (uses `color-mix`/`var`/`min()`); the imposition palette hex lives in the `.ts` (iframe srcDoc CSS,
  outside the .css guard's scan). Re-pin only tracks moved `#ffffff` lines (310→327, 524→564); commit
  9a1907a was "verify:all caught it", so the pins are validated. Guard still fails on a stray hex.

## Should Watch (non-blocking)

1. **Zero-diff assertion ① is weaker than it claims (点1).** `verify-a3-imposition.mjs:101`
   `execGitShow('HEAD', …)` compares HEAD-commit vs working-tree, not vs the pre-cut baseline —
   vacuously green once committed, and would stay green if a FUTURE cut edits+commits
   `buildA4PreviewHtml`. The a4 property is genuinely true (CR proved it via git + opt-in), so this
   is not a masked regression — but the guard has no future teeth. Recommend pinning to a frozen
   snapshot or the merge-base ref, not `HEAD`.
2. **Headline Must Do 3 (pill-on-correct-seam) may be behaviorally unexercised.** Phase A fixture is
   one-group-per-page (no straddle ⇒ no suggestion), so ④ tests only the anchor TAG, not the
   suggestion→seam MATCH. Phase B's seam-click is conditional (`if seamBadgeCount > 0`) and prints a
   skip line otherwise — a run with no straddle passes 32/32 without ever asserting a pill rendered
   on the right seam at the right position. Math is sound + reuses a proven mechanism, and DP-2
   browser QA will visually confirm before merge, so non-blocking — but DP-2 MUST verify a real
   cross-seam group renders its pill on the seam (and confirm whether the recorded Phase B actually
   hit the `badge>0` branch or skipped it).
3. **Inaccurate "never touches server's playwright-core" claim.** README + script header (L36-39)
   say Phase B never touches server's playwright-core/chromiumPool. False: Phase B boots
   `server/api.mjs` and A3/A4 preview rendering flows through `chromiumPool` (playwright-core,
   channel chromium). CI passes only because "Install server pagination Chromium" precedes the a3
   step. A future agent trusting this comment to reorder/drop that install would break Phase B. Fix
   the comment to state the real dependency.
4. **Phase B process leak (点4) — test-infra hygiene, not a merge blocker.** Could NOT reproduce an
   api-on-9897 leak now (nothing on 9897; the stray `node server/api.mjs` I found is on default 8787
   with pgid≠pid = a manual dev leftover, unrelated to this detached spawn). The script's group-kill
   (`process.kill(-child.pid,'SIGTERM')` on detached node/npm group leaders) is correct on its face.
   The likely real escapee is the server-side Chromium: `chromiumPool` cleans up only via
   `process.on('exit')`, which does NOT fire under SIGTERM signal termination (contrary to that
   module's own comment) — and Playwright spawns the browser `detached`, so it leaves api's group
   and outlives the group-kill. CI is unaffected (fresh runner per run); local re-runs can collide
   on ports. Recommend hardening cleanup: call an explicit graceful shutdown / SIGKILL the group
   after a grace timeout AND poll for port-9897-free before `process.exit`, and track/kill the
   escaped browser pid. Server signal behavior itself is Forbidden scope this cut.

Magic numbers (点5): `A3_FACE_NATIVE_WIDTH_PX = 1612` is exact math (`794*2 + 24` gap, both defined in
the same `.ts` as `.a3-half flex:0 0 794px` + `gap:24px`), not an arbitrary tuned value — drift risk
low. `300px` blank-half min-height is cosmetic only. No收口 needed; note only that the 794/24/1612
triple must move together if the half width ever changes.

## Self-Review Blind Spots (for any later Big CR)

- Did not run Phase B myself; whether the recorded 32/32 included the conditional seam-click assert
  or skipped it is unconfirmed (see SW-2).
- Did not visually diff the rendered A3 output against prototype.html (方案C) — that is DP-2 QA's job.
- Process-leak root cause is inferred (chromiumPool exit-hook + Playwright detached browser), not
  reproduced under instrumentation.

## Failure / Attack Angle

- A future cut edits `buildA4PreviewHtml` and commits it: assertion ① stays green (SW-1), a4 output
  silently changes with no failing guard. Mitigation today: opt-in composition regex + this CR's
  direct byte check; long-term: re-pin the ref.
- A future runner reorders CI steps trusting the "no server playwright-core" comment (SW-3): Phase B
  green→red only on CI, invisible locally.
- A draft whose cross-seam group happens never to render a pill in Phase B (SW-2): the seam-pill
  feature ships proven only by construction, caught only if DP-2 QA actually exercises a straddle.

## Recommendation

APPROVE. No correctness, scope, or proof defect blocks merge: a4 zero-diff and the seam anchoring are
correct (CR-verified, not report-trusted), Forbidden surfaces untouched, verify registered in the
right gate. The 4 Should Watch items are guard-strength / test-infra / doc-accuracy — record them;
DP-2 QA must confirm a real cross-seam pill (SW-2).
