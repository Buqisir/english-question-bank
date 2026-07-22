---
inclusion: auto
---

# Cut workflow protocol

Scope: applies to small, medium, and large product / engineering cuts
in the `Buqisir/english-question-bank` repository, with special
attention to PaperSurface, Paper Intelligence, data-model, and
multi-agent work.

Authoritative rule: process must be paced by risk. The goal is not to
make agents write code faster; the goal is to protect teacher value,
PaperSurface readability, repo state truth, and rework cost without
turning small fixes into rituals.

Current roles, models, and execution sequence are authoritative only in the
`AGENTS.md` Dispatch map. This protocol defines risk tier, upgrade conditions,
QA, artifact, handoff, and size gates. Historical cut records naming 小川 /
external agents are read as 阿澈 wearing the matching hat.

For multi-task topology, use `codex-matt-workflow.md`. Context size does not
alter Small/Medium/Large/irreversible gates; every required fresh role remains a
separate task under the one-way Auto-Next relay.

---

## 1. First principles

Optimize for:

- the teacher task being served
- the A4 paper remaining primary
- fewer wrong-direction implementation loops
- review effort placed only where it actually changes risk

Do not optimize for:

- starting DEV as quickly as possible
- showing every available AI-generated datum
- making a UI impressive before it is useful
- using more agents as a substitute for making a product decision

## 2. Risk tiers

Use the smallest process that covers the risk.

### Small cut

Examples: typo, docs wording, verify-only update, narrow bug with one
obvious fix.

Execution sequence: use the `AGENTS.md` Dispatch map. Small cuts may use PM
CR-lite; no Small-cut artifact ceremony is required by default.

Small cuts are "tighten a screw" work.

Use small-cut flow when all are true:

- the intended change is easy to state in one sentence
- no product direction is being decided
- no data model, route, PaperSurface protocol, or architecture boundary
  changes
- the expected diff is narrow and easy to review
- the verification needed is obvious

Small-cut required checks:

- sync first if the work depends on current repo state
- confirm the diff scope before staging
- run the smallest relevant verify command
- always run `git diff --check` before PR / merge
- if a PR is opened, confirm the PR head after push
- after merge, fetch `main` and confirm the merge commit

Small cuts skip mockups, formal PA, browser QA (unless visible UI
changed), and Cut Notes (unless the fix changes a recurring rule).

Upgrade a small cut to medium if:

- the fix changes visible behavior
- the exact UI outcome is not obvious
- the diff touches more than the expected file family
- a "quick fix" starts requiring layout, state, or z-index reasoning

### Medium cut

Examples: small interaction, limited CSS behavior, a known UI bug, a
single harness change with bounded blast radius.

PA follows the `AGENTS.md` Dispatch map: Large or irreversible work requires
fresh PA before DEV. Only the PA-lite downgrade cases listed there may apply;
the plan header records the reason and CR reviews it. Medium's fresh CR report
is `cr.md`, required by the RM artifact gate.

Medium cuts are "adjust one local mechanism" work.

Use medium-cut flow when:

- the direction is already known
- the change affects a user-visible behavior or a bounded runtime path
- the blast radius is local to one surface / module family
- no data model or core protocol is being redefined
- one browser QA pass can prove the main risk

Quick PM grill should answer:

- What exact user action currently fails or feels wrong?
- Which teacher task is affected?
- What is the expected before/after behavior?
- Which files are allowed, and which are forbidden?
- Is this still a local fix, or is it secretly a product redesign?

Medium-cut required checks:

- sync first and confirm branch / PR head
- name allowed and forbidden files before DEV
- run relevant static verify
- run browser QA for visible UI changes
- run PO QA when product feel or interaction handoff matters
- keep CR focused on whether the implementation matches the known
  direction

Upgrade a medium cut to large if any appear:

- PaperSurface core renderer or shared/papersurface protocol must change
- data model, import/export contract, route behavior, or anchor protocol
  must change
- more than one breakpoint needs redesign
- a quick mockup does not converge in one round
- CR discovers DEV is inventing product behavior not in the prompt
- QA shows "fixing this one thing breaks another thing" behavior
- the user-visible goal cannot be explained as a local bug or local
  interaction improvement

### Large cut

Examples: PaperSurface layout, rail/drawer/overlay behavior, data model,
anchor protocol, evidence geometry, import/export flow, or any sequence
where a wrong direction would create substantial rework.

Execution sequence: use the `AGENTS.md` Dispatch map. Large cuts retain their
PA trigger, browser / PO QA conditions, fresh CR, and Cut Note gate; Big CR is
an additional risk or owner-triggered depth, not a replacement for routine CR.

## 2.5 Size gates and cut records

These gates exist to keep reviewable units reviewable. They are not a
reason to add ceremony to small fixes.

### Single-PR size gate

Target limits for one PR:

- at most 3,500 changed lines
- at most 15 runtime files

Runtime files are application, server, schema, script, and migration
files. Docs, prompts, cut notes, and review artifacts do not count as
runtime files, but they still count toward reviewer attention.

