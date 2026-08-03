# Ticket 07 Print HTML evidence

Status: PASS
Date: 2026-07-25
Implementation base: `bd5b77953434a27944a8545de68f6a5c5cd01707`

## Public seam

- `node scripts/verify-paper-normalization-print-html.mjs` exited 0.
- Real `paper-2026-i` cloze/grammarFill and
  `paper-960d0f8d` grammarFill consumed complete canonical groups through
  `buildPrintHtml`; no proof raw marker or numeric-only stem was rendered.
- Valid sidecars were consumed; stale and invalid sidecars were rejected as a
  whole. Approved proof compatibility remained canonical, while
  `needs_review`, missing non-proof artifacts, and mismatched print input used
  one explicit legacy fallback with a structured diagnostic.
- Student/teacher output, block order, q41–65 continuous numbering,
  page-break placement, canonical options/prose/hints, and shared 3.3em/4.6em
  blank ruling passed.

## Browser visual

The generated student HTML was opened in headed Chromium from a loopback-only
static server. The snapshot contained all three proof groups and 35 semantic
blanks: q41–55 in `paper-2026-i` cloze, q56–65 in its grammarFill, and
continuous print numbers q66–75 in `paper-960d0f8d` grammarFill. No raw marker
or duplicate question row was present.

Computed facts:

- 35 `.print-blank` elements and 35 `.print-blank-unit` elements;
- one shared blank style:
  `46.1953px` at 14px text (3.3em), `inline-block`, `nowrap`,
  `0.5px solid`, centered;
- every hint was immediately after its blank inside the same nowrap unit;
- no answer was visible in the student HTML.

The only browser console error was the temporary server's missing
`favicon.ico`; there was no page runtime warning or error.

## Vivliostyle A4

Vivliostyle CLI 9.9.0 / core 2.37.0 generated
`output/playwright/ticket-07/ticket-07-proof-student.pdf`.

- exit: 0;
- page size: A4 (`595.276 x 841.89 pts`);
- page count: 3;
- PDF SHA-256:
  `0b1db18826447f7752c0c734ace403d8ee30e3fb636645dacd185a1fb380a2ec`;
- `paper-2026-i` cloze group span: page 1 only;
- `paper-2026-i` grammarFill group span: page 2 only;
- `paper-960d0f8d` grammarFill group span: page 3 only.

All three rendered page PNGs were visually inspected. Blanks had one thin line,
centered numbers without suffixes, hints immediately after the line, no raw
labels, no `41. 41`, and no clipped or overlapping content.

## Regression and full verify

- `node scripts/verify-print-renderer.mjs`: exit 0, 92/92;
- `node scripts/verify-print-pdf-export-flow.mjs`: exit 0, 37/37;
- `node scripts/verify-draft-pagination-renderer.mjs`: exit 0, 25/25;
- `node scripts/verify-draft-pagination-dom-contract.mjs`: exit 0, 32/32;
- `pnpm -C app run build`: exit 0;
- `git diff --check`: exit 0;
- final `pnpm -C app run verify:all`: exit 0,
  `PASS 91 / SKIP 1 / FAIL 0`.

The declared skip was
`scripts/verify-i16a-teaching-dimension-search.mjs` because its off-repository
fixture was absent. Baseline failures: 0. The first full run exposed the old
C7 Phase A forbidden-scope allowlist rejecting the Ticket 07-authorized
`server/print-renderer.mjs`; the guard was narrowed to that exact approved
Phase B file, its focused check passed 43/43, and the final full run was green.

The HTML/PDF/PNG/browser screenshot artifacts are gitignored visual evidence
under `output/playwright/ticket-07/`; this tracked record preserves the
reproducible facts. Owner QA remains deferred until the Phase B independent
review after Tickets 07–08.
