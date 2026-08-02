# Task boundaries and handoffs

`AGENTS.md` owns the current operating rules. This note adds only the task
boundary details needed by multi-session work.

- The owner's current request and named spec/ticket define scope.
- The owner starts top-level tasks. Agents do not create governance-only
  successor tasks or automatic task chains.
- One task writes a worktree at a time. Parallel writers require explicit owner
  direction, separate worktrees, and non-overlapping files.
- Verify any supplied worktree, branch, expected HEAD, fixed point, and allowed
  dirty state before writing. Preserve everything outside the named scope.
- A handoff is optional unless the owner requests it or a genuine work boundary
  prevents completion in the current task.

When a handoff is needed, keep it directly copyable and include only:

```text
Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Spec: <path | not applicable>
Ticket: <path | not applicable>
Prompt: <the concrete next action and its boundary>
```

There is no repository phase machine, route receipt, manifest/digest approval,
publish-task gate, governance recovery task, or mandatory repeated handoff.
Existing historical artifacts that use those terms remain evidence only.
