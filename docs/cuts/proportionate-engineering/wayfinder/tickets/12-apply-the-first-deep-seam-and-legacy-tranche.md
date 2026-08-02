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

Exactly one new pure Rendered Behavior Plan Module under
`shared/paper-canonical/**`, the Screen and Print callers that currently derive
the same family/chrome/rhythm relationships, their replacement/public-seam
tests, and the no-op `saveAssemblyBasket()` definition/import/call/assertions.
Keep the independent Assembly Basket migration reader. Ticket 12 may not split
the tranche into additional tickets.

### Exact decision to return

Implement a renderer-neutral `planCanonicalRenderedBehavior` Interface over
ordered blocks and canonical consumption. It returns family/group
relationships and block roles, not DOM/CSS/React/HTML. Screen and Print retain
media rendering and geometry but delete their duplicate shared derivation.
Replace shallow expectations at the Plan Interface while retaining Screen DOM,
Print HTML and risk-required real PDF observations. Also delete only the proven
no-op Assembly Basket writer seam; retain all reachable legacy consumer/Print
compatibility paths. A documentation-only description cannot pass.

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

Serial after Ticket 11. Additional precise improvements are non-blocking P2
backlog and neither grow this map nor block Ticket 13.

### Fresh task size and route

One fresh context, at most 80K tokens. Terra Max for cross-cut/shared behavior,
otherwise Terra High as fixed by Ticket 08.

### Acceptance evidence

- Change simulation touches fewer callers and fewer test layers.
- Tests cross the same Interface as callers; replaced shallow tests are gone.
- Family insertion/reorder, page-break/heading boundary, duplicate/missing
  canonical occurrence, and previous/next binding are covered at the Plan
  Interface; Screen and Print each prove mapping to it.
- No-op writer deletion leaves in-memory basket behavior and the migration
  reader unchanged.
- No compiler, authority, publication, schema, production/R2 or visual-redesign
  surface changes.
- Independent review occurs only if the actual selected tranche changes high-
  risk shared behavior; otherwise normal in-ticket review is sufficient.
