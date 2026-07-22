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

**Topology recovery checkpoint is recorded; one top-level fresh formal
re-review is the sole next action.**

The manual-fallback Fix DEV 3 task and its mistakenly spawned verification
subagent are write-closed. The verification subagent completed valid exact-head
evidence at `dae33f802707806f757aac4a55240a0d34ada985`. Its recursively spawned
re-review subagent was interrupted before its first write, produced no verdict
or repository change, and is not a legal Auto-Next successor. The current
visible top-level task owns only this recovery checkpoint and the creation of
one independently addressable top-level fresh formal re-review; it will not
wait for that review result.

Canonical `cr.md` recorded unresolved R1-R3; Fix DEV 3 implemented the bounded
repair at `b1169a6978aef1e475360b725a8bd96265ef3a39`, restored normal
dependencies, and passed fresh exact-head verification. The next top-level task
owns formal re-review only. No implementation, QA, RM, merge, push, production,
workflow/script edit, skill/plugin/tracker, main-checkout, or
applied-writing-lecture action is authorized in that review task.

## Must Read

Before formal re-review, read these current inputs:

1. `docs/cuts/codex-matt-governance/cr.md`
2. `docs/cuts/codex-matt-governance/plan.md`
3. `AGENTS.md`
4. `docs/agents/model-routing.md`
5. `docs/steering/codex-matt-workflow.md`
6. `docs/cuts/codex-matt-governance/verification.md`

Before editing any other allowed current-rule surface, read that target's
current contents. Background files remain conditional rather than session tax.

## Background

Open only when needed to check a named conflict or artifact convention:

- `docs/agents/issue-tracker.md`
- `docs/steering/README.md`
- `docs/cuts/_templates/README.md`
- `docs/cuts/workflow-route-retire/cr.md`
- `docs/agents/case-law.md`

## Stage Contract

The next task wears only the fresh no-DEV-history formal re-review hat. After
exact-HEAD activation, it must:

1. re-prove the baseline, branch, worktree, released exact head, and clean
   state, then durably record its own activation before any substantive write;
2. cold-read the Fix DEV 3 diff, canonical plan and CR history, and the fresh
   exact-head evidence without inheriting any DEV conversation;
3. append the formal verdict to canonical `cr.md`; if Must Fix remains, create
   one top-level fix DEV successor, otherwise create one top-level RM successor;
4. end after the unique successor is durably created and started, without
   waiting for its result.

The task must not implement, perform QA/RM, merge, push, production,
workflow/script edits, skill/plugin/tracker work, main-checkout edits, or
changes to the `applied-writing-lecture` worktree. A subagent may not be its
successor or create any later relay task.

## Current Outputs

- PM contract: `docs/cuts/codex-matt-governance/plan.md`
- Initial PA: `docs/cuts/codex-matt-governance/pa.md`
- PA addendum commit: `e9e4f0e0f363e83f69bda7e88f8c96d67dad058e`
- PM revision commit: `ff7d2b39e21a54c13d27b96f258001b98667ebc6`
- Fresh PA recheck commit:
  `3889d67099c6211daa5cbbb79cb93bf49e4e5cc6`
- Fresh PA recheck verdict: `APPROVE`; zero unresolved Must Fix; zero PO
  decisions
- DEV implementation: `113db39f8119536e27aa4344f4bfcdfdbd7d3365`
- Verification evidence: `docs/cuts/codex-matt-governance/verification.md`
- Formal CR result commit: `64fafef0c5c6bbb913bc4c721535950fc76250ba`
- Formal CR verdict: `NOT MERGEABLE`; five unresolved Must Fix findings
- Current artifact: fresh exact-head verification of Fix DEV 3 result

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
- State: `closed`
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
- Result commit: `ff7d2b39e21a54c13d27b96f258001b98667ebc6`
- Result: AMF-1 through AMF-4 dispositioned; DP-3/readiness made derived
  without pre-approving PA
- Closure: the PM result and sole PA-recheck successor are durable; after the
  final release-authorizing commit below this PM makes no later worktree write
- Authorization: one PM plan revision plus exactly one fresh PA-recheck
  successor after durable writeback; no current-rule implementation, DEV,
  verification, CR, RM, merge, production, infrastructure, or downstream
  supervision

## PA Recheck Dispatch

- Dispatch ID: `codex-matt-governance-pa3-20260722-01`
- State: `closed`
- Project: `local-8a1aff1b944a0aa921d1f6b55296afd6`
- Checkout: existing worktree
  `/Users/huangxuewei/Projects/wt-codex-matt-governance`
- Branch: `codex/codex-matt-governance`
- Expected base/head: `ff7d2b39e21a54c13d27b96f258001b98667ebc6`
- Pending-dispatch commit:
  `9516f6b5283147dbc4763d297cd160bb39dba7fe`
- Next role: `PA recheck`
- Configured model: `gpt-5.6-sol`
- Selected model: `gpt-5.6-sol`
- Thinking: `xhigh`
- Upgrade reason: Large contract-level governance PA recheck
- Availability/substitution evidence: requested model and `xhigh` are exposed
  by the current task-creation capability; no substitution
