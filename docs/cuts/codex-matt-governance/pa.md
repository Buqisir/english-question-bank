# codex-matt-governance · PA

Date: 2026-07-22
Role: fresh PA only; no implementation performed

## Verdict

**APPROVE WITH MUST FIX. DEV is blocked.**

- Reviewed worktree:
  `/Users/huangxuewei/Projects/wt-codex-matt-governance`
- Reviewed branch: `codex/codex-matt-governance`
- Fetched remote baseline / merge-base:
  `github/main` at `e4ae78607411d265768a0253c5c63b5f3c0d726b`
- Reviewed plan HEAD:
  `3e39798a7505651190f2f045b27a7991283d84c6`
- Pre-PA tree state: clean; branch ahead of `github/main` by the two committed
  PM artifacts only (`agent-entrypoint.md`, `plan.md`).
- Direction verdict: the owner-approved two-axis model is coherent and worth
  ratifying. The blocking risk is execution ambiguity, not product direction.
- Must Fix count: **7**.
- Open PO Decisions: **0**.

## Product Principle

Auto-Next succeeds only if it removes owner routing work **and** preserves the
existing risk gates, independent role contexts, exact-head verification, and
human stop boundaries. A sentence that says “fresh”, “automatic”, or “tracked”
is not yet an executable protocol; the durable state transition and failure
behavior must make the claim true.

## Exact UX / Architecture Model

The two axes can remain orthogonal, but `plan.md` must distinguish the unit
selected by each axis:

| Axis | Selects | Does not select |
| --- | --- | --- |
| Risk | Small / Medium / Large / irreversible gates: PA, independent CR, QA, RM, merge and release proof | number of decision or implementation tickets |
| Context topology | one bounded work slice, a serial ticket graph, or a Wayfinder-led fog-to-closure graph | permission to remove or combine risk-required role gates |

“One bounded task” therefore cannot mean “one conversation contains PM, DEV,
and CR”. It means one bounded work slice; the risk axis may still add separate
fresh PA / CR contexts around it. Conversely, a multi-ticket or Wayfinder route
does not become Large merely because it uses several contexts.

The accepted execution shape should be:

1. a tracked cut contract holds durable truth;
2. each active ticket has one role, one deliverable, one acceptance test, and
   one state transition;
3. the task that implements cannot become the independent PM verifier or CR by
   changing hats;
4. a fresh PM verification context (or a surviving PM coordinator that did not
   implement) binds evidence to the exact implementation head;
5. a fresh CR cold-reads repo contracts and the fixed diff with no inherited DEV
   conversation;
6. Auto-Next performs a durable, idempotent dispatch transition; and
7. human QA is a deliberate paused state, not a broken handoff.

Conflict coverage:

| Named conflict | PA disposition |
| --- | --- |
| C-1 scratch vs tracked truth | MF-2 |
| C-2 conversation spec vs distributed decisions | MF-2 |
| C-3 DEV self-review vs independent CR | MF-3 and MF-6 |
| C-4 fixed names vs capability authority | MF-2 and MF-7 |
| C-5 verification ownership vs duplication | MF-6 |
| C-6 manual Next vs automatic continuation | MF-4 |
| C-7 automation vs QA / stop boundaries | MF-5 |

## Must Fix Before DEV

### MF-1 — Define the unit of “one bounded task” so the two axes cannot collapse

HR-3 says topology selects “one bounded task”, while current Medium / Large
rules unconditionally require separate fresh role contexts. Without a unit
definition, a future agent can read the topology as permission to keep DEV and
CR in one task, or can classify every Medium / Large cut as multi-task merely
because CR is fresh. Either reading makes the axes non-orthogonal.

Before DEV, `plan.md` must lock a routing matrix that says:

- topology counts work/decision slices, not risk-mandated review gates;
- bounded work may still receive fresh PA / CR / QA / RM contexts required by
  risk;
