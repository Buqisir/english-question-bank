# 24 — Cloze correction batch CLZ-04

Status: ready
Blocked by: 23 — Cloze correction batch CLZ-03
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/25-cloze-correction-batch-05.md`
Terminal: no

## What to build

Resolve stable Cloze queue entries CLZ-022–027 through source-backed
correction and zero-write recompile.

## Acceptance criteria

- [ ] All six entries close exact identities and answer lineage.
- [ ] No source fabrication, regex cleanup of ambiguity, majority-vote answer,
      or mutable evidence update occurs.
- [ ] Earlier batch closure and denominator accounting remain reproducible.
- [ ] Focused queue/compiler checks, ordinary self-check, recount, and
      `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