- Prompt digest:
  `7c08f2e51abe76cebe68c027529e3adbbe881f20b5cb7f7840b20d49902d7784`
- Predecessor task: `019f8a8a-e719-7071-acf3-3758290977cb` (`local`)
- Thread: `019f8a93-3c06-7a92-9980-058fd205b1f8` (`local`)
- Task entry: created as one independently addressable fresh Codex task with
  explicit `model=gpt-5.6-sol` and `thinking=xhigh`; write-held bootstrap active
- Creation evidence: the first API call was rejected before creation for an
  invalid argument shape; the one bounded corrected retry returned the thread
  above, so no ambiguous or duplicate task exists
- Bootstrap proof: successor reported exact worktree and branch, clean status,
  pending-dispatch HEAD
  `9516f6b5283147dbc4763d297cd160bb39dba7fe`, and that it read only this
  entrypoint; successor remains write-held
- Provisioning record commit:
  `1561b172ce8a49c9c7c47addb4eeab32f145f48f`
- Release record: this is the predecessor's final worktree commit; the
  ACTIVATE/RELEASE message carries its exact hash, and the predecessor performs
  no later worktree write
- Released predecessor-final HEAD:
  `9974a5c52fbc521956303ae388568d497458c2bb`
- Activation proof: successor re-proved the exact worktree, branch
  `codex/codex-matt-governance`, released predecessor-final HEAD above, and a
  clean state before its first permitted write
- Sole-writer state: acquired; predecessor is write-closed and this PA recheck
  is the only active writer in the shared worktree
- Activation record:
  `921287aadbbecec8b292fa303e0b4fc2a40d8bec`
- Result commit: `3889d67099c6211daa5cbbb79cb93bf49e4e5cc6`
- Verdict: `APPROVE`; zero unresolved Must Fix; zero PO decisions
- Role result state: `result-recorded`; the canonical verdict commit above is
  the exact result bound to DEV readiness
- Role completion: closed by this predecessor-final commit; the PA performs no
  later worktree write and waits only for its direct successor's activation
  acknowledgement
- Output: append-only recheck in
  `docs/cuts/codex-matt-governance/pa.md`
- Authorization: one PA recheck plus exactly one in-scope direct successor
  after durable writeback; no implementation by PA, current-rule edit,
  verification, CR, QA, RM, merge, production, infrastructure, or downstream
  supervision

## DEV Dispatch

- Dispatch ID: `codex-matt-governance-dev-20260722-01`
- State: `closed`
- Project: `local-8a1aff1b944a0aa921d1f6b55296afd6`
- Checkout: existing worktree
  `/Users/huangxuewei/Projects/wt-codex-matt-governance`
- Branch: `codex/codex-matt-governance`
- Expected base/head:
  `3889d67099c6211daa5cbbb79cb93bf49e4e5cc6`
- Pending-dispatch commit:
  `24b156d0cb863615c168d483f8f56c0de07ad3fe`
- Next role: `DEV`
- Configured model: `gpt-5.6-terra`
- Selected model: `gpt-5.6-terra`
- Thinking: `medium`
- Route reason: ordinary docs-only governance implementation; no complex or
  repeated-failure upgrade trigger
- Bootstrap authority: owner-locked exception from canonical `plan.md` and the
  PA verdict above because `docs/agents/model-routing.md` does not exist yet;
  DEV must create that authority and may not generalize this exception
- Availability/substitution evidence: requested model and `medium` are exposed
  by the current task-creation capability; no substitution
- Prompt-template digest:
  `03877359e7e330c8e7230a9ac89697eee0fdc72e49c6df14f61df506aa1b3340`
- Digest scope: stable DEV prompt template with a
  `<PENDING_DISPATCH_HEAD>` placeholder; the exact commit from this record is
  supplied in the creation call
- Predecessor task: `019f8a93-3c06-7a92-9980-058fd205b1f8` (`local`)
- Thread: `019f8a99-4647-7d61-92c7-3cba63e1d613` (`local`)
- Task entry: created as one independently addressable fresh Codex task with
  explicit `model=gpt-5.6-terra` and `thinking=medium`; write-held bootstrap
  active
- Bootstrap proof: successor reported exact worktree and branch, current HEAD
  `5655b115bc0b4b91f19855973046b9fcb4f05a42`, ancestor pending-dispatch commit
  `24b156d0cb863615c168d483f8f56c0de07ad3fe`, clean state, entrypoint-only read,
  and no successor edit
- Provisioning record commit:
  `5655b115bc0b4b91f19855973046b9fcb4f05a42`
- Release record: predecessor-final worktree commit
  `be9f9c9e37330fcc4906ee5f0ec2e373f4d1744b`; ACTIVATE/RELEASE carried this
  exact hash, and the PA performs no later worktree write
- Activation proof: DEV re-proved the exact worktree, branch
  `codex/codex-matt-governance`, released predecessor-final HEAD above, and a
  clean state before its first permitted write
- Sole-writer state: acquired; predecessor is write-closed and this DEV is the
  only active writer in the shared worktree
- Activation record: `b8129bea0dbbb45e6f80f4c567b9ce4a10d2ae05`
- Result commit: `113db39f8119536e27aa4344f4bfcdfdbd7d3365`
- DEV self-check: `git diff --check` passed before the implementation commit;
  the changed-path list contained only allowlisted collaboration-rule and
  documentation surfaces. Formal verification is intentionally delegated.
- Predecessor closure: canonical PA result and the sole DEV successor entry are
  durable; this PA waits only for the successor's durable activation
  acknowledgement and never for the DEV result
- Output: implementation limited to `plan.md`'s allowed collaboration-rule and
  documentation surfaces
- Authorization: one DEV task plus exactly one fresh non-implementing
  verification successor after durable DEV writeback; no formal verification,
  CR, QA, RM, merge, push, production, infrastructure, or downstream
  supervision by DEV

## Verification Dispatch

- Dispatch ID: `codex-matt-governance-verification-20260722-01`
- State: `closed`
- Project: `local-8a1aff1b944a0aa921d1f6b55296afd6`
- Checkout: existing worktree
  `/Users/huangxuewei/Projects/wt-codex-matt-governance`
- Branch: `codex/codex-matt-governance`
- Expected base/head: `113db39f8119536e27aa4344f4bfcdfdbd7d3365`
- Next role: fresh non-implementing verification
- Configured model: `gpt-5.6-terra`
- Selected model: `gpt-5.6-terra`
- Thinking: `medium`
- Route reason: exact-head verification evidence; model-routing default
- Availability/substitution evidence: configured primary selected; same-family,
  same-grade finite eligibility set is `[gpt-5.6-terra]`; no substitution
- Thread: `019f8a9d-c684-7fa2-beec-eb50a4988e87` (`local`)
- Task entry: created as one independently addressable fresh Codex task with
  explicit `model=gpt-5.6-terra` and `thinking=medium`; write-held bootstrap
  active
- Bootstrap proof: successor reported the exact worktree and branch, pending
  dispatch HEAD `10c40442423fdd7e3c950f8e2aea695b136a72c6`, clean state, and
  entrypoint-only read; it remains write-held
- Released predecessor-final HEAD:
  `ca088dec014b39dc3024fc5b304fca2a8a997310`
- Activation proof: exact worktree, branch `codex/codex-matt-governance`,
  released predecessor-final HEAD above, and a clean state re-proved before
  the first permitted write
- Sole-writer state: acquired; predecessor is write-closed and verification is
  the only active writer in the shared worktree
- Activation record: `2f9bb8dc2d52a203b89d80135f1f4789c7e66a99`
- Output: `docs/cuts/codex-matt-governance/verification.md`
- Result commit: `65017c22152b309e989ea80d867035a6e69c3d6a`
- Result: verification evidence recorded; one fresh no-DEV-history CR successor
  was created
- Role completion: closed by predecessor-final release commit
  `8181f22abe128b306f66d9522787e5556685d125`; verification made no later
  worktree write and did not wait for the CR result
- Authorization: exactly one fresh no-DEV-history CR successor after durable
  verification writeback; no implementation, CR verdict, QA, RM, merge, push,
  production, or downstream supervision by verification

## CR Dispatch

- Dispatch ID: `codex-matt-governance-cr-20260722-01`
- State: `closed`
- Project: `local-8a1aff1b944a0aa921d1f6b55296afd6`
- Checkout: fresh isolated worktree from branch `codex/codex-matt-governance`
- Expected base/head: `65017c22152b309e989ea80d867035a6e69c3d6a`
- Next role: fresh formal CR; no DEV history
- Configured model: `gpt-5.6-sol`
- Selected model: `gpt-5.6-sol`
- Thinking: `high`
- Route reason: formal fresh CR route from `docs/agents/model-routing.md`
- Availability/substitution evidence: configured primary selected; same-family,
  same-grade finite eligibility set is `[gpt-5.6-sol]`; no substitution
- Client task ID: `client-new-thread:0949e3eb-6e99-4957-8a2a-56b7762d540a`
- Host: `local`
- Thread: `019f8aa0-ba65-7cb2-b2ce-595e236392dc` (`local`)
- Bootstrap proof: successor reported its provisioned worktree, detached HEAD
  `27685c0ab3c32e2e8281a9de779e99283e1c9f4d`, clean state, and entrypoint-only
  read; no edit was made and it remains write-held
- Release record: this is the predecessor's final worktree commit. The
  ACTIVATE/RELEASE message carries its exact hash; verification makes no later
  worktree write and exits after the activation acknowledgement
- Predecessor closure: verification evidence and the sole CR successor entry
  are durable; this verification task performs no later worktree write and
  never waits for the CR result
- Released predecessor-final HEAD:
  `8181f22abe128b306f66d9522787e5556685d125`
- Activation proof: exact isolated worktree root, detached released HEAD above,
  and clean state re-proved before the first permitted write
- Sole-writer state: acquired; predecessor is write-closed and this CR is the
  only active writer in the isolated worktree
- Activation record: `aef4c427603dc12e0434f6dd8981275f57d60379`
- Reviewed DEV diff:
  `3889d67099c6211daa5cbbb79cb93bf49e4e5cc6..113db39f8119536e27aa4344f4bfcdfdbd7d3365`
