/**
 * Type declarations for `shared/papersurface/tokens.mjs`.
 *
 * Issue #21-B1: paired with the runtime `.mjs` so TypeScript consumers
 * (the React prototype today, the server in a future cut) can import
 * the token shape without bringing in any framework dependency. This
 * file is types-only — DO NOT add value declarations here.
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
}

export const paperSurfaceTokens: PaperSurfaceTokens

/**
 * Design-note snapshot of the server print renderer's current font
 * stack. NOT for runtime consumption — see the `.mjs` for the full
 * caveat.
 */
export type PaperSurfaceServerCurrent = {
  readonly fontStack: string
}

export const paperSurfaceServerCurrent: PaperSurfaceServerCurrent
