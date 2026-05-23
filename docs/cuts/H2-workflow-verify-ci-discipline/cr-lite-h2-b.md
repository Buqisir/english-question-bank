# H2-B CR-Lite — Verify / CI Discipline

Cut: H2 Workflow / Verify / CI Discipline
PR: pending
Reviewer: Codex
Date: 2026-05-23

## Changed Scope

- Documented the current GitHub Actions install state and why the workflow is
  not installed yet.
- Completed `Runs in CI?` values for existing three-column verify index tables.
- Added architecture-housekeeping checks that compare `scripts/README.md`
  against `scripts/verify-ci.mjs`.
- Recorded H2-B dev notes in the cut folder.

## Findings

- Must Fix: none.
- Should Watch: real GitHub Actions remains uninstalled until a token with
  `workflow` scope is available.

## Verification Evidence

- Static verify: `node scripts/verify-architecture-housekeeping.mjs` — 39
  passed, 0 failed.
- Stable suite: `npm run verify:all` from `app/` — passed.
- Whitespace: `git diff --check` — clean.
- Browser QA: not needed; no visible UI changed.

## Failure / Attack Angle

The main failure mode would be treating the CI template as if GitHub Actions is
already active. H2-B makes that explicit: the template exists, the install note
records `Status: Not installed.`, and the active token lacks `workflow` scope.
Future agents should not claim PR checks are enforced by GitHub Actions until
`.github/workflows/verify.yml` exists and a PR proves the workflow starts.

Another failure mode is README drift: a script could be marked `yes` but not run
by `verify-ci.mjs`, or a script could be run in the stable suite but forgotten
in the index. The new parser checks both directions.

## Residual Risk

- H2-C still needs the final cut note and handoff.
- The parser intentionally only enforces tables with a `Runs in CI?` column;
  historical two-column archive sections remain informational.

## Recommendation

- APPROVE.
