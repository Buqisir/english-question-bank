# codex-matt-governance · live state

This file is the sole authoritative live-state snapshot for this cut.
Historical relay records live in `relay-history.md` and are non-authoritative.

## Identity

- Cut id: `codex-matt-governance`
- Cut size: `large governance`
- Lifecycle state: `blocked`
- Active role: `none`
- Source branch: `codex/codex-matt-governance-live-state-migration-20260722-01`
- Current worktree: `/Users/huangxuewei/.codex/worktrees/d483/english-question-bank`
- Released input head: `fce640d2c075f3ec6c443f42d491a1bd65ba8617`

## Current evidence

- Live-state migration exact-head verification:
  `docs/cuts/codex-matt-governance/verification.md#live-state-migration-exact-head-verification--2026-07-22`
- Canonical formal re-review verdict:
  `docs/cuts/codex-matt-governance/cr.md#live-state-migration-formal-re-review--2026-07-22`
- RM activation preflight: current worktree and repository root match; the
  worktree was clean; `HEAD` and the source branch both resolved to the
  released input head.
- RM release preflight recovery: with explicit owner authorization, the prior
  local `main` commits and uncommitted workspace were preserved on
  `codex/rescue-main-pre-governance-20260722-01`; the required main checkout is
  now clean and exactly aligned with `github/main`.
- RM exact-head release check: TypeScript passed, but `verify:all` returned
  PASS 84 / SKIP 1 / FAIL 1. The sole failure is
  `verify-architecture-housekeeping.mjs`: the live-state verifier is registered
  in `verify-ci.mjs` but its `scripts/README.md` row has no `Runs in CI? = yes`
  field.

## RM stop record

- Role: `top-level fresh RM closeout only`
- Configured model: `gpt-5.6-sol`
- Thinking: `high`
- Canonical verdict: `MERGEABLE with zero unresolved Must Fix`
- Large artifact gate: `PASS 4 / FAIL 0`
- Release gate: `FAIL`
- Stop signal: `rule-conflict`
- Blocker: fixing the CI registry/documentation parity failure requires a DEV
  edit outside RM write authority; merging with a red full suite is forbidden.
- Preserved scope: no production change or write to
  `wt-applied-writing-lecture` is authorized.

## Next Action

1. Route one fresh Fix DEV for the single CI registry/documentation parity
   failure, then repeat verification, re-review, and fresh RM closeout.
