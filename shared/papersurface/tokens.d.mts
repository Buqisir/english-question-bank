/**
 * Type declarations for `shared/papersurface/tokens.mjs`.
 *
 * TypeScript resolves `.mjs` imports to `.d.mts` companions in the
 * app's bundler-mode build. Keep this file in sync with `tokens.d.ts`.
 */

export type PaperSurfaceTokens = {
  readonly paperFontStack: string
  readonly paperFontStackEn: string
  readonly paperFontStackZh: string
  readonly paperFontStackHeading: string
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
