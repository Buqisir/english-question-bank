# 22 — Cloze correction batch CLZ-02

Status: ready
Blocked by: 21 — Cloze correction batch CLZ-01
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/23-cloze-correction-batch-03.md`
Terminal: no

## What to build

Resolve stable Cloze queue entries CLZ-008–014 through the same immutable
evidence and zero-write recompile lifecycle.

## Acceptance criteria

- [ ] All seven entries close exact blank, Question, A–D, answer, and source
      lineage without changing the denominator.
- [ ] Renderer column drift is not misclassified as source error.
- [ ] Blocked output remains complete-or-absent and store state is unchanged.
- [ ] Focused queue/compiler checks, ordinary self-check, recount, and
      `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
