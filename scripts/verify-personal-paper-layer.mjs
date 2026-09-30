#!/usr/bin/env node
// Contract checks for #489 personal text and the personal paper layer:
// restricted Tiptap JSON, editor schema parity, anchors, atomic operations.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PERSONAL_FONT_ASSET_ROOT,
  PERSONAL_FONT_PRESETS,
  PERSONAL_FONT_PRESET_IDS,
  PERSONAL_TEXT_MARKS,
  PERSONAL_TEXT_MAX_DEPTH,
  PERSONAL_TEXT_MAX_NODES,
  PERSONAL_TEXT_MAX_TEXT_UTF16,
  PERSONAL_TEXT_NODES,
  PERSONAL_TEXT_STARTER_KIT_OPTIONS,
  createEmptyPersonalTextDocument,
  createPersonalTextDocumentFromPlainText,
  createPersonalTextRenderSnapshot,
  extractPersonalText,
  isPersonalTextDocumentBlank,
  personalFontAssetsReady,
  renderPersonalTextHtml,
  validatePersonalTextDocument,
} from '../shared/personal-text/index.mjs'
import {
  PERSONAL_LAYER_MAX_OPERATIONS,
  applyPersonalLayerOperations,
  buildPersonalLayerSource,
  createEmptyPersonalLayerState,
  createPersonalLayerSnapshot,
  normalizeTextAnchor,
  orderAppendixEntries,
  placeNoteNearAnchor,
  resolveTextAnchor,
} from '../shared/personal-paper-layer/index.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appRequire = createRequire(path.join(rootDir, 'app/package.json'))

let failed = 0
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS ${name}`)
  else {
    failed += 1
    console.log(`FAIL ${name}${detail ? ` ${detail}` : ''}`)
  }
}
function codeOf(fn) {
  try {
    fn()
    return null
  } catch (error) {
    return error.code || error.message
  }
}
const firstCode = (document) => validatePersonalTextDocument(document).errors[0]?.code

// ---- personal text document -------------------------------------------------

const rich = createEmptyPersonalTextDocument({ fontPresetId: 'xiaolai-sc', sizePresetId: 'large' })
rich.content = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Key ' },
        { type: 'text', text: 'idea', marks: [{ type: 'bold' }, { type: 'underline' }] },
        { type: 'hardBreak' },
        { type: 'text', text: '主旨 <b>&"' },
      ],
    },
    { type: 'paragraph' },
    {
      type: 'orderedList',
      attrs: { start: 3, type: null },
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
            { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }] }] },
          ],
        },
      ],
    },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted /ˈæd.res/' }] }] },
  ],
}
check('a document using every allowed node and mark validates', validatePersonalTextDocument(rich).ok,
  JSON.stringify(validatePersonalTextDocument(rich).errors))
check('an empty document is valid and blank', validatePersonalTextDocument(createEmptyPersonalTextDocument()).ok
  && isPersonalTextDocumentBlank(createEmptyPersonalTextDocument()))

const withContent = (content) => ({ ...createEmptyPersonalTextDocument(), content: { type: 'doc', content } })
check('unknown node is rejected', firstCode(withContent([{ type: 'heading', content: [] }])) === 'PERSONAL_TEXT_NODE_UNKNOWN')
check('image node is rejected', firstCode(withContent([{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'https://x' } }] }])) === 'PERSONAL_TEXT_NODE_UNKNOWN')
check('unknown mark (link) is rejected', firstCode(withContent([{ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'javascript:1' } }] }] }])) === 'PERSONAL_TEXT_MARK_INVALID')
check('mark with attrs is rejected', firstCode(withContent([{ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'bold', attrs: { style: 'x' } }] }] }])) === 'PERSONAL_TEXT_MARK_INVALID')
check('paragraph with style attrs is rejected', firstCode(withContent([{ type: 'paragraph', attrs: { style: 'color:red' } }])) === 'PERSONAL_TEXT_ATTRS_INVALID')
check('ordered list type attr is rejected', firstCode(withContent([{ type: 'orderedList', attrs: { type: 'a' }, content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }])) === 'PERSONAL_TEXT_ATTRS_INVALID')
check('list item must start with a paragraph', firstCode(withContent([{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'bulletList', content: [] }] }] }])) === 'PERSONAL_TEXT_STRUCTURE_INVALID')
check('text directly in doc is rejected', firstCode(withContent([{ type: 'text', text: 'x' }])) === 'PERSONAL_TEXT_STRUCTURE_INVALID')
check('empty text node is rejected', firstCode(withContent([{ type: 'paragraph', content: [{ type: 'text', text: '' }] }])) === 'PERSONAL_TEXT_STRUCTURE_INVALID')
check('HTML string content is rejected', firstCode({ ...createEmptyPersonalTextDocument(), content: '<p>x</p>' }) === 'PERSONAL_TEXT_STRUCTURE_INVALID')
check('unknown schema version is rejected', firstCode({ ...createEmptyPersonalTextDocument(), schemaVersion: 'eqb-personal-text-v9' }) === 'PERSONAL_TEXT_VERSION_UNSUPPORTED')
check('unknown font preset is rejected', firstCode({ ...createEmptyPersonalTextDocument(), presentation: { ...createEmptyPersonalTextDocument().presentation, fontPresetId: 'comic-sans' } }) === 'PERSONAL_TEXT_FONT_UNKNOWN')
check('unknown size preset is rejected', firstCode({ ...createEmptyPersonalTextDocument(), presentation: { ...createEmptyPersonalTextDocument().presentation, sizePresetId: 'huge' } }) === 'PERSONAL_TEXT_SIZE_UNKNOWN')
check('extra top-level key is rejected', firstCode({ ...createEmptyPersonalTextDocument(), html: '<p/>' }) === 'PERSONAL_TEXT_STRUCTURE_INVALID')

let deep = { type: 'paragraph', content: [{ type: 'text', text: 'deep' }] }
for (let level = 0; level < PERSONAL_TEXT_MAX_DEPTH; level += 1) deep = { type: 'blockquote', content: [deep] }
check('documents deeper than the limit are rejected', firstCode(withContent([deep])) === 'PERSONAL_TEXT_LIMIT')
check('too many nodes are rejected', firstCode(withContent(Array.from({ length: PERSONAL_TEXT_MAX_NODES }, () => ({ type: 'paragraph' })))) === 'PERSONAL_TEXT_LIMIT')
check('text over the UTF-16 limit is rejected, not truncated', firstCode(withContent([{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(PERSONAL_TEXT_MAX_TEXT_UTF16 + 1) }] }])) === 'PERSONAL_TEXT_LIMIT')
check('text at the UTF-16 limit is accepted', validatePersonalTextDocument(withContent([{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(PERSONAL_TEXT_MAX_TEXT_UTF16) }] }])).ok)

const html = renderPersonalTextHtml(rich)
check('static HTML escapes user text and maps marks', html.includes('主旨 &lt;b&gt;&amp;&quot;')
  && html.includes('<u><strong>idea</strong></u>')
  && html.includes('<ol start="3">')
  && html.includes('<p><br></p>')
  && !html.includes('<b>'), html)
check('plain text extraction keeps structure', extractPersonalText(rich) === [
  'Key idea\n主旨 <b>&"', '', '3. first', '4. second', '   • nested', '> quoted /ˈæd.res/',
].join('\n'), JSON.stringify(extractPersonalText(rich)))
const pasted = createPersonalTextDocumentFromPlainText('line one\r\n\r\n<script>x</script>')
check('plain-text paste keeps lines and never becomes markup', validatePersonalTextDocument(pasted).ok
  && pasted.content.content.length === 3
  && renderPersonalTextHtml(pasted).includes('&lt;script&gt;'))

const snapshot = createPersonalTextRenderSnapshot(rich)
rich.content.content[0].content[0].text = 'mutated '
check('render snapshot is an independent frozen copy', snapshot.document.content.content[0].content[0].text === 'Key '
  && Object.isFrozen(snapshot.document.content) && snapshot.font.syntheticBold === true
  && snapshot.size.fontSizePt === 12 && snapshot.contentDigest.length > 16)
check('every font preset has its assets registered', PERSONAL_FONT_PRESET_IDS.every(personalFontAssetsReady)
  && !personalFontAssetsReady('comic-sans'))
check('the 常规 preset renders with the bundled paper fonts and real bold faces',
  PERSONAL_FONT_PRESETS.default.requiresAssets === true
  && PERSONAL_FONT_PRESETS.default.syntheticBold === false
  && PERSONAL_FONT_PRESETS.default.cssFamily === "'EQB Termes', 'EQB Source Han Serif', serif"
  && JSON.stringify(PERSONAL_FONT_PRESETS.default.assets.map((entry) => [entry.family, entry.weight]))
    === JSON.stringify([['EQB Termes', 400], ['EQB Termes', 700], ['EQB Source Han Serif', 400], ['EQB Source Han Serif', 700]])
  && PERSONAL_FONT_PRESETS.default.assets.every((entry) => entry.root === 'paper'),
  JSON.stringify(PERSONAL_FONT_PRESETS.default))
// Assets are rooted at app/public/fonts/<root>/<file>: the personal folder
// holds the annotation-only faces, the paper folder the bundled paper faces.
const fontRootByRoot = new Map([
  ['personal', path.join(rootDir, 'app/public', PERSONAL_FONT_ASSET_ROOT)],
  ['paper', path.join(rootDir, 'app/public/fonts/paper')],
])
const registeredAssets = new Map(Object.values(PERSONAL_FONT_PRESETS)
  .flatMap((preset) => preset.assets).map((entry) => [entry.file, entry]))
const assetDrift = [...registeredAssets.values()].filter((entry) => {
  const bytes = readFileSync(path.join(fontRootByRoot.get(entry.root), entry.file))
  return bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256
}).map((entry) => entry.file)
const sumsByRoot = new Map([...fontRootByRoot].map(([root, dir]) => [root, new Map(
  readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8').trim().split('\n')
    .map((line) => line.split(/\s+/u)).map(([hash, file]) => [file, hash]),
)]))
const fontCssByRoot = new Map([...fontRootByRoot].map(([root, dir]) => [root, readFileSync(path.join(dir, 'fonts.css'), 'utf8')]))
// The paper fonts.css documents its no-local() policy in a comment; judge
// only the declarations.
const cssWithoutComments = (css) => css.replace(/\/\*[^*]*\*\//gu, '')
check('registered font bytes match the registry and each root SHA256SUMS', assetDrift.length === 0
  && [...registeredAssets.values()].every((entry) => sumsByRoot.get(entry.root).get(entry.file) === entry.sha256), assetDrift.join(','))
// The paper folder legitimately declares extra faces (the Termes italics the
// personal model cannot use); every registered face must still be declared
// there, and the personal folder declares exactly its own registered faces.
check('each root fonts.css declares its registered faces without local() lookup',
  [...fontCssByRoot.values()].every((css) => !/local\(/u.test(cssWithoutComments(css)))
  && [...registeredAssets.values()].every((entry) => fontCssByRoot.get(entry.root).includes(`url('./${entry.file}')`))
  && (fontCssByRoot.get('personal').match(/@font-face/gu) || []).length
    === [...registeredAssets.values()].filter((entry) => entry.root === 'personal').length)
check('font licences ship next to the fonts',
  existsSync(path.join(fontRootByRoot.get('personal'), 'xiaolai/License.txt'))
  && existsSync(path.join(fontRootByRoot.get('personal'), 'fuzzy-bubbles/OFL.txt'))
  && existsSync(path.join(fontRootByRoot.get('paper'), 'termes/GUST-FONT-LICENSE.txt'))
  && existsSync(path.join(fontRootByRoot.get('paper'), 'source-han-serif/LICENSE.txt')))

// ---- editor schema parity and Tiptap round trip ----------------------------

const { getSchema } = await import(appRequire.resolve('@tiptap/core'))
const starterKitModule = await import(appRequire.resolve('@tiptap/starter-kit'))
const StarterKit = starterKitModule.StarterKit ?? starterKitModule.default?.StarterKit ?? starterKitModule.default
const schema = getSchema([StarterKit.configure(PERSONAL_TEXT_STARTER_KIT_OPTIONS)])
const schemaNodes = Object.keys(schema.nodes).sort()
const schemaMarks = Object.keys(schema.marks).sort()
check('configured StarterKit exposes exactly the allowed nodes', JSON.stringify(schemaNodes) === JSON.stringify([...PERSONAL_TEXT_NODES].sort()), schemaNodes.join(','))
check('configured StarterKit exposes exactly the allowed marks', JSON.stringify(schemaMarks) === JSON.stringify([...PERSONAL_TEXT_MARKS].sort()), schemaMarks.join(','))
const roundTripSource = createEmptyPersonalTextDocument()
roundTripSource.content = JSON.parse(JSON.stringify(snapshot.document.content))
const pmDoc = schema.nodeFromJSON(roundTripSource.content)
pmDoc.check()
const roundTripped = { ...roundTripSource, content: pmDoc.toJSON() }
check('validated JSON survives a ProseMirror round trip unchanged and still validates',
  validatePersonalTextDocument(roundTripped).ok
  && JSON.stringify(pmDoc.toJSON()) === JSON.stringify(schema.nodeFromJSON(pmDoc.toJSON()).toJSON()),
  JSON.stringify(validatePersonalTextDocument(roundTripped).errors))
const emptyPm = schema.nodeFromJSON(createEmptyPersonalTextDocument().content).toJSON()
check('an empty editor document validates', validatePersonalTextDocument({ ...createEmptyPersonalTextDocument(), content: emptyPm }).ok)

// ---- text anchors ----------------------------------------------------------

const body = 'The plan worked. The plan failed later.\nA new idea 😀 appeared.'
const source = {
  paperId: 'paper-a',
  sourceRevision: 'rev-1',
  sourceProjectionVersion: 'paper-selection-source-v2',
  streams: [
    {
      streamId: 'g1/passage/body/p1', text: body, role: 'passage-body', groupId: 'g1', flow: true,
      leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: 39 }, { kind: 'paragraph', id: 'p2', start: 40, end: body.length }],
    },
    {
      streamId: 'g1/question/q1/stem', text: 'What happened to the plan?', role: 'question-stem', groupId: 'g1', flow: false,
      leaves: [{ kind: 'question-stem', id: 'q1', start: 0, end: 26 }],
    },
    {
      streamId: 'w1/writing-prompt/p1', text: 'Write a letter.', role: 'writing-prompt', groupId: 'w1', flow: true,
      leaves: [{ kind: 'paragraph', id: 'wp1', start: 0, end: 15 }],
    },
  ],
}
const anchorBase = { paperId: 'paper-a', sourceRevision: 'rev-1', sourceProjectionVersion: 'paper-selection-source-v2' }
const second = body.indexOf('plan', 10)
const segment = (streamId, start, end, text = source.streams.find((s) => s.streamId === streamId).text) => ({
  streamId, start, end, exactText: text.slice(start, end),
})
const anchor = normalizeTextAnchor(source, { ...anchorBase, segments: [segment('g1/passage/body/p1', second, second + 4)] })
check('anchor binds the second identical word by position, not first match', anchor.segments[0].start === second
  && anchor.segments[0].prefix.endsWith('The ') && anchor.segments[0].leafIds.join() === 'p1' && anchor.groupId === 'g1')
const multi = normalizeTextAnchor(source, { ...anchorBase, segments: [
  segment('g1/passage/body/p1', 30, 48),
  segment('g1/question/q1/stem', 0, 4),
] })
check('multi-segment anchor across a paragraph break records every leaf', multi.segments[0].leafIds.join() === 'p1,p2')
check('forged exactText is rejected', codeOf(() => normalizeTextAnchor(source, { ...anchorBase, segments: [{ streamId: 'g1/passage/body/p1', start: 4, end: 8, exactText: 'PLAN' }] })) === 'PERSONAL_ANCHOR_SOURCE_MISMATCH')
check('out-of-range offsets are rejected', codeOf(() => normalizeTextAnchor(source, { ...anchorBase, segments: [{ streamId: 'g1/passage/body/p1', start: 60, end: 999, exactText: 'x' }] })) === 'PERSONAL_ANCHOR_RANGE_INVALID')
const emoji = body.indexOf('😀')
check('an anchor splitting a surrogate pair is rejected', codeOf(() => normalizeTextAnchor(source, { ...anchorBase, segments: [{ streamId: 'g1/passage/body/p1', start: emoji + 1, end: emoji + 3, exactText: body.slice(emoji + 1, emoji + 3) }] })) === 'PERSONAL_ANCHOR_RANGE_INVALID')
check('wrong source revision is rejected', codeOf(() => normalizeTextAnchor(source, { ...anchorBase, sourceRevision: 'rev-0', segments: [segment('g1/passage/body/p1', 0, 3)] })) === 'PERSONAL_ANCHOR_SOURCE_MISMATCH')
check('unknown stream is rejected', codeOf(() => normalizeTextAnchor(source, { ...anchorBase, segments: [{ streamId: 'nope', start: 0, end: 1, exactText: 'T' }] })) === 'PERSONAL_ANCHOR_SOURCE_MISMATCH')
check('an anchor spanning two question groups is rejected', codeOf(() => normalizeTextAnchor(source, { ...anchorBase, segments: [segment('g1/passage/body/p1', 0, 3), segment('w1/writing-prompt/p1', 0, 5)] })) === 'PERSONAL_ANCHOR_UNSUPPORTED')
check('overlapping segments are rejected', codeOf(() => normalizeTextAnchor(source, { ...anchorBase, segments: [segment('g1/passage/body/p1', 0, 8), segment('g1/passage/body/p1', 4, 10)] })) === 'PERSONAL_ANCHOR_INVALID')
check('a stored anchor resolves against the same source', resolveTextAnchor(source, anchor).status === 'ok')
const revised = { ...source, sourceRevision: 'rev-2', streams: [{ ...source.streams[0], text: body.replace('The plan failed', 'The idea failed') }, ...source.streams.slice(1)] }
const drift = resolveTextAnchor(revised, anchor)
check('a revised source yields needs-reanchor with explicit reasons, no guessed move', drift.status === 'needs-reanchor'
  && drift.reasons.includes('source-revision-changed') && drift.reasons.includes('text-mismatch'), JSON.stringify(drift))

// ---- operations ------------------------------------------------------------

const now = '2026-09-28T10:00:00.000Z'
const empty = createEmptyPersonalLayerState(source)
const anchorInput = { ...anchorBase, segments: [segment('g1/passage/body/p1', second, second + 4)] }
const note = createPersonalTextDocumentFromPlainText('check this')
const layout = { kind: 'page-position', layoutId: 'layout-a4-v1', pageId: 'page-2', xMm: 150, yMm: 40, widthMm: 45 }
const created = applyPersonalLayerOperations(empty, [
  { op: 'create', object: { id: 'hl_00000001', type: 'highlight', textAnchor: anchorInput, style: { color: 'yellow' } } },
  { op: 'create', object: { id: 'ul_00000001', type: 'underline', textAnchor: anchorInput, style: { ink: 'red' } } },
  { op: 'create', object: { id: 'nt_00000001', type: 'anchored-note', textAnchor: anchorInput, document: note, placement: { kind: 'auto-near-anchor' } } },
  { op: 'create', object: { id: 'tb_00000001', type: 'text-box', document: note, placement: layout } },
  { op: 'create', object: { id: 'cm_00000001', type: 'commentary', target: { kind: 'question', groupId: 'g1', questionId: 'q1' }, document: note } },
  { op: 'create', object: { id: 'cm_00000002', type: 'commentary', target: { kind: 'writing-task', groupId: 'w1' }, document: note } },
], { source, now })
check('a batch creates every object type and bumps the version once', created.state.version === 1
  && created.state.objects.length === 6 && created.affectedObjectIds.length === 6
  && empty.objects.length === 0)
check('highlight and underline can share the same range', created.state.objects.filter((o) => o.type === 'highlight' || o.type === 'underline').length === 2)
check('stored anchor is the server-normalised form', created.state.objects[0].textAnchor.anchorVersion === 'eqb-personal-text-anchor-v1'
  && created.state.objects[0].revision === 1 && created.state.objects[0].createdAt === now)

check('a duplicate highlight on the exact range is refused so the client edits the original', codeOf(() => applyPersonalLayerOperations(created.state, [
  { op: 'create', object: { id: 'hl_00000002', type: 'highlight', textAnchor: anchorInput, style: { color: 'green' } } },
], { source, now })) === 'PERSONAL_LAYER_DUPLICATE_MARK')
check('a second commentary for the same question is refused', codeOf(() => applyPersonalLayerOperations(created.state, [
  { op: 'create', object: { id: 'cm_00000003', type: 'commentary', target: { kind: 'question', groupId: 'g1', questionId: 'q1' }, document: note } },
], { source, now })) === 'PERSONAL_LAYER_DUPLICATE_COMMENTARY')
check('commentary for a question outside the paper is refused', codeOf(() => applyPersonalLayerOperations(created.state, [
  { op: 'create', object: { id: 'cm_00000004', type: 'commentary', target: { kind: 'question', groupId: 'g1', questionId: 'q9' }, document: note } },
], { source, now })) === 'PERSONAL_TARGET_INVALID')

const failingBatch = [
  { op: 'update', objectId: 'hl_00000001', patch: { style: { color: 'blue' } } },
  { op: 'create', object: { id: 'bad', type: 'text-box', document: note, placement: layout } },
]
check('a failing batch leaves the layer untouched', codeOf(() => applyPersonalLayerOperations(created.state, failingBatch, { source, now })) === 'PERSONAL_LAYER_REQUEST_INVALID'
  && created.state.objects[0].style.color === 'yellow' && created.state.version === 1)

const later = '2026-09-28T10:05:00.000Z'
const updated = applyPersonalLayerOperations(created.state, [
  { op: 'update', objectId: 'hl_00000001', patch: { style: { color: 'pink' } } },
  { op: 'update', objectId: 'nt_00000001', patch: { placement: { ...layout, xMm: 10 } } },
  { op: 'update', objectId: 'tb_00000001', patch: { placement: { kind: 'appendix', origin: layout } } },
], { source, now: later })
const byId = Object.fromEntries(updated.state.objects.map((object) => [object.id, object]))
check('updates change style/placement, bump object revision and time', byId.hl_00000001.style.color === 'pink'
  && byId.hl_00000001.revision === 2 && byId.hl_00000001.updatedAt === later && byId.hl_00000001.createdAt === now
  && byId.nt_00000001.placement.xMm === 10 && byId.tb_00000001.placement.kind === 'appendix'
  && byId.tb_00000001.placement.origin.pageId === 'page-2')
check('a highlight cannot be patched with document text', codeOf(() => applyPersonalLayerOperations(updated.state, [
  { op: 'update', objectId: 'hl_00000001', patch: { document: note } },
], { source, now })) === 'PERSONAL_LAYER_REQUEST_INVALID')
check('a text box cannot move to the appendix without its origin', codeOf(() => applyPersonalLayerOperations(created.state, [
  { op: 'update', objectId: 'tb_00000001', patch: { placement: { kind: 'appendix' } } },
], { source, now })) === 'PERSONAL_PLACEMENT_INVALID')
for (const [label, placement] of [
  ['NaN coordinate', { ...layout, xMm: Number.NaN }],
  ['Infinity coordinate', { ...layout, yMm: Number.POSITIVE_INFINITY }],
  ['negative coordinate', { ...layout, xMm: -1 }],
  ['string coordinate', { ...layout, xMm: '10' }],
  ['zero width', { ...layout, widthMm: 0 }],
  ['viewport pixels', { ...layout, xPx: 10 }],
  ['path-like layout id', { ...layout, layoutId: '../../etc/passwd ' }],
  ['auto placement on text box', { kind: 'auto-near-anchor' }],
]) {
  check(`placement rejects ${label}`, codeOf(() => applyPersonalLayerOperations(created.state, [
    { op: 'update', objectId: 'tb_00000001', patch: { placement } },
  ], { source, now })) === 'PERSONAL_PLACEMENT_INVALID')
}
check('arbitrary CSS colours are rejected', codeOf(() => applyPersonalLayerOperations(created.state, [
  { op: 'update', objectId: 'hl_00000001', patch: { style: { color: '#ff0000' } } },
], { source, now })) === 'PERSONAL_STYLE_INVALID')
check('client-supplied owner fields are rejected', codeOf(() => applyPersonalLayerOperations(empty, [
  { op: 'create', object: { id: 'tb_00000009', type: 'text-box', document: note, placement: layout, createdBy: 'other-user' } },
], { source, now })) === 'PERSONAL_LAYER_REQUEST_INVALID')
check('invalid personal text inside an object is rejected', codeOf(() => applyPersonalLayerOperations(empty, [
  { op: 'create', object: { id: 'tb_00000009', type: 'text-box', document: withContent([{ type: 'heading' }]), placement: layout } },
], { source, now })) === 'PERSONAL_TEXT_INVALID')

const removed = applyPersonalLayerOperations(updated.state, [{ op: 'delete', objectId: 'tb_00000001' }], { source, now: later })
check('delete removes the object and tombstones its id', removed.state.objects.every((o) => o.id !== 'tb_00000001')
  && removed.state.deletedObjectIds.includes('tb_00000001'))
check('a deleted id cannot be resurrected by a later create', codeOf(() => applyPersonalLayerOperations(removed.state, [
  { op: 'create', object: { id: 'tb_00000001', type: 'text-box', document: note, placement: layout } },
], { source, now })) === 'PERSONAL_LAYER_OBJECT_EXISTS')
check('updating a missing object fails', codeOf(() => applyPersonalLayerOperations(removed.state, [
  { op: 'update', objectId: 'tb_00000001', patch: { placement: layout } },
], { source, now })) === 'PERSONAL_LAYER_OBJECT_MISSING')
check('batches above the operation limit are rejected', codeOf(() => applyPersonalLayerOperations(empty, Array.from(
  { length: PERSONAL_LAYER_MAX_OPERATIONS + 1 },
  (_, index) => ({ op: 'create', object: { id: `tb_${String(index).padStart(8, '0')}`, type: 'text-box', document: note, placement: layout } }),
), { source, now })) === 'PERSONAL_LAYER_LIMIT')
check('a layer bound to another source revision refuses operations', codeOf(() => applyPersonalLayerOperations(created.state, [
  { op: 'delete', objectId: 'hl_00000001' },
], { source: revised, now })) === 'PERSONAL_ANCHOR_SOURCE_MISMATCH')

const layerSnapshot = createPersonalLayerSnapshot(updated.state)
const digestBefore = layerSnapshot.objectsDigest
updated.state.objects[0].style.color = 'green'
check('layer snapshot is frozen and unaffected by later edits', layerSnapshot.objects[0].style.color === 'pink'
  && Object.isFrozen(layerSnapshot.objects[0]) && layerSnapshot.layerVersion === 2
  && layerSnapshot.objectsDigest === digestBefore)

// ---- commentary targets from a real Canonical publication -------------------

{
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { DatabaseSync } = await import('node:sqlite')
  const { publishCanonicalPaperPublication } = await import('../server/paper-canonical/publication.mjs')
  const { createCanonicalConsumerRuntime } = await import('../server/paper-canonical/consumerRuntime.mjs')
  const { makeClozeGrammarCanonicalReferenceFixture } = await import('../test-fixtures/paper-canonical/clozeGrammarReferenceFixture.mjs')
  const fixture = makeClozeGrammarCanonicalReferenceFixture()
  const publicationDir = mkdtempSync(path.join(tmpdir(), 'eqb-personal-source-'))
  const db = new DatabaseSync(path.join(publicationDir, 'publication.sqlite'))
  try {
    publishCanonicalPaperPublication({ rootDir: publicationDir, db, request: fixture.request, sourceAssetVersion: 1, sourceAsset: fixture.sourceAsset })
    const consumption = createCanonicalConsumerRuntime({ rootDir: publicationDir, db }).load({ paperId: fixture.source.paperId, consumerId: 'screen' })
    const paperSource = buildPersonalLayerSource(consumption)
    const textQuestionIds = new Set(paperSource.streams.flatMap((stream) => stream.leaves
      .filter((leaf) => leaf.kind === 'question-stem' || leaf.kind === 'option')
      .map((leaf) => (leaf.kind === 'option' ? leaf.id.slice(0, leaf.id.lastIndexOf(':')) : leaf.id))))
    const blankOnly = paperSource.commentaryTargets.questions.filter((target) => !textQuestionIds.has(target.questionId))
    check('grammar-fill and seven-choice questions without visible stems are commentary targets',
      blankOnly.some((target) => target.groupId.includes('grammar-fill'))
      && blankOnly.some((target) => target.groupId.includes('seven-choices')), JSON.stringify(blankOnly.slice(0, 2)))
    check('writing groups are writing-task targets, not questions',
      paperSource.commentaryTargets.writingTasks.length === 2
      && !paperSource.commentaryTargets.questions.some((target) => paperSource.commentaryTargets.writingTasks.includes(target.groupId)))
    const blank = blankOnly[0]
    const withBlank = applyPersonalLayerOperations(createEmptyPersonalLayerState(paperSource), [
      { op: 'create', object: { id: 'cm_blank_001', type: 'commentary', target: { kind: 'question', ...blank }, document: note } },
      { op: 'create', object: { id: 'cm_write_001', type: 'commentary', target: { kind: 'writing-task', groupId: paperSource.commentaryTargets.writingTasks[0] }, document: note } },
    ], { source: paperSource, now })
    check('commentary binds to a blank-only question and a writing task', withBlank.state.objects.length === 2)
    check('a question from another group is refused', codeOf(() => applyPersonalLayerOperations(createEmptyPersonalLayerState(paperSource), [
      { op: 'create', object: { id: 'cm_cross_001', type: 'commentary', target: { kind: 'question', groupId: paperSource.commentaryTargets.writingTasks[0], questionId: blank.questionId }, document: note } },
    ], { source: paperSource, now })) === 'PERSONAL_TARGET_INVALID')
    check('a writing group cannot pose as a question-less objective group', codeOf(() => applyPersonalLayerOperations(createEmptyPersonalLayerState(paperSource), [
      { op: 'create', object: { id: 'cm_cross_002', type: 'commentary', target: { kind: 'writing-task', groupId: blank.groupId }, document: note } },
    ], { source: paperSource, now })) === 'PERSONAL_TARGET_INVALID')
  } finally {
    db.close()
    rmSync(publicationDir, { recursive: true, force: true })
  }
}

// ---- appendix ordering (#489 §8) -------------------------------------------

const appendixEntry = (id, pageIndex, yMm, xMm) => ({ id, pageIndex, yMm, xMm })
const appendixOrder = (entries) => JSON.stringify(orderAppendixEntries(entries))
check('appendix orders positioned entries by page, y, then x', appendixOrder([
  appendixEntry('b', 0, 200, 10),
  appendixEntry('a', 1, 10, 10),
  appendixEntry('c', 0, 10, 20),
  appendixEntry('d', 0, 10, 10),
]) === JSON.stringify(['d', 'c', 'b', 'a']))
check('appendix breaks position ties by id', appendixOrder([
  appendixEntry('n2', 0, 10, 10),
  appendixEntry('n1', 0, 10, 10),
  appendixEntry('n3', 0, 10, 10),
]) === JSON.stringify(['n1', 'n2', 'n3']))
check('appendix sends unpositioned entries last in id order', appendixOrder([
  appendixEntry('z', null, null, null),
  appendixEntry('a', 2, 10, 10),
  appendixEntry('m', null, 10, 10),
  appendixEntry('b', 0, 10, 10),
]) === JSON.stringify(['b', 'a', 'm', 'z']))
{
  const entries = [
    appendixEntry('e3', 1, 40, 0),
    appendixEntry('e1', 0, 90, 5),
    appendixEntry('e2', 0, 20, 1),
    appendixEntry('e4', null, null, null),
  ]
  const shuffled = [entries[2], entries[0], entries[3], entries[1]]
  check('appendix ordering is input-order independent', JSON.stringify(orderAppendixEntries(entries))
    === JSON.stringify(orderAppendixEntries(shuffled)))
}

// ---- note placement (#489 4c, shared module) --------------------------------

{
  const MM = 96 / 25.4
  const frame = { pageId: 'p1', leftPx: 0, topPx: 0, widthMm: 210, heightMm: 297 }
  // Margins 30mm both sides → 26mm-wide margin cards; the anchor sits right of
  // the page centre, so the right margin is the near side.
  const contentBox = { leftPx: 30 * MM, rightPx: 180 * MM }
  const anchorRects = [{ left: 120 * MM, top: 100 * MM, width: 40 * MM, height: 5 * MM }]
  const heights = { margin: 20, flow: 24 }
  const freeEverywhere = () => true
  const inkedEverywhere = () => false

  const marginPlacement = placeNoteNearAnchor({
    anchorRects, frames: [frame], flowWidthMm: 56, heightMm: heights, probe: freeEverywhere, contentBox,
  })
  check('note placement prefers the side margin over the flow',
    marginPlacement?.slot === 'margin' && marginPlacement?.fits === true
    && Math.abs(marginPlacement.xMm - 182) < 0.01 && Math.abs(marginPlacement.yMm - 100) < 0.01,
    JSON.stringify(marginPlacement))

  const nearSide = placeNoteNearAnchor({
    anchorRects: [{ ...anchorRects[0], left: 40 * MM }], frames: [frame], flowWidthMm: 56, heightMm: heights, probe: freeEverywhere, contentBox,
  })
  check('note placement picks the margin side nearer the anchor',
    nearSide?.slot === 'margin' && Math.abs(nearSide.xMm - 2) < 0.01,
    JSON.stringify(nearSide))

  // Occupy the near margin's first candidate rect exactly: the 1mm gap rule
  // must push the card down in 4mm steps to the first clearing strip.
  const occupied = [{ left: 182 * MM, top: 100 * MM, width: 26 * MM, height: 20 * MM }]
  const dodged = placeNoteNearAnchor({
    anchorRects, frames: [frame], flowWidthMm: 56, heightMm: heights, probe: freeEverywhere, contentBox, occupied,
  })
  check('note placement dodges occupied cards with a 1mm gap',
    dodged?.slot === 'margin' && Math.abs(dodged.yMm - 124) < 0.01,
    JSON.stringify(dodged))

  const nowhere = placeNoteNearAnchor({
    anchorRects, frames: [frame], flowWidthMm: 56, heightMm: heights, probe: inkedEverywhere, contentBox,
  })
  check('note placement reports fits:false when every strip is inked',
    nowhere?.fits === false && nowhere?.slot === 'flow',
    JSON.stringify(nowhere))

  const noContentBox = placeNoteNearAnchor({
    anchorRects, frames: [frame], flowWidthMm: 56, heightMm: heights, probe: freeEverywhere,
  })
  check('note placement skips the margin without a content box',
    noContentBox?.slot === 'flow' && Math.abs(noContentBox.xMm - 120) < 0.01 && noContentBox.yMm === 107,
    JSON.stringify(noContentBox))
}

// ---- appendix marker placement (#489 5c, shared module) ---------------------

{
  const { appendixMarkerPosition, rectsOverlapWithGap } = await import('../shared/personal-paper-layer/index.mjs')
  // Anchor right of the page centre? No — left of it (40 < 170), so the
  // marker centers in the left margin (0..30mm) at the anchor's first line.
  const base = {
    anchorRectMm: { leftMm: 40, topMm: 100 },
    contentBoxLeftMm: 30,
    contentBoxRightMm: 180,
    pageWidthMm: 210,
    contentBoxTopMm: 0,
    contentBoxBottomMm: 257,
  }
  const asRect = ({ xMm, yMm, widthMm, heightMm }) => ({ left: xMm, top: yMm, width: widthMm, height: heightMm })

  const resting = appendixMarkerPosition({ ...base })
  check('appendix marker keeps its margin-centered spot when nothing is occupied',
    resting && resting.centered === true && resting.moved === null && resting.blocked === false
    && Math.abs(resting.xMm - 15) < 0.01 && Math.abs(resting.yMm - 100) < 0.01
    && Math.abs(resting.rectMm.xMm - 10.5) < 0.01 && resting.rectMm.widthMm > 0 && resting.rectMm.heightMm > 0,
    JSON.stringify(resting))

  // Occupy the marker's resting rect exactly with a 20mm-tall card: the 1mm
  // gap rule must step the marker down in 4mm steps to the first clear strip.
  const blockedCard = { xMm: 10.5, yMm: 100, widthMm: 9, heightMm: 20 }
  const dodged = appendixMarkerPosition({ ...base, occupiedRectsMm: [blockedCard] })
  check('appendix marker dodges an occupied card downward with a 1mm gap',
    dodged && dodged.moved === 'down' && dodged.blocked === false && Math.abs(dodged.yMm - 124) < 0.01
    && !rectsOverlapWithGap(asRect(dodged.rectMm), asRect(blockedCard), 1),
    JSON.stringify(dodged))

  // Anchor near the page bottom: downward has no room below the content box,
  // so the search falls back upward from the anchor line.
  const nearBottom = { ...base, anchorRectMm: { leftMm: 40, topMm: 250 } }
  const bottomCard = { xMm: 10.5, yMm: 250, widthMm: 9, heightMm: 20 }
  const upward = appendixMarkerPosition({ ...nearBottom, occupiedRectsMm: [bottomCard] })
  check('appendix marker falls back upward near the page bottom',
    upward && upward.moved === 'up' && upward.blocked === false && Math.abs(upward.yMm - 242) < 0.01
    && !rectsOverlapWithGap(asRect(upward.rectMm), asRect(bottomCard), 1)
    && upward.yMm >= base.contentBoxTopMm,
    JSON.stringify(upward))

  const first = appendixMarkerPosition({ ...base })
  const second = appendixMarkerPosition({ ...base, occupiedRectsMm: [first.rectMm] })
  check('two appendix markers on the same line do not overlap',
    first && second && second.moved === 'down' && Math.abs(second.yMm - 108) < 0.01
    && !rectsOverlapWithGap(asRect(first.rectMm), asRect(second.rectMm), 1),
    JSON.stringify({ first: first.rectMm, second: second.rectMm }))

  const originResting = appendixMarkerPosition({ origin: { xMm: 30, yMm: 40 } })
  check('a text-box marker keeps its stored origin when nothing is occupied',
    originResting && originResting.centered === false && originResting.moved === null && originResting.blocked === false
    && originResting.xMm === 30 && originResting.yMm === 40,
    JSON.stringify(originResting))
  const originCard = { xMm: 30, yMm: 40, widthMm: 20, heightMm: 20 }
  const originDodged = appendixMarkerPosition({ origin: { xMm: 30, yMm: 40 }, contentBoxBottomMm: 257, occupiedRectsMm: [originCard] })
  check('an occupied origin applies the same downward search at the same x',
    originDodged && originDodged.centered === false && originDodged.moved === 'down'
    && originDodged.xMm === 30 && Math.abs(originDodged.yMm - 64) < 0.01
    && !rectsOverlapWithGap(asRect(originDodged.rectMm), asRect(originCard), 1),
    JSON.stringify(originDodged))

  const nowhere = appendixMarkerPosition({ ...base, occupiedRectsMm: [{ xMm: 0, yMm: 0, widthMm: 210, heightMm: 297 }] })
  check('a fully occupied page keeps the original marker spot and reports blocked',
    nowhere && nowhere.moved === null && nowhere.blocked === true
    && Math.abs(nowhere.xMm - 15) < 0.01 && Math.abs(nowhere.yMm - 100) < 0.01,
    JSON.stringify(nowhere))
}

console.log(failed === 0 ? '\nverify-personal-paper-layer: all checks passed' : `\nverify-personal-paper-layer: ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
