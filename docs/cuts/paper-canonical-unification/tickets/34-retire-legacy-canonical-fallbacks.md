# 34 — Retire legacy canonical fallbacks

Status: implementation candidate (independent review pending)
Blocked by: Ticket 33 PASS
Next: same-lineage independent review re-confirmation
Terminal: no
Model: gpt-5.6-terra
Effort: xhigh
Independent review model: gpt-5.6-sol
Independent review effort: medium
Parallel lane: serial shared consumer change

## What to build

After the full corpus and supported surfaces are proven, delete legacy
selection, interpretation, and fallback behavior for Cloze, Grammar Fill,
Seven Choices, Reading, Application Writing, and Continuation Writing in one
shared consumer change while preserving validated rollback to prior immutable
Publications rather than resurrecting legacy semantics.

## Write surfaces

- Exclusive: shared consumer/loader selection behavior, affected authority
  versions and adversarial regression, legacy fixtures and dead code.
- Forbidden: Source Capture and historical Publication bytes, production/R2,
  route receipts.

## Proportionate verification

This ticket changes shared consumer/renderer behavior and is irreversible
without Git rollback. It owns one authority version change, adversarial public-
seam regressions, affected narrow checks, one final full suite, and one high-
risk independent Standards/Spec review lineage for the aggregate deletion.

## Acceptance criteria

- [ ] All six active families load only confirmed Canonical Paper semantics; field/group/family legacy fallback cannot reactivate.
- [ ] Missing or corrupt canonical data fails hard instead of consulting raw or legacy structures.
- [ ] Rollback selects one validated prior immutable Publication/Consumer Contract and does not edit sidecars in place.
- [ ] Shared Screen/Print/PDF behavior and answer visibility remain correct on the exact final candidate.
- [ ] Authority versioning, adversarial regression, affected checks, one final full suite, independent review, and `git diff --check` pass.

## Superseded-ticket mapping

Collapses old Tickets 72–77 into one shared-behavior retirement gate.

## Result

Commit: exact code candidate `c2770d5c075f640eb07232100e5868a6a1d87c58` on `codex/ticket-34-retire-legacy-canonical-fallbacks-20260802`.
Verify: `pnpm --dir app run build` PASS; detail Screen Playwright adversary PASS for Reading, Seven Choices, Application Writing, and Continuation Writing (conflicting raw caller mirrors cannot enter the paper; missing/corrupt Consumption renders zero paper/questions); `verify-user-scope.mjs` PASS (94, including valid/rejected add/update/item-patch/item-delete and exact no-mutation checks); `verify-generated-docx-disconnected.mjs` PASS (28, including direct confirmed-Canonical Print HTML/PDF with no artifact write); all six family rendered-behavior verifiers PASS; Ticket 32 `--check --exact-reload` PASS; Ticket 33 `--check` PASS; `git diff --check` PASS. The literal full suite on `c2770d5c075f640eb07232100e5868a6a1d87c58` is PASS 120 / SKIP 1 / FAIL 0 with child exit 0. The sole SKIP is the existing off-repo fixture absence in `scripts/verify-i16a-teaching-dimension-search.mjs`; it was not treated as PASS.
Notes: Retired the runtime raw/DB-only selection, Publication legacy projection, Consumer Contract legacy capability, caller-supplied legacy family acceptance, and Print compatibility adapter. The detail Screen now selects the confirmed Canonical family/group and projects its preview exclusively through the existing canonical surface adapters; it does not fetch paper assets or analyses, and its targeted families fail closed on unavailable, corrupt, wrong-family, or incomplete Consumption. Draft add/update/item-patch/item-delete resolve the full prospective draft before their first persistent write. Existing journaled immutable Publication version selection remains the only rollback path; no Source Capture, Canonical Paper, Publication, or Ticket 33 evidence bytes were restamped. Next: one same-lineage Sol Medium Standards/Spec review since `23845457a7d7d655d7f9feac84c115af51ae9882`; review only this Ticket 34 lineage and do not start Ticket 35, Owner QA, or release work.
