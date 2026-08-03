# H8 Handoff — PaperSurface Host Interaction Run-Form

Cut: H8 PaperSurface Host Interaction Run-Form
Last updated: 2026-05-24
Branch: `codex/h8-run-form-verify`
PR: #117

## Current Truth

- `paperSurfaceHostInteractionReducer` is the seam under test.
- The verify script now executes reducer behavior directly.
- Static checks still guard purity, harness ownership, and forbidden
  scope.

## Completed

- Converted one high-value verify from shape-only to run-form.
- Updated docs to match the new behavior coverage.

## Still Open

- Merge / close PR #117 after review.
- Decide whether any adjacent pure seams deserve the same treatment.

## Must Not Forget

- Keep the script cut-specific.
- Do not turn H8 into a test-framework migration.
- Keep reducer behavior checks and static seam checks distinct.

## Things The Next Cut Must Know

1. Pattern: Pure reducers are better verified by execution than by
   regex.
   - Evidence: H8 now imports and calls the reducer.
   - Rule: If a module exports a pure function and the seam is stable,
     prefer run-form behavior checks over source-shape checks.

2. Pattern: Static checks still matter for seam ownership.
   - Evidence: H8 kept reducer purity and harness adapter checks.
   - Rule: Do not delete purity / adapter checks just because behavior
     coverage exists.

3. Pattern: Keep the scope one seam wide.
   - Evidence: H8 only touched the host-interaction reducer verify.
   - Rule: If the next verify needs a different seam, make that a new
     cut.

## Verify / QA State

- `node scripts/verify-paper-surface-host-interaction.mjs` — passed.
- `node scripts/verify-architecture-housekeeping.mjs` — passed.
- `npm run verify:all --prefix app` — passed.
- `git diff --check` — passed after final record edits.
- Browser QA — not applicable.

## Next Action

Commit, push, and open the PR.
