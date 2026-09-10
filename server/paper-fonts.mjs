import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { paperFontFaces } from '../shared/papersurface/paperFonts.mjs'

let css
// Standalone print HTML cannot depend on a website origin or installed fonts.
export function embeddedPaperFontCss() {
  css ??= paperFontFaces.map(({ family, style, weight, path, sha256 }) => {
    const bytes = readFileSync(new URL(`../app/public/fonts/paper/${path}`, import.meta.url))
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
      throw new Error(`Paper font integrity mismatch: ${path}`)
    }
    return `@font-face { font-family: '${family}'; font-style: ${style}; font-weight: ${weight}; src: url("data:font/otf;base64,${bytes.toString('base64')}") format('opentype'); }`
  }).join('\n')
  return css
}