- Result artifact: `docs/cuts/codex-matt-governance/cr.md`
- Verdict: `NOT MERGEABLE`; five unresolved Must Fix findings
- Role result state: `result-recorded`; exactly one fresh fix-DEV successor is
  required by the canonical verdict and the plan relay table
- Result commit: `64fafef0c5c6bbb913bc4c721535950fc76250ba`
- Role completion: closed by this predecessor-final commit; CR performs no later
  worktree write and waits only for the direct successor's durable activation
  acknowledgement, never for the fix result
- Output: `docs/cuts/codex-matt-governance/cr.md`
- Authorization: one formal CR only. No implementation, QA, RM, merge, push,
  production, or downstream supervision. On Must Fix, record the canonical CR
  verdict and create only the one fresh fix-DEV successor allowed by the plan;
  otherwise create only the one fresh RM successor.

## Fix DEV Dispatch

- Dispatch ID: `codex-matt-governance-fix-dev-20260722-01`
- State: `closed`
- Project: `local-8a1aff1b944a0aa921d1f6b55296afd6`
- Checkout: fresh isolated worktree from this exact pending-dispatch commit
- Expected base/head: `64fafef0c5c6bbb913bc4c721535950fc76250ba`
- Pending-dispatch commit: `501d1892580b2c166afc79980eceb0f045df8740`
- Next role: fresh fix DEV
- Configured model: `gpt-5.6-terra`
- Selected model: `gpt-5.6-terra`
- Thinking: `medium`
- Route reason: bounded docs-only correction of five formal-CR findings; no
  complex/cross-module/repeated-failure upgrade trigger
- Availability/substitution evidence: current Codex task creation exposes
  `gpt-5.6-terra` with `medium`; authority candidate set is
  `[gpt-5.6-terra]`; configured primary selected with no substitution
- Prompt-template digest:
  `ac134b1edb945159180b6e6126217dab7ffbcfe30d2bfa84324c821e43b865bc`
- Digest scope: stable write-held fix-DEV prompt with a
  `<PENDING_DISPATCH_HEAD>` placeholder; the exact commit is supplied at task
  creation
- Client task ID: `client-new-thread:afefbe81-4e9d-4d7b-be9a-7e2e461f3b1f`
- Host: `local`
- Thread: `019f8aab-cc40-7e70-9698-f4f71141aa7b` (`local`)
- Task entry: created as exactly one independently addressable fresh Codex task
  with explicit `model=gpt-5.6-terra` and `thinking=medium`; write-held
  bootstrap remains active
- Bootstrap proof: successor reported isolated worktree
  `/Users/huangxuewei/.codex/worktrees/167f/english-question-bank`, detached
  pending-dispatch HEAD `501d1892580b2c166afc79980eceb0f045df8740`, clean
  state, and entrypoint-only read; no successor edit was made
- Release record: this is the CR predecessor's final worktree commit. The
  ACTIVATE/RELEASE message carries its exact hash; CR makes no later worktree
  write and exits after activation acknowledgement
- Predecessor closure: the canonical CR verdict and sole fix-DEV successor entry
  are durable; CR never waits for or collects the fix result
- Released predecessor-final HEAD:
  `7de771587ef02eef9aadac1acb4ac6bb87d012c7`
- Activation proof: exact isolated worktree root, detached released HEAD above,
  and clean state re-proved before the first permitted write
- Sole-writer state: acquired; predecessor is write-closed and this fix DEV is
  the only active writer in the isolated worktree
- Activation record: `a13a501ccc913d4c19a89af09d586b27d24d7ee9`
- DEV self-check: `git diff --check` passed; the targeted current-positive
  conflict scan returned zero matches; lifecycle-template fields and QA resume
  text were confirmed present. `bash scripts/setup-worktree.sh` restored the
  normal dependencies. Formal exact-head verification remains delegated to the
  required fresh verification successor.
- Result commit: `49a3da95f72122ebaae8b80541f3a17cfd9b59e4`
- Verification successor dispatch ID:
  `codex-matt-governance-fix-verification-20260722-01`
- Next role: fresh non-implementing verification
- Successor task: `/root/governance_fix_verification`
- Configured model / selected model / thinking: `gpt-5.6-terra` /
  `gpt-5.6-terra` / `medium`
- Availability/substitution evidence: requested model and thinking were passed
  explicitly at creation; configured primary selected with no substitution
- Prompt digest: successor receives the bounded write-held verification prompt
  from this dispatch, including the exact result commit above
- One-successor authorization: exactly this verification task, then no further
  successor by fix DEV
- Bootstrap proof: successor reported its isolated worktree, detached pending
  head `49a3da95f72122ebaae8b80541f3a17cfd9b59e4`, clean state, entrypoint-only
  read, and write-held readiness; no successor write was made
- Release record: this predecessor-final commit; the ACTIVATE/RELEASE message
  carries its exact hash, and fix DEV makes no later worktree write
- Released predecessor-final HEAD:
  `ada3c414797cdd0c1cb69e23aa8f0b0a571cbbc1`
- Activation proof: exact isolated worktree root, detached released HEAD above,
  and clean state re-proved before the first permitted write
- Sole-writer state: acquired; fix DEV is write-closed and verification is the
  only active writer in the isolated worktree
