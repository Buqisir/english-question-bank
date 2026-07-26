# 23 — Retire Cloze consumer legacy interpretation

Status: ready
Blocked by: 22 — Prove M7 full-corpus canonical closure
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/24-retire-grammar-fill.md`
Terminal: no

## What to build

Change the exact Consumer Contract's Cloze legacy capability from `available`
to `retired`, remove consumer-side Cloze legacy interpretation, and prove all
33 Cloze Groups at the retirement HEAD.

## Acceptance criteria

- [ ] The fixed Cloze denominator is 33 Groups / 570 Questions, all canonical
      selected with source/answer lineage and zero queue.
- [ ] Screen/Print-PDF/DOCX consume canonical Cloze only; no marker parsing,
      compatibility normalization, allowlist, field fallback, or retired-code
      resurrection remains.
- [ ] All A–D placement and 15-row alignment proofs pass at the exact
      retirement HEAD without semantic digest change.
- [ ] Missing/corrupt/stale canonical Cloze is a hard failure, not a legacy
      fallback; rollback deploys the prior complete contract/code or prior
      compatible Publication.
- [ ] Whole-corpus actual artifacts, focused migration/recovery tests, full
      verify, and `git diff --check` pass.
- [ ] A fresh independent review lineage is green and provisioned Cloze owner
      QA is accepted before the ticket is marked done.

## Out of scope

No other family retirement, source-adapter deletion, production, or R2 work.

## Result

Commit:
Verify:
Notes:
