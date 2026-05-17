/**
 * Paper Surface — shared primitive style tokens.
 *
 * Issue #21-B1 / Issue #30 Gate 2: A-thin CSS strategy.
 *
 * Strategy:
 *   - Share PRIMITIVE values only (font stacks, colors, line heights,
 *     indents, simple grid descriptors).
 *   - DO NOT share CSS text. Each surface keeps its own CSS file.
 *   - DO NOT share HTML markup, JSX, or any rendering function.
 *   - DO NOT import React, app/, or server/. This file is the floor of
 *     the shared layer — pure ESM, primitives only, no side effects.
 *
 * In B1:
 *   - The React prototype (PaperSurfacePrototype.tsx) imports these
 *     tokens and injects them as CSS custom properties on the surface
 *     root. The companion CSS reads `var(--pi-paper-...)`.
 *   - `server/print-renderer.mjs` is intentionally NOT updated in B1.
 *     It keeps its own inlined CSS, with its own — slightly different —
 *     font stack. The divergence is recorded below as a design note
 *     (see `paperSurfaceServerCurrent`) so B2 can resolve it
 *     deliberately and rerun visual QA.
 *
 * Canonicalization rule:
 *   - Values exported here are the canonical paper-surface values
 *     going forward. The React prototype is the first consumer; the
 *     server print renderer is the next migration target in B2.
 *   - Anything that is genuinely React-only (page width on screen,
 *     active selection rail, sidecar / topbar / spike chrome) MUST
 *     stay in the React CSS file and MUST NOT be added here.
 *
 * Out of scope for this module (B1):
 *   - No `@page` / Vivliostyle / page-break / page-number primitives.
 *     Those belong to a future paged-media layer, not the value layer.
 *   - No CSS strings, no HTML strings, no JSX, no rendering helpers.
 */

export const paperSurfaceTokens = Object.freeze({
  /**
   * Mixed CN/EN serif stack. Western glyphs match Times New Roman
   * first; Chinese glyphs fall back through 宋体 family chain. The
   * order matters — a paragraph that mixes CN and EN must land on
   * the right glyphs.
   */
  paperFontStack:
    '"Times New Roman", Times, "SimSun", "Songti SC", "STSong", serif',
  paperInk: '#111111',
  paperMuted: '#555555',
  paperRule: '#d9d9d9',
  passageLineHeight: 1.85,
  questionLineHeight: 1.7,
  passageIndent: '2em',
  optionsGridColumns: '1fr 1fr',
  optionsGridGapX: '2em',
})

/**
 * Snapshot of what `server/print-renderer.mjs` currently emits as of
 * Issue #21-B1.
 *
 * IMPORTANT: this is a DESIGN NOTE, not a consumable export. The
 * server file is intentionally untouched in B1, so no runtime should
 * import from this constant to drive output. It exists only so that
 * a reviewer (and the verify script) can see, in one place, where the
 * server diverges from the canonical `paperSurfaceTokens` above.
 *
 * Recorded so B2 can:
 *   - decide whether server should adopt `paperSurfaceTokens` directly,
 *   - or keep its own slightly-different stack with the divergence
 *     explicitly re-justified, and
 *   - rerun the print visual QA accordingly.
 */
export const paperSurfaceServerCurrent = Object.freeze({
  fontStack: '"Times New Roman", "SimSun", "Songti SC", serif',
})
