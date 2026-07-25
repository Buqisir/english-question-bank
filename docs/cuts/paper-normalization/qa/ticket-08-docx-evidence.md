# Ticket 08 DOCX evidence

Status: PASS
Date: 2026-07-25
Implementation base: `15c2f98b94b21d0b27bc1b60ed3b3d6ef74b2cfe`

## Public seam

- `node scripts/verify-paper-normalization-docx.mjs` exited 0.
- Real `paper-2026-i` cloze/grammarFill and
  `paper-960d0f8d` grammarFill consumed complete canonical groups through
  `createDocxRenderer`; the proof OOXML contained 35 semantic blank runs and
  no proof raw marker, raw grammar label, or duplicated presentation stem.
- Valid sidecars and approved proof compatibility were canonical. Invalid and
  stale sidecars were rejected before compatibility normalization. A
  compatibility `needs_review`, a mismatched DOCX detail, and a valid sidecar
  for a non-proof group produced one explicit structured legacy diagnostic.
- Student/teacher, block order, continuous q41–75 numbering, canonical
  prose/options/hints, protected prose numbers, and canonical 3.3em ruling
  translation passed. SevenChoices stayed on its untouched legacy path.
- The real package was unzipped after `writeDocxPackage`; its
  `word/document.xml` was byte-equal to the pre-package XML and retained all
  35 canonical blank facts, immediate hints, and raw-marker exclusions.
- `exportDocx` and `exportPdf` return the renderer's structured normalization
  diagnostics to the export host; the public export seam verifies the
  non-proof legacy fallback diagnostic.

## OOXML blank ruling

The canonical translator accepts only the shared ruling facts
`single-thin`, centered number, no suffix, `nowrap`, and hint
`immediately-after`. It deterministically maps the accepted Word convention:

- canonical cloze/grammarFill `3.3em` → 2+2 underlined spaces;
- untouched sevenChoices legacy `4.6em` → 3+3 underlined spaces.

At the 1414×2000 PNG render size, canonical short rules measured 49–50 px and
the untouched sevenChoices legacy control measured 62 px. The number remained
centered with no trailing point, and grammar hints were in the immediately
following OOXML run and visually adjacent to the rule.

## Actual DOCX and LibreOffice render

`T08_VISUAL_OUTPUT_DIR=output/playwright/ticket-08 node
scripts/verify-paper-normalization-docx.mjs` generated and opened both DOCX
packages through LibreOffice conversion:

- student DOCX SHA-256:
  `0fe24920e7b212aa507a8e650dd08374bc1e426370feac8d17c72b35963f9ffa`;
- teacher DOCX SHA-256:
  `13436f1d4d1d682be0d36f85f75bd35a84db1ad543d7797183f6f11ace1efc38`;
- direct `convertDocxToPdf` student/teacher outputs were valid A4 PDFs with
  3 and 4 pages respectively.

The standard document renderer then converted each DOCX to PDF and 1414×2000
page PNGs. The local LibreOffice/fontconfig default mapped `宋体/黑体` to
Verdana, so the visual render used a session-scratch alias to installed
`Songti SC / Heiti SC`; this changed no DOCX bytes or renderer contract.

- visual student PDF SHA-256:
  `6d925f79b6220a123e14d149bcd945ab39c2f9483b49adbbe0f6946677b49f3b`;
- visual teacher PDF SHA-256:
  `1c6ab724c7b8bc0622212cae20a8e003b3e667b3ff2ddff305d2caab6619c539`;
- student group spans: cloze page 1, `paper-2026-i` grammarFill page 2,
  `paper-960d0f8d` grammarFill page 3;
- teacher group spans: cloze pages 1–2, `paper-2026-i` grammarFill page 3,
  `paper-960d0f8d` grammarFill page 4.

All seven student/teacher page PNGs were visually inspected. Fonts, page
order, section/group order, rules, centered numbers, immediate hints, options,
teacher answers, and footer fields were visible. There was no clipping,
overlap, raw label, or duplicate `41. 41` / `56. 56`.

## Regression evidence

- `node scripts/verify-h5g-docx-renderer.mjs`: exit 0, 148/148;
- `node scripts/verify-h5a-export-implementation.mjs`: exit 0, 35/35;
- `node scripts/verify-paper-export-flow.mjs`: exit 0, 25/25;
- `node scripts/verify-paper-export-payload.mjs`: exit 0, 30/30;
- `node scripts/verify-draft-paper-docx.mjs`: exit 0, 16/16;
- `node scripts/verify-figure-render.mjs`: exit 0, 81/81;
- `node scripts/verify-draft-pagination-renderer.mjs`: exit 0, 25/25;
- `node scripts/verify-draft-pagination-dom-contract.mjs`: exit 0, 32/32;
- `pnpm -C app run build`: exit 0;
- `git diff --check`: exit 0.
- `pnpm -C app run verify:all`: exit 0,
  `PASS 92 / SKIP 1 / FAIL 0`; the sole declared skip was
  `scripts/verify-i16a-teaching-dimension-search.mjs` because its off-repo
  fixture was absent; baseline failures: 0.

The H5-G and focused regressions preserve explicit fonts, legacy handout
bytes, page/keep-next contracts, writing boxes, embedded images, and
non-proof legacy behavior. Owner QA remains deferred until the Phase B
independent review.

## Ordinary review

The Ticket 08 implementation diff was reviewed against
`15c2f98b94b21d0b27bc1b60ed3b3d6ef74b2cfe` on both required axes.
Standards found no hard violation; one non-blocking duplication judgment was
left unchanged to avoid widening the renderer refactor. Spec review found the
missing export-host diagnostic proof, post-package OOXML assertion, final
full verify, and durable result record. All four were added and reverified in
this task. No Must Fix remains.
