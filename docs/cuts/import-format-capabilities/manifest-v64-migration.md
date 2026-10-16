# Source-backed Application Writing prompt figures — v64/v65

This local candidate adds figures to the ordered Application Writing prompt,
without treating a poster as furniture, OCR text, an answer or fixed response
text. It does not approve or publish any paper.

## Separate raw admission and presentation successors

- Raw v64 succeeds v62. Source adapter registry v21 retains previous adapters
  and registers materialization behavior v6. Its normalization report and
  publication envelopes use v64 identities.
- Presentation v65 succeeds v63. Screen v47 and Print/PDF v48 register the
  renderer-owned `application-writing-prompt-figures-v1` capability. Reading
  and Application Writing share the existing source-figure presentation.
- Historical manifests, schemas, consumer contracts and publications remain
  byte-for-byte unchanged. Retained v62 Candidates replay using v62; their
  approvals are never upgraded to v64. Paragraph-only projected semantics are
  unchanged, although new import/consumer envelope identities differ.
- `scripts/generate-application-prompt-figure-authority.mjs --check` verifies
  the additive closures without rewriting historical artifacts.

## Source and consumer boundaries

Native DOCX drawing-only paragraphs retain their source position. A prompt
figure references exactly one group media item with captured bytes, dimensions,
digest and source artifact. Every group media item must be placed exactly once.
Missing, altered, duplicate or unplaced media is rejected. Old consumers reject
figure-bearing application prompts rather than silently dropping their images.

Communicative situation, content requirements, word-count rules and Given
Skeleton still reference paragraph text only. Figures precede fixed response
text and interrupt notice grouping. No text, caption, alt interpretation or
answer is invented from the picture. Existing source media presentation intent
controls alignment, width and spacing on Screen and Print/PDF.

The three question products retain prompt figures; `answerOnly` continues to
read source references independently and does not repeat question prompts.
No paper-ID conditional, per-paper CSS, database migration or automatic revision
replacement is part of this change. Existing frozen products remain immutable;
changed candidates/products require new local outputs and a new Review revision.

## Materialization cache identities

The shared parser changes use DOCX producer v13, PDF producer v10 and OCR
producer v11 (legacy confirmations) / v12 (confirmation v3). The earlier local
figure snapshot used DOCX v12, PDF v9 and OCR v9/v10; those identities are not
reused for the listening-boundary change.
These versions participate in the producer source digest, so previous parser
outputs cannot be current cache hits. Inspection retains the previously
accepted historical versions plus the immediate predecessors (DOCX v12,
PDF v9, OCR v9/v10); confirmation-v3 inspection accepts historical OCR v8/v10,
never the legacy-confirmation lineage. Historical receipt/review/output bytes are not rewritten, and a
producer refuses to overwrite them. Reprocessing requires a fresh attempt.

## Listening source partitions

One unique ordered Text 1–10 run can identify a headingless listening source;
the preceding boundary must still be explicit, not invented. Only standalone,
recognized exam broadcasts are excluded from question-bearing transcripts.
Question announcements must match the next source range, section transitions
must match Text 6, and end cues must follow Text 10. Mixed speech/cues, resumed
speech after a cue, unknown preambles and unclosed tails block preparation.
Speaker labels are not required for monologues; ordinary spoken instructions
remain part of the transcript.

The private producer review retains exact source text, order, locators and each
disposition in `listeningSourcePartition`; the producer receipt binds its digest,
source identity and original materialization digest. Current inspection rejects
a missing or altered partition. Historical reviews remain readable, and an
Agent-modified materialization does not overwrite the original partition.
This is source-audit evidence, not an audio-semantic PASS, new Canonical broadcast
content, or permission to remove question-paper directions/examples.

## Acceptance boundary

The DOCX producer verifier covers import-to-consumer figure order, retained v62
paragraph-only replay, old-consumer rejection and media-integrity failures.
Final shared-contract acceptance additionally requires affected real
Screen/Print/PDF inspection, independent Standards/Spec review, and the exact
Ship candidate's natural Full/E2E checks. A synthetic preview is not any paper's
source review, listening review, Teacher Confirmation or publication approval.

## Inline Chinese-gloss separator successor — raw v66

Raw v66 succeeds v64 with normalization rules v7 / visible typography rule v4.
An inline text node can end before a blank or another text node, so a Chinese
gloss at that boundary must retain its existing horizontal whitespace. The
normalizer still removes spaces before punctuation inside the same text node;
it never inserts a missing terminal separator to make a blank check pass.

Both the producer and independent scanner replay implement this distinction.
Historical v3 retains terminal trimming, and stored v64 Candidates,
confirmations and Review projections rederive under v64. New Candidates use
v66 and require newly bound sidecars/revisions. Presentation v65 and its
Screen/Print contracts do not change; they consume the corrected canonical
text. `generate-inline-gloss-spacing-v66.mjs` creates only new immutable
artifacts and rejects differing existing outputs.

## Writing-source emphasis successor — raw v67

Raw v67 succeeds v66 with adapter registry v22 / behavior v7 and rich-content
v4. Exact OCR-confirmed bold/underline ranges now apply to Application and
Continuation paragraphs as well as Reading. Splitting an inline also remaps
the Writing Task's inline references. Unmatched ranges, unsupported instruction
targets and changed evidence still fail. Answer-document emphasis stays in
private source observations with exact text, ranges and locators; identical
words in a question never inherit answer formatting. No italic mark is inferred
or added to the existing confirmation schema. Historical v66 remains unchanged.
Screen's given writing lines and Print's continuation starters render the same
marked inlines. The established `Paragraph 1/2` placement-label suppression
uses the combined text when emphasis splits a label across nodes, preserving
the body node's marks. Unmarked historical display retains its existing path.

The source parser now separates scoring material before an explicit standalone
`A/One Possible Version` label from the sample body. A single label is not prose;
multiple labelled alternatives retain their labels and source order. Captured
scoring content remains available to the source-reference sidecar.
Producer identities advance to DOCX v14, PDF v11 and OCR v13/v14. Inspection
retains their predecessors and still requires listening partitions for every
producer version that introduced them; version advancement cannot weaken an
old receipt's requirements. Existing receipts require a new attempt, not overwrite.

## Structured scoring references — sidecar v2

The stable `source-references-v1.json` filename accepts schemas v1 and v2.
`answer-products.mjs prepare --structured-scoring` explicitly prepares v2;
existing v1 artifacts remain unchanged. Essays retain paragraph entries. Scoring
entries use ordered paragraph/table blocks, preserving empty cells and source
row/column order. Each cell has a unique ID, exact source locator and document
digest. Tables must be rectangular with distinct cell locations in one answer
document. Native DOCX additionally replays a complete unmerged table; currently
each cell must contain one source paragraph. PDF cell text still requires
source review; valid coordinates alone do not prove transcription fidelity.

Only the existing `includeScoring` presentation renders these tables. Default
`answerOnly` remains scoring-free. QA checks ordered blocks and row/cell text,
not only flattened text containment. This sidecar does not put scoring into
question content or create Teacher Confirmation.

## Numbered blank decoration — producer successor

The shared source parser recognizes a number enclosed by underscores even
when only one stroke remains on either side, such as `_65__` or `_65_`.
Previously it matched only the trailing `65__`, leaving a stray underscore in
prose. The full numbered token now becomes one blank reference; surrounding
text, source confirmation and the new-write separator gate remain unchanged.
Numbers still must cover the expected question sequence exactly once.

Producer identities advance to DOCX v15, PDF v12 and OCR v15/v16. Retained
DOCX v14, PDF v11 and OCR v13/v14 receipts remain inspectable with their original
listening-partition requirements. Updated output uses a fresh attempt and
rebound sidecars, never an overwritten receipt or hand-edited source.

## Reading heading and figure pagination

Under the existing golden-reference layout, Print groups a source title or
subtitle with its immediately following figure for pagination. Paged.js can
otherwise move the figure beside a following table while leaving its heading
on the previous page, despite `break-after: avoid`. Only the heading/figure
pair is grouped; long passages and tables keep their existing flow. Text,
media, source identity, font sizes and page limits do not change. Historical
consumers without the golden-reference layout retain their original markup.

This does not introduce a keep-together requirement for part/section headings:
the format standard explicitly allows those headings at the page bottom.
Existing frozen PDFs stay immutable; a changed product needs a new workspace
and exact local revision. Optional scoring-table pagination remains separate
from the default, scoring-free answer booklet.