If a PR exceeds either target, the cut must either:

- split into smaller PRs with explicit merge order, or
- record a PA / PM-approved exception in the cut entrypoint and PR
  body, including rollback boundary and verification evidence.

Do not rely on "one goal" to mean "one PR." A goal may contain multiple
ordered PRs.

### Cut entrypoint and handoff

Medium and large cuts must have a stable routing file before review subagents or
long-running DEV begins — for most cuts `plan.md` itself is enough. Add
`agent-entrypoint.md` only for multi-stage, long-running, parallel, cross-session
handoff, or independent reading navigation:

```text
docs/cuts/<CUT>/agent-entrypoint.md
```

The entrypoint lists the cut id, current stage, required reading, output
path, allowed / forbidden scope, and the next expected artifact. Chat
messages should route agents to this file; decisions belong in repo
files, not only in chat.

Entry points should split reading into two layers:

- `Must Read`: cut-specific, at most 5 files, needed for the immediate
  task.
- `Background`: steering / domain / process files to skim only if the
  agent is unfamiliar or has not already loaded them in the session.

Do not put files in Must Read merely because they might be useful.

### Review Prompt Templates

Use templates instead of rewriting PA / Big CR boilerplate by hand:

```text
docs/cuts/_templates/pa-prompt-template.md
docs/cuts/_templates/big-cr-prompt-template.md
```

Prompt files should fill only the cut id, branch / PR, output path,
cut-specific reading, review focus, and extra counts.

### Repo-file handoff rule

For multi-agent work, repo files are the transport layer. The following
artifacts must be written to a named repo path before they are used by
another agent:

- PM specs and plans
- PA reports, Big CR reports
- browser QA checklists / PO QA contracts
- handoffs, Cut Notes, and watch ledgers

Chat should only contain routing text such as "read this file, write the
next report to that file." If a material decision was made in chat
during a grill, it must be copied into the cut's `plan.md`,
`agent-entrypoint.md`, or `handoff.md` before DEV or review continues.

When a cut pauses, changes owner, or crosses a context boundary, write:

```text
docs/cuts/<CUT>/handoff.md
```

The handoff records current truth, remaining gates, known risks, and the
next concrete action.

### Cut Note gate

Large cuts must have a Cut Note before RM merge. Medium cuts need one
when they change a recurring product rule, expose a repeated bug
pattern, or leave follow-up risk.

Minimum Cut Note fields:

- what shipped
- what was cut, moved, or deliberately not done
- wrong assumptions discovered
- verify and browser QA evidence
- follow-up gates / watch items
- start date, merge date, PA rounds, Big CR rounds, Must Fix count

Should Watch items from PA / CR must either be copied into the cut note
or linked to the relevant ledger. Do not let watch items live only in
chat history.

### RM artifact gate

Before RM merge for medium / large cuts, the RM hat must check the
required cut artifacts. Missing or empty required artifacts stop the
merge; do not paper over the gap in chat.

Medium cut checklist:

- `docs/cuts/<CUT>/plan.md` exists and is non-empty.
- Fresh CR's `docs/cuts/<CUT>/cr.md` exists and is non-empty.
- If PA was used, `docs/cuts/<CUT>/pa.md` exists and is non-empty; if
  PA was downgraded, the plan header records the reason.

Large cut extra checklist:

- `docs/cuts/<CUT>/cut-note.md` exists and is non-empty before closeout.

Gate reply stays compact (`Gate / Blocker / Scope / Verify / Next`);
link to PR comments, CI jobs, or repo artifacts instead of pasting long
logs into chat.

If the artifact gate fails, RM stops:

```text
ESCALATION: CONTEXT INSUFFICIENT — required RM artifact missing or empty: <path>
```

When a cut has more than three watch items, create or update
`docs/cuts/<CUT>/watch-ledger.md`.

## 3. Source of truth and sync

The remote GitHub `main` branch and the PR head are the shared truth.
Agent reports are not truth until verified.

Before PA / CR / QA / RM, the responsible hat must:

- fetch latest `main` and PR branches
- confirm merged PRs are actually present in `main`
- confirm reported commits are actually pushed
- confirm local checkout matches the branch being reviewed
- confirm working tree cleanliness before merge-sensitive work

Review subagents may escalate instead of writing partial reports:

- `CONTEXT INSUFFICIENT`: required reading file is missing or empty.
- `BRANCH CONFLICT`: target branch / PR cannot be inspected from the
  current worktree state.
- `SPEC CONTRADICTS`: plan, ADR, or entrypoint disagree on a key point.
- `SCOPE UNCLEAR`: review focus asks a question the spec does not
  answer.

Format: `ESCALATION: <SIGNAL> — <one sentence>`. The PM hat or the
owner resolves the escalation before the agent proceeds.

### Owner process brake

The owner has product authority, but cannot accidentally waive process
gates through an in-the-moment command. If the owner asks an agent to
skip a required artifact, review, QA pass, RM check, or hard brake, the
agent must stop and push back directly.

Use this response shape:

```text
PROCESS BRAKE: this skips <required gate>. I should not continue this
way. Next valid step is <specific flow step or repo artifact>.
```

After a process brake, continue only when one of these is true:

- the owner agrees to the next valid flow step;
- the owner explicitly changes the cut size / process rule in repo
  context before work proceeds;
- the agent shows that the requested action does not actually bypass a
  required gate.

Do not soften this into "noted" or silently execute the shortcut. The
point is to protect the owner from over-commanding during momentum.

## 4. Gate responsibilities

The `AGENTS.md` Dispatch map assigns roles and sequence. These conditions do
not downgrade: PA, DEV, and CR remain different fresh contexts; the main agent
runs browser QA for visible changes; the owner (PO) runs final product QA; RM
owns the artifact gate, merge, and post-merge main-CI confirmation.

## 5. Grill before visual work

Before important UI work, PM should ask:

- What is the teacher trying to do right now?
- What breaks if this feature does not exist?
- Is this helping the paper, or competing with the paper?
- Is this showing AI ability or serving a teacher workflow?
- Is this current cut, future cut, or backlog?
- What are the 2-3 decisions the PO actually needs to make?

If the user cannot state the teacher task in one sentence, do not
start DEV. Return to problem definition.

## 6. Mockup discipline

Use mockups / prototypes when visual space, interaction feel, or layout
trust is the risk. Mockups are for direction, not production truth.

Hard brake A:

- maximum 2 mockup rounds before decision or problem-definition reset

If two rounds do not converge, stop generating images. The issue is
not image quality; the product question is unclear.

## 7. PA discipline

PA requirements follow the `AGENTS.md` Dispatch map: Large cuts and work that
touches an irreversible surface or changes data-contract semantics require a
fresh PA before DEV. Only the PA-lite downgrade cases explicitly listed in that
map may apply; the downgrade reason goes in the plan header and CR must review
whether it still holds.

Formal PA output goes to `docs/cuts/<CUT>/pa.md` and ends with:

- reviewed branch / commit baseline, verdict
- Must Fix Before DEV (+ mapping each Must Fix to its `plan.md`
  disposition; PM compression records the handling under
  `PA Follow-Up Decisions` before DEV starts)
- Should Watch
- allowed / forbidden files, static verify requirements, browser QA
  matrix
- at most 3 unresolved PO decisions

Hard brake B:

- if PA leaves more than 3 PO decisions, do not start DEV. Compress or
  rerun PA instead of handing ambiguity to DEV.

## 8. DEV prompt requirements

Large-cut DEV prompts must include:

- sync requirement and required baseline commit
- exact goal and out-of-scope list
- allowed and forbidden files
- locked product decisions (hard contract) vs reference implementation
  (may deviate with a stated reason) — two explicitly separated tiers
- verify scripts to run
- browser QA requirements
- completion report format

Do not tell DEV to "make it like the image." The image aligns intent;
the prompt defines the implementation.

## 9. CR and QA discipline

CR should not become a second design session. If the implementation
exposes a product flaw, stop and route back to PM instead of quietly
changing the design in review.

Every mergeable PR needs a review record. Small cuts may use a PM CR-lite
record in the PR body. Medium / Large require an independent fresh CR report at
`docs/cuts/<CUT>/cr.md`; it is required before the RM artifact gate.

Every review report must include:

- changed-scope summary
- Must Fix findings, if any
- verify evidence
- Self-Review Blind Spots when the reviewer is close to the implementation
- residual risk
- a short "failure / attack angle" paragraph: how this change could
  fail, be misunderstood, or be misused by a future agent

The failure / attack angle is not a security theater exercise. It is a
forcing function to review process holes, stale assumptions, fallback
paths, and misleading green checks before RM.

Self-Review Blind Spots are not extra tasks. They are the places the author
suspects may hide a problem but cannot confidently judge. A later Big CR inspects
them first.

Big CR should not repeat a full manual forbidden-scope audit when a
passing verify script already covers it. In that case, the report says
`Covered by verify; spot-checked <N> files.` Then review the
higher-value risks:
behavior, data contracts, state flow, stale fallbacks, verification
gaps. When a typed error must propagate to the HTTP layer, CR must
check every intermediate catch (per-item / aggregate catches are the
top swallow point — M0-5 incident).

Browser QA must include the failure modes that previously hurt the
product:

- browser zoom 100% / 90%
- tight desktop widths
- stacked / narrow mode when relevant
- long or last-item targets
- scroll interactions
- coexistence with evidence lines / existing overlays
- no stale or unsynced code

## 10. Cut Note and handoff

After a large cut, record a Cut Note and a handoff. Include in the Cut
Note:

- what shipped
- what was cut or moved
- which wrong assumption was found
- which rule prevented rework
- what the next cut is

The Cut Note should preserve why decisions were made, not merely list
files changed.

The handoff should preserve what the next cut must know. Keep it short:
three items is good, more than five suggests the cut was too large.
