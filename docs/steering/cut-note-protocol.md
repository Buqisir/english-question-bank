---
inclusion: auto
---

# Cut note protocol

Scope: applies to large product / UI / architecture cuts in the
`Buqisir/english-question-bank` repository. This protocol exists so
product memory does not depend on long chat history or fragile
memory after context compaction.

Authoritative rule: after every large cut, record a short Cut Note
immediately, while the detail is still fresh.

---

## 1. When to write a Cut Note

Write a Cut Note immediately after any of these events:

- a PR is merged
- Browser QA passes or finds a real blocker
- a Must Fix is completed
- PA / CR / QA / RM changes the direction of the next cut
- the user says "验收过关", "合", "这个感觉对了", or equivalent
- a visual / interaction decision is settled after peer feedback
- a bug is discovered that should appear in the daily retrospective

Do not defer the note to a later retrospective. Waiting loses detail.

## 2. Cut Note format

Every Cut Note should be concise and use this fixed shape:

```text
Cut:
Status:
PR / branch:

Completed:
- ...

Bugs / blockers found:
- ...

Pitfalls / wrong assumptions:
- ...

Good decisions:
- ...

Watch / next:
- ...
```

Keep it short. The goal is to preserve product memory, not to write a
second completion report.

For large cuts, include the process lesson when there was one:

- which mockup / PA / QA step changed the direction
- whether a hard brake was triggered
- what was cut, moved, or delayed because it did not serve the current
  teacher task

## 3. Where the note lives

Default behavior (aligned with the RM artifact gate in
`docs/steering/cut-workflow-protocol.md` §2.5):

- Large cuts: commit `docs/cuts/<CUT>/cut-note.md` before closeout —
  the RM gate blocks the merge without it.
- Medium cuts: write `cut-note.md` when the cut changed a recurring
  product rule, exposed a repeated bug pattern, or left follow-up
  risk; otherwise the PR description / final summary is enough.
- Surface the note's key points in the conversation as well, so the
  owner can confirm or correct them.

Do not create cut-note files for tiny tasks; the gate exists to
preserve decisions, not to add ceremony.

## 4. What counts as a large cut

Usually yes:

- anything L3 or L4 in `docs/agents/review-levels.md`
- any user-visible route / interaction / layout / visual change
- any PR that changes PaperSurface, Paper Intelligence harness,
  evidence line, insight, basket, print, import, export, or route flow
- any multi-agent sequence involving PA -> DEV -> CR -> QA -> RM

Usually no:

- typo-only docs edits
- one-line steering wording cleanup
- read-only review with no decision change
- local command output checks that do not change product direction

If unsure, write a tiny Cut Note. A small note is cheaper than losing
the decision.

## 5. Tone and content

Cut Notes should be honest and useful for future retrospectives:

- include mistakes, not only wins
- name the wrong assumption if one was found
- distinguish "static verify passed" from "browser QA passed"
- record why a tradeoff was accepted
- avoid over-polishing the prose

The product owner uses these notes to review cycle time, decision
quality, bug patterns, and whether AI-assisted development is producing
real product progress rather than only fast code.
