/*
 * Versioned static overlay styles for the personal-export compose step
 * (#489 5b/5c): the print-time appearance of marks, note cards, text boxes
 * and appendix markers, plus the personal-text typography. Every value is
 * copied from the app's personalAnnotations.css / personalText.css resting
 * rules — the preview and the PDF must render the same versioned style
 * contract, and verify-personal-paper-view-browser.mjs proves the two
 * surfaces agree positionally. Interactions (selection, editing, dragging)
 * do not exist on paper and are deliberately absent. The per-object font
 * root style (fontFamily/fontSize/lineHeight from personalTextStyle) is
 * applied inline by the composer, not here.
 */
export const PERSONAL_OVERLAY_STYLE_VERSION = 'eqb-personal-overlay-style-v1'

export function personalOverlayCss() {
  return `
.eqb-personal-overlay-mark {
  border-radius: 0;
}

/* 印刷下划线比阅读视图的 2px 收窄到 1.5px（personalAnnotations.css 纸张视图同规）。
 * Explicit-Cascade: underline 颜色只由 [data-ink] 决定，线宽统一 1.5px。 */
.eqb-personal-overlay-mark--underline[data-ink='ink'] { border-bottom: 1.5px solid #1f1f1d; }
.eqb-personal-overlay-mark--underline[data-ink='red'] { border-bottom: 1.5px solid #c0392b; }

.eqb-personal-overlay-mark--highlight {
  mix-blend-mode: multiply;
}

.eqb-personal-overlay-mark--highlight[data-color='yellow'] { background: #f9e08a; }
.eqb-personal-overlay-mark--highlight[data-color='green'] { background: #c9e7b8; }
.eqb-personal-overlay-mark--highlight[data-color='blue'] { background: #bcd9f2; }
.eqb-personal-overlay-mark--highlight[data-color='pink'] { background: #f2c3d6; }

.eqb-personal-overlay-note-card {
  box-sizing: border-box;
  padding: 2mm 3mm;
  /* 旁注是纸上的笔迹而非浮起的控件：无阴影，只一层暖墨淡底 + 暖纸发丝边。 */
  border: 1px solid #e6e2d7;
  border-radius: 4px;
  background: linear-gradient(rgba(74, 68, 56, 0.035), rgba(74, 68, 56, 0.035)), #fff;
}

.eqb-personal-overlay-note-card--margin {
  padding: 1.5mm 2mm;
}

.eqb-personal-overlay-text-box {
  box-sizing: border-box;
  /* 文字框可透明覆盖原题：静止态无底无边，只保留圆角。 */
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.eqb-personal-overlay-appendix-marker {
  font-family: 'EQB Termes', 'EQB Source Han Serif', serif;
  font-size: 11px;
  line-height: 16px;
  padding: 0 4px;
  color: #2c2820;
  background: #fff;
  border: 1px solid #e6e2d7;
  border-radius: 4px;
  white-space: nowrap;
}

.eqb-personal-overlay-appendix-marker.is-centered {
  transform: translateX(-50%);
}

.eqb-personal-text {
  color: #191D18;
  overflow-wrap: anywhere;
}

.eqb-personal-text p,
.eqb-personal-text blockquote,
.eqb-personal-text ul,
.eqb-personal-text ol {
  margin: 0;
}

.eqb-personal-text ul,
.eqb-personal-text ol {
  padding-left: 1.4em;
}

.eqb-personal-text blockquote {
  padding-left: 0.8em;
  border-left: 1px solid #D5DACF;
  color: #60665C;
}
`.trim()
}
