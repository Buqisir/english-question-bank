# 30 — Grammar Fill correction batch GRM-05

Status: ready
Blocked by: 29 — Grammar Fill correction batch GRM-04
Next on PASS: independent review
Independent review PASS: `docs/cuts/paper-canonical-unification/tickets/31-deterministic-abcd-conformance-sweep.md`
Terminal: no

## What to build

Resolve the final six Grammar Fill queue entries, including the accepted mixed
marker and isolated-number proof cases, and close the full family denominator.

## Acceptance criteria

- [ ] Entries GRM-028–033 close exact source, marker, blank, and answer
      lineage.
- [ ] The known label-marker case and two isolated-number cases are resolved
      only through source-backed decisions.
- [ ] Grammar Fill accounting is exactly 33 Groups / 330 Questions with zero
      unresolved queue entries.
- [ ] Cloze closure, whole-paper denominator, and zero-write behavior do not
      regress.
- [ ] Focused queue/compiler checks, ordinary self-check, full recount, full
      verify required by risk, and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
