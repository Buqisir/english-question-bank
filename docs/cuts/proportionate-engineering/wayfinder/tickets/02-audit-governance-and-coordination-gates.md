# Audit governance and coordination gates

Status: done
Claim: 019fc243-8929-7942-aa3a-43e2034aa7a2
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

## Resolution

Evidence packet: Codex task `019fc243-8929-7942-aa3a-43e2034aa7a2`, read-only
at `19cc7ef5e8bf446c269343c03bf3285390d2cce8`; packet result PASS. The packet
observed `403 PASS / 1 FAIL` from the governance verifier: the failure was the
verifier applying ticket-only parallel-route fields to this Wayfinder map, not
an illegal dispatch.

Decision:

- **Keep** manual owner dispatch, exact worktree/branch/HEAD/clean/exclusive-
  writer preflight, owner semantic/granularity approval, machine-computed byte
  identity and ancestry, and closed legal transitions. They uniquely prevent,
  respectively, agent authority expansion, dirty/concurrent writes, owner-
  unapproved scope, substituted artifacts, and illegal route edges.
- **Delete** the agent-side coordinator dispatch exception and the conditional-
  manifest approval/approval-recording-peer/two-commit ceremony. Manual owner
  dispatch plus receiving-task preflight closes duplicate/stale-writer risk;
  one owner semantic approval plus deterministic machine binding in the same
  planning commit closes proposal/byte drift without requiring human digest
  comprehension. Any non-equivalence still fails closed for owner input.
- **Deepen** one typed route Interface: the phase receipt is the sole live route
  state for huge initiatives, while a Wayfinder map is an index. Validate maps,
  tickets, and receipts by artifact kind; remove map-as-route digest binding and
  duplicated route-equality assertions.
- **Deepen** external blockers into one exact, resolvable ticket-DAG dependency;
  delete same-meaning repetitions in map, manifest, and receipt. Missing,
  changed, or open dependencies remain fail-closed.
- **Downgrade** repeated provenance and handoff metadata to the minimum facts
  that cannot be derived: worktree, branch, HEAD, ticket, fixed point, current
  artifact path/digest/outcome. Keep explicit spec/model only when current
  authority cannot derive them uniquely.

Accepted P0 implementation surface is Ticket 09 only: governance/dispatch
authorities and their direct executable verifier. Exact-prose cleanup and
post-deepening verifier decomposition are non-blocking P2.
