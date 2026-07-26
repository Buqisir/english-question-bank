# 25 — Retire Seven Choices consumer legacy interpretation

Status: ready
Blocked by: 24 — Retire Grammar Fill consumer legacy interpretation
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/26-retire-reading.md`
Terminal: no

## What to build

Retire and remove consumer-side Seven Choices legacy interpretation after
re-proving all 33 Groups, 165 Blanks, and 33 shared A–G banks.

## Acceptance criteria

- [ ] All fixed-denominator Seven Choices Publications are canonical selected
      with zero queue and source-backed ordinal/marker/answer decisions.
- [ ] Every current surface contains five Question/Blank anchors, exactly one
      A–G bank, seven Option anchors, and zero per-question option sets.
- [ ] Repeated/nested bank projection, raw-marker reconstruction, allowlists,
      partial fallback, and retired compatibility code are removed.
- [ ] Missing/corrupt/stale canonical Seven Choices is a hard failure with only
      accepted whole-release/prior-Publication rollback.
- [ ] Whole-corpus artifacts, recovery tests, full verify, and
      `git diff --check` pass with prior retirements intact.
- [ ] A fresh independent review lineage is green and provisioned Seven
      Choices owner QA is accepted before the ticket is marked done.

## Out of scope

No Reading/Writing retirement, source-adapter consolidation, production, or
R2.

## Result

Commit:
Verify:
Notes:
