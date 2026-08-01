# 22 — Full-corpus zero-write compile dry run

Status: done
Blocked by: 21 — Freeze the 33-paper corpus and migration ledger
Next on PASS: independent review
Independent review PASS: `docs/cuts/paper-canonical-unification/tickets/23-hard-measured-migration-replan.md`
Terminal: no

## What to build

Run one deterministic zero-write compile-only diagnostic over the frozen
33-paper denominator and measure the real disposition, recovery-mechanism,
family, cost, and risk shape without correcting any corpus problem.

## Acceptance criteria

- [x] All 33 frozen papers run through the public compiler in zero-write mode.
- [x] `ready + needs_review + unsupported + incomplete_source +
      answer_conflict = 33` with no paper leaving the denominator.
- [x] Question source, official-answer source, attachments, Profile, and
      inactive closure are separately closed or explicitly diagnosed.
- [x] Stable diagnostics retain exact evidence refs, authority versions,
      allowed recovery actions, family, shared recovery mechanism, and enough
      measured work data for later cost-based clustering.
- [x] No source or answer correction, new Source Capture, review decision,
      Profile repair, semantic rewrite, publication, selection switch,
      migration, rollback drill, or corpus fix is performed.
- [x] Database, assets, latest, versions, source captures, publications,
      reports, refs, and journals are byte-for-byte unchanged except for the
      separately checked-in diagnostic evidence explicitly owned by this
      ticket.
- [x] No correction batch, diagnostic pilot, canary, or cohort ticket is
      created or implied by this ticket.
- [x] Focused compiler/ledger and zero-mutation checks, ordinary Standards +
      Spec self-check, full verify, and `git diff --check` pass.

## Superseded-ticket mapping

Replaces old Ticket 20. It deliberately does not begin or absorb any work from
old Tickets 21–71.

## Result

Commit: `1bd4d6d5fa8b77979ba8e0203c6c6f253381e6e8` through `4022658a82f286455b0e1dc4c63a90c570e6ceaf`; independent-review repair `99cc7e812d293933ddcf2886397dab5935db2f2e` through `a0989ba59129511325e34bd62fd143bffa4f9da3`.
Verify: `node scripts/verify-paper-canonical-migration-ledger.mjs` PASS; `node scripts/verify-paper-canonical-full-corpus-dry-run.mjs` PASS and byte-reproducible; `node --check scripts/verify-paper-canonical-full-corpus-dry-run.mjs` PASS; `git diff --check` PASS.
Notes: The frozen 33-paper denominator now produces `ready=0`, `needs_review=0`, `unsupported=33`, `incomplete_source=0`, and `answer_conflict=0`: the public compiler received only frozen `latest` bytes and therefore correctly reports no registered immutable source adapter. The durable evidence records 259 immutable input documents (9,021,287 bytes), 33 compiler diagnostics, deterministic inspection work units (2,198 total), and a source-closure risk score of 17 per paper; runtime cost/quota was not exposed. It binds every compiler, Profile, and inactive-closure diagnosis to exact source spans or immutable evidence refs, classifies analyses only as supplements, and never uses manifest Profile candidates, family counts, or ledger recovery guesses. No correction, publication, selection switch, migration, correction batch, pilot, canary, or cohort action occurred.
