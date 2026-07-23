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

New top-level task:

```text
Next：新开顶层任务
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

Fill all applicable anchors for the task type. Implementation names its spec
and ticket; independent review names its spec, completed tickets, and fixed
point; QA names its accepted spec/prototype and checklist; shipping names its
review/QA evidence and integration fixed point. Use `not applicable` only when
an anchor genuinely does not apply. Repeat exact paths and commits: the owner
should not have to find or remember any artifact.

Normal defaults remain `low`, `medium`, or `high`. `xhigh`, `max`, and `ultra`
are legal only with explicit owner direction and evidence that a lower effort
was inadequate, as defined by `docs/agents/model-routing.md`.

Wait for owner QA in the current task:

```text
Next：等待人工 QA
Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Spec: <exact path | not applicable>
Ticket: <exact path | not applicable>
Fixed point: <commit | not applicable>
QA checklist: <inline 3-5 checks or exact path>
Prompt:
请按以上清单完成 owner QA。完成后回复“QA 完成”；若失败，逐条描述实际结果。
```

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

For visible work, return `Next：等待人工 QA` with at most five owner checks and
wait in the same task.
After `QA 完成`, return the ship/follow-up instruction. A failed QA result
returns one fresh fix-ticket prompt.
