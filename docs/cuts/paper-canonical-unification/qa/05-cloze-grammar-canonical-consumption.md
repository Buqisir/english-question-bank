# Ticket 05 canonical QA checklist

This checklist is for the exact implementation HEAD after its independent
review passes. Do not reuse artifacts from another commit.

## Provision

Run the tracked public-seam and actual-artifact gates from the saved worktree:

```sh
node scripts/verify-paper-canonical-cloze-grammar-consumption.mjs --actual-artifacts
```

The command drives the hash-bound `paper-2026-i` reference through
`loadPaperForConsumption(...)`, then the actual PaperSurface payload adapter,
Print HTML renderer, and DOCX renderer. It writes a HEAD-bound Screen HTML,
Screen PNG/PDF, Student/Teacher Print HTML, Student Print PNG/PDF, Student
DOCX, inspected Student/Teacher OOXML, and converted DOCX PDF under
`.scratch/paper-canonical-ticket-05-qa/<HEAD>/`. It also renders the pinned
A-D plan through Chromium, a real PDF, DOCX, and DOCX-to-PDF and enforces the
accepted 1pt / 0.5pt geometry gates.

## Owner checks

- Screen, Print/PDF, and DOCX show all 15 Cloze Blanks and all 10 Grammar Fill
  Blanks once, in source order, with the same visible numbering.
- Every Cloze A-D row uses the shared four-column placement; no row becomes a
  hybrid layout, wraps, clips, or shrinks.
- The reproduced legacy failure (one missing Cloze marker misaligns passage
  Blanks and Questions) is rejected, while the canonical artifacts remain
  aligned because they do not parse the damaged legacy field.
- Student artifacts contain no answer or explanation supplement.
- Teacher supplements add answers/explanations without changing the canonical
  semantic signature or any A-D placement signature.
- Missing, stale, corrupt, or partial canonical selection stops the occurrence;
  no renderer-local or per-Group fallback appears after selection.

Record the reviewed HEAD and explicit owner verdict in the owner-QA task. Do
not advance to Ticket 06 without owner acceptance.
