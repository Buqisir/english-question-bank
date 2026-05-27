/**
 * Type declarations for `shared/papersurface/tokens.mjs`.
 *
 * TypeScript resolves `.mjs` imports to `.d.mts` companions in the
 * app's bundler-mode build. Keep this file in sync with `tokens.d.ts`.
 */

export type PaperSurfaceTokens = {
  readonly paperFontStack: string
  readonly paperInk: string
  readonly paperMuted: string
  readonly paperRule: string
  readonly passageLineHeight: number
  readonly questionLineHeight: number
  readonly passageIndent: string
  readonly optionsGridColumns: string
  readonly optionsGridGapX: string
  readonly sevenChoiceBlankWidth: string
}

export const paperSurfaceTokens: PaperSurfaceTokens

/**
 * Design-note snapshot of the server print renderer's current font
 * stack. NOT for runtime consumption.
 */
export type PaperSurfaceServerCurrent = {
  readonly fontStack: string
}

export const paperSurfaceServerCurrent: PaperSurfaceServerCurrent
