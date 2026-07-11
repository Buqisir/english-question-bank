# CR — lecture-rail-scroll-fix (fresh, cold-read, 2026-07-11)

Reviewer ≠ implementer. Cold-read of `git diff main...HEAD` (code only; plan/docs
live on main). Branch `eqb-wt-lecture-rail`, HEAD `c6eb48d`, tree clean.

## Changed Scope

6 files:

- `app/src/shared-ui/papersurface/PaperSurface.tsx` (契约面 — contract-unlock 已收口删除)
- `app/src/shared-ui/papersurface/PaperSurface.css`
- `app/src/features/paper-browse/PaperBrowsePage.tsx`
- `app/src/features/paper-browse/paperBrowsePage.css`
- `scripts/verify-paper-browse.mjs`
- `scripts/verify-i15-grammar-fill-blank-focus.mjs`  ← **not in plan's allowed 5-file set** (Should Watch S3)

Forbidden surfaces (print-renderer / DOCX / PDF / export / `blankPattern.mjs` /
shared `types.d.ts`): **none touched** — confirmed from `--name-only`, not the report.

## Findings

### Must Fix

**None.** The diff is correct, in scope (modulo the justified verify-i15 co-change),
and the hard invariant holds.

### Should Watch (non-blocking)

**S1 — clickable paper-blank button lacks `color: inherit` (currentColor fidelity gap).**
`button.ps-paper-blank.ps-paper-blank--clickable` (PaperSurface.css ~L247) resets
appearance/border/background and re-declares `border-bottom: 1px solid currentColor`,
but does **not** set `color: inherit`. `font: inherit` is handled globally
(App.css L143 `button, select, input { font: inherit }`), but the `font` shorthand
does **not** carry `color`. So a native `<button>` keeps UA `buttontext`, and the
number glyph + the `currentColor` underline resolve to `buttontext` instead of the
inherited paper text color. The I15 sibling deliberately set `color: inherit`
(`.ps-paper-blank-button, .ps-paper-blank-text { color: inherit }`, L207-213) for
exactly this reason. On the current white A4 surface `buttontext ≈ near-black paper
text`, so it is visually invisible today and does not block merge — but it is an
inconsistency with the I15 pattern and a latent fidelity gap the moment paper text
is ever themed/non-black. Recommend a one-line `color: inherit` in the clickable
variant. Not fixed here (CR does not patch).

**S2 — local prop-type widening leaves shared contract at 2 values (DEV disclosure #1).**
`blankFocusMode`'s third value `'paper-blank'` is added via a component-local
superset (`PaperSurfaceComponentProps = Omit<PaperSurfaceProps,'blankFocusMode'> &
{ blankFocusMode?: 'rail'|'in-passage'|'paper-blank' }`); the shared contract
`shared/papersurface/types.d.ts` stays `'rail'|'in-passage'`. This is a deliberate
blast-radius reduction and it typechecks cleanly (app tsc = 0) because
`PaperBrowsePage` imports `PaperSurface` directly (gets the widened type). Residual:
any future consumer that types a value against the *shared* 2-value union would not
see `'paper-blank'`. No current consumer does (tsc green across app; server print
path does not use React props). Acceptable; the deviation is documented inline in
the source. Watch when the next cut formalizes the mode set.

**S3 — verify-i15 script edited (out of plan's allowed 5-file set), but justified.**
Narrowing the suppression guard from `!blankFocus` to
`blankFocus?.renderer !== 'grammar-fill'` (and the dispatch from `if (blankFocus)`
to `if (blankFocus?.renderer === 'grammar-fill')`) is a sanctioned production change
that **forces** the verify-i15 string assertions to change — otherwise verify:all
(which runs verify-i15) goes red on stale strings. I read both edited assertions:
they now assert the *new* narrowed strings and still enforce `>= 2` rail guards +
the grammar-fill dispatch routing. This is faithful narrowing-tracking, **not a
water-down** — no I15 guarantee was deleted or loosened. The plan simply omitted
verify-i15 from its allowed set. Non-blocking; process note for the plan author.

## Verification Evidence (re-run, not copied)

- `node scripts/verify-paper-browse.mjs` → **192 passed, 0 failed** (assertions 60-67 new).
- `node scripts/verify-i15-grammar-fill-blank-focus.mjs` → **19 passed, 0 failed**.
- `cd app && npx tsc --noEmit` → **exit 0**.
- Read at least one new assertion per surface and confirmed it tracks real strings
  (61 = paper-blank wiring; 63 = exactly-2 narrowed guards + zero bare `!blankFocus`;
  64 = isolated renderer + fallback span; 67 = 3-selector group-actions hide).

### Correctness deep-read (未证实项, per review focus)

1. **`renderTextWithClickablePaperBlanks` regex/lastIndex/key/fallback.**
   Byte-structural clone of the static loop: `.test()` then `lastIndex = 0` then
   `exec` loop to completion (null-return resets lastIndex to 0). Shared module-level
   `/g` `paperBlankPattern` is used with the same reset discipline as the pre-existing
   static + grammar-fill renderers; React renders synchronously so no reentrancy on
   the shared regex — same posture the codebase already relied on, no new risk. Keys
   `${keyPrefix}-paper-blank-${index}` are stable and identical to the static span's
   keys (mode toggle remounts span↔button at same key — fine). Fallback: a blank
   number with no `questionIdByNo` entry renders a static `.ps-paper-blank` span,
   **never a dead button** — verified in code and by assertion 64.

2. **Suppression truth table (`blankFocus?.renderer !== 'grammar-fill'`), 3 states:**
   - rail (blankFocus=null): `undefined !== 'grammar-fill'` → true → rail + `__global__` pool **shown** (= old `!blankFocus`).
   - in-passage (renderer='grammar-fill'): false → **suppressed** (= old behavior).
   - paper-blank (renderer='paper-blank'): true → rail + pool **kept** (new desired).
   Applied identically at both sites (L272 `__global__` pool, L377 section rail). Correct.

3. **Hard invariant (rail/in-passage byte-unchanged):** confirmed from diff. For
   rail, blankFocus is null → static path is byte-identical and dispatch condition
   evaluates true as before. For in-passage, blankFocus non-null ⇒ renderer
   'grammar-fill' ⇒ routes to `renderTextWithGrammarFillBlanks` (whose body is
   untouched in the diff) and suppression stays true — equivalent to the old
   `if (blankFocus)`. tsc + verify-i15 green corroborate.

4. **Page wiring:** the new `if (lectureOpen && (cloze||sevenChoices))` is a separate
   statement after the if/else chain — for cloze it layers on top of the surfaceData
   swap; for grammarFill it does not fire (kind mismatch) so `'in-passage'` is
   preserved; `!lectureOpen` sets nothing → blanks non-interactive (zero-noise
   invariant intact). paper-blank is set independent of `lectureEntry` resolution,
   matching the plan's "点空即联动，解析加载是右栏自己的事".

5. **CSS group-actions hide:** base + `:hover` + `:focus-within` selectors under
   `.paper-browse-shell--lecture-open` all `display: none`. Base selector alone
   already dominates (display:none beats the reveal rule's opacity:1 at equal-or-lower
   specificity, and beats the `@media (hover:none)` always-visible rule at higher
   specificity + later source order). The two extra state selectors are defensive/
   redundant, harmless. Every reveal path (hover, focus-within, touch) is covered —
   the `:focus-within` case (paper-blank button click) is the one the plan called out
   and it is handled. Shell class confirmed applied when `lectureOpen`.

## Self-Review Blind Spots

- **Visual QA of the clickable blank** (font/size/color/underline vs the static span,
  hover/active affordance, active-state legibility) is source-verified only. The
  main agent's browser QA is the real proof; I did not render. S1 (color) is the one
  concrete gap I can name from source; other visual regressions would only surface in
  the browser.
- **Evidence-anchor slice interaction:** `renderTextWithPaperBlanks` is also called
  on pre/active/post text slices (L514-527). A blank straddling a slice boundary
  degrades to plain text in paper-blank mode — but identically in static and
  grammar-fill modes, so this is pre-existing, not a regression of this cut. Whether
  cloze/七选五 lecture mode ever produces active evidence slices I did not exercise.
- **questionIdByNo coverage** (does every cloze/七选五 blank number resolve to a
  question so no blank silently falls back to a non-clickable span) is data-dependent
  and belongs to the main agent's browser QA, not source review.

## Failure / Attack Angle

- If a future cut adds a consumer typed against the *shared* 2-value `blankFocusMode`
  union (S2), `'paper-blank'` becomes an "invalid" value at that boundary and the
  local widening becomes a footgun. Mitigated only by the inline disclosure comment.
- If the PaperSurface is ever themed with non-black paper text, S1 makes the clickable
  blank's number + underline visibly diverge from the static span (buttontext vs
  inherited color). Invisible today; a real regression under theming.
- A later editor "restoring" the plan's 5-file scope could revert the verify-i15
  assertions to the old `!blankFocus` strings and turn verify-i15 red — the co-change
  is load-bearing, not incidental (S3).

## PA-lite downgrade recheck

**Holds.** The change is an additive, reversible UI-interaction extension:
`'rail'`/`'in-passage'` paths behavior-preserved (truth table + tsc + verify-i15
green); shared data-contract untouched (`types.d.ts` unchanged, verified); no
schema / persistence / export / print / DOCX / anchor-protocol surface touched
(name-only scan clean); no `questionId=null` placeholder leaked — the no-match path
is a static span, not a contract placeholder. Risk is contained to a teacher-workbench
UI affordance with no persistence/export tail, so medium + fresh CR-lite is
proportionate; Big CR (reserved for core data / persistence / export / migration) is
not warranted. Downgrade to medium was correct.

## Residual Risk

Low. No Must Fix. All three Should Watch items are cosmetic/consistency/process, none
block merge. Behavioral proof of the point-click → right-panel联动 rests on the main
agent's browser QA (per plan's acceptance), which is the correct owner for that proof.

