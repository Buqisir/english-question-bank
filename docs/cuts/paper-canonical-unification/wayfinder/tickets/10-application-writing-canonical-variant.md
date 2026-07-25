# 定义应用文 canonical variant 与 given skeleton 合同

Status: closed
Type: prototype
Claim: claimed
Blocked by: 定义阅读 canonical variant 与图表 proof 合同
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/11-continuation-writing-canonical-variant.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

How should an application Writing Task represent the complete prompt, communicative situation, content requirements, word-count ruling, and explicit given title/salutation/opening/closing/signature without fabricating a skeleton from ambiguous passage text? Reconcile the reviewed application-writing workflow with the shared canonical envelope, choose two contrasting real proof groups, and define fail-closed reconstruction plus answer-region parity for Screen, Print/PDF, and DOCX. Model Answer, official reference answer, ReviewCard, and other Writing Analysis content must remain outside canonical paper semantics.

## Resolution

[Prototype asset: Application Writing canonical variant 与 given skeleton 合同](../../prototypes/application-writing-canonical-variant.md)

Select one closed `CanonicalApplicationWritingVariantV1` behind the shared
Group envelope. The Group keeps zero Questions and zero Blanks; its one
source-mapped rich-content document owns every prompt and provided fixed-text
node exactly once. The variant refers to that content to expose the complete
prompt, writer role, audience/destination, deliverable, communicative purpose,
ordered content requirements, and the source's approximate word-count ruling.
The only accepted current count scope is `student_authored_only`; provided
fixed parts do not count, while generation-workflow accepted/recommended bands
remain outside paper semantics.

`CanonicalApplicationGivenSkeletonV1` is a closed union: either
source-proven `presence: none`, or ordered provided parts role-labelled
`title | salutation | opening | closing | signature`. Title, salutation, and
opening project above the student response slot; closing and signature project
below it. Email/letter/article form, an English opening, or a complete
group-passage letter never proves a skeleton. Ambiguous legacy reconstruction
maps the reviewed workflow's `SPEC CONTRADICTS` behavior to `needs_review`;
missing closure is `incomplete_source`, and clear but unrepresentable source
layout is `unsupported`.

One projector emits the complete prompt plus one Plan-bound
`writing.application-box` occurrence. Screen, Print HTML/PDF, and DOCX share a
signature over prompt/content ids, situation refs, ordered requirement ids,
the word-count ruling, response slot, and given-part ids/roles/placements.
Student and teacher paper occurrences are identical; Model Answer, official
reference answer, ReviewCard, Highlight Expression, generator audit, and all
other Writing Analysis fields are rejected from canonical candidates and may
only join as supplements.

The hash-bound real proofs are
`paper-2026-i / group-2026-i-writing-application` (source PDF physical page
10: one prompt paragraph, one given title, no letter skeleton) and
`paper-960d0f8d / group-960d0f8d-writing-application` (source DOCX: two top
parts and two bottom parts, no structured `applicationGiven`). The prototype
reported `PASS 18 / FAIL 0`: both proofs and a source-proven no-skeleton email
compiled, all four surface signatures matched, and ambiguous passage/opening,
genre-only inference, missing/conflicting rulings, bad given order, and
Analysis intrusion failed closed.

Current legacy behavior is a negative proof: the 2026 title string disappears
from all answer regions, while the 960 Screen reconstructs four fixed parts
that API detail, Print/PDF, and DOCX omit. Before retirement, all 24 current
Application Groups must compile from source closure to ready or remain
explicitly blocked; field/regex detection cannot count as migration coverage,
and consumers must select a whole canonical or whole legacy family path.

Recorded verification:

- throwaway logic prototype —
  `node .scratch/wayfinder-10-application-writing-canonical-variant/tui.mjs --all`
  → `PASS 18 / FAIL 0`, then deleted.
- `node --check` on both throwaway prototype modules before deletion.
- `node docs/cuts/application-writing-v1/qa/verify-02-reviewed-workflow.mjs`
  → 39 passed / 0 failed.
- `node docs/cuts/application-writing-v1/qa/verify-04-first-real-pilot.mjs`
  → 8/8 passed with locked source hashes.
- `node scripts/verify-i6-writing-render.mjs` → 19 checks passed.
- read-only current corpus recount → 24 Application Groups; 23 absent and one
  legacy-string `applicationGiven`; all 24 have target 80.
- `git diff --check`.

`CONTEXT.md` now names **Application Given Skeleton** as source-provided fixed
response text and forbids genre/background inference. No Fog graduation or new
ticket is required.
