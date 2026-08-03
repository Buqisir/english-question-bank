# H8 Dev Notes — PaperSurface Host Interaction Run-Form

Date: 2026-05-24
Status: implemented

## Scope

H8 is the first narrow response to the critique that many verify scripts
are shape tests instead of behavior tests. It converts one useful,
bounded seam to run-form coverage: PaperSurface host interaction state.

## Changed

- `scripts/verify-paper-surface-host-interaction.mjs` now imports
  `paperSurfaceHostInitialState` and
  `paperSurfaceHostInteractionReducer`.
- Added run-form assertions for:
  - initial state
  - question focus requests
  - support / option evidence seeding
  - evidence selection
  - insight open / close
  - structure target open / close / switch
  - rail lock and escape priority
  - viewport sync resets
  - resize reset behavior
- Kept static checks for reducer purity and harness seam ownership.
- Updated `scripts/README.md` and architecture housekeeping to describe
  the script as run-form behavior coverage.

## Behavior

No app runtime behavior changed. H8 only changes verify and docs.

## Verification

Run before reporting:

```bash
node scripts/verify-paper-surface-host-interaction.mjs
node scripts/verify-architecture-housekeeping.mjs
git diff --check
npm run verify:all --prefix app
```

Final local results:

- `node scripts/verify-paper-surface-host-interaction.mjs` — passed,
  72 passed / 0 failed.
- `node scripts/verify-architecture-housekeeping.mjs` — passed, 78
  passed / 0 failed.
- `npm run verify:all --prefix app` — passed.
- `git diff --check` — passed after final record edits.

Browser QA is not applicable.
