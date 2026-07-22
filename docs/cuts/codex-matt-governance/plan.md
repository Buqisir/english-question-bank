# codex-matt-governance · plan

**Cut size: Large governance cut; touches schema, data contract, product
boundary, or teaching interpretation: no.**

**PA: required.** This cut changes cross-cut collaboration semantics and the
meaning of task/context boundaries across future work. It is reversible and
does not touch product runtime, but a wrong rule can waste weeks before a later
gate catches it. A fresh PA must challenge this plan before any current rule is
edited.

## Baseline and Routing

- Remote authority: `github/main`
- Baseline commit: `e4ae78607411d265768a0253c5c63b5f3c0d726b`
- Branch: `codex/codex-matt-governance`
- Worktree: `/Users/huangxuewei/Projects/wt-codex-matt-governance`
- Current stage: current PM complete; sole model-routing/relay addendum PA
  successor active
- Current source-of-truth entry:
  `docs/cuts/codex-matt-governance/agent-entrypoint.md`
- Current rules remain unchanged until the one-way successor chain completes
  PA disposition, DEV, verification, fresh CR, and RM.

## Goal

Make the approved two-axis collaboration model and EQB Auto-Next the single
coherent operating contract:

1. the existing **risk axis** continues to decide Small / Medium / Large /
   irreversible gates; and
2. the new **context topology axis** decides whether work stays in one bounded
   task, becomes a ticketed multi-task cut, or first needs a Wayfinder map.

The owner only starts a feature, answers questions that genuinely require
human product/teaching/experience judgment, and performs human QA. The Agent
owns research, maps, decision tickets, domain modeling, spec, implementation
tickets, DEV, verification, formal fresh CR, repair/re-review, closeout, and
automatic task-to-task continuation. This automation must reduce long-lived
context degradation without weakening any EQB risk gate.

## Owner-Locked Decisions

- The two axes are orthogonal. Risk tier never follows context size, and
  context topology never waives a risk gate.
- `AGENTS.md` remains the constitutional authority for role separation and the
  hard requirement that every dispatch selects an explicit model and thinking
  level. The one exact, mutable routing table lives in
  `docs/agents/model-routing.md`; no other current rule file copies it.
- Small and genuinely single-context work keeps the current direct-dispatch
  fast path. Ticketing and Wayfinder are situational, not universal ceremony.
- Wayfinder is the PM and total navigator for a large/foggy feature. It remains
  responsible for the frontier through research, human decisions, spec,
  implementation tickets, formal review, QA, and closeout until the map is
  completely closed.
- The owner never needs to remember or name a skill, map, ticket, spec, plan, or
  path. Rules describe required capabilities; the Agent resolves the newest
  available compatible capability and routes it automatically.
- EQB Auto-Next is explicitly authorized. After a task durably records its
  result, it creates and starts the next fresh Codex task in the correct project
  and checkout, sends the complete next-stage instruction, propagates this
  authorization, and then ends the old task.
- Auto-Next is a one-way relay, never a long-lived coordinator supervising
  downstream roles. Each task owns one current role and creates at most one
  direct successor; after the successor entry is durable and activation is
  acknowledged, the predecessor ends without waiting for the successor's
  result. Repository artifacts and commits, not a surviving PM conversation,
  coordinate the whole feature.
- Auto-Next pauses only for human QA or a named stop condition. Grilling that
  needs an owner answer stays in the current task; after the answer is recorded,
  the same task continues automatically without asking the owner to create or
  route another task.
- Multi-task shared state starts as tracked repo artifacts under
  `docs/cuts/<CUT>/`; `.scratch/` remains disposable local drafting only.
- The first three new Medium/Large cuts after this governance cut closes will
  exercise the tracked-repo topology serially. The workflow is active after
  merge; the three-cut review is an evaluation gate, not an optional trial.
- The current `applied-writing-lecture` cut is explicitly grandfathered. Do
  not retrofit, rebase, rewrite, or otherwise modify its artifacts, worktree,
  branch, gates, or next action as part of this cut.
- No skill, plugin, label set, GitHub Issue scheme, symlink, or tracker
  infrastructure is installed or initialized by this cut. Natural-language
  project routing must remain sufficient even when a named generic skill is
  not exposed in a given harness.

## Owner-Locked Model Routing

This section records the owner's ratified input for this governance cut. Once
implemented, `docs/agents/model-routing.md` is the sole current authority for
the concrete model IDs, thinking levels, role matrix, upgrades, and successor
substitution. This historical plan must not be used as a runtime lookup table.

| Next role | Required family and thinking | Upgrade rule |
| --- | --- | --- |
| Wayfinder, PM, grilling, domain modeling, spec | Sol + high | none by default |
| ordinary code research / factual investigation | Terra + medium | architecture boundary, schema, data contract, or irreversible design -> Sol + high |
| PA | Sol + high | Large, contract-level, or irreversible PA -> Sol + xhigh |
| DEV / fix DEV | Terra + medium | genuinely complex, cross-module, or repeated-failure implementation -> Terra + high |
| fresh CR / re-review / RM | Sol + high | no inheritance from DEV or prior role |
| QA preparation, verification evidence, mechanical state updates | Terra + medium | human QA remains owner-only |
| Small, clear-boundary direct modification | Terra + medium | normal risk escalation still applies |

`max` and `ultra` are not standing choices and require explicit owner direction.
Every Auto-Next dispatch independently classifies the next role, reads the
single authority, and passes both concrete `model` and `thinking` parameters to
task creation. Omitting either parameter, relying on a runtime default, or
inheriting the previous task's selection is forbidden. If the configured model
is unavailable, the dispatcher queries the current available models, chooses a
same-grade successor in the required Sol/Terra family, records the substitution
and evidence, and never silently downgrades the role tier.

## Two-Axis Routing Matrix

The two axes select different units and are evaluated independently:

| Axis | Selects | Never selects |
| --- | --- | --- |
| EQB risk axis | Small / Medium / Large / irreversible gates: PA, independent CR, QA, RM, merge and release proof | ticket count, whether a map is needed, or how many work slices fit in one context |
| Context topology axis | one bounded work slice, a serial ticket graph, or a Wayfinder-led multi-task feature | permission to remove/combine a risk-required role gate or change risk tier |

`One bounded task` means one clear work/decision slice, not one conversation
containing PM, DEV, verification, and CR. A bounded slice still receives every
fresh role context required by its risk tier. Conversely, several tickets or a
Wayfinder map do not make a cut Large on the risk axis. Wayfinder is mandatory
for a **large feature spanning several work slices**; this is distinct from a
single bounded cut merely classified Large because its surface is risky.

## Role and Fresh-Task Topology

Every stage has one explicit role owner and one primary deliverable:

| Stage | Context requirement | Deliverable / authority |
| --- | --- | --- |
| Wayfinder / PM | fresh task per map/ticket-routing stage; does not implement | map, tickets, spec routing, plan compression, unique next action |
| PA | fresh task or explicitly empty-history fresh subagent; did not author PM contract | `pa.md`; cannot implement or approve its own plan changes |
| DEV / fix DEV | genuinely new task per implementation/fix ticket | code/docs assigned by ticket, commit, DEV self-check and narrow evidence |
| PM verification | fresh non-implementing task; no surviving ancestor coordinator | consumes real exit codes, binds evidence to exact head, updates `verification.md` |
| formal CR / re-review | genuinely new no-DEV-history task | cold-read diff and contracts; canonical `cr.md` verdict |
| QA coordinator | non-implementing task that owns the `human-QA` pause | checklist, tested commit, QA evidence and resume/failure transition |
| RM | non-implementing closeout task after approved CR/QA | artifact gate, merge, main CI, compact STATUS, terminal completion |

Changing a role label inside one inherited context never establishes
independence. Initial formal CR and required re-review may not be a continuation,
handoff, or fork of DEV/fix history. If a fresh subagent mechanism is used, it
must explicitly start with empty history; default inheritance is forbidden.
No task stays alive to supervise later roles; each row hands off once and exits.

## Tracked Map and Ticket State Machine

Wayfinder is the stable PM/navigation **role and topology name**, not a required
skill identifier. The runtime resolves a compatible current capability; when
none is exposed, it executes the same contract directly from repository rules.

Minimum tracked layout:

```text
docs/cuts/<CUT>/
├── agent-entrypoint.md
├── wayfinder/
│   ├── map.md
│   ├── tickets/<D-ID>.md
│   └── assets/
├── tickets/
│   ├── index.md
│   └── <I-ID>.md
├── spec.md
├── plan.md
└── verification.md
```

Ticketed but non-Wayfinder cuts use `tickets/index.md` plus one file per
ticket. Wayfinder cuts additionally use the low-resolution map and detailed
decision tickets/assets. During the first three cuts exactly one ticket may be
active/claimed; no file-level wording claims parallel-safe locking.

Required ticket fields: stable ID/title, type/role, state, blockers,
acceptance, owner questions if any, base/expected head, result and result
commit, evidence pointer, dispatch ID/state, next role, explicit model, explicit
thinking level, upgrade/substitution reason, output path, authorization scope,
and unique next action. Allowed state transitions are:

```text
blocked -> ready -> claimed -> result-recorded -> dispatch-pending
dispatch-pending -> provisioning -> active -> closed
active -> human-QA -> result-recorded | failed
active -> failed -> ready | blocked
```

The map is only an index: each closed decision appears as one gist plus a link;
detail lives once in its ticket/asset. `spec.md` records the stable IDs and
revisions/commits of every closed decision ticket and asset it consumed. A
fresh spec task must read those sources rather than synthesizing only the
current conversation.

## Auto-Next Dispatch Protocol

Auto-Next is an idempotent two-phase state transition, not a best-effort chat
gesture:

1. Resolve the saved EQB project identity from the authoritative repo root.
2. Classify the next role, read `docs/agents/model-routing.md`, query current
   model availability, and lock the explicit model, thinking level, upgrade
   reason, and any same-grade successor substitution. This decision is made
   independently for every task and never inherits the parent selection.
3. Resolve checkout strategy: either bootstrap into an existing named
   worktree with mandatory no-write `cd`, or provision a new worktree pinned to
   the named branch/ref and expected head.
4. Write and commit a unique dispatch ID in the active ticket/entrypoint with
   state `dispatch-pending`, expected project root, branch, base/head, role,
   explicit model, explicit thinking level, upgrade/substitution reason,
   output path, capability requirements, prompt digest, and one-task
   authorization scope.
5. Create one fresh task with a hold/bootstrap instruction carrying the
   dispatch ID, role, model, thinking level, and reason. Pass both `model` and
   `thinking` explicitly to task creation. The child may inspect only enough to
   locate the durable record; it must not write before activation.
6. Record returned host/thread/client ID and provisioning state. If only a
   queued client ID exists, keep polling until a thread is identifiable or the
   failure path is proven.
7. Commit the `active` transition, then activate the child. Before any write the
   child proves `pwd`, repo root, branch, HEAD, and clean/expected status; any
   mismatch stops with `BRANCH CONFLICT`.
8. After the child acknowledges activation, record the predecessor role as
   `closed` with the successor entry and end immediately. The predecessor must
   not wait for or collect the child's result. On creation/activation failure,
   record `failed` and follow only the bounded fallback path.

Retries are idempotent. Search the dispatch ID before every retry; an ambiguous
create result never authorizes a duplicate. Persistent failure means the
initial attempt plus one retry have failed **after proving no child exists**.
Then record the concrete failure and emit one self-contained fallback prompt in
a copyable code block. Propagated authorization is least-privilege: it permits
one next in-scope task after durable writeback and carries the same stop rules;
it never grants merge, production, scope expansion, or irreversible-operation
authority.

## Human QA Pause and Resume

The QA coordinator enters `human-QA`, creates no child, and remains the task to
which the owner replies. It presents 3–5 concrete actions with what to open,
expected observations, pass criteria, and how to report a failure.

On `QA 完成，继续`, it records the tested commit and evidence, evaluates the
criteria, dispatches one fresh RM task, records that entry, and exits. On
failure it records a defect ticket against that commit, dispatches one fresh
repair DEV, records that entry, and exits. The one-way relay then proceeds
repair DEV -> fresh verification -> fresh no-DEV-history re-review -> new QA
coordinator, preserving canonical `cr.md`. The new QA task names the new commit;
an old pass cannot be reused for a new head.

The only non-QA owner-stop states are `contract-conflict`,
`missing-authority`, `irreversible-production`, `dispatch-failed`, and
`rule-conflict`. Search, test, build, implementation, or ordinary review
failure stays inside the automatic ticket/fix loop.

## Verification Evidence Levels

- Every implementation/fix ticket runs its named narrow checks. A
  non-implementing PM verifier consumes the real, unpiped exit codes and binds
  them to the exact result commit.
- `tsc` runs at plan-defined integration points and after a relevant fix.
- One cut-level full `verify:all` runs at the final combined implementation
  head before initial formal CR, unless exact-head PR CI is the permitted proof.
- `docs/cuts/<CUT>/verification.md` records command, raw exit code, base,
  verified commit, worktree status, evidence source, timestamp, and invalidation
  reason when applicable.
- Any later commit invalidates exact-head evidence. The new head receives the
  required narrow/`tsc` checks and either a new full run or exact-head CI proof
  under the unchanged merge gate.
- Fresh CR checks evidence/head binding and only adds narrow attack checks; it
  does not duplicate an unchanged full run without a named trigger.
- RM reruns only for missing evidence, changed head, overlapping rebase/merge,
  or a plan-named release check. Post-merge `main` CI remains mandatory.

## Role Write Ownership

The whole-cut allowlist is not a shared write grant:

| Role | May write |
| --- | --- |
| PM / Wayfinder | map/tickets/spec/plan decisions, `agent-entrypoint.md` routing block, `verification.md` coordination state |
| PA | `pa.md` only, plus its own task/dispatch completion fields |
| DEV / fix DEV | assigned current-rule/code surfaces, its ticket result, commit and DEV evidence; never PA/CR verdicts |
| PM verifier | `verification.md`, verified-head and next-routing fields |
| CR / re-review | canonical `cr.md`, its review ticket result and routing fields; never implementation |
| QA coordinator | QA checklist/evidence, QA ticket state and routing fields |
| RM | `cut-note.md`, closeout routing state, and compact `docs/STATUS.md` only at closeout |

Every active role may update only the machine routing/result fields for its own
stage in the entrypoint/ticket; it may not rewrite another role's substantive
artifact or verdict.

## Ten Hard Rules to Ratify

These are the only new constitutional outcomes. The eventual `AGENTS.md`
wording should be concise final-form law; explanation and examples belong in
the steering note and case law.

### HR-1 — Owner boundary and Agent responsibility

The owner only initiates a feature, answers genuinely human product/teaching/
experience decisions, and performs human QA. The Agent automatically owns all
research, planning artifacts, tickets, implementation, verification, formal
review, fixes, release administration, and task routing. Facts discoverable
from code, repository state, tests, or primary sources must not be asked back
to the owner.

