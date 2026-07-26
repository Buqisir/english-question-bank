# 09 — Reading rendered behavior

Status: ready
Blocked by: 08 — Reading canonical publication
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/10-application-writing-canonical-publication.md`
Terminal: no

## What to build

Render the same canonical Reading semantics on PaperSurface, Print/PDF, and
DOCX with native prose, heading, table, Figure, Question, and A–D placement
behavior.

## Acceptance criteria

- [ ] All surfaces preserve ordered rich content, identities, anchors,
      answers, and shared A–D placement signatures.
- [ ] Tables remain native rectangular grids and Figures retain immutable
      media closure and source-backed placement.
- [ ] Student/teacher and Analysis modes do not change canonical structure or
      renderer-independent identity.
- [ ] No surface parses headings/markers, flattens tables, substitutes
      placeholder media, or remeasures A–D semantics.
- [ ] From the exact reviewed HEAD, the implementation task provisions and
      opens prose and table/Figure artifacts with the canonical QA checklist;
      QA pauses for owner verdict.
- [ ] Focused actual-artifact checks, ordinary Standards + Spec self-check,
      build/full verify required by risk, and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
