# applied-writing-lecture-v3 · Live Entrypoint

State: active
Active role: fresh formal PA (`AWL-V3-PA-20260722-01`)
Source branch: `codex/applied-writing-lecture-v3-20260722-01`
Worktree: Codex-managed detached worktree
Released input head: `64a6784a71b70edb23da745ca24d945982a8a6bc`
Activation evidence: `github/codex/applied-writing-lecture-v3-20260722-01`
resolved exactly to the released input head; that head was an ancestor of
worktree `HEAD`; worktree was clean after `git fetch github --prune`.
Successor authorization: pending formal PA verdict; this PA owns exactly one
Auto-Next transition.

## Current objective

Cold-read the committed production contract as the active fresh formal PA.
The predecessor PM has no remaining write authority and no DEV is authorized
until the PA verdict permits it.

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
- Current role: fresh formal PA
- Next role: pending PA verdict
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

1. Complete the formal PA cold read, write `pa.md`, and record exactly one
   eligible Auto-Next transition or a named escalation.
