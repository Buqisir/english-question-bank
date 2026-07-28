# 18 — Atomic canonical import admission

Status: done
Blocked by: Ticket 17 independent review PASS
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/19-import-recovery-retry-rollback.md`
Terminal: no

## What to build

Open the canonical-required new-import latch at the public publisher: validate
one complete ready whole paper before the first write, while every blocked
result preserves all store state.

## Acceptance criteria

- [x] Admission requires every Profile-required family available, inactive
      closures implemented, one complete ready package, and valid
      Publication/Consumer Contract closure.
- [x] Ready flow is compile, in-memory seal/load, stage, staged reopen,
      journaled commit, and exact committed reload.
- [x] All four blocked dispositions, unavailable family, stale/corrupt
      Publication, and authority/Profile mismatch return structured failure.
- [x] Blocked cases preserve database rows, refs, asset/latest/version trees,
      reports, and journals byte-for-byte.
- [x] No runtime canonical flag, allowlist, partial publication, operator
      bypass, generated-DOCX output, or website import UI is introduced.
- [x] Focused public-seam checks, ordinary Standards + Spec self-check,
      app/server checks, full verify, and `git diff --check` pass.

## Superseded-ticket mapping

Replaces old Ticket 16 without carrying forward any generated-DOCX output
assumption.

## Result

Commit: `20cd54c7`; `fb97a110`; `040f40c3`; `93cd1272`
Verify: atomic canonical admission PASS; C7 publish 36/36; normalization import
gate PASS; real DOCX source-media input PASS; I5 writing import 61 checks;
app build PASS; `verify:all` 111 PASS / 1 declared SKIP / 0 FAIL;
`git diff --check` PASS.
Notes: The public import seam now compiles and validates one ready whole-paper
canonical package before mutation, proves in-memory and staged canonical-only
Screen/Print consumers, commits legacy rows plus the canonical current ref in
one journaled transaction, and exact-reloads the committed Publication.
Structured blocked outcomes preserve the asset tree and database exactly.
Package binding covers imported identities, ordered content, answers, source
media, and exact writing semantics. Initial Standards + Spec review Must Fixes
and both focused re-review rounds are closed; final Standards and Spec results
are PASS.
