/*
 * Personal-font @font-face builder for the personal-export compose step
 * (#489 5a): embeds every registered personal font face as a data URI so the
 * measure/render pages load the exact bytes the registry pins, no website
 * origin needed. Faces are verified against the registry sha before use;
 * a mismatch fails the export rather than measuring a fallback face.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { PERSONAL_FONT_PRESETS } from '../../shared/personal-text/fontRegistry.mjs'

let cached = null

export function personalFontFaceCss() {
  cached ??= buildPersonalFontFaceCss()
  return cached
}

function buildPersonalFontFaceCss() {
  // A face shared by several presets (Xiaolai) is embedded once; the file
  // order is fixed so the css — and with it any digest downstream — is stable.
  const byFile = new Map()
  for (const preset of Object.values(PERSONAL_FONT_PRESETS)) {
    for (const asset of preset.assets) byFile.set(asset.file, asset)
  }
  const faces = [...byFile.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  const css = faces.map((face) => {
    const bytes = readFileSync(new URL(`../../app/public/fonts/personal/${face.file}`, import.meta.url))
    assertPersonalFontAsset(face, bytes)
    return `@font-face { font-family: '${face.family}'; src: url("data:font/ttf;base64,${bytes.toString('base64')}") format('truetype'); font-weight: ${face.weight}; font-style: ${face.style}; }`
  }).join('\n')
  // Same construction as layout.mjs's paperFontIdentity: a stable digest over
  // the registry's face records, not over the megabytes of font bytes.
  const identity = faces.map(({ family, file, weight, style, sha256 }) => ({ family, file, weight, style, sha256 }))
  return { css, digest: `sha256:${createHash('sha256').update(stableStringify(identity)).digest('hex')}` }
}

/** byte-level integrity gate; exported for the contract check to probe directly */
export function assertPersonalFontAsset(asset, bytes) {
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== asset.sha256) {
    const error = new Error(`Personal font asset mismatch: ${asset.file}`)
    error.code = 'PERSONAL_FONT_ASSET_MISMATCH'
    throw error
  }
}
