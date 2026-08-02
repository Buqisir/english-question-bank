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

Read the six resolution assets and current authorities. Write only this
ticket's resolution and update the map with its one-line gist.

### Exact decision to return

Which candidates are accepted as keep/downgrade/delete/deepen/split, what exact
P0/P1 sequence must close before Ticket 25, what can remain P2, and which
additional architecture tranches (if any) are now precise enough to graduate
from Fog?

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

All six audits must be done. This synthesis is serial and is not parallel-safe.
It may add only newly precise child tickets; it may not implement reforms.

### Fresh task size and route

One fresh context, 60–80K tokens. Sol Medium.

### Acceptance evidence

- Decision matrix with evidence pointers, exact owners, write surfaces, and
  ordered dependencies.
- Before/target action counts for all four workflows.
- P0/P1 set is fresh-context-sized and creates no ledger, approval loop, or
  giant verifier.
