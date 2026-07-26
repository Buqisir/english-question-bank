# 04 — Shared A–D rendered placement

Status: ready
Blocked by: 03 — Cloze and Grammar Fill canonical publication
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/05-cloze-grammar-canonical-consumption.md`
Terminal: no

## What to build

Implement one renderer-derived `layoutAbcdOptionSet(...)` plan and translate
that same whole-set plan across PaperSurface, Print/PDF, and DOCX for the
accepted gold and boundary fixtures.

## Acceptance criteria

- [ ] The planner uses pinned shaping and integer physical units with
      four-column, two-by-two, then one-column whole-set fallback.
- [ ] Explicit hard breaks are preserved and unbreakable one-column overflow
      returns the accepted fail-closed disposition.
- [ ] Gold q21/q22/q23 select 4/1/2 columns and the 15-row Cloze proof keeps
      one four-column mode for every row.
- [ ] PaperSurface, Print/PDF, and DOCX translate identical mode, row, column,
      order, and physical placement signatures.
- [ ] Dense modes do not wrap; placement stays within 1pt and Cloze
      same-column spread within 0.5pt, with no hybrid rows, clipping, or
      shrink-to-fit.
- [ ] Layout stays outside canonical semantics and semantic digests.
- [ ] Focused actual-artifact checks, ordinary Standards + Spec self-check,
      build/full verify required by risk, and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
