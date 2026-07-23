# applied-writing-lecture-v3 · Live Entrypoint

State: handoff-ready
Active role: none
Source branch: `codex/applied-writing-lecture-v3-20260722-01`
Released CR input head: `43703387e4edce5790753250f19b1401ef6a10bb`
Runtime/data review head: `017164dc4697f6131747202b9a0c51b7d3593829`
Baseline: `github/main@1deec0fce29852556bb60e0b2fd8a1fb6075f2d4`
Evidence: `verification.md`, `dev-result.md`, and the diff from baseline to the
runtime/data review head.

## Current objective

Cold-review the exact 16-file application-writing lecture v3 implementation.
The approved prototype and locked packets are contracts, not suggestions.
No merge, QA pass, or deployment is authorized by this handoff.

## Must Read

1. `agent-entrypoint.md`
2. `plan.md`
3. `pa.md`
4. `verification.md`
5. `spec.md`

## Fresh CR route

- Dispatch ID: `AWL-V3-CR-20260723-01`
- Role: fresh CR; write `cr.md`.
- Configured / selected model: `gpt-5.6-sol` / `gpt-5.6-sol`.
- Thinking: `high`.
- Availability evidence: the current Codex task-creation capability lists
  `gpt-5.6-sol` with `high`; no substitution.
- Review depth: routine fresh CR, not Big CR unless the reviewer records a
  concrete escalation trigger.

## Hard independence boundary

- The CR **must be a newly created top-level Codex task** with a new task ID.
- **Do not use `spawn_agent`, a subagent, a fork that inherits this
  conversation, or the current task acting as reviewer.**
- The new task owns exactly one role: fresh CR. It has no DEV or verification
  history beyond the committed repo artifacts it cold-reads.
- The CR may create at most one new top-level successor after durable writeback;
  it must not wait for, supervise, or continue inside that successor.
- If a new top-level task cannot be created with the recorded model/thinking,
  record `blocked` and stop. A subagent is never a fallback.

## Activation contract

Before the CR's first write it must fetch `github`, prove that the source ref
contains the released CR input head, prove that the runtime/data tree is
unchanged after the runtime/data review head, and prove its worktree is clean.
Its first write changes this entrypoint to `active` and records that evidence.

## Required attack angles

1. Read the actual baseline diff and enforce the exact 16-file runtime/data
   scope plus all forbidden boundaries in `plan.md`.
2. Treat the original verification as non-green. Judge the later environment
   diagnosis in `verification.md`; do not relabel it green from prose.
3. Inspect the two OFL trailing-whitespace findings from
   `git diff --check <baseline>..<review-head>`.
4. Attack publish/persistence symmetry, whole-payload unavailability,
   continuation/export isolation, prototype-visible-unit fidelity, the
   794/793 canvas boundary, and whether the DP-2 assertions can really fail.
5. Do not fix code. Record every blocking defect as a `Must Fix` in `cr.md`.

## Successor authorization

Exactly one fresh top-level CR task is authorized. No other task, role,
subagent, merge, QA, RM, or deployment is authorized from this state.

## Next Action

1. Create `AWL-V3-CR-20260723-01` as one new top-level Codex task from the
   source branch with `gpt-5.6-sol` / `high`; receive its task ID, then this
   task exits without waiting for the CR result.
