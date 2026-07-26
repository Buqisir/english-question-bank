# 24 — Retire Grammar Fill consumer legacy interpretation

Status: ready
Blocked by: 23 — Retire Cloze consumer legacy interpretation
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/25-retire-seven-choices.md`
Terminal: no

## What to build

Retire and remove consumer-side Grammar Fill legacy interpretation after
re-proving the fixed 33-Group / 330-Question denominator at this exact HEAD.

## Acceptance criteria

- [ ] All Grammar Fill Groups are canonical selected with closed answer/blank
      joins, source-backed marker decisions, and zero queue.
- [ ] Screen/Print-PDF/DOCX consume canonical Grammar Fill only; no raw marker
      parser, compatibility normalization, allowlist, or field fallback
      remains.
- [ ] Known label-marker and isolated-number cases remain source-correct and
      actual surfaces preserve semantic anchors, hints, and answer visibility.
- [ ] Missing/corrupt/stale canonical Grammar Fill is a hard failure with only
      the accepted whole-release/prior-Publication rollback path.
- [ ] Whole-corpus artifacts, recovery tests, full verify, and
      `git diff --check` pass with prior Cloze retirement intact.
- [ ] A fresh independent review lineage is green and provisioned Grammar Fill
      owner QA is accepted before the ticket is marked done.

## Out of scope

No later family retirement, source-adapter consolidation, production, or R2.

## Result

Commit:
Verify:
Notes:
