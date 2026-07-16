#!/usr/bin/env node
/**
 * Verification: similar-workbench-swap (E7, docs/cuts/similar-workbench-swap/plan.md).
 *
 * Static, source-level assertions only (plan.md 施工要点 6) — the behavioral
 * counterpart (real clicks against a live dev server) is
 * `docs/cuts/similar-workbench-swap/qa/dp2-similar-workbench-swap.mjs`
 * (plan.md 施工要点 7), run separately. This script checks:
 *
 *   1. ⇄ gate: exactly the four v2-supported groupTypes render the ⇄
 *      button; writing (and every other groupType) is gated out entirely.
 *   2. 替换 goes through the existing service-layer calls
 *      (deleteDraftPaperItem + addGroupToDraftPaper), never a bypass
 *      `fetch(` written inline in the component (verify anchor: "非旁路
 *      fetch").
 *   3. Undo-snapshot mutual exclusion: every "other mutation" handler
 *      (moveItem/handleDrop/togglePageBreak/deleteItem/undoDelete) clears
 *      BOTH clearReorderUndo() and clearReplaceUndo(), and both new swap
 *      actions (replace/add) clear both snapshot kinds before mutating.
 *   4. The swap drawer reuses `similarPassagesRecipeSummary` (shared with
 *      similar-passages-entry/E6) rather than inventing its own recipe copy.
 *   5. 加入 inserts immediately after the seed item (insertIndex: seedIndex
 *      + 1) — never appends to the volume's end.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

const workbench = read('app/src/features/draft-paper/DraftPaperWorkbench.tsx')
const rail = read('app/src/features/draft-paper/DraftPaperRail.tsx')
const draftPapersService = read('app/src/services/draftPapers.ts')

console.log('== 1. ⇄ entry gate: exactly the four v2 groupTypes, writing hidden ==')
{
  const setMatch = workbench.match(/SWAP_SUPPORTED_GROUP_TYPES = new Set<GroupType>\(\[([^\]]+)\]\)/)
  assert('SWAP_SUPPORTED_GROUP_TYPES literal found', Boolean(setMatch), workbench.slice(0, 0))
  const groupTypes = setMatch ? setMatch[1].split(',').map((entry) => entry.trim().replace(/'/g, '')) : []
  assert(
    'gate set is exactly reading/cloze/seven_choices/grammar_cloze (no more, no less)',
    groupTypes.length === 4 &&
      ['reading', 'cloze', 'seven_choices', 'grammar_cloze'].every((groupType) => groupTypes.includes(groupType)),
    `found: ${groupTypes.join(', ')}`,
  )
  assert('writing is not in the gate set', !groupTypes.includes('writing'))
  assert(
    'the ⇄ button JSX is actually gated by SWAP_SUPPORTED_GROUP_TYPES.has(...)',
    /SWAP_SUPPORTED_GROUP_TYPES\.has\(item\.questionGroup\.groupType\)/.test(workbench),
  )
}

console.log('== 2. 替换/加入 go through the service layer, never a bypass fetch ==')
{
  // Every fetch() call in this component must live inside services/draftPapers.ts
  // or services/similarQuestions.ts (imported functions) — the component
  // itself defines zero raw `fetch(` calls, before or after this cut.
  assert('DraftPaperWorkbench.tsx defines no raw fetch( calls of its own', !/(?<!\.)\bfetch\(/.test(workbench))

  const replaceFn = workbench.match(/async function applySwapReplace[\s\S]*?\n  \}/)?.[0] || ''
  assert('applySwapReplace found', replaceFn.length > 0)
  assert('applySwapReplace calls deleteDraftPaperItem (service layer)', /await deleteDraftPaperItem\(/.test(replaceFn))
  assert('applySwapReplace calls addGroupToDraftPaper (service layer)', /await addGroupToDraftPaper\(/.test(replaceFn))
  assert(
    'applySwapReplace passes the seed item\'s own pageBreakBefore through (分页是位置意图，随槽位不随内容)',
    /pageBreakBefore = swapSeedItem\.pageBreakBefore/.test(replaceFn) && /pageBreakBefore,?\s*\}\)/.test(replaceFn),
  )

  const undoReplaceFn = workbench.match(/async function undoSwapReplace[\s\S]*?\n  \}/)?.[0] || ''
  assert('undoSwapReplace found', undoReplaceFn.length > 0)
  assert('undoSwapReplace deletes the added item then restores the removed one', /await deleteDraftPaperItem\([\s\S]*await restoreDraftPaperItem\(/.test(undoReplaceFn))

  assert(
    'services/draftPapers.ts exposes addGroupToDraftPaper hitting the existing per-draft items route (no server change)',
    /export async function addGroupToDraftPaper[\s\S]*?\/api\/draft-papers\/\$\{encodeURIComponent\(draftPaperId\)\}\/items/.test(draftPapersService),
  )
}

console.log('== 3. Undo-snapshot mutual exclusion (撤销快照互斥) ==')
{
  function fnBody(name) {
    const match = workbench.match(new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{[\\s\\S]*?\\n  \\}`))
    return match ? match[0] : ''
  }
  for (const name of ['moveItem', 'handleDrop', 'togglePageBreak', 'deleteItem', 'undoDelete']) {
    const body = fnBody(name)
    assert(`${name} found`, body.length > 0)
    assert(`${name} clears the reorder-undo snapshot`, /clearReorderUndo\(\)/.test(body), name)
    assert(`${name} ALSO clears the replace-undo snapshot (mutual exclusion)`, /clearReplaceUndo\(\)/.test(body), name)
  }
  const applyReplaceBody = workbench.match(/async function applySwapReplace[\s\S]*?\n  \}/)?.[0] || ''
  const applyAddBody = workbench.match(/async function applySwapAdd[\s\S]*?\n  \}/)?.[0] || ''
  assert('applySwapReplace clears both snapshot kinds before mutating', /clearReorderUndo\(\)/.test(applyReplaceBody) && /clearReplaceUndo\(\)/.test(applyReplaceBody))
  assert('applySwapAdd clears both snapshot kinds before mutating', /clearReorderUndo\(\)/.test(applyAddBody) && /clearReplaceUndo\(\)/.test(applyAddBody))
}

console.log('== 4. Drawer reuses the shared recipe summary (no invented copy) ==')
{
  assert(
    'DraftPaperWorkbench.tsx imports similarPassagesRecipeSummary from the shared similar-passages module',
    /import \{ similarPassagesRecipeSummary,? .*\} from '\.\.\/similar-passages\/SimilarPassagesPanel'/.test(workbench),
  )
  assert(
    'the swapDrawer prop\'s recipeSummary is built from similarPassagesRecipeSummary(...)',
    /recipeSummary: similarPassagesRecipeSummary\(/.test(workbench),
  )
  assert(
    'DraftPaperRail.tsx\'s swap drawer takes recipeSummary as a plain prop (no second recipe-copy source)',
    /recipeSummary: string/.test(rail),
  )
}

console.log('== 5. 加入 inserts immediately after the seed (邻插, never at volume end) ==')
{
  const applyAddBody = workbench.match(/async function applySwapAdd[\s\S]*?\n  \}/)?.[0] || ''
  assert('applySwapAdd found', applyAddBody.length > 0)
  assert(
    'applySwapAdd\'s insertIndex is seedIndex + 1 (immediately after the seed item)',
    /insertIndex: seedIndex \+ 1/.test(applyAddBody),
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
