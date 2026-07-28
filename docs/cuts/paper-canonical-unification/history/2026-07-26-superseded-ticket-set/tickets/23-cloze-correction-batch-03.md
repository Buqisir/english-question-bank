# 23 — Cloze correction batch CLZ-03

Status: ready
Blocked by: 22 — Cloze correction batch CLZ-02
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/24-cloze-correction-batch-04.md`
Terminal: no

## What to build

Resolve stable Cloze queue entries CLZ-015–021 without mutating prior evidence
or publishing a partial paper.

## Acceptance criteria

- [ ] All seven entries close source, blank, A–D, and official-answer joins.
- [ ] Ambiguous boundaries or answers retain their exact fail-closed
      disposition until accepted evidence exists.
- [ ] Prior batch closure and the frozen denominator do not regress.
- [ ] Focused queue/compiler checks, ordinary self-check, recount, and
      `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
