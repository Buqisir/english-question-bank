# Apply the first deep-seam and legacy tranche

Status: open
Claim: unclaimed
Blocked by: Replace verification, review, visual, and UI-route burden
Next on PASS: `docs/cuts/proportionate-engineering/wayfinder/tickets/13-measure-and-close-the-proportionate-engineering-blocker.md`
Terminal: no
Type: task
Priority: P1
Map: `docs/cuts/proportionate-engineering/wayfinder/map.md`

## Question

### Hypothesis and evidence target

Ticket 05 and the synthesis will name one highest-leverage bounded Module seam
and a compatible stale layer whose reform measurably reduces caller/test
fan-out without an architecture rewrite.

### Affected files and surfaces

Exactly the first-tranche Interface, implementation, callers, replacement
tests, and compatibility/docs surface selected by Ticket 08. If that surface is
not precise or exceeds one fresh context, stop and graduate smaller tickets.

### Exact decision to return

Deepen/split/delete only the selected tranche and report the observed locality
gain; retain legacy paths that still protect reachable persisted data.

### Classification candidates

Apply one decided deepen/split/delete set; do not classify by LOC.

### Named failure and deletion test

Prevent caller semantic divergence and legacy data loss. The deletion test must
show complexity moves behind one Interface rather than disappearing into
callers, and recovery fixtures must cover any removed compatibility path.

### Risk tier and why

P1 architecture with possible shared behavior; escalate to the risk named by
the selected seam.

### Dependencies, parallelism, and write conflicts

Serial after Ticket 11. Any extra precise tranches graduated by Ticket 08 block
Ticket 13 and use disjoint write surfaces.

### Fresh task size and route

One fresh context, at most 80K tokens. Terra Max for cross-cut/shared behavior,
otherwise Terra High as fixed by Ticket 08.

### Acceptance evidence

- Change simulation touches fewer callers and fewer test layers.
- Tests cross the same Interface as callers; replaced shallow tests are gone.
- Compatibility deletion has reachable-data and recovery evidence.
