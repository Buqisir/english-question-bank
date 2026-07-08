/**
 * Paper Surface — shared primitive style tokens.
 *
 * Issue #21-B1 / Issue #30 Gate 2: A-thin CSS strategy.
 * 刀⑤ render-fidelity Chunk A: typography primitives brought in line with
 * `docs/product/exam-paper-format-standards.md` v2 (owner 2026-07-08 终审).
 *
 * Strategy:
 *   - Share PRIMITIVE values only (font stacks, colors, line heights,
 *     indents, simple grid descriptors).
 *   - DO NOT share CSS text. Each surface keeps its own CSS file.
 *   - DO NOT share HTML markup, JSX, or any rendering function.
 *   - DO NOT import React, app/, or server/. This file is the floor of
 *     the shared layer — pure ESM, primitives only, no side effects.
 *
 * Consumers (刀⑤ Chunk A):
 *   - `app/src/shared-ui/papersurface/PaperSurface.tsx` injects these as
 *     CSS custom properties on the surface root; `PaperSurface.css` reads
 *     `var(--ps-...)`.
 *   - `app/src/features/paper-intelligence/WritingPaperPage.tsx` injects
 *     the same tokens on its own root (it wraps PaperSurface as a child,
 *     so it cannot read PaperSurface's own custom properties — CSS custom
 *     properties inherit down the tree, not up); `writingPaperPage.css`
 *     reads the same `var(--ps-...)` names.
 *   - `server/print-renderer.mjs` / `server/exports/docxRenderer.mjs` are
 *     future consumers (Chunk B / C of the render-fidelity cut) — not yet
 *     wired in Chunk A.
 *
 * Canonicalization rule:
 *   - Values exported here are the canonical paper-surface values for all
 *     four render faces (screen PaperSurface, writing page, PDF export,
 *     DOCX export). Screen is the first consumer; server adoption lands
 *     in Chunk B/C of the render-fidelity cut.
 *   - Anything that is genuinely React-only (page width on screen, active
 *     selection rail, sidecar / topbar / spike chrome) MUST stay in the
 *     React CSS file and MUST NOT be added here.
 *
 * Out of scope for this module (Chunk A):
 *   - No `@page` / Vivliostyle / page-break / page-number primitives.
 *     Those belong to the paged-media layer server-side (Chunk B).
 *   - No CSS strings, no HTML strings, no JSX, no rendering helpers.
 */

export const paperSurfaceTokens = Object.freeze({
  /**
   * Mixed CN/EN serif stack. Western glyphs match Times New Roman
   * first; Chinese glyphs fall back through 宋体 family chain. The
   * order matters — a paragraph that mixes CN and EN must land on
   * the right glyphs. Used for body text (passage / stem / options)
   * where EN and ZH interleave inline.
   */
  paperFontStack:
    '"Times New Roman", Times, "SimSun", "Songti SC", "STSong", serif',
  /**
   * English-only stack (standard §2) — for consumers that render a
   * pure-EN run (e.g. a DOCX rFonts ascii/hAnsi face) and need the
   * Times New Roman family without the CN fallback chain attached.
   */
  paperFontStackEn: '"Times New Roman", Times, serif',
  /**
   * Chinese body stack (standard §2, 书宋/方正书宋/华文宋体族) — for
   * consumers that render a pure-ZH run (e.g. a DOCX rFonts eastAsia
   * face) separately from the EN stack.
   */
  paperFontStackZh: '"SimSun", "Songti SC", "STSong", serif',
  /**
   * Heading stack (standard §2, 部标题「第X部分…」中黑加粗) — bold
   * black-style sans face for part headings. NOT used for 节标题
   * (which stays 书宋 per standard §4).
   */
  paperFontStackHeading: '"SimHei", "Heiti SC", "STHeiti", sans-serif',
  paperInk: '#111111',
  paperMuted: '#555555',
  paperRule: '#d9d9d9',
  /**
   * Standard §2: English/Chinese body 10.5pt (五号). Documented in pt
   * for the print/DOCX consumers (Chunk B/C); px is the screen value
   * at A4 = 794px @ 96dpi (10.5pt ≈ 14px).
   */
  paperFontSizePt: 10.5,
  paperFontSizePx: '14px',
  /**
   * Standard §3: line-height is a FIXED 18pt baseline (not proportional
   * page-fill), which at 10.5pt body text is 18 / 10.5 ≈ 1.714. This
   * single value replaces the former `passageLineHeight` (1.85) /
   * `questionLineHeight` (1.7) split — the standard does not
   * distinguish passage vs. question line-height.
   */
  paperLineHeight: 1.714,
  passageIndent: '2em',
  optionsGridColumns: '1fr 1fr',
  optionsGridGapX: '2em',
  /**
   * 七选五 blank line width standard.
   *
   * Calibrated from the reviewed 2024 九省联考 sample: original blank
   * line / body width ≈ 78px / 740px ≈ 10.5%. PaperSurface's A4
   * body width is 794px - 56px * 2 = 682px, so the reusable target is
   * 682px * 10.5% ≈ 72px.
   */
  paperBlankWidth: '72px',
  /**
   * Standard §1: left/right page margin, 24mm. At A4 = 794px @ 96dpi
   * (794px / 210mm ≈ 3.781px/mm), 24mm ≈ 91px.
   */
  pageMarginX: '91px',
  /**
   * Standard §1: top margin (to first-line top), ≈21mm ≈ 79px at the
   * same 794px/210mm scale. The standard does not mandate a distinct
   * screen bottom margin (the 17.5mm footer distance is a print-page
   * concept — Chunk B); screen surfaces apply this value symmetrically
   * top/bottom.
   */
  pageMarginTop: '79px',
})
