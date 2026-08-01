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

Task boundaries, dispatch authorization, and route semantics live only in
`dispatch-protocols.md`.

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
Its field schema is:

```text
Status: open | done
Claim: unclaimed | <task id>
Blocked by: <ticket titles | None>
Next on PASS: <route kind or ticket path>
Terminal: yes | no
Type: research | prototype | grilling | task
```

The map links closed tickets with one-line gists. Route and transition
semantics live only in `dispatch-protocols.md`.

## Development phase receipt

Huge/foggy initiatives keep one tracked
`docs/cuts/<feature>/phase-transition.md` receipt. Its core field schema is:

```text
Status: active | done
Previous phase: <route kind>
Current phase: <route kind>
Next on PASS: <route kind>
Terminal: yes | no
Wayfinder map: <repo-relative path>
Current map binding: pending | verified
Current map binding commit: <40-hex commit>
Current map artifact: <repo-relative path>
Current map artifact SHA-256: <64-hex digest>
Implementation dispatch: forbidden | allowed
```

Every completed task phase uses this reusable provenance group, where
`<Phase label>` is the human label for the exact route kind:

```text
<Phase label> provenance: pending | verified
<Phase label> entry skill: <absolute SKILL.md path | none>
<Phase label> source HEAD: <40-hex commit>
<Phase label> result commit: <40-hex commit>
<Phase label> artifact: <repo-relative path>
<Phase label> artifact SHA-256: <64-hex digest>
<Phase label> outcome: passed | failed | accepted | complete
```

`wayfinder`, `to-spec`, and `to-tickets` use the labels `Wayfinder`,
`To-spec`, and `To-tickets`. The spec/ticket gates add:

```text
Accepted spec: <repo-relative path | none>
Accepted spec SHA-256: <64-hex digest | pending>
Ticket-set binding: pending | verified
Ticket-set manifest: <repo-relative path | pending>
Ticket-set manifest SHA-256: <64-hex digest | pending>
Ticket-set accepted-spec SHA-256: <64-hex digest | pending>
Owner ticket-granularity approval: pending | verified
Owner approval actor: owner
Owner approval action: approve-ticket-granularity
Owner approval result commit: <40-hex commit>
Owner approval record: <repo-relative path>
Owner approval ticket-set manifest SHA-256: <64-hex digest>
Owner manifest-digest approval: pending | verified
Owner manifest-digest approval mode: pending | exact-digest | conditional-predicate
Owner manifest-digest approval actor: owner | pending
Owner manifest-digest approval action: pending | approve-manifest-digest | apply-conditional-manifest-approval
Owner manifest-digest approval source: <exact owner task/turn/message identity | pending>
Owner manifest-digest approval proposal identity: <exact proposal task/turn identity | pending>
Owner manifest-digest approval granularity identity: <exact owner granularity-approval identity | pending>
Owner manifest-digest approval predicate evidence: <repo-relative path | not-applicable | pending>
Owner manifest-digest approval predicate evidence SHA-256: <64-hex digest | not-applicable | pending>
Owner manifest-digest approval result commit: <40-hex commit | pending>
Owner manifest-digest approval record: <repo-relative path | pending>
Owner manifest-digest approval ticket-set manifest SHA-256: <64-hex digest | pending>
Implementation dispatched by approval record: no | pending
```

Conditional predicate evidence is a separate committed artifact. It reports
every mandatory clause named by `dispatch-protocols.md`, including any allowed
baseline verifier exception, while the receipt and approval record bind its
exact path and SHA-256.

Fields that belong to a pending phase may be omitted or use the shown pending
sentinel. Once its status is `verified`, every field in that group is
required. `dispatch-protocols.md` is the sole owner of allowed route kinds,
legal transitions, implementation gates, pause/resume behavior, and successor
routing; this file owns storage paths and field shape only.

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
