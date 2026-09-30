export type PersonalFontPresetId = 'default' | 'xiaolai-sc' | 'fuzzy-xiaolai'
export type PersonalSizePresetId = 'small' | 'normal' | 'large'

export type PersonalTextMark = { type: 'bold' | 'underline' }
export type PersonalTextNode =
  | { type: 'text'; text: string; marks?: PersonalTextMark[] }
  | { type: 'hardBreak'; marks?: PersonalTextMark[] }
  | { type: 'paragraph'; content?: PersonalTextNode[] }
  | { type: 'bulletList'; content: PersonalTextNode[] }
  | { type: 'orderedList'; attrs?: { start?: number; type?: null }; content: PersonalTextNode[] }
  | { type: 'listItem'; content: PersonalTextNode[] }
  | { type: 'blockquote'; content: PersonalTextNode[] }

export type PersonalTextContent = { type: 'doc'; content: PersonalTextNode[] }

export type PersonalTextPresentation = {
  fontPresetId: PersonalFontPresetId
  sizePresetId: PersonalSizePresetId
  fontRegistryVersion: string
  styleVersion: string
}

export type PersonalTextDocumentV1 = {
  schemaVersion: 'eqb-personal-text-v1'
  format: 'tiptap-json'
  content: PersonalTextContent
  presentation: PersonalTextPresentation
}

export type PersonalTextValidationError = { code: string; path: string; message: string }
export type PersonalTextValidationResult = { ok: boolean; errors: PersonalTextValidationError[] }

export type PersonalFontAsset = {
  family: string
  file: string
  /** Folder under app/public/fonts/ the file lives in. */
  root: 'personal' | 'paper'
  weight: number
  style: 'normal' | 'italic'
  sha256: string
  bytes: number
  source: string
  license: string
}

export type PersonalFontPreset = {
  id: PersonalFontPresetId
  label: string
  cssFamily: string
  syntheticBold: boolean
  requiresAssets: boolean
  assets: readonly PersonalFontAsset[]
}

export type PersonalSizePreset = {
  id: PersonalSizePresetId
  label: string
  fontSizePt: number
  lineHeight: number
}

export const PERSONAL_TEXT_SCHEMA_VERSION: 'eqb-personal-text-v1'
export const PERSONAL_TEXT_FORMAT: 'tiptap-json'
export const PERSONAL_TEXT_MAX_JSON_BYTES: number
export const PERSONAL_TEXT_MAX_TEXT_UTF16: number
export const PERSONAL_TEXT_MAX_NODES: number
export const PERSONAL_TEXT_MAX_DEPTH: number
export const PERSONAL_TEXT_BLOCK_NODES: readonly string[]
export const PERSONAL_TEXT_INLINE_NODES: readonly string[]
export const PERSONAL_TEXT_NODES: readonly string[]
export const PERSONAL_TEXT_MARKS: readonly string[]
export const PERSONAL_TEXT_STARTER_KIT_OPTIONS: Readonly<Record<string, false>>

export const PERSONAL_FONT_ASSET_ROOT: string
export const PERSONAL_FONT_REGISTRY_VERSION: string
export const PERSONAL_TEXT_STYLE_VERSION: string
export const SUPPORTED_FONT_REGISTRY_VERSIONS: readonly string[]
export const SUPPORTED_STYLE_VERSIONS: readonly string[]
export const PERSONAL_FONT_PRESETS: Readonly<Record<PersonalFontPresetId, PersonalFontPreset>>
export const PERSONAL_FONT_PRESET_IDS: readonly PersonalFontPresetId[]
export const PERSONAL_SIZE_PRESETS: Readonly<Record<PersonalSizePresetId, PersonalSizePreset>>
export const PERSONAL_SIZE_PRESET_IDS: readonly PersonalSizePresetId[]
export function personalFontPreset(id: string): PersonalFontPreset | null
export function personalSizePreset(id: string): PersonalSizePreset | null
export function personalFontAssetsReady(id: string): boolean
export function personalTextStyle(presentation: PersonalTextPresentation): {
  fontFamily: string
  fontSize: string
  lineHeight: string
  syntheticBold: boolean
} | null

export const PERSONAL_TEXT_RENDER_SNAPSHOT_VERSION: string
export function validatePersonalTextContent(content: unknown): PersonalTextValidationResult
export function validatePersonalTextDocument(document: unknown): PersonalTextValidationResult
export function assertPersonalTextDocument(document: unknown): PersonalTextDocumentV1
export function createEmptyPersonalTextDocument(presentation?: {
  fontPresetId?: PersonalFontPresetId
  sizePresetId?: PersonalSizePresetId
}): PersonalTextDocumentV1
export function createPersonalTextDocumentFromPlainText(
  text: string,
  presentation?: { fontPresetId?: PersonalFontPresetId; sizePresetId?: PersonalSizePresetId },
): PersonalTextDocumentV1

export type PersonalTextRenderFactory<T> = {
  text(text: string, key: number): T
  element(tag: string, attrs: Record<string, string | number>, children: T[], key: number): T
  fragment(children: T[], key: number): T
}
export function walkPersonalTextContent<T>(content: PersonalTextContent, factory: PersonalTextRenderFactory<T>): T
export function renderPersonalTextHtml(document: PersonalTextDocumentV1): string
export function extractPersonalText(document: PersonalTextDocumentV1): string
export function isPersonalTextDocumentBlank(document: PersonalTextDocumentV1): boolean

export type PersonalTextRenderSnapshot = Readonly<{
  snapshotVersion: string
  document: PersonalTextDocumentV1
  contentDigest: string
  plainText: string
  font: {
    presetId: PersonalFontPresetId
    cssFamily: string
    syntheticBold: boolean
    requiresAssets: boolean
    assets: PersonalFontAsset[]
  }
  size: { presetId: PersonalSizePresetId; fontSizePt: number; lineHeight: number }
}>
export function createPersonalTextRenderSnapshot(document: PersonalTextDocumentV1): PersonalTextRenderSnapshot
