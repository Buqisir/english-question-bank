# Task boundaries and handoffs

`AGENTS.md` owns task boundaries. Use a handoff only when the owner requests it
or a genuine work boundary prevents completion in the current task. Do not use
one to create an automatic task chain.

When a handoff is needed, keep it directly copyable and include only:

```text
Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Spec: <path | not applicable>
Ticket: <path | not applicable>
Prompt: <the concrete next action and its boundary>
```

Historical phase, receipt, approval, publication, or recovery artifacts are
evidence only; they do not create a current handoff requirement.
