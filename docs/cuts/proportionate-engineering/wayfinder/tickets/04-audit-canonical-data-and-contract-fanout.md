# Audit Canonical Paper data operations and contract fan-out

Status: done
Claim: 019fc243-8e25-7b50-acd3-7dce12eac7d2
Blocked by: Freeze the burden baseline and risk language
Next on PASS: parallel join handoff
Parallel frontier: not-applicable
Parallel join: `docs/cuts/proportionate-engineering/wayfinder/tickets/08-decide-the-p0-p1-reform-set.md`
Terminal: no
Type: research
Priority: P0
Execution: repository-read-only; no repository or same-worktree writes
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
Repository-read-only: return a structured evidence packet; make no file, claim,
status, resolution, branch, commit, or same-worktree change.

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

Baseline first; explicitly parallel-safe with Tickets 02–03 and 05–07 because
all six are repository-read-only. Ticket 08 alone records and closes results.

### Fresh task size and route

One fresh context, 70–90K tokens. Sol Medium.

### Acceptance evidence

- Side-by-side traces for Data Addition and Shared Contract Change.
- Exact escalation predicates, including genuinely new content shape and
  anomaly canary.
- A deletion test proving Atomic Publication is visibility atomicity, not
  universal per-paper consumer revalidation.

## Resolution

Evidence packet: Codex task `019fc243-8e25-7b50-acd3-7dce12eac7d2`, read-only
at `19cc7ef5e8bf446c269343c03bf3285390d2cce8`; packet result PASS. As a concrete
fan-out contrast, shared DOCX-seam commit `0b5c7b56` changed 37 files, including
authority/schema, two Consumer Contracts, shared compiler/publication Modules,
and nine verifiers; this is not a Data Addition.

Decision:

- **Split** Data Addition from Shared Contract Change. Data Addition requires
  an unchanged registered Adapter, schema, authority, compiler, publisher,
  loader, Consumer Contracts, renderer, and known content shape. Any required
  shared write, new shape/rule, identity ambiguity, atomicity failure, or canary
  anomaly fails closed into Shared Contract Change.
- **Deepen** one candidate-bound Interface from immutable source bytes and
  deterministic issues through Teacher Confirmation to a confirmed Canonical
  Paper. Keep whole-source and candidate/confirmation/publication identities;
  delete per-field proof digests once the complete candidate closure exists.
- **Keep and deepen** one public Atomic Publication Interface owning pre-write
  admission, all-fields/version commit, exact committed reload, idempotent
  retry, recovery, digest conflict rejection, and verified rollback. Delete
  per-sidecar publication/proof.
- **Downgrade** known-shape public proof to automated Screen/Print-PDF consumer
  admission plus one proportionate actual-paper canary. Deep actual Screen,
  Student/Teacher Print HTML and Chromium PDF proof remains mandatory for a
  shared renderer/geometry/typography/anchor/visibility change, a new shape, or
  a canary anomaly.
- **Keep** Teacher Confirmation. It uniquely prevents compiler/AI interpretation
  from becoming semantic authority without the teacher trust decision.

Ticket 10 owns the accepted Data Addition Interface and escalation predicates.
Historical manifest/consumer cleanup is P2 pending reachable-data evidence.
