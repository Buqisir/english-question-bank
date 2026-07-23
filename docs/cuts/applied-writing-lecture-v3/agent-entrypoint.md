# applied-writing-lecture-v3 · Live Entrypoint

State: active
Active role: fresh PM remediation disposition
Source branch: `codex/applied-writing-lecture-v3-20260722-01`
Released PM input head: `cdcc8f923488b57843a12f190b47746ffaa1aac3`
Runtime/data review head: `017164dc4697f6131747202b9a0c51b7d3593829`
Baseline: `github/main@1deec0fce29852556bb60e0b2fd8a1fb6075f2d4`
Evidence: `cr.md`, `verification.md`, `dev-result.md`, and the diff from
baseline to the runtime/data review head.
Activation evidence (2026-07-23): fetched `github`; remote source head is
`8e2819b269a391d0da4a9ce369b8469696de4dad`; released CR input
`43703387e4edce5790753250f19b1401ef6a10bb` is its ancestor; the allowed
runtime/data paths have no diff from
`017164dc4697f6131747202b9a0c51b7d3593829` to the remote source head; the CR
worktree was clean before this activation write.
Fresh CR result (2026-07-23): `cr.md` records **NOT MERGEABLE** with six
unresolved Must Fix findings. The original verification remains non-green.
No QA, RM, merge, or deployment is authorized by this CR.
PM remediation activation evidence (2026-07-23): fetched `github`; remote
source head and live handoff commit are
`e49316b1d638c281bd189c85039d74f7f481a24e`; released PM input
`cdcc8f923488b57843a12f190b47746ffaa1aac3` is its ancestor; this PM worktree
was clean before the activation write; `cr.md` still records exactly six
unresolved Must Fix findings (MF-1 through MF-6).

## Current objective

Disposition all six fresh-CR Must Fix findings into a bounded remediation
contract. Decide whether the existing 16-file exception still holds, update the
plan and live route, then release exactly one fresh fix DEV. Do not implement
the fixes in the PM task.

## Must Read

1. `agent-entrypoint.md`
2. `cr.md`
3. `plan.md`
4. `verification.md`
5. `spec.md`

## Fresh PM remediation route

- Dispatch ID: `AWL-V3-PM-FIX-20260723-01`
- Role: fresh PM remediation disposition; update `plan.md` and the live
  entrypoint, but do not edit runtime/data implementation.
- Configured / selected model: `gpt-5.6-sol` / `gpt-5.6-sol`.
- Thinking: `high`.
- Availability evidence: the current Codex task-creation capability lists
  `gpt-5.6-sol` with `high`; no substitution.

## Hard independence boundary

- The PM **must be a newly created top-level Codex task** with a new task ID.
- **Do not use `spawn_agent`, a subagent, a fork that inherits this
  conversation, or the CR task continuing as PM.**
- The new task owns exactly one role: fresh PM remediation disposition.
- The PM may create at most one new top-level fix-DEV successor after durable
  writeback; it must not wait for, supervise, or continue inside that successor.
- If a new top-level task cannot be created with the recorded model/thinking,
  record `blocked` and stop. A subagent is never a fallback.

## Activation contract

Before the PM's first write it must fetch `github`, prove that the source ref
contains the released PM input head, prove its worktree is clean, and confirm
that `cr.md` still has six unresolved Must Fix findings. Its first write changes
this entrypoint to `active` and records that evidence.

## Required PM dispositions

1. Map each CR MF-1 through MF-6 to an exact plan change, allowed file, and
   executable acceptance check.
2. Preserve the locked prototype and packet contracts; do not shrink a Must Fix
   by weakening DP-2, whole-payload unavailability, geometry, or release gates.
3. Decide whether the remediation remains within the existing 16 runtime/data
   files. Any seventeenth runtime/data file requires an explicit size-gate
   disposition before DEV.
4. Preserve the original verification as non-green and require a new fresh
   exact-head verification after remediation.
5. Release one fresh fix DEV only after the dispositions are committed.

## Successor authorization

Exactly one fresh top-level PM task,
`AWL-V3-PM-FIX-20260723-01`, is authorized. No DEV, verification, QA, RM,
merge, deployment, subagent, or second successor is authorized from this state.

## Next Action

1. Create `AWL-V3-PM-FIX-20260723-01` as one new top-level Codex task from the
   source branch with `gpt-5.6-sol` / `high`; receive its task ID, then this CR
   task exits without waiting for the PM result.
