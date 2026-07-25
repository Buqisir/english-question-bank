# 定义阅读 canonical variant 与图表 proof 合同

Status: closed
Type: prototype
Claim: claimed
Blocked by: 定义七选五 canonical variant 与双卷 proof 合同
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/10-application-writing-canonical-variant.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

How should reading passages, paragraph order, titles/subtitles, Questions, A–D Options, tables, figures, and source-linked positions fit the shared canonical envelope while keeping Analysis strictly supplemental? Select one prose-only and one table/figure-bearing real proof group, define source-format and rich-content ambiguity failures, and lock semantic/anchor parity across detail/PaperSurface, Print/PDF, and DOCX. Reading renderer evidence must additionally exercise real four-column, two-by-two, and one-column A–D sets through the accepted shared selector, with no hybrid wrapping. Decide what replaces the current flattened-table plus placeholder bridge and what evidence is required before reading consumers stop rebuilding structure.

## Resolution

[Prototype asset: Reading canonical variant 与图表 proof 合同](../../prototypes/reading-canonical-variant.md)

Select one closed `CanonicalReadingVariantV1` behind the shared Group
envelope. `content.blocks` remains the sole passage-order owner; Reading adds
only source-backed `title | subtitle` roles for paragraph nodes, ordered
Questions, exact question-owned A–D sets, and one official
`correctOptionId` join per Question. Profile/Plan retains slot labels,
instructions, numbering, scoring, and answer regions. Analysis joins later by
stable identities and can neither construct nor change passage semantics,
answers, layout plans, digests, or canonical anchors.

The shared projector emits typed paragraph/table/figure blocks and ordered
Questions through one semantic seam. A source table is one native rectangular
table with stable row/cell identities; a true figure is one hash- and
dimension-closed media block. The current marker + undelimited flattened text
and nullable PNG manifest bridge is forbidden in canonical Reading. A table
crop remains Source Capture / Normalization Report proof rather than a second
rendered table, and a `ready` renderer never falls back to a placeholder.

The hash-bound real proofs are
`paper-2026-i / group-2026-i-reading-c` (source PDF page 6: six prose
paragraphs, four Questions) and
`paper-2026-i / group-2026-i-reading-a` (page 4: one passage title, three
subtitles, three body paragraphs, one 4×3 table, three Questions). The
accepted shared selector chose q28–q31 as
`two_by_two / one_column / four_columns / two_by_two`; all detail,
PaperSurface, Print/PDF, and DOCX prototype projections shared the same
logical signatures, while a hybrid late row was rejected. The redacted logic
prototype reported prose `ready` with 27 semantic/anchor occurrences and
table-contract `ready` with 40, both with projection parity `true`; only the
linked answer is retained.

Complete-but-ambiguous heading/boundary/grid/placement evidence is
`needs_review`; clear but unrepresentable nested tables or inline figures are
`unsupported`; missing source regions, structured cells, media closure, or
official-answer evidence are `incomplete_source`; competing official keys are
`answer_conflict`. The existing bridge alone is `incomplete_source`, though
the selected real PDF remains available for recapture.

Before Reading consumers stop rebuilding structure, a canonical-only fixture
with no legacy fields must render on every surface, both real proofs must pass
actual Screen/Print/PDF/DOCX semantic, anchor, geometry, and
Analysis-independence gates, and all 126 Reading groups / 465 Reading
Questions across 33 `latest` assets must compile without silent legacy
fallback. The known 49 heading-suffix cases require explicit source-boundary
resolution. No `CONTEXT.md` change, Fog graduation, or new ticket is required.

Recorded verification:

- `node .scratch/wayfinder-09-reading-canonical-variant/tui.mjs --all` —
  prose/table projection parity `true`; all three real A–D modes exercised;
  bridge, Analysis intrusion, and hybrid placement rejected before throwaway
  deletion.
- `node --check` on both throwaway prototype modules.
- read-only corpus recount — 33 papers / 126 Reading groups / 465 Reading
  Questions.
- source PDF page 4/6 Poppler render inspection; question PDF, paper asset,
  and table-crop sha256 values recorded in the linked asset.
- `git diff --check`.