- Activation record: `1b1c1ace4bfaf50373af34e0054adf8f51d7ea7a`
- Predecessor closure: fix result and sole verification successor entry are
  durable; fix DEV waits only for activation acknowledgement, never for the
  verification result
- Output: fixes limited to canonical CR Must Fix 1-5 and durable DEV evidence
- Authorization: one fresh fix-DEV task plus exactly one fresh non-implementing
  verification successor after durable fix writeback; no CR/QA/RM/merge/push/
  production, product/runtime, scripts/workflows, skills/plugins/trackers,
  main-checkout, or applied-writing-lecture action

## Fix Re-review Dispatch

- Dispatch ID: `codex-matt-governance-fix-rereview-20260722-01`
- State: `closed`
- Expected base/head: `35ed4098b33ca31b5e9013508d2768ecde398bc1`
- Pending-dispatch commit: `a30971d5fc80bd1795958d09158a4366067c07da`
- Checkout: fresh isolated detached worktree
  `/Users/huangxuewei/.codex/worktrees/governance-fix-rereview-20260722`
- Next role: fresh formal re-review; no DEV history
- Configured model: `gpt-5.6-sol`
- Selected model: `gpt-5.6-sol`
- Thinking: `high`
- Route reason: the plan's Fresh CR / re-review / RM route requires Sol/high;
  this successor must cold-read the fix and the fresh verification evidence.
- Availability/substitution evidence: configured primary selected; finite
  same-family/same-grade candidate set is `[gpt-5.6-sol]`; no substitution.
- Successor task: `/root/governance_fix_verification/governance_fix_rereview`
- Task creation: exactly one independently addressable fresh Codex task was
  created with explicit `model=gpt-5.6-sol` and `thinking=high`; write-held
  bootstrap is active.
- Bootstrap proof: successor reported the exact isolated worktree and detached
  pending-dispatch HEAD `a30971d5fc80bd1795958d09158a4366067c07da`, clean
  state, and entrypoint-only read; no successor write was made.
- Released predecessor-final HEAD:
  `18d6da32969621c53e9b11da5cc3261422643be8`
- Activation proof: exact isolated worktree root, detached released HEAD above,
  and clean state re-proved before the first permitted write.
- Sole-writer state: acquired; verification is write-closed and this fresh
  formal re-review is the only active writer in the isolated worktree.
- Activation record: `aa672b46cb7169a35ac7c17feb6354a984ddd5f3`.
- Reviewed fix result:
  `49a3da95f72122ebaae8b80541f3a17cfd9b59e4`
- Result artifact: `docs/cuts/codex-matt-governance/cr.md`
- Verdict: `NOT MERGEABLE`; three unresolved re-review Must Fix findings.
- Result commit: `076c1ff9ce46eb2933eee93ae7a782cfa945f2b1`.
- Role result state: `result-recorded`; exactly one fresh fix-DEV successor is
  required by the canonical verdict and the plan relay table.
- Role completion: closed by this predecessor-final commit; re-review performs
  no later worktree write and waits only for its direct successor's durable
  activation acknowledgement, never for the fix result.
- Predecessor closure: the re-review verdict and the sole Fix DEV 2 successor
  entry are durable; this re-review waits only for activation acknowledgement
  and never for the fix result.
- Output: `docs/cuts/codex-matt-governance/cr.md`
- Authorization: exactly one fresh no-DEV-history formal re-review after
  verification result writeback; no implementation, QA, RM, merge, push,
  production, scripts/workflows, product/runtime, server/schema/data,
  skills/plugins/trackers, main-checkout, or applied-writing-lecture action.

## Fix DEV 2 Dispatch

- Dispatch ID: `codex-matt-governance-fix2-dev-20260722-01`
- State: `closed`
- Expected base/head: `076c1ff9ce46eb2933eee93ae7a782cfa945f2b1`
- Pending-dispatch commit: `739c1d44582cdf052a968f3fef218a94050529e4`
- Checkout: existing isolated detached worktree
  `/Users/huangxuewei/.codex/worktrees/governance-fix-rereview-20260722`
- Next role: fresh fix DEV for canonical re-review Must Fix R1-R3
- Configured model: `gpt-5.6-terra`
- Selected model: `gpt-5.6-terra`
- Thinking: `medium`
- Route reason: bounded docs-only correction of three re-review findings; no
  complex, cross-module, or repeated-implementation-failure upgrade trigger
- Availability/substitution evidence: the current task-creation capability
  exposes `gpt-5.6-terra` with `medium`; configured primary selected from the
  finite `[gpt-5.6-terra]` eligibility set with no substitution
- Prompt-template digest:
  `b2912e0dc77860f3fa1525688e5cf229bf9ac4c7e749da5875cd18277c1b0afb`
- Digest scope: stable write-held fix-DEV prompt with a
  `<PENDING_DISPATCH_HEAD>` placeholder; the exact commit from this record is
  supplied in the creation call
- Predecessor task:
  `/root/governance_fix_verification/governance_fix_rereview`
- Successor task:
  `/root/governance_fix_verification/governance_fix_rereview/governance_fix2_dev`
- Task entry: created as exactly one independently addressable fresh Codex task
  with explicit `model=gpt-5.6-terra` and `thinking=medium`; write-held
  bootstrap remains active
- Bootstrap proof: successor reported the exact isolated worktree, detached
  pending-dispatch HEAD `739c1d44582cdf052a968f3fef218a94050529e4`, clean
  state, and entrypoint-only read; no successor write was made
- Release record: this is the re-review predecessor's final worktree commit.
  The ACTIVATE/RELEASE message carries its exact hash; re-review makes no later
  worktree write and exits after activation acknowledgement
- Released predecessor-final HEAD:
  `9afe6732ffb9910160bca35e3bdb28cb068aa390`
- Activation proof: exact isolated worktree root, detached released HEAD above,
  and clean state re-proved before the first permitted write
- Sole-writer state: acquired; the re-review predecessor is write-closed and
  this Fix DEV 2 task is the only active writer in the shared worktree
- Activation record: `2f1a66917474c3c6e47ea4139811eb123381026c`
- Predecessor closure: the canonical re-review verdict and sole fix-DEV
  successor entry are durable; re-review never waits for or collects the fix
  result
- Output: fixes limited to canonical re-review Must Fix R1-R3 and durable DEV
  evidence
- Result commit: `8cb228e9ce51f147eda2188c93b6fdeb9144d103`
- DEV self-check: `git diff --check` passed before the result commit; R1's
  current-rule relay owners now point to fresh direct successors, and R2's live
  entrypoint state names this task as the sole active role. R3 is reserved for
  the fresh verification matrix and is not claimed as DEV verification.
- Authorization: exactly one fresh fix-DEV task plus one fresh
  non-implementing verification successor after durable fix writeback; no
  CR/QA/RM/merge/push/production, product/runtime, scripts/workflows,
  skills/plugins/trackers, main-checkout, or applied-writing-lecture action

## Fix DEV 2 Verification Dispatch

- Dispatch ID: `codex-matt-governance-fix2-verification-20260722-01`
- State: `closed`
- Expected base/head: `8cb228e9ce51f147eda2188c93b6fdeb9144d103`
- Checkout: this isolated detached worktree
  `/Users/huangxuewei/.codex/worktrees/governance-fix-rereview-20260722`
- Next role: fresh non-implementing verification for the Fix DEV 2 exact head
- Configured model: `gpt-5.6-terra`
- Selected model: `gpt-5.6-terra`
- Thinking: `medium`
- Route reason: exact-head governance evidence and lifecycle matrix
- Availability/substitution evidence: configured primary selected from the
  finite `[gpt-5.6-terra]` eligibility set; no substitution
- Successor task:
  `/root/governance_fix_verification/governance_fix_rereview/governance_fix2_dev/fix2_verification`
- Task entry: exactly one independently addressable fresh Codex task was
  created with explicit `model=gpt-5.6-terra` and `thinking=medium`; write-held
  bootstrap was active.
- Bootstrap proof: successor reported the exact isolated worktree, detached
  pending-dispatch HEAD `6d6ebdb9e90e76ffa8a38d4d1493b7061dff860b`, clean
  state, and entrypoint-only read; no successor write was made.
- Release record: this predecessor-final commit; ACTIVATE/RELEASE carries its
  exact hash, and Fix DEV 2 makes no later worktree write.
- Released predecessor-final HEAD:
  `cfa316391de64b1dde0af20e05e5f681a2fd5f6e`
- Activation proof: exact isolated worktree root, detached released HEAD above,
  and clean state re-proved before the first permitted write.
- Sole-writer state: acquired; Fix DEV 2 is write-closed and this fresh
  verification task is the only active writer in the isolated worktree.
- Activation record: `d1461531b68b5693fd4f5fb0e1ef110e237e55fc`.
- Result record: `1400ea88af8686fb52e4bb8b65bf5ba89cb7c69c`.
- Predecessor closure: Fix DEV 2's result and sole verification successor entry
  are durable; Fix DEV 2 waits only for activation acknowledgement and never
  for the verification result.
- Output: append-only exact-head evidence in
  `docs/cuts/codex-matt-governance/verification.md` and this task's own
  lifecycle fields
- One-successor authorization: exactly this fresh verification task after
  durable Fix DEV 2 writeback; no other successor by Fix DEV 2
- Authorization: verification only; no implementation, CR, QA, RM, merge,
  push, production, scripts/workflows, product/runtime, server/schema/data,
  skills/plugins/trackers, main-checkout, or applied-writing-lecture action

## Fix DEV 2 Verification Re-review Dispatch

- Dispatch ID: `codex-matt-governance-fix2-verification-rereview-20260722-01`
- State: `closed`
- Expected base/head: `8cb228e9ce51f147eda2188c93b6fdeb9144d103`
- Checkout: this isolated detached worktree
  `/Users/huangxuewei/.codex/worktrees/governance-fix-rereview-20260722`
- Next role: fresh formal re-review; no DEV history
- Configured model: `gpt-5.6-sol`
- Selected model: `gpt-5.6-sol`
- Thinking: `high`
- Route reason: the sole routing authority assigns fresh CR / re-review to
  Sol/high; this task must cold-read the Fix DEV 2 result and fresh evidence.
- Output: `docs/cuts/codex-matt-governance/cr.md`
- Successor task:
  `/root/governance_fix_verification/governance_fix_rereview/governance_fix2_dev/fix2_verification/fix2_formal_rereview`
- Task entry: exactly one independently addressable fresh Codex task was
  created with explicit `model=gpt-5.6-sol` and `thinking=high`; write-held
  bootstrap was active.
- Availability/substitution evidence: configured primary selected from the
  finite `[gpt-5.6-sol]` eligibility set; no substitution.
- Bootstrap proof: successor reported this exact isolated worktree, detached
  pending-dispatch HEAD `1400ea88af8686fb52e4bb8b65bf5ba89cb7c69c`, clean
  state, and entrypoint-only read; no successor write was made.
- Release record: this predecessor-final commit; ACTIVATE/RELEASE carries its
  exact hash, and verification makes no later worktree write.
- Released predecessor-final HEAD:
  `c140afbf0acce3e88d560430c8299e5bbd59589a`.
- Activation proof: exact isolated worktree root, detached released HEAD above,
  and clean state re-proved before the first permitted write.
- Sole-writer state: acquired; verification is write-closed and this fresh
  formal re-review is the only active writer in the isolated worktree.
- Activation record: `bf6842c0952c927753c01943e37c3305f64839b0`.
- Reviewed Fix DEV 2 result:
  `8cb228e9ce51f147eda2188c93b6fdeb9144d103`.
- Verdict: `NOT MERGEABLE`; three unresolved Must Fix findings R1-R3.
- Result commit: `50bcd1dfb2c01a051809ca29cbbc63c73d1cad53`.
- Role result state: `result-recorded`; exactly one fresh Fix DEV 3 successor
  is required by the canonical verdict and plan relay table.
- Role completion: stops at the durable `dispatch-failed` record below; no
  successor exists and this re-review makes no later worktree write.
- Predecessor closure: verification evidence and the sole re-review successor
  entry are durable; verification waits only for activation acknowledgement,
  never for the re-review result.
- Authorization: exactly one fresh no-DEV-history formal re-review successor;
  no implementation, QA, RM, merge, push, or production action.

## Fix DEV 3 Dispatch

- Dispatch ID: `codex-matt-governance-fix3-dev-20260722-01`
- Initial automatic state: `dispatch-failed`
- Expected base/head: `50bcd1dfb2c01a051809ca29cbbc63c73d1cad53`
- Checkout: this isolated detached worktree
  `/Users/huangxuewei/.codex/worktrees/governance-fix-rereview-20260722`
- Next role: fresh Fix DEV 3 for canonical re-review Must Fix R1-R3
- Configured model: `gpt-5.6-terra`
- Selected model: `gpt-5.6-terra`
- Thinking: `medium`
- Route reason: bounded docs-only correction of three still-open findings; no
  complex, cross-module, or implementation-escalation trigger
- Availability/substitution evidence: the current task-creation capability
  exposes `gpt-5.6-terra` with `medium`; configured primary selected from the
  finite `[gpt-5.6-terra]` eligibility set with no substitution
- Prompt-template digest:
  `ef42d6f8b9e7e48e7b4cb6f5323f2c0d5dcdc9614ac53def24a6f5e7808ae1d3`
- Digest scope: stable write-held Fix DEV 3 prompt with a
  `<PENDING_DISPATCH_HEAD>` placeholder; the exact commit from this record is
  supplied in the creation call
- Creation evidence: the initial creation call and the single bounded retry
  both returned `agent thread limit reached`; the dispatch ID search/list
  showed no child task, and no ambiguous create result exists
- Returned task identity: none
- Failure reason: runtime concurrency capacity remained exhausted after one
  completed-chain ancestor was interrupted; protocol forbids another retry
- Manual fallback task identity: `/root` (manual fallback; no child task)
- Manual-fallback reason: authorized after the initial creation and its one
  permitted retry both failed with `agent thread limit reached`; this fallback
  is the sole successor.
- Released predecessor-final HEAD: `3d1c6722169f750dd4096c9547f8d0e22fce90b9`
- Activation re-proof: exact checkout
  `/Users/huangxuewei/.codex/worktrees/governance-fix-rereview-20260722`,
  detached HEAD `3d1c6722169f750dd4096c9547f8d0e22fce90b9`, and clean state
  re-proved before this first permitted write.
- State: `closed`
- Sole-writer state: released; the failed automatic dispatch had no child, and
  this manual fallback is write-closed after provisioning its sole successor.
- DEV self-check: `git diff --check` passed; the changed-path list is limited
  to plan-allowlisted current-rule and cut-entrypoint surfaces; the
  current-positive ownership scan found no remaining ancestor PM/RM or DEV
  relay owner in those rule targets; and the entrypoint has one `active` state
  with all completed relay records closed.
- Dependency setup: `bash scripts/setup-worktree.sh` completed successfully,
  restoring the normal `app` and `server` dependency directories required by
  the fresh verifier.
- Output: fixes limited to canonical R1-R3 and durable DEV evidence
- Authorization: exactly one fresh Fix DEV 3 task plus one fresh
  non-implementing verification successor after durable fix writeback; no
  CR/QA/RM/merge/push/production, product/runtime, scripts/workflows,
  skills/plugins/trackers, main-checkout, or applied-writing-lecture action

