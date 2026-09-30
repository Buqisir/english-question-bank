export const PERSONAL_LAYER_SCHEMA_VERSION = 'eqb-personal-paper-layer-v1'
export const PERSONAL_LAYER_SNAPSHOT_VERSION = 'eqb-personal-paper-layer-snapshot-v1'
export const PERSONAL_TEXT_ANCHOR_VERSION = 'eqb-personal-text-anchor-v1'

export const PERSONAL_OBJECT_TYPES = Object.freeze([
  'highlight',
  'underline',
  'anchored-note',
  'text-box',
  'commentary',
])
export const PERSONAL_MARK_TYPES = Object.freeze(['highlight', 'underline'])

export const PERSONAL_HIGHLIGHT_COLORS = Object.freeze(['yellow', 'green', 'blue', 'pink'])
export const PERSONAL_DEFAULT_HIGHLIGHT_COLOR = 'yellow'
export const PERSONAL_UNDERLINE_INKS = Object.freeze(['ink', 'red'])
export const PERSONAL_DEFAULT_UNDERLINE_INK = 'ink'

export const PERSONAL_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/u

// Initial engineering guards, not measured performance promises.
export const PERSONAL_LAYER_MAX_OBJECTS = 1_000
export const PERSONAL_LAYER_MAX_CONTENT_BYTES = 8 * 1024 * 1024
export const PERSONAL_LAYER_MAX_OPERATIONS = 50
export const PERSONAL_LAYER_MAX_REQUEST_BYTES = 512 * 1024

// Anchor limits are independent of the translation request limits.
export const PERSONAL_ANCHOR_MAX_SEGMENTS = 64
export const PERSONAL_ANCHOR_MAX_SELECTED_UTF16 = 20_000
export const PERSONAL_ANCHOR_CONTEXT_UTF16 = 32

// Paper coordinates are millimetres from the page's top-left corner.
export const PERSONAL_PLACEMENT_MAX_MM = 1_000
export const PERSONAL_PLACEMENT_MIN_WIDTH_MM = 8
export const PERSONAL_PLACEMENT_MAX_WIDTH_MM = 400
