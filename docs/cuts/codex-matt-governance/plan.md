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
- Current stage: PM contract complete; stop before fresh PA
- Current source-of-truth entry:
  `docs/cuts/codex-matt-governance/agent-entrypoint.md`
- Current rules remain unchanged until PA finishes and PM dispositions are
  recorded in this plan.

## Goal

Make the approved two-axis collaboration model the single coherent EQB
operating contract:

1. the existing **risk axis** continues to decide Small / Medium / Large /
   irreversible gates; and
2. the new **context topology axis** decides whether work stays in one bounded
   task, becomes a ticketed multi-task cut, or first needs a Wayfinder map.

The context axis must reduce long-lived-task degradation without weakening
fresh PA, fresh DEV, independent verification, fresh CR, browser/owner QA,
artifact gates, merge discipline, or post-merge main CI.

## Owner-Locked Decisions

- The two axes are orthogonal. Risk tier never follows context size, and
  context topology never waives a risk gate.
- `AGENTS.md` remains the only authority for roles, model/effort defaults, and
  execution sequence. Other current rule files point to it instead of copying
  model tables.
- Small and genuinely single-context work keeps the current direct-dispatch
  fast path. Ticketing and Wayfinder are situational, not universal ceremony.
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

## Six Hard Rules to Ratify

These are the only new constitutional outcomes. The eventual `AGENTS.md`
wording should be concise final-form law; explanation and examples belong in
the steering note and case law.

### HR-1 — Repository continuity, not chat continuity

Project continuity is carried by tracked cut artifacts, commits, PR state,
remote `main`, CI, and the compact runtime index. A long-lived chat or parent
task is never the authoritative store for a multi-task initiative.

### HR-2 — Risk axis and context topology are independent

The existing risk axis continues to select PA, CR, QA, RM, and release gates.
The context topology axis independently selects one bounded task, a ticketed
multi-task cut, or Wayfinder for work that is both too large for one task and
still foggy. Neither axis may downgrade the other.

### HR-3 — Fresh context at durable boundaries

For a multi-task cut, each decision ticket, implementation ticket, and initial
cold-read CR uses a fresh context. Same-ticket grilling rounds, red/green
loops, one bug's reproduce/fix/regression loop, and a nearly complete Small cut
do not switch context merely for ceremony.

### HR-4 — Independence depends on context, not hierarchy

A qualifying fresh context may be a newly opened Codex task or an explicitly
pinned fresh subagent. The role contract and separation rule are identical in
both cases: PA did not author the PM decision, DEV did not approve its own
work, and CR did not participate in implementation. No prose exception may
waive this separation.

### HR-5 — Multi-task exit contract

Before a multi-task stage ends, the active task writes its result, current
stage, exact artifact pointers, verified branch/base/head, remaining gates, and
one unique next action to `agent-entrypoint.md` or the named ticket. Only after
the durable state is current may chat return one copyable `Next：新开任务……`
instruction. Completed work and ordinary Small cuts do not manufacture an
empty handoff ritual.

### HR-6 — EQB gates override generic flow defaults

Generic planning, implementation, or review flows are inputs, not authority.
In particular, implementation-time self-review is DEV self-check only and
never satisfies the formal Medium/Large CR gate. Medium/Large still require an
independent fresh CR and canonical non-empty `cr.md`; existing verify, QA, RM,
merge, STATUS, and main-CI gates remain in force.

## Five Conflicts the Implementation Must Resolve

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

### C-4 — Duplicate model tables vs one constitutional authority

The target workflow explanation currently risks restating model/effort choices
that can drift independently of `AGENTS.md`.

Required resolution:

- exact roles, models, effort defaults, and upgrade exceptions appear only in
  `AGENTS.md`;
- steering, personas, templates, and dispatch instructions point to the
  current tier table;
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
  topology and remains optional for ordinary bounded cuts.
- `docs/STATUS.md` points to the active cut/entrypoint at major phase changes;
  it does not duplicate per-ticket detail or update on every red/green loop.
- The map is a low-resolution index. Decision detail lives once, in its ticket.
- `handoff.md` remains exceptional: use it for a true mid-ticket interruption
  or out-of-scope branch, not at every clean phase boundary.

## Allowed Modification Scope After PA

DEV may edit only the current collaboration-rule surfaces required to make one
coherent contract:

- `AGENTS.md`
- `docs/steering/codex-matt-workflow.md` (create the active detailed guide)
- `docs/steering/README.md`
- `docs/steering/cut-workflow-protocol.md`
- `docs/agents/dispatch-protocols.md`
- `docs/agents/review-levels.md`
- `docs/agents/issue-tracker.md`
- `docs/cuts/_templates/README.md`
- `docs/agents/case-law.md`
- this cut's `plan.md`, `pa.md`, `cr.md`, `cut-note.md`, and
  `agent-entrypoint.md`
- `docs/STATUS.md` only at RM closeout, within its compact-entry cap

PA may remove a listed file from scope or require an additional current-rule
surface when it proves a named contradiction. PM must record that disposition
before DEV; DEV cannot expand the list on its own.

## Forbidden Scope

- No changes under `app/`, `server/`, `schemas/`, data/assets/import paths,
  product UI, tests of business behavior, deployment, secrets, or production
  configuration.
- No changes to `.github/workflows/**`.
- No skill/plugin installation, initialization, copying, bridging, symlink
  changes, user-level configuration, label creation, GitHub Issues, or tracker
  provisioning.
- No edits to `.claude/skills/**`, `/Users/huangxuewei/.claude/skills/**`,
  `/Users/huangxuewei/.codex/skills/**`, or Coding Brain.
- No change to Small/Medium/Large risk definitions, PA triggers, Medium/Large
  fresh-CR requirement, browser/owner QA triggers, RM artifact gate, merge
  authority, production brakes, or post-merge main-CI requirement except the
  narrowly specified cross-task verification-evidence rule in C-5.
- No second current model/effort table outside `AGENTS.md`.
- No mass rewrite of historical cuts, archived STATUS entries, old handoffs,
  prior role names, or historical Workflow descriptions.
- No modification of the current main checkout's user changes.
- No modification, rebase, merge, cleanup, handoff rewrite, or status rewrite
  of `/Users/huangxuewei/Projects/wt-applied-writing-lecture`, its branch, or
  its cut artifacts.
- No DEV, rule-text edit, PA self-implementation, CR, merge, or push during the
  current PM stage.

## Implementation Order After PA

1. **Fresh PA only**: cold-read this plan, the five current rule sources, and
   the five conflicts; write `pa.md` with verdict and Must Fix mapping.
2. **PM compression**: resolve at most three PO decisions, record every PA Must
   Fix under `PA Follow-Up Decisions`, update this plan and the entrypoint, and
   commit before DEV.
3. **Fresh DEV**: edit only the allowed current-rule surfaces. Start with the
   authority map (`AGENTS.md` final law), then the detailed steering guide,
   tracker operations, cut/dispatch/review protocols, templates, and case law.
4. **PM verification**: confirm scope, contradiction scans, Markdown/artifact
   integrity, `tsc`, and one full verify with real exit codes bound to the
   implementation head.
5. **Fresh CR**: cold-read the full diff on Standards and Spec axes, explicitly
   attack all five conflicts, write canonical `cr.md`, and block on Must Fix.
6. **Must Fix loop if needed**: new fix task, PM re-verification of the changed
   head, then fresh review of the fix delta and full current diff.
7. **RM closeout**: write `cut-note.md`, consume the CR verdict (not merely file
   presence), run the Large artifact gate, merge, watch `main` CI, and add a
   compact STATUS entry.
8. **Three-cut evaluation**: apply the active topology only to the next new
   qualifying cuts; after three, review task length, handoff count, duplicate
   verification, CR Must Fixes, and owner navigation burden. Any rule change
   from that review requires its own governance decision.

## Verification Contract

### PM/DEV narrow checks

1. `git diff --check github/main...HEAD`
2. `git diff --name-only github/main...HEAD` contains only the allowed
   collaboration/cut files; forbidden product/runtime paths count must be zero.
3. Targeted current-rule scan proves:
   - risk tier and context topology are described as independent axes;
   - `AGENTS.md` remains the only exact model/effort authority;
   - Small direct dispatch remains available;
   - Medium/Large fresh CR and canonical `cr.md` remain mandatory;
   - `.scratch/` is not a multi-task shared source of truth;
   - implementation self-review is not the formal CR gate;
   - multi-task exit state is durable before a copyable Next instruction;
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
- Compare every proposed current-rule statement against the six hard rules and
  five conflict dispositions.
- Verify no same-context waiver reappears for PA or CR.
- Verify exact model/effort copies do not drift outside `AGENTS.md`.
- Verify artifact presence is never treated as an APPROVE verdict.
- Verify the cross-task evidence rule does not allow DEV self-report or a stale
  commit to pass RM.
- Verify tracker wording is implementable with tracked files and does not claim
  unsupported parallel coordination.

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
2. Does HR-4 preserve genuine independence for top-level fresh tasks and fresh
   subagents without reviving a same-context waiver?
3. Does C-5 preserve independent PM verification while avoiding unsafe reuse
   of stale or mismatched evidence?
4. Are tracked Wayfinder operations sufficiently specified for a serial
   three-cut start without external tracker infrastructure?
5. Is the allowed file list complete and minimal, and are any listed changes
   unnecessary duplication?
6. Can every eventual constitutional sentence be written as final-form law,
   with narrative and model examples kept out of `AGENTS.md`?

PA output must include verdict, Must Fix, Must Fix → `plan.md` disposition
checklist, Should Watch, allowed/forbidden file corrections, verification
corrections, DEV readiness, and at most three open PO decisions.

## PA Follow-Up Decisions

Pending fresh PA. DEV is blocked until this section records every Must Fix
disposition and the entrypoint advances to DEV-ready.

## Decision-Point Checklist

- [x] DP-0 — Owner ratified the two-axis reconciliation direction and limited
  this task to PM artifacts only.
- [x] DP-1 — PM fetched latest `github/main`, established the isolated worktree
  at `e4ae786`, and wrote the durable entrypoint and plan without changing
  current rules or the in-flight application-writing cut.
- [ ] DP-2 — Fresh PA writes `pa.md` and leaves at most three PO decisions.
- [ ] DP-3 — PM records every PA Must Fix disposition and declares DEV ready.
- [ ] DP-4 — Fresh DEV implements only the allowed rule/document surfaces.
- [ ] DP-5 — PM verifies scope and the exact implementation head with real exit
  codes.
- [ ] DP-6 — Fresh CR writes `cr.md`; all Must Fix findings close.
- [ ] DP-7 — RM artifact gate, merge, main CI, compact STATUS, and three-cut
  evaluation pointer complete.
