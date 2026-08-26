# 02B — Stable visual identities and exact prior-confirmation rebind

Status: ready-for-agent
Blocked by: 02A — Generic source-measured Figure Option layout seam

## What to build

Let validated Format 2 visual data retain an already accepted Canonical media
identity and Source Capture source-span identity without deriving both from the
new transcription observation id. Add one migration-only seam that rebinds an
exact prior Teacher Confirmation to a successor Candidate package only after
the existing validator proves the prior confirmation and the complete reviewed
visual surface is unchanged.

## Allowed and forbidden scope

- Allowed: optional stable visual identities, their generic Candidate/layout/
  Canonical projection, and a pure exact-confirmation rebind over the existing
  Candidate and Teacher Confirmation schemas.
- The reviewed equivalence surface is every Candidate observation's immutable
  source-document digest, source span and coordinate, semantic owner, exact
  source crop, plus every complete candidate alternative and digest. Adapter-
  local document handles and Job-only nonvisual documents/layout observations
  do not change that reviewed surface.
- Forbidden: Q33 per-paper data, automatic selection for new papers, partial
  equivalence, new confirmation schemas, renderer/CSS/authority changes,
  paperId branches, production mutation, or hostile-filesystem hardening.

## Acceptance criteria

- [ ] Each Format 2 visual may carry one validated stable Canonical media id and one independently valued stable Source Capture span id; omission preserves the current derivation exactly.
- [ ] Candidate capture, source-layout validation, Canonical source evidence, media projection, Screen, and Print/PDF use the same effective identities without paper-specific routing.
- [ ] Rebind first validates the complete predecessor confirmation, then succeeds only for exact reviewed-observation, source-lineage, owner, crop, candidate, alternative, digest, and decision coverage parity.
- [ ] Successor-only nonvisual Job documents and source-layout observations are admitted without weakening the reviewed visual comparison.
- [ ] Owner, source lineage, source crop, candidate, alternative, or decision-coverage drift fails closed; the rebound confirmation is validated again through the existing confirmation seam.
- [ ] Compact visual Candidate, public Format 2 Job, existing layout, and `git diff --check` regressions pass without a full suite or authority bump.

## Result

Commit:
Verify:
Notes:
