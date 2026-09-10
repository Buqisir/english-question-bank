# Renderer-only presentation successor v53

v53 adds `renderer-paper-presentation` v1 and its schema to the unchanged v52
closure. Screen v41 and Print/PDF v42 select this presentation policy. Import and
publication producers still select v52; global accepted authority remains v36.
No Source, Teacher Confirmation, semantic projection, Publication or saved PDF
is rewritten. The generator never writes historical manifests/contracts.

## Placement and compatibility

`continuationWritingPresentation` receives a validated semantic group and its
source consumption's consumer ref, not a synthetic composite's authority.
For current consumers, exactly two unique, source-validated starter references
are partitioned out of material and placed once inside the response, preserving
text, IDs, reference order and semantic/occurrence signatures. Historical refs
(or pre-contract consumption) retain historical placement. The old semantic
`sourceStarterLinesInResponse` flag remains unchanged and is not forged by the
presentation layer.

Opaque application sources without role refs and continuation sources with
missing/abnormal starter counts remain complete and unguessed. In particular,
the historical Zhejiang June 2022 fixture has three refs, including a repeated
starter: this renderer does not silently deduplicate or block its export.
Source correction is a separate source-backed revision, not a CSS migration.

`blankPresentationParagraphs` removes exactly three immediately adjacent
underscores on BOTH sides of a validated Seven Choices blank, the residue of
the frozen `__NN__` adapter consuming the middle of `_____NN_____`. It returns
separate display paragraphs; original nodes, numbers and semantic signatures
remain unchanged. Unpaired/different-length/non-adjacent underscores, other
families and historical consumers remain untouched. Current DOCX materialization
already consumes the complete long marker; its producer and the historical
replay adapter are not changed. This rule was added while v53 is still an
unpublished working-tree candidate, then its manifest/consumer digests regenerated.

## Shared layout and measured safety

Shared paper CSS owns title/closing alignment, response geometry, passage and
option flow. Screen remains continuous; Print/PDF own pagination. Long headings
and table cells wrap. Figures preserve aspect ratio and include captions in
the printable-height budget. After Paged.js, atomic block and descendant bounds
must fit; oversized content rejects with `PAPER_LAYOUT_OVERFLOW` rather than
returning truncated output. This is a rendering failure, not a new semantic
admission rule for ambiguous legacy writing.

## Reproduction and conformance

- `node scripts/generate-paper-presentation-authority.mjs --check`
- `node scripts/verify-paper-canonical-legacy-opaque-writing-rendered-behavior.mjs`:
  historical/current application and continuation, ambiguous three-ref source,
  unchanged semantic projection, Screen/Print placement and PDF text retention.
- `node scripts/verify-paper-canonical-framed-columns-rendered.mjs --actual-artifacts`:
  long heading/cell, tall image, oversized atomic frame and descendant overflow.
- Existing writing application/continuation rendered and whole-paper canaries
  exercise modern source roles, shared CSS and immutable publication consumers.
- `node scripts/verify-paper-canonical-seven-choices-rendered-behavior.mjs`:
  exact paired residue, asymmetric negative cases, frozen canary Screen
  presentation, historical consumer preservation and unchanged signatures.
- `node scripts/verify-ticket-31-canary-whole-paper-export.mjs --actual-artifacts`:
  real Screen/Print/Paged five-blank count, unique IDs, no literal residues,
  single-fragment bounds and number containment in the first immutable canary.

Final verification results belong in `docs/cuts/shared-paper-layout/spec.md`;
this migration description does not itself claim a successful test run.
