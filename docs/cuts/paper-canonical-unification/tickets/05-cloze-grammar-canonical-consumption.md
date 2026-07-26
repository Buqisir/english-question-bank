# 05 — Cloze and Grammar Fill canonical consumption

Status: ready
Blocked by: 03 — canonical publication; 04 — shared A–D rendered placement
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/06-seven-choices-canonical-publication.md`
Terminal: no

## What to build

Cut Cloze and Grammar Fill over to the whole-paper canonical loader and shared
projection on PaperSurface, Print/PDF, and DOCX while retaining their explicit
whole-family legacy capabilities for later migration and retirement.

## Acceptance criteria

- [ ] All three consumers load canonical reference fixtures through the public
      whole-paper seam and render the same semantic and placement signatures.
- [ ] Proof allowlists, on-the-fly compatibility normalization, field or Group
      fallback, and renderer-local canonical selection are no longer used.
- [ ] Missing, stale, corrupt, or partially selected canonical data hard-fails
      at the accepted boundary rather than mixing meanings.
- [ ] Student versions hide answers and explanations; teacher supplements do
      not alter canonical or placement identity.
- [ ] The known Cloze alignment failure is reproduced before the fix and
      closed in actual Screen, Print/PDF, and DOCX artifacts.
- [ ] From the exact reviewed HEAD, the implementation task provisions the
      required pages/artifacts and canonical QA checklist; QA opens them and
      pauses for owner verdict.
- [ ] Focused checks, ordinary Standards + Spec self-check, build/full verify
      required by risk, and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
