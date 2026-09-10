/**
 * Paper Surface — shared primitive style tokens.
 *
 * Issue #21-B1 / Issue #30 Gate 2: A-thin CSS strategy.
 * 刀⑤ render-fidelity Chunk A: typography primitives brought in line with
 * `docs/product/exam-paper-format-standards.md` v2 (owner 2026-07-08 终审).
 *
 * Strategy for this token module:
 *   - Share PRIMITIVE values only (font stacks, colors, line heights,
 *     indents, simple grid descriptors).
 *   - Reading layout rules are shared separately in `readingLayout.css`.
 *     Consumers keep only their physical calibration and surface behavior.
 *   - This module does not contain HTML markup, JSX, or rendering functions.
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
 *   - `server/print-renderer.mjs` consumes the same primitives for the
 *     Print/PDF face.
 *
 * Canonicalization rule:
 *   - Values exported here are the canonical paper-surface values for the
 *     live Screen and Print/PDF faces.
 *   - Anything that is genuinely React-only (page width on screen, active
 *     selection rail, sidecar / topbar / spike chrome) MUST stay in the
 *     React CSS file and MUST NOT be added here.
 *
 * Out of scope for this module (Chunk A):
 *   - No `@page` / Vivliostyle / page-break / page-number primitives.
 *     Those belong to the paged-media layer server-side (Chunk B).
 *   - No CSS strings, no HTML strings, no JSX, no rendering helpers.
 */

import { paperFontStack } from './paperFonts.mjs'

export const paperSurfaceTokens = Object.freeze({
  // Every paper role uses the same pinned pair, including heading numbers.
  // Keep the role tokens so size/weight and surface contracts stay unchanged.
  paperFontStack,
  paperFontStackEn: paperFontStack,
  paperFontStackZh: paperFontStack,
  paperFontStackHeading: paperFontStack,
  paperFontStackWritingPart: paperFontStack,
  paperFontFamilyWritingPartEn: 'EQB Termes',
  paperInk: '#111111',
  paperMuted: '#555555',
  paperRule: '#d9d9d9',
  /**
   * Standard §2: English/Chinese body 10.5pt (五号). Documented in pt
   * for the Print/PDF consumer; px is the screen value
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
   * Legacy marker-consumer token for the shared 七选五 4.6em blank ruling.
   * Canonical cloze and grammar-fill nodes select their 3.3em ruling
   * directly from `blankRuling.mjs`.
   */
  paperBlankWidth: '4.6em',
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
