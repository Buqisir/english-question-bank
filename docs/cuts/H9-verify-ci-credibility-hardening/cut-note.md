# H9 Cut Note — Verify / CI Credibility Hardening

Cut: H9 Verify / CI Credibility Hardening
Start date: 2026-05-24
Merge date: 2026-05-24
PA rounds: 0
Big CR rounds: 0
Must Fix count: 0
Token / cost notes: Codex-only goal; no external PA / Big CR cost.

## Shipped

- PR #121: exposed `scripts/verify-ci.mjs --list-json` and moved
  `scripts/verify-architecture-housekeeping.mjs` to the executable registry.
- PR #122: converted `scripts/verify-c8-draft-paper-render-model.mjs`
  from grep-only checks to run-form behavior checks against
  `createDraftPaperStore()`.
- PR #123: installed the real `.github/workflows/verify.yml` workflow,
  fixed the pnpm bootstrap ordering, and made stable verify baseline refs
  portable for GitHub Actions.
- `docs/ci/verify-workflow-install.md` now records the workflow as installed.

## Cut Or Moved

- No product behavior changes.
- No schema changes.
- No PaperSurface renderer changes.
- No print renderer implementation changes.
- No `shared/papersurface/**` changes.
- No H1 server implementation migration.
- No broad run-form expansion beyond the targeted H9 draft-render slice.

## Wrong Assumptions Found

- `actions/setup-node` with `cache: pnpm` was too early for this repo's
  workflow setup. The workflow needed explicit pnpm activation first.
- Stable verify scripts that hard-coded `github/main` were not portable to
  GitHub Actions, where the shared remote is `origin/main`.

## Rules That Prevented Rework

- Keep the workflow slice separate from verify behavior slices.
- If GitHub Actions fails in a different environment, prefer the minimal
  portability fix over adding new product surface.
- Keep run-form verification focused on the actual behavior seam.

## Verify And QA

- Static verify:
  - `node scripts/verify-c8-draft-paper-render-model.mjs` — passed.
  - `node scripts/verify-c7-paper-import-contracts.mjs` — passed.
  - `node scripts/verify-architecture-housekeeping.mjs` — passed.
  - `git diff --check` — passed.
  - `npm run verify:all --prefix app` — passed.
- Browser QA:
  - Not applicable.
- PO QA:
  - Not applicable.
- Remote verification:
  - PR #123 `verify` check passed on GitHub Actions.
  - PR #123 merged cleanly into `github/main`.

## Watch / Follow-Up

- Watch ledger: not needed.
- Follow-up gates:
  - If another verify script hard-codes `github/main`, give it the same
    `github/main -> origin/main -> main` fallback.
  - Keep workflow install notes and workflow template in sync.

## Handoff

- Next-cut handoff: `docs/cuts/H9-verify-ci-credibility-hardening/handoff.md`

## Next Cut

- No H9 implementation work remains.
