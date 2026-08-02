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

Commit:
Verify:
Notes:
