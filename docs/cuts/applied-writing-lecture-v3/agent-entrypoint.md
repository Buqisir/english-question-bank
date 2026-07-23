# applied-writing-lecture-v3 · Live Entrypoint

State: ready-for-dev
Active role: fresh PM plan-revision (releasing one fresh DEV)
Source branch: `codex/applied-writing-lecture-v3-20260722-01`
Worktree: Codex-managed detached worktree
Released PA result head: `e5d8dec9c76b35d581bc61e96b41681e3c7c7529`
Released PM plan-revision head: `eefa1305f326c0d25c4fcb6b5122ea8e75323051`
Owner-approved real-packet prototype head:
`4208c672373433b1b357228c55af1645f5ccbb7e`
Activation evidence: after `git fetch github`,
`github/codex/applied-writing-lecture-v3-20260722-01` resolved exactly to
`eefa1305f326c0d25c4fcb6b5122ea8e75323051`; that released head is an ancestor
of the current `HEAD` (which also equals it), and the worktree was clean.
Evidence: the owner personally inspected the final injected real-site prototype
and explicitly said “过关” on 2026-07-23. `plan.md` records 5/5 closed Must Fix
dispositions and zero blocking PO decisions.
Live-host evidence at that head measures the real lecture-open page as
`canvas 794 / answer 612 / rail 380` at 1470 × 719 and
`canvas 628 / answer 446 / rail 380` at 1200 × 719, with no overlap.
Successor authorization: exactly one fresh DEV from the next released exact
head; no other successor is authorized.

## Current objective

Release the counted implementation contract from the owner-approved prototype.
The packets remain SHA-256 `5618d515…b65037` and `39fd2fcd…bea35af`; DEV
transports them unchanged through the real validator and persistence path and
implements the frozen prototype contract. It may not invent teaching copy or
revise the approved visual direction.

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
- Current role: fresh PM plan-revision releasing the approved contract
- Next role: exactly one fresh DEV
- Output: revised `plan.md` dispositions plus linked decisions/spec/pilot
  content packet and live routing
- Configured / selected model: `gpt-5.6-sol` / `gpt-5.6-sol`
- Thinking: `high`
- Availability source: current Codex task-creation capability lists
  `gpt-5.6-sol` with `high`; model-routing PM route is Sol/high, no substitution
- Successor dispatch: `AWL-V3-DEV-20260723-01`; independently selected
  `gpt-5.6-terra` / `high`. The current task-creation capability lists that
  exact combination. DEV is upgraded from its Terra/medium default because
  this counted implementation is a cross-module schema, persistence,
  paper-host geometry, browser, and subset-font contract.
- One-successor boundary: PM creates exactly one fresh DEV from a newly
  released exact head, confirms activation, then exits without awaiting result
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

1. PM rechecks the two packet hashes, records the owner verdict, and releases
   a clean exact head containing 5/5 closed Must Fix dispositions and zero
   blocking PO decisions.
2. PM independently selects the DEV route, creates exactly one fresh DEV,
   confirms its activation, and exits without awaiting implementation.
