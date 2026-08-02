# Decide the P0/P1 reform set

Status: open
Claim: unclaimed
Blocked by: Audit governance and coordination gates; Audit verification, review, and visual proof; Audit Canonical Paper data operations and contract fan-out; Audit module depth and architecture hotspots; Design the UI micro-change lane; Audit legacy, operations, safety, and model routing
Next on PASS: `docs/cuts/proportionate-engineering/wayfinder/tickets/09-replace-dispatch-and-approval-burden.md`
Terminal: no
Type: grilling
Priority: P0
Map: `docs/cuts/proportionate-engineering/wayfinder/map.md`

## Question

### Hypothesis and evidence target

The six audits will produce overlapping candidates; applying all of them would
itself create a giant reform. Synthesize one ordered P0/P1 set whose retained
controls each own one named failure and whose reforms have bounded, non-
overlapping write surfaces.

### Affected files and surfaces

Read the six exact read-only task result packets and current authorities. This
is their sole durable recorder: write their evidence-backed resolutions into
Tickets 02–07, mark those six done, append their one-line map gists, and record
this synthesis resolution in the same serial commit. Create no research asset,
publication ticket, approval ticket, map-review ticket, or ticket-management
ticket.

### Exact decision to return

Which candidates are accepted as keep/downgrade/delete/deepen/split, what exact
P0/P1 sequence must close before Ticket 25, what can remain P2, and which
architecture work fits the already-charted first tranche? Anything else becomes
non-blocking P2 backlog in Fog, not another child ticket.

### Classification candidates

Keep, downgrade, delete, deepen seam, or split, with exactly one semantic owner
and one acceptance check per named risk.

### Named failure and deletion test

Prevent inconsistent partial reform and accidental safety weakening. Reject a
reform when its deletion test is unproved; reject a retained mechanism when no
unique realistic failure survives without it.

### Risk tier and why

P0 cross-cut decision: it controls every following write and the blocker exit.

### Dependencies, parallelism, and write conflicts

All six read-only packets must be complete and exact. This is the only serial
recording task and is not parallel-safe. It may not add tickets or implement
reforms; the 13-ticket ceiling is closed.

### Fresh task size and route

One fresh context, 60–80K tokens. Sol Medium.

### Acceptance evidence

- Decision matrix with evidence pointers, exact owners, write surfaces, and
  ordered dependencies.
- Before/target action counts for all four workflows.
- P0/P1 set is fresh-context-sized and creates no ledger, approval loop, or
  giant verifier.
- Recording the six results adds no new principle/policy authority and creates
  no independent review merely for investigation or synthesis.
