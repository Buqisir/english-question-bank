// Physical point geometry shared by Screen and Print/PDF. Source pixels are
// contained, never cropped or stretched; the four option identities stay ordered.
export const readingFigureOptionStyles = Object.freeze({
  bank: Object.freeze({
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(48pt, 1fr))',
    maxWidth: '438.2pt',
    margin: '4.5pt 0 9pt 17.3pt',
    padding: 0,
    listStyle: 'none',
    gap: 0,
    overflowX: 'auto',
  }),
  option: Object.freeze({ display: 'flex', flexDirection: 'column', gap: '4.5pt', minWidth: 0 }),
  image: Object.freeze({ width: '96pt', maxWidth: '100%', height: '60pt', objectFit: 'contain', objectPosition: 'center' }),
})

export function measuredReadingFigureStyles(intent) {
  return {
    bank: {
      position: 'relative', width: `${intent.rowWidthPt}pt`, height: `${intent.bankHeightPt}pt`,
      margin: `${intent.stemToBankGapPt}pt 0 ${intent.questionTailGapPt}pt ${intent.rowStartPt}pt`,
      padding: 0, listStyle: 'none',
    },
    options: intent.placements.map((placement) => ({
      label: {
        position: 'absolute', left: `${placement.labelLeftPt}pt`, top: `${placement.labelTopPt}pt`,
        fontSize: `${intent.labelFontSizePt}pt`, lineHeight: `${intent.labelLineHeightPt}pt`,
      },
      image: {
        position: 'absolute', left: `${placement.imageLeftPt}pt`, top: `${placement.imageTopPt}pt`,
        width: `${placement.imageWidthPt}pt`, height: `${placement.imageHeightPt}pt`,
        // The source's own X/Y scale is authoritative; no consumer re-trimming.
        objectFit: 'fill', maxWidth: 'none',
      },
    })),
  }
}
