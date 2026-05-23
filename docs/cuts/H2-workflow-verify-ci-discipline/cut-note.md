# H2 Cut Note — Workflow / Verify / CI Discipline

Cut: H2 Workflow / Verify / CI Discipline
Start date: 2026-05-23
Merge date: 2026-05-23
PA rounds: 0
Big CR rounds: 0
Must Fix count: 0
Token / cost notes: No external PA / Big CR cost. Codex-only local work.

## Shipped

- PR #108: H2 goal and agent entrypoint.
- PR #109: H2-A workflow rules.
  - CR-lite failure / attack-angle requirement.
  - External review baseline and token / cost metadata expectation.
  - Watch-ledger routing for cuts with many Should Watch items.
  - Templates for CR-lite, external review, and watch ledger.
  - Architecture-housekeeping verify checks for these process artifacts.
- PR #110: H2-B verify / CI discipline.
  - `scripts/README.md` now has complete `Runs in CI?` values for the
    three-column verify tables.
  - `scripts/verify-architecture-housekeeping.mjs` now checks
    `scripts/README.md` against `scripts/verify-ci.mjs` in both directions.
  - `docs/ci/verify-workflow-install.md` records the exact GitHub Actions
    install state and workflow-scope requirement.
- H2-C closeout:
  - this Cut Note;
  - `handoff.md`;
  - `agent-entrypoint.md` updated to closed.

## Cut Or Moved

- Real GitHub Actions installation was not done in H2 because the available
  GitHub token has `repo` scope but not `workflow` scope.
- Product features were not changed.
- Server route extraction / server implementation extraction was not changed.
- Frontend component slimming was not changed.
- Design-token migration was not changed.

## Wrong Assumptions Found

- The CI workflow template existing in `docs/ci/` is not the same as CI being
  installed. The real workflow path is `.github/workflows/verify.yml`, and
  GitHub requires a token with `workflow` scope to create or update it.
- A verify index can drift in two directions:
  - README can mark a script as CI-stable while `verify-ci.mjs` does not run it.
  - `verify-ci.mjs` can run a script that README does not mark as CI-stable.
  H2-B added checks for both.
- Templates help only if process remains risk-paced. H2-A added templates, but
  the protocol still says small cuts should not become ceremony.

## Rules That Prevented Rework

- Repo-file handoff rule kept H2 context in files instead of chat.
- "One Goal does not mean one PR" allowed H2 to split into A/B/C without making
  a large process PR.
- H2 scope stayed narrow: workflow / verify / CI only.
- Static verification was used for process drift; no browser QA was invented
  for docs-only work.

## Verify And QA

- Static verify:
  - H2-A: `node scripts/verify-architecture-housekeeping.mjs` — 32 passed.
  - H2-A: `npm run verify:all` from `app/` — passed.
  - H2-B: `node scripts/verify-architecture-housekeeping.mjs` — 39 passed.
  - H2-B: `npm run verify:all` from `app/` — passed.
  - H2-C: `node scripts/verify-architecture-housekeeping.mjs` — 44 passed.
  - H2-C: `npm run verify:all` from `app/` — passed.
  - H2-C: `git diff --check` — clean.
- Browser QA:
  - Not run. H2 changed docs / process / verify only.
- PO QA:
  - Not required for visible UI; owner requested H2-C closeout directly.

## Watch / Follow-Up

- Watch ledger: not created. H2 has fewer than four open watch items.
- Follow-up gates:
  - Install `.github/workflows/verify.yml` only when a token with `workflow`
    scope is available. Use `docs/ci/verify-workflow-install.md`.
  - Do not claim GitHub Actions enforces PR checks until the real workflow file
    exists and a PR proves the workflow starts.
  - Keep small cuts lightweight; CR-lite can live in a short PR-body section for
    small changes.

## Next Cut

- H3 — Frontend Component Slimming, when the next need is
  `PaperIntelligencePaperSurfaceHarness.tsx`, `DraftPaperWorkbench.tsx`,
  panels, hooks, or scroll-sync extraction.
- H4 — Design Tokens / UI Consistency, when the next need is color, spacing,
  typography, or shared UI token adoption.
- H5 — Server Implementation Extraction, only when a product cut needs deeper
  server implementation locality.

Do not add H2-D.
