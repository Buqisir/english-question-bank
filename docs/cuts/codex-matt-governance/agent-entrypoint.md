# codex-matt-governance · live state

This file is the sole authoritative live-state snapshot for this cut.
Historical relay records live in `relay-history.md` and are non-authoritative.

## Identity

- Cut id: `codex-matt-governance`
- Cut size: `large governance`
- Lifecycle state: `active`
- Active role: `fresh verification`
- Source branch: `codex/codex-matt-governance-live-state-migration-20260722-01`
- Current worktree: `/Users/huangxuewei/.codex/worktrees/692a/english-question-bank`
- Released input head: `c59fdd57e2ce301af0e2d97c276cdad46d4d4ed2`

## Current evidence

- Migration result: `live state converged; historical relay retained separately`
- Dispatch result: `top-level task creation rejected for invalid arguments; no task was created`
- Recovery result: `task-creation arguments corrected; one verification successor re-authorized`
- Owner-approved migration contract:
  `docs/cuts/codex-matt-governance/migration-entry.md`
- Owner-approved convergence decision:
  `docs/cuts/codex-matt-governance/plan.md#owner-approved-live-state-convergence--2026-07-22`
- Legacy source preserved verbatim and excluded from routing:
  `docs/cuts/codex-matt-governance/relay-history.md`
- Machine check:
  `node scripts/verify-codex-matt-governance-live-state.mjs`

## Dispatch recovery record

- Category: `task creation argument validation`
- Attempted route: `gpt-5.6-terra` with `medium`
- Created task identity: `none`
- Fallback used: `none`
- Retry policy: `one corrected creation call only`

## Activation evidence

- Fresh verification activated for the authorized verification-only scope.

## Next Action

1. Complete the authorized fresh verification and record its exact-head evidence
   in `docs/cuts/codex-matt-governance/verification.md`.
