# Audit Canonical Paper data operations and contract fan-out

Status: open
Claim: unclaimed
Blocked by: Freeze the burden baseline and risk language
Next on PASS: `docs/cuts/proportionate-engineering/wayfinder/tickets/05-audit-module-depth-and-hotspots.md`
Terminal: no
Type: research
Priority: P0
Map: `docs/cuts/proportionate-engineering/wayfinder/map.md`

## Question

### Hypothesis and evidence target

Ordinary paper Data Additions are treated as Shared Contract Changes through
authority bumps, manifest/consumer fan-out, full suites, dual-axis review, and
manual multi-surface proof. Trace one known-shape import and one true shared
change through adapter, schema, compiler, Teacher Confirmation, publication,
reload/retry, canary, manifests, and consumers.

### Affected files and surfaces

Canonical standards/schemas/manifests/consumers, shared compiler/authority/
publication modules, import scripts and runbooks, current migration tickets,
paper assets, public Screen/Print/PDF seams, and atomic publication/recovery.

### Exact decision to return

What exact Interface makes a paper a Data Addition; what is the minimal source
digest, deterministic validation, Teacher Confirmation, atomic all-or-nothing
publication, and canary route; and which conditions escalate to Shared Contract
Change or deep Screen/Print/PDF proof?

### Classification candidates

Keep, downgrade, delete, deepen seam, or split data from shared behavior.

### Named failure and deletion test

Prevent wrong-source publication, partial visibility, unconfirmed semantics,
retry corruption, novel-shape misclassification, and consumer incompatibility.
Remove per-paper authority/version/review/proof steps when fault injection at
the unchanged publication Interface still rejects each named failure.

### Risk tier and why

P0 high data integrity but routine/reversible workflow: the seam must preserve
atomicity without re-proving unchanged consumers.

### Dependencies, parallelism, and write conflicts

Baseline first; read-only evidence is parallel-safe with Tickets 02–03 and
05–07. Future writes overlap canonical authority, compiler, and testing reforms.

### Fresh task size and route

One fresh context, 70–90K tokens. Sol Medium.

### Acceptance evidence

- Side-by-side traces for Data Addition and Shared Contract Change.
- Exact escalation predicates, including genuinely new content shape and
  anomaly canary.
- A deletion test proving Atomic Publication is visibility atomicity, not
  universal per-paper consumer revalidation.
