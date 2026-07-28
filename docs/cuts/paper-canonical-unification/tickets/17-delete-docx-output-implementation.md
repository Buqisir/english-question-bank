# 17 — Delete DOCX output implementation while preserving DOCX input

Status: ready
Blocked by: Ticket 16 independent review PASS and owner QA acceptance
Next on PASS: independent review
Independent review PASS: `docs/cuts/paper-canonical-unification/tickets/18-atomic-canonical-import-admission.md`
Terminal: no

## What to build

Delete the now-unreachable generated-DOCX implementation and authority surface
without weakening DOCX as an immutable source-input format.

## Acceptance criteria

- [ ] Generated-DOCX renderers, OOXML packaging, output-side LibreOffice
      conversion, output contracts, consumer identities, authority refs,
      DOCX-only schemas or enums, fixtures, OOXML gates, and
      DOCX-converted-PDF gates are removed.
- [ ] No dormant feature flag, hidden output route, empty adapter,
      placeholder, compatibility export, or reserved DOCX-specific projection
      interface remains.
- [ ] Canonical projection and supported consumer authority remain
      renderer-neutral and express only Screen and Print/PDF.
- [ ] DOCX source admission, file and magic-byte validation, splitting,
      immutable Source Capture, embedded image/shape extraction, and required
      input-side LibreOffice behavior pass through public input seams without
      importing deleted output code.
- [ ] Any compatibility retained for an existing immutable Publication is the
      smallest proved parse-only read path and cannot seal authority, generate
      OOXML, or expose output.
- [ ] Focused deletion/input-regression checks, ordinary Standards + Spec
      self-check, relevant app/server checks, full verify, and
      `git diff --check` pass.

## Superseded-ticket mapping

This owner-amended slice has no one-to-one predecessor. It absorbs the output
implementation, OOXML, output-side LibreOffice, DOCX-only fixture, and
converted-PDF portions formerly embedded in old Tickets 18 and 64–71 while
preserving their still-required Screen/Print/PDF and migration obligations.

## Result

Commit:
Verify:
Notes:
