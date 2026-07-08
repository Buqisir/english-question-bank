/**
 * Verifies the PaperSurface host interaction Module refactor.
 *
 * The reducer must concentrate interaction state and reset rules while
 * the harness remains the DOM/rendering adapter.
 *
 * H8: reducer reset rules are checked by running the exported reducer,
 * not by regexing switch branches.
 */

import {
  changedFiles,
  createVerifier,
  readText,
  repoRootFrom,
  touchesAny,
} from './lib/verifyScope.mjs'
import {
  paperSurfaceHostInitialState,
  paperSurfaceHostInteractionReducer,
} from '../app/src/features/paper-intelligence/paperSurfaceHostInteraction.ts'

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
const files = changedFiles(ROOT, { baseRef: 'github/main' })

function state(overrides = {}) {
  return {
    ...paperSurfaceHostInitialState,
    ...overrides,
  }
}

function sameValue(actual, expected) {
  if (actual === expected) return true
  if (typeof actual !== typeof expected) return false
  if (actual && expected && typeof actual === 'object') {
    return JSON.stringify(actual) === JSON.stringify(expected)
  }
  return false
}

function assertStateSubset(label, actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    assert(
      sameValue(actual[key], value),
      `${label}: ${key} === ${JSON.stringify(value)}`,
    )
  }
}

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

section('run-form reducer behavior')

assertStateSubset(
  'initial state',
  paperSurfaceHostInitialState,
  {
    activeQuestionId: null,
    activeEvidenceId: null,
    activeOptionLabel: null,
    activeInsightSection: null,
    activeStructureTarget: null,
    railLocked: false,
    isStackedMode: false,
    isWideDesktop: false,
  },
)

const focusedQuestion = paperSurfaceHostInteractionReducer(
  state({
    activeInsightSection: 'reading-a',
    railLocked: true,
  }),
  {
    type: 'request-lecture-focus',
    questionId: 'q-1',
    optionLabel: 'B',
    evidenceId: 'ev-1',
  },
)
assert(
  focusedQuestion.activeQuestionId === 'q-1' &&
    focusedQuestion.activeOptionLabel === 'B' &&
    focusedQuestion.activeEvidenceId === 'ev-1' &&
    focusedQuestion.activeInsightSection === null &&
    focusedQuestion.railLocked === false,
  'request-lecture-focus sets question focus and clears insight / rail lock',
)

const clearedLegacyFocus = paperSurfaceHostInteractionReducer(
  state({
    activeQuestionId: 'q-1',
    activeOptionLabel: 'B',
    activeEvidenceId: 'ev-1',
  }),
  {
    type: 'request-lecture-focus',
    questionId: 'q-1',
  },
)
assertStateSubset('legacy focus toggle off', clearedLegacyFocus, {
  activeQuestionId: null,
  activeOptionLabel: null,
  activeEvidenceId: null,
})

const supportEvidence = paperSurfaceHostInteractionReducer(state(), {
  type: 'seed-support-evidence',
  evidenceId: 'support-1',
})
assertStateSubset('seed-support-evidence', supportEvidence, {
  activeEvidenceId: 'support-1',
})

const optionEvidence = paperSurfaceHostInteractionReducer(supportEvidence, {
  type: 'seed-option-evidence',
  optionLabel: 'C',
  evidenceId: 'option-1',
})
assertStateSubset('seed-option-evidence', optionEvidence, {
  activeOptionLabel: 'C',
  activeEvidenceId: 'option-1',
})

const selectedOptionEvidence = paperSurfaceHostInteractionReducer(optionEvidence, {
  type: 'select-option-evidence',
  optionLabel: 'D',
  evidenceId: null,
})
assertStateSubset('select-option-evidence', selectedOptionEvidence, {
  activeOptionLabel: 'D',
  activeEvidenceId: null,
})

const selectedEvidence = paperSurfaceHostInteractionReducer(selectedOptionEvidence, {
  type: 'select-evidence',
  evidenceId: 'ev-2',
})
assertStateSubset('select-evidence', selectedEvidence, {
  activeEvidenceId: 'ev-2',
})

const ignoredEmptyEvidence = paperSurfaceHostInteractionReducer(selectedEvidence, {
  type: 'select-evidence',
  evidenceId: '',
})
assert(ignoredEmptyEvidence === selectedEvidence, 'empty select-evidence returns same state')

const structureTarget = {
  paperSection: 'reading-a',
  mode: 'paragraph',
  paragraphId: 'p-1',
}
const openedInsight = paperSurfaceHostInteractionReducer(
  state({
    activeStructureTarget: structureTarget,
  }),
  {
    type: 'toggle-insight',
    paperSection: 'reading-a',
  },
)
assertStateSubset('toggle-insight opens panel and clears structure target', openedInsight, {
  activeInsightSection: 'reading-a',
  activeStructureTarget: null,
})

const closedInsight = paperSurfaceHostInteractionReducer(openedInsight, {
  type: 'toggle-insight',
  paperSection: 'reading-a',
})
assertStateSubset('toggle-insight closes current panel', closedInsight, {
  activeInsightSection: null,
})

const closeInsight = paperSurfaceHostInteractionReducer(
  state({
    activeInsightSection: 'reading-b',
    activeStructureTarget: structureTarget,
  }),
  {
    type: 'close-insight',
  },
)
assertStateSubset('close-insight clears insight and structure target', closeInsight, {
  activeInsightSection: null,
  activeStructureTarget: null,
})

const openedStructureTarget = paperSurfaceHostInteractionReducer(state(), {
  type: 'toggle-structure-target',
  paperSection: 'reading-a',
  mode: 'paragraph',
  paragraphId: 'p-1',
})
assertStateSubset('toggle-structure-target opens paragraph target', openedStructureTarget, {
  activeStructureTarget: structureTarget,
})

const closedStructureTarget = paperSurfaceHostInteractionReducer(openedStructureTarget, {
  type: 'toggle-structure-target',
  paperSection: 'reading-a',
  mode: 'paragraph',
  paragraphId: 'p-1',
})
assertStateSubset('toggle-structure-target toggles same target closed', closedStructureTarget, {
  activeStructureTarget: null,
})

const switchedStructureTarget = paperSurfaceHostInteractionReducer(openedStructureTarget, {
  type: 'toggle-structure-target',
  paperSection: 'reading-a',
  mode: 'paragraph',
  paragraphId: 'p-2',
})
assertStateSubset('toggle-structure-target switches paragraph target', switchedStructureTarget, {
  activeStructureTarget: {
    paperSection: 'reading-a',
    mode: 'paragraph',
    paragraphId: 'p-2',
  },
})

const railLocked = paperSurfaceHostInteractionReducer(state(), {
  type: 'toggle-rail-lock',
})
assertStateSubset('toggle-rail-lock flips lock on', railLocked, {
  railLocked: true,
})

const escapeClosesInsightFirst = paperSurfaceHostInteractionReducer(
  state({
    activeInsightSection: 'reading-a',
    activeStructureTarget: structureTarget,
    railLocked: true,
  }),
  {
    type: 'rail-escape',
  },
)
assertStateSubset('rail-escape closes insight before rail lock', escapeClosesInsightFirst, {
  activeInsightSection: null,
  activeStructureTarget: null,
  railLocked: true,
})

const escapeUnlocksRail = paperSurfaceHostInteractionReducer(
  state({
    railLocked: true,
  }),
  {
    type: 'rail-escape',
  },
)
assertStateSubset('rail-escape unlocks rail when no insight is open', escapeUnlocksRail, {
  railLocked: false,
})

const idleState = state()
const idleEscape = paperSurfaceHostInteractionReducer(idleState, {
  type: 'rail-escape',
})
assert(idleEscape === idleState, 'idle rail-escape returns same state')

const syncedViewport = paperSurfaceHostInteractionReducer(
  state({
    activeInsightSection: 'reading-a',
    activeStructureTarget: structureTarget,
    railLocked: true,
  }),
  {
    type: 'sync-viewport',
    isStackedMode: true,
    isWideDesktop: false,
  },
)
assertStateSubset('sync-viewport updates viewport and clears transient focus', syncedViewport, {
  isStackedMode: true,
  isWideDesktop: false,
  activeInsightSection: null,
  activeStructureTarget: null,
  railLocked: false,
})

const resized = paperSurfaceHostInteractionReducer(
  state({
    activeQuestionId: 'q-1',
    activeStructureTarget: structureTarget,
  }),
  {
    type: 'resize',
  },
)
assert(
  resized.activeQuestionId === 'q-1' && resized.activeStructureTarget === null,
  'resize clears structure target without clearing question focus',
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

// surface-question-policy cut (2026-07-08, committed plan.md): narrowly
// authorized to edit PaperSurface.tsx/.css in ONE place (the question-list
// empty-stem policy). This was a blanket freeze written for the earlier
// host-interaction-reducer extraction PR; extend it the same way
// verify-paper-surface-module-v1.mjs's ALLOWED_DOWNSTREAM_* sets do,
// rather than loosen the whole `app/src/shared-ui/papersurface/` prefix.
const ALLOWED_PAPERSURFACE_FILES = new Set([
  'app/src/shared-ui/papersurface/PaperSurface.tsx',
  'app/src/shared-ui/papersurface/PaperSurface.css',
])

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
  const offenders =
    path === 'app/src/shared-ui/papersurface/'
      ? files.filter((f) => touchesAny([f], [path]) && !ALLOWED_PAPERSURFACE_FILES.has(f))
      : files.filter((f) => touchesAny([f], [path]))
  const label = offenders.length > 0 ? `${path} not modified (offenders: ${offenders.join(', ')})` : `${path} not modified`
  assert(offenders.length === 0, label)
}

summary()
