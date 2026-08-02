# Audit module depth and architecture hotspots

Status: open
Claim: unclaimed
Blocked by: Freeze the burden baseline and risk language
Next on PASS: parallel join handoff
Parallel frontier: not-applicable
Parallel join: `docs/cuts/proportionate-engineering/wayfinder/tickets/08-decide-the-p0-p1-reform-set.md`
Terminal: no
Type: research
Priority: P1
Execution: repository-read-only; no repository or same-worktree writes
Map: `docs/cuts/proportionate-engineering/wayfinder/map.md`

## Question

### Hypothesis and evidence target

Shallow seams, caller-authored derived semantics, projections and compatibility
layers spread changes and verification across callers. Run caller/dependency
inventory, deletion tests, and representative change simulations around
`server/api.mjs`, `PaperBrowsePage.tsx`, the import-pilot verifier, shared
compiler/authority/publication, print renderer, and repeated rendered-behavior
clusters.

### Affected files and surfaces

Named hotspots plus their callers, adapters, tests, and documentation. Inspect
in-process, local-substitutable, remote-owned, and true-external dependencies.
Repository-read-only: return a structured evidence packet; make no file, claim,
status, resolution, branch, commit, or same-worktree change.

### Exact decision to return

Which Module Interface should be deepened, which pass-through seam deleted,
which hotspot split, and where derived semantics must move from callers into
one implementation? Select one highest-leverage P1 implementation tranche and
leave the rest ranked with concrete Interfaces.

### Classification candidates

Keep, delete, deepen seam, or split. LOC alone cannot classify anything.

### Named failure and deletion test

Prevent caller divergence, forged candidate semantics, inconsistent rendering,
and change fan-out. A seam earns retention only when deleting it makes necessary
complexity reappear across multiple callers; otherwise delete it. New tests
must replace shallow tests at the public Interface.

### Risk tier and why

P1 cross-cut architecture: potentially high blast radius, but no architecture
rewrite is authorized without change-simulation evidence.

### Dependencies, parallelism, and write conflicts

Baseline first; explicitly parallel-safe with Tickets 02–04 and 06–07 because
all six are repository-read-only. Ticket 08 alone records and closes results.
Only the first concrete implementation tranche is charted now.

### Fresh task size and route

One fresh context, 70–90K tokens. Sol Medium.

### Acceptance evidence

- Caller/dependency maps and at least two concrete change simulations per
  selected hotspot.
- Deletion-test results and one precise first-tranche Interface/write surface.
- Proposed tests cross the same Interface as callers and replace old layers.
