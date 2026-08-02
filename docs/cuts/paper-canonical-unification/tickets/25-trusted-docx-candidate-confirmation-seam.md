# 25 — Trusted DOCX candidate and Teacher Confirmation seam

Status: ready
Blocked by: Ticket 24 completed fail-closed predecessor; replacement authority committed; external project-wide proportionate-engineering Wayfinder closed
Next on PASS: independent review
Terminal: no
Model: gpt-5.6-terra
Effort: max
Independent review model: gpt-5.6-sol
Independent review effort: medium
Parallel lane: serial shared seam; Ticket 26 and every lane remain forbidden until review PASS

## What to build

Deliver one deep DOCX canonical-import module whose trusted adapter derives an
Import Candidate and deterministic issues from immutable source bytes, then
requires candidate-bound Teacher Confirmation before returning one complete
Canonical Paper or unresolved issues. Prove the seam on `paper-2025-i` and
`paper-2026-i` without publishing either paper.

## Write surfaces

- Exclusive: shared DOCX adapter/compiler interface and implementation,
  canonical schemas and authority versions, shared adversarial verifier.
- Forbidden: corpus publication/current refs, migration ledger/manifest,
  paper-specific lane evidence outside the two seam fixtures, route authority.

## Proportionate verification

This ticket changes shared adapter/schema behavior. It therefore owns the
authority version change, adversarial public-seam regression, affected narrow
checks, one final full suite, and one independent Standards/Spec review. Later
papers through the unchanged accepted seam do not repeat those code-level
gates.

## Partial evidence boundary

Commits `0b5c7b56`, `6250388c`, `9eb53a2f`, and `76e06846` are partial
implementation evidence from the superseded route. Audit and reuse only what
matches this ticket; they are not a ready result and authorize no successor.

## Acceptance criteria

- [ ] The external interface is equivalent to `importCanonicalCandidate(sourceBytes, operatorChoices) -> candidate + issues` and `confirmCanonicalCandidate(candidate, teacherDecisions) -> Canonical Paper | unresolved issues`.
- [ ] Caller-authored Questions, answers, Profiles, groups, or other consumed semantics are rejected as authority.
- [ ] Source Capture binds exact raw bytes and whole-file digest; deterministic reruns reproduce candidate and issues.
- [ ] Source Spans remain diagnostic/audit evidence rather than universal per-field admission proof.
- [ ] Missing or contradictory active content fails closed; an inactive non-rendered slot may explicitly be `not_supplied` and creates no Group.
- [ ] Confirmation is bound to the exact candidate/source digest and yields one complete Canonical Paper or none.
- [ ] Adversarial public-seam tests, affected checks, one final full suite, independent review, and `git diff --check` pass.

## Superseded-ticket mapping

Replaces old Tickets 25 and the shared-seam portions of 26–58. Preserves the
partial Ticket 25 commits as non-ready evidence.

## Result

Commit:
Verify:
Notes:
