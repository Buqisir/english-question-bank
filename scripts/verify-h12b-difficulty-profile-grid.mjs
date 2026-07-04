#!/usr/bin/env node
/**
 * verify-h12b-difficulty-profile-grid.mjs
 *
 * Source-level structural contract for H12-B PR1 — the read-only
 * six-dimension reading difficulty PROFILE GRID extracted from App.tsx into
 * app/src/workbench/detail/DifficultyProfileGrid.tsx, plus the shared label
 * maps moved into app/src/workbench/detail/readingProfileLabels.ts.
 *
 * What this guards (the seam the cut promises):
 *   1. DifficultyProfileGrid.tsx exists, exports the component, and reads its
 *      inputs (the showAi gate + {surfaceQuestionItem, difficultyProfileItem,
 *      mainBlockers, vocabBlockerWords, questionId}) as props — no state,
 *      no fetch, no reducer, no service import.
 *   2. The moved label maps + labelOf live in readingProfileLabels.ts and are
 *      re-imported by both the grid component and its render call site
 *      (single definition, no drift).
 *   3. The render call site no longer defines the moved label maps inline,
 *      imports the grid + the shared label helpers, and renders
 *      <DifficultyProfileGrid> with the six-input interface (the inline
 *      reading-profile-card JSX is gone from App.tsx).
 *   4. No import cycle: the grid + labels module never import from App.tsx.
 *
 * classic-retire-2-detail-view (2026-07): the `viewMode === 'detail'` JSX
 * branch — including the <DifficultyProfileGrid> render call — moved out of
 * App.tsx into app/src/features/question-detail/QuestionGroupDetailView.tsx.
 * The render-call-site assertions (section 4) now check that file instead of
 * App.tsx; the "App.tsx no longer defines the moved maps inline" checks stay
 * on App.tsx since that invariant is still about App.tsx specifically.
 *
 * Hermetic: readFileSync over the working-tree sources only, no git/main
 * dependency. Node can't import .tsx, so byte-identical RENDERING is proven by
 * the app build/typecheck (tsc -b && vite build) in verify-ci.mjs preflight;
 * this script locks the structural seam around it.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const GRID = path.join(rootDir, 'app/src/workbench/detail/DifficultyProfileGrid.tsx')
const LABELS = path.join(rootDir, 'app/src/workbench/detail/readingProfileLabels.ts')
const APP = path.join(rootDir, 'app/src/App.tsx')
const DETAIL_VIEW = path.join(rootDir, 'app/src/features/question-detail/QuestionGroupDetailView.tsx')

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

function read(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    console.error(`FAIL  Cannot read ${file}`)
    process.exit(1)
  }
}

const gridSrc = read(GRID)
const labelsSrc = read(LABELS)
const appSrc = read(APP)
const detailViewSrc = read(DETAIL_VIEW)
// The render call site: classic-retire-2-detail-view moved the detail branch
// (and its <DifficultyProfileGrid> render) out of App.tsx into
// QuestionGroupDetailView.tsx. Check whichever file actually renders it so
// this script keeps working if the render call site ever moves back.
const renderSiteSrc = /<DifficultyProfileGrid\b/.test(detailViewSrc) ? detailViewSrc : appSrc
const renderSiteLabel = renderSiteSrc === detailViewSrc ? 'QuestionGroupDetailView.tsx' : 'App.tsx'

console.log('\n==> H12-B PR1: DifficultyProfileGrid extraction contract\n')

// The 8 label maps moved into the shared module.
const MOVED_MAPS = [
  'surfaceQuestionTypeLabel',
  'answeringMoveLabel',
  'surfaceScopeLabel',
  'difficultyProfileLevelLabel',
  'infoSpanLabel',
  'mainBlockerLabel',
  'blockerRoleLabel',
  'blockerPositionLabel',
]

// --- 1. DifficultyProfileGrid component + props ---
console.log('1. DifficultyProfileGrid.tsx exports the component over a props interface:')
assert(/^export\s+function\s+DifficultyProfileGrid\b/m.test(gridSrc), 'DifficultyProfileGrid is exported as a component')
const PROPS = ['showAi', 'questionId', 'surfaceQuestionItem', 'difficultyProfileItem', 'mainBlockers', 'vocabBlockerWords']
const propsTypeMatch = gridSrc.match(/type\s+DifficultyProfileGridProps\s*=\s*\{([\s\S]*?)\n\}/)
assert(propsTypeMatch !== null, 'DifficultyProfileGridProps type is declared')
if (propsTypeMatch) {
  const block = propsTypeMatch[1]
  for (const prop of PROPS) {
    assert(new RegExp(`^\\s*${prop}\\b`, 'm').test(block), `DifficultyProfileGridProps declares prop "${prop}"`)
  }
  const declaredProps = block
    .split('\n')
    .map((line) => line.match(/^\s*([A-Za-z_$][\w$]*)[?]?\s*:/))
    .filter(Boolean)
    .map((m) => m[1])
  assert(
    declaredProps.length === PROPS.length,
    `DifficultyProfileGridProps has exactly ${PROPS.length} props (found ${declaredProps.length}: ${declaredProps.join(', ')})`,
  )
}

// --- 2. Purely presentational: no state / fetch / reducer / service in the grid ---
console.log('\n2. DifficultyProfileGrid is purely presentational (no state/fetch/service):')
assert(!/\buseState\b/.test(gridSrc), 'grid has no useState')
assert(!/\buseReducer\b/.test(gridSrc), 'grid has no useReducer')
assert(!/\buseEffect\b/.test(gridSrc), 'grid has no useEffect')
assert(!/\bfetch\(/.test(gridSrc) && !/from\s*['"][^'"]*services\//.test(gridSrc), 'grid does not fetch or import services')
// The render gate moved verbatim with the block.
assert(/showAi\s*&&\s*\(surfaceQuestionItem\s*\|\|\s*difficultyProfileItem\)/.test(gridSrc), 'grid preserves the showAi/(surface||profile) render gate')
assert(/className="difficulty-profile-grid"/.test(gridSrc), 'grid renders the six-dimension difficulty-profile-grid')
assert(/aria-label="六维难度画像"/.test(gridSrc), 'grid preserves the 六维难度画像 aria-label')

// --- 3. Shared label module owns the moved maps + labelOf ---
console.log('\n3. readingProfileLabels.ts owns the moved label maps + labelOf:')
for (const map of MOVED_MAPS) {
  assert(new RegExp(`export\\s+const\\s+${map}\\b`).test(labelsSrc), `readingProfileLabels exports "${map}"`)
}
assert(/export\s+function\s+labelOf\b/.test(labelsSrc), 'readingProfileLabels exports labelOf')
// Grid imports the labels it needs from the shared module.
assert(/from\s*['"]\.\/readingProfileLabels['"]/.test(gridSrc), 'grid imports from ./readingProfileLabels')

// --- 4. App.tsx no longer defines the moved maps/labelOf; the render call
// site (App.tsx, or QuestionGroupDetailView.tsx post classic-retire-2)
// imports the shared module + renders the grid ---
console.log(`\n4. App.tsx drops the inline maps; ${renderSiteLabel} imports the shared module, renders <DifficultyProfileGrid>:`)
for (const map of MOVED_MAPS) {
  assert(!new RegExp(`const\\s+${map}\\s*:`).test(appSrc), `App.tsx no longer defines "const ${map}"`)
}
assert(!/function\s+labelOf\b/.test(appSrc), 'App.tsx no longer defines function labelOf')
assert(!/className="reading-profile-card"/.test(appSrc), 'App.tsx no longer renders the inline reading-profile-card JSX')
assert(
  /import\s*\{\s*DifficultyProfileGrid\s*\}\s*from\s*['"][./]+(?:workbench\/detail\/)?DifficultyProfileGrid['"]/.test(renderSiteSrc),
  `${renderSiteLabel} imports DifficultyProfileGrid`,
)
assert(
  /import\s*\{[^}]*\blabelOf\b[^}]*\}\s*from\s*['"][./]+(?:workbench\/detail\/)?readingProfileLabels['"]/.test(renderSiteSrc),
  `${renderSiteLabel} imports labelOf from the shared label module`,
)
assert(
  /import\s*\{[^}]*\bmainBlockerLabel\b[^}]*\}\s*from\s*['"][./]+(?:workbench\/detail\/)?readingProfileLabels['"]/.test(renderSiteSrc),
  `${renderSiteLabel} imports mainBlockerLabel from the shared label module`,
)
const renderMatch = renderSiteSrc.match(/<DifficultyProfileGrid\b([\s\S]*?)\/>/)
assert(renderMatch !== null, `${renderSiteLabel} renders <DifficultyProfileGrid ... />`)
if (renderMatch) {
  const renderBlock = renderMatch[1]
  for (const prop of PROPS) {
    assert(new RegExp(`\\b${prop}=`).test(renderBlock), `${renderSiteLabel} passes prop "${prop}" to DifficultyProfileGrid`)
  }
}

// --- 5. No import cycle back into App ---
console.log('\n5. No import cycle: grid + labels never import from App.tsx:')
assert(!/from\s*['"][^'"]*App['"]/.test(gridSrc), 'DifficultyProfileGrid does not import from App')
assert(!/from\s*['"][^'"]*App['"]/.test(labelsSrc), 'readingProfileLabels does not import from App')

console.log(`\nResult: ${pass} passed, ${fail} failed\n`)
if (fail > 0) process.exit(1)
