# Ticket completion protocol

An implementation task finishes one ticket. It does not create or supervise the
next top-level task.

## Before finishing

- acceptance criteria are met;
- `/implement` has completed its TDD, checks, and Standards + Spec review;
- findings were fixed or recorded as a real blocker;
- the ticket result is updated;
- changes are committed;
- the feature worktree is clean;
- the exact branch and HEAD are known.

## Final report

Keep the report short:

```text
Result: PASS | BLOCKED
Ticket: <path>
Commit: <hash>
Changed: <short file list>
Verify: <commands and exit codes, summarized>
Browser QA: required | passed | pending | not applicable
Risks: none | <short list>
```

Do not paste raw command logs or an implementation diary.

Then provide exactly one exit.

A result-only final message is invalid. If the new top-level task implements or
fixes an implementation ticket, attach `$implement` as the entry skill.
Initial independent review and focused re-review tasks attach `$code-review`.
Only attach the entry skill; `$implement` owns TDD, relevant checks, ordinary
Standards + Spec review, fixes, and commit.

New top-level task:

Write `请新开顶层任务，并将下面代码块直接粘贴：` outside the fence. Keep
the routing label out of the copyable prompt. For a skill-required task, put
its complete Markdown attachment on line one, then one blank line:

<!-- skill-required-handoff -->
```text
[$skill-name](/absolute/path/to/skill-name/SKILL.md)

Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Spec: <exact path | not applicable>
Ticket: <exact path | not applicable>
Fixed point: <commit | not applicable>
Model: <model>
Effort: <low | medium | high | xhigh | max | ultra>
Prompt:
<complete copyable prompt naming exact artifacts and action>
```

Invocation availability and handoff referenceability are separate. Claim
current-task invocation only for a skill in the active catalog or explicitly
attached by the owner in this task. For a handoff, resolve the actual absolute
`SKILL.md` from an owner-provided path or an existing global/project skill
bridge, then verify one non-conflicting candidate: the file exists and is
readable, the path is real and absolute, and frontmatter `name` matches.
`disable-model-invocation: true` does not invalidate that verified
explicit-only handoff reference.

A handoff reference is not a current-task invocation and never authorizes task
creation; the owner still opens the next task and pastes the block. Report
ambiguity instead of guessing. Use `SKILL UNAVAILABLE` only for a required
immediate invocation that is neither active nor attached, or when a required
handoff has no unique verified real path. A slash command, bare skill name, or
equivalent-flow instruction does not count. A non-Codex harness must declare
`NATURAL-LANGUAGE FALLBACK` before using the documented equivalent. QA,
`DONE`, and other no-skill exits omit the attachment.

Fill all applicable anchors for the task type. Implementation names its spec
and ticket; independent review names its spec, completed tickets, and fixed
point; QA names its accepted spec/prototype and checklist; shipping names its
review/QA evidence and integration fixed point. Use `not applicable` only when
an anchor genuinely does not apply. Repeat exact paths and commits: the owner
should not have to find or remember any artifact.

Normal defaults remain `low`, `medium`, or `high`. `xhigh`, `max`, and `ultra`
are legal only with explicit owner direction and evidence that a lower effort
was inadequate, as defined by `docs/agents/model-routing.md`.

Wait for owner QA in the current task only after that task has provisioned and
opened the exact page. Use the canonical format and failure behavior in
`../agents/owner-qa-handoff-template.md`; do not return a copyable QA `Next`
prompt.

Continue the current task:

```text
Next：留在当前任务
Prompt:
<complete copyable prompt>
```

Nothing remains:

```text
DONE
```

## Blocked work

If the ticket needs a new product decision, stop with `SCOPE UNCLEAR` and give
the owner a grilling/prototype prompt. If artifacts conflict, stop with
`SPEC CONTRADICTS`. If the worktree handoff is wrong, stop with
`BRANCH CONFLICT`.

Do not start a coordinator, repair relay state, or create a successor to recover
from a block.

## QA

For visible work, the current task provisions the environment, opens the exact
page in the first checklist state, returns the canonical owner-QA handoff with
at most five checks, and waits in the same task. This includes prototype,
implementation, re-QA, responsive, real-data, and post-review handoffs.

After `QA 完成`, record the result and return the ship/follow-up instruction. A
failed QA result records the checklist number, actual behavior, and
reproduction state before deciding whether the current task can fix it or a
fresh fix task is required.
