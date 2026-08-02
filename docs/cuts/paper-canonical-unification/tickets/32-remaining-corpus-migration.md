# 32 — Migrate the remaining confirmed corpus

Status: ready
Blocked by: Ticket 31 PASS
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/33-shared-screen-print-pdf-proof.md`
Terminal: no
Model: gpt-5.6-terra
Effort: max
Parallel lane: serial deterministic batch after canary gate

## What to build

Atomically publish and exact-reload the remaining 29 confirmed Canonical
Papers through the unchanged accepted adapter and publisher, preserving
per-paper recovery and fixed-denominator accounting.

## Write surfaces

- Exclusive: the remaining 29 immutable Publications, journals/current refs,
  per-paper narrow evidence, and final migration accounting.
- Forbidden: shared adapter/schema/publisher/renderer behavior and authority
  versions; route receipts.

## Acceptance criteria

- [ ] Exactly the 29 non-canary papers publish once from their exact confirmed candidates, with no missing or duplicate current identity.
- [ ] Each paper binds source digest, confirmation identity, Canonical Paper digest, publication digest, and exact reload.
- [ ] Narrow deterministic admission, atomicity, and proportionate canary/public-surface checks pass; failures retain explicit retry/recovery state.
- [ ] The frozen 33-paper denominator, group/question/option accounting, and rollback inventory close exactly.
- [ ] No unchanged-adapter paper causes an authority bump, per-paper full suite, or fresh code review.

## Superseded-ticket mapping

Collapses old Tickets 63–69 into one unchanged-adapter data migration.

## Result

Commit:
Verify:
Notes:
