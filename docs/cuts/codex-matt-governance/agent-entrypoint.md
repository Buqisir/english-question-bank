# codex-matt-governance · agent entrypoint

## Identity

- Human name: EQB Codex × Matt 两轴协作治理定本
- Cut id: `codex-matt-governance`
- Cut size: Large governance cut
- Product/runtime impact: none; process and documentation only
- Baseline: `github/main` at `e4ae78607411d265768a0253c5c63b5f3c0d726b`
- Branch: `codex/codex-matt-governance`
- Worktree: `/Users/huangxuewei/Projects/wt-codex-matt-governance`

## Current Stage

**Fresh PA addendum closed; the sole PM plan-revision successor is active.**

The second fresh PA approved the owner-locked model-routing and one-way-relay
direction but found four executable protocol gaps: same-grade substitution is
not mechanically bounded, relay stages still admit a parent-owned subagent,
activation permits a shared-worktree writer race, and a zero-Must-Fix PA route
can leave an orphaned plan blocker. The canonical addendum is committed in
`pa.md` with zero owner decisions. No current collaboration rule, business
code, product surface, production configuration, or in-flight cut has been
changed.

## Must Read

Read no more than these five files before starting the PM plan revision:

1. `docs/cuts/codex-matt-governance/plan.md`
2. `docs/cuts/codex-matt-governance/pa.md`
3. `AGENTS.md`
4. `docs/agents/dispatch-protocols.md`
5. `docs/agents/review-levels.md`

## Background

Open only when needed to check a named conflict or artifact convention:

- `docs/agents/issue-tracker.md`
- `docs/steering/README.md`
- `docs/cuts/_templates/README.md`
- `docs/cuts/workflow-route-retire/cr.md`
- `docs/agents/case-law.md`

## Stage Contract

The next task wears only the PM plan-revision hat. It must:

1. fetch and confirm the baseline, branch, worktree, exact activated head, and
   clean state;
2. cold-read the latest plan and the addendum in canonical `pa.md`;
3. disposition AMF-1 through AMF-4 in their exact normative plan sections,
   including their observable verification clauses;
4. edit only `plan.md` plus its own machine routing/completion fields here;
5. commit the plan revision without editing `pa.md` or current rules; and
6. create exactly one fresh PA recheck successor with explicit
   `gpt-5.6-sol` + `xhigh`, propagate Auto-Next authorization, activate it with
   sole-writer ordering, then exit without waiting for its verdict.

The PM revision must not edit current rules, implement the plan, rewrite PA
findings, install or initialize skills or tracker infrastructure, touch
business code, or change the `applied-writing-lecture` worktree.

## Current Outputs

- PM contract: `docs/cuts/codex-matt-governance/plan.md`
- Initial PA: `docs/cuts/codex-matt-governance/pa.md`
- PA addendum commit: `e9e4f0e0f363e83f69bda7e88f8c96d67dad058e`
- Next artifact: AMF-1 through AMF-4 dispositions in `plan.md`

## Completed PA Dispatch

- Dispatch ID: `codex-matt-governance-pa2-20260722`
- State: `closed`
- Project: `local-8a1aff1b944a0aa921d1f6b55296afd6`
- Checkout: existing worktree
  `/Users/huangxuewei/Projects/wt-codex-matt-governance`
- Branch: `codex/codex-matt-governance`
- Expected plan head: `54dc21016414f78167faccd34a260f7464d730f0`
- Next role: `PA`
- Model: `gpt-5.6-sol`
- Thinking: `xhigh`
- Upgrade reason: Large governance cut plus contract-level Auto-Next
  model-routing law
- Prompt digest:
  `dc994dab6c2b4f30ae051d55cecaa622afdfb223d644d74c1d6ddaddc83d8092`
- Thread: `019f8a7f-7d63-79c2-a713-35d4ff35243f` (`local`)
- Bootstrap proof: worktree/branch correct; `HEAD` contained the expected plan
  head; tree clean; child acknowledged ready before activation
- Activation record: this commit; exact commit supplied in ACTIVATE message
- Output: append-only addendum in
  `docs/cuts/codex-matt-governance/pa.md`
- Result commit: `e9e4f0e0f363e83f69bda7e88f8c96d67dad058e`
- Verdict: `APPROVE WITH MUST FIX`; AMF-1 through AMF-4; zero PO decisions

## Successor Dispatch

- Dispatch ID: `codex-matt-governance-pm-revision-20260722-01`
- State: `active`
- Project: `local-8a1aff1b944a0aa921d1f6b55296afd6`
- Checkout: existing worktree
  `/Users/huangxuewei/Projects/wt-codex-matt-governance`
- Branch: `codex/codex-matt-governance`
- Expected base/head: `e9e4f0e0f363e83f69bda7e88f8c96d67dad058e`
- Next role: `PM plan revision`
- Model: `gpt-5.6-sol`
- Thinking: `high`
- Route reason: fresh PM/spec judgment is required to disposition four
  governance-contract Must Fix items; this is not DEV or review work
- Prompt digest:
  `0faa69f6b76206fa0aa1d1af13eca8a2f1380d4a6873e447c534c0d620999027`
- Source task: `019f8a7f-7d63-79c2-a713-35d4ff35243f` (`local`)
- Thread: `019f8a8a-e719-7071-acf3-3758290977cb` (`local`)
- Task entry: created with explicit `model=gpt-5.6-sol` and `thinking=high`;
  bootstrap hold respected
- Bootstrap proof: child reported exact worktree and branch, pending-dispatch
  HEAD `f3d1f2b843b82f442946825b4061825121976c10`, and only the expected
  parent-owned provisioning write; child made no edit
- Provisioning record commit:
  `92a9bb657f657c95d5f97c8702a1a0cfc5c554d8`
- Activation record: this is the predecessor's final worktree commit; ACTIVATE
  carries its exact hash, the successor re-proves that hash before its first
  write, and the predecessor performs no later worktree write
- Predecessor closure: PA result and sole successor entry are durable; PA waits
  only for activation acknowledgement and never for the PM result
- Output: `docs/cuts/codex-matt-governance/plan.md`
- Authorization: one PM plan revision plus exactly one fresh PA-recheck
  successor after durable writeback; no current-rule implementation, DEV,
  verification, CR, RM, merge, production, infrastructure, or downstream
  supervision

## Next Action

Send ACTIVATE with this final predecessor HEAD to the fresh PM plan-revision
task, then end after its activation acknowledgement. The successor owns the
next relay and follows the Stage Contract above; no ancestor task resumes and
this PA task makes no further worktree write.
