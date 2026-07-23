# Ticket Completion Report Template

```text
Result: PASS | BLOCKED
Ticket: <path>
Commit: <hash>
Changed: <short file list>
Verify: <command: exit code; command: exit code>
Browser QA: required | passed | pending | not applicable
Risks: none | <short list>
```

Use verify summaries only. No raw command logs or implementation diary.

End with exactly one of:

A result-only final message is invalid. If the next task implements or fixes an
implementation ticket, its `Prompt:` must explicitly say to use `/implement`;
that skill owns TDD, relevant checks, Standards + Spec `/code-review`, fixes,
and commit.

For a new top-level task, put the instruction to open the task outside the
fence. The copyable block starts directly with `Worktree:`:

```text
Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Spec: <exact path | not applicable>
Ticket: <exact path | not applicable>
Fixed point: <commit | not applicable>
Model: <model>
Effort: <low | medium | high | xhigh | max | ultra>
Prompt:
<complete copyable prompt>
```

Fill all applicable anchors for the task type. Use `not applicable` only when
an anchor genuinely does not apply. Repeat exact paths and commits; the owner
should not have to find or remember any artifact.

Normal defaults are `low`, `medium`, or `high`. `xhigh`, `max`, and `ultra`
require explicit owner direction and evidence that a lower effort was
inadequate.

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

```text
Next：留在当前任务
Prompt:
<complete copyable prompt>
```

```text
DONE
```
