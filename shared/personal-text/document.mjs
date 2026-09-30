import { digestJson, stableStringify } from '../paper-canonical/stable.mjs'
import {
  PERSONAL_TEXT_BLOCK_NODES,
  PERSONAL_TEXT_FORMAT,
  PERSONAL_TEXT_MARKS,
  PERSONAL_TEXT_MAX_DEPTH,
  PERSONAL_TEXT_MAX_JSON_BYTES,
  PERSONAL_TEXT_MAX_NODES,
  PERSONAL_TEXT_MAX_TEXT_UTF16,
  PERSONAL_TEXT_NODES,
  PERSONAL_TEXT_SCHEMA_VERSION,
} from './constants.mjs'
import {
  PERSONAL_FONT_REGISTRY_VERSION,
  PERSONAL_TEXT_STYLE_VERSION,
  SUPPORTED_FONT_REGISTRY_VERSIONS,
  SUPPORTED_STYLE_VERSIONS,
  personalFontPreset,
  personalSizePreset,
} from './fontRegistry.mjs'

export const PERSONAL_TEXT_RENDER_SNAPSHOT_VERSION = 'eqb-personal-text-snapshot-v1'

const BLOCKS = new Set(PERSONAL_TEXT_BLOCK_NODES)
const MARKS = new Set(PERSONAL_TEXT_MARKS)
const MAX_ORDERED_LIST_START = 10_000

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  // ProseMirror emits attrs objects with a null prototype.
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function utf8Length(text) {
  return new TextEncoder().encode(text).length
}

function onlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function createValidationContext() {
  return { errors: [], nodes: 0, textUnits: 0 }
}

function fail(context, code, path, message) {
  context.errors.push({ code, path, message })
}

function validateMarks(context, marks, path) {
  if (marks === undefined) return
  if (!Array.isArray(marks)) {
    fail(context, 'PERSONAL_TEXT_MARK_INVALID', path, 'marks must be an array')
    return
  }
  const seen = new Set()
  marks.forEach((mark, index) => {
    const markPath = `${path}[${index}]`
    if (!isRecord(mark) || typeof mark.type !== 'string' || !onlyKeys(mark, ['type'])) {
      fail(context, 'PERSONAL_TEXT_MARK_INVALID', markPath, 'mark must be { type }')
      return
    }
    if (!MARKS.has(mark.type)) {
      fail(context, 'PERSONAL_TEXT_MARK_UNKNOWN', markPath, `mark ${mark.type} is not allowed`)
      return
    }
    if (seen.has(mark.type)) {
      fail(context, 'PERSONAL_TEXT_MARK_INVALID', markPath, `mark ${mark.type} is repeated`)
    }
    seen.add(mark.type)
  })
}

function validateAttrs(context, node, path) {
  if (node.attrs === undefined) return
  if (!isRecord(node.attrs)) {
    fail(context, 'PERSONAL_TEXT_ATTRS_INVALID', `${path}.attrs`, 'attrs must be an object')
    return
  }
  if (node.type !== 'orderedList') {
    if (Object.keys(node.attrs).length > 0) {
      fail(context, 'PERSONAL_TEXT_ATTRS_INVALID', `${path}.attrs`, `${node.type} takes no attrs`)
    }
    return
  }
  if (!onlyKeys(node.attrs, ['start', 'type'])) {
    fail(context, 'PERSONAL_TEXT_ATTRS_INVALID', `${path}.attrs`, 'orderedList allows only start/type')
    return
  }
  const { start, type } = node.attrs
  if (
    start !== undefined
    && (!Number.isSafeInteger(start) || start < 1 || start > MAX_ORDERED_LIST_START)
  ) {
    fail(context, 'PERSONAL_TEXT_ATTRS_INVALID', `${path}.attrs.start`, 'start must be an integer 1..10000')
  }
  if (type !== undefined && type !== null) {
    fail(context, 'PERSONAL_TEXT_ATTRS_INVALID', `${path}.attrs.type`, 'list type is not configurable')
  }
}

function validateChildren(context, node, path, depth, allowed, { min = 0, firstType = null } = {}) {
  const content = node.content
  if (content === undefined) {
    if (min > 0) fail(context, 'PERSONAL_TEXT_STRUCTURE_INVALID', path, `${node.type} needs content`)
    return
  }
  if (!Array.isArray(content)) {
    fail(context, 'PERSONAL_TEXT_STRUCTURE_INVALID', `${path}.content`, 'content must be an array')
    return
  }
  if (content.length < min) {
    fail(context, 'PERSONAL_TEXT_STRUCTURE_INVALID', path, `${node.type} needs content`)
  }
  content.forEach((child, index) => {
    const childPath = `${path}.content[${index}]`
    const childType = isRecord(child) ? child.type : undefined
    if (index === 0 && firstType && childType !== firstType) {
      fail(context, 'PERSONAL_TEXT_STRUCTURE_INVALID', childPath, `${node.type} must start with ${firstType}`)
    } else if (
      typeof childType === 'string'
      && PERSONAL_TEXT_NODES.includes(childType)
      && !allowed(childType)
    ) {
      fail(context, 'PERSONAL_TEXT_STRUCTURE_INVALID', childPath, `${childType} cannot appear in ${node.type}`)
    }
    validateNode(context, child, childPath, depth + 1)
  })
}

function validateNode(context, node, path, depth) {
  if (context.errors.length > 32) return
  context.nodes += 1
  if (context.nodes > PERSONAL_TEXT_MAX_NODES) {
    if (context.nodes === PERSONAL_TEXT_MAX_NODES + 1) {
      fail(context, 'PERSONAL_TEXT_LIMIT', path, `more than ${PERSONAL_TEXT_MAX_NODES} nodes`)
    }
    return
  }
  if (depth > PERSONAL_TEXT_MAX_DEPTH) {
    fail(context, 'PERSONAL_TEXT_LIMIT', path, `deeper than ${PERSONAL_TEXT_MAX_DEPTH}`)
    return
  }
  if (!isRecord(node) || typeof node.type !== 'string') {
    fail(context, 'PERSONAL_TEXT_STRUCTURE_INVALID', path, 'node must be an object with a type')
    return
  }
  switch (node.type) {
    case 'text': {
      if (!onlyKeys(node, ['type', 'text', 'marks'])) {
        fail(context, 'PERSONAL_TEXT_STRUCTURE_INVALID', path, 'text node has unknown keys')
      }
      if (typeof node.text !== 'string' || node.text.length === 0) {
        fail(context, 'PERSONAL_TEXT_STRUCTURE_INVALID', path, 'text must be a non-empty string')
        return
      }
      context.textUnits += node.text.length
      validateMarks(context, node.marks, `${path}.marks`)
      return
    }
    case 'hardBreak':
      if (!onlyKeys(node, ['type', 'marks'])) {
        fail(context, 'PERSONAL_TEXT_STRUCTURE_INVALID', path, 'hardBreak has unknown keys')
      }
      // ProseMirror carries active marks onto a hard break; allow the same set.
      validateMarks(context, node.marks, `${path}.marks`)
      return
    case 'doc':
    case 'paragraph':
    case 'bulletList':
    case 'orderedList':
    case 'listItem':
    case 'blockquote':
      break
    default:
      fail(context, 'PERSONAL_TEXT_NODE_UNKNOWN', path, `node ${node.type} is not allowed`)
      return
  }
  if (!onlyKeys(node, ['type', 'attrs', 'content'])) {
    fail(context, 'PERSONAL_TEXT_STRUCTURE_INVALID', path, `${node.type} has unknown keys`)
  }
  validateAttrs(context, node, path)
  const isBlock = (type) => BLOCKS.has(type)
  if (node.type === 'doc') {
    if (depth !== 0) fail(context, 'PERSONAL_TEXT_STRUCTURE_INVALID', path, 'doc must be the root')
    validateChildren(context, node, path, depth, isBlock, { min: 1 })
  } else if (node.type === 'paragraph') {
    validateChildren(context, node, path, depth, (type) => type === 'text' || type === 'hardBreak')
  } else if (node.type === 'bulletList' || node.type === 'orderedList') {
    validateChildren(context, node, path, depth, (type) => type === 'listItem', { min: 1 })
  } else if (node.type === 'listItem') {
    validateChildren(context, node, path, depth, isBlock, { min: 1, firstType: 'paragraph' })
  } else if (node.type === 'blockquote') {
    validateChildren(context, node, path, depth, isBlock, { min: 1 })
  }
}