- ticketing and Wayfinder never alter risk tier or waive a gate; and
- risk tier never forces Wayfinder when the work itself is already bounded and
  clear.

### MF-2 — Make Wayfinder a role contract and specify the tracked state machine

The plan currently uses `Wayfinder` both like a stable navigation role and like
a possibly drifting named capability. It also promises tracked maps, tickets,
claims, resolution, and spec synthesis without defining the minimum file
schema or state transitions. That is not enough for a fresh task to resume
without owner interpretation.

Before DEV, `plan.md` must state that **Wayfinder is the stable role/topology
name, not a required skill identifier**. Runtime routing resolves a compatible
capability when present and otherwise performs the same contract in natural
language; owner prompts never name or select the implementation.

It must also lock the minimal tracked layout and states for both multi-task
routes:

- ticketed cut: tracked ticket index plus one file per ticket under the cut;
- Wayfinder cut: low-resolution `wayfinder/map.md` plus detailed decision /
  implementation ticket files and linked assets;
- one active/claimed ticket at a time during the first three serial cuts;
- explicit states and transitions for blocked, ready, claimed/active,
  result-recorded, dispatched, human-QA, failed, and closed;
- each ticket records blockers, acceptance, result, relevant base/head,
  dispatch state, and unique next action;
- `spec.md` records the IDs/revisions of every consumed closed decision ticket
  and asset so C-2 is verifiable rather than conversational; and
- no wording claims parallel-safe locking before a separate concurrency rule
  exists.

### MF-3 — Resolve role topology and make “fresh” mechanically unambiguous

C-3, HR-5/HR-6, and Implementation Order do not yet agree on who owns the
top-level implementation task and who performs PM verification. “Fresh DEV
task → PM verification” can be misread as the DEV task changing hats and
accepting its own evidence. The current PA/CR personas and dispatch rules also
describe subagent-only routing, while the new contract permits top-level tasks.

Before DEV, `plan.md` must choose and describe the stage topology. Whichever
runtime form is used:

- PA, DEV, PM verification, and formal CR role ownership must be explicit;
- the verifier did not implement the reviewed head;
- DEV self-check remains input only;
- formal initial CR and every required re-review are newly created contexts,
  never a continuation, handoff, or fork of the DEV/fix conversation;
- a fresh subagent route must explicitly disable history inheritance rather
  than relying on a default that may copy the parent history; and
- changing a role label inside the same inherited context never satisfies
  independence.

Current Codex runtime evidence matters here: a separate task-creation
capability can create a new thread from only the supplied prompt, while the
thread-fork capability copies completed source history. The detailed guide may
name current mechanisms as non-authoritative examples, but the law and
verification must enforce the capability property: **no DEV history enters
formal CR**.

### MF-4 — Add an idempotent Auto-Next targeting and activation protocol

The current “write → create and start → record entry → end” sentence contains
a race. Task creation is non-blocking. A child can begin reading/writing before
the parent records its task entry, and a timed-out retry can create duplicate
children. The current Codex capability also targets a saved project plus either
its local checkout or a newly provisioned worktree; it does not accept an
arbitrary existing worktree path as a direct target. A queued worktree may
initially return only a client task ID rather than a waitable thread ID.

Before DEV, `plan.md` must define a capability-based two-phase dispatch (or an
equally race-free protocol):

1. resolve the exact EQB project identity from the saved project root;
2. resolve the checkout strategy explicitly: existing named worktree via a
   no-write bootstrap and mandatory `cd`, or a new worktree pinned to the named
   branch/ref and expected head;
3. write and commit a unique dispatch ID with `pending`, expected project root,
   branch, base/head, output path, role, and prompt digest;
4. create one fresh task with a hold/bootstrap instruction carrying that
   dispatch ID and the scoped Auto-Next authorization;
5. record returned host/thread/client identifiers and provisioning status
   before activation;
6. activate only after the durable record is visible; the child first proves
   `pwd`, repo root, branch, HEAD, and clean/expected status before any write;
