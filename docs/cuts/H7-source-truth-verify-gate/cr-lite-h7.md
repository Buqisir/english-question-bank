# H7 CR-Lite — Source Truth + Verify Gate

Cut: H7 Source Truth + Verify Gate
PR: pending
Reviewer: Codex
Date: 2026-05-23

## Changed Scope

- `CLAUDE.md` now delegates to `AGENTS.md`.
- `AGENTS.md` declares itself as the single source for agent rules.
- `docs/agents/issue-tracker.md` distinguishes local `.scratch/`
  drafts from tracked shared truth.
- `scripts/verify-ci.mjs` runs app build/typecheck before stable
  scripts.
- `docs/ci/verify-workflow-template.yml` delegates build to
  `verify:all`.
- CI / local docs now require server dependencies before stable verify.
- Architecture housekeeping verify now guards the new rules.
- H7 cut records were added.

## Findings

- Must Fix: none.
- Should Watch:
  - `verify-ci.mjs` now runs a full Vite build, so `verify:all` is
    heavier. This is intentional for the stable gate; use narrow
    cut-specific scripts for local inner-loop checks.

## Verification Evidence

- Static verify:
  - `node scripts/verify-architecture-housekeeping.mjs` — passed, 78
    passed / 0 failed.
- Build:
  - `npm run verify:all --prefix app` — passed; app build/typecheck
    ran before stable scripts.
- Browser QA:
  - Not applicable. No visible product UI changed.
- Other:
  - `git diff --check` — passed inside `verify:all` and again after
    final record edits.

## Failure / Attack Angle

This change could fail if agents keep treating `.scratch/` as shared
truth, if future entry files start duplicating policies again, or if a
clean machine runs `verify:all` without installing server dependencies.
Architecture housekeeping now checks the most important markers, but it
cannot prove every future prose file avoids duplication. The practical
guardrail is to keep `CLAUDE.md` pointer-only, put new policy in
`AGENTS.md`, and follow `scripts/README.md` prerequisites.

## Residual Risk

- Low. Runtime behavior is untouched.
- Main residual risk is verify runtime cost from adding a build to the
  stable gate.

## Recommendation

- APPROVE
