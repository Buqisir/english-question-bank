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
pauses. When decision mapping closes, its only legal successor kind is
`to-spec`. A map never routes directly to `to-tickets`, implementation,
review, fix, QA, release, or `DONE`.

## Development phase transition

Huge/foggy initiatives keep one tracked
`docs/cuts/<feature>/phase-transition.md` receipt. This section is the single
canonical owner of its semantics. The legal route kinds are distinct:

```text
Wayfinder decision → to-spec → to-tickets → owner approval
  → implementation → review/fix when required → owner QA → release → DONE
```

The receipt records the current phase and `Next on PASS`. Completed phases add
verifiable provenance: the exact entry skill, source HEAD, result commit,
artifact path, and SHA-256. A to-tickets result additionally records the exact
accepted-spec SHA-256 it consumed and a ticket-set manifest SHA-256. Owner
ticket-granularity approval records that same ticket-set manifest SHA-256.

An implementation route is dispatchable only when all four gates verify:

1. the accepted spec has committed `$to-spec` provenance;
2. the ticket set has committed `$to-tickets` provenance;
3. the ticket-set receipt binds the current accepted-spec SHA-256;
4. the owner's committed granularity approval binds the current ticket-set
   manifest SHA-256.

Filenames, directory existence, prose claims, historical chat, old handoffs,
and historical model text satisfy none of these gates. Any absent, malformed,
stale, or mismatched field fails closed at the earliest unproven phase.
To-spec, to-tickets, implementation, review, owner QA, release, and `DONE`
remain separate route kinds; no task may infer, skip, merge, or impersonate
another.

After a to-tickets task completes, an authorized coordinator always pauses.
Only a later explicit owner resume, after approval is committed in the receipt,
may select implementation.

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
