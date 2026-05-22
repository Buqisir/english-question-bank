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
- Codex owning daily PM / DEV / CR-lite / QA / RM work end to end
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
-> Codex DEV -> Codex CR -> Codex browser QA -> PO QA
-> RM -> Cut Note
```

## 3. Multi-platform source of truth

The remote GitHub `main` branch and the PR head are the shared truth.
Agent reports are not truth until verified.

Codex is responsible for local state control:

- fetch latest `main` and PR branches before PA / CR / QA / RM
- confirm merged PRs are actually present in `main`
- confirm any externally reported commits are actually pushed to GitHub
- confirm local checkout matches the branch being reviewed
- confirm working tree cleanliness before merge-sensitive work

External high-reasoning PA tools such as Antigravity / Opus may help
with high-level thinking, large-cut direction, and occasional big CR.
They must be told to sync and verify the baseline before review.

External DEV is no longer part of the default daily workflow. Use it
only when the owner explicitly asks for that exception. In that case,
the external DEV must start from latest `main`, push its branch, open or
update a PR, and report PR URL + commit hash. Its completion report is a
lead, not a source of truth.

## 4. Role split

PM / product pacing:

- grill the user's idea before DEV
- distinguish current cut from future cut
- compress PA output into 2-3 PO decisions
- push back when the product starts drifting into an AI dashboard

PO:

- decides whether the product direction and visual feel are right
- runs final PO QA after Codex browser QA
- does not need to read code or perform code review
- says "走" before RM merge

Big PA:

- handles architecture and product boundary review before DEV
- identifies allowed / forbidden files
- defines static verify and browser QA requirements
- must not write implementation patches in PA mode
- is reserved for large cuts, direction checks, and occasional big CR,
  not routine small-cut work

DEV:

- Codex implements the approved cut by default
- must not redesign the product direction silently
- stops and reports if implementation requires forbidden files or a
  changed product decision

CR:

- Codex checks whether DEV obeyed the spec
- finds bugs, scope leaks, missing tests, and behavioral regressions
- must not quietly redesign the feature during review; if product
  direction is wrong, stop and route back to PM / PA

QA:

- Codex does first local / in-app browser QA
- PO then does final user-visible QA
- static verify does not replace browser QA for user-visible surfaces

RM:

- confirms PR head, mergeability, and clean state
- merges with the agreed strategy
- fetches `main` after merge and confirms the merge commit is present

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

PA output must end with:

- verdict
- product principle
- exact UX / architecture model
- Must Fix Before DEV
- Should Watch
- allowed / forbidden files
- static verify requirements
- browser QA matrix
- whether the DEV prompt is ready
- at most 3 unresolved PO decisions

Hard brake B:

- if PA leaves more than 3 PO decisions, do not start DEV

More than 3 open decisions means the PA did not converge. Compress or
rerun PA instead of handing ambiguity to DEV.

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

## 10. Cut Note

After a large cut, record a Cut Note. Include:

- what shipped
- what was cut or moved
- which wrong assumption was found
- which rule prevented rework
- what the next cut is

The Cut Note should preserve why decisions were made, not merely list
files changed.
