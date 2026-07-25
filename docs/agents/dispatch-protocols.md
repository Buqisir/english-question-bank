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

## New top-level task

Put the instruction to open the task outside the fence. A skill-required task
starts with the complete Markdown attachment for its actual entry skill, then
one blank line:

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
<complete prompt>
```

Fill all applicable anchors for the task type. Use `not applicable` only for an
anchor that genuinely does not apply. The block and prompt must repeat every
relevant exact artifact and allowed action; the owner should not have to find or
remember them. Normal effort defaults are `low`/`medium`/`high`;
`xhigh`/`max`/`ultra` require explicit owner direction and lower-effort
inadequacy evidence under `model-routing.md`.

Implementation and fix tasks attach `$implement`. Independent review and
focused re-review tasks attach `$code-review`. Ask Matt, Wayfinder, grilling,
and other tasks attach the actual entry skill. Invocation availability and
handoff referenceability are separate: claim current-task invocation only for
an active or owner-attached skill, while a future handoff may reference a
verified explicit-only skill even when `disable-model-invocation: true` keeps
it out of the automatic catalog.

Resolve a handoff path only from an owner-provided path or an existing
global/project skill bridge. Require one non-conflicting candidate, a real
absolute readable `SKILL.md`, and matching frontmatter `name`; report ambiguity
instead of guessing. That reference neither means the current task invoked the
skill nor authorizes the agent to create the next task. Use
`SKILL UNAVAILABLE` only for an unavailable immediate invocation or when no
unique verified handoff path exists. Preserve the declared
`NATURAL-LANGUAGE FALLBACK` rule for non-Codex harnesses.

Do not separately attach TDD or ordinary review used inside `$implement`. A
bare slash command, bare skill name, or equivalent-flow instruction is invalid.
QA, `DONE`, and other no-skill exits need no attachment. A result-only final
message without one canonical exit is invalid.

Owner QA is not a dispatched top-level task. The current task that sends the QA
handoff must provision and directly open the exact page under
`owner-qa-handoff-template.md`; it may not route service startup, fixtures,
login, URL discovery, route state, or prototype restoration to the owner or a
successor.

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
