# 65 — Retire Cloze legacy consumption

Status: ready
Blocked by: Ticket 64 independent review PASS and owner QA acceptance
Next on PASS: independent review
Independent review PASS: owner QA
Owner QA PASS: `docs/cuts/paper-canonical-unification/tickets/66-retire-grammar-legacy-consumption.md`
Terminal: no

## What to build

Retire the whole-family Cloze legacy capability and remove Cloze legacy
interpretation across PaperSurface, Print/PDF, and DOCX at one exact HEAD.

## Acceptance criteria

- [ ] Consumer Contract marks Cloze legacy `retired`; all 33 Groups / 570
      Questions remain canonical-selected with zero queue.
- [ ] Marker parsing, compatibility normalization, allowlists, field/Group
      fallback, and renderer-local interpretation are removed.
- [ ] Missing, stale, or corrupt canonical Cloze hard-fails; rollback uses one
      prior complete contract/code or compatible Publication.
- [ ] A–D placement and 15-row actual artifacts pass without semantic-digest
      drift.
- [ ] From the exact reviewed HEAD, the task provisions and opens Cloze
      artifacts with the canonical QA checklist; QA pauses for owner verdict.
- [ ] Focused retirement/recovery checks, ordinary self-check, full verify,
      and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
