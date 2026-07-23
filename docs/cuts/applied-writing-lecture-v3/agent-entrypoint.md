# applied-writing-lecture-v3 · Live Entrypoint

State: release-authorized
Active role: none; next role is fresh fix DEV
Source branch: `codex/applied-writing-lecture-v3-20260722-01`
Released PM input head: `cdcc8f923488b57843a12f190b47746ffaa1aac3`
Released remediation contract head:
`f718add8971c46fa056a85d460f85ef00c10f8ec`
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

Implement the committed MF-1 through MF-6 remediation contract without
weakening the approved prototype, whole-payload unavailability, DP-2,
794/793 measured-canvas boundary, executable font coverage, or release gates.
The 16-file exception remains valid exactly as dispositioned in `plan.md`; no
seventeenth runtime/data file is authorized.

## Must Read

1. `agent-entrypoint.md`
2. `cr.md`
3. `plan.md`
4. `verification.md`
5. `spec.md`

## Completed fresh PM remediation route

- Dispatch ID: `AWL-V3-PM-FIX-20260723-01`
- Role: fresh PM remediation disposition; update `plan.md` and the live
  entrypoint, but do not edit runtime/data implementation.
- Configured / selected model: `gpt-5.6-sol` / `gpt-5.6-sol`.
- Thinking: `high`.
- Availability evidence: the current Codex task-creation capability lists
  `gpt-5.6-sol` with `high`; no substitution.

## Fresh fix DEV route

- Dispatch ID: `AWL-V3-FIX-DEV-20260723-01`
- Role: fresh fix DEV; implement only the six committed remediation
  dispositions, write `dev-result.md`, and do not perform verification, CR,
  QA, RM, merge, or deployment.
- Configured / selected model: `gpt-5.6-terra` / `gpt-5.6-terra`.
- Thinking: `high` (routing-table upgrade for a cross-module, six-Must-Fix,
  repeated-failure implementation).
- Availability evidence: the current Codex `create_thread` capability lists
  `gpt-5.6-terra` with `high`; same-family/same-grade primary is available, so
  no substitution.

## Hard independence boundary

- The PM **must be a newly created top-level Codex task** with a new task ID.
- **Do not use `spawn_agent`, a subagent, a fork that inherits this
  conversation, or the CR task continuing as PM.**
- The PM task owns exactly one role: fresh PM remediation disposition.
- The PM creates exactly one new top-level fix-DEV successor after durable
  writeback; it must not wait for, supervise, or continue inside that successor.
- The fix DEV owns exactly one role. After its durable result and
  `release-authorized` handoff, it may create exactly one fresh top-level
  non-implementing verification successor under the routing authority.
- If a new top-level task cannot be created with the recorded model/thinking,
  record `blocked` and stop. A subagent is never a fallback.

## Activation contract

The PM activation contract is satisfied by the evidence above and the committed
remediation contract at `f718add`. Before fix DEV's first write it must fetch
`github`, prove that the source ref contains the exact release hash supplied by
the creating PM task and `f718add`, prove its own worktree is clean, and confirm
that `plan.md` still carries all six dispositions while `verification.md`
remains non-green. Its first write changes this entrypoint to `active`, records
that evidence and its task ID, and becomes the sole writer.

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

Exactly one fresh top-level fix DEV task,
`AWL-V3-FIX-DEV-20260723-01`, is authorized from this state. The creating PM
task exits immediately after task creation. No second PM successor, subagent,
verification, CR, QA, RM, merge, or deployment is authorized from the PM task.
The fix DEV's later single verification successor is authorized only after its
own committed durable result and exact-head release record.

## Next Action

1. Create `AWL-V3-FIX-DEV-20260723-01` as one new top-level Codex task from the
   source branch with `gpt-5.6-terra` / `high`; pass the exact final routing
   commit, receive its task ID, then the PM task exits without waiting for or
   supervising the DEV result.
