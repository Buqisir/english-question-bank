# Analysis: one source, every surface

Status: draft, awaiting Owner acceptance (2026-11-25)

## Why

The Owner is starting to release 真题. A paper is released only when its
analysis is complete, and later backfills should be rare. The rule is "write
once, use everywhere": one analysis per paper feeds the web lecture rail
(讲评栏) and the 解析 PDF.

## What the code does today (read 2026-11-25, main `bd9dc6820`)

- One source. The local Agent writes staged files (reading A–D, seven, cloze,
  grammar, application, continuation, listening). Review projects them into six
  sidecars under `analyses/`, records `analysisDigest`, and freezes
  `products/analysis.pdf` from the same projection. Promotion publishes both.
- Readers of the six sidecars: the lecture rail (`PaperBrowsePage.tsx`), the
  frozen 解析 PDF (`server/exports/companion-analysis/`), the draft-paper
  explanation (`server/draft-paper/analysisText.mjs`), and search
  (`similarQuestions`, `teachingFacets`, `paperSurfaceAvailability`).
- Location data is shared. The rail uses it to highlight the passage, and the
  PDF prints it as a paragraph reference.

## Gaps this cut closes

1. The rail does not show the cloze and seven-choices teaching that the PDF
   prints. See ticket 01.
2. The writing backfill can change served sidecars without a new review, so
   the rail and the frozen 解析 PDF can disagree. See ticket 02.

Out of scope: the draft-paper explanation text (600-character legacy summary)
and the two live data defects on 2025/2026 全国Ⅱ writing (missing
`applicationGiven`, `Paragraph 1:` prefix on continuation starters). Those are
reported separately.
