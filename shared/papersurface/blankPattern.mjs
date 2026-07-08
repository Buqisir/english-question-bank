/**
 * Paper Surface -- shared blank-marker pattern (I10 / render-fidelity
 * Chunk B).
 *
 * This is the SINGLE source of truth for the "paper blank" marker regex
 * used to detect and style cloze (__41__), 七选五 (_____36_____), and
 * grammar-fill (__56__, or the legacy 2-space "  56  " variant) blank
 * markers in passage text.
 *
 * History: this literal previously lived ONLY as a local const inside
 * app/src/shared-ui/papersurface/PaperSurface.tsx. render-fidelity Chunk B
 * moves it here so server/print-renderer.mjs (a plain Node ESM script --
 * it cannot import a .tsx file) can reuse the EXACT same pattern instead
 * of re-deriving or copy-pasting a second literal server-side (PA F2 --
 * the server pattern MUST be paperBlankPattern, not I15's
 * grammarFillBlankPattern, because stored paper-asset grammar-fill
 * blanks use the __NN__ form, not NN._____).
 *
 * PaperSurface.tsx now imports this module instead of declaring its own
 * copy -- the "const paperBlankPattern = ..." literal here is the ONLY
 * place the regex body is written out.
 *
 * Rules for this module (same posture as tokens.mjs / anchorKeys.mjs):
 *   - Pure ESM, no React, no app/, no server/ imports.
 *   - paperBlankPattern carries the g flag and INTERNAL match state
 *     (lastIndex) -- every consumer MUST reset lastIndex = 0 before a
 *     fresh test/exec pass over new text, exactly as the historical
 *     PaperSurface.tsx callers already do.
 */

export const paperBlankPattern = /(?:_{2,}|[\u0020\u00A0]{2,})\s*(\d{1,3})\s*(?:_{2,}|[\u0020\u00A0]{2,})/g
