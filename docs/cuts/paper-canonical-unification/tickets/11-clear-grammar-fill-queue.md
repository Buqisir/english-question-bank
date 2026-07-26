# 11 — Clear the full-corpus Grammar Fill queue

Status: ready
Blocked by: 10 — Clear the full-corpus Cloze queue
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/12-prove-full-corpus-abcd.md`
Terminal: no

## What to build

Resolve the M3 Grammar Fill queue across all 33 papers using immutable source
and official-answer evidence, exact blank/answer joins, and explicit review
decisions.

## Acceptance criteria

- [ ] The fixed denominator remains 33 Groups / 330 Questions with exact
      source/answer/blank identity closure.
- [ ] `paper-960d0f8d`'s label-marker Grammar Fill and the two isolated-number
      cases are source-reviewed rather than regex-cleaned or inferred.
- [ ] Missing/ambiguous markers, protected prose numbers, stale capture, and
      answer conflicts reach and recover through their exact dispositions.
- [ ] Immutable queue history and zero-write whole-paper recompile behavior
      remain intact; Cloze queue closure does not regress.
- [ ] Grammar Fill accounting is zero unresolved even when later-family
      diagnostics keep a whole paper blocked.
- [ ] Focused compiler/ledger/answer tests, full dry-run recount, full verify,
      and `git diff --check` pass.
- [ ] A fresh independent review lineage has no Must Fix before the ticket is
      marked done.

## Out of scope

No A–D full-corpus renderer conformance, later-family queue work, Publication,
legacy deletion, production, or R2.

## Result

Commit:
Verify:
Notes:
