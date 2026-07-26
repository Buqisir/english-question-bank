# 17 — Clear Listening inactive queue

Status: ready
Blocked by: 16 — Clear the full-corpus Continuation Writing queue
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/18-canary-migration.md`
Terminal: no

## What to build

Close the final M3 family queue: the two required `paper-2026-i` listening
inactive source slots and every Profile-declared inactive/N/A closure needed
for all 33 whole-paper Plans.

## Acceptance criteria

- [ ] `paper-2026-i` closes two slots, 20 Questions/answers, ten transcript
      segments, supplied timing, and the no-audio inventory with source
      lineage.
- [ ] Missing/referenced audio, missing timing/source/answers, overlapping
      joins, and unsupported shapes recover only through accepted
      dispositions.
- [ ] All Profile-required inactive slots across the corpus have exact source
      closure or exact Profile-backed N/A; no hidden Group is fabricated.
- [ ] Recompiling the frozen corpus leaves every M3 family queue zero; each
      paper is either whole-paper ready for M4 or explicitly blocked by a
      non-family integrity issue that must stop canary work.
- [ ] Actual dry-run whole-paper Screen/Print-PDF/DOCX artifacts have zero
      listening occurrence and complete Plans.
- [ ] Immutable queue/accounting history, focused closure tests, full verify,
      and `git diff --check` pass.
- [ ] A fresh independent review lineage has no Must Fix. No invented visible
      listening owner QA is required.

## Out of scope

No active listening, Publication switch, canary execution, legacy deletion,
production, or R2.

## Result

Commit:
Verify:
Notes:
