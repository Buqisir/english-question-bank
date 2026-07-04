---
inclusion: auto
---

# Cut note protocol

Scope: applies to large product / UI / architecture cuts in the
`Buqisir/english-question-bank` repository. This protocol exists so
the daily product log does not depend on long chat history or fragile
memory after context compaction.

Authoritative rule: after every large cut, record a short Cut Note
immediately. The 22:30 daily product log should summarize the day's
Cut Notes instead of reconstructing everything from memory.

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

Do not wait until the 22:30 daily log. Waiting loses detail.

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

Default behavior:

- Put the Cut Note in the conversation immediately, so the user can
  confirm or correct it.
- If a daily product-log file already exists for the day, append or
  fold the Cut Note into that file when the user asks to "落文档",
  "记一下", "写进日志", or equivalent.
- If no daily product-log file exists, create one under
  `docs/product/` only when the user asks for a document.

Do not silently edit documentation after every tiny task. The immediate
conversation note is mandatory; file persistence is user-driven unless
the task explicitly asks for documentation.

## 4. Relationship to the daily 22:30 log

The daily 22:30 summary should use the day's Cut Notes as source
material and then produce:

1. today's progress
2. merged / reviewed / blocked PRs
3. important bugs
4. pitfalls and wrong assumptions
5. good decisions
6. process improvements
7. tomorrow's priorities

If the daily summary has no Cut Notes and the chat context is thin,
ask the user for a quick recap instead of inventing details.

## 5. What counts as a large cut

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

## 6. Tone and content

Cut Notes should be honest and useful for future retrospectives:

- include mistakes, not only wins
- name the wrong assumption if one was found
- distinguish "static verify passed" from "browser QA passed"
- record why a tradeoff was accepted
- avoid over-polishing the prose

The product owner uses these notes to review cycle time, decision
quality, bug patterns, and whether AI-assisted development is producing
real product progress rather than only fast code.
