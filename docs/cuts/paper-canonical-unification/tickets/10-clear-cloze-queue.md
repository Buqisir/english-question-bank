# 10 — Clear the full-corpus Cloze queue

Status: ready
Blocked by: 09 — Freeze the 33-paper corpus and complete M0–M2 dry run
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/11-clear-grammar-fill-queue.md`
Terminal: no

## What to build

Resolve the M3 Cloze family queue across the frozen corpus before touching the
next family. Restore source/official-answer evidence, make explicit review
decisions where permitted, and recompile from new immutable captures.

## Acceptance criteria

- [ ] The fixed denominator remains 33 Groups / 570 Questions; no failed paper
      or Question leaves the census.
- [ ] Every blank, Question, A–D set, and official answer has exact source
      identity and join lineage; current renderer column drift is not
      misclassified as source error.
- [ ] Marker, boundary, duplicate/missing blank, source, and answer diagnostics
      are cleared only by the accepted evidence actions and exact rules.
- [ ] Queue states follow the immutable attempt/decision/recompile lifecycle;
      no blocked compilation exposes a partial Plan/Group/package or writes
      the store.
- [ ] Cloze family accounting is zero unresolved and reproducible even when a
      paper remains whole-paper blocked by a later family.
- [ ] Focused compiler/ledger/answer tests, full dry-run recount,
      `pnpm -C app run verify:all`, and `git diff --check` pass.
- [ ] A fresh independent review lineage has no Must Fix before the ticket is
      marked done.

## Out of scope

No Grammar or later-family queue work, A–D renderer proof, Publication/switch,
legacy deletion, production, or R2.

## Result

Commit:
Verify:
Notes:
