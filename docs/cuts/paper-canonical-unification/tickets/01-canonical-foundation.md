# 01 — Canonical authority/evidence/publication foundation

Status: done
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

- [x] The human index points to exactly one digest-closed machine manifest,
      and schema plus semantic conformance fail closed on unknown, missing,
      duplicated-owner, or mismatched authority.
- [x] `compileCanonicalPaper(request)` is pure and deterministic; only `ready`
      exposes a complete Plan/Groups/semantic digest, while all four blocked
      dispositions expose no partial package and write nothing.
- [x] Source Capture, Source Span, direct source maps, ordered exact
      Transformation Records, review decisions, diagnostics, fingerprints,
      and semantic digests follow the linked Wayfinder contracts.
- [x] The three Profile shapes, inactive slots, complete-only Plan, exclusive
      option ownership, paragraph/table/Figure nodes, and renderer-neutral
      shared projection pass public-seam fixtures.
- [x] Publication seal/load, whole-family selection, stage/reopen/rename/
      journaled swap, pre/post-commit recovery, idempotent retry, conflict,
      stale/corrupt closure, and retired-legacy hard failure pass behavioral
      tests.
- [x] Existing Screen/Print/PDF/DOCX and new-import selection remain unchanged.
- [x] Focused checks, app build, `pnpm -C app run verify:all`, and
      `git diff --check` pass with literal PASS/SKIP/FAIL accounting.
- [x] One fresh independent `$code-review` lineage has no Must Fix before the
      ticket is marked done.

## Out of scope

No real family consumer cutover, A–D selector, current-asset migration,
new-import latch, legacy deletion, UI, production, or R2 work.

## Result

Commit: `a5f8930`, `ebc27aa`, `96289b0`, `217c217`, `e88f189`, `bf23588`, `d03d2fc`, `cf3b9b7`, `cac15ba`, `ec7cf69`, `ccce39d`
Verify: `node scripts/verify-paper-canonical-foundation.mjs`; `node scripts/verify-paper-canonical-publication.mjs`; `npm run build --prefix app`; `pnpm -C app run verify:all` = `PASS 94 / SKIP 1 / FAIL 0` (the declared skip is the off-repo `verify-i16a-teaching-dimension-search` fixture); `git diff --check`.
Notes: One independent `$code-review` Standards + Spec lineage, followed by focused re-reviews after every Must Fix, finished clean. The V1 compatibility boundary is parse-only for frozen Publications; new compile/seal/publish remains V2-only.
