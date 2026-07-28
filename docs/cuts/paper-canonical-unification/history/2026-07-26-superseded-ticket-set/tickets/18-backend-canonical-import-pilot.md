# 18 — Backend canonical import pilot

Status: ready
Blocked by: 17 — Import recovery, retry, and rollback
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/19-freeze-corpus-migration-ledger.md`
Terminal: no

## What to build

Run one local backend source package through capture, compile, atomic publish,
exact reload, rendered consumption, retry, and rollback using the executable
authority and public admission seam.

## Acceptance criteria

- [ ] The backend agent/runbook names the exact capture, compiler, publisher,
      loader, recovery, and evidence boundaries.
- [ ] One local source package completes dry run, successful publish, exact
      reload, retry, and rollback without an operator-only bypass.
- [ ] The published paper produces checkable PaperSurface, student/teacher
      Print/PDF, and student/teacher DOCX artifacts.
- [ ] Student/teacher semantics and answer visibility agree with the accepted
      canonical contracts.
- [ ] No website import or normalization-review UI, production write, R2
      action, or historical-version compilation is added.
- [ ] From the exact reviewed HEAD, the implementation task provisions and
      opens the required page and artifacts with the canonical QA checklist;
      QA pauses for owner verdict.
- [ ] Focused checks, ordinary Standards + Spec self-check, app/server checks,
      full verify, and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
