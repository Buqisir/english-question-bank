# Issue tracker: tracked local Markdown

EQB uses repository files as its issue tracker. Fresh tasks and worktrees must
be able to read the same decisions, so `.scratch/` is never durable routing
state.

This project configuration overrides the global `/to-spec` and `/to-tickets`
local-`.scratch` default. In EQB, anything consumed by a fresh task is written
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
Blocked by: <ticket titles or None>
Next on PASS: <ticket path | independent review | owner QA | release | DONE>
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

Tickets are worked blockers-first. By default, the owner manually starts one
fresh top-level `/implement` task per ready ticket. An owner-explicit
`$coordinate-eqb-wayfinder` may instead create the exact durable successor
under `dispatch-protocols.md`; no other agent may claim dispatch authority. The
implementation task updates only its ticket status/result plus the code it
owns. New tickets use `Next on PASS` and `Terminal` to declare their
deterministic completion route.

## Wayfinder

```text
docs/cuts/<feature>/wayfinder/
  map.md
  tickets/
    <decision-title>.md
```

`map.md` is a low-resolution index:

```markdown
Status: charted | done
Next on PASS: <one frontier ticket | post-map route | DONE>
Terminal: yes | no

## Notes

## Decisions so far

## Fog
```

Each decision ticket holds one precise question and its eventual resolution.
One top-level task resolves at most one Wayfinder ticket. The map links to the
closed ticket and records only a one-line gist.

Ticket types are `research`, `prototype`, `grilling`, and `task`. Every ticket
also records `Status`, `Claim`, `Blocked by`, `Next on PASS`, and `Terminal`.
Blocking edges are explicit; a dispatchable frontier is one open, unclaimed,
unblocked ticket selected by the map's durable route, not every plausible open
ticket.

Under an owner-started coordinator, validated research and prototype routes
may advance without another owner dispatch. Grilling or any owner-input need
pauses. When decision mapping closes, the map's durable `Next on PASS` may
route into implementation, review, fix, owner QA, release, and `DONE`; owner QA
itself remains an owner-acceptance pause.

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

If EQB later adopts GitHub Issues or another tracker, keep the same map,
ticket, blocking, and frontier semantics. Do not initialize or migrate a
tracker automatically.
