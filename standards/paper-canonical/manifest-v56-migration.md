# Renderer-only gold-cover correction v56

Owner review on 2026-09-20 found that Screen inherited application typography,
the cover list indented continuation lines, and the listening section title
inherited browser bold. Presentation v3 records the common cover/body roles:
10.5pt body, 18pt baseline, 20pt document title, bold notice label/part heading,
regular section heading, and 2em first-line (not whole-item) notice indentation.
The transfer notice also starts at 2em. Page top padding owns the top margin;
the opening no longer adds another 72pt above the title. The default title-to-
notices gap remains 72pt; no physical dimensions are inferred from gold JPEGs.

Screen v44 and Print/PDF v45 select this renderer successor. Raw Candidate
authority stays v54, analyzed-package authority v55, and global accepted v36.
All historical manifests, schemas, contracts, publications and saved PDFs remain
byte-identical. Historical explicit cover gaps are still applied explicitly,
including [72,72]; no pixel-identical re-rendering guarantee is introduced.
Fixed 8/10-page editions may compress cover gaps via a saved plan, but not font,
indentation or body rhythm. Natural Screen/Print share the same default gaps.

The Screen host reserves the 794px paper before docking a 440px lecture panel
(1440px breakpoint), disables automatic zoom for Review, and suppresses selection
scissors in Review only. Narrow screens remain responsive; they are not physical
A4 proofs. Passage roles come from source materialization, never CSS heuristics.

Before this successor is published, `inlineBlankSpacing: source_text_boundaries`
also removes Print-only external blank margins and the empty Grammar Fill hint
track. A real hint keeps its existing 0.5em internal gap. Source separators remain
literal text; no consumer inserts them. Historical consumer refs retain their
previous geometry. Retained R4 artifacts bind the prior unpublished digest;
changed text/presentation requires new revision and pagination evidence.

Owner's R5 review also found ragged-right continuation material in Print/PDF.
`continuationMaterialAlignment: justify_except_last_line` binds this successor
to justified ordinary material paragraphs, preserving natural paragraph-final
lines. Instructions, notices and supplied response starters are not targets.
Screen already justifies the material; Print activates the shared rule only
when its consumer resolves this policy. Historical and pre-contract Print keep
their earlier alignment; source blocks, content and answer geometry do not change.

The subsequent whole-paper audit extends the unpublished successor with
`roleLayout: golden_reference_v1`: six prose roles justify with natural final
lines and no extra paragraph gap; writing notices have a one-baseline gap,
flush label and a single 2em numbered-line inset; canonical reading paragraph
and table semantic newlines remain visible; headings keep following content.
The marker is resolved per consumer/group, never by paper identity. Historical
bindings emit no marker. Source proofreading owns the distinction between
semantic newlines and OCR physical wrapping. Fixed-page feasibility must be
rechecked: the first R6-derived compact replay now produces eleven pages and
correctly fails the ten-page plan gate; it is not a successful friendly10 plan.

Reproduce: `node scripts/generate-paper-presentation-v56.mjs --check`.
Verify: `node scripts/verify-paper-cover-v56.mjs`,
`node scripts/verify-paper-golden-role-layout.mjs`, focused planner tests, real
Screen/Student+Teacher Print/PDF checks, then paper/full verification packs.
