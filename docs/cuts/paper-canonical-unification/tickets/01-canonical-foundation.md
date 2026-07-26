# 01 — Canonical authority/evidence/publication foundation

Status: ready
Blocked by: None
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/02-reference-conformance-abcd-selector.md`
Terminal: no

## What to build

Implement Foundation A from the accepted spec: the executable authority
manifest and schemas; immutable evidence/lineage contracts; the pure
`compileCanonicalPaper(request)` whole-paper result; the three v1 Profiles,
complete-only Plan, shared Group/rich-content envelope; the shared
`projectCanonicalPaper(...)`; immutable Publication; shared
`loadPaperForConsumption(...)`; publisher validation/recovery; and the exact
Consumer Contract.

Use invented or redacted whole-paper fixtures. Do not change current consumer
selection or open new-import canonical admission.

## Acceptance criteria

- [ ] The human index points to exactly one digest-closed machine manifest,
      and schema plus semantic conformance fail closed on unknown, missing,
      duplicated-owner, or mismatched authority.
- [ ] `compileCanonicalPaper(request)` is pure and deterministic; only `ready`
      exposes a complete Plan/Groups/semantic digest, while all four blocked
      dispositions expose no partial package and write nothing.
- [ ] Source Capture, Source Span, direct source maps, ordered exact
      Transformation Records, review decisions, diagnostics, fingerprints,
      and semantic digests follow the linked Wayfinder contracts.
- [ ] The three Profile shapes, inactive slots, complete-only Plan, exclusive
      option ownership, paragraph/table/Figure nodes, and renderer-neutral
      shared projection pass public-seam fixtures.
- [ ] Publication seal/load, whole-family selection, stage/reopen/rename/
      journaled swap, pre/post-commit recovery, idempotent retry, conflict,
      stale/corrupt closure, and retired-legacy hard failure pass behavioral
      tests.
- [ ] Existing Screen/Print/PDF/DOCX and new-import selection remain unchanged.
- [ ] Focused checks, app build, `pnpm -C app run verify:all`, and
      `git diff --check` pass with literal PASS/SKIP/FAIL accounting.
- [ ] One fresh independent `$code-review` lineage has no Must Fix before the
      ticket is marked done.

## Out of scope

No real family consumer cutover, A–D selector, current-asset migration,
new-import latch, legacy deletion, UI, production, or R2 work.

## Result

Commit:
Verify:
Notes:
