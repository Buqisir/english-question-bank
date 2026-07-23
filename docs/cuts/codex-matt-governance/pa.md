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

---

## Model Routing and One-Way Relay Addendum Review

Date: 2026-07-22
Role: second fresh PA only; no implementation performed

### Addendum Verdict

**APPROVE WITH MUST FIX. DEV remains blocked.**

- Reviewed worktree:
  `/Users/huangxuewei/Projects/wt-codex-matt-governance`
- Reviewed branch: `codex/codex-matt-governance`
- Fetched remote baseline / merge-base:
  `github/main` at `e4ae78607411d265768a0253c5c63b5f3c0d726b`
- Reviewed active-record HEAD:
  `8e0df527ec42eeec9e734f83ae785cbd5b3fd55b`
- Pre-review tree state: clean; branch ahead of `github/main` by six commits;
  diff limited to this cut's `agent-entrypoint.md`, `plan.md`, and `pa.md`.
- Initial PA dispositions: all seven are present in the named normative plan
  sections and remain directionally sound.
- Ten-hard-rule verdict: HR-1 through HR-5 and HR-7 through HR-9 are coherent in
  direction. HR-6 and HR-10 still conflict at one relay boundary, and the
  dispatch/readiness mechanics leave three additional executable gaps.
- Addendum Must Fix count: **4**.
- Open PO Decisions: **0**.

The single-authority design is correct: `AGENTS.md` should retain only stable
explicit-routing law, while `docs/agents/model-routing.md` owns the one current
role/model/thinking matrix. Explicit task-creation parameters and independent
PA/DEV/verification/CR/QA/RM selection are also correctly required. The
remaining blockers are bounded protocol defects, not a need to reopen the
owner's model choices or one-way-relay direction.

### Addendum Must Fix Before DEV

#### AMF-1 — Bound “same-grade successor” with a mechanically checkable eligibility contract

The plan requires runtime discovery to choose a same-grade Sol/Terra successor
when the configured model is unavailable, but it never defines how a dispatcher
proves that a discovered model is same-grade. “Same-grade” is therefore still a
judgment call outside the sole authority and can silently broaden into an
unapproved tier change.

Before DEV, `plan.md` must require `docs/agents/model-routing.md` to own one
mechanically checkable substitution contract: either an ordered family-scoped
successor allowlist or an equivalent explicit family/grade eligibility rule.
Availability discovery may only intersect the runtime's supported models and
thinking levels with that contract. If no eligible same-grade candidate exists,
the task records `missing-authority` / `dispatch-failed` and stops under the
existing bounded fallback; it must not invent a substitute or weaken thinking.

The durable dispatch record must distinguish configured model, selected model,
supported-thinking evidence, availability source, family/grade proof, and the
substitution reason. Verification must prove that this eligibility contract
lives only in `model-routing.md`, that every role independently applies it, and
that an unavailable-primary example cannot select an out-of-family or
lower-thinking candidate.

#### AMF-2 — Remove the fresh-subagent loophole from direct relay successors

HR-6 and `Role and Fresh-Task Topology` still allow PA to be an ordinary fresh
subagent, while HR-7/HR-10 require an independently addressable direct successor
whose predecessor exits after activation. A child subagent whose lifecycle and
result return are owned by the parent task can force that parent to remain alive;
that recreates the coordinator the owner just prohibited. The old current-rule
phrasing also makes this the most likely compatibility shortcut during DEV.

Before DEV, the plan must distinguish **role-internal assistance** from a
**one-way relay boundary**. Every Auto-Next relay stage must use a genuinely new,
independently addressable Codex task (or a future capability proven to have the
same independent lifecycle and durable task entry). A fresh subagent may be used
only inside one bounded role when an existing rule permits it; it cannot count as
the PA/DEV/verification/formal-CR/QA/RM direct successor. Formal CR and re-review
remain no-DEV-history new tasks. Replace C-5's ambiguous
“implementation-ticket PM task” with the fresh non-implementing verification
role used by the relay table.

The current-positive-instruction scan must reject any protocol/persona/template
that offers a parent-owned subagent as the Auto-Next successor or asks an
ancestor PM/Wayfinder task to collect that child's result.

#### AMF-3 — Close the activation/closure race before sharing a worktree

`Auto-Next Dispatch Protocol` step 7 activates the child, then step 8 waits for
its acknowledgement and writes the predecessor's `closed` transition. After
activation the child is no longer explicitly write-held, so it may edit or
commit in the same worktree while the predecessor is still changing the
entrypoint. The predecessor's final commit also changes the HEAD that the child
just proved. This creates exactly the concurrent-write and stale-head window
that bootstrap/activation was intended to prevent.

Before DEV, the plan must choose one canonical race-free ordering. The child
must remain explicitly **write-held** through readiness acknowledgement; the
predecessor then makes its final durable successor/predecessor-state commit and
sends a release instruction, after which the child re-proves the final expected
HEAD and becomes the sole writer. Equivalently, the plan may use another ordering
that proves the predecessor performs no worktree write after child release. In
either form, `active`, acknowledgement, `closed`, and write release must have
unambiguous meanings; there may be no interval in which both tasks are allowed
to write.

The live Auto-Next smoke must record the pending/ready-or-provisioning/final-head/
released transitions and prove that the successor's first write occurred only
after the predecessor's last worktree commit. A successful task-creation call or
chat acknowledgement alone is not that proof.

#### AMF-4 — Make zero-Must-Fix PA approval sufficient without an orphaned plan gate

The one-way table says PA creates DEV directly when no Must Fix remains, and
role ownership correctly forbids PA from rewriting `plan.md`. But
`PA Follow-Up Decisions`, DP-3, and the following readiness paragraph still
leave the addendum checkbox unchecked and say DEV is blocked until the addendum
review is approved in the plan. On a clean PA approval, no PM plan-revision task
exists to update those plan fields, so a direct DEV successor starts against a
contract that still declares itself blocked.

Before DEV, the plan must make the latest canonical addendum verdict in `pa.md`
plus its durable entrypoint completion state the authoritative zero-Must-Fix
gate. Convert the addendum checkbox and DP-3 from a post-PA mutable plan duty to
a derived condition, or otherwise remove the need for PA to edit substantive
plan text. A PM plan-revision successor remains mandatory only when Must Fix
exists. Verification must reject a route that dispatches DEV while any
independent plan-owned blocker still reads unresolved.

### Addendum Must Fix -> `plan.md` Disposition Checklist

- [ ] **AMF-1 -> `Owner-Locked Model Routing`, `Auto-Next Dispatch Protocol`,
  C-4, Verification Contract:** define the sole-authority successor eligibility
  rule, no-candidate stop, full substitution evidence, and an unavailable-model
  verification case.
- [ ] **AMF-2 -> HR-6, `Role and Fresh-Task Topology`, HR-10,
  `One-Way Relay Topology`, C-5, Verification Contract:** reserve direct relay
  stages for independently addressable new tasks; confine subagents to
  role-internal assistance; use one fresh verification-role name throughout.
- [ ] **AMF-3 -> `Tracked Map and Ticket State Machine`, `Auto-Next Dispatch
  Protocol`, HR-7, HR-10, Role Write Ownership, Verification Contract:** define
  the write-hold/final-commit/release order and prove no shared-worktree writer
  overlap or post-proof HEAD drift.
- [ ] **AMF-4 -> `Relay Order After This PM Task`, `PA Follow-Up Decisions`,
  DP-3, Verification Contract:** make canonical zero-Must-Fix PA approval a
  derived DEV-ready condition without a forbidden PA plan edit or a surviving
  PM coordinator.

Each item must be dispositioned in the named normative section before a fresh
PA recheck. “Accepted” or a checked summary without the rule text does not close
the item.

### Addendum Should Watch

1. `Wayfinder remains responsible` must mean continuity of the tracked role and
   map, never continuity of one Wayfinder conversation. HR-10 currently supplies
   that interpretation; implementation wording should preserve it.
2. This governance cut bootstraps before `model-routing.md` exists. Its recorded
   PA/PM-revision routes are valid only because the owner and durable stage
   contract supply explicit model and thinking. Do not generalize this bootstrap
   exception after the authority file is implemented.
3. Historical plan tables and dispatch-specific records may contain concrete
   selections, but current-positive scans must distinguish those records from a
   second reusable runtime routing table.

### Addendum Allowed / Forbidden Scope Corrections

No additional file is required. All four dispositions belong in `plan.md` and
the already allowed future current-rule surfaces. Keep the existing whole-cut
allowlist and per-role ownership matrix. In particular, this PA writes only this
append-only addendum plus its own entrypoint routing/completion fields; it does
not edit the plan or any current rule.

All forbidden scopes remain unchanged: no business/runtime code, scripts,
workflow configuration, skill/plugin/tracker installation, user-level
configuration, production action, main-checkout user change, or
`wt-applied-writing-lecture` edit.

### Addendum Verification Corrections

Before DEV readiness, the revised plan must add four observable checks:

1. same-grade substitution is accepted only by the sole authority's mechanical
   eligibility rule and preserves the requested thinking capability;
2. no Auto-Next relay stage uses a parent-owned subagent or inherited/forked
   history as its direct successor;
3. the live transition records a write-held readiness acknowledgement, the
   predecessor's final worktree commit, release, and the successor's re-proof of
   that exact final HEAD before its first write; and
4. a zero-Must-Fix PA verdict leaves no unchecked plan-owned blocker before the
   direct DEV dispatch.

The existing exact-head verification, single-authority scan, explicit
model/thinking dispatch scan, role-independence scan, allowed-path audit,
artifact gate, `tsc`, full proof, and post-merge main CI remain required.

### Addendum DEV Readiness

**NOT READY.** A fresh PM plan-revision task must disposition AMF-1 through
AMF-4, then create one fresh PA recheck and exit. DEV may begin only after that
recheck returns no unresolved Must Fix and the derived readiness contract is
satisfied.

### Addendum Open PO Decisions

**0.** The four blockers are mechanical consequences of the owner's already
locked single-authority and one-way-relay decisions. They do not require a new
product/process choice from the owner.

## AMF-1 through AMF-4 Fresh PA Recheck

Date: 2026-07-22
Role: third fresh PA; recheck only; no implementation or current-rule edit

### Recheck Verdict

**APPROVE. Zero unresolved Must Fix.**

- Reviewed worktree:
  `/Users/huangxuewei/Projects/wt-codex-matt-governance`
- Reviewed branch: `codex/codex-matt-governance`
- Fetched remote baseline / merge-base:
  `github/main` at `e4ae78607411d265768a0253c5c63b5f3c0d726b`
- Reviewed PM revision commit:
  `ff7d2b39e21a54c13d27b96f258001b98667ebc6`
- Released predecessor-final HEAD:
  `9974a5c52fbc521956303ae388568d497458c2bb`
- PA activation record:
  `921287aadbbecec8b292fa303e0b4fc2a40d8bec`
- Pre-recheck tree state: clean; branch ahead of `github/main` by fifteen
  commits; diff limited to this cut's `agent-entrypoint.md`, `plan.md`, and
  `pa.md`.
- Open PO Decisions: **0**.

The checked PM dispositions were treated only as an index. This recheck
cold-read the normative clauses and their observable verification requirements,
then compared the actual `e9e4f0e..ff7d2b3` plan diff. Each addendum blocker is
closed by executable rule text rather than by the checked summary itself.

### AMF -> Normative `plan.md` Disposition Checklist

- [x] **AMF-1 closed.** `Owner-Locked Model Routing` makes
  `model-routing.md` the sole current substitution authority and requires an
  ordered finite same-family/same-grade eligibility contract, requested-thinking
  support, an empty-intersection stop, and complete configured/selected-model
  evidence. `Auto-Next Dispatch Protocol` steps 2 and 4 apply that contract per
  dispatch; C-4 repeats the authority boundary without creating a second table.
- [x] **AMF-2 closed.** `Role and Fresh-Task Topology`, HR-6, HR-10,
  `One-Way Relay Topology`, C-5, and C-6 require each direct relay successor to
  be a new independently addressable Codex task. Parent-owned subagents are
  limited to permitted role-internal assistance and cannot satisfy PA, DEV,
  verification, formal-CR/re-review, QA, or RM relay boundaries. The
  non-implementing role is consistently named `verification`.
- [x] **AMF-3 closed.** `Tracked Map and Ticket State Machine` defines
  `ready-held`, `release-authorized`, and sole-writer `active`; `Auto-Next
  Dispatch Protocol` steps 5-9 require bootstrap hold, predecessor-final commit,
  exact-HEAD release, successor re-proof, first-write durable activation, and no
  predecessor write after release. HR-7, HR-10, Role Write Ownership, and C-6
  preserve the same order.
- [x] **AMF-4 closed.** `Relay Order After This PM Task` items 2-3, `PA
  Follow-Up Decisions`, DP-3, and the zero-Must-Fix routing check make DEV
  readiness derive from the latest canonical zero-Must-Fix PA verdict plus the
  durable entrypoint result/completion record. No substantive PA plan edit or
  orphaned mutable checkbox is required, and no independent plan-owned blocker
  remains unresolved.

### Verification Corrections

No further plan correction is required. The revised Verification Contract now
contains one observable clause for each addendum blocker:

1. its current-rule scan rejects out-of-family, lower-grade, and lower-thinking
   substitution and requires `missing-authority` / `dispatch-failed` when the
   eligible intersection is empty;
2. the scan rejects parent-owned subagents and inherited/forked history as
   direct relay successors;
3. the live Auto-Next smoke binds write-held readiness, predecessor-final HEAD,
   release, exact-HEAD re-proof, successor first write, acknowledgement, and
   absence of overlapping writers; and
4. the zero-Must-Fix route accepts DEV only when canonical `pa.md` and the
   durable entrypoint completion record agree, while rejecting any independent
   plan blocker.

The live PM-to-PA handoff also exercised the specified race-free ordering:
release named `9974a5c5...`, this PA re-proved that exact clean HEAD, and its
first write was the activation record `921287aa...`. That observation supports
executability but does not replace the future DEV/verification task's required
cut-level evidence.

### Allowed / Forbidden Scope Recheck

No correction is required. The existing whole-cut allowlist is sufficient and
the per-role ownership matrix remains the controlling write boundary. All
forbidden scopes remain unchanged, including product/runtime code, scripts,
workflow configuration, skill/plugin/tracker installation, production, the
main checkout's user changes, and `wt-applied-writing-lecture`.

### DEV Readiness

**READY after durable completion binding.** This canonical recheck has zero
unresolved Must Fix and requires no PM plan-revision successor. DEV may be
dispatched directly once the durable entrypoint records this verdict's exact
commit as the PA result/completion record. The owner-locked bootstrap exception
applies only because `docs/agents/model-routing.md` does not exist yet; DEV must
implement that authority and must not generalize the exception afterward.

### Should Watch

1. Preserve “Wayfinder remains responsible” as continuity of the tracked role
   and map, never as a surviving coordinator conversation.
2. Treat concrete model selections in this historical plan and dispatch records
   as evidence, not as a second current runtime routing table.

### Open PO Decisions

**0.** No new owner choice is required.
