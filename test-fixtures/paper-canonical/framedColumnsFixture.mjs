import { makeReadyCanonicalFixture } from './foundationFixture.mjs'

function textInline(nodeId, text) {
  return { kind: 'text', nodeId, text }
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

export function makeFramedColumnsReadingBlocks() {
  return [
    paragraph(
      'paragraph:framed-columns:intro',
      'text:framed-columns:intro',
      'IOL beginner sample.',
    ),
    {
      kind: 'framed_columns',
      nodeId: 'framed-columns:puzzle-solution',
      columnCount: 2,
      columns: [
        {
          columnId: 'column:puzzle',
          columnHeading: 'paragraph:puzzle-heading',
          blocks: [
            paragraph('paragraph:puzzle-heading', 'text:puzzle-heading', 'A Puzzle'),
            paragraph(
              'paragraph:puzzle-prompt',
              'text:puzzle-prompt',
              'Match the Georgian country names.',
            ),
            {
              kind: 'table',
              nodeId: 'table:country-map',
              columnCount: 2,
              rows: [
                {
                  rowId: 'row:country-1',
                  cells: [
                    tableCell('cell:country-1-ka', 0, 'text:country-1-ka', 'ბრაზილია'),
                    tableCell('cell:country-1-en', 1, 'text:country-1-en', 'Brazil'),
                  ],
                },
                {
                  rowId: 'row:country-2',
                  cells: [
                    tableCell('cell:country-2-ka', 0, 'text:country-2-ka', 'პერუ'),
                    tableCell('cell:country-2-en', 1, 'text:country-2-en', 'Peru'),
                  ],
                },
                {
                  rowId: 'row:country-3',
                  cells: [
                    tableCell('cell:country-3-ka', 0, 'text:country-3-ka', 'ურუგვაი'),
                    tableCell('cell:country-3-en', 1, 'text:country-3-en', 'Uruguay'),
                  ],
                },
              ],
            },
          ],
        },
        {
          columnId: 'column:solution',
          columnHeading: 'paragraph:solution-heading',
          blocks: [
            paragraph(
              'paragraph:solution-heading',
              'text:solution-heading',
              'The Solution',
            ),
            paragraph('paragraph:solution-1', 'text:solution-1', 'რ → R'),
            paragraph('paragraph:solution-2', 'text:solution-2', 'ა → A'),
          ],
        },
      ],
    },
  ]
}

export function encodeCanonicalFixtureSource(source) {
  const next = structuredClone(source)
  for (let pass = 0; pass < 3; pass += 1) {
    const byteLength = new TextEncoder().encode(JSON.stringify(next)).byteLength
    for (const observation of next.observations || []) {
      if (observation?.span && Number.isInteger(observation.span.start)) {
        observation.span.end = byteLength
      }
    }
  }
  const bytes = new TextEncoder().encode(JSON.stringify(next))
  return { source: next, bytes }
}

export function bindCanonicalFixtureRequest(fixture, source) {
  const encoded = encodeCanonicalFixtureSource(source)
  fixture.source = encoded.source
  fixture.request.evidence.documents[0].bytes = encoded.bytes
  fixture.sourceAsset = encoded.bytes
  return fixture
}

export function makeFramedColumnsCanonicalFixture() {
  const fixture = makeReadyCanonicalFixture()
  const group = fixture.source.groups.find((item) => item.slotId === 'reading.a')
  group.content = { blocks: makeFramedColumnsReadingBlocks() }
  return bindCanonicalFixtureRequest(fixture, fixture.source)
}
