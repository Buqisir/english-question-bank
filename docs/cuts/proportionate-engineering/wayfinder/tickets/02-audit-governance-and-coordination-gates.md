# Audit governance and coordination gates

Status: open
Claim: unclaimed
Blocked by: Freeze the burden baseline and risk language
Next on PASS: `docs/cuts/proportionate-engineering/wayfinder/tickets/03-audit-verification-review-and-visual-proof.md`
Terminal: no
Type: research
Priority: P0
Map: `docs/cuts/proportionate-engineering/wayfinder/map.md`

## Question

### Hypothesis and evidence target

Dispatch, approval, digest, receipt, route-binding, phase, and successor rules
contain repeated exact-binding ceremony and semantic ownership whose burden is
not always proportional to unauthorized or irreversible action. Trace each
fact from owner to verifier to consumer, including evidence that proves other
evidence, repeated approvals, and successor-only tasks.

### Affected files and surfaces

`AGENTS.md`, `docs/agents/**`, steering workflow notes, governance verifiers,
phase receipts, maps, approval records, manifests, handoffs, and representative
cut histories. Read-only investigation; write one linked research asset.

### Exact decision to return

For every gate, which failure does it prevent; which single authority owns that
meaning; where can routine low-risk work stop requiring manual digest
comprehension or repeated approval; and which gates must remain fail-closed
because they can dispatch unauthorized or irreversible work?

### Classification candidates

Keep, downgrade, delete, deepen seam, or split by risk tier.

### Named failure and deletion test

Prevent unauthorized dispatch, overlapping writers, stale authority use, and
irreversible publication. Delete or downgrade a gate when its removal leaves
those failures closed by an earlier authoritative check and introduces no new
reachable invalid transition in adversarial route simulation.

### Risk tier and why

P0 high-risk governance: a bad deletion can authorize writes, but the current
burden directly blocks routine work and Ticket 25.

### Dependencies, parallelism, and write conflicts

Blocked only by the baseline ticket. Evidence collection is parallel-safe with
Tickets 03–07. It shares future write surfaces with all governance reform, so
resolution integration is serial. One research asset only.

### Fresh task size and route

One fresh context, 60–80K tokens. Sol Medium.

### Acceptance evidence

- Fact-owner/consumer matrix and adversarial transition examples.
- Concrete delete/downgrade candidates, including avoided successor tasks and
  an end-state routine path without digest comprehension.
- Every retained gate names the real failure and why a lighter current check is
  insufficient.
