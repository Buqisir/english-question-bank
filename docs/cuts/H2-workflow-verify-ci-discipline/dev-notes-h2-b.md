# H2-B Dev Notes — Verify / CI Discipline

Date: 2026-05-23
Status: Implemented in PR slice H2-B

## Objective

Make the verify index, stable local CI entrypoint, and GitHub Actions install
state agree with each other.

## Scope

Changed only verification / CI discipline files:

- `scripts/README.md`
- `scripts/verify-architecture-housekeeping.mjs`
- `docs/ci/verify-workflow-install.md`
- `docs/cuts/H2-workflow-verify-ci-discipline/agent-entrypoint.md`
- `docs/cuts/H2-workflow-verify-ci-discipline/dev-notes-h2-b.md`
- `docs/cuts/H2-workflow-verify-ci-discipline/cr-lite-h2-b.md`

## Decisions

- The real workflow file is not installed yet because the active GitHub token
  lacks `workflow` scope.
- `docs/ci/verify-workflow-template.yml` remains the source template.
- `docs/ci/verify-workflow-install.md` records the install condition and exact
  path.
- `scripts/verify-architecture-housekeeping.mjs` now parses
  `scripts/README.md` and `scripts/verify-ci.mjs` to ensure CI `yes` rows and
  the stable suite cannot drift apart.

## Verification Expected

- `node scripts/verify-architecture-housekeeping.mjs` — 39 passed, 0 failed
- `npm run verify:all` from `app/` — passed
- `git diff --check` — clean

No browser QA is needed because H2-B is docs / process / verify only.
