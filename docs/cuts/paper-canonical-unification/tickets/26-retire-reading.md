# 26 — Retire Reading consumer legacy interpretation

Status: ready
Blocked by: 25 — Retire Seven Choices consumer legacy interpretation
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/27-retire-application-writing.md`
Terminal: no

## What to build

Retire and remove consumer-side Reading legacy interpretation after
re-proving 33 papers / 126 Groups / 465 Questions and native rich content.

## Acceptance criteria

- [ ] Every Reading Group is canonical selected with zero queue, exact
      question-answer joins, closed heading/table/Figure evidence, and shared
      A–D placement.
- [ ] Screen/Print-PDF/DOCX consume only typed rich content and canonical
      Questions; flattened bridges, placeholder media, marker parsing,
      allowlists, and field fallback are removed.
- [ ] Actual table/Figure and prose proofs preserve order, anchors, native
      structure, media digest, placement, and Analysis independence.
- [ ] Missing/corrupt/stale canonical Reading is a hard failure with only
      accepted whole-release/prior-Publication rollback.
- [ ] Whole-corpus artifacts, recovery tests, full verify, and
      `git diff --check` pass with prior retirements intact.
- [ ] A fresh independent review lineage is green and provisioned Reading
      owner QA is accepted before the ticket is marked done.

## Out of scope

No Writing retirement, source splitter consolidation, production, or R2.

## Result

Commit:
Verify:
Notes:
