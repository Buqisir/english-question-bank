# CR — draft-workbench-visual-unify

Reviewer: fresh CR-lite context (reviewer ≠ implementer). Cold read of
`git diff 63c84c3...63df4d5` (merge-base = 63c84c3, single commit).

Level: L3-ish surface but change type is pure front-end visual + one interaction
swap. Reviewed at CR-lite depth; risk is contained (no data/persistence/export
contract touched — only CSS tokens, one `<details>`→controlled-overlay swap, and
verify wiring).

## Changed Scope

7 files, all inside the plan's allowed set:

- `app/src/features/draft-paper/DraftPaperWorkbench.css` — 51 hex → token, D1/D8
  shadow+desk, D5 overlay styles, D2 `:not(.primary-button)` guard.
- `app/src/features/draft-paper/DraftPaperWorkbench.tsx` — export menu state +
  outside-click/Esc effect, D5 markup swap, D2 `className="primary-button"`.
- `scripts/verify-draft-workbench-visual-unify.mjs` (new, 20 assertions).
- `scripts/verify-ci.mjs` + `scripts/README.md` (registration).
- `scripts/verify-c8-draft-paper-render-model.mjs` (one pinned-color assertion
  re-pointed to the new flat desk).
- `docs/cuts/draft-workbench-visual-unify/plan.md` (contract record).

Forbidden scope confirmed untouched from the diff file list: `tokens.css`,
`App.css`, `index.css`, `shared/**`, `my-space` — none appear. No uncommitted
changes.

## Findings

### Must Fix

None.

### Should Watch (non-blocking)

1. **Border color shifts lighter across the whole file.** Old hardcode was
   `#D8D8D2`; `var(--line)` resolves to `--eqb-color-border-subtle` = `#e8e8e4`,
   which is lighter than `#D8D8D2`. Every border in this file (toolbar, cards,
   inputs, outline items, dialog, desk) becomes subtler. This is a real visual
   delta that the plan's "deviations" section did **not** call out (it framed the
   mapping as equivalence). It is not a bug — adopting the design system's actual
   border token is the correct intent of the cut — but owner QA should eyeball
   that the lighter borders still read as intended separators, especially the
   toolbar-vs-shell edge. Non-blocking.

2. **`role="menu"`/`role="menuitem"` without roving keyboard focus.** The overlay
   uses the ARIA menu roles but implements only Tab order + Esc + outside-click,
   not the arrow-key roving focus the menu-button pattern implies. This is not a
   regression (native `<details>` had no arrow nav either) and the plan required
   no focus trap, but the roles slightly over-promise. Consider dropping
   `role="menu"` or adding arrow-key nav in a future a11y pass. Non-blocking.

3. **Focus not returned to trigger on close.** Closing via Esc / outside-click /
   item-select does not explicitly restore focus to `.draft-export-menu-trigger`.
   Native details/summary returned focus naturally. Minor keyboard-UX only.
   Non-blocking.

### Nits

- `button:disabled` color `#9A9A93` → `var(--muted)` `#6a6a64` (darker) is
  compounded by the global `button:disabled { opacity: 0.55 }`; net disabled text
  is marginally darker. Non-issue — disabled text is intentionally low-contrast.
- `.draft-break-marker` text `#92400e` → `var(--eqb-color-warning)` `#d97706`
  (one shade lighter); documented in plan §2, acceptable on the 16% amber pill.

## Verification Evidence

Re-ran myself in the worktree:

- `node scripts/verify-draft-workbench-visual-unify.mjs` → **20 passed / 0
  failed** (self-counted 20 assertions; matches DEV report).
- `node scripts/verify-c8-draft-paper-render-model.mjs` → **30 passed / 0
  failed** (confirms the re-pointed desk assertion is green).
- Full `verify:all` (69 green) not re-run per orchestrator instruction; the two
  scripts that actually cover this diff were re-run and read.

Assertion quality read (not just pass count):

- **Palette-hex=0 guard is genuine and fails-safe.** It strips block comments,
  enumerates every hex, and only exempts `#ffffff` on lines {138,152,338}. A
  companion assertion requires each whitelisted line to still contain `#ffffff`,
  so a line-number shift fails loudly rather than silently passing. A new
  hardcoded hex anywhere → fail. Confirmed only 3 `#ffffff` remain (version-toggle
  active / export trigger / undo toast — all white-on-accent/ink, matching
  App.css `.primary-button { color: #ffffff }` convention).
- **D5 wiring** asserted by source-shape (aria-expanded bound to state, Esc,
  ref-containment outside-click, right:0, max-width calc(100vw…)). Acceptable for
  a declared cloud-safe/no-browser cut; each would fail if the wiring were removed.
- **verify-c8 update守住原意**: old assertion pinned the literal gradient string;
  new one asserts `.draft-preview-desk { … background: var(--surface-strong) }` —
  semantic-equivalent (desk keeps its nested-layer identity), not a weakened gate.
- New script registered in both `verify-ci.mjs` registry and `README.md` (col
  "yes"), so the real gate runs it — not a hand-only green.

## Judgment on the requested focus points

1. **Logic zero-change: CONFIRMED.** TSX changes are limited to menu open-state,
   the outside-click/Esc effect, className, and wrapping the three onClicks with
   `setExportMenuOpen(false)`. `exportPdf`/`openSpaceDialog` (async) and
   `browserPrint` (sync) are all zero-arg, so switching from `onClick={fn}` to
   `onClick={() => { close(); void fn() }}` drops only the unused event arg —
   behavior-neutral. All three `disabled` conditions are byte-identical to the
   original.
2. **Token mapping / no inversion: CONFIRMED.** Actual values: shell `--surface`
   #f6f6f4, cards/toolbar/inputs/dialog `--panel` #ffffff (raised), desk +
   suggestions `--surface-strong` #ededea (recessed). Coherent elevation — the
   darker desk is a recessed well, white cards sit above the page base; the A4
   sheet's new Resting shadow makes it read as paper on the desk. No bg/panel/
   surface-2 inversion.
3. **Overlay effect: correct.** Guarded by `if (!exportMenuOpen) return`; both
   `mousedown` and `keydown` listeners are removed in cleanup keyed on
   `exportMenuOpen`. No leak, no double-bind, no multi-open.
4. **Specificity: sound.** `.draft-dialog-actions button:not(.primary-button)`
   stops the ghost rule from matching the primary button entirely, so the global
   `.primary-button` (0,1,0) applies cleanly regardless of stylesheet load order.
   A hypothetical future third non-primary button would correctly inherit the
   ghost style — acceptable semantics.
5. **Two self-reported deviations: acceptable.** disabled `#9A9A93`→`--muted`
   (see Nit — no contrast concern for disabled text); verify-c8 assertion swap is
   semantic-equivalent (see above), original intent preserved.

## Self-Review Blind Spots

- I did not run a browser; the D5 overlay's real-viewport right-anchoring and the
  Resting-shadow "paper floats" effect are asserted by CSS source only. DEV's
  qa-local report (1483px, no clip) is unre-verified by me. If a Big CR or QA
  follows, look here first — plus the narrow-viewport `max-width: calc(100vw -
  32px)` behavior on a real small screen.
- Border-lightening (#D8D8D2→#e8e8e4) is a judgment call I flagged as Should
  Watch; whether it's visually acceptable is a PO-QA call, not a code defect.

## Failure / Attack Angle

The most plausible way this lands wrong: the palette-hex guard is line-number
based, so a future edit that shifts the three whitelisted `#ffffff` lines could,
in principle, mask a newly-introduced hardcode. Mitigation is already present —
the stale-whitelist companion assertion fails when a whitelisted line stops
containing `#ffffff`, forcing a fail rather than a silent pass. A second angle:
`role="menu"` could invite a future agent to assume full ARIA keyboard semantics
exist and build on them; they don't. Neither rises to a merge blocker.

## Residual Risk

Low. No runtime data/persistence/export/print contract touched; export handlers
and their disabled gates are unchanged; the only new runtime is local menu open
state with correctly-cleaned listeners.

## Recommendation

**APPROVE.** No Must Fix. Mergeable as-is. Should Watch #1 (border lightening) is
the one item worth a glance during owner PO QA, but it reflects correct
design-system alignment and does not block merge.
