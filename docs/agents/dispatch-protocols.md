# Manual task routing and completion exits

This file is the single canonical owner of EQB's detailed top-level task
boundary, closed phase state machine, completion-exit policy, pause/resume
rules, successor routing, and new-task handoff format.

## Dispatch and handoff

`dispatch` means creating, opening, starting, running, supervising, or waiting
on a successor top-level task. Manual owner dispatch is the default. Ordinary
tasks do not dispatch; the sole agent-side exception is an owner-explicit
invocation of `$coordinate-eqb-wayfinder` under the contract below.

`handoff` means returning one complete, copyable instruction for the owner to
open the required successor. Generating a handoff does not create or run the
successor.

An ordinary task agent must not dispatch a successor, but a completed ticket
must hand off its declared successor whenever the initiative remains open.
“Do not start the next ticket” never means “omit the next-ticket handoff.”

Subagents cannot be successor phases. Bounded workers explicitly required by a
current skill or runbook may work only inside that operation and must report
back to the current task.

### Owner-started Wayfinder coordinator exception

This exception is authorized only after the owner explicitly invokes
`$coordinate-eqb-wayfinder` for a charted EQB initiative whose map or phase
receipt names one validated durable frontier. The coordinator is
repository-read-only and may use only official Codex top-level task tools to
create and compactly wait on exactly one fresh peer at a time in the
initiative's same exact saved worktree. It may not delegate, fork, resume,
create another coordinator, or overlap writers.

The global skill executes the project authorities in this file,
`issue-tracker.md`, `model-routing.md`, and
`owner-qa-handoff-template.md`. It does not own or copy their detailed rules.

### Closed development phase state machine

These route kinds and edges are closed. Unknown route kinds and every unlisted
edge fail:

| Completed durable phase | Legal next phase |
| --- | --- |
| `wayfinder` | `to-spec` |
| `to-spec` | `to-tickets` |
| `to-tickets` | `owner-approval` |
| `owner-approval` | `implementation`, after all four implementation gates pass |
| `implementation` | `implementation`, `independent-review`, `owner-qa`, or `release` |
| `independent-review` | `independent-fix` on a canonical failed result; `implementation`, `owner-qa`, or `release` on PASS |
| `independent-fix` | `focused-re-review` |
| `focused-re-review` | `independent-fix` on a canonical failed result; `implementation`, `owner-qa`, or `release` on PASS |
| `owner-qa` | `implementation` or `release` after owner acceptance |
| `release` | `DONE` |
| `DONE` | none |

`Current phase`, receipt `Next on PASS`, and map `Next on PASS` must be the
same exact route kind. The receipt's `Previous phase` must have complete
committed provenance under the field schema in `issue-tracker.md`. The map
must also have a current-route binding: its binding commit is an ancestor of
HEAD, the artifact exists at that commit, the committed and current bytes both
match the bound SHA-256, and the three route fields above agree. Missing,
malformed, stale, contradictory, or unbound evidence fails closed at the
earliest unproven phase.

The historical `$wayfinder` result and a later governance route correction are
different provenance. A route-binding commit must be described as governance,
not as execution by `$wayfinder`.

### Implementation gates

Implementation is forbidden until all four gates verify:

1. the accepted spec has committed `$to-spec` provenance and its current
   SHA-256 matches;
2. the ticket-set manifest has committed `$to-tickets` provenance and its
   current SHA-256 matches;
3. the ticket-set receipt binds that exact accepted-spec SHA-256;
4. the owner's committed ticket-granularity approval binds that exact
   ticket-set manifest SHA-256.

Filenames, directory existence, prose claims, historical chat, and old
handoffs satisfy none of these gates.

### Review and fix routes

One implementation task keeps implementation, TDD, ordinary Standards + Spec
review, ordinary fixes, verification, and commit together. Those ordinary
activities never become successor phases.

A fresh peer is used only for a separately required independent review
lineage. Only a canonical failed result from that lineage may select one fresh
`independent-fix` peer. The next review is the focused re-review in the same
lineage; a review failure authorizes no automatic retry or refill.

### Pause and resume

Coordination pauses at `owner-approval` until the owner commits approval of the
exact ticket-set digest and explicitly resumes. It also pauses at `owner-qa`
after the exact checkable state is provisioned, and for grilling or other
owner input, `needs-attention`, `BLOCKED`, dirty or mismatched repository
state, malformed evidence, route mismatch, duplicate dispatch, cycles, or lost
ledger certainty.

Resume requires another full preflight of the saved worktree, branch, HEAD,
clean state, fixed point, current committed map/receipt, route binding,
provenance, gates, model route, and absence of another writer. A pause never
authorizes retry, refill, a replacement root, or a second concurrent writer.
`DONE` requires `Terminal: yes` and proof that no ticket, independent review,
owner QA, release, or closeout remains.

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

Do not repair a blocker by inventing a coordinator, relay state, dispatch
ledger, automatic successor, or new workflow platform. Only the owner-explicit
exception above can start coordination, and its pause conditions fail closed.

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

To-spec and to-tickets phase tasks attach their complete `$to-spec` and
`$to-tickets` Markdown skill references. Implementation and fix tasks attach
`$implement`. Initial independent reviews and focused re-reviews attach
`$code-review`. Ask Matt, Wayfinder, grilling, and other entry tasks attach
their actual entry skill. Only attach the entry skill; do not separately
attach TDD or ordinary review used by `$implement`.

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

Use the owner-approved role defaults in `model-routing.md`. Any deviation,
including `max` or `ultra`, requires explicit owner direction.

## Sequential worktrees

Multi-ticket work uses one explicit feature worktree sequentially:

1. The handoff records absolute worktree, branch, clean HEAD, spec, ticket, and
   fixed point.
2. The owner opens the next task manually, or an already-authorized
   `$coordinate-eqb-wayfinder` creates the one exact durable successor.
3. The new task verifies those facts before writing.
4. It completes one ticket, commits it, and returns the new exact HEAD.

Never let two top-level tasks write the same worktree. The top-level task
boundary is the lock; no lifecycle file, activation commit, claim ledger, or
task acknowledgement is needed.

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
