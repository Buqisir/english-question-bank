# 32 — Migrate the remaining confirmed corpus

Status: PASS
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

- [ ] Exactly the 29 non-canary papers publish once from their exact Teacher-Confirmed Canonical Papers, with no missing or duplicate current identity.
- [ ] Each paper binds source digest, confirmation identity, Canonical Paper digest, publication digest, and exact reload.
- [ ] Each published Canonical Paper retains its exact Source Capture, Import Candidate, and Teacher Confirmation identities.
- [ ] Narrow deterministic admission, atomicity, and proportionate canary/public-surface checks pass; failures retain explicit retry/recovery state.
- [ ] The frozen 33-paper denominator, group/question/option accounting, and rollback inventory close exactly.
- [ ] No unchanged-adapter paper causes an authority bump, per-paper full suite, or fresh code review.

## Superseded-ticket mapping

Collapses old Tickets 63–69 into one unchanged-adapter data migration.

## Result

Commit: Ticket 32 serial migration join on `codex/ticket-32-remaining-corpus-migration-20260802`
Verify: `node scripts/verify-paper-canonical-ticket-32-remaining-migration.mjs --produce` PASS; clean `node scripts/verify-paper-canonical-ticket-32-remaining-migration.mjs --check --exact-reload` PASS (29 papers / 240 groups / 1345 questions / 3640 question-owned options; six representative public consumer reloads); `node scripts/verify-paper-canonical-registered-confirmation-admission.mjs` PASS; `git diff --check` PASS
Notes: The three committed admission allowlists were joined A → B → C into `test-fixtures/paper-canonical/publications/ticket-32-remaining-v1/store` with one SQLite writer. Every non-canary paper has one v1 immutable Publication/current identity, exact reopen, identical idempotent retry, zero residual recovery journal, and `no_prior_rollback_target`; Ticket 31's four-canary store bytes remain unchanged. Final exact accounting is `docs/cuts/paper-canonical-unification/migration/ticket-32-final-migration-accounting-v1.json`. Ticket 33 handoff: use this store and accounting as the exact 33-paper candidate for its shared Screen/Print/PDF proof; Ticket 32 does not begin Ticket 33.

Durability repair: the accepted Ticket 31 (4-current) and Ticket 32 (29-current) `publication.sqlite` snapshots are tracked with their exact bytes. `ticket-32-publication-index-durability-v1.json` pins each snapshot's SHA-256, byte length, row counts, membership, and source commit. The focused check fails closed on a missing or mismatched index, sidecar/recovery journal, current/latest-ref disagreement, or failed fresh runtime reload; it does not change publication behavior or begin Ticket 33.
