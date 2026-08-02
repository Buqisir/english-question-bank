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
create another coordinator, or overlap writers, except for the one same-peer
`$to-tickets` publication resume defined below.

The global skill executes the project authorities in this file,
`issue-tracker.md`, `model-routing.md`, `testing-cadence.md`, and
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
| `implementation` | `implementation`, `independent-review`, `owner-qa`, `release`, or the guarded measured-replan re-entry to `to-tickets` below |
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

### Guarded measured-replan re-entry

`implementation` may re-enter `to-tickets` only when every condition below is
proven together:

1. a committed current implementation result explicitly failed closed;
2. immutable, hashable measured evidence proves that the approved ticket
   capacity or route assumption is invalid;
3. continuing the declared implementation successor would be unsafe or false;
4. the owner explicitly authorizes one bounded measured replan; and
5. the coordinator freshly verifies the exact worktree, branch, HEAD, clean
   state, current route binding, and absence of another writer.

Missing or stale evidence, an ordinary implementation failure, or a desire to
improve the plan does not select this edge. On entry, implementation dispatch
is immediately forbidden. It remains forbidden until the replacement manifest
has truthful `$to-tickets` provenance, binds the accepted spec, and passes both
distinct owner approvals: exact ticket granularity and then the exact produced
manifest SHA-256. Only after those approvals do the existing four
implementation gates authorize implementation again.

### Coordinator-managed to-tickets lifecycle

One fresh `$to-tickets` peer may draft the complete proposal and pause before
publication for owner ticket-granularity approval. The proposal identity is
the peer id plus the exact proposed ticket set presented for approval.

After the owner explicitly approves that exact proposal, the coordinator may
perform another full preflight and resume that same exact peer once through the
official Codex top-level task messaging mechanism so the peer performs its own
publication stage. No second publication peer or later provenance-recovery
peer is allowed: the same `$to-tickets` peer truthfully owns both proposal and
publication.

After publication returns, a full preflight selects exactly one result: record
manifest approval under a valid owner-selected policy, or pause for owner
input. The ordinary policy remains explicit approval of the produced exact
manifest SHA-256. Ticket-granularity approval never implies manifest approval;
conditional approval is never inferred from silence, a generic continue,
granularity approval alone, or historical preference. This lifecycle does not
authorize automatic implementation dispatch.

### Conditional manifest approval

The owner may opt in by explicitly approving one exact ticket-granularity
proposal identity and a deterministic publication/equivalence predicate. This
approves that predicate, not unknown content. It authorizes automatic binding
of the produced exact manifest SHA-256 only if every clause below is proven in
one post-publication preflight:

1. the proposal task/turn identity and owner granularity-approval identity are
   exact, unchanged, and equal to the authorization;
2. published ticket count, titles, blockers, paper membership, capacity
   annotations, model routes, parallel lanes, merge order, and downstream
   obligations equal the approved proposal;
3. every manifest path and digest matches the current ticket bytes;
4. accepted-spec binding, `$to-tickets` provenance, ticket-set binding,
   route/map/receipt identity, clean exact HEAD, ancestry, and exclusive-writer
   checks pass;
5. implementation dispatch stayed forbidden throughout evaluation; and
6. there is no new relevant verifier failure, malformed evidence, drift, or
   partial publication.

A documented verifier failure may remain only when machine evidence proves it
is identical to the pre-publication baseline and outside every changed or
authority surface; the approval evidence must still report it. If any clause
fails or cannot be proven, do not approve or start implementation: pause for
owner input with the exact anomaly.

On PASS, one bounded approval-recording peer may update only the minimum
complete route surface: predicate evidence, approval record, the Wayfinder
map's route field, and the receipt including its current-map binding. Creating
this peer is allowed only after every predicate fact is already proven and no
writer overlaps. It must not also start implementation. It must use this
deterministic two-commit sequence:

1. The approval-route commit writes only the predicate evidence, approval
   record, and map `Next on PASS`. The record cites the exact conditional-
   authorization source, proposal and granularity identities, machine-
   verification evidence, actual generated manifest SHA-256, and the exact
   approval-recording peer identity, and states that it did not dispatch
   implementation. It must not claim the hash of the commit that contains it.
2. The immediately following binding commit writes only the receipt. It records
   the approval-route commit as the manifest-approval result commit, binds the
   exact map path and SHA-256 at that ancestor commit, and makes receipt
   `Current phase`, receipt `Next on PASS`, and map `Next on PASS` agree. It may
   mark implementation dispatch allowed only when all four implementation
   gates verify against the resulting exact HEAD.

The first commit is a deliberately non-dispatchable intermediate state. Until
the second commit is complete and the worktree is clean, every observer must
fail closed; interruption never authorizes implementation or a replacement
peer. Both commits belong to the same exclusive writer, and the approval-route
commit must be the direct parent of the binding commit. The coordinator then
performs another full preflight of the exact bytes, ancestry, route agreement,
and exclusive-writer state, and re-verifies all four implementation gates
before any implementation dispatch; no additional owner message containing
the hexadecimal digest is required.

### Implementation gates

Implementation is forbidden until all four gates verify:

1. the accepted spec has committed `$to-spec` provenance and its current
   SHA-256 matches;
2. the ticket-set manifest has committed `$to-tickets` provenance and its
   current SHA-256 matches;
3. the ticket-set receipt binds that exact accepted-spec SHA-256;
4. the owner explicitly approved the exact ticket granularity, and the later
   committed manifest approval binds that exact ticket-set manifest SHA-256
   either by explicit exact-digest approval or by a valid conditional-predicate
   approval record.

Filenames, directory existence, prose claims, historical chat, and old
handoffs satisfy none of these gates.

### External implementation blockers

An owner-explicit external blocker is an additional fail-closed gate; it never
substitutes for or obscures the four canonical authority gates. The receipt
field group is optional when no external blocker has ever been declared. Once
declared, all three fields are required and the blocker kind remains stable:

- `active` requires a non-placeholder durable blocker kind, closure evidence
  `pending`, and `Implementation dispatch: forbidden`;
- `none` is a closure transition, not an empty-state sentinel. It requires the
  same durable blocker kind and closure evidence in the exact form
  `<repo-relative-path>@<40-hex-commit>`;
- the evidence commit must resolve and be an ancestor of the receipt HEAD, the
  named artifact must exist at that commit, and that artifact must declare
  `Status: done` or `Status: closed` plus an identical `External blocker kind`;
- `none + pending`, `none + not-applicable`, a missing or changed kind, an
  unresolvable/non-ancestor commit, a missing artifact, or inconsistent closure
  content all fail closed. Dispatch may become `allowed` only after this
  closure proof and all four canonical authority gates pass.

An active blocker does not authorize creating or executing the work that would
close it. That work still needs its own owner-selected route and authority.

### Review and fix routes

One implementation task keeps implementation, TDD, ordinary Standards + Spec
review, ordinary fixes, verification, and commit together. Those ordinary
activities never become successor phases.

A fresh peer is used only for a separately required independent review
lineage. Only a canonical failed result from that lineage may select one fresh
`independent-fix` peer. The next review is the focused re-review in the same
lineage; a review failure authorizes no automatic retry or refill.

### Pause and resume

Coordination pauses at `owner-approval` until either the owner commits explicit
approval of the exact ticket-set digest and resumes, or a previously explicit
conditional policy passes and its bounded approval record is committed. It
also pauses at `owner-qa` after the exact checkable state is provisioned, and
for grilling or other owner input, `needs-attention`, `BLOCKED`, dirty or
mismatched repository state, malformed evidence, route mismatch, duplicate
dispatch, cycles, or lost ledger certainty.

Resume requires another full preflight of the saved worktree, branch, HEAD,
clean state, fixed point, current committed map/receipt, route binding,
provenance, gates, model route, and absence of another writer. A pause never
authorizes retry, refill, a replacement root, or a second concurrent writer.
`DONE` requires `Terminal: yes` and proof that no ticket, independent review,
owner QA, release, or closeout remains.

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

Use the owner-approved workload routes in `model-routing.md`. Any model or
effort outside that authority requires explicit owner direction.

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
