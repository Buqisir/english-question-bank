export const PERSONAL_FONT_REGISTRY_VERSION = 'eqb-personal-fonts-v1'
export const PERSONAL_TEXT_STYLE_VERSION = 'eqb-personal-text-style-v1'

export const SUPPORTED_FONT_REGISTRY_VERSIONS = Object.freeze([PERSONAL_FONT_REGISTRY_VERSION])
export const SUPPORTED_STYLE_VERSIONS = Object.freeze([PERSONAL_TEXT_STYLE_VERSION])

const CJK_FALLBACK = "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', sans-serif"

// Paths are relative to app/public/fonts/personal/; see its README for provenance.
export const PERSONAL_FONT_ASSET_ROOT = '/fonts/personal/'

function asset(family, file, weight, sha256, bytes, source) {
  return Object.freeze({ family, file, weight, style: 'normal', sha256, bytes, source, license: 'OFL-1.1' })
}

const XIAOLAI_SC_REGULAR = asset(
  'EQB Xiaolai SC',
  'xiaolai/XiaolaiSC-Regular.ttf',
  400,
  '65e0c689eb0aff0782cc5a2adba97127bf2843fc302bfbc92e3cdf21ed20207f',
  22_183_944,
  'https://github.com/lxgw/kose-font/releases/download/v3.120/XiaolaiSC-Regular.ttf',
)
const FUZZY_BUBBLES_REGULAR = asset(
  'EQB Fuzzy Bubbles',
  'fuzzy-bubbles/FuzzyBubbles-Regular.ttf',
  400,
  '407829f1e0b6b73a9482ffdfd22702bb149a020fad33f95eb30bc98bf9d471d5',
  148_532,
  'https://github.com/google/fonts/blob/a60a77e14f28abd4ef243a1b5dfc48df0cec5205/ofl/fuzzybubbles/FuzzyBubbles-Regular.ttf',
)
const FUZZY_BUBBLES_BOLD = asset(
  'EQB Fuzzy Bubbles',
  'fuzzy-bubbles/FuzzyBubbles-Bold.ttf',
  700,
  'f18fa58c66cf2540800f10ae4c9ae315c89149c41ace2a394c5efca7354c4ea8',
  140_308,
  'https://github.com/google/fonts/blob/a60a77e14f28abd4ef243a1b5dfc48df0cec5205/ofl/fuzzybubbles/FuzzyBubbles-Bold.ttf',
)

/*
 * Exact-layout preview/export must load and verify every asset of the chosen
 * preset before measuring; it must fail rather than measure a fallback face.
 */
export const PERSONAL_FONT_PRESETS = Object.freeze({
  default: Object.freeze({
    id: 'default',
    label: '常规',
    cssFamily: `Inter, ${CJK_FALLBACK}`,
    syntheticBold: false,
    requiresAssets: false,
    assets: Object.freeze([]),
  }),
  'xiaolai-sc': Object.freeze({
    id: 'xiaolai-sc',
    label: '小赖',
    cssFamily: `'EQB Xiaolai SC', ${CJK_FALLBACK}`,
    // Xiaolai ships only a Regular face; bold is synthesised by the browser.
    syntheticBold: true,
    requiresAssets: true,
    assets: Object.freeze([XIAOLAI_SC_REGULAR]),
  }),
  'fuzzy-xiaolai': Object.freeze({
    id: 'fuzzy-xiaolai',
    label: 'Fuzzy Bubbles',
    // Fuzzy Bubbles has Latin glyphs only; Chinese falls back to Xiaolai.
    cssFamily: `'EQB Fuzzy Bubbles', 'EQB Xiaolai SC', ${CJK_FALLBACK}`,
    // Real 400/700 Latin faces; Chinese bold still falls back to synthetic Xiaolai.
    syntheticBold: false,
    requiresAssets: true,
    assets: Object.freeze([FUZZY_BUBBLES_REGULAR, FUZZY_BUBBLES_BOLD, XIAOLAI_SC_REGULAR]),
  }),
})

export const PERSONAL_FONT_PRESET_IDS = Object.freeze(Object.keys(PERSONAL_FONT_PRESETS))

export const PERSONAL_SIZE_PRESETS = Object.freeze({
  small: Object.freeze({ id: 'small', label: '小', fontSizePt: 9, lineHeight: 1.45 }),
  normal: Object.freeze({ id: 'normal', label: '常规', fontSizePt: 10.5, lineHeight: 1.45 }),
  large: Object.freeze({ id: 'large', label: '大', fontSizePt: 12, lineHeight: 1.4 }),
})

export const PERSONAL_SIZE_PRESET_IDS = Object.freeze(Object.keys(PERSONAL_SIZE_PRESETS))

export function personalFontPreset(id) {
  return Object.hasOwn(PERSONAL_FONT_PRESETS, id) ? PERSONAL_FONT_PRESETS[id] : null
}

export function personalSizePreset(id) {
  return Object.hasOwn(PERSONAL_SIZE_PRESETS, id) ? PERSONAL_SIZE_PRESETS[id] : null
}

export function personalFontAssetsReady(id) {
  const preset = personalFontPreset(id)
  if (!preset) return false
  return !preset.requiresAssets || preset.assets.length > 0
}

export function personalTextStyle(presentation) {
  const font = personalFontPreset(presentation.fontPresetId)
  const size = personalSizePreset(presentation.sizePresetId)
  if (!font || !size) return null
  return Object.freeze({
    fontFamily: font.cssFamily,
    fontSize: `${size.fontSizePt}pt`,
    lineHeight: String(size.lineHeight),
    syntheticBold: font.syntheticBold,
  })
}
