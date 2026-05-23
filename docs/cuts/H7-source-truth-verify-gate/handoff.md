# H7 Handoff — Source Truth + Verify Gate

Cut: H7 Source Truth + Verify Gate
Last updated: 2026-05-23
Branch: `codex/h7-source-truth-verify-gate`
PR: pending

## Current Truth

- `AGENTS.md` owns agent policy.
- `CLAUDE.md` should stay pointer-only.
- `.scratch/` is local-only and gitignored.
- `docs/cuts/<CUT>/` is the tracked home for shared cut context,
  decisions, reports, and handoffs.
- `verify:all` now includes app build/typecheck.
- Clean worktrees need both app and server dependencies before
  `verify:all`.

## Completed

- Removed duplicated agent rules from `CLAUDE.md`.
- Clarified issue tracker visibility.
- Added build/typecheck to `scripts/verify-ci.mjs`.
- Added server dependency installation to the future CI template.
- Updated docs and architecture housekeeping guardrails.

## Still Open

- PR number must be filled after opening the PR.

## Must Not Forget

- Do not add browser rules back into `CLAUDE.md`.
- Do not treat `.scratch/` as external-agent-visible state.
- Do not use `verify:all` as an inner-loop command when a narrower
  script proves the local risk.
- Do not forget `npm ci --prefix server` in clean worktrees before
  stable verify.

## Things The Next Cut Must Know

1. Pattern: Stable gate now owns build/typecheck.
   - Evidence: H7 changed `scripts/verify-ci.mjs`.
   - Rule: Completion reports should not count build/typecheck as
     proven unless `verify:all`, `npm run build --prefix app`, or an
     equivalent command actually ran.

2. Pattern: Process entry files should not duplicate `AGENTS.md`.
   - Evidence: H7 replaced contradictory `CLAUDE.md` browser guidance.
   - Rule: Put new policy in `AGENTS.md`; keep tool-specific entry files
     as pointers.

3. Pattern: Local scratch is not shared truth.
   - Evidence: H7 updated `docs/agents/issue-tracker.md`.
   - Rule: Before another agent depends on a `.scratch/` decision, copy
     it into a tracked cut file, ADR, or PR description.

4. Pattern: Stable verify depends on server modules.
   - Evidence: H7 found `verify-c7-paper-import-contracts.mjs` imports
     `server/paper-import/validator.mjs`, which needs `ajv`.
   - Rule: Clean CI / worktrees must install server dependencies before
     running `verify:all`.

## Verify / QA State

- `node scripts/verify-architecture-housekeeping.mjs` — passed, 78
  passed / 0 failed.
- `npm run verify:all --prefix app` — passed.
- `git diff --check` — passed inside `verify:all` and again after
  final record edits.
- Browser QA — not applicable.

## Next Action

Commit, push, then open PR.
