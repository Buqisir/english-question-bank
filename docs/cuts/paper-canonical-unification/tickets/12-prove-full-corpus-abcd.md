# 12 — Prove full-corpus A–D conformance

Status: ready
Blocked by: 11 — Clear the full-corpus Grammar Fill queue
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/13-clear-seven-choices-queue.md`
Terminal: no

## What to build

Run the accepted selector and actual renderer translations over the frozen
1035 question-owned A–D sets before advancing to the next family queue.

## Acceptance criteria

- [ ] The denominator is exactly 1035 sets and every set has one pinned-font,
      fixed-twip logical mode/row/column/order plan.
- [ ] Gold q21/q22/q23, the 15-row Cloze, every corpus boundary case, and the
      synthetic unbreakable/hard-break/font/node negatives retain their
      accepted outcomes.
- [ ] Screen/Print HTML, actual PDF, DOCX OOXML, and converted PDF translate
      the same plan; dense modes do not wrap, placement is within 1pt, Cloze
      same-column spread is within 0.5pt, and no hybrid/clipping/shrink occurs.
- [ ] Layout remains excluded from canonical semantic digests; Question,
      Option, answer, source map, and semantic order remain unchanged.
- [ ] Any incomplete family evidence remains explicitly blocked without
      dropping its A–D set from accounting or publishing a partial paper.
- [ ] Focused selector/artifact/signature checks, full verify, and
      `git diff --check` pass.
- [ ] A fresh independent review lineage is green and the provisioned
      full-corpus boundary owner QA proof is accepted.

## Out of scope

No Seven Choices A–G/listening A–C layout, later family queue, paper switch,
legacy retirement, production, or R2.

## Result

Commit:
Verify:
Notes:
