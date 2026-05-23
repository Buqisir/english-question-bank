# H7 Dev Notes — Source Truth + Verify Gate

Date: 2026-05-23
Status: implemented

## Scope

H7 accepts the parts of the latest external critique that are cheap,
local, and immediately useful: duplicated agent instructions, local-only
issue tracker ambiguity, and build/typecheck sitting outside the stable
verify gate.

## Changed

- Replaced `CLAUDE.md` with a short pointer to `AGENTS.md`.
- Marked `AGENTS.md` as the single source of truth for agent rules.
- Clarified that `.scratch/` is local-only scratch space and not shared
  source of truth.
- Updated `docs/agents/issue-tracker.md` to route shared decisions,
  reviews, and handoffs to tracked repo files.
- Added app build/typecheck to `scripts/verify-ci.mjs`.
- Updated the GitHub Actions template so `verify:all` owns both build
  and stable verify.
- Updated the GitHub Actions template and docs to install server
  dependencies before stable verify, because C7 validator scripts import
  `server/paper-import/validator.mjs`.
- Updated script and code-style docs for the new stable gate behavior.
- Extended `scripts/verify-architecture-housekeeping.mjs` to guard the
  new single-source and build/typecheck rules.
- Added H7 cut records.

## Accepted Critique Items

- `CLAUDE.md` no longer contradicts `AGENTS.md`.
- `.scratch/` is no longer documented as shared cross-agent truth.
- The stable cut gate now runs app build/typecheck instead of relying
  on a manually filled completion-report field.
- The future CI template now installs both app and server dependencies
  before running the stable gate.

## Deferred Critique Items

- Split `server/api.mjs` by route owner modules.
- Add runtime schemas for analysis JSON contracts.
- Convert older grep-heavy verify scripts to run-form tests in stages.
- Add unit / component tests for high-value pure modules.

## Behavior

No product behavior changed. No app runtime, server runtime, schema, or
data file changed.

## Verification

Run before reporting:

```bash
node scripts/verify-architecture-housekeeping.mjs
npm run verify:all --prefix app
git diff --check
```

Final local results:

- `node scripts/verify-architecture-housekeeping.mjs` — passed, 78
  passed / 0 failed.
- `npm run verify:all --prefix app` — passed; includes app
  build/typecheck and stable verify scripts.
- `git diff --check` — passed inside `verify:all` and again after
  final record edits.

Browser QA is not applicable because this is docs / process / verify
only.
