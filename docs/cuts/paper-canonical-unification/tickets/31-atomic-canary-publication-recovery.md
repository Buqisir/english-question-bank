# 31 — Atomic canary publication and recovery

Status: ready
Blocked by: Ticket 30 PASS
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/32-remaining-corpus-migration.md`
Terminal: no
Model: gpt-5.6-terra
Effort: max
Parallel lane: serial canary gate

## What to build

Publish four representative confirmed Canonical Papers through the unchanged
accepted atomic publisher; prove exact reload, retry, failure recovery,
rollback, and proportionate Screen/Print/PDF canary behavior before the rest
of the corpus migrates.

## Approved membership

`paper-960d0f8d`, `paper-2025-ii`, `paper-2023-yi`, and
`paper-zj-2022-jun`.

## Write surfaces

- Exclusive: these four immutable Publications, their journals/current refs,
  canary recovery and public-surface evidence, shared migration accounting.
- Forbidden: the other 29 Publications; shared adapter/schema/publisher/
  renderer behavior; route receipts.

## Acceptance criteria

- [ ] Each canary publishes atomically only from its exact confirmed Canonical Paper and reloads the same identity.
- [ ] Pre/post-commit failures, identical retry, digest conflict, and rollback preserve the accepted recovery contract.
- [ ] Risk-proportionate real Screen, Student/Teacher Print HTML, and direct Chromium PDF checks pass.
- [ ] Any need to change shared behavior fails closed and requires a separate versioned, adversarially tested, independently reviewed shared-change ticket.
- [ ] Because the accepted shared behavior is unchanged, no manifest/schema bump, per-paper full suite, or fresh code review is performed.

## Superseded-ticket mapping

Collapses old Tickets 59–62 into one canary batch.

## Result

Commit:
Verify:
Notes:
