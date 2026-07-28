# 16 — Atomic canonical import admission

Status: ready
Blocked by: Ticket 15 independent review PASS
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/17-import-recovery-retry-rollback.md`
Terminal: no

## What to build

Open the canonical-required new-import latch at the public publisher: a ready
whole paper is validated before the first write, while every blocked result
preserves all store state.

## Acceptance criteria

- [ ] Admission requires every Profile-required family available, inactive
      closures implemented, one complete ready package, and valid
      Publication/Consumer Contract closure.
- [ ] Ready flow is compile, in-memory seal/load, stage, staged reopen,
      journaled commit, and exact committed reload.
- [ ] All four blocked dispositions, unavailable family, stale/corrupt
      Publication, and authority/Profile mismatch return structured failure.
- [ ] Blocked cases preserve database rows, refs, asset/latest/version trees,
      reports, and journals byte-for-byte.
- [ ] No runtime canonical flag, allowlist, partial publication, operator
      bypass, or website import UI is introduced.
- [ ] Focused public-seam checks, ordinary Standards + Spec self-check,
      app/server checks, full verify, and `git diff --check` pass.

## Result

Commit:
Verify:
Notes:
