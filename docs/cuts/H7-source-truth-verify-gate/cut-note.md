# H7 Cut Note — Source Truth + Verify Gate

Cut: H7 Source Truth + Verify Gate
Start date: 2026-05-23
Merge date: pending
PA rounds: 0
Big CR rounds: 0
Must Fix count: 0
Token / cost notes: local Codex cut; no external PA / Big CR spend.

## Shipped

- `CLAUDE.md` reduced to an `AGENTS.md` pointer.
- `AGENTS.md` marked as the single source of truth for agent rules.
- `.scratch/` documented as local-only scratch space, not shared truth.
- Stable verify gate now runs app build/typecheck.
- GitHub Actions template delegates build/typecheck to `verify:all`.
- GitHub Actions template now installs server dependencies before
  stable verify.
- Architecture housekeeping verify guards the new process rules.

## Cut Or Moved

- `server/api.mjs` route splitting.
- Runtime schema validation for paper-analysis JSON.
- Broad conversion of grep-style verify scripts to run-form tests.
- Unit / component test introduction.

## Wrong Assumptions Found

- `CLAUDE.md` was still carrying copied project rules after
  `AGENTS.md` had evolved, which allowed browser QA policy to diverge.
- `.scratch/` was described like a shared issue tracker even though it
  is gitignored.
- `verify:all` sounded like a stable gate but did not itself run
  build/typecheck.
- The CI template installed only app dependencies even though stable
  verify imports server modules that depend on `server/package.json`.

## Rules That Prevented Rework

- The cut stayed docs / process / verify only.
- `scripts/verify-architecture-housekeeping.mjs` now fails if the
  single-source markers or build/typecheck gate disappear.

## Verify And QA

- Static verify:
  - `node scripts/verify-architecture-housekeeping.mjs` — passed, 78
    passed / 0 failed.
  - Full `npm run verify:all --prefix app` — passed.
  - `git diff --check` — passed inside `verify:all` and again after
    final record edits.
- Browser QA:
  - Not applicable.
- PO QA:
  - Not applicable beyond reviewing the PR text.

## Watch / Follow-Up

- Watch ledger: not needed for this process cut.
- Follow-up gates:
  - Plan a separate architecture cut for `server/api.mjs` route
    extraction.
  - Plan a separate data-contract cut for runtime schema validation.
  - Convert high-value grep-style verify scripts to run-form checks
    incrementally.

## Handoff

- Next-cut handoff: `docs/cuts/H7-source-truth-verify-gate/handoff.md`

## Next Cut

- Pick either server route extraction or runtime schema validation as a
  focused follow-up. Do not combine both.