## Fix DEV 3 Verification Dispatch

- Dispatch ID: `codex-matt-governance-fix3-verification-20260722-01`
- State: `release-authorized`
- Expected base/head: `b1169a6978aef1e475360b725a8bd96265ef3a39`
- Checkout: this isolated detached worktree
  `/Users/huangxuewei/.codex/worktrees/governance-fix-rereview-20260722`
- Next role: fresh non-implementing verification for the Fix DEV 3 exact head
- Configured model: `gpt-5.6-terra`
- Selected model: `gpt-5.6-terra`
- Thinking: `medium`
- Route reason: exact-head governance verification and lifecycle evidence
- Availability/substitution evidence: configured primary selected from the
  finite `[gpt-5.6-terra]` eligibility set; no substitution
- Returned task identity: `/root/fix3_verification`
- Task entry: created as exactly one fresh, independently addressable task with
  explicit `model=gpt-5.6-terra` and `thinking=medium`; write-held bootstrap
  was active.
- Bootstrap proof: successor reported this exact isolated worktree, detached
  pending-dispatch HEAD `df9f54348350d8bd85d0922574264788b98bbd50`, clean
  state, and entrypoint-only read; no successor write, verification, or further
  repository read was made.
- Release record: this predecessor-final commit. The ACTIVATE/RELEASE message
  carries its exact hash; Fix DEV 3 makes no later worktree write.
- Released predecessor-final HEAD:
  `75e8116d3ec452704a86879967c55a6739a44d7a`
- Activation re-proof: exact isolated worktree root, detached released HEAD
  above, and clean state re-proved before this first permitted write.
- Sole-writer state: acquired; Fix DEV 3 is write-closed and this verification
  task is the sole active writer in the isolated worktree.
- Verification result: the bound Fix DEV 3 implementation head passed the
  required typecheck, full `verify:all`, scope, current-positive relay,
  authority-map, changed-link, and live-lifecycle evidence matrix recorded in
  `verification.md`; no CR verdict is made by this task.
- Successor route: one fresh no-DEV-history formal re-review task is the sole
  direct successor and must remain write-held until this verifier's final
  release-authorizing commit.
- Verification result record: `dae33f802707806f757aac4a55240a0d34ada985`.
- Re-review successor dispatch ID:
  `codex-matt-governance-fix3-rereview-20260722-01`
- Next role: fresh no-DEV-history formal re-review
- Configured model / selected model / thinking: `gpt-5.6-sol` /
  `gpt-5.6-sol` / `high`
- Availability/substitution evidence: the configured primary was explicitly
  selected from the finite `[gpt-5.6-sol]` eligible set; no substitution.
- Returned task identity: `/root/fix3_verification/fix3_rereview`
- Task entry: created as exactly one fresh, independently addressable task with
  explicit model and thinking; write-held bootstrap was active.
- Bootstrap proof: successor reported this exact isolated worktree, detached
  pending-dispatch HEAD `dae33f802707806f757aac4a55240a0d34ada985`, clean
  state, and entrypoint-only read; no successor write, verification, or further
  repository read was made.
- Release record: this predecessor-final commit; the ACTIVATE/RELEASE message
  carries its exact hash, and this verifier makes no later worktree write.
- Sole-writer state: this verifier is write-closed on committing this record;
  the write-held re-review successor becomes sole writer only after re-proving
  this exact released HEAD and recording its activation.
- Output: append-only exact-head evidence in
  `docs/cuts/codex-matt-governance/verification.md` and this task's lifecycle
  fields
- Authorization: verification only. It must not implement, perform CR, QA, RM,
  merge, push, production, workflow/script edits, skill/plugin/tracker work,
  main-checkout work, or applied-writing-lecture work. After durable evidence,
  it may create exactly one fresh no-DEV-history formal re-review successor.

## Next Action

The current visible top-level recovery task creates exactly one independently
addressable top-level fresh formal re-review with `gpt-5.6-sol` and `high`,
targeted at branch `codex/codex-matt-governance` containing this checkpoint.
The new task must cold-read the Fix DEV 3 result and verification evidence,
write canonical `cr.md`, create at most one top-level direct successor, and
exit. The recovery task ends immediately after successful creation and does
not wait for the review result.

## Topology Recovery Record

- Invalid verification subagent: `/root/fix3_verification`
- Valid evidence result: `dae33f802707806f757aac4a55240a0d34ada985`
- Invalid recursive re-review subagent:
  `/root/fix3_verification/fix3_rereview`
- Recursive re-review state: interrupted before activation write; no repository
  change and no CR verdict
- Last recursive-chain commit retained as evidence:
  `d06c3359fc7e074f81bd37c4421e7c753ce5ffa1`
- Recovery owner: current visible top-level Codex task
- Legal successor: one `create_thread` top-level fresh formal re-review in the
  `english-question-bank` project
- Explicit route: `gpt-5.6-sol`, `high`; fresh CR route from the sole model
  authority
- Forbidden fallback: no `spawn_agent`, subagent, fork, inherited DEV history,
  or long-lived parent wait
