#!/usr/bin/env node
/**
 * verify-h11b-paper-import-ai-view.mjs
 *
 * Source-level run-form contract for H11-B:
 *   1. paperImportAiAnalysisView.ts exists and exports all 14 moved names.
 *   2. PaperImportAiWorkbench.tsx imports all 14 names from the new module.
 *   3. None of the 14 names remain defined inline in PaperImportAiWorkbench.tsx.
 *
 * Node can't import .ts directly, so this is a source-level check (readFileSync
 * + regex), not a runtime import test. The real behavior gate is the app
 * build/typecheck in verify-ci.mjs preflight.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const VIEW_MODULE = path.join(
  rootDir,
  'app/src/features/paper-import-ai/paperImportAiAnalysisView.ts',
)
const WORKBENCH = path.join(
  rootDir,
  'app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx',
)

const MOVED_NAMES = [
  'asRecord',
  'asArray',
  'textOf',
  'statusLabel',
  'trapTypeLabel',
  'relationTypeLabel',
  'skillText',
  'optionNote',
  'correctLabelFromAnalysis',
  'answerState',
  'groupLetter',
  'firstPassageLine',
  'reasonLabel',
  'formatSize',
]

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

// --- Load sources ---
let viewSrc, workbenchSrc
try {
  viewSrc = readFileSync(VIEW_MODULE, 'utf8')
} catch {
  console.error(`FAIL  Cannot read ${VIEW_MODULE}`)
  process.exit(1)
}
try {
  workbenchSrc = readFileSync(WORKBENCH, 'utf8')
} catch {
  console.error(`FAIL  Cannot read ${WORKBENCH}`)
  process.exit(1)
}

console.log('\n==> H11-B: paperImportAiAnalysisView module contract\n')

// --- 1. Each moved name is present AND exported in the view module ---
console.log('1. All 14 names exported from paperImportAiAnalysisView.ts:')
for (const name of MOVED_NAMES) {
  // Match `export function name` or `export type name` or `export const name`
  const exported = new RegExp(
    `^export\\s+(function|type|const|class)\\s+${name}\\b`,
    'm',
  ).test(viewSrc)
  assert(exported, `${name} is exported from paperImportAiAnalysisView.ts`)
}

// --- 2. Workbench imports all 14 names from the new module ---
console.log('\n2. PaperImportAiWorkbench.tsx imports all 14 names from ./paperImportAiAnalysisView:')
// The import block references the module path
const importsSrc = workbenchSrc.match(
  /import\s*\{([^}]*)\}\s*from\s*['"]\.\/paperImportAiAnalysisView['"]/s,
)
assert(
  importsSrc !== null,
  'PaperImportAiWorkbench.tsx has an import from ./paperImportAiAnalysisView',
)
if (importsSrc) {
  const importedBlock = importsSrc[1]
  for (const name of MOVED_NAMES) {
    const imported = new RegExp(`\\b${name}\\b`).test(importedBlock)
    assert(imported, `${name} is imported from ./paperImportAiAnalysisView`)
  }
}

// --- 3. None of the 14 names remain defined inline in the workbench ---
console.log('\n3. None of the 14 names remain defined inline in PaperImportAiWorkbench.tsx:')
for (const name of MOVED_NAMES) {
  // "function name(" or "const name " or "type name " at non-import lines
  const definedInline = new RegExp(
    `^(?!import).*\\bfunction\\s+${name}\\s*\\(`,
    'm',
  ).test(workbenchSrc)
  assert(
    !definedInline,
    `${name} is NOT defined inline in PaperImportAiWorkbench.tsx`,
  )
}

// --- 4. No React/DOM/fetch in the view module ---
console.log('\n4. paperImportAiAnalysisView.ts contains no React/DOM/fetch:')
assert(
  !/(from ['"]react['"]|React\.|useState|useRef|useEffect|document\.|window\.|fetch\s*\()/.test(viewSrc),
  'No React/DOM/fetch in paperImportAiAnalysisView.ts',
)

// --- 5. AnalysisRecord type is exported from the view module ---
console.log('\n5. AnalysisRecord type exported from paperImportAiAnalysisView.ts:')
assert(
  /^export\s+type\s+AnalysisRecord\b/m.test(viewSrc),
  'AnalysisRecord type exported from paperImportAiAnalysisView.ts',
)

// --- Summary ---
console.log(`\nResult: ${pass} passed, ${fail} failed\n`)
if (fail > 0) process.exit(1)
