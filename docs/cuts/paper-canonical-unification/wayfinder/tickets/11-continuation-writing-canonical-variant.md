# 定义读后续写 canonical variant 与 starters 合同

Status: closed
Type: prototype
Claim: claimed
Blocked by: 定义应用文 canonical variant 与 given skeleton 合同
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/12-listening-raw-inactive-slot.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

How should continuation material, task instruction, word-count ruling, ordered paragraph starters, and answer region fit the shared canonical envelope while preserving the writing Question Group's zero-Question invariant? Cover both standard two-starter continuation and the real legacy variants found by the census, select two proof groups, and define when a source is valid, profile-specific, incomplete, or `needs_review`. Lock parity across Screen, Print/PDF, and DOCX without moving continuation design or model answers out of Writing Analysis.

## Resolution

[Prototype asset: Continuation Writing canonical variant 与 starters 合同](../../prototypes/continuation-writing-canonical-variant.md)

Select one closed `CanonicalContinuationWritingVariantV1` behind the shared
Group envelope. The Group keeps zero Questions, zero Blanks, and choice
ownership `none`; its source-mapped rich-content document owns the complete
continuation material and any fixed starter content exactly once. The variant
refers to that content, binds one Profile-owned task instruction, preserves one
source-backed approximate 150-word `student_authored_only` ruling, and emits
one Plan-bound `writing.continuation-box`.

Starter cardinality remains in exact family contracts rather than a free
Profile/Plan field. `continuation-writing.two-starter@v1` accepts exactly two
ordered source starters; `continuation-writing.plot-led@v1` accepts only an
affirmative `source_proven_none` assertion and requires a compatible plot-led
Zhejiang Profile version. Array position is the sole starter order. Missing
starter evidence or an unproven empty array is `incomplete_source`; a clear
unrepresented cardinality/profile combination is `unsupported`; ambiguous
material/answer/starter boundaries or conflicting rulings are `needs_review`.
Questions, Blanks, options, wrong response binding, and Writing Analysis
intrusion reject the candidate.

One projector gives Screen, Print/PDF, and DOCX the same occurrence signature
over Group/Writing Task identity, Profile instruction, ordered material,
word-count ruling, response slot, and zero-or-two starter ids/content refs.
Renderers cannot parse `Paragraph N:`, fabricate prefixes or instructions,
slice a longer array, or move fixed starters out of the answer region.
Continuation Design, Model Answer, official reference answer, Highlight
Expressions, and student response content remain Writing Analysis/supplement
data and cannot change canonical admission or projection.

The two hash-bound real proofs are
`paper-2026-i / group-2026-i-writing-continuation` (source PDF physical page
11, two source starters) and
`paper-zj-2020-jul / group-zj-2020-jul-writing-continuation` (plot-led source,
zero Paragraph labels, affirmative no-starter shape). The current
`paper-zj-2022-jun / group-zj-2022-jun-writing-continuation` three-entry array
is a negative `needs_review` fixture: entry lengths are 71/509/447, the latter
two include response-like content, and source/answer roles are not closed.
It cannot be kept whole or truncated to two.

The throwaway logic prototype reported `PASS 18 / FAIL 0`, then was deleted.
It compiled both proof contracts, locked three-surface parity, reproduced the
legacy three-entry mismatch, and exercised `ready`, `incomplete_source`,
`unsupported`, `needs_review`, and candidate-rejection boundaries.
`node scripts/verify-i6-writing-render.mjs` passed 19 checks. A read-only
corpus recount found 24 Continuation Groups with current legacy starter-count
distribution `0:1 / 2:22 / 3:1`; these fields remain migration leads, not
source authority. `git diff --check` passed.

No `CONTEXT.md` update, Fog graduation, or new ticket is required. The
existing listening ticket remains the declared successor.
