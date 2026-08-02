# Audit legacy, operations, safety, and model routing

Status: done
Claim: 019fc243-9687-7ab3-aeee-f215d13301cc
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

## Resolution

Evidence packet: Codex task `019fc243-9687-7ab3-aeee-f215d13301cc`, read-only
at `19cc7ef5e8bf446c269343c03bf3285390d2cce8`; packet result PASS. A read-only
local census found 33 `latest` papers, zero canonical publication rows, and zero
canonical latest refs. Those local databases are not production truth; the
committed production/R2 record may be stale and no live operation was run.

Decision:

- **Keep** authentication, owner/member authorization, per-user persistence
  isolation, transactional migration/recovery, atomic bank transport, additive
  R2 backup/restore proof, and exact production-posture checks. UI hiding,
  health-only smoke, ordinary copy, or schema-presence checks do not close their
  unique auth-bypass, cross-user leak, data-loss, partial-migration, wrong-
  release, or off-site recovery failures.
- **Keep** whole-paper legacy projection, the Print compatibility allowlist,
  Canonical legacy-family capability, and the Assembly Basket migration reader
  until persisted production/browser evidence proves them unreachable.
- **Delete in Ticket 12** only the proven no-op `saveAssemblyBasket()` writer,
  its sole call/import, and assertions. Its independent migration reader stays.
- **Keep current model routing.** Luna Max is limited to mechanically specified
  inventories; Sol retains deletion, security/durability, and cross-packet
  judgment. Observed tasks were not a controlled model comparison and prove
  nothing about cost, quota, billing, or intelligence.
- **Keep parallel read-only evidence collection with one serial writer.** Do
  not generalize it into parallel same-worktree writers.

Exact-release deploy hardening, separating destructive R2 retention from daily
additive backup, moving lazy user-schema migration behind its Interface,
current-vs-history document cleanup, migration-script retirement, ADR/status
cleanup, backup-script retirement, and legacy consumer deletion all remain
non-blocking P2. They require fresh production/browser/live-data authority and
must not touch production/R2 or delay Ticket 25.
