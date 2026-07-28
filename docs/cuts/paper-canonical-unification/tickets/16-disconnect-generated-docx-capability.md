# 16 — Disconnect generated-DOCX capability and prove direct Chromium PDF

Status: ready
Blocked by: Tickets 01–15 completed accepted baseline
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/17-delete-docx-output-implementation.md`
Terminal: no

## What to build

Remove every live generated-DOCX capability from the teacher-facing product
while preserving direct Chromium/Playwright PDF as the sole fixed-layout
download.

## Acceptance criteria

- [ ] No generated-DOCX control, client call, state path, draft/general export
      entry point, or live HTTP route remains reachable or discoverable.
- [ ] Every legitimate surviving PDF caller uses the supported Print/PDF seam;
      obsolete DOCX-to-LibreOffice-to-PDF behavior has no public caller.
- [ ] Draft-paper `/print-pdf` returns direct Chromium/Playwright PDF bytes
      without invoking DOCX generation or LibreOffice.
- [ ] Screen and Student/Teacher Print HTML/PDF behavior remain available with
      the accepted semantic, anchor, answer-visibility, and layout identity.
- [ ] Public route and UI behavior are the primary proof; source inventories
      are supporting evidence only and find no hidden flag, placeholder, empty
      adapter, or best-effort DOCX path.
- [ ] From the exact independently reviewed HEAD, the task provisions and
      opens the affected controls and direct-PDF artifacts with the canonical
      QA checklist, then pauses for owner verdict.
- [ ] Focused public-seam checks, ordinary Standards + Spec self-check,
      relevant app/server checks, full verify, and `git diff --check` pass.

## Superseded-ticket mapping

This owner-amended slice has no one-to-one predecessor. It absorbs the public
generated-DOCX capability and output-matrix portions formerly embedded in old
Tickets 18 and 64–71.

## Result

Commit:
Verify:
Notes:
