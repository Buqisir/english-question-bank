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

**Fresh formal CR recorded `NOT MERGEABLE`; the sole fresh fix-DEV successor is
ready-held and release-authorized by this predecessor's final commit.**

The CR cold-read
`3889d67099c6211daa5cbbb79cb93bf49e4e5cc6..113db39f8119536e27aa4344f4bfcdfdbd7d3365`,
the canonical plan/PA contract, current positive rules, templates, and exact-head
verification evidence. The diff stayed inside the allowed documentation scope,
but five Must Fix findings remain: direct-relay role drift, conflicting
verification ownership, incomplete Auto-Next artifacts, red/incomplete required
verification, and stale live entrypoint state. Canonical findings are committed
in `cr.md`. The fix-DEV successor proved its isolated worktree, pending HEAD,
clean state, and entrypoint-only read without writing. This commit closes the CR
role and is its final worktree write; the successor becomes sole writer only
after exact-HEAD release/re-proof and its own durable activation record. No
implementation, QA, RM, merge, push, production, workflow/script,
skill/plugin/tracker, main-checkout, or applied-writing-lecture action occurred.

## Must Read

After fix-DEV activation, read these current inputs before implementation:

1. `docs/cuts/codex-matt-governance/cr.md`
2. `docs/cuts/codex-matt-governance/plan.md`
3. `AGENTS.md`
4. `docs/agents/model-routing.md`
5. `docs/steering/codex-matt-workflow.md`

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

The next task wears only the fix-DEV hat. After write-held bootstrap and
exact-HEAD activation, it must:

1. re-prove the baseline, branch, worktree, released exact head, and clean
   state, then durably record its own activation before any substantive write;
2. read the Must Read set above and the current contents of each target before
   editing it;
3. close only Must Fix 1-5 from canonical `cr.md` within the plan's allowed
   current-rule/template/entrypoint surfaces, keeping
   `docs/agents/model-routing.md` the sole exact model/thinking authority and
   preserving every existing risk gate;
4. follow the worktree checkpoint discipline, commit its implementation and
   DEV self-check evidence, and avoid writing PA/CR verdicts or claiming formal
   verification; and
5. create exactly one independently addressable fresh non-implementing
   verification successor under the same one-way write-held/final-commit/
   release protocol, then exit after durable activation acknowledgement.

The fix-DEV task must not expand the allowlist, edit business/runtime/product or
workflow/script surfaces, perform formal verification/CR/QA/RM, merge, push,
touch production, install or initialize skills/plugins/trackers, modify the
main checkout's user changes, or change the `applied-writing-lecture` worktree.

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
- Next artifact: bounded fix-DEV implementation for canonical CR Must Fix 1-5

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
- State: `provisioning`
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
- State: `result-recorded`
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
- Output: fixes limited to canonical CR Must Fix 1-5 and durable DEV evidence
- Authorization: one fresh fix-DEV task plus exactly one fresh non-implementing
  verification successor after durable fix writeback; no CR/QA/RM/merge/push/
  production, product/runtime, scripts/workflows, skills/plugins/trackers,
  main-checkout, or applied-writing-lecture action

## Next Action

Wait for the sole write-held verification successor's bootstrap acknowledgement,
then record `ready-held`, make the predecessor-final `release-authorized`
commit, release that exact HEAD, and exit after activation acknowledgement.
fix-DEV successor. It re-proves that HEAD and clean state, durably records
activation as sole writer, and acknowledges. CR performs no later worktree write
and exits immediately after that acknowledgement without waiting for the fix
result; no ancestor task resumes.
