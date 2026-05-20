/**
 * Verifies the PaperSurface host interaction Module refactor.
 *
 * The reducer must concentrate interaction state and reset rules while
 * the harness remains the DOM/rendering adapter.
 */

import {
  changedFiles,
  createVerifier,
  readText,
  repoRootFrom,
  touchesAny,
} from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('PaperSurface host interaction verify')

const harness = readText(
  ROOT,
  'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx',
)
const reducer = readText(
  ROOT,
  'app/src/features/paper-intelligence/paperSurfaceHostInteraction.ts',
)
const files = changedFiles(ROOT)

section('host interaction module shape')

assert(
  reducer.includes('export type PaperSurfaceHostInteractionState'),
  'reducer exports PaperSurfaceHostInteractionState',
)
assert(
  reducer.includes('export type PaperSurfaceHostInteractionAction'),
  'reducer exports PaperSurfaceHostInteractionAction',
)
assert(
  reducer.includes('export const paperSurfaceHostInitialState'),
  'reducer exports paperSurfaceHostInitialState',
)
assert(
  reducer.includes('export function paperSurfaceHostInteractionReducer'),
  'reducer exports paperSurfaceHostInteractionReducer',
)

section('module purity')

const forbiddenReducerTerms = [
  /from ['"]react['"]/,
  /\buseState\b/,
  /\buseEffect\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bquerySelector\b/,
  /\bgetBoundingClientRect\b/,
  /\bscrollIntoView\b/,
  /\bHTMLElement\b/,
]

for (const pattern of forbiddenReducerTerms) {
  assert(!pattern.test(reducer), `reducer does not contain ${pattern.source}`)
}

section('harness uses reducer as interaction seam')

assert(
  harness.includes('useReducer'),
  'harness uses useReducer for host interaction state',
)
assert(
  harness.includes('paperSurfaceHostInteractionReducer'),
  'harness imports paperSurfaceHostInteractionReducer',
)
assert(
  harness.includes('paperSurfaceHostInitialState'),
  'harness imports paperSurfaceHostInitialState',
)

const removedUseStateNames = [
  'activeQuestionId',
  'activeEvidenceId',
  'activeInsightSection',
  'activeStructureTarget',
  'railLocked',
  'isStackedMode',
  'isWideDesktop',
]

for (const name of removedUseStateNames) {
  const useStatePattern = new RegExp(`\\[\\s*${name}\\s*,\\s*set[A-Z]`)
  assert(
    !useStatePattern.test(harness),
    `harness no longer declares useState pair for ${name}`,
  )
}

section('interaction reset rules')

const reducerMustContain = [
  'request-lecture-focus',
  'seed-support-evidence',
  'select-evidence',
  'toggle-insight',
  'close-insight',
  'toggle-structure-target',
  'toggle-rail-lock',
  'rail-escape',
  'sync-viewport',
  'resize',
]

for (const token of reducerMustContain) {
  assert(reducer.includes(token), `reducer handles ${token}`)
}

assert(
  /case 'toggle-insight':[\s\S]*activeStructureTarget:\s*null/.test(reducer),
  'toggle-insight clears activeStructureTarget',
)
assert(
  /case 'close-insight':[\s\S]*activeStructureTarget:\s*null/.test(reducer),
  'close-insight clears activeStructureTarget',
)
assert(
  /case 'rail-escape':[\s\S]*activeInsightSection:\s*null[\s\S]*activeStructureTarget:\s*null/.test(
    reducer,
  ),
  'rail-escape closes detail and clears activeStructureTarget',
)
assert(
  /case 'sync-viewport':[\s\S]*activeInsightSection:\s*null[\s\S]*railLocked:\s*false[\s\S]*activeStructureTarget:\s*null/.test(
    reducer,
  ),
  'sync-viewport clears insight, rail lock, and structure target',
)
assert(
  /case 'resize':[\s\S]*activeStructureTarget:\s*null/.test(reducer),
  'resize clears activeStructureTarget',
)

section('DOM adapter remains in harness')

assert(
  harness.includes('querySelector<HTMLElement>') && harness.includes('scrollIntoView'),
  'harness remains the DOM scroll adapter',
)
assert(
  harness.includes('StructureBraceOverlay'),
  'harness still renders StructureBraceOverlay',
)

section('forbidden runtime scopes unchanged')

const forbidden = [
  'app/src/shared-ui/papersurface/',
  'shared/papersurface/',
  'app/public/reports/',
  'server/',
  'package.json',
  'pnpm-lock.yaml',
  'app/package.json',
  'app/pnpm-lock.yaml',
]

for (const path of forbidden) {
  assert(!touchesAny(files, [path]), `${path} not modified`)
}

summary()
