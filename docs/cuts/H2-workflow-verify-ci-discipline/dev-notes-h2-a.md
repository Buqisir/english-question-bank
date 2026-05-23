# H2-A Dev Notes — Workflow Rules

Date: 2026-05-23
Status: Implemented in PR slice H2-A

## Objective

Turn the H2 workflow rules into reusable repo artifacts without changing
product behavior.

## Scope

Changed only workflow / template / verification files:

- `.kiro/steering/cut-workflow-protocol.md`
- `docs/cuts/_templates/agent-entrypoint.md`
- `docs/cuts/_templates/cut-note.md`
- `docs/cuts/_templates/cr-lite.md`
- `docs/cuts/_templates/external-review-report.md`
- `docs/cuts/_templates/watch-ledger.md`
- `docs/cuts/H2-workflow-verify-ci-discipline/agent-entrypoint.md`
- `docs/cuts/H2-workflow-verify-ci-discipline/dev-notes-h2-a.md`
- `scripts/verify-architecture-housekeeping.mjs`

## Rules Made Executable

- CR-lite must include a failure / attack-angle paragraph.
- External PA / Big CR reports should include reviewed baseline and token /
  cost metadata when available.
- More than three Should Watch items should move to a watch ledger.
- Templates now exist for CR-lite reports, external review reports, and watch
  ledgers.
- H2 remains workflow / verify / CI discipline only; product, server runtime,
  frontend UI, DB, and paper data are still forbidden.

## Verification Expected

- `node scripts/verify-architecture-housekeeping.mjs` — 32 passed, 0 failed
- `npm run verify:all` from `app/` — passed
- `git diff --check` — clean

No browser QA is needed because H2-A is docs / process only.
