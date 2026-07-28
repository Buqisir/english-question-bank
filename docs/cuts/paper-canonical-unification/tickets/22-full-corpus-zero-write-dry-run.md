# 22 — Full-corpus zero-write compile dry run

Status: ready
Blocked by: 21 — Freeze the 33-paper corpus and migration ledger
Next on PASS: independent review
Independent review PASS: `docs/cuts/paper-canonical-unification/tickets/23-hard-measured-migration-replan.md`
Terminal: no

## What to build

Run one deterministic zero-write compile-only diagnostic over the frozen
33-paper denominator and measure the real disposition, recovery-mechanism,
family, cost, and risk shape without correcting any corpus problem.

## Acceptance criteria

- [ ] All 33 frozen papers run through the public compiler in zero-write mode.
- [ ] `ready + needs_review + unsupported + incomplete_source +
      answer_conflict = 33` with no paper leaving the denominator.
- [ ] Question source, official-answer source, attachments, Profile, and
      inactive closure are separately closed or explicitly diagnosed.
- [ ] Stable diagnostics retain exact evidence refs, authority versions,
      allowed recovery actions, family, shared recovery mechanism, and enough
      measured work data for later cost-based clustering.
- [ ] No source or answer correction, new Source Capture, review decision,
      Profile repair, semantic rewrite, publication, selection switch,
      migration, rollback drill, or corpus fix is performed.
- [ ] Database, assets, latest, versions, source captures, publications,
      reports, refs, and journals are byte-for-byte unchanged except for the
      separately checked-in diagnostic evidence explicitly owned by this
      ticket.
- [ ] No correction batch, diagnostic pilot, canary, or cohort ticket is
      created or implied by this ticket.
- [ ] Focused compiler/ledger and zero-mutation checks, ordinary Standards +
      Spec self-check, full verify, and `git diff --check` pass.

## Superseded-ticket mapping

Replaces old Ticket 20. It deliberately does not begin or absorb any work from
old Tickets 21–71.

## Result

Commit:
Verify:
Notes:
