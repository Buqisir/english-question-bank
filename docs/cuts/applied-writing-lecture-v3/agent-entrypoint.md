# applied-writing-lecture-v3 · Live Entrypoint

State: verification-complete; release-gate-non-green
Active role: none
Source branch: `codex/applied-writing-lecture-v3-20260722-01`
Worktree: Codex-managed detached worktree
Released PA result head: `e5d8dec9c76b35d581bc61e96b41681e3c7c7529`
Released PM plan-revision head: `eefa1305f326c0d25c4fcb6b5122ea8e75323051`
Released owner-approved DEV plan head:
`9f87000cc51f59b985d420471d095230fa35f02a`
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
Release evidence: after `git fetch github` on 2026-07-23,
`github/codex/applied-writing-lecture-v3-20260722-01` and worktree `HEAD`
resolved exactly to `9f87000cc51f59b985d420471d095230fa35f02a`;
the released head was an ancestor of `HEAD`, and the worktree was clean.
DEV activation evidence: after `git fetch github` on 2026-07-23,
repo root is `/Users/huangxuewei/.codex/worktrees/f8ab/english-question-bank`,
`github/codex/applied-writing-lecture-v3-20260722-01` and worktree `HEAD`
resolved exactly to released head `30625c980d78fe900cd0c4f076a0829fdb6deaba`,
that released head is an ancestor of `HEAD`, and the worktree was clean.

## Current objective

Release the counted implementation contract from the owner-approved prototype.
The packets remain SHA-256 `5618d515…b65037` and `39fd2fcd…bea35af`; DEV
transports them unchanged through the real validator and persistence path and
implements the frozen prototype contract. It may not invent teaching copy or
revise the approved visual direction.

## Must read

1. `agent-entrypoint.md`
2. `plan.md`
3. `decisions.md`
4. `spec.md`
5. `pilot-content/README.md`

## Source of truth

- Runtime baseline: `github/main@1deec0f`.
- Approved artifact archive:
  `github/codex/applied-writing-lecture-prototype-archive-20260722@f64038f`.
- Old B2 runtime, old handoff, removed worktrees, and historical CR are not
  current authorization or verification.

## Relay

- Dispatch ID: `AWL-V3-VERIFY-20260723-01`
- Current role: fresh non-implementing verification
- Output: cold-run plan-named verification against released exact head, bind
  real exit codes in `verification.md`, and record the release-gate condition.
- Configured / selected model: `gpt-5.6-terra` / `gpt-5.6-terra`
- Thinking: `medium`
- Availability source: task-creation capability list supplied `gpt-5.6-terra`
  with `medium`; no substitution; same configured family/grade.
- Verification activation evidence: after `git fetch github` on 2026-07-23,
  repo root is `/Users/huangxuewei/.codex/worktrees/f8ab/english-question-bank`;
  `github/codex/applied-writing-lecture-v3-20260722-01` and `HEAD` resolve
  exactly to released head `017164dc4697f6131747202b9a0c51b7d3593829`; that
  released head is an ancestor of `HEAD`, and the worktree is clean.
- Successor boundary: verification may create at most one direct successor only
  if live artifacts authorize it; it must not await that successor.
- Stop boundary: named escalation, changed released head, or an unauthorized
  runtime/data scope -> record `blocked`.

## Verification result

Fresh verification dispatch `AWL-V3-VERIFY-20260723-01` recorded its cold-run
against release runtime/data head `017164dc4697f6131747202b9a0c51b7d3593829`
in `verification.md`. Scope (exact 16 runtime/data files), locked packets,
restart3, CSS, payload parity, and DP-2 pass. The release gate is non-green:
the plan-named `npm -C app exec tsc -- --noEmit` exits 1, and
`pnpm -C app run verify:all` independently reports `PASS 82 / SKIP 1 / FAIL 3`
at `verify-similar-v2`, `verify-paper-assets-consistency`, and
`verify-genre-truth`. Verification repairs nothing. Per the plan's P4 route,
one fresh CR may now cold-read this exact evidence; no merge is authorized.

## Goal / slice

- Goal: close AWL-V3-01, then unlock AWL-V3-02.
- Current slice: exact counted production implementation.
- Not this slice: product-direction or teaching-copy decisions, QA, merge,
  deployment, bulk data, or AWL-V3-02.

## Allowed scope

- The exact 16 runtime/data paths in `plan.md`, plus
  `docs/cuts/applied-writing-lecture-v3/**` for DEV routing/result/verification
  artifacts.
- Branch/push/thread state needed for the one-way DEV handoff.

## Forbidden scope

- Any 17th runtime/data file without PM disposition; PaperSurface, print/export,
  student, continuation, routes/auth/production config, remaining application
  assets, and preserved archive-worktree files.
- More than one successor or any subagent used as the formal verification role.

## DEV result

DEV implementation commit: `9c2a240a1e2f30cb1a1734907d1400075c7bec6f`.
`dev-result.md` binds the exact 16-file gate and all DEV evidence. The locked
packets retain their required SHA-256 values; no forbidden scope was changed.

## Next Action

1. Dispatch exactly one fresh non-implementing verification task from this
   release-authorized head.
2. Verification re-proves the remote/release/clean activation evidence before
   its first write, records real exit codes against the released exact head in
   `verification.md`, and then exits to its own uniquely authorized successor.
