# codex-matt-governance · live state

This file is the sole authoritative live-state snapshot for this cut.
Historical relay records live in `relay-history.md` and are non-authoritative.

## Identity

- Cut id: `codex-matt-governance`
- Cut size: `large governance`
- Lifecycle state: `handoff-ready`
- Active role: `none`
- Source branch: `codex/codex-matt-governance-fix4-verification`
- Current worktree: `/Users/huangxuewei/.codex/worktrees/305a/english-question-bank`
- Released input head: `35b15ddcc9765f1cef729e7d8ec6d8af166e1e0b`

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

## Direct successor authorization

- Authorized role: `fresh verification`
- Topology: `exactly one top-level create_thread successor`
- Configured model: `gpt-5.6-terra`
- Thinking: `medium`
- Scope: `verification only; no DEV, CR verdict, QA, RM, merge, push, or production action`
- Required output: `docs/cuts/codex-matt-governance/verification.md`
- Successor first-write requirement: `set lifecycle state to active and append activation evidence`

## Next Action

1. Create exactly one top-level fresh verification successor from this result
   commit, with `gpt-5.6-terra` and `medium`, then end without waiting.
