# 05 — Application Writing canonical vertical slice

Status: ready
Blocked by: 04 — Reading and rich-content canonical vertical slice
Next on PASS: `docs/cuts/paper-canonical-unification/tickets/06-continuation-writing.md`
Terminal: no

## What to build

Implement `CanonicalApplicationWritingVariantV1` through compiler,
Publication, projector, Screen, Print/PDF, and DOCX. Preserve one complete
source-backed prompt, the `student_authored_only` word-count ruling, optional
source-provided Given Skeleton, and one Plan-bound response region.

## Acceptance criteria

- [ ] The Group has zero Questions/Blanks and owns each prompt/fixed-text node
      exactly once.
- [ ] Given Skeleton is a closed source-proven none/present union with ordered
      title/salutation/opening above and closing/signature below the response
      slot; genre/background inference is impossible.
- [ ] Canonical-only, `paper-2026-i`, `paper-960d0f8d`, and source-proven
      no-skeleton fixtures pass with one identical occurrence signature on
      all student/teacher surfaces.
- [ ] Missing/ambiguous/unrepresentable skeleton or word-ruling evidence
      reaches the exact blocked disposition.
- [ ] Model answers, official reference answers, ReviewCard, Highlight
      Expressions, and generator/Analysis fields cannot affect admission,
      canonical digest, fixed text, or response placement.
- [ ] All 24 current Application Groups are represented in compatibility
      accounting without claiming source closure prematurely.
- [ ] Focused checks, actual artifacts, app build, full verify, and
      `git diff --check` pass.
- [ ] A fresh independent review lineage is green and the provisioned owner
      QA checklist is accepted before the ticket is marked done.

## Out of scope

No Continuation Writing, active listening, new-import latch, corpus migration,
or legacy deletion.

## Result

Commit:
Verify:
Notes:
