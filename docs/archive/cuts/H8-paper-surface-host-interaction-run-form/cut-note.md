# H8 Cut Note — PaperSurface Host Interaction Run-Form

Cut: H8 PaperSurface Host Interaction Run-Form
Start date: 2026-05-24
Merge date: pending
PA rounds: 0
Big CR rounds: 0
Must Fix count: 0
Token / cost notes: local Codex cut; no external review.

## Shipped

- `verify-paper-surface-host-interaction.mjs` now runs the reducer.
- Shape-only checks were reduced to seam / purity guards.
- README and housekeeping docs now describe the script as behavior
  coverage.

## Cut Or Moved

- No reducer implementation changes.
- No broad test framework migration.
- No PaperSurface UI/runtime changes.

## Wrong Assumptions Found

- A pure reducer had been verified mostly by text matching instead of
  actual reducer execution.
- The script description in `scripts/README.md` lagged behind the new
  coverage shape.

## Rules That Prevented Rework

- Keep the seam small: one reducer, one harness, one verify script.
- Keep static checks only where they prove architecture, not behavior.

## Verify And QA

- Static verify:
  - `node scripts/verify-paper-surface-host-interaction.mjs` — passed,
    72 passed / 0 failed.
  - `node scripts/verify-architecture-housekeeping.mjs` — passed, 78
    passed / 0 failed.
- `npm run verify:all --prefix app` — passed.
- `git diff --check` — passed after final record edits.
- Browser QA:
  - Not applicable.
- PO QA:
  - Not applicable.

## Watch / Follow-Up

- Watch ledger: not needed.
- Follow-up gates:
  - If similar verify scripts still rely on grep for pure seams, convert
    them one at a time.
  - Consider a later cut for a shared lightweight test harness only if
    enough pure seams need it.

## Handoff

- Next-cut handoff: `docs/cuts/H8-paper-surface-host-interaction-run-form/handoff.md`

## Next Cut

- Pick the next highest-value pure seam and convert its verify from
  shape-only to run-form behavior.
