# 34 — Retire legacy canonical fallbacks

Status: ready
Blocked by: Ticket 33 PASS
Next on PASS: independent review
Terminal: no
Model: gpt-5.6-terra
Effort: max
Independent review model: gpt-5.6-sol
Independent review effort: high
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

Commit:
Verify:
Notes:
