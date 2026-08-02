# 26 — Deterministic remaining-source materialization

Status: ready
Blocked by: Ticket 25 independent review PASS
Next on PASS: parallel frontier — Tickets 27, 28, and 29
Terminal: no
Model: gpt-5.6-luna
Effort: max
Parallel lane: serial mechanical expand before paper-family lanes

## What to build

Materialize byte-bound Source Captures for the remaining 31 frozen papers with
one deterministic, replayable, atomic batch operation. This ticket records
exact source bytes, whole-file digests, roles, and parse observations only; it
does not make semantic decisions or claim Canonical Paper readiness.

## Write surfaces

- Exclusive: shared materialization script, frozen migration source inventory,
  per-paper immutable Source Capture staging, batch evidence.
- Forbidden: shared adapter/compiler/schema/authority behavior, Teacher
  Confirmation, Canonical Paper publication, current refs, renderer behavior.

## Approved membership

All frozen papers except the Ticket 25 seam pair `paper-2025-i` and
`paper-2026-i`; exactly 31 papers from the frozen ledger.

## Acceptance criteria

- [ ] All 31 raw sources match the frozen whole-file digests before any output is accepted.
- [ ] Identical inputs produce byte-identical Source Captures and ordered observations.
- [ ] The batch commits the complete set or none and preserves historical bytes.
- [ ] Outputs make no Profile, answer, group, confirmation, or readiness claim.
- [ ] Any need to change the accepted shared seam fails closed and routes back to a separately authorized shared change.
- [ ] Narrow materialization and zero-mutation checks plus `git diff --check` pass; no full suite or independent review is added solely for these data artifacts.

## Superseded-ticket mapping

Replaces old Ticket 26 mechanical work.

## Result

Commit:
Verify:
Notes:
