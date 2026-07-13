#!/usr/bin/env node
/**
 * Cut ⑧ (error-copy-mainline) verification: MySpacePage +
 * DraftPaperWorkbench error strings turned into teacher-readable copy via
 * `describeError`.
 *
 * Covers:
 *   1. describeError() pure-function contract: human copy in the shape
 *      "{task}没成功，可以再试一次。", never leaks the raw Error.message /
 *      String(error) into the returned string, and calls console.error with
 *      the original error for devtools troubleshooting.
 *   2. Source-level negative grep: the old
 *      `error instanceof Error ? error.message : String(error)` pattern has
 *      zero remaining occurrences in the two target files.
 *   3. MySpacePage failure state: renders a "重新加载" retry button wired to
 *      the existing load() function, and the error message renders in one
 *      place only (not duplicated header + content area).
 *   4. DraftPaperWorkbench regression guard: save/export error catch blocks
 *      do not clear draftPaper / titleDraft (no lost work on failure).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const root = path.resolve(here, '..')

let passed = 0
let failed = 0
function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`)
  }
}

function readSrc(relPath) {
  return readFileSync(path.join(root, relPath), 'utf8')
}

const MY_SPACE_PATH = 'app/src/features/my-space/MySpacePage.tsx'
const WORKBENCH_PATH = 'app/src/features/draft-paper/DraftPaperWorkbench.tsx'
const ERROR_COPY_PATH = 'app/src/features/shared/errorCopy.ts'

console.log('== describeError pure-function contract ==')
{
  // The source is TypeScript; strip the type annotation for a plain-JS eval
  // rather than dragging in a TS toolchain for a 4-line function.
  const src = readSrc(ERROR_COPY_PATH)
  const jsSrc = src.replace('export function describeError(task: string, error: unknown): string {', 'export function describeError(task, error) {')
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(jsSrc).toString('base64')
  const { describeError } = await import(moduleUrl)

  const calls = []
  const originalConsoleError = console.error
  console.error = (...args) => calls.push(args)

  const fromError = describeError('加载个人空间', new Error('502 Bad Gateway from upstream'))
  const fromString = describeError('保存草稿卷', 'plain string failure')
  const fromUndefined = describeError('导出 PDF', undefined)

  console.error = originalConsoleError

  assert('Error input produces human copy', fromError === '加载个人空间没成功，可以再试一次。', fromError)
  assert('string input produces human copy', fromString === '保存草稿卷没成功，可以再试一次。', fromString)
  assert('undefined input produces human copy', fromUndefined === '导出 PDF没成功，可以再试一次。', fromUndefined)
  assert('Error.message never leaks into output', !fromError.includes('502 Bad Gateway'), fromError)
  assert('raw string never leaks into output', !fromString.includes('plain string failure'), fromString)
  assert('console.error called for each invocation (devtools troubleshooting kept)', calls.length === 3, `calls=${calls.length}`)
  assert('console.error receives the original error object', calls[0][1] instanceof Error, String(calls[0]?.[1]))
}

console.log('== negative grep: old error-string pattern has zero residue ==')
{
  const oldPattern = /error instanceof Error \? error\.message : String\(error\)/
  const mySpaceSrc = readSrc(MY_SPACE_PATH)
  const workbenchSrc = readSrc(WORKBENCH_PATH)
  assert('MySpacePage.tsx has zero raw error-string occurrences', !oldPattern.test(mySpaceSrc))
  assert('DraftPaperWorkbench.tsx has zero raw error-string occurrences', !oldPattern.test(workbenchSrc))

  const mySpaceCount = (mySpaceSrc.match(/describeError\(/g) || []).length
  const workbenchCount = (workbenchSrc.match(/describeError\(/g) || []).length
  // my-space-shelf (docs/cuts/my-space-shelf/plan.md JC-1): the folder
  // create/rename/delete UI (3 of the original 6 call sites) was dropped
  // from MySpacePage in favor of select-only filter chips — folder
  // creation still lives in DraftPaperWorkbench's save dialog. The
  // remaining 3 sites (load/download/delete-artifact) still route every
  // catch block through describeError; the negative-regex assertion above
  // is the actual safety property and is unchanged.
  assert('MySpacePage.tsx uses describeError at all 3 remaining call sites', mySpaceCount === 3, `found ${mySpaceCount}`)
  // draft-student-field (E4) added an 11th call site: saveStudentLabel's catch
  // block routes its failure through describeError, same as every other
  // workbench mutation (updateTitle, persistItems, etc.).
  // draft-desk-b step3 added a 12th: the server-pagination fetch effect's
  // promise .catch routes through describeError('生成分页预览', error) — same
  // pattern this gate exists to enforce. (Promise-style .catch((error) =>
  // does not match the try/catch regex below, so that count stays 11.)
  // print-form added a 13th: setPrintForm's try/catch block routes its
  // failure through describeError('切换打印形态', error) — same pattern. This
  // one IS a real try/catch (not a promise .catch), so it also bumps the
  // catchBlocks count below from 11 to 12.
  assert('DraftPaperWorkbench.tsx uses describeError at all 13 call sites', workbenchCount === 13, `found ${workbenchCount}`)
}

console.log('== MySpacePage failure-state recovery + de-duplication ==')
{
  const src = readSrc(MY_SPACE_PATH)
  const errorBlockStart = src.indexOf("loadState === 'error' && (")
  assert('error-state block exists', errorBlockStart >= 0)
  const errorBlock = errorBlockStart >= 0 ? src.slice(errorBlockStart, errorBlockStart + 400) : ''
  assert('error-state block renders a retry button', /重新加载/.test(errorBlock))
  assert('retry button wires to the existing load() function', /onClick=\{\(\) => void load\(\)\}/.test(errorBlock))
  assert('retry button reuses the existing empty-cta style class', /my-space-empty-cta/.test(errorBlock))

  // De-dup: the header message paragraph must not render while in error
  // state (content-area error block is now the single render site).
  assert(
    'header message is gated off during error state (single render site)',
    /\{message && loadState !== 'error' && <p className="my-space-message"/.test(src),
  )
}

console.log('== DraftPaperWorkbench: errors do not clear work in progress ==')
{
  const src = readSrc(WORKBENCH_PATH)
  // Every catch block that sets an *Error / *Message state must not also
  // call setDraftPaper(null) / setTitleDraft('') in the same block — i.e.
  // the only setDraftPaper calls with a null/empty-reset payload appear
  // outside error handling.
  const catchBlocks = src.match(/catch \(error\) \{[\s\S]*?\n {4}\}/g) || []
  // print-form added a 12th real try/catch block: setPrintForm — see the
  // describeError call-site comment above.
  assert('found catch(error) blocks to inspect', catchBlocks.length === 12, `found ${catchBlocks.length}`)
  const clearsState = catchBlocks.filter((block) => /setDraftPaper\(null\)|setTitleDraft\(''\)/.test(block))
  assert('no catch(error) block clears draftPaper or titleDraft', clearsState.length === 0, `${clearsState.length} block(s) clear state`)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