7. record `active`, `failed`, or `closed` transitions and the result commit; and
8. end the parent only after activation is acknowledged or the durable failure
   path is recorded.

Retries must be idempotent: before retrying, search by dispatch ID and determine
whether a child already exists. Define “persistent failure” now (recommended:
one initial attempt plus one retry only after proving no child exists). An
ambiguous create result is not permission to create duplicates. After the
budget is exhausted, record the concrete failure and emit one complete fallback
prompt; only that exceptional path asks the owner to copy it.

The propagated authorization must be least-privilege and self-contained: it
authorizes exactly one next in-scope task after durable writeback, carries the
same stop rules, and does not grant merge, production, scope-expansion, or
irreversible-operation authority.

### MF-5 — Close the human-QA pass, failure, repair, and re-entry state machine

C-7 says failed QA dispatches repair DEV and “runs fresh review”, but it omits
independent PM verification of the changed head, the canonical CR update, and
which task owns the paused QA conversation. As written, a repair can return to
QA on stale verification or stale CR.

Before DEV, `plan.md` must lock this state machine:

- a QA-coordinator task enters `human-QA`, creates no child, remains the task to
  which the owner replies, and presents 3–5 actions, expected observations,
  pass criteria, and a failure-report format;
- `QA 完成，继续` records the tested commit/evidence and automatically resumes
  the unique next action;
- a failure records a defect ticket against the tested commit, dispatches a
  fresh repair DEV context, then requires independent PM verification of the
  repair head and a fresh no-DEV-history re-review that updates/preserves the
  canonical `cr.md` verdict before returning to `human-QA`;
- a second QA round names the new commit and does not reuse the old pass; and
- the five exceptional stop categories are exhaustive and mapped to concrete
  durable states: contract contradiction, missing authority, imminent
  irreversible production operation, persistent task-creation failure, and
  irresolvable current-rule conflict. Search/test/implementation failures stay
  inside the automatic loop.

### MF-6 — Bind verification to the cut’s final head without one full run per ticket

C-5 currently requires the “implementation-ticket PM task” to run narrow,
`tsc`, and one full verify after DEV. In a cut with several implementation
tickets, that wording multiplies the full suite. Elsewhere the plan says one
full verify before merge. These statements conflict.

Before DEV, `plan.md` must separate evidence levels:

- every ticket gets its required narrow checks and a non-implementing PM
  consumption of real, unpiped exit codes;
- `tsc` runs at the plan-defined integration points and after a relevant fix;
- one cut-level full `verify:all` runs at the final combined implementation head
  before initial formal CR, unless exact-head PR CI already supplies the
  permitted proof;
- the tracked verification ledger records exact command, exit code, base,
  verified commit, working-tree state, and evidence source;
- any later commit invalidates exact-head evidence; the new head receives the
  required narrow/`tsc` checks and either a new full run or exact-head CI proof
  under the unchanged `AGENTS.md` gate;
- fresh CR checks the evidence/head binding and runs only the narrow attack
  checks needed for review; it does not blindly duplicate an unchanged full
  suite; and
- RM consumes the actual CR verdict and re-runs only for missing evidence,
  changed head, overlapping rebase/merge, or an additional release check named
  by the plan. Post-merge `main` CI remains mandatory.

Use a named tracked path such as
`docs/cuts/<CUT>/verification.md` for multi-task evidence. Do not bury the only
exact-head proof in a completed chat or DEV report.

### MF-7 — Correct the allowed file set and add role-specific ownership

The current allowed list is neither complete nor minimal:

- it proposes a new
  `docs/cuts/_templates/agent-entrypoint-template.md`, but the repository already
  has the canonical `docs/cuts/_templates/agent-entrypoint.md`; creating a
  synonym would split authority;
- `docs/agents/pa-persona.md` and `docs/agents/cr-persona.md` contain current
  subagent-only wording that would contradict task-or-subagent topology;