### HR-2 — Repository continuity, not chat continuity

Project continuity is carried by tracked cut artifacts, commits, PR state,
remote `main`, CI, and the compact runtime index. A long-lived chat or parent
task is never the authoritative store for a multi-task initiative.

### HR-3 — Risk axis and context topology are independent

The existing risk axis continues to select PA, CR, QA, RM, and release gates.
The context topology axis independently selects one bounded task, a ticketed
multi-task cut, or Wayfinder for work that is both too large for one task and
still foggy. Neither axis may downgrade the other.

### HR-4 — Wayfinder navigation and capability routing

Wayfinder is the PM and low-resolution total navigator for large/foggy work.
It creates or resumes the frontier, does not repeat closed work, and routes
research, human decisions, domain modeling, spec, implementation, formal
review, QA, and closeout by required capability. Concrete capability or skill
names may change; owner prompts and hard rules remain capability-based. No
installation or initialization route is part of normal execution.

### HR-5 — Fresh context at durable boundaries

For a multi-task cut, each decision ticket, implementation ticket, and initial
cold-read CR uses a fresh context. Same-ticket grilling rounds, red/green
loops, one bug's reproduce/fix/regression loop, and a nearly complete Small cut
do not switch context merely for ceremony.

### HR-6 — Independence depends on context, not hierarchy

A qualifying fresh context may be a newly opened Codex task or an explicitly
pinned fresh subagent. The role contract and separation rule are identical in
both cases: PA did not author the PM decision, DEV did not approve its own
work, and CR did not participate in implementation. No prose exception may
waive this separation.

### HR-7 — Durable Auto-Next and human-QA pause

Before a multi-task stage ends, the active task writes its result, ticket/map
state, exact artifact pointers, verified branch/base/head, evidence, remaining
gates, and one unique next action. It then automatically creates and starts a
fresh Codex task in the correct project/checkout, sends a self-contained
instruction including this Auto-Next authorization, records the new task
entry, and ends the old task after activation acknowledgement without waiting
for that successor's result. The owner is never asked to create a task, copy a
Next prompt, choose a skill, or restate prior context. At human QA, Auto-Next
must pause without creating a task, present a concrete checklist, and resume
automatically after `QA 完成，继续`; a failed QA creates the repair path and
returns to human QA after fresh review.

### HR-8 — EQB gates, stop conditions, degradation, and completion

Generic planning, implementation, or review flows are inputs, not authority.
In particular, implementation-time self-review is DEV self-check only and
never satisfies the formal Medium/Large CR gate. Medium/Large still require an
independent fresh CR and canonical non-empty `cr.md`; existing verify, QA, RM,
merge, STATUS, and main-CI gates remain in force. Auto-Next may stop for owner
input only at human QA, an unresolved approved-prototype/spec/payload contract
conflict, missing authority, an imminent irreversible production operation,
persistent task-creation failure, or an irresolvable conflict between current
rule authorities. Ordinary technical difficulty, search, test failure, or
implementation failure is handled automatically. If task creation persistently
fails, the current task records the failure and emits one complete copyable
fallback prompt. When every ticket, spec criterion, CR, QA, and closeout gate
is complete, it reports `本次功能已经全部完成。` and creates no further task.

### HR-9 — Explicit, independent role-tier routing

Auto-Next must classify the next role and explicitly select both model and
thinking level from the repository's single model-routing authority before it
creates a task. The task-creation call, durable dispatch record,
`agent-entrypoint.md`, and child prompt all carry that selection and its upgrade
or substitution reason. Runtime defaults and inheritance from the parent task
are forbidden. PA, DEV, CR, verification, QA preparation, and RM are routed
independently. If the configured model is unavailable, the dispatcher queries
current availability and records a same-grade family successor; it never
silently downgrades the role tier.

### HR-10 — One-way relay; no long-lived coordinator

Each task has one current role and may create at most one direct successor.
PM/Wayfinder hands off and exits; PA hands off and exits; DEV hands to fresh
verification and exits; verification hands to fresh CR and exits; CR hands to
one fix/QA/RM successor and exits; QA pauses only for owner QA, then hands to
one fix DEV or RM successor and exits; RM closes without a successor. An
ancestor task may wait only for its direct successor's creation and activation
acknowledgement, never for its completion, and may not supervise or dispatch
later roles. Global coordination lives solely in tracked repository state,
commits, task entries, and evidence—not in a surviving PM or Wayfinder session.

## One-Way Relay Topology

There is no persistent orchestrator task that waits for PA, DEV, verification,
CR, QA, or RM. Each fresh task reconstructs only its role context from the map,
ticket, spec, plan, `agent-entrypoint.md`, commits, and verification evidence;
it writes its own result, dispatches **zero or one** direct successor, records
that entry, and exits.

| Current role | Its only direct successor |
| --- | --- |
| PM / Wayfinder | fresh PA, research/decision ticket, spec, or DEV task selected by the durable frontier |
| PA | fresh PM plan-revision task when Must Fix remains; otherwise fresh DEV |
| DEV / fix DEV | fresh non-implementing verification task |
| verification | fresh no-DEV-history CR / re-review |
| CR / re-review | fresh fix DEV when Must Fix remains; otherwise fresh QA preparation/coordinator or RM when no human QA is required |
| QA coordinator | no successor while awaiting owner; after `QA 完成，继续`, fresh RM; failed QA instead dispatches one fresh fix DEV |
| RM | none; close the cut and report terminal completion |

The predecessor may wait only for creation/provisioning and activation
acknowledgement of that one successor. It must not wait for the successor's
deliverable, collect its final report, create the task after that successor, or
retain a background wait loop. The successor receives the full scoped
Auto-Next authorization so it, not an ancestor task, owns the following relay.

## Seven Conflicts the Implementation Must Resolve

### C-1 — Local scratch tracker vs durable cross-task truth

Current issue guidance permits local `.scratch/` drafts but correctly says
they are not shared truth. A Wayfinder map or ticket sequence cannot depend on
gitignored local files across fresh tasks/worktrees.

Required resolution:

- keep `.scratch/` for disposable drafts;
- define tracked Wayfinding operations under
  `docs/cuts/<CUT>/wayfinder/` (map, one file per decision ticket, blockers,
  status/claim, resolution, and asset links);
- keep the first three cuts serial so file-based claim coordination does not
  pretend to support concurrency;
- do not create GitHub Issues, labels, or external tracker infrastructure in
  this cut.

### C-2 — Conversation-only spec synthesis vs distributed decisions

A generic spec flow may assume the current conversation contains all accepted
decisions. In a Wayfinder cut, the map is only an index and detail lives in
closed tickets and linked assets.

Required resolution:

- a spec phase must read the low-resolution map and then open every closed
  decision ticket/asset relevant to the destination;
- `spec.md` compresses accepted product and implementation decisions without
  copying the whole research history;
- the cut's `plan.md` remains the operational contract (baseline, scope,
  forbidden files, verify, gates) and links the spec rather than silently
  rewriting it.

### C-3 — Implementation self-review vs independent EQB CR

A generic implementation flow may call code review inside its own context.
That is useful self-checking but violates EQB's formal reviewer independence if
treated as the merge gate.

Required resolution:

- DEV may self-check Standards and Spec before reporting completion;
- the implementation task cannot write the authoritative CR verdict;
- Medium/Large initial CR runs in a fresh context, reviews a fixed baseline and
  the named spec/ticket/plan, and writes `docs/cuts/<CUT>/cr.md` using EQB's
  findings vocabulary;
- Must Fix implementation occurs in a new fix task; subsequent review reads the
  prior `cr.md` and the fixed diff without inheriting implementation chat.

### C-4 — Drift-prone model/skill names vs single routing authority

The target workflow needs explicit Codex-native model/thinking selection, while
concrete model IDs and named skills can drift. Copying a routing table across
constitutional law, steering, personas, templates, and prompts would create
conflicting current authorities.

Required resolution:

- `AGENTS.md` contains only the stable law: every dispatch independently
  classifies the next role and explicitly selects model/thinking from the sole
  routing authority; omission, defaults, and inheritance are forbidden;
- `docs/agents/model-routing.md` is the only current file containing the exact
  role -> concrete model ID -> thinking table, upgrade triggers, unavailable
  model successor rule, and prohibition on standing `max`/`ultra`;
- steering, personas, templates, dispatch records, and prompts point to that
  authority and record only the selection used for the specific dispatch;
- task creation passes both parameters explicitly, and PA/DEV/CR/RM selections
  are independent even when adjacent tasks use different families;
- if a configured model is unavailable, runtime capability discovery chooses a
  same-grade Sol/Terra successor and records the replacement instead of silently
  weakening the role;
- owner-facing commands and stable hard rules name required capabilities rather
  than making the owner remember a skill catalogue; an unavailable named skill
  degrades to the capability contract, not owner routing or infrastructure
  setup; and
- historical cut records remain untouched and are not mistaken for current
  positive instructions.

### C-5 — Verification ownership across fresh tasks vs duplicate full suites

Current rules require PM to independently consume real exit codes after DEV.
A multi-task topology must preserve that responsibility without forcing every
later task to rerun identical full verification on an unchanged commit.

Required resolution:

- the implementation-ticket PM task independently runs the plan's narrow
  verify, `tsc`, and one full verify after DEV and records exact commands,
  exit codes, and verified commit in a tracked artifact;
- fresh CR checks that the evidence belongs to the reviewed head but does not
  substitute for or blindly duplicate PM verification;
- RM/closeout re-resolves remote branch/head and consumes the CR verdict; it
  reruns verification only when evidence is missing, the verified head changed,
  the branch was rebased/merged with overlapping main changes, or the plan
  names an additional release check;
- post-merge main CI remains mandatory.

### C-6 — Manual Next handoff vs automatic fresh-task continuation

The previous PM contract ended each stage with a copyable Next instruction.
That still makes the owner the workflow router and encourages old contexts to
continue merely because task creation is inconvenient.

Required resolution:

- `agent-entrypoint.md` contains machine-actionable current stage, project,
  checkout/worktree or branch, inputs, output path, acceptance/gates, verified
  head, and unique next action;
- after durable writeback, the active task discovers the current Codex
  task-creation capability, creates a truly fresh task in the correct EQB
  project and checkout, sends the full next-stage prompt, and propagates the
  Auto-Next authorization;
- initial formal CR and required re-review must not inherit DEV conversation
  history; they cold-read repository contracts and the final diff;
- the old task reports the completed stage and new task entry, then ends;
- manual copy/paste is forbidden during normal operation and is allowed only
  after task creation persistently fails; the fallback contains the complete
  prompt in one copyable code block and the concrete failure reason;
- once the feature is fully closed, task creation stops rather than generating
  an empty follow-up.

### C-7 — Automatic flow vs human-QA and exceptional stop boundaries

Unqualified automation could either interrupt the owner too often or run past
a decision/operation that only the owner may authorize.

Required resolution:

- human QA is the normal pause: do not create a next task; state what to open,
  actions, observations, pass criteria, and failure-report format;
- on `QA 完成，继续`, record the QA result/evidence, check acceptance, then
  resume Auto-Next and create the next fresh task automatically;
- failed QA records a defect ticket, dispatches fresh repair DEV, runs fresh
  review, and returns to human QA;
- all other owner stops are limited to unresolved contract contradiction,
  missing permission, imminent irreversible production operation, persistent
  task-creation failure, or irresolvable current-rule conflict;
- ordinary technical failures stay inside the automatic research/fix/review
  loop and never become owner routing work.

## Artifact and Vocabulary Contract

- **Initiative**: a planning wrapper used only when work needs multiple fresh
  tasks; it is not automatically a PR or release unit.
- **Ticket**: one context-sized decision or implementation slice. It must have
  one question/deliverable, blockers, acceptance criteria, state, and result.
- **Cut**: the EQB gate/merge/release unit governed by existing Small/Medium/
  Large rules. One cut may contain several serial checkpoint tickets while it
  stays within the PR size gate. If the size gate or release boundary is
  crossed, split into multiple cut directories/program entries rather than
  stretching one PR.
- `agent-entrypoint.md` is mandatory only for the multi-stage/multi-task
  topology and remains optional for ordinary bounded cuts. For Auto-Next it is
  the executable routing contract, not a narrative handoff.
- `docs/STATUS.md` points to the active cut/entrypoint at major phase changes;
  it does not duplicate per-ticket detail or update on every red/green loop.
- The map is a low-resolution index. Decision detail lives once, in its ticket.
- `handoff.md` remains exceptional: use it for a true mid-ticket interruption
  or out-of-scope branch, not at every clean phase boundary.
- Every newly created task entry is recorded durably enough for another task to
  determine whether it exists, completed, failed, or needs attention without
  asking the owner.

## Allowed Modification Scope After PA

DEV may edit only the current collaboration-rule surfaces required to make one
coherent contract:

- `AGENTS.md`
- `docs/steering/codex-matt-workflow.md` (create the active detailed guide)
- `docs/steering/README.md`
- `docs/steering/cut-workflow-protocol.md`
- `docs/agents/dispatch-protocols.md`
- `docs/agents/model-routing.md` (create the single exact Codex model/thinking
  authority)
- `docs/agents/review-levels.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/pa-persona.md`
- `docs/agents/cr-persona.md`
- `docs/cuts/_templates/README.md`
- `docs/cuts/_templates/agent-entrypoint.md` (update the existing canonical
  machine-actionable Auto-Next entry contract)
- `docs/cuts/_templates/pa-prompt-template.md`
- `docs/cuts/_templates/big-cr-prompt-template.md`
- `docs/cuts/_templates/qa-checklist.md`
- `docs/steering/dev-completion-protocol.md`
- `docs/agents/case-law.md`
- this cut's `plan.md`, `pa.md`, `cr.md`, `cut-note.md`, and
  `agent-entrypoint.md`, plus optional tracked `verification.md`
- `docs/STATUS.md` only at RM closeout, within its compact-entry cap

PA may remove a listed file from scope or require an additional current-rule
surface when it proves a named contradiction. PM must record that disposition
before DEV; DEV cannot expand the list on its own.

## Forbidden Scope

- No changes under `app/`, `server/`, `schemas/`, data/assets/import paths,
  product UI, tests of business behavior, deployment, secrets, or production
  configuration.
- No changes to `.github/workflows/**`.
- No changes under `scripts/**` or `.claude/agents/**`.
- No skill/plugin installation, initialization, copying, bridging, symlink
  changes, user-level configuration, label creation, GitHub Issues, or tracker
  provisioning.
- No edits to `.claude/skills/**`, `/Users/huangxuewei/.claude/skills/**`,
  `/Users/huangxuewei/.codex/skills/**`, or Coding Brain.
- No change to Small/Medium/Large risk definitions, PA triggers, Medium/Large
  fresh-CR requirement, browser/owner QA triggers, RM artifact gate, merge
  authority, production brakes, or post-merge main-CI requirement except the
  narrowly specified cross-task verification-evidence rule in C-5.
