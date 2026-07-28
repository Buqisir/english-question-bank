# 20 — Backend canonical import pilot on supported outputs

Status: ready
Blocked by: 19 — Import recovery, retry, and rollback
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/21-freeze-corpus-migration-ledger.md`
Terminal: no

## What to build

Run one local backend source package through capture, compile, atomic publish,
exact reload, supported rendered consumption, retry, and rollback using the
executable authority and public admission seam.

## Acceptance criteria

- [ ] The backend agent/runbook names the exact capture, compiler, publisher,
      loader, recovery, and evidence boundaries.
- [ ] One local source package completes dry run, successful publish, exact
      reload, retry, and rollback without an operator-only bypass.
- [ ] The published paper produces checkable PaperSurface plain/lecture,
      Student/Teacher Print HTML, and direct Chromium PDF artifacts.
- [ ] No DOCX, OOXML, or DOCX-converted-PDF artifact is generated or required.
- [ ] Student/Teacher semantics and answer visibility agree with the accepted
      canonical contracts on every supported output.
- [ ] No website import or normalization-review UI, production write, R2
      action, or historical-version compilation is added.
- [ ] From the exact independently reviewed HEAD, the task provisions and
      opens the required page and supported artifacts with the canonical QA
      checklist, then pauses for owner verdict.
- [ ] Focused checks, ordinary Standards + Spec self-check, app/server checks,
      full verify, and `git diff --check` pass.

## Superseded-ticket mapping

Replaces old Ticket 18 with its semantic, atomicity, recovery, and backend
pilot goals intact and its generated-DOCX artifact expectations removed.

## Result

Commit:
Verify:
Notes:
