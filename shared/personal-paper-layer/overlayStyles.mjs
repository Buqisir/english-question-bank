/*
 * Versioned static overlay styles for the personal-export compose step
 * (#489 5b): the print-time appearance of note cards, text boxes and
 * appendix markers, plus the personal-text typography. Every value is copied
 * from the app's personalAnnotations.css / personalText.css resting rules —
 * the preview and the PDF must render the same versioned style contract, and
 * verify-personal-paper-view-browser.mjs proves the two surfaces agree
 * positionally. Interactions (selection, editing, dragging) do not exist on
 * paper and are deliberately absent. The per-object font root style
 * (fontFamily/fontSize/lineHeight from personalTextStyle) is applied inline
 * by the composer, not here.
 */
export const PERSONAL_OVERLAY_STYLE_VERSION = 'eqb-personal-overlay-style-v1'

export function personalOverlayCss() {
  return `
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
