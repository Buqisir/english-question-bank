# 17 — Delete DOCX output implementation while preserving DOCX input

Status: done
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

Commit: generated-DOCX deletion `b99336018a87669802a54dcb9ce6801e1f084355`; DOCX input preservation `c401bf9b48c6fe28c87d80e6929a9a119d1d12fa`; isolated input-side LibreOffice profile `f8357176b9f153cdafe235dea0656e3525087cd1`; failed-independent-review fixes `c3d26b17b9d991d752dec8ee356273a71f41e30a`; self-review shape-edge fixes `0d0ccb6122491d84ad4f57baccf0ee7c3c0d0b23`
Verify: `node scripts/verify-generated-docx-output-deleted.mjs` — PASS; `node scripts/verify-docx-source-media-input.mjs` — PASS; `node scripts/verify-c7-paper-import-contracts.mjs` — 43/43 PASS; `node scripts/verify-c7-paper-import-publish.mjs` — 36/36 PASS; `pnpm -C app run build` — PASS; `pnpm -C app run verify:all` — 110 PASS / 1 declared SKIP / 0 FAIL; `git diff --check` — PASS
Notes: Deleted generated-DOCX rendering, packaging, output conversion, contracts,
consumer authority, schemas, fixtures, and gates. Current canonical authority
is manifest v12 and exposes only Screen v12 and Print/PDF v13; retained
historical Publication support is parse-only and cannot compile or seal current
authority. The public DOCX input publisher preserves immutable source bytes,
extracts embedded bitmaps directly (including VML-wrapped images), enumerates
real shapes in `document.xml` and relevant non-document XML parts, converts
through input-side LibreOffice, crops same-size shapes by explicit page order,
and atomically publishes digest-bound figures plus manifest/body associations.
The real public-seam regression starts from FODT, generates DOCX with equal-size
body and header shapes, then exercises Screen and Print/PDF consumers.
