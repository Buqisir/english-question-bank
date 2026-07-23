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

```text
Next：新开顶层任务
Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Recommended model: <model / thinking>
Prompt:
<complete copyable prompt>
```

```text
Next：留在当前任务
Prompt:
<complete copyable prompt>
```

```text
DONE
```
