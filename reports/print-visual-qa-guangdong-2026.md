# Print Visual QA — 2026 广东省高三一模英语试卷

**Date**: 2026-05-15
**Renderer**: Vivliostyle CLI 9.x via `server/node_modules/.bin/vivliostyle`
**Source data**: 6 question groups from `26.3广东高三一模英语试卷` (reading C/D/B, 七选五, 完形, 语法填空)
**Version**: Student exam (no answers)
**Reference**: 原始试题 PDF (8 pages, scanned/typeset; configurable via `--reference-pdf` or `REFERENCE_PDF`)
**Reference path used in this run**: `/Users/huangxuewei/Desktop/10_日常工作/教学资料/试卷/2026年广东省一模/2026_03_23_含词汇整理：26年3月广东一模/含词汇整理：26年3月广东一模/试题.pdf`

## Summary

| Dimension | Verdict | Notes |
|-----------|---------|-------|
| Page size | PASS | Both A4 (595.276 × 841.89 pts) |
| Page count | WATCH | Generated 9pp vs reference 8pp — generated has explicit page breaks between sections; reference packs tighter |
| Margins | PASS | Generated uses 20mm all sides; reference appears ~18-20mm — acceptable |
| Font size hierarchy | PASS | Title 18pt, section headers 12pt, body 10.5pt — matches typical exam paper proportions |
| Paragraph indent | PASS | Passage paragraphs use `text-indent: 2em`; consistent with reference |
| Question numbering | PASS | Continuous 1–N across sections, no reset at section boundaries |
| Option spacing | PASS | 4-option short answers use 2-column grid; longer options use vertical list |
| Section headers | PASS | Bold, clear separation between 阅读/七选五/完形/语法填空 |
| Page break behavior | WATCH | Each section starts on new page (by design); reference sometimes continues on same page when space allows |
| Line height | PASS | 1.6 body line-height; readable density for exam context |
| Chinese/English mixed typesetting | PASS | SimSun + Times New Roman fallback; no tofu or missing glyphs |

## Reproducibility Notes

- The generated PDF/HTML/PNG artifacts are reproducible from local database content and Vivliostyle.
- Reference-page PNGs are optional visual QA evidence. Pass a machine-local reference file with `--reference-pdf /path/to/试题.pdf` or `REFERENCE_PDF=/path/to/试题.pdf`.
- If the reference PDF is missing, the script warns and still generates the student exam PDF and generated-page PNGs.
- Page-count comparisons are local visual observations against the reference PDF used in this run; they are not treated as cross-machine CI invariants.

## Detailed Observations

### Page Margins (PASS)
- Generated: `@page { margin: 20mm 18mm 20mm 18mm }` — standard exam paper margins
- Reference: visually similar, approximately 18–20mm on all sides
- No content clipping observed

### Font Size Hierarchy (PASS)
- Paper title: 18pt bold, centered — matches reference header style
- Section headers (`h2`): 12pt bold — clear visual separation
- Body text: 10.5pt — standard for Chinese exam papers
- Answer/explanation (teacher mode): 9.5pt — appropriately subordinate

### Paragraph Indent (PASS)
- All passage paragraphs use `text-indent: 2em` — standard Chinese typographic convention
- Question stems have no indent (correct — they start with number)
- Options indented 2em from left margin

### Question Number / Option Spacing (PASS)
- Numbers bold, followed by period and stem text
- Short 4-option questions (reading) rendered in 2×2 grid — space-efficient
- Cloze options rendered inline with `margin-right: 2em` spacing
- Seven-choices questions have no options (fill-in style) — correct

### Page Break Behavior (WATCH)
- Generated inserts `break-before: page` between major sections
- This produces 9 pages vs reference's 8 pages
- The extra page is acceptable for clarity but could be optimized later by removing forced breaks when remaining space > 30%
- Not a blocking issue for V1

### Content Completeness (PASS)
- All 6 question groups rendered with passages and questions
- Reading C (4 questions), Reading D (4 questions), Reading B (4 questions)
- 七选五 (5 questions), 完形填空 (15 questions), 语法填空 (10 questions)
- Total: 42 questions rendered

## Artifacts

| File | Description |
|------|-------------|
| `artifacts/print-visual-qa-guangdong-2026/generated.pdf` | Vivliostyle-rendered student exam PDF (9 pages, 148 KB) |
| `artifacts/print-visual-qa-guangdong-2026/generated.html` | Source HTML fed to Vivliostyle |
| `artifacts/print-visual-qa-guangdong-2026/generated-page-{1..4}.png` | First 4 pages rendered at 150 DPI |
| `artifacts/print-visual-qa-guangdong-2026/reference-page-{1..4}.png` | Reference PDF first 4 pages at 150 DPI |

## Verdict

**Overall: PASS with 2 WATCH items**

The Vivliostyle print renderer produces a well-structured, readable student exam PDF from real 广东一模 data. Typography, margins, and layout match exam paper conventions. The two WATCH items (page count +1, forced section breaks) are cosmetic and do not affect usability for 讲评 or student practice.

## Next Steps (optional, not in V1 scope)

- [ ] Conditional page breaks: only break if remaining page space < 30%
- [ ] Add exam header metadata (考试时间, 满分, 注意事项)
- [ ] Two-column layout option for denser papers