export function validatePersonalTextContent(content) {
  const context = createValidationContext()
  if (!isRecord(content) || content.type !== 'doc') {
    fail(context, 'PERSONAL_TEXT_STRUCTURE_INVALID', 'content', 'content must be a doc node')
    return { ok: false, errors: context.errors }
  }
  validateNode(context, content, 'content', 0)
  if (context.textUnits > PERSONAL_TEXT_MAX_TEXT_UTF16) {
    fail(context, 'PERSONAL_TEXT_LIMIT', 'content', `more than ${PERSONAL_TEXT_MAX_TEXT_UTF16} UTF-16 units`)
  }
  return context.errors.length === 0
    ? { ok: true, errors: [] }
    : { ok: false, errors: context.errors }
}

function validatePresentation(presentation, errors) {
  if (!isRecord(presentation) || !onlyKeys(presentation, [
    'fontPresetId', 'sizePresetId', 'fontRegistryVersion', 'styleVersion',
  ])) {
    errors.push({ code: 'PERSONAL_TEXT_PRESENTATION_INVALID', path: 'presentation', message: 'presentation has unknown shape' })
    return
  }
  if (!personalFontPreset(presentation.fontPresetId)) {
    errors.push({ code: 'PERSONAL_TEXT_FONT_UNKNOWN', path: 'presentation.fontPresetId', message: 'unknown font preset' })
  }
  if (!personalSizePreset(presentation.sizePresetId)) {
    errors.push({ code: 'PERSONAL_TEXT_SIZE_UNKNOWN', path: 'presentation.sizePresetId', message: 'unknown size preset' })
  }
  if (!SUPPORTED_FONT_REGISTRY_VERSIONS.includes(presentation.fontRegistryVersion)) {
    errors.push({ code: 'PERSONAL_TEXT_VERSION_UNSUPPORTED', path: 'presentation.fontRegistryVersion', message: 'unsupported font registry version' })
  }
  if (!SUPPORTED_STYLE_VERSIONS.includes(presentation.styleVersion)) {
    errors.push({ code: 'PERSONAL_TEXT_VERSION_UNSUPPORTED', path: 'presentation.styleVersion', message: 'unsupported style version' })
  }
}

export function validatePersonalTextDocument(document) {
  const errors = []
  if (!isRecord(document)) {
    return { ok: false, errors: [{ code: 'PERSONAL_TEXT_STRUCTURE_INVALID', path: '', message: 'document must be an object' }] }
  }
  if (!onlyKeys(document, ['schemaVersion', 'format', 'content', 'presentation'])) {
    errors.push({ code: 'PERSONAL_TEXT_STRUCTURE_INVALID', path: '', message: 'document has unknown keys' })
  }
  if (document.schemaVersion !== PERSONAL_TEXT_SCHEMA_VERSION) {
    errors.push({ code: 'PERSONAL_TEXT_VERSION_UNSUPPORTED', path: 'schemaVersion', message: 'unsupported schema version' })
  }
  if (document.format !== PERSONAL_TEXT_FORMAT) {
    errors.push({ code: 'PERSONAL_TEXT_VERSION_UNSUPPORTED', path: 'format', message: 'unsupported format' })
  }
  validatePresentation(document.presentation, errors)
  if (errors.length === 0) {
    let serialized
    try {
      serialized = stableStringify(document)
    } catch {
      errors.push({ code: 'PERSONAL_TEXT_STRUCTURE_INVALID', path: '', message: 'document is not plain JSON' })
    }
    if (serialized !== undefined && utf8Length(serialized) > PERSONAL_TEXT_MAX_JSON_BYTES) {
      errors.push({ code: 'PERSONAL_TEXT_LIMIT', path: '', message: `document exceeds ${PERSONAL_TEXT_MAX_JSON_BYTES} bytes` })
    }
  }
  if (errors.length === 0) errors.push(...validatePersonalTextContent(document.content).errors)
  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors }
}

export function assertPersonalTextDocument(document) {
  const result = validatePersonalTextDocument(document)
  if (!result.ok) {
    const error = new Error(result.errors[0].message)
    error.code = 'PERSONAL_TEXT_INVALID'
    error.details = result.errors
    throw error
  }
  return document
}

export function createEmptyPersonalTextDocument({
  fontPresetId = 'default',
  sizePresetId = 'normal',
} = {}) {
  return {
    schemaVersion: PERSONAL_TEXT_SCHEMA_VERSION,
    format: PERSONAL_TEXT_FORMAT,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    presentation: {
      fontPresetId,
      sizePresetId,
      fontRegistryVersion: PERSONAL_FONT_REGISTRY_VERSION,
      styleVersion: PERSONAL_TEXT_STYLE_VERSION,
    },
  }
}

