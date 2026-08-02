# Manual task routing and completion exits

This file is the single canonical owner of EQB's detailed top-level task
boundary, closed phase state machine, completion-exit policy, pause/resume
rules, successor routing, and new-task handoff format.

## Dispatch and handoff

`dispatch` means creating, opening, starting, running, supervising, or waiting
on a successor top-level task. The owner dispatches every successor manually.
Ordinary tasks never dispatch, and there is no agent-side dispatch exception.

`handoff` means returning one complete, copyable instruction for the owner to
open the required successor. Generating a handoff does not create or run the
successor.

An ordinary task agent must not dispatch a successor, but a completed ticket
must hand off its declared successor whenever the initiative remains open.
“Do not start the next ticket” never means “omit the next-ticket handoff.”

Subagents cannot be successor phases. Bounded workers explicitly required by a
current skill or runbook may work only inside that operation and must report
back to the current task.

## One route Interface

The route Module exposes one typed Interface selected by artifact kind. Its
Implementation belongs in
`scripts/verify-dev-completion-report-contract.mjs`; callers and tests use the
same Interface rather than reimplementing route checks in maps, manifests, or
handoffs.

| Artifact kind | Interface responsibility | Not responsible for |
| --- | --- | --- |
| `wayfinder-map` | Index shape: map status plus decision gists and Fog | Ticket fields, phase state, routes, or dispatch |
| `ticket` | One work item's declared exit and conditional parallel pair | Live initiative phase state or an external implementation dependency |
| `phase-receipt` | The sole live phase state, closed phase edge, implementation gates, preflight, and one external dependency | Map status or map bytes |

The receipt is the only live phase state for a huge/foggy initiative. A
Wayfinder map is an index: it may say whether charting is done, but carries no
`Previous phase`, `Current phase`, `Next on PASS`, `Terminal`, parallel field,
implementation-dispatch, or blocker field. A map is never parsed or validated
as a ticket.

The Interface is intentionally small: it accepts only the artifact kind and
its declared fields, returns all violations, and leaves Git/Markdown parsing
inside its implementation. This gives one seam for route tests and localizes
future changes to the corresponding artifact adapter.

### Closed development phase state machine

These route kinds and edges are closed. Unknown route kinds and every unlisted
edge fail:

| Completed durable phase | Legal next phase |
| --- | --- |
| `wayfinder` | `to-spec` |
| `to-spec` | `to-tickets` |
| `to-tickets` | `owner-approval` |
| `owner-approval` | `implementation`, after all implementation gates pass |
| `implementation` | `implementation`, `independent-review`, `owner-qa`, `release`, or the guarded measured-replan re-entry to `to-tickets` below |
| `independent-review` | `independent-fix` on a canonical failed result; `implementation`, `owner-qa`, or `release` on PASS |
| `independent-fix` | `focused-re-review` |
| `focused-re-review` | `independent-fix` on a canonical failed result; `implementation`, `owner-qa`, or `release` on PASS |
| `owner-qa` | `implementation` or `release` after owner acceptance |
| `release` | `DONE` |
| `DONE` | none |

A receipt's `Current phase` and `Next on PASS` must be the same exact route
kind. Its `Previous phase` must be a legal predecessor with the minimum
committed artifact identity required by `issue-tracker.md`. Missing,
malformed, stale, or contradictory receipt evidence fails closed at the
earliest unproven phase. A map's status or bytes cannot make an edge legal.

### Guarded measured-replan re-entry

`implementation` may re-enter `to-tickets` only when every condition below is
proven together:

1. a committed current implementation result explicitly failed closed;
2. immutable, hashable measured evidence proves that the approved ticket
   capacity or route assumption is invalid;
3. continuing the declared implementation successor would be unsafe or false;
4. the owner explicitly authorizes one bounded measured replan; and
5. the receiving task freshly verifies the exact worktree, branch, HEAD, clean
   state, fixed point, and absence of another writer.

Missing or stale evidence, an ordinary implementation failure, or a desire to
improve the plan does not select this edge. On entry, implementation dispatch
is immediately forbidden. The replacement path returns through `to-tickets`,
one owner semantic approval, machine artifact binding, and a fresh receiving
task preflight; it does not resume or create a peer.

### Implementation gates

Implementation is forbidden until all four gates verify:

1. the accepted spec has committed `to-spec` provenance, an exact artifact
   path, and a machine-checked current byte identity;
2. the ticket-set manifest has committed `to-tickets` provenance, an exact
   artifact path, a machine-checked current byte identity, and a binding to the
   accepted spec;
3. the owner has recorded one explicit semantic approval of that ticket set;
   the owner approves the proposed work, not a hexadecimal digest; and
4. the receiving task's exact checkout/writer preflight passes.

The machine compares the stored artifact identities with bytes at their
recorded commits and verifies ancestry to the receipt HEAD. This preserves
substitution and stale-authority detection without requiring routine
low-risk work to make an owner read, repeat, or understand a digest.