- the current PA/Big-CR prompt templates end with manual chat completion and do
  not carry the Auto-Next completion contract;
- `docs/cuts/_templates/qa-checklist.md` lacks the pause/resume phrase and
  failure-report contract; and
- `docs/steering/dev-completion-protocol.md` says every shippable DEV task opens
  a PR, which conflicts with several serial tickets contributing to one cut/PR
  unless the active-cut behavior is stated.

Replace the duplicate template path with the existing template and add only
these proven current-rule surfaces to allowed scope:

- `docs/cuts/_templates/agent-entrypoint.md`
- `docs/agents/pa-persona.md`
- `docs/agents/cr-persona.md`
- `docs/cuts/_templates/pa-prompt-template.md`
- `docs/cuts/_templates/big-cr-prompt-template.md`
- `docs/cuts/_templates/qa-checklist.md`
- `docs/steering/dev-completion-protocol.md`
- this cut’s optional tracked `verification.md`

Finally, replace the union-only allowed list with a role ownership matrix. PA
writes `pa.md`; PM writes plan/entrypoint/verification state; DEV writes only
assigned current-rule surfaces and may not edit PA/CR verdicts; CR writes
`cr.md`; RM writes cut-note/closeout state and only then the compact STATUS
entry. A file being in whole-cut scope is not permission for every role to edit
it.

## Must Fix -> Plan Disposition Checklist

- [ ] **MF-1 → `Owner-Locked Decisions`, HR-3, Artifact Contract:** add the
  two-axis routing matrix and define bounded work separately from mandatory
  risk-gate contexts.
- [ ] **MF-2 → HR-4, C-1, C-2, C-4, Artifact Contract, Verification:** define
  Wayfinder as a role rather than a skill identifier; lock tracked paths,
  ticket fields/states, serial claim rule, and spec-consumption evidence.
- [ ] **MF-3 → HR-5, HR-6, C-3, C-6, Implementation Order:** choose the exact
  role/stage topology; require a non-implementing verifier and mechanically
  no-history initial CR/re-review.
- [ ] **MF-4 → HR-7, C-6, Artifact Contract, Verification:** add exact project /
  checkout resolution, pending→provisioning→active dispatch, idempotency,
  activation acknowledgement, authorization propagation, and capped fallback.
- [ ] **MF-5 → HR-7, HR-8, C-7, Implementation Order, QA disposition:** add the
  complete human-QA pass/fail/repair/reverify/re-review/return state machine and
  map all five exceptional stops.
- [ ] **MF-6 → C-5, Implementation Order, Verification Contract:** replace
  per-ticket full verification with ticket-level narrow evidence plus one
  exact-final-head cut-level full proof; name the tracked evidence path and
  invalidation/reuse rules.
- [ ] **MF-7 → Allowed Modification Scope, Forbidden Scope, Implementation
  Order:** use the existing entrypoint template, add the seven required current
  surfaces plus optional verification ledger, and add per-role write ownership.

PM must copy every checked disposition under `PA Follow-Up Decisions` before
DP-3. A checkbox is closed only when the corresponding normative plan section
contains the rule; “accepted” without text is not a disposition.

## Should Watch

1. **Three-cut evaluation accounting.** This does not block DEV because the
   owner already fixed the population (“next three new Medium/Large cuts”), but
   closeout should name one durable counter location and the five metric fields
   so the review cannot disappear into chat.
2. **Opaque task identifiers in tracked files.** Record only the identifiers and
   prompt digest needed for dispatch/recovery; never store full conversation
   text, secrets, credentials, or account/session payloads.
3. **Historical text.** Scans for model names, old Workflow wording, or manual
   Next prompts must distinguish current positive instructions from case law and
   historical cuts. Do not create a false cleanup mandate.
4. **Capability drift.** The current desktop capability proves that fresh
   project tasks are possible, but its parameter names and worktree behavior may
   change. Keep exact tool syntax in runtime examples, not constitutional law.

