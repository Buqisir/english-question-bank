# applied-writing-lecture-v3 · Live Entrypoint

State: human-decision
Active role: fresh PM plan-revision (write-held except owner-decision record)
Source branch: `codex/applied-writing-lecture-v3-20260722-01`
Worktree: Codex-managed detached worktree
Released PA result head: `e5d8dec9c76b35d581bc61e96b41681e3c7c7529`
Released PM plan-revision head: `eefa1305f326c0d25c4fcb6b5122ea8e75323051`
Real-packet owner-review head:
`cc10f2b182e21fc322b0fdf75aedb638e5de803c`
Activation evidence: after `git fetch github`,
`github/codex/applied-writing-lecture-v3-20260722-01` resolved exactly to
`eefa1305f326c0d25c4fcb6b5122ea8e75323051`; that released head is an ancestor
of the current `HEAD` (which also equals it), and the worktree was clean.
Evidence: `plan.md` records 4/5 closed Must Fix dispositions and one remaining
blocking PO decision: owner personal visual “过关” on both views of both exact
packets injected into the real local `PaperBrowsePage`.
Live-host evidence at that head measures the real lecture-open page as
`canvas 794 / answer 612 / rail 380` at 1470 × 719 and
`canvas 628 / answer 446 / rail 380` at 1200 × 719, with no overlap.
Successor authorization: none while human decision is pending; fresh DEV is
forbidden.

## Current objective

Wait for the owner to inspect 2022 / 2024 in both real-site browser tabs,
switch each paper between `① 审题要点` and `② 亮点句式`, and explicitly say
“过关”. The packets remain SHA-256 `5618d515…b65037` and
`39fd2fcd…bea35af`; machine `5/5` / `4/4` is precheck only. DEV is forbidden
until PM records the owner verdict, 5/5 closed Must Fix items, and zero blocking
PO decisions.

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
- Current role: fresh PM plan-revision in owner-visual-review pause
- Next role: owner PO visual prototype verdict; then one fresh DEV only if the
  owner says “过关” and the counts become 5/5 and zero
- Output: revised `plan.md` dispositions plus linked decisions/spec/pilot
  content packet and live routing
- Configured / selected model: `gpt-5.6-sol` / `gpt-5.6-sol`
- Thinking: `high`
- Availability source: current Codex task-creation capability lists
  `gpt-5.6-sol` with `high`; model-routing PM route is Sol/high, no substitution
- One-successor boundary: create no task while paused; after approval, PM may
  create exactly one fresh DEV from a newly released exact head
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

1. Owner inspects the two prepared real-site browser tabs, switches each paper
   between `① 审题要点` and `② 亮点句式`, and says whether it passes. The
   temporary injection is marked in the real lecture rail and refresh restores
   the untouched site.
2. PM records the visual verdict and re-runs packet hashes/contracts. Only at
   5/5 and zero may it independently route and Auto-Next to one fresh DEV.