Filenames, directory existence, prose claims, historical chat, and old
handoffs satisfy none of these gates.

### Exact checkout and writer preflight

Before any write, resume, or implementation dispatch, the receiving task
checks one exact worktree path, branch, expected HEAD/fixed point, clean
status, and the absence of another writer for that worktree. A dirty checkout,
stale HEAD, mismatched branch, unresolved fixed point, or concurrent writer is
a hard stop. Manual owner dispatch does not waive this preflight.

### External implementation dependency

An external blocker has one representation: an optional receipt field
`External blocker dependency` with either `none` or exactly
`<repo-relative-ticket-path>@<40-hex-commit>`. When declared, the cited commit
must be an ancestor of the receipt HEAD; the cited artifact must be a ticket at
that exact path with `Status: done` or `Status: closed`. A map, manifest,
generic “kind,” open ticket, changed path, unresolvable commit, or multiple
dependencies fails closed.

This is the one exact closed-ticket DAG dependency. It replaces copies of the
same blocker in maps, manifests, and receipt field groups. The dependency does
not dispatch or execute the work that closes it; that ticket still requires
manual owner dispatch and its own preflight.

### Review and fix routes

One implementation task keeps implementation, TDD, ordinary Standards + Spec
review, ordinary fixes, verification, and commit together. Those ordinary
activities never become successor phases.

A fresh peer is used only for a separately required independent review
lineage. Only a canonical failed result from that lineage may select one fresh
`independent-fix` peer. The next review is the focused re-review in the same
lineage; a review failure authorizes no automatic retry or refill.

### Pause and resume

Coordination pauses at `owner-approval` until the owner records the one
semantic decision, at `owner-qa` after the exact checkable state is
provisioned, and for grilling or other owner input, `needs-attention`,
`BLOCKED`, dirty or mismatched repository state, malformed evidence, route
mismatch, cycles, or lost writer certainty.

Resume requires another full preflight of the saved worktree, branch, HEAD,
clean state, fixed point, current receipt, artifact identities, gates, model
route, and absence of another writer. A pause never authorizes retry, refill,
a replacement root, or a second concurrent writer. `DONE` requires
`Terminal: yes` and proof that no ticket, independent review, owner QA,
release, or closeout remains.

## Durable route on every ticket

New tickets declare:

```text
Next on PASS: <ticket path | parallel frontier handoff | parallel join handoff | independent review | owner QA | release | DONE>
Terminal: yes | no
```

`Terminal: no` requires a non-empty `Next on PASS`. The agent reads these
fields before its final response and does not improvise the route from chat
history. `Terminal: yes` permits `DONE` only after every ticket, required
review, owner QA, and release closeout is actually complete.

### Declared parallel frontier and join

Use this bounded form only when an accepted spec and manifest require genuinely
parallel sibling tickets with disjoint write surfaces and isolated worktrees.
It reuses manual owner dispatch; it creates no coordinator, task queue, or
additional approval layer.

`Parallel frontier` and `Parallel join` form one conditional matched-route
field group. Ordinary serial routes omit both. The exact
`parallel frontier handoff` and `parallel join handoff` routes include both;
the field selected by that route contains its deterministic path value and the
other field is exactly `not-applicable`.

- The serial fan-out ticket declares exactly
  `Next on PASS: parallel frontier handoff` and one `Parallel frontier` field
  containing the exact sibling ticket paths. Its final response has one legal
  completion exit: one parallel-frontier handoff containing the complete task
  blocks for those siblings. The owner may open those siblings from the same
  exact PASS commit.
- Each sibling declares exactly `Next on PASS: parallel join handoff` and one
  `Parallel join` field naming the single join ticket. Its final response has
  one legal completion exit: a lane-result handoff to that join. This records
  the lane's exact PASS result but does not dispatch a join whose other blockers
  are unresolved.
- The join ticket names every sibling in `Blocked by`. It becomes dispatchable
  only after all declared lane results pass, then integrates them in its fixed
  documented order. A failed or missing lane remains a blocker; an early lane
  result never chooses or starts another lane.

These two handoff labels are legal only as the matched pair above. They do not
permit arbitrary multi-successor routes, overlapping writers, or parallel
writes to shared integration surfaces.

## Exactly one completion exit

Choose from current initiative state:

| State | Only legal exit |
| --- | --- |
| Work remains on the current ticket and can be completed here | `Next：留在当前任务` with a concrete prompt |
| Current ticket passed and `Next on PASS` names a required successor | New top-level task handoff below, matching that route |
| A declared fan-out or lane ticket passed | The single matched parallel-frontier or parallel-join handoff above |
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
ledger, automatic successor, or new workflow platform. Only the owner can
dispatch a new top-level task.

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

Use the owner-approved workload routes in `model-routing.md`. Any model or
effort outside that authority requires explicit owner direction.

## Sequential worktrees

Multi-ticket work uses one explicit feature worktree sequentially:

1. The handoff records absolute worktree, branch, clean HEAD, spec, ticket, and
   fixed point.
2. The owner opens the next task manually.
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
