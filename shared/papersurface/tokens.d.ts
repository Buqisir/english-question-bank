/**
 * Type declarations for `shared/papersurface/tokens.mjs`.
 *
 * Issue #21-B1: paired with the runtime `.mjs` so TypeScript consumers
 * (the React PaperSurface module today, the server in Chunk B/C of the
 * render-fidelity cut) can import the token shape without bringing in
 * any framework dependency. This file is types-only — DO NOT add value
 * declarations here.
 */

export type PaperSurfaceTokens = {
  readonly paperFontStack: string
  readonly paperFontStackEn: string
  readonly paperFontStackZh: string
  readonly paperFontStackHeading: string
  readonly paperFontStackWritingPart: string
  readonly paperFontFamilyWritingPartEn: string
  readonly paperInk: string
  readonly paperMuted: string
  readonly paperRule: string
  readonly paperFontSizePt: number
  readonly paperFontSizePx: string
  readonly paperLineHeight: number
  readonly passageIndent: string
  readonly optionsGridColumns: string
  readonly optionsGridGapX: string
  readonly paperBlankWidth: string
  readonly pageMarginX: string
  readonly pageMarginTop: string
}

export const paperSurfaceTokens: PaperSurfaceTokens
