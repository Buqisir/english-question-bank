export const applicationDrawingAreaPolicy: Readonly<{
  widthRatio: number
  aspectRatio: number
  labelPaddingPx: number
  minimumApplicationHeightMm: number
}>
export const applicationDrawingAreaStyles: Readonly<{
  top: Readonly<{ display: 'grid'; gridTemplateColumns: string; alignItems: 'start'; flexShrink: number }>
  given: Readonly<{ minWidth: number; paddingRight: string; overflowWrap: 'anywhere' }>
  area: Readonly<{ width: string; aspectRatio: string; boxSizing: 'border-box'; padding: string; border: string; textAlign: 'left'; textIndent: number; overflowWrap: 'anywhere' }>
}>
