# Audit governance and coordination gates

Status: open
Claim: unclaimed
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

Dispatch, approval, digest, receipt, route-binding, phase, and successor rules
contain repeated exact-binding ceremony and semantic ownership whose burden is
not always proportional to unauthorized or irreversible action. Trace each
fact from owner to verifier to consumer, including evidence that proves other
evidence, repeated approvals, and successor-only tasks.

### Affected files and surfaces

`AGENTS.md`, `docs/agents/**`, steering workflow notes, governance verifiers,
phase receipts, maps, approval records, manifests, handoffs, and representative
cut histories. This task is repository-read-only: write no file, claim, status,
resolution, branch, commit, or same-worktree byte. Return one structured
evidence packet for Ticket 08 to record.

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

Blocked only by the baseline ticket. It is explicitly parallel-safe with
Tickets 03–07 because all six are repository-read-only and make no same-
worktree writes. Ticket 08 alone records and closes their results.

### Fresh task size and route

One fresh context, 60–80K tokens. Sol Medium.

### Acceptance evidence

- Fact-owner/consumer matrix and adversarial transition examples.
- Concrete delete/downgrade candidates, including avoided successor tasks and
  an end-state routine path without digest comprehension.
- Every retained gate names the real failure and why a lighter current check is
  insufficient.
