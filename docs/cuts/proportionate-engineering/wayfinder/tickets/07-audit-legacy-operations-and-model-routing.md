# Audit legacy, operations, safety, and model routing

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

Stale compatibility paths, repeated ADR/status/authority prose, historical
artifacts in current routing, operational ceremony, overly strong model routes,
and serialized independent investigations add burden; some remain necessary
for persisted data or production safety. Inventory live callers/data and name
the risk behind every retained operation or coordination control.

### Affected files and surfaces

Compatibility code, docs/ADRs/status/cuts, scripts and operational runbooks,
auth/owner-member isolation, persistence/migrations, backups/R2, production
configuration, recovery, model routing, and coordination instructions.
Repository-read-only: return a structured evidence packet; make no file, claim,
status, resolution, branch, commit, or same-worktree change.

### Exact decision to return

What can be deleted or downgraded now, what needs live-data evidence, which
security/operations controls remain mandatory, which independent read-only
investigations can run in parallel, and which repetitive bounded inventories
fit Luna Max while judgment remains Sol?

### Classification candidates

Keep, downgrade, delete, deepen seam, or split current authority from history.

### Named failure and deletion test

Prevent auth bypass, cross-user leakage, data loss, unrecoverable migration,
unsafe production mutation, and false model conclusions. Delete ceremony only
when recovery/fault simulation and live-caller evidence show no increased risk;
never infer cost, quota, billing, or model intelligence.

### Risk tier and why

P1 mixed, with preserved P0 security and durability controls.

### Dependencies, parallelism, and write conflicts

Baseline first; explicitly parallel-safe with Tickets 02–06 because all six are
repository-read-only. Ticket 08 alone records and closes their results.

### Fresh task size and route

One fresh context, 60–80K tokens. Sol Medium; fixed mechanical inventories may
use Luna Max after their expected outputs are specified.

### Acceptance evidence

- Live-caller/data evidence for each compatibility classification.
- Preserved-control table for auth, isolation, persistence, backups,
  production configuration, and recoverability.
- Model/parallelization route based only on workload and observed evidence.
