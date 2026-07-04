#!/usr/bin/env node
/**
 * verify-h12a-entry-modal.mjs
 *
 * Source-level structural contract for H12-A — Manual Entry form modal
 * extracted from App.tsx into app/src/workbench/EntryModal.tsx.
 *
 * What this guards (the seam the cut promises):
 *   1. EntryModal.tsx exists and exports the EntryModal component with the
 *      locked 5-prop interface {open, mode, initialDetail, onClose, onSaved}.
 *   2. EntryModal owns the ~7 form state slices + ~5 mutators + submit handler
 *      + the form helper fns/types (parseOptionText / createEntryFormFromDetail
 *      / defaultEntryForm / createEntryQuestion / EntryForm / EntryQuestionForm)
 *      that moved wholesale out of App.tsx.
 *   3. App.tsx no longer defines any of those moved names inline, imports
 *      EntryModal, and renders it with exactly the 5 props.
 *   4. savedCard byte-identity guard: the CreateQuestionGroupInput build + the
 *      createQuestionGroup/updateQuestionGroup service calls live in EntryModal
 *      (so onSaved receives the same `saved` object as before), and App's
 *      writeback (handleEntrySaved) branches on context.mode and still does the
 *      list / basket / preview / detail / dataStatus / workflow propagation.
 *
 * Node can't import .tsx directly, so this is a source-level check
 * (readFileSync + regex). The real behavior gate is the app build/typecheck
 * (tsc -b && vite build) in verify-ci.mjs preflight.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const ENTRY_MODAL = path.join(rootDir, 'app/src/workbench/EntryModal.tsx')
const APP = path.join(rootDir, 'app/src/App.tsx')

let pass = 0
let fail = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS  ${message}`)
    pass++
  } else {
    console.error(`  FAIL  ${message}`)
    fail++
  }
}

let modalSrc, appSrc
try {
  modalSrc = readFileSync(ENTRY_MODAL, 'utf8')
} catch {
  console.error(`FAIL  Cannot read ${ENTRY_MODAL}`)
  process.exit(1)
}
try {
  appSrc = readFileSync(APP, 'utf8')
} catch {
  console.error(`FAIL  Cannot read ${APP}`)
  process.exit(1)
}

console.log('\n==> H12-A: EntryModal extraction contract\n')

// --- 1. EntryModal exports + 5-prop interface ---
console.log('1. EntryModal.tsx exports the component with the 5-prop interface:')
assert(/^export\s+function\s+EntryModal\b/m.test(modalSrc), 'EntryModal is exported as a component')
const PROPS = ['open', 'mode', 'initialDetail', 'onClose', 'onSaved']
const propsTypeMatch = modalSrc.match(/export\s+type\s+EntryModalProps\s*=\s*\{([\s\S]*?)\n\}/)
assert(propsTypeMatch !== null, 'EntryModalProps type is declared and exported')
if (propsTypeMatch) {
  const block = propsTypeMatch[1]
  for (const prop of PROPS) {
    assert(new RegExp(`^\\s*${prop}\\b`, 'm').test(block), `EntryModalProps declares prop "${prop}"`)
  }
  // No 6th data prop beyond the locked 5 (key count guard).
  const declaredProps = block
    .split('\n')
    .map((line) => line.match(/^\s*([A-Za-z_$][\w$]*)\s*:/))
    .filter(Boolean)
    .map((m) => m[1])
  assert(
    declaredProps.length === PROPS.length,
    `EntryModalProps has exactly ${PROPS.length} props (found ${declaredProps.length}: ${declaredProps.join(', ')})`,
  )
}

// --- 2. The moved cluster lives in EntryModal ---
console.log('\n2. The moved form cluster lives in EntryModal.tsx:')
const MOVED_STATE = ['entryForm', 'entryMode', 'editingGroupId', 'entryStatus', 'entryError']
for (const slice of MOVED_STATE) {
  assert(
    new RegExp(`const\\s*\\[\\s*${slice}\\s*,`).test(modalSrc),
    `EntryModal owns useState slice "${slice}"`,
  )
}
const MOVED_FNS = [
  'function updateEntryField',
  'function updateEntryQuestion',
  'function addEntryQuestion',
  'function removeEntryQuestion',
  'async function handleEntrySubmit',
]
for (const fn of MOVED_FNS) {
  assert(modalSrc.includes(fn), `EntryModal defines ${fn}`)
}
const MOVED_HELPERS = [
  'function createEntryQuestion',
  'const defaultEntryForm',
  'function parseOptionText',
  'function formatOptionsText',
  'function createEntryFormFromDetail',
  'type EntryForm',
  'type EntryQuestionForm',
]
for (const helper of MOVED_HELPERS) {
  assert(modalSrc.includes(helper), `EntryModal defines ${helper}`)
}

// --- 3. App.tsx no longer defines the moved cluster; imports + renders modal ---
console.log('\n3. App.tsx no longer defines the moved cluster and renders <EntryModal>:')
const APP_GONE = [
  'function updateEntryField',
  'function updateEntryQuestion',
  'function addEntryQuestion',
  'function removeEntryQuestion',
  'async function handleEntrySubmit',
  'function createEntryQuestion',
  'const defaultEntryForm',
  'function parseOptionText',
  'function formatOptionsText',
  'function createEntryFormFromDetail',
  'type EntryForm =',
  'type EntryQuestionForm =',
]
for (const gone of APP_GONE) {
  assert(!appSrc.includes(gone), `App.tsx no longer defines "${gone}"`)
}
assert(
  /import\s*\{\s*EntryModal\s*\}\s*from\s*['"]\.\/workbench\/EntryModal['"]/.test(appSrc),
  'App.tsx imports EntryModal from ./workbench/EntryModal',
)
const renderMatch = appSrc.match(/<EntryModal\b([\s\S]*?)\/>/)
assert(renderMatch !== null, 'App.tsx renders <EntryModal ... />')
if (renderMatch) {
  const renderBlock = renderMatch[1]
  for (const prop of PROPS) {
    assert(new RegExp(`\\b${prop}=`).test(renderBlock), `App.tsx passes prop "${prop}" to EntryModal`)
  }
}

// --- 4. savedCard byte-identity seam ---
console.log('\n4. savedCard byte-identity seam (build in modal, propagate in App):')
// Service calls + input build live in the modal.
assert(modalSrc.includes('createQuestionGroup(input)'), 'EntryModal calls createQuestionGroup(input)')
assert(
  /updateQuestionGroup\(editingGroupId,\s*input\)/.test(modalSrc),
  'EntryModal calls updateQuestionGroup(editingGroupId, input)',
)
assert(
  /const\s+input:\s*CreateQuestionGroupInput\s*=\s*\{/.test(modalSrc),
  'EntryModal builds the CreateQuestionGroupInput',
)
// Modal hands the saved card to onSaved with the mode context.
assert(
  /onSaved\(\s*saved\s*,\s*\{\s*mode:\s*entryMode\s*\}\s*\)/.test(modalSrc),
  'EntryModal calls onSaved(saved, { mode: entryMode })',
)
// App no longer issues the question-group writes itself for the entry flow.
assert(!appSrc.includes('updateQuestionGroup'), 'App.tsx no longer references updateQuestionGroup')
// App writeback owns the cross-cutting propagation and branches on context.mode.
const savedHandler = appSrc.match(/async function handleEntrySaved\(([\s\S]*?)\n {2}\}/)
assert(savedHandler !== null, 'App.tsx defines handleEntrySaved writeback')
if (savedHandler) {
  const body = savedHandler[0]
  assert(/context\.mode === 'edit'/.test(body), 'handleEntrySaved branches on context.mode')
  assert(/setQuestionGroups\(/.test(body), 'handleEntrySaved updates question-group list')
  assert(/patchBasketItemFromSavedGroup\(saved\)/.test(body), 'handleEntrySaved patches basket from saved group')
  // classic-retire-3: previewDetails (the classic print-preview cache) was
  // deleted along with the rest of the classic viewMode==='preview' branch —
  // there is no cache left for handleEntrySaved to invalidate.
  assert(/fetchQuestionGroupDetail\(saved\.id\)/.test(body), 'handleEntrySaved refetches detail in edit mode')
  assert(/setDataStatus\('sqlite'\)/.test(body), "handleEntrySaved sets dataStatus to 'sqlite'")
  assert(/refreshPaperWorkflows\(\)/.test(body), 'handleEntrySaved refreshes paper workflows')
}

// --- 5. EntryModal does not import from App.tsx (no cycle) ---
console.log('\n5. EntryModal.tsx has no import cycle back into App:')
assert(!/from\s*['"][^'"]*App['"]/.test(modalSrc), 'EntryModal does not import from App')

console.log(`\nResult: ${pass} passed, ${fail} failed\n`)
if (fail > 0) process.exit(1)
