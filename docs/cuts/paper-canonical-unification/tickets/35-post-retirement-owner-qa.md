# 35 — Post-retirement Owner QA

Status: ready
Blocked by: Ticket 34 independent review PASS
Next on PASS: owner QA
Terminal: no
Model: gpt-5.6-terra
Effort: max
Parallel lane: serial Owner QA provisioning

## What to build

From the exact independently reviewed HEAD, provision and open the complete
checkable state for real-click Owner QA of Screen, Student/Teacher Print/PDF,
family transitions, inactive-slot absence, and legacy-fallback absence, then
pause for the owner verdict.

## Write surfaces

- Exclusive: gitignored local QA state and exact-candidate QA evidence allowed
  by the owner-QA runbook.
- Forbidden: product behavior, canonical data, authority versions, production,
  R2, or successor implementation.

## Acceptance criteria

- [ ] Every required URL and Student/Teacher Print/PDF artifact is provisioned from the exact reviewed HEAD and opened successfully.
- [ ] The canonical Owner QA checklist names representative families, answer visibility, inactive Listening absence, rollback identity, and legacy absence.
- [ ] The task stops at `QA Ready: yes` for the owner verdict and follows the canonical owner-QA handoff.

## Superseded-ticket mapping

Replaces old Ticket 78.

## Result

Commit: candidate branch `codex/ticket-35-owner-qa-fixes-20260803`; this bounded fix round follows focused review of `84270979707d92dff106bc7076655f50f07b54a6` (exact new tip is recorded in the implementation handoff).
Verify: affected public Screen now consumes the exact v44/v7 Grammar Fill ruling; complete immutable Publication v3 Student/Teacher Print HTML/PDF, batch paper-identity fail-closed, writing, grammar geometry, canonical consumption, import-pilot, and frontend build checks pass.
Notes: Fix candidate; focused re-review pending in the existing review lineage. Owner QA remains FAIL pending focused re-review and owner re-QA of this candidate.
