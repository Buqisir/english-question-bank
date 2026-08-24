import { canonicalizeVisibleEnglishTypography } from './visibleTypography.mjs'

// Explicit format-② derivation for paper-mock-sz-2026-m1 Reading A.
// Next similar Word hairline pair: write the same Canonical framed_columns
// shape (nck1 §8 / spec「下一卷怎么干」). Do not change PaperSurface or
// print-renderer; look is exam-paper-format-standards.md §3c.

export const SZ_2026_M1_READING_A_PUZZLE_FIGURE_ID =
  'fig-paper-mock-sz-2026-m1-reading-a-puzzle-1'
export const SZ_2026_M1_READING_A_PUZZLE_MARKER =
  `[图: ${SZ_2026_M1_READING_A_PUZZLE_FIGURE_ID}]`

function inlineText(inlines) {
  return (inlines || []).map((inline) => inline?.text || '').join('')
}

function textInline(nodeId, text) {
  return {
    kind: 'text',
    nodeId,
    text: canonicalizeVisibleEnglishTypography(text),
  }
}

function paragraph(nodeId, textNodeId, text) {
  return {
    kind: 'paragraph',
    nodeId,
    inlines: [textInline(textNodeId, text)],
  }
}

function tableCell(cellId, columnStart, textNodeId, text) {
  return {
    cellId,
    columnStart,
    columnSpan: 1,
    rowSpan: 1,
    role: 'data',
    inlines: [textInline(textNodeId, text)],
  }
}

export function isSz2026M1ReadingAPuzzleMarker(text) {
  return String(text || '').trim() === SZ_2026_M1_READING_A_PUZZLE_MARKER
}

export function isSz2026M1ReadingAPuzzleFigureId(figureId) {
  return String(figureId || '').replace(/^media:/, '') === SZ_2026_M1_READING_A_PUZZLE_FIGURE_ID
}

export function framedColumnsContentSignature(block) {
  return {
    kind: 'framed_columns',
    columnCount: block?.columnCount,
    columns: (block?.columns || []).map((column) => ({
      columnHeading: column.columnHeading || null,
      blocks: (column.blocks || []).map((child) => {
        if (child?.kind === 'table') {
          return {
            kind: 'table',
            rows: (child.rows || []).map((row) =>
              (row.cells || []).map((cell) => inlineText(cell.inlines))),
          }
        }
        return {
          kind: child?.kind,
          text: inlineText(child?.inlines),
        }
      }),
    })),
  }
}

/**
 * Format ② writes this Reading A Puzzle | Solution as typed two-column
 * body. It is not recovered from PDF text boxes.
 */
export function makeSz2026M1ReadingAFramedColumns() {
  const puzzleHeading = paragraph(
    'paragraph:sz-2026-m1-reading-a-puzzle-heading',
    'text:sz-2026-m1-reading-a-puzzle-heading',
    'A Puzzle',
  )
  const solutionHeading = paragraph(
    'paragraph:sz-2026-m1-reading-a-solution-heading',
    'text:sz-2026-m1-reading-a-solution-heading',
    'The Solution',
  )
  return {
    kind: 'framed_columns',
    nodeId: 'framed-columns:sz-2026-m1-reading-a-puzzle-solution',
    columnCount: 2,
    columns: [
      {
        columnId: 'column:sz-2026-m1-reading-a-puzzle',
        columnHeading: puzzleHeading.nodeId,
        blocks: [
          puzzleHeading,
          paragraph(
            'paragraph:sz-2026-m1-reading-a-puzzle-prompt',
            'text:sz-2026-m1-reading-a-puzzle-prompt',
            'The names of some South American countries are written in Georgian（格鲁吉亚语） with their English translations:',
          ),
          {
            kind: 'table',
            nodeId: 'table:sz-2026-m1-reading-a-country-map',
            columnCount: 2,
            rows: [
              {
                rowId: 'row:sz-2026-m1-reading-a-country-1',
                cells: [
                  tableCell(
                    'cell:sz-2026-m1-reading-a-country-1-ka',
                    0,
                    'text:sz-2026-m1-reading-a-country-1-ka',
                    'ბრაზილია',
                  ),
                  tableCell(
                    'cell:sz-2026-m1-reading-a-country-1-en',
                    1,
                    'text:sz-2026-m1-reading-a-country-1-en',
                    'Brazil',
                  ),
                ],
              },
              {
                rowId: 'row:sz-2026-m1-reading-a-country-2',
                cells: [
                  tableCell(
                    'cell:sz-2026-m1-reading-a-country-2-ka',
                    0,
                    'text:sz-2026-m1-reading-a-country-2-ka',
                    'პერუ',
                  ),
                  tableCell(
                    'cell:sz-2026-m1-reading-a-country-2-en',
                    1,
                    'text:sz-2026-m1-reading-a-country-2-en',
                    'Peru',
                  ),
                ],
              },
              {
                rowId: 'row:sz-2026-m1-reading-a-country-3',
                cells: [
                  tableCell(
                    'cell:sz-2026-m1-reading-a-country-3-ka',
                    0,
                    'text:sz-2026-m1-reading-a-country-3-ka',
                    'ურუგვაი',
                  ),
                  tableCell(
                    'cell:sz-2026-m1-reading-a-country-3-en',
                    1,
                    'text:sz-2026-m1-reading-a-country-3-en',
                    'Uruguay',
                  ),
                ],
              },
            ],
          },
          paragraph(
            'paragraph:sz-2026-m1-reading-a-puzzle-question',
            'text:sz-2026-m1-reading-a-puzzle-question',
            'Q: What is the English name of this country “ არგენტინა ”?',
          ),
        ],
      },
      {
        columnId: 'column:sz-2026-m1-reading-a-solution',
        columnHeading: solutionHeading.nodeId,
        blocks: [
          solutionHeading,
          paragraph(
            'paragraph:sz-2026-m1-reading-a-solution-1',
            'text:sz-2026-m1-reading-a-solution-1',
            '● The Georgian forms of “Peru” and “Uruguay” have the same number of letters as their English names, showing a direct letter match.',
          ),
          paragraph(
            'paragraph:sz-2026-m1-reading-a-solution-2',
            'text:sz-2026-m1-reading-a-solution-2',
            '● The repeated U in “Uruguay”further confirms Georgian is written left-to-right.',
          ),
          paragraph(
            'paragraph:sz-2026-m1-reading-a-solution-3',
            'text:sz-2026-m1-reading-a-solution-3',
            '● “Brazil” has fewer letters than the Georgian version, but thanks to the two other names, we already know: რ→R, ა→A, გ→G, ე→E.',
          ),
          paragraph(
            'paragraph:sz-2026-m1-reading-a-solution-4',
            'text:sz-2026-m1-reading-a-solution-4',
            '● With these letters, the pattern არგენტინა can be translated as “A R G E _ _ _ _ A,” which is “Argentina.”',
          ),
        ],
      },
    ],
  }
}
