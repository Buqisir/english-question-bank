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

---

## 1. First principles

Optimize for:

- the teacher task being served
- the A4 paper remaining primary
- fewer wrong-direction implementation loops
- the current named-agent assignment being explicit and auditable
- external high-reasoning review only where it actually changes risk

Do not optimize for:

- starting DEV as quickly as possible
- showing every available AI-generated datum
- making a UI impressive before it is useful
- using more agents or platforms as a substitute for making a product
  decision

## 2. Risk tiers

Use the smallest process that covers the risk.

### Small cut

Examples: typo, docs wording, verify-only update, narrow bug with one
obvious fix.

Default flow:

```text
Sync -> fix/DEV -> verify -> CR-lite -> RM
```

Usually no mockup, no Big PA, and no browser QA unless the visible UI
changes.

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

Small-cut skips by default:

- Canvas / mockups
- Big PA
- multi-round product discussion
- browser QA, unless the visible UI changed
- Cut Note, unless the small cut changes a recurring rule or fixes a
  bug pattern worth remembering

Upgrade a small cut to medium if:

- the fix changes visible behavior
- the exact UI outcome is not obvious
- the diff touches more than the expected file family
- a "quick fix" starts requiring layout, state, or z-index reasoning

### Medium cut

Examples: small interaction, limited CSS behavior, a known UI bug, a
single harness change with bounded blast radius.

Default flow:

```text
Sync -> quick PM grill -> DEV -> CR -> browser QA -> PO QA -> RM
```

Use one quick mockup only when spatial judgment is the core risk.

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

Medium-cut skips by default:

- Big PA
- roadmap PA
- multi-round Canvas exploration
- broad Cut Note unless the medium cut changes direction or exposes a
  recurring product pitfall

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

Default flow:

```text
Sync -> PM grill -> Canvas/mockups -> Big PA -> PM compression
-> 小川 DEV -> 小川 CR-lite -> 阿澈 Big CR / browser QA -> PO QA
-> RM -> Cut Note
```

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

Medium and large cuts must have a stable routing file before external
PA / CR or long-running DEV begins:

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

### External prompt templates

Use templates instead of rewriting PA / Big CR boilerplate by hand:

```text
docs/cuts/_templates/pa-prompt-template.md
docs/cuts/_templates/big-cr-prompt-template.md
```

Prompt files should fill only the cut id, branch / PR, output path,
cut-specific reading, review focus, and extra counts. Shared role
boundaries, escalation signals, output path expectations, and chat
reply format live in the templates.

### Repo-file handoff rule

For multi-agent work, repo files are the transport layer. The following
artifacts must be written to a named repo path before they are used by
another agent:

- PM specs and decision ledgers
- PA prompts and PA reports
- Big CR prompts and Big CR reports
- DEV goal prompts for long-running goals
- browser QA checklists / PO QA contracts
- handoffs, Cut Notes, and watch ledgers

Chat should only contain routing text such as "read this file, write the
next report to that file." Do not ask the owner to copy/paste long PA,
CR, or DEV prompts through chat when a repo file can carry the same
context. If an external agent cannot write directly to the repo, reserve
a target path in the prompt and have the owner or Codex place the
artifact there before it becomes authoritative.

External agents must write to the intended repo/worktree, not merely to
the same relative path in a side worktree. Prompts that ask an external
agent to write a repo artifact must include the target repo root, target
branch / PR, and target absolute path. Before writing, the agent must
confirm `pwd`, `git rev-parse --show-toplevel`, and branch. If the
current worktree is not the requested repo root / branch / PR, the
agent must stop with `ESCALATION: BRANCH CONFLICT` instead of writing
under `.claude/worktrees/` or another side checkout. After writing, the
agent must confirm the absolute report path and `git status --short`
entry for the file.

If a material decision was made in chat during a grill, it must be
copied into the cut's `decisions.md`, `pm-spec.md`, `agent-entrypoint.md`,
or `handoff.md` before DEV or external review continues.

### Decisions sync status

Cut decision ledgers should say how fresh they are. New or updated
`decisions.md` files should include:

```text
Last synced: <date> after <event>.
Open items from external review: <N>
```

After PA or Big CR writes a report, Codex must update the decision
status in the same PR before another agent treats `decisions.md` as
authoritative.

If review opens decisions:

```text
Last synced: <date> after <PA / Big CR>.
Open items from external review: <N> (see <report path> §<section>)
```

After PM / PO compression resolves them:

```text
Last synced: <date> after <PA / Big CR> + PM compression.
Open items from external review: 0
```

When a cut pauses, changes owner, or crosses a context boundary, write:

```text
docs/cuts/<CUT>/handoff.md
```

The handoff records current truth, remaining gates, known risks, and the
next concrete action.

After a large cut, record both:

```text
docs/cuts/<CUT>/cut-note.md
docs/cuts/<CUT>/handoff.md
```

The Cut Note records what shipped, moved, and was learned. The handoff
records what the next cut must know to avoid repeating mistakes.

Use the templates in `docs/cuts/_templates/`.

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

Before RM merge for medium / large cuts, 阿澈 must check the required
cut artifacts. Missing or empty required artifacts stop the merge; do
not paper over the gap in chat.

Medium cut checklist:

- `docs/cuts/<CUT>/plan.md` exists and is non-empty.
- If PA was used, either `docs/cuts/<CUT>/pa.md` exists and is non-empty
  or PA-lite findings are recorded in `plan.md` / `decisions.md`.
- If Big CR was triggered, either `docs/cuts/<CUT>/cr.md` exists and is
  non-empty or the PR description / final agent summary contains the
  Big CR record.

Large cut extra checklist:

- `docs/cuts/<CUT>/cut-note.md` exists and is non-empty before closeout
  / RM merge.

If the artifact gate fails, RM must stop with:

```text
ESCALATION: CONTEXT INSUFFICIENT — required RM artifact missing or empty: <path or record>
```

When a cut has more than three watch items, create or update:

```text
docs/cuts/<CUT>/watch-ledger.md
```

Use the templates in `docs/cuts/_templates/` for entrypoints, handoffs,
Cut Notes, decisions, PA prompts, Big CR prompts, CR-lite reports,
external review reports, and watch ledgers.

## 3. Multi-platform source of truth

The remote GitHub `main` branch and the PR head are the shared truth.
Agent reports are not truth until verified.

The responsible agent is responsible for local state control:

- fetch latest `main` and PR branches before PA / CR / QA / RM
- confirm merged PRs are actually present in `main`
- confirm any externally reported commits are actually pushed to GitHub
- confirm local checkout matches the branch being reviewed
- confirm working tree cleanliness before merge-sensitive work

External high-reasoning PA tools such as Antigravity / Opus may help
with high-level thinking, large-cut direction, and occasional big CR.
They must be told to sync and verify the baseline before review.

External agents may escalate instead of writing partial reports. The
standard signals are:

- `CONTEXT INSUFFICIENT`: required reading file is missing, empty, or
  unreadable.
- `BRANCH CONFLICT`: target branch or PR cannot be inspected because of
  local worktree / checkout state.
- `SPEC CONTRADICTS`: PM spec, decisions, ADR, or entrypoint disagree
  on a key point.
- `SCOPE UNCLEAR`: review focus asks a question the spec does not
  answer.

Format:

```text
ESCALATION: <SIGNAL> — <one sentence explanation>
```

阿澈 or the owner resolves the escalation before the agent proceeds.

External DEV is no longer part of the default daily workflow. Use it
only when the owner explicitly asks for that exception. In that case,
the external DEV must start from latest `main`, push its branch, open or
update a PR, and report PR URL + commit hash. Its completion report is a
lead, not a source of truth.

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

## 4. Role split

Current named-agent assignment:

- 阿澈 owns PM, UI direction / polish, PA, and Big CR.
- 小川 owns DEV, routine CR-lite, and small-cut RM / release execution.
- For medium / large RM, 小川 may execute the merge only after 阿澈 runs
  the RM artifact gate and final sanity check.
- Either agent may cover another role when quota or availability
  requires, but role contracts and gates do not downgrade.

PM / product pacing:

- grill the user's idea before DEV
- distinguish current cut from future cut
- compress PA output into 2-3 PO decisions
- push back when the product starts drifting into an AI dashboard

PO:

- decides whether the product direction and visual feel are right
- runs final PO QA after 阿澈 browser QA
- does not need to read code or perform code review
- says "走" before RM merge
- may change process deliberately, but not by accidental one-off bypass;
  process changes must be made explicit in repo context before agents
  proceed past a required gate

Big PA:

- handles architecture and product boundary review before DEV
- follows `docs/agents/pa-persona.md`
- identifies allowed / forbidden files
- defines static verify and browser QA requirements
- must not write implementation patches in PA mode
- is reserved for large cuts, direction checks, and occasional big CR,
  not routine small-cut work

DEV:

- 小川 implements the approved cut by default
- must not redesign the product direction silently
- stops and reports if implementation requires forbidden files or a
  changed product decision

CR:

- 小川 owns routine CR-lite. 阿澈 owns Big CR and any final sanity gate
  needed before medium / large RM.
- finds bugs, scope leaks, missing tests, and behavioral regressions
- must not quietly redesign the feature during review; if product
  direction is wrong, stop and route back to PM / PA

QA:

- 阿澈 does first local / in-app browser QA for UI direction and
  user-visible quality unless the cut explicitly assigns QA elsewhere.
- PO then does final user-visible QA
- static verify does not replace browser QA for user-visible surfaces

RM:

- confirms PR head, mergeability, and clean state
- runs the medium / large artifact gate before merge
- merges with the agreed strategy
- fetches `main` after merge and confirms the merge commit is present
- 小川 owns small-cut RM / release execution. For medium / large cuts,
  阿澈 runs the artifact gate and final sanity check before 小川 executes
  the merge.

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

## 6. Mockup / Canvas discipline

Use Gemini Canvas, image mockups, or proportional diagrams when visual
space, interaction feel, or layout trust is the risk.

Mockups are for direction, not production truth.

Default set:

- conservative option
- recommended option
- aggressive option or explicit anti-pattern

Hard brake A:

- maximum 2 mockup rounds before decision or problem-definition reset

If two rounds do not converge, stop generating images. The issue is
not image quality; the product question is unclear.

## 7. Big PA discipline

Use high-reasoning PA for large cuts, especially when the decision
affects PaperSurface, data contracts, geometry, or future cut
sequencing.

External PA must read `docs/agents/pa-persona.md` before review.

PA output must end with:

- report path
- reviewed branch / commit baseline
- verdict
- product principle
- exact UX / architecture model
- Must Fix Before DEV
- Must Fix -> `plan.md` disposition checklist, when Must Fix exists
- Should Watch
- allowed / forbidden files
- static verify requirements
- browser QA matrix
- whether the DEV prompt is ready
- at most 3 unresolved PO decisions
- token usage / estimated cost when available; if unavailable, say so

Hard brake B:

- if PA leaves more than 3 PO decisions, do not start DEV

More than 3 open decisions means the PA did not converge. Compress or
rerun PA instead of handing ambiguity to DEV.

When PA returns Must Fix items, the PA report must include a checklist
that maps each Must Fix to the expected `plan.md` disposition. PM
compression then records the matching handling under `PA Follow-Up
Decisions` in `plan.md`. Big CR must verify that every PA Must Fix has
a corresponding plan disposition before treating the PA loop as closed.

## 8. DEV prompt requirements

Large-cut DEV prompts must include:

- sync requirement and required baseline commit / merge commit
- exact goal and out-of-scope list
- allowed and forbidden files
- locked product decisions
- implementation boundaries
- verify scripts to run
- browser QA requirements
- completion report format

Do not tell DEV to "make it like the image." The image aligns intent;
the prompt defines the implementation.

External DEV prompts are exception-only. Do not generate them by
default for routine cuts.

## 9. CR and QA discipline

CR should not become a second design session. If the implementation
exposes a product flaw, stop and route back to PM / PA instead of
quietly changing the design in review.

Every mergeable PR needs a CR-lite record, even when the change is
docs-only. For small cuts this can be a short PR-body section. For
medium / large cuts, write it to the cut directory.

CR-lite must include:

- changed-scope summary
- Must Fix findings, if any
- verify evidence
- Self-Review Blind Spots, when the CR-lite author also implemented or
  is close to the implementation
- residual risk
- a short "failure / attack angle" paragraph: how this change could
  fail, be misunderstood, or be misused by a future agent

The failure / attack angle is not a security theater exercise. It is a
forcing function to review process holes, stale assumptions, fallback
paths, and misleading green checks before RM.

Self-Review Blind Spots are not extra tasks. They are the places the
author suspects may hide a problem but cannot confidently judge. If a
later Big CR runs, it should inspect those first, then continue with
normal risk-based review.

Big CR should not repeat a full manual forbidden-scope audit when a
passing verify script already covers it. In that case, the report should
say:

```text
Covered by verify; spot-checked <N> files.
```

Then review the higher-value risks: behavior, data contracts, state
flow, stale fallbacks, and verification gaps.

Browser QA must include the failure modes that previously hurt the
product:

- browser zoom 100%
- browser zoom 90%
- tight desktop widths
- stacked / narrow mode when relevant
- long or last-item targets
- scroll interactions
- coexistence with evidence lines / existing overlays
- no stale or unsynced code

## 10. Cut Note And Handoff

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
