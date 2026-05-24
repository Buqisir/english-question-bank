# H9 Handoff — Verify / CI Credibility Hardening

Cut: H9 Verify / CI Credibility Hardening
Last updated: 2026-05-24
Branch: `main`
PR: #121, #122, #123

## Current Truth

- H9 is closed.
- The stable CI workflow is installed at `.github/workflows/verify.yml`.
- `scripts/verify-ci.mjs --list-json` is the registry source for stable
  verify membership.
- `scripts/verify-c8-draft-paper-render-model.mjs` now runs actual
  draft-render behavior against `createDraftPaperStore()`.
- Stable verify scripts that need a shared-main baseline now fall back
  safely across `github/main`, `origin/main`, and `main`.

## Completed

- Exposed the verify registry as executable output.
- Converted the draft render verify slice to run-form checks.
- Installed the real GitHub Actions workflow.
- Fixed workflow bootstrap ordering for pnpm.
- Fixed baseline reference portability for GitHub Actions.
- Updated the workflow install note to match the installed state.

## Still Open

- No H9 implementation work remains.

## Must Not Forget

- Keep workflow install notes in sync with the actual workflow file.
- Do not reintroduce `github/main` as a hard requirement in stable CI
  scripts unless the script is strictly local-only.
- Keep workflow verification and behavior verification separate.

## Things The Next Cut Must Know

1. Pattern: CI portability failures are often environment assumptions.
   - Evidence: `cache: pnpm` failed before pnpm was activated; `github/main`
     failed in GitHub Actions where only `origin/main` existed.
   - Rule: when a script must run both locally and in Actions, test both
     environments before calling it done.

2. Pattern: a real workflow beats a template note.
   - Evidence: workflow checks only started after `.github/workflows/verify.yml`
     existed in the repo.
   - Rule: docs can describe workflow install state, but they do not replace
     the installed file.

3. Pattern: a run-form verify should still stay cut-specific.
   - Evidence: the draft-render verify now exercises real HTML behavior without
     expanding into a broader test-framework migration.
   - Rule: convert one seam at a time.

## Verify / QA State

- `node scripts/verify-c8-draft-paper-render-model.mjs` — passed.
- `node scripts/verify-c7-paper-import-contracts.mjs` — passed.
- `node scripts/verify-architecture-housekeeping.mjs` — passed.
- `npm run verify:all --prefix app` — passed.
- GitHub Actions `Verify` workflow on PR #123 — passed.

## Next Action

None. H9 is complete.
