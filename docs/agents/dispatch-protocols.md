# Manual task routing

The owner is the only dispatcher.

## Top-level tasks

An agent must not create, fork, spawn, or supervise the next top-level task.
It completes its bounded work, commits durable results, leaves the worktree
clean, and returns one copyable `Next`.

A subagent cannot be a successor phase. Bounded workers explicitly required by
a current Matt skill or product runbook are allowed only inside that bounded
operation and return to the current task.

## Sequential feature worktree

Multi-ticket work uses one explicit feature worktree sequentially:

1. The planning task records the absolute worktree path, branch, and clean HEAD.
2. The owner waits for that task to finish.
3. The owner opens the next top-level task and pastes the returned `Next`.
4. The next task verifies `pwd`, repository root, branch, clean status, and
   expected HEAD before writing.
5. It completes one ticket, commits, and returns the new exact HEAD.

Never let two top-level tasks write the same worktree concurrently. No
lifecycle file, activation commit, release commit, claim ledger, or task
acknowledgement is required; the human task boundary is the lock.

If the expected worktree, branch, or HEAD does not match, stop without writing:

```text
BLOCKED — worktree/branch/HEAD does not match the handoff.
```

## `Next`

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
<complete prompt>
```

Fill all applicable anchors for the task type. Use `not applicable` only for an
anchor that genuinely does not apply. The block and prompt must repeat every
relevant exact artifact and allowed action; the owner should not have to find or
remember them. Normal effort defaults are `low`/`medium`/`high`;
`xhigh`/`max`/`ultra` require explicit owner direction and lower-effort
inadequacy evidence under `model-routing.md`.

## Batch and parallel work

Parallel work is exceptional. Use it only when units are truly independent and
the owner explicitly asks for parallelism.

- each writer gets a different worktree and non-overlapping file surface;
- each task still owns one ticket;
- results merge serially;
- no task becomes a coordinator for the others.

Rule-based batch work should be a deterministic script, not an agent fan-out.
Semantic batch work needs a small costed pilot before scaling.

## Repository facts

- Remote: `github`
- App package manager: pnpm
- Server package manager: npm
- Fresh worktree setup: `bash scripts/setup-worktree.sh`
- Never use `git stash` to hide another task's work.
- Merge in the intended integration worktree, not inside a disposable ticket
  worktree.
