# applied-writing-lecture-v3 · Live Entrypoint

State: active
Active role: fresh PM plan-revision
Source branch: `codex/applied-writing-lecture-v3-20260722-01`
Worktree: Codex-managed detached worktree
Released PA result head: `e5d8dec9c76b35d581bc61e96b41681e3c7c7529`
Released PM plan-revision head: `eefa1305f326c0d25c4fcb6b5122ea8e75323051`
Activation evidence: after `git fetch github`,
`github/codex/applied-writing-lecture-v3-20260722-01` resolved exactly to
`eefa1305f326c0d25c4fcb6b5122ea8e75323051`; that released head is an ancestor
of the current `HEAD` (which also equals it), and the worktree was clean.
Evidence: `pa.md` (`APPROVE WITH MUST FIX`; 5 unresolved Must Fix; 3
blocking PO decisions)
Successor authorization: exactly one fresh PM plan-revision, dispatch
`AWL-V3-PM-REV-20260722-01`

## Current objective

Revise the production contract to close every formal-PA disposition. DEV is
forbidden until the PM plan revision records 5/5 closed Must Fix items and
zero blocking PO decisions.

## Must read

1. `agent-entrypoint.md`
2. `pa.md`
3. `plan.md`
4. `decisions.md`
5. `spec.md`

## Source of truth

- Runtime baseline: `github/main@1deec0f`.
- Approved artifact archive:
  `github/codex/applied-writing-lecture-prototype-archive-20260722@f64038f`.
- Old B2 runtime, old handoff, removed worktrees, and historical CR are not
  current authorization or verification.

## Relay

- Dispatch ID: `AWL-V3-PM-REV-20260722-01`
- Current role: fresh PM plan-revision
- Next role: unresolved until the PA disposition and PO-decision gates close
- Output: revised `plan.md` dispositions plus linked decisions/spec/pilot
  content packet and live routing
- Configured / selected model: `gpt-5.6-sol` / `gpt-5.6-sol`
- Thinking: `high`
- Availability source: current Codex task-creation capability lists
  `gpt-5.6-sol` with `high`; model-routing PM route is Sol/high, no substitution
- One-successor boundary: PM plan-revision only; no DEV dispatch from this PA
- Stop boundary: named escalation or failed task creation -> record `blocked`

## Goal / slice

- Goal: close AWL-V3-01, then unlock AWL-V3-02.
- Current slice: formal PA result and PM plan-revision release only.
- Not this slice: runtime edits, payload edits, QA, merge, deployment, bulk data.

## Allowed scope

- PM plan-revision may edit only `docs/cuts/applied-writing-lecture-v3/**`
  except canonical `pa.md`.
- Branch/push/thread state needed for the one-way PM handoff.

## Forbidden scope

- All runtime, schema, paper-asset, production, and preserved archive-worktree
  files.
- More than one successor or any subagent used as the formal PM role.

## Next Action

1. PM plan-revision closes all five PA dispositions and all three blocking PO
   decisions, or durably records a human-decision pause. DEV remains forbidden
   until both counts are zero.