export function createPersonalTextDocumentFromPlainText(text, presentation) {
  const document = createEmptyPersonalTextDocument(presentation)
  const lines = String(text).replace(/\r\n?/gu, '\n').split('\n')
  document.content.content = lines.map((line) => (
    line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }
  ))
  return document
}

/*
 * One structural mapping for every static consumer: the app renders React
 * elements and the server renders escaped HTML from the same walk, so the
 * two surfaces cannot drift on which tag a node becomes. Input must already
 * be validated; unknown nodes throw instead of being skipped.
 */
const NODE_TAGS = Object.freeze({
  doc: null,
  paragraph: 'p',
  bulletList: 'ul',
  orderedList: 'ol',
  listItem: 'li',
  blockquote: 'blockquote',
})
const MARK_TAGS = Object.freeze({ bold: 'strong', underline: 'u' })

export function walkPersonalTextContent(content, factory) {
  let key = 0
  const visit = (node) => {
    key += 1
    if (node.type === 'text') {
      let rendered = factory.text(node.text, key)
      for (const mark of node.marks || []) {
        key += 1
        rendered = factory.element(MARK_TAGS[mark.type], {}, [rendered], key)
      }
      return rendered
    }
    if (node.type === 'hardBreak') return factory.element('br', {}, [], key)
    if (!Object.hasOwn(NODE_TAGS, node.type)) {
      throw new Error(`Cannot render personal text node ${node.type}`)
    }
    const children = (node.content || []).map(visit)
    const tag = NODE_TAGS[node.type]
    if (tag === null) return factory.fragment(children, key)
    const attrs = node.type === 'orderedList' && node.attrs?.start > 1
      ? { start: node.attrs.start }
      : {}
    return factory.element(tag, attrs, children, key)
  }
  return visit(content)
}

function escapeHtml(text) {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

export function renderPersonalTextHtml(document) {
  assertPersonalTextDocument(document)
  return walkPersonalTextContent(document.content, {
    text: (text) => escapeHtml(text),
    element: (tag, attrs, children) => {
      const attrText = Object.entries(attrs)
        .map(([name, value]) => ` ${name}="${escapeHtml(String(value))}"`)
        .join('')
      if (tag === 'br') return '<br>'
      // An empty paragraph must keep its line height in static output.
      const inner = tag === 'p' && children.length === 0 ? '<br>' : children.join('')
      return `<${tag}${attrText}>${inner}</${tag}>`
    },
    fragment: (children) => children.join(''),
  })
}

export function extractPersonalText(document) {
  assertPersonalTextDocument(document)
  const blocks = []
  const inline = (nodes) => (nodes || [])
    .map((node) => (node.type === 'text' ? node.text : '\n'))
    .join('')
  const visitBlock = (node, prefix) => {
    if (node.type === 'paragraph') {
      blocks.push(`${prefix}${inline(node.content)}`)
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      let number = node.attrs?.start ?? 1
      for (const item of node.content) {
        const marker = node.type === 'bulletList' ? '• ' : `${number}. `
        number += 1
        item.content.forEach((child, index) => {
          visitBlock(child, index === 0 ? `${prefix}${marker}` : `${prefix}   `)
        })
      }
    } else if (node.type === 'blockquote') {
      for (const child of node.content) visitBlock(child, `${prefix}> `)
    }
  }
  for (const block of document.content.content) visitBlock(block, '')
  return blocks.join('\n')
}

export function isPersonalTextDocumentBlank(document) {
  return extractPersonalText(document).trim().length === 0
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

export function createPersonalTextRenderSnapshot(document) {
  assertPersonalTextDocument(document)
  const copy = JSON.parse(JSON.stringify(document))
  const font = personalFontPreset(copy.presentation.fontPresetId)
  const size = personalSizePreset(copy.presentation.sizePresetId)
  return deepFreeze({
    snapshotVersion: PERSONAL_TEXT_RENDER_SNAPSHOT_VERSION,
    document: copy,
    contentDigest: digestJson(copy),
    plainText: extractPersonalText(copy),
    font: {
      presetId: font.id,
      cssFamily: font.cssFamily,
      syntheticBold: font.syntheticBold,
      requiresAssets: font.requiresAssets,
      assets: font.assets.map((asset) => ({ ...asset })),
    },
    size: { presetId: size.id, fontSizePt: size.fontSizePt, lineHeight: size.lineHeight },
  })
}
