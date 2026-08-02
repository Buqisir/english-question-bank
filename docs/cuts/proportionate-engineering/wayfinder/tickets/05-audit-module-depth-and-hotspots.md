# Audit module depth and architecture hotspots

Status: done
Claim: 019fc243-942d-7fc0-95b2-da715a952799
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

## Resolution

Evidence packet: Codex task `019fc243-942d-7fc0-95b2-da715a952799`, read-only
at `19cc7ef5e8bf446c269343c03bf3285390d2cce8`; packet result PASS. No P0
architecture safety gap was found. The highest-leverage P1 hotspot is duplicate
caller-authored rendered behavior: Screen derives roughly 291 lines and Print
roughly 381 lines of the same family order, chrome, rhythm, predecessor, and
following-section semantics.

Decision:

- **Keep** `compileCanonicalPaper`, authority resolution, whole-publication
  loading, and atomic journal/recovery. Their deletion makes necessary
  authority, source, visibility, and recovery complexity reappear across many
  callers.
- **Deepen** one pure `Rendered Behavior Plan` Module whose small Interface
  accepts renderer-neutral ordered blocks plus canonical consumption and
  returns family/group relationships and block roles. Screen and Print keep
  media rendering and geometry, but no longer independently own the shared
  derived semantics.
- **Replace tests** at that Interface, then retain one Screen DOM observation
  and one Print HTML observation plus risk-required real PDF evidence. Delete
  renderer-local/source-shape expectations only when equivalent behavior has
  moved to the shared Interface test.
- **Split** import-pilot internals while retaining one CLI and final aggregate
  result; this overlaps Ticket 03 and is therefore one Ticket 11 reform, not a
  second candidate.
- **Keep for now** the legacy Print group Adapter. Although shallow, current
  production callers can still reach it when whole-paper consumption is absent;
  deletion requires persisted-data migration and Screen/Print/PDF evidence.

Ticket 12 owns only the Rendered Behavior Plan tranche and its replacement
tests. `server/api.mjs`, host-page composition, publication internals,
authority-registry layout, and legacy Print removal are non-blocking P2.