- No second current exact model/thinking table outside
  `docs/agents/model-routing.md`; `AGENTS.md` contains only the stable routing
  law and pointer.
- No mass rewrite of historical cuts, archived STATUS entries, old handoffs,
  prior role names, or historical Workflow descriptions.
- No modification of the current main checkout's user changes.
- No modification, rebase, merge, cleanup, handoff rewrite, or status rewrite
  of `/Users/huangxuewei/Projects/wt-applied-writing-lecture`, its branch, or
  its cut artifacts.
- No DEV, rule-text edit, PA self-implementation, CR, merge, or push during the
  current PM stage.

## Relay Order After This PM Task

This is the durable cut route for **future successor tasks**, not a todo list
owned or supervised by the current PM task:

1. The current PM records the addendum-PA dispatch, activates that one successor,
   and exits.
2. The fresh PA appends its verdict to canonical `pa.md`. If Must Fix remains,
   PA creates one fresh PM plan-revision task; if none remains, PA creates one
   fresh DEV task. PA then exits.
3. The fresh plan-revision task, if needed, closes only the recorded PA gaps,
   then creates one new PA recheck and exits.
4. Fresh DEV edits only the allowed current-rule surfaces, commits its result,
   creates one fresh non-implementing verification task, and exits.
5. Fresh verification binds all required evidence to the exact implementation
   head, creates one fresh no-DEV-history CR, and exits.
6. Fresh CR writes canonical `cr.md`; it creates one fresh fix DEV when Must Fix
   exists, otherwise one fresh RM task because this governance cut needs no
   human QA, then exits. A fix DEV repeats DEV -> verification -> re-review.
7. Fresh RM writes `cut-note.md`, consumes the approved verdict, runs the Large
   artifact gate, merges, watches `main` CI, updates compact STATUS, reports
   terminal completion, and creates no successor.
8. The first three new qualifying cuts then use this active topology; their
   tracked state records the evaluation metrics without reviving a supervisor
   task.

## Verification Contract

### PM/DEV narrow checks

1. `git diff --check github/main...HEAD`
2. `git diff --name-only github/main...HEAD` contains only the allowed
   collaboration/cut files; forbidden product/runtime paths count must be zero.
3. Targeted current-rule scan proves:
   - risk tier and context topology are described as independent axes;
   - `AGENTS.md` contains only the stable explicit-routing law and points to
     `docs/agents/model-routing.md` as the sole exact authority;
   - no second current model/thinking table exists;
   - every task-creation route passes explicit model and thinking values and
     records role, selection, and upgrade/substitution reason;
   - PA, DEV, verification, CR, QA preparation, and RM select independently;
   - unavailable configured models trigger a recorded same-grade successor
     lookup rather than silent downgrade;
   - Small direct dispatch remains available;
   - Medium/Large fresh CR and canonical `cr.md` remain mandatory;
   - `.scratch/` is not a multi-task shared source of truth;
   - implementation self-review is not the formal CR gate;
   - multi-task exit state is durable before automatic task creation;
   - normal completion creates the next task automatically and does not ask the
     owner to copy a prompt, select a capability, or restate context;
   - each task has one current role, creates at most one direct successor, and
     exits after activation without waiting for downstream completion;
   - no PM/Wayfinder/ancestor task retains a wait loop or dispatches later
     roles on a successor's behalf;
   - fresh CR/re-review tasks do not inherit DEV conversation history;
   - human QA pauses task creation and `QA 完成，继续` resumes it;
   - only the five owner stop conditions and human QA interrupt Auto-Next;
   - full feature completion creates no further task;
   - no current positive instruction invokes installation or initialization
     infrastructure.
4. Cross-file authority table: every role, sequence, artifact, and verification
   statement has exactly one authoritative home; other files only specialize or
   point to it.
5. Check every newly added Markdown path/link resolves in the worktree.
6. `node scripts/verify-cut-artifacts.mjs \
   docs/cuts/codex-matt-governance large` after `plan.md`, `pa.md`, `cr.md`, and
   `cut-note.md` are present and non-empty.
7. `pnpm -C app exec tsc --noEmit`
8. `pnpm -C app run verify:all` once before merge, or current-head PR CI proof
   if it already covers the exact implementation head. PM must consume real
   exit codes.

### CR focus

- Reproduce the authority map rather than trusting DEV's summary.
- Compare every proposed current-rule statement against the ten hard rules
  and seven conflict dispositions.
- Verify no same-context waiver reappears for PA or CR.
- Verify `docs/agents/model-routing.md` is the one exact model/thinking authority,
  `AGENTS.md` contains only stable law, and no current table copy drifts.
- Verify Auto-Next explicitly passes both parameters and adjacent role tasks
  never inherit one another's selection.
- Verify artifact presence is never treated as an APPROVE verdict.
- Verify the cross-task evidence rule does not allow DEV self-report or a stale
  commit to pass RM.
- Verify tracker wording is implementable with tracked files and does not claim
  unsupported parallel coordination.
- Verify Auto-Next includes correct project/checkout targeting, durable task
  entry recording, authorization propagation, true fresh-CR isolation, human
  QA pause/resume, one-successor relay exit, no long-lived coordinator, failure
  fallback, and terminal completion.

### QA disposition

- Browser QA: not required; this is process/docs-only with no user-visible
  product change.
- Owner PO QA: not required after implementation; the owner has already locked
  the two-axis direction. Any new product/process choice surfaced by PA must
  return as an explicit PO decision before DEV.
- Production deployment: forbidden and not applicable.

## PA Questions

The PA must answer these directly:

1. Do the two axes stay orthogonal in every current rule surface, with no route
   that lets context size downgrade risk gates?
2. Do HR-5/HR-6 preserve genuine independence for top-level fresh tasks and
   fresh subagents without reviving a same-context waiver or forked DEV history
   in formal CR?
3. Does C-5 preserve independent PM verification while avoiding unsafe reuse
   of stale or mismatched evidence?
4. Are tracked Wayfinder operations sufficiently specified for a serial
   three-cut start without external tracker infrastructure?
5. Is the allowed file list complete and minimal, and are any listed changes
   unnecessary duplication?
6. Are C-6/C-7 executable with current Codex task-creation capabilities while
   remaining capability-based and safely degradable when a capability is
   absent?
7. Does the model-routing addendum establish exactly one mutable authority,
   explicit `model` + `thinking` creation parameters, independent role
   selection, and recorded same-grade successor substitution without copying
   the table into `AGENTS.md` or other current protocols?
8. Can every eventual constitutional sentence be written as final-form law,
   with narrative, model examples, fixed context numbers, and skill catalogues
   kept out of `AGENTS.md`?
9. Does the one-way relay guarantee one current role, at most one direct
   successor, predecessor exit after activation, QA-only pause, and no surviving
   PM/Wayfinder task that waits for or dispatches downstream roles?

PA output must include verdict, Must Fix, Must Fix → `plan.md` disposition
checklist, Should Watch, allowed/forbidden file corrections, verification
corrections, DEV readiness, and at most three open PO decisions.

## PA Follow-Up Decisions

- [x] **MF-1:** `Two-Axis Routing Matrix` defines a bounded work slice separately
  from risk-required fresh gates and distinguishes feature size from risk tier.
- [x] **MF-2:** `Tracked Map and Ticket State Machine` makes Wayfinder a stable
  role/topology, locks tracked paths, serial claims, states, required fields,
  and consumed-decision revisions for spec synthesis.
- [x] **MF-3:** `Role and Fresh-Task Topology` assigns each role and deliverable,
  requires a non-implementing verifier, and forbids continuation/handoff/fork
  history for initial CR and re-review.
- [x] **MF-4:** `Auto-Next Dispatch Protocol` locks project/checkout resolution,
  pending/provisioning/active states, hold/activate order, idempotent retry,
  scoped authorization, and durable completion/failure.
- [x] **MF-5:** `Human QA Pause and Resume` assigns the paused coordinator and
  defines pass, failed-QA repair, independent verification, fresh re-review,
  return-to-QA, and all five durable exceptional stop states.
- [x] **MF-6:** `Verification Evidence Levels` separates per-ticket narrow proof
  from one exact-final-head full proof and defines evidence reuse/invalidation.
- [x] **MF-7:** `Allowed Modification Scope` uses the existing canonical
  entrypoint template, includes the seven omitted current surfaces and optional
  ledger, forbids scripts/agent definitions, and `Role Write Ownership` limits
  each role's writes.
- [ ] **Owner model-routing and one-way-relay addendum:** a second fresh PA must confirm
  `Owner-Locked Model Routing`, HR-9, C-4, the enriched dispatch fields, the
  sole-authority file, HR-10, the no-coordinator relay, verification scans, and
  updated allowlist before DEV.

The initial seven Must Fix items are dispositioned with zero PO questions. DEV
remains blocked only on the fresh model-routing/one-way-relay addendum review
and any Must Fix that review discovers.

## Decision-Point Checklist

- [x] DP-0 — Owner finally ratified the two-axis model, owner/Agent boundary,
  Wayfinder total navigation, and full Auto-Next authorization.
- [x] DP-1 — PM fetched latest `github/main`, established the isolated worktree
  at `e4ae786`, and updated the durable entrypoint/plan for final owner
  ratification without changing current rules or the in-flight
  application-writing cut.
- [x] DP-2 — Fresh PA wrote `pa.md`, returned seven Must Fix items, and left zero
  PO decisions.
- [ ] DP-3 — PM has dispositioned all seven initial Must Fix items; fresh PA
  addendum review must approve the owner-locked model-routing and one-way-relay
  changes before DEV readiness is declared.
- [ ] DP-4 — Fresh DEV implements only the allowed rule/document surfaces.
- [ ] DP-5 — PM verifies scope and the exact implementation head with real exit
  codes.
- [ ] DP-6 — Fresh CR writes `cr.md`; all Must Fix findings close.
- [ ] DP-7 — RM artifact gate, merge, main CI, compact STATUS, and three-cut
  evaluation pointer complete.
