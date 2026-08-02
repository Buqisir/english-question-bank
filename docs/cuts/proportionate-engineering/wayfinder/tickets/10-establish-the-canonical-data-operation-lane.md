# Establish the Canonical Paper data-operation lane

Status: open
Claim: unclaimed
Blocked by: Replace disproportionate dispatch and approval burden
Next on PASS: `docs/cuts/proportionate-engineering/wayfinder/tickets/11-replace-verification-and-ui-route-burden.md`
Terminal: no
Type: task
Priority: P0
Map: `docs/cuts/proportionate-engineering/wayfinder/map.md`

## Question

### Hypothesis and evidence target

An unchanged accepted adapter/schema/publisher/renderer can expose one deep
Data Addition Interface that owns source identity, deterministic admission,
Teacher Confirmation, atomic publication/reload/retry, and canary routing.

### Affected files and surfaces

Only the canonical import/publication Interface, its direct behavioral tests,
and minimal current authority named by Ticket 08. Do not import a new paper or
touch Ticket 25/current paper-canonical route artifacts.

### Exact decision to return

Implement the accepted Data Addition lane and escalation predicates while
preserving Shared Contract Change handling.

### Classification candidates

Apply decided deletions/downgrades; deepen the publication seam; split Data
Addition from Shared Contract Change.

### Named failure and deletion test

Prevent wrong-source, unconfirmed, partial, non-idempotent, novel-shape, and
consumer-incompatible publication. Fault injection at the public Interface
must catch each failure without per-paper authority bump/full suite/dual-axis
review/manifest approval/manual multi-surface proof.

### Risk tier and why

P0 high-integrity shared behavior; atomicity and durable data demand Terra Max.

### Dependencies, parallelism, and write conflicts

Ticket 09 and Ticket 08's exact surface. Serial; conflicts with compiler,
authority, publication, manifest, and verification work.

### Fresh task size and route

One fresh context, 70–90K tokens. Terra Max.

### Acceptance evidence

- Public-seam fault tests for all named publication failures.
- One known-shape dry-run follows the light lane; one simulated shared change
  and one new-shape case escalate.
- Atomic Publication is proven as all-fields/version visibility, not repeated
  consumer-surface proof.