## Recommendation

**APPROVE.** No Must Fix. Merge once the plan's browser QA (讲评态 cloze/七选五 点空 →
右栏解析；语法填空回归；挑题态无 affordance；讲评态加卷钮不再出现；冷加载+立点 rail
留观①/scrollspy 留观③) is signed off and main CI is green. Consider folding S1
(`color: inherit`) into this cut or the next PaperSurface刀 for I15 parity.

---

# Delta CR — QA round + S1 fix (2026-07-11)

Scope: only the two new commits `b56a230` (S1) + `cf9d557` (QA round).
`git diff HEAD~2..HEAD -- app scripts` — 4 files (PaperBrowsePage.tsx,
PaperSurface.tsx, PaperSurface.css, verify-paper-browse.mjs). No forbidden surface,
no `types.d.ts` (blankQuestionIdByNo added to the LOCAL wrapper type only — consistent
with S2). Re-ran: verify-paper-browse **195/0**, app tsc **0**. Assertions 68-70 read
and confirmed to track the real new strings (incl. the `!requestAnimationFrame(settle)`
guard against a leftover rAF variant — not fake-green).

## Delta Findings

### Must Fix

**D-MF1 — scroll-patrol reentrancy: consecutive rail clicks spawn competing patrol
loops that can yank the viewport back to a stale anchor (`scrollToAnchor`,
PaperBrowsePage ~L1099).** The `settle` loop keeps ALL state in function-local
closure (`cancelled`, `timer`, the three window listeners). There is no ref /
module-level handle to the active patrol, so a second `scrollToAnchor(B)` call does
**not** retire the patrol still running for anchor A — the two loops coexist for up
to 5s each. The cancel set is `wheel` / `touchstart` / `keydown` only; a **mouse
click** on another rail item fires none of these, so on desktop (the owner's primary
device) clicking rail B while A's patrol is live leaves both running. Failure mode:
after B's smooth-scroll settles, loop A re-queries anchor A (now scrolled off-screen,
`|top| > 4`), sees it stationary for ≥3 ticks (~450ms), and hard-`scrollIntoView`s
back to A — then loop B corrects to B — ping-pong until the deadlines expire. This
directly regresses the scroll behavior this commit exists to fix, and is reachable by
ordinary multi-item lecture navigation (it was NOT in the single-click QA that passed).
Note: touch devices self-heal (the new tap's `touchstart` cancels prior loops before
the click creates the new one) — desktop mouse does not.
Fix (cheap, DEV's call): stash the active patrol's `cancel` in a ref and invoke the
previous one at the top of `scrollToAnchor` before starting a new patrol (retire-then-
replace); a fresh programmatic navigation should supersede, not race, the prior one.

### Should Watch

**D-SW1 — `blankQuestionIdByNo` is a fresh object literal every render (churns the
sevenChoices surface's blankFocus memo).** It is built inside `renderGroupBody`
(a plain per-render function, not memoized), so each PaperBrowsePage render — including
every scrollspy `activeAnchor` update during a scroll — produces a new object identity,
which is in `PaperSurface`'s `blankFocus` `useMemo` deps, forcing that memo to recompute
and the sevenChoices surface subtree to re-render. Cost is O(questions) per rebuild and
only affects sevenChoices groups (cloze/others pass `undefined`, a stable identity, so
they are unaffected). On single-teacher small papers this is negligible, so it does not
block; if it ever shows up, memoize `blankQuestionIdByNo` keyed on `asset`/`groupId`.
The merge itself (fill-gaps-only, `questions`-derived wins on conflict; for sevenChoices
`questions` is `[]` so no conflict; ignored in rail mode) is logically correct and
browser-QA-proven to resolve the blank→panel联动.

**D-SW2 — patrol runs ~33 idle ticks (`getBoundingClientRect` every 150ms for 5s) even
on the happy single-click path.** Harmless (self-cancels at deadline, listeners removed),
noted only as the tail cost of the setTimeout approach; no action needed.

## S1 verification (no omission)

`color: inherit` added to `button.ps-paper-blank.ps-paper-blank--clickable` — the base
clickable rule. The number text now inherits surface ink and the `currentColor`
border-bottom underline + `:focus-visible` outline follow it; the `--clickable:hover`
and `--active` rules set only `background-color`, so they inherit the same color. The
static-fallback `<span>.ps-paper-blank` inherits naturally. No state left on UA
`buttontext`. S1 fully closed.

## Delta Verdict

**APPROVE WITH MUST FIX.** S1 is closed and the sevenChoices mapping fix is correct and
QA-proven. The single blocker is D-MF1: the scroll patrol must retire its prior loop on
a new invocation before merge, otherwise normal desktop multi-click navigation can
yank the viewport back to a stale anchor for up to 5s. D-SW1/D-SW2 do not block.
Prior (base) CR verdict and its S1-S3 stand; S1 is now resolved.

---

# Delta CR — D-MF1 fix (2026-07-11, commit e5972c5)

Cold-read `git diff HEAD~1..HEAD`. `scrollSettleCancelRef` (useRef, L321) stores the
active patrol's `cancel`; `scrollToAnchor` entry calls `scrollSettleCancelRef.current?.()`
to retire the prior loop before starting a new one, then sets the ref to the new
`cancel`. The self-clean `if (scrollSettleCancelRef.current === cancel) ... = null`
only clears the ref when it still points to itself — so a stale/late cancel cannot
wipe a newer patrol's handle. Retire happens before the ref is reassigned, so exactly
one patrol runs at a time; the desktop multi-click ping-pong path is closed. Ref is a
proper mutable useRef (no stale-closure). Assertion 71 tracks the three real strings.
Re-ran independently: verify-paper-browse **196/0**, app tsc **0**. **D-MF1 closed.**

## Final Verdict

**APPROVE.** All Must Fix closed (base S1 fixed in b56a230; D-MF1 fixed in e5972c5).
Remaining non-blocking Should Watch: S2 (local prop-type widening vs shared 2-value
contract), S3 (verify-i15 co-change — justified/necessary), D-SW1 (blankQuestionIdByNo
object identity churns the sevenChoices blankFocus memo — negligible at owner scale),
D-SW2 (patrol idle ticks — harmless). Mergeable once main CI is green.
