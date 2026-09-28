#!/usr/bin/env node
// Undo/redo checks for #489 personal paper layers. History plans run through
// the real atomic operation contract, so a replay that names a tombstoned id,
// duplicates a mark or overwrites newer work fails here, not in the browser.
import {
  applyPersonalLayerOperations,
  createEmptyPersonalLayerState,
  createPersonalLayerHistory,
  personalObjectToCreateInput,
} from '../shared/personal-paper-layer/index.mjs'
import { createPersonalTextDocumentFromPlainText } from '../shared/personal-text/index.mjs'

let failed = 0
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS ${name}`)
  else {
    failed += 1
    console.log(`FAIL ${name}${detail ? ` ${detail}` : ''}`)
  }
}

const text = 'The plan worked. The plan failed later.'
const source = {
  paperId: 'paper-a',
  sourceRevision: 'rev-1',
  sourceProjectionVersion: 'paper-selection-source-v2',
  streams: [{
    streamId: 'g1/passage/body/p1', text, role: 'passage-body', groupId: 'g1', flow: true,
    leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: text.length }],
  }],
}
const anchor = (start, end) => ({
  paperId: 'paper-a',
  sourceRevision: 'rev-1',
  sourceProjectionVersion: 'paper-selection-source-v2',
  segments: [{ streamId: 'g1/passage/body/p1', start, end, exactText: text.slice(start, end) }],
})
const doc = (value) => createPersonalTextDocumentFromPlainText(value)

let seq = 0
const createId = () => `fresh_${String(++seq).padStart(4, '0')}`
let clock = 0
const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString()

let state = createEmptyPersonalLayerState(source)
let history = createPersonalLayerHistory({ createId })

function act(operations, options) {
  const before = state.objects
  state = applyPersonalLayerOperations(state, operations, { source, now: now() }).state
  history.record(before, operations, options)
}
function step(direction) {
  const plan = direction === 'undo' ? history.undo(state.objects) : history.redo(state.objects)
  if (!plan.ok) return plan
  if (plan.operations.length > 0) {
    state = applyPersonalLayerOperations(state, plan.operations, { source, now: now() }).state
  }
  plan.commit()
  return plan
}
const find = (id) => state.objects.find((object) => object.id === history.currentId(id))
const tryCode = (fn) => {
  try {
    fn()
    return null
  } catch (error) {
    return error.code || error.message
  }
}

// ---- create / style / delete round trips ----------------------------------

act([{ op: 'create', object: { id: 'mark_0001', type: 'highlight', textAnchor: anchor(4, 8), style: { color: 'yellow' } } }])
act([{ op: 'update', objectId: 'mark_0001', patch: { style: { color: 'green' } } }])
check('recorded color change', find('mark_0001').style.color === 'green')

step('undo')
check('undo restores the previous color', find('mark_0001').style.color === 'yellow')
step('redo')
check('redo reapplies the color', find('mark_0001').style.color === 'green')

act([{ op: 'delete', objectId: 'mark_0001' }])
check('delete removes the mark', state.objects.length === 0 && history.canUndo)
step('undo')
const restored = find('mark_0001')
check('undo delete re-creates the mark under a fresh id', restored && restored.id !== 'mark_0001' && restored.id.startsWith('fresh_'))
check('re-created mark keeps its content', restored?.style.color === 'green' && restored.textAnchor.segments[0].exactText === 'plan')
check('the tombstoned id is never reused', state.deletedObjectIds.includes('mark_0001'))

step('undo')
check('undo after re-create follows the logical id', find('mark_0001')?.style.color === 'yellow')
step('undo')
check('undo the original create removes the mark', state.objects.length === 0 && !history.canUndo)
check('undo past the start is empty', history.undo(state.objects).code === 'HISTORY_EMPTY')

step('redo')
check('redo create uses another fresh id', state.objects.length === 1 && find('mark_0001').id !== restored.id)
step('redo')
step('redo')
check('redo delete removes the re-created object', state.objects.length === 0)
check('redo past the end is empty', history.redo(state.objects).code === 'HISTORY_EMPTY')

// ---- a new action clears redo ----------------------------------------------

step('undo')
check('undo brings the mark back before a new action', state.objects.length === 1)
act([{ op: 'create', object: { id: 'line_0001', type: 'underline', textAnchor: anchor(21, 25), style: { ink: 'red' } } }])
check('a new action clears redo', !history.canRedo)

// ---- text sessions merge into one step ------------------------------------

act([{ op: 'create', object: { id: 'note_0001', type: 'anchored-note', textAnchor: anchor(0, 3), document: doc('a'), placement: { kind: 'auto-near-anchor' } } }], { mergeKey: 'text:note_0001:1' })
act([{ op: 'update', objectId: 'note_0001', patch: { document: doc('ab') } }], { mergeKey: 'text:note_0001:1' })
act([{ op: 'update', objectId: 'note_0001', patch: { document: doc('abc') } }], { mergeKey: 'text:note_0001:1' })
history.seal()
act([{ op: 'update', objectId: 'note_0001', patch: { document: doc('abcd') } }], { mergeKey: 'text:note_0001:1' })
step('undo')
check('a sealed run starts a new step', find('note_0001') && JSON.stringify(find('note_0001').document).includes('"abc"'))
step('undo')
check('create plus typing undoes as one step', !find('note_0001'))
step('redo')
check('redo of a merged create restores the final typed text', JSON.stringify(find('note_0001')?.document).includes('"abc"'))

// A merge run that returns to its start leaves no step behind.
const beforeCount = state.objects.length
history.seal()
const noteId = history.currentId('note_0001')
act([{ op: 'update', objectId: noteId, patch: { document: doc('x') } }], { mergeKey: 'text:note_0001:2' })
act([{ op: 'update', objectId: noteId, patch: { document: doc('abc') } }], { mergeKey: 'text:note_0001:2' })
const noop = history.undo(state.objects)
check(
  'an edit that returns to its start is not an undo step',
  noop.ok && noop.operations.length === 1 && noop.operations[0].op === 'delete' && state.objects.length === beforeCount,
  JSON.stringify(noop.operations),
)

// ---- batch with several objects -------------------------------------------

history = createPersonalLayerHistory({ createId })
state = createEmptyPersonalLayerState(source)
act([
  { op: 'create', object: { id: 'mark_0002', type: 'highlight', textAnchor: anchor(0, 3), style: { color: 'blue' } } },
  { op: 'create', object: { id: 'mark_0003', type: 'highlight', textAnchor: anchor(17, 20), style: { color: 'pink' } } },
])
act([{ op: 'delete', objectId: 'mark_0002' }, { op: 'delete', objectId: 'mark_0003' }])
step('undo')
check('undo a multi-delete batch restores both objects', state.objects.length === 2)
const ids = new Set(state.objects.map((object) => object.id))
check('each restored object gets its own fresh id', ids.size === 2 && !ids.has('mark_0002') && !ids.has('mark_0003'))
step('undo')
check('undo the batch create removes both', state.objects.length === 0)

// ---- stale history is dropped, never replayed over newer work -------------

history = createPersonalLayerHistory({ createId })
state = createEmptyPersonalLayerState(source)
act([{ op: 'create', object: { id: 'mark_0004', type: 'highlight', textAnchor: anchor(4, 8), style: { color: 'yellow' } } }])
act([{ op: 'update', objectId: 'mark_0004', patch: { style: { color: 'green' } } }])
// Someone else's change (server copy kept after a conflict) that history never saw.
state = applyPersonalLayerOperations(state, [{ op: 'update', objectId: 'mark_0004', patch: { style: { color: 'pink' } } }], { source, now: now() }).state
const stale = history.undo(state.objects)
check('undo refuses when the object no longer matches', stale.ok === false && stale.code === 'HISTORY_STALE')
check('stale history is cleared', !history.canUndo && !history.canRedo)
check('the unseen change is kept', find('mark_0004').style.color === 'pink')

// ---- plans are two-phase ---------------------------------------------------

history = createPersonalLayerHistory({ createId })
state = createEmptyPersonalLayerState(source)
act([{ op: 'create', object: { id: 'mark_0005', type: 'highlight', textAnchor: anchor(4, 8), style: { color: 'yellow' } } }])
act([{ op: 'delete', objectId: 'mark_0005' }])
// Another mark on the same range blocks the re-create; the apply fails.
state = applyPersonalLayerOperations(state, [{ op: 'create', object: { id: 'mark_0006', type: 'highlight', textAnchor: anchor(4, 8), style: { color: 'blue' } } }], { source, now: now() }).state
const blocked = history.undo(state.objects)
const blockedCode = blocked.ok ? tryCode(() => applyPersonalLayerOperations(state, blocked.operations, { source, now: now() })) : 'not-planned'
check('a rejected replay surfaces the contract error', blockedCode === 'PERSONAL_LAYER_DUPLICATE_MARK', blockedCode)
check('an uncommitted plan leaves history in place', history.canUndo && !history.canRedo)
check('the uncommitted re-create id is not bound', history.currentId('mark_0005') === 'mark_0005')

// ---- limit and create-input conversion -------------------------------------

history = createPersonalLayerHistory({ createId, limit: 3 })
state = createEmptyPersonalLayerState(source)
act([{ op: 'create', object: { id: 'mark_0007', type: 'highlight', textAnchor: anchor(4, 8), style: { color: 'yellow' } } }])
for (const color of ['green', 'blue', 'pink', 'yellow']) act([{ op: 'update', objectId: 'mark_0007', patch: { style: { color } } }])
let undone = 0
while (history.canUndo) {
  step('undo')
  undone += 1
}
check('history keeps at most the configured number of steps', undone === 3 && find('mark_0007').style.color === 'green')

const input = personalObjectToCreateInput(find('mark_0007'), 'copy_0001')
check('create input drops server metadata', input.id === 'copy_0001' && !('revision' in input) && !('createdAt' in input))
check('create input anchor drops server-derived context', !('prefix' in input.textAnchor.segments[0]) && !('leafIds' in input.textAnchor.segments[0]) && !('anchorVersion' in input.textAnchor))
check('create input is accepted by the operation contract', tryCode(() => applyPersonalLayerOperations(state, [{ op: 'create', object: { ...input, textAnchor: anchor(9, 15) } }], { source, now: now() })) === null)

if (failed > 0) {
  console.log(`\n${failed} personal layer history check(s) failed`)
  process.exit(1)
}
console.log('\npersonal layer history checks passed')
