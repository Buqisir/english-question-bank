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
Model: <model>
Effort: <low | medium | high | xhigh>
Prompt:
<complete copyable prompt naming exact artifacts and action>
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

For visible work, prepare at most five owner checks and wait in the same task.
After `QA 完成`, return the ship/follow-up instruction. A failed QA result
returns one fresh fix-ticket prompt.
