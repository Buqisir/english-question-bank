/*
 * Personal-font @font-face builder for the personal-export compose step
 * (#489 5a): embeds the personal font faces the chosen text presets need as
 * data URIs so the measure/render pages load the exact bytes the registry
 * pins, no website origin needed. Faces are verified against the registry
 * sha before use; a mismatch fails the export rather than measuring a
 * fallback face. Preset fallbacks written into cssFamily (Fuzzy Bubbles →
 * Xiaolai) pull their faces in too, so a measured page never renders a
 * system fallback where the preview renders a registered face.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { PERSONAL_FONT_PRESETS } from '../../shared/personal-text/fontRegistry.mjs'

// Registry faces keyed by family, so a cssFamily fallback names its bytes.
const facesByFamily = new Map()
for (const preset of Object.values(PERSONAL_FONT_PRESETS)) {
  for (const asset of preset.assets) {
    if (!facesByFamily.has(asset.family)) facesByFamily.set(asset.family, asset)
  }
}

/**
 * The deduplicated face records a set of presets needs (its own assets plus
 * every registered family named in its cssFamily), sorted by file for a
 * stable css. presetIds omitted → every registered face.
 */
export function personalFontFacesForPresets({ presetIds } = {}) {
  const wanted = presetIds === undefined
    ? Object.values(PERSONAL_FONT_PRESETS)
    : presetIds.map((id) => {
      const preset = PERSONAL_FONT_PRESETS[id]
      if (!preset) {
        const error = new Error(`Unknown personal font preset: ${id}`)
        error.code = 'PERSONAL_FONT_PRESET_UNKNOWN'
        throw error
      }
      return preset
    })
  const byFile = new Map()
  for (const preset of wanted) {
    for (const asset of preset.assets) byFile.set(asset.file, asset)
    for (const family of preset.cssFamily.match(/'([^']+)'/gu) ?? []) {
      const face = facesByFamily.get(family.slice(1, -1))
      if (face) byFile.set(face.file, face)
    }
  }
  return [...byFile.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}

// The digest is over the whole registry (same construction as layout.mjs's
// paperFontIdentity): it identifies the registry version, not which faces a
// particular export happens to embed.
const registryIdentity = Object.freeze(
  [...facesByFamily.values()]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map(({ family, file, weight, style, sha256 }) => ({ family, file, weight, style, sha256 })),
)
const registryDigest = `sha256:${createHash('sha256').update(stableStringify(registryIdentity)).digest('hex')}`

// The cache key for a rendered personal export digests this so a registry
// change invalidates every cached file without re-rendering probes.
export const PERSONAL_FONT_REGISTRY_DIGEST = registryDigest

const cache = new Map()

export function personalFontFaceCss({ presetIds } = {}) {
  const key = presetIds === undefined ? 'all' : [...presetIds].sort().join('|')
  const cached = cache.get(key)
  if (cached) return cached
  const faces = personalFontFacesForPresets({ presetIds })
  const css = faces.map((face) => {
    const bytes = readFileSync(new URL(`../../app/public/fonts/personal/${face.file}`, import.meta.url))
    assertPersonalFontAsset(face, bytes)
    return `@font-face { font-family: '${face.family}'; src: url("data:font/ttf;base64,${bytes.toString('base64')}") format('truetype'); font-weight: ${face.weight}; font-style: ${face.style}; }`
  }).join('\n')
  const result = { css, digest: registryDigest, faces: faces.map(({ family, weight }) => ({ family, weight })) }
  cache.set(key, result)
  return result
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

// ---- URL delivery (page.route) ----------------------------------------------
//
// Xiaolai's ~22MB TTF does not survive as a data URI: paged.js re-serializes
// every stylesheet it paginates and mangles the huge URI (the face then fails
// with a network error at compose time), and a ~30MB style tag is slow to
// boot anyway. The export pages therefore point the faces at a reserved fake
// origin and serve the vendored bytes through a page.route handler instead;
// the sha check runs on every served request.

export const PERSONAL_FONT_URL_PREFIX = '/eqb-personal-fonts/'
const PERSONAL_FONT_URL_BASE = `https://personal-fonts.eqb.internal${PERSONAL_FONT_URL_PREFIX}`

// Keyed by sha (not by family — a family can carry several weights) so the
// route serves every registered face.
const facesBySha = new Map(Object.values(PERSONAL_FONT_PRESETS)
  .flatMap((preset) => preset.assets)
  .map((asset) => [asset.sha256, asset]))
const fontBytesByFile = new Map()

function personalFontAssetBytes(face) {
  let bytes = fontBytesByFile.get(face.file)
  if (!bytes) {
    bytes = readFileSync(new URL(`../../app/public/fonts/personal/${face.file}`, import.meta.url))
    assertPersonalFontAsset(face, bytes)
    fontBytesByFile.set(face.file, bytes)
  }
  return bytes
}

export function personalFontFaceUrlCss({ presetIds } = {}) {
  const faces = personalFontFacesForPresets({ presetIds })
  const css = faces.map((face) => (
    `@font-face { font-family: '${face.family}'; src: url("${PERSONAL_FONT_URL_BASE}${face.sha256}/${encodeURIComponent(face.file)}") format('truetype'); font-weight: ${face.weight}; font-style: ${face.style}; }`
  )).join('\n')
  return { css, digest: registryDigest, faces: faces.map(({ family, weight }) => ({ family, weight })) }
}

/*
 * Installs the personal-font route on a render page. Used directly by the
 * measure pass's own page and, through renderPaginatedPaper's prepare hook,
 * by the compose pass's render page. Only exact sha-named vendored files are
 * served — a compromised page can fetch nothing else through it.
 */
export async function installPersonalFontRoute(page) {
  await page.route(
    (url) => url.pathname.startsWith(PERSONAL_FONT_URL_PREFIX),
    async (route) => {
      const match = new URL(route.request().url()).pathname
        .match(/^\/eqb-personal-fonts\/([0-9a-f]{64})\/(.+)$/u)
      const face = match ? facesBySha.get(match[1]) : null
      if (face && face.file === decodeURIComponent(match[2])) {
        await route.fulfill({ status: 200, contentType: 'font/ttf', body: personalFontAssetBytes(face) })
        return
      }
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'personal font not found' })
    },
  )
}
