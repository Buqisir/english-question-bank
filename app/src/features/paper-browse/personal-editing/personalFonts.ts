import { PERSONAL_FONT_ASSET_ROOT } from '../../../../../shared/personal-text/index.mjs'

const STYLESHEET_ID = 'eqb-personal-fonts'

/*
 * @font-face only downloads a face once text actually uses it, so linking the
 * sheet costs nothing until a teacher picks 小赖 or Fuzzy Bubbles.
 */
export function ensurePersonalFontsStylesheet() {
  if (typeof document === 'undefined' || document.getElementById(STYLESHEET_ID)) return
  const link = document.createElement('link')
  link.id = STYLESHEET_ID
  link.rel = 'stylesheet'
  link.href = `${PERSONAL_FONT_ASSET_ROOT}fonts.css`
  document.head.append(link)
}