## Allowed Files

After PM records all dispositions, the corrected whole-cut allowlist is the
existing plan list with these changes:

- remove the nonexistent duplicate
  `docs/cuts/_templates/agent-entrypoint-template.md`;
- use `docs/cuts/_templates/agent-entrypoint.md` instead;
- add the current PA/CR personas, PA/Big-CR prompt templates, QA checklist, DEV
  completion protocol, and optional cut `verification.md` named in MF-7;
- retain `docs/STATUS.md` only for RM closeout; and
- enforce the per-role ownership matrix rather than treating this union as a
  shared write grant.

No additional runtime, script, skill, plugin, tracker, or compatibility-profile
file is required by this PA.

## Forbidden Files

Retain every forbidden scope in `plan.md`. Clarify that all unlisted files are
forbidden, including:

- `.claude/agents/**` and `.claude/skills/**`;
- `scripts/**` and `.github/workflows/**`;
- business/runtime/product paths;
- user-level Claude/Codex/Coding Brain configuration; and
- the main checkout’s user changes and the entire
  `/Users/huangxuewei/Projects/wt-applied-writing-lecture` worktree.

The governance implementation must not install, initialize, bridge, symlink,
or provision a skill or tracker.

## Static Verify Requirements

The current Verification Contract needs these corrections before DEV:

1. Add a role/topology authority table and prove that each normative statement
   has one home; pointers may specialize but may not restate current model or
   effort values.
2. Add a current-positive-instruction scan proving no rule still says PA/DEV/CR
   must be subagent-only after top-level fresh tasks become legal; historical
   records and Claude compatibility profiles are excluded deliberately.
3. Add a no-history review check: formal CR/re-review instructions must forbid
   continuation, handoff, forked history, and default inherited context from
   DEV, while permitting a genuinely empty-context subagent.
4. Add a template/path check proving there is exactly one canonical
   `_templates/agent-entrypoint.md` and no new synonym.
5. Add an artifact-schema review for ticket state, dispatch ID, project root,
   branch/base/head, role, output, evidence pointer, authorization, and unique
   next action.
6. Use the actual DEV→verification→fresh-CR transition of this cut as the
   Auto-Next behavior smoke: record pending/active/closed task state, child
   bootstrap proof, authorization propagation, and fresh-history proof. Do not
   create a disposable task solely to make a green check.
7. Bind narrow, `tsc`, and full-suite evidence to the exact commit as specified
   in MF-6; CR/RM must reject stale evidence and must not duplicate an unchanged
   full run without a named trigger.
8. Keep existing link resolution, `git diff --check`, allowed-path audit,
   artifact gate, `tsc`, one final-head full proof, and post-merge main CI.

Static regex alone cannot prove task freshness, correct checkout targeting, or
authorization propagation; those require the recorded live transition in item
6.

## Browser QA Matrix

- Browser QA for this governance cut: **not required**.
- Owner PO QA for this governance cut: **not required**; the direction is
  already ratified and this PA opens no product/process decision.
- Required behavioral QA: the tracked Auto-Next transition smoke in Static
  Verify item 6.
- Production deployment: **forbidden / not applicable**.

## DEV Readiness

**NOT READY.**

DEV may start only after:

1. all seven Must Fix dispositions are written under the matching normative
   sections and checked under `PA Follow-Up Decisions`;
2. the corrected role-specific file ownership and verification ledger path are
   committed;
3. `agent-entrypoint.md` advances to a unique DEV action on that commit; and
4. PM confirms the resulting plan has no unresolved PO decision.

No additional PA round is required if PM records every disposition exactly. A
fresh CR must later verify the checklist against the implemented current-rule
surfaces and the live Auto-Next transition evidence.

## Open PO Decisions

**0.** All seven blockers are technical/process-contract dispositions inside
the already ratified owner direction; none should be routed back to the owner.
