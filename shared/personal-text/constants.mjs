export const PERSONAL_TEXT_SCHEMA_VERSION = 'eqb-personal-text-v1'
export const PERSONAL_TEXT_FORMAT = 'tiptap-json'

export const PERSONAL_TEXT_MAX_JSON_BYTES = 256 * 1024
export const PERSONAL_TEXT_MAX_TEXT_UTF16 = 20_000
export const PERSONAL_TEXT_MAX_NODES = 2_000
export const PERSONAL_TEXT_MAX_DEPTH = 16

export const PERSONAL_TEXT_BLOCK_NODES = Object.freeze([
  'paragraph',
  'bulletList',
  'orderedList',
  'blockquote',
])
export const PERSONAL_TEXT_INLINE_NODES = Object.freeze(['text', 'hardBreak'])
export const PERSONAL_TEXT_NODES = Object.freeze([
  'doc',
  ...PERSONAL_TEXT_BLOCK_NODES,
  'listItem',
  ...PERSONAL_TEXT_INLINE_NODES,
])
export const PERSONAL_TEXT_MARKS = Object.freeze(['bold', 'underline'])

/*
 * StarterKit v3 ships more than the personal-text schema allows. Every
 * extension outside PERSONAL_TEXT_NODES / PERSONAL_TEXT_MARKS is switched off
 * here so the editor can never emit a node the validator rejects.
 * scripts/verify-personal-paper-layer.mjs asserts the resulting schema.
 */
export const PERSONAL_TEXT_STARTER_KIT_OPTIONS = Object.freeze({
  code: false,
  codeBlock: false,
  heading: false,
  horizontalRule: false,
  italic: false,
  link: false,
  strike: false,
  trailingNode: false,
  dropcursor: false,
  gapcursor: false,
})
