# Manual task routing and completion exits

This file is the single canonical owner of EQB's detailed top-level task
boundary, completion-exit policy, and new-task handoff format.

## Dispatch and handoff

`dispatch` means creating, opening, starting, running, supervising, or waiting
on a successor top-level task. Only the owner dispatches.

`handoff` means returning one complete, copyable instruction for the owner to
open the required successor. Generating a handoff does not create or run the
successor.

An agent must not dispatch a successor, but a completed ticket must hand off
its declared successor whenever the initiative remains open. “Do not start the
next ticket” never means “omit the next-ticket handoff.”

Subagents cannot be successor phases. Bounded workers explicitly required by a
current skill or runbook may work only inside that operation and must report
back to the current task.

## Durable route on every ticket

New tickets declare:

```text
Next on PASS: <ticket path | independent review | owner QA | release | DONE>
Terminal: yes | no
```

`Terminal: no` requires a non-empty `Next on PASS`. The agent reads these
fields before its final response and does not improvise the route from chat
history. `Terminal: yes` permits `DONE` only after every ticket, required
review, owner QA, and release closeout is actually complete.

## Exactly one completion exit

Choose from current initiative state:

| State | Only legal exit |
| --- | --- |
| Work remains on the current ticket and can be completed here | `Next：留在当前任务` with a concrete prompt |
| Current ticket passed and `Next on PASS` names a required successor | New top-level task handoff below, matching that route |
| The exact page is provisioned and owner acceptance is pending | `owner-qa-handoff-template.md` |
| The whole initiative, including review, QA, and release closeout, is complete | `DONE` |

A result-only final is invalid. For `Terminal: no`, both `DONE` and a
same-task response that merely waits for the owner to arrange the next step
are invalid.

If the current ticket is blocked:

- use `SCOPE UNCLEAR` when a new owner product decision is required;
- use `SPEC CONTRADICTS` when controlling artifacts conflict;
- use `BRANCH CONFLICT` when worktree, branch, or HEAD differs from handoff;
- state the verified blocker and shortest owner action;
- use a new-task handoff only when the durable route or a real work boundary
  requires one; otherwise remain in the current task.

Do not repair a blocker by creating a coordinator, relay state, dispatch
ledger, automatic successor, or new workflow platform.

## New top-level task handoff

Write `请新开顶层任务，并将下面代码块直接粘贴：` outside the fence. For a
skill-required successor, line one is the complete Markdown attachment for its
actual entry skill, followed by one blank line.

This is the only complete new-task handoff template:

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
Use the attached entry skill to perform its actual entry action, and only that action, for the linked artifact or stated goal. Treat the declared artifact as the durable source of scope, acceptance, verification, boundaries, and Next on PASS; finish with the exit it declares.
```

Fill every applicable anchor. Use `not applicable` only when an anchor truly
does not apply. Repeat exact paths and commits so the owner does not have to
find or remember them.

Do not paste the next ticket's full body into `Prompt`. The linked artifact
owns scope, acceptance, verification, and boundaries. Name the actual entry
action: implement for `$implement`, review for `$code-review`, route for Ask
Matt, map for Wayfinder, or the corresponding action for another entry skill.
Require the task to finish according to `Next on PASS`; this prevents
recursive prompt growth and constraint loss.

Implementation and fix tasks attach `$implement`. Initial independent reviews
and focused re-reviews attach `$code-review`. Ask Matt, Wayfinder, grilling,
and other entry tasks attach their actual entry skill. Only attach the entry
skill; do not separately attach TDD or ordinary review used by `$implement`.

A slash command, bare skill name, or “equivalent flow” is not an attachment.
QA, `DONE`, and other no-skill exits need no attachment.

## Skill invocation versus handoff reference

Invocation availability and handoff referenceability are separate.

- Claim current-task invocation only when the skill is in the active catalog
  or the owner attached its `SKILL.md` in this task.
- Resolve a future handoff only from an owner-provided path or an existing
  global/project skill bridge.
- Require exactly one non-conflicting candidate, a real absolute readable
  `SKILL.md`, and matching frontmatter `name`.
- `disable-model-invocation: true` may make a skill explicit-only but does not
  invalidate a verified handoff reference.
- A handoff reference is not a current-task invocation and never authorizes
  task creation.
- Report ambiguity rather than guessing. Use `SKILL UNAVAILABLE` only when an
  immediate invocation is unavailable or no unique verified handoff path
  exists.
- A non-Codex harness must declare `NATURAL-LANGUAGE FALLBACK` before using the
  documented equivalent.

Normal effort defaults are `low`, `medium`, or `high`.
`xhigh`/`max`/`ultra` require explicit owner direction and evidence under
`model-routing.md` that lower effort is inadequate.

## Sequential worktrees

Multi-ticket work uses one explicit feature worktree sequentially:

1. The handoff records absolute worktree, branch, clean HEAD, spec, ticket, and
   fixed point.
2. The owner opens the next task manually.
3. The new task verifies those facts before writing.
4. It completes one ticket, commits it, and returns the new exact HEAD.

Never let two top-level tasks write the same worktree. The human task boundary
is the lock; no lifecycle file, activation commit, claim ledger, or task
acknowledgement is needed.

If the expected worktree, branch, or HEAD differs, stop without writing:

```text
BRANCH CONFLICT — worktree/branch/HEAD does not match the handoff.
```

## Owner QA

Owner QA is not a dispatched top-level task. The current task provisions and
opens the exact page before handing it to the owner. The only full QA format
and its failure behavior live in `owner-qa-handoff-template.md`.

## Batch and repository facts

Parallel work is exceptional and requires explicit owner direction. Each
writer needs a separate worktree and non-overlapping file surface; results
merge serially. Deterministic batch work belongs in a script, while semantic
batch work needs a small costed pilot.

- Remote: `github`
- App package manager: pnpm
- Server package manager: npm
- Fresh worktree setup: `bash scripts/setup-worktree.sh`
- Never use `git stash` to hide another task's work.
