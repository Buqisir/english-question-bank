# Issue tracker: tracked local Markdown

EQB uses repository files as its issue tracker. Fresh tasks and worktrees must
be able to read the same decisions, so `.scratch/` is never durable routing
state.

This project configuration overrides the global `/to-spec` and `/to-tickets`
local-`.scratch/` default. In EQB, anything consumed by a fresh task is written
to the tracked paths below.

## Normal multi-session feature

```text
docs/cuts/<feature>/
  spec.md
  tickets/
    01-<title>.md
    02-<title>.md
```

Each ticket contains:

```markdown
# <NN> — <title>

Status: ready | in-progress | done | blocked
Blocked by: <ticket titles or exact ticket dependencies | None>
Next on PASS: <ticket path | parallel frontier handoff | parallel join handoff | independent review | owner QA | release | DONE>
Terminal: yes | no

## What to build

<one complete, user-visible or behaviorally verifiable vertical slice>

## Acceptance criteria

- [ ] ...

## Result

Commit:
Verify:
Notes:
```

`Parallel frontier` and `Parallel join` are one conditional matched-route field
group. Ordinary serial tickets omit both fields. A ticket whose `Next on PASS`
is `parallel frontier handoff` or `parallel join handoff` includes both fields:

```text
Parallel frontier: <comma-separated sibling ticket paths | not-applicable>
Parallel join: <one join ticket path | not-applicable>
```

This file owns that conditional stored shape only. Deterministic frontier/join
values, topology, handoff behavior, and failure semantics live only in
`dispatch-protocols.md`.

Task boundaries, dispatch authorization, and route semantics live only in
`dispatch-protocols.md`.

## Wayfinder

```text
docs/cuts/<feature>/wayfinder/
  map.md
  tickets/
    <decision-title>.md
```

`map.md` is a low-resolution index, never a route artifact:

```markdown
Status: charted | done

## Notes

## Decisions so far

## Fog
```

Each decision ticket holds one precise question and its eventual resolution.
Its field schema is:

```text
Status: open | done
Claim: unclaimed | <task id>
Blocked by: <ticket titles or exact ticket dependencies | None>
Next on PASS: <route kind or ticket path>
Terminal: yes | no
Type: research | prototype | grilling | task
```

The map links closed tickets with one-line gists. It never duplicates ticket
blockers, live phase state, or route/digest bindings. Route and transition
semantics live only in `dispatch-protocols.md`.

## Development phase receipt

Huge/foggy initiatives keep one tracked
`docs/cuts/<feature>/phase-transition.md` receipt. It is the only live phase
state. Its core field schema is:

```text
Status: active | done
Previous phase: <route kind>
Current phase: <route kind>
Next on PASS: <route kind>
Terminal: yes | no
Worktree: <absolute path>
Branch: <branch>
HEAD: <40-hex commit>
Fixed point: <40-hex commit>
Current ticket: <repo-relative ticket path>
Implementation dispatch: forbidden | allowed
```

Every completed task phase uses this minimum machine-checkable artifact group,
where `<Phase label>` is the human label for the exact route kind:

```text
<Phase label> artifact: <repo-relative path>
<Phase label> artifact SHA-256: <64-hex digest>
<Phase label> result commit: <40-hex commit>
<Phase label> outcome: passed | failed | accepted | complete
```

`wayfinder`, `to-spec`, and `to-tickets` use the labels `Wayfinder`,
`To-spec`, and `To-tickets`. The spec/ticket gates add:

```text
Accepted spec: <repo-relative path | none>
Accepted spec SHA-256: <64-hex digest | pending>
Accepted spec result commit: <40-hex commit | pending>
Ticket-set manifest: <repo-relative path | pending>
Ticket-set manifest SHA-256: <64-hex digest | pending>
Ticket-set result commit: <40-hex commit | pending>
Ticket-set accepted-spec SHA-256: <64-hex digest | pending>
Owner semantic approval: pending | verified
Owner approval actor: owner | pending
Owner approval action: approve-ticket-set | pending
Owner approval source: <exact owner task/turn/message identity | pending>
Owner approval result commit: <40-hex commit | pending>
Owner approval record: <repo-relative path | pending>
Owner approval ticket-set manifest SHA-256: <64-hex digest | pending>
```

The owner approval is one semantic decision about the proposed ticket set.
The verifier, not the owner, compares the stored spec and manifest digests
with the bytes at the recorded commits and checks ancestry to the receipt HEAD.
The receipt may contain at most one external dependency:

```text
External blocker dependency: none | <repo-relative ticket path>@<40-hex commit>
```

The cited artifact must be a closed ticket at that exact ancestor commit.
No additional approval record or route-binding artifact is part of this
Interface.

Historic receipts and manifests can retain their original fields as immutable
evidence. They are not a current route Interface. A later authorized task that
changes such a route must write the current receipt shape and pass the current
Interface before it can dispatch implementation.

This file defines only stored field shapes. The allowed combinations,
preflight, closure-transition proof, dispatch gate, and failure behavior live
only in `dispatch-protocols.md`.

## Optional assets

Use only when the work needs them:

```text
docs/cuts/<feature>/
  decisions.md
  research/
  prototype.html
  review.md
  qa/
  handoff.md
```

Research and handoff assets are temporary by default. Promote only decisions
that future work truly needs.

## `.scratch/`

`.scratch/` is gitignored local scratch space. It is allowed for throwaway
notes inside one task, but:

- never put a spec or ticket there if a fresh task will consume it;
- never cite it in `Next`;
- never treat it as shared truth;
- delete or ignore it after the task.

## External tracker

If EQB later adopts GitHub Issues or another tracker, preserve equivalent
tracked paths and field schema. Do not initialize or migrate a tracker
automatically.
