# applied-writing-lecture-v3 · Live Entrypoint

State: handoff-ready
Active role: none (Wayfinder / PM result committed; write authority closed)
Source branch: `codex/applied-writing-lecture-v3-20260722-01`
Worktree: `/Users/huangxuewei/Projects/wt-applied-writing-lecture-v3`
Released input head: `def933be06aa171710bfb6d012a7639e30e245e7`
Evidence: `verification.md`, PM baseline + PM contract commit
Successor authorization: exactly one fresh formal PA, dispatch
`AWL-V3-PA-20260722-01`

## Current objective

Cold-read the committed production contract in a fresh formal PA task. The
predecessor PM has no remaining write authority and no DEV is authorized.

## Must read

1. `plan.md`
2. `decisions.md`
3. `spec.md`
4. `wayfinder/map.md`
5. `pa-prompt.md`

## Source of truth

- Runtime baseline: `github/main@1deec0f`.
- Approved artifact archive:
  `github/codex/applied-writing-lecture-prototype-archive-20260722@f64038f`.
- Old B2 runtime, old handoff, removed worktrees, and historical CR are not
  current authorization or verification.

## Relay

- Dispatch ID: `AWL-V3-PA-20260722-01`
- Next role: fresh formal PA
- Output: `docs/cuts/applied-writing-lecture-v3/pa.md`
- Configured / selected model: `gpt-5.6-sol` / `gpt-5.6-sol`
- Thinking: `high`
- Availability source: current Codex task-creation capability lists
  `gpt-5.6-sol` with `high`; same authority-listed family/grade, no substitution
- One-successor boundary: PA only; no DEV dispatch from this task
- Stop boundary: named escalation or failed task creation -> record `blocked`

## Goal / slice

- Goal: close AWL-V3-01, then unlock AWL-V3-02.
- Current slice: PM contract and PA release only.
- Not this slice: runtime edits, payload edits, QA, merge, deployment, bulk data.

## Allowed scope

- `docs/cuts/applied-writing-lecture-v3/**` except `pa.md`.
- Branch/push/thread state needed for the one-way PA handoff.

## Forbidden scope

- All runtime, schema, paper-asset, production, and preserved archive-worktree
  files.
- More than one successor or any parent-owned subagent as PA.

## Next Action

1. Create exactly one fresh formal PA from this branch; successor re-proves the
   released exact HEAD, records `active` in its first commit, writes `pa.md`,
   and owns the next Auto-Next transition.
