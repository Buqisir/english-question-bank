# applied-writing-lecture-v3 · Live Entrypoint

State: active
Active role: Wayfinder / PM
Source branch: `codex/applied-writing-lecture-v3-20260722-01`
Worktree: `/Users/huangxuewei/Projects/wt-applied-writing-lecture-v3`
Released input head: `1deec0fce29852556bb60e0b2fd8a1fb6075f2d4`
Evidence: `verification.md`, PM baseline
Successor authorization: none until PM contract is committed

## Current objective

Complete the production contract for the owner-approved Variant A annotation
prototype and release exactly one fresh formal PA successor. Do not implement.

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

- Dispatch ID: pending PM contract commit
- Next role: fresh formal PA
- Output: `docs/cuts/applied-writing-lecture-v3/pa.md`
- Configured / selected model: `gpt-5.6-sol` / pending availability check
- Thinking: `high`
- Availability source: current Codex task-creation capability; pending check
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

1. Verify and commit the PM contract, then move this entrypoint to
   `handoff-ready` and provision one write-held fresh formal PA.
