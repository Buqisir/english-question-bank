# codex-matt-governance · live state

This file is the sole authoritative live-state snapshot for this cut.
Historical relay records live in `relay-history.md` and are non-authoritative.

## Identity

- Cut id: `codex-matt-governance`
- Cut size: `large governance`
- Lifecycle state: `active`
- Active role: `RM`
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

## Active RM authority

- Role: `top-level fresh RM closeout only`
- Configured model: `gpt-5.6-sol`
- Thinking: `high`
- Canonical verdict: `MERGEABLE with zero unresolved Must Fix`
- Allowed writes: `cut-note.md`, RM closeout routing state, and compact
  `docs/STATUS.md` at closeout.
- Required gates: verify remote and baseline state, create the large-cut Cut
  Note, run the artifact gate and any exact-head release checks, merge through
  the authorized main-checkout route, confirm post-merge `main` CI, and close
  the cut without a successor.
- Forbidden actions: DEV fixes, subagent or fork succession, production
  configuration changes, and any change to `wt-applied-writing-lecture`.

## Next Action

1. Complete the repository-required Large-cut RM closeout, then record the
   terminal `closed` state with no successor.
