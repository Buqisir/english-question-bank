#!/usr/bin/env node
/**
 * Verification: section-chrome-on-solo-surface.
 *
 * Owner report (2026-07-08): the Paper Intelligence solo-group harness
 * (`PaperIntelligencePaperSurfaceHarness.tsx`) mounts a single group's
 * PaperSurface with no 节标题/指导语 above it — the "纸" starts blank
 * where the real卷面 would carry chrome text. PaperBrowsePage.tsx already
 * renders these blocks (partHeading/sectionHeading/instruction/group) when
 * streaming the whole `content.blocks` array; this cut brings the same
 * two block types (sectionHeading/instruction — NOT partHeading, which is
 * a 卷层 heading out of scope for a solo-group view) into the harness.
 *
 * Asserts:
 *  1. `groupChromeBlocks.ts` exists and exports `resolveGroupChromeBlocks` /
 *     `EMPTY_GROUP_CHROME`.
 *  2. Pure-function behavior against the REAL paper-2026-i fixture:
 *     - grammarFill group (owner's exact bug report): both sectionHeading
 *       AND instruction resolve (the "第二节…"/"阅读下面短文…" pair).
 *     - reading-a group: only sectionHeading resolves (no instruction
 *       block precedes it) — the partial case.
 *     - reading-b group (immediately preceded by another `group` block,
 *       not a heading): both resolve to null — the real "old asset /
 *       no chrome" case, zero placeholder.
 *     - sevenChoices group: both resolve (second real "both present" case,
 *       distinct section).
 *     - the partHeading text ("第二部分 阅读" / "第三部分…") never leaks
 *       into any resolved sectionHeading — proves the walk-back stops at
 *       partHeading and does not walk past it.
 *  3. Synthetic asset (no chrome blocks at all before a group): both
 *     resolve to null — `EMPTY_GROUP_CHROME` old-asset compatibility,
 *     independent of what today's fixtures happen to contain.
 *  4. `PaperIntelligencePaperSurfaceHarness.tsx` source:
 *     - imports `resolveGroupChromeBlocks` / `EMPTY_GROUP_CHROME` from
 *       `./groupChromeBlocks.ts`.
 *     - declares `groupChrome` state, resets it alongside the other
 *       per-load model state.
 *     - calls `setGroupChrome` in the cloze / grammarFill (both analysis
 *       and fallback-plain paths) and reading/sevenChoices branches.
 *     - does NOT call `setGroupChrome` inside the writing branch (writing
 *       groups already render their own equivalent chrome via
 *       WritingPageModel — no double heading).
 *     - renders `.pi-ps-group-chrome` gated on `!writingModel` AND
 *       `(groupChrome.sectionHeading || groupChrome.instruction)` — so a
 *       writing group, or a group with no such blocks, renders nothing.
 *  5. `paperIntelligencePaperSurfaceHarness.css` declares
 *     `.pi-ps-group-chrome` / `.pi-ps-group-chrome-section-heading` /
 *     `.pi-ps-group-chrome-instruction`.
 *  6. Forbidden-scope guard: PaperSurface.tsx, PaperSurface.css, and every
 *     file under `shared/papersurface/` are untouched by this cut (byte-
 *     identical to `git show HEAD:<path>` at the pre-cut commit is not
 *     checkable without a ref, so instead this asserts the harness/CSS
 *     diff-relevant files import nothing new from those modules beyond
 *     the existing `paperSurfaceTokens` re-use pattern already used by
 *     `WritingPaperPage.tsx`).
 *  7. Housekeeping: this script is registered in verify-ci.mjs and marked
 *     `yes` in scripts/README.md.
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

console.log('section-chrome-on-solo-surface verify')

// ─── 1. groupChromeBlocks.ts exists ───
const chromeSrc = read('app/src/features/paper-intelligence/groupChromeBlocks.ts')
assert(
  'groupChromeBlocks.ts exports resolveGroupChromeBlocks',
  /export function resolveGroupChromeBlocks/.test(chromeSrc),
)
assert(
  'groupChromeBlocks.ts exports EMPTY_GROUP_CHROME',
  /export const EMPTY_GROUP_CHROME/.test(chromeSrc),
)

const { resolveGroupChromeBlocks, EMPTY_GROUP_CHROME } = await import(
  '../app/src/features/paper-intelligence/groupChromeBlocks.ts'
)

// ─── 2. Real paper-2026-i fixture ───
const asset = JSON.parse(
  read('app/public/paper-assets/paper-2026-i/latest/paper-asset.json'),
)

const grammarFillChrome = resolveGroupChromeBlocks(asset, 'group-2026-i-grammar-fill')
assert(
  'paper-2026-i grammarFill group: sectionHeading resolves (owner bug report)',
  grammarFillChrome.sectionHeading === '第二节(共10小题；每小题1.5分，满分15分)',
  JSON.stringify(grammarFillChrome),
)
assert(
  'paper-2026-i grammarFill group: instruction resolves (owner bug report)',
  grammarFillChrome.instruction === '阅读下面短文，在空白处填入1个适当的单词或括号内单词的正确形式。',
  JSON.stringify(grammarFillChrome),
)

const readingAChrome = resolveGroupChromeBlocks(asset, 'group-2026-i-reading-a')
assert(
  'paper-2026-i reading-a group: sectionHeading resolves, instruction stays null (partial case)',
  readingAChrome.sectionHeading === '第一节 阅读理解' && readingAChrome.instruction === null,
  JSON.stringify(readingAChrome),
)

const readingBChrome = resolveGroupChromeBlocks(asset, 'group-2026-i-reading-b')
assert(
  'paper-2026-i reading-b group (preceded by another group block): both null — real no-chrome case, zero placeholder',
  readingBChrome.sectionHeading === null && readingBChrome.instruction === null,
  JSON.stringify(readingBChrome),
)

const sevenChoicesChrome = resolveGroupChromeBlocks(asset, 'group-2026-i-seven-choices')
assert(
  'paper-2026-i sevenChoices group: both sectionHeading and instruction resolve',
  sevenChoicesChrome.sectionHeading?.startsWith('第二节') && Boolean(sevenChoicesChrome.instruction),
  JSON.stringify(sevenChoicesChrome),
)

assert(
  'partHeading text never leaks into a resolved sectionHeading',
  ![grammarFillChrome, readingAChrome, readingBChrome, sevenChoicesChrome].some(
    (c) => c.sectionHeading?.includes('部分'),
  ),
)

// ─── 3. Synthetic old-asset (no chrome blocks) ───
const syntheticAsset = {
  content: {
    blocks: [
      { type: 'partHeading', partId: 'p1', text: '第一部分' },
      { type: 'group', groupId: 'g1' },
    ],
  },
}
const syntheticChrome = resolveGroupChromeBlocks(syntheticAsset, 'g1')
assert(
  'synthetic old-asset group directly under a partHeading: both null (EMPTY_GROUP_CHROME shape)',
  syntheticChrome.sectionHeading === null && syntheticChrome.instruction === null,
  JSON.stringify(syntheticChrome),
)
assert(
  'EMPTY_GROUP_CHROME constant has the null/null shape',
  EMPTY_GROUP_CHROME.sectionHeading === null && EMPTY_GROUP_CHROME.instruction === null,
)

// ─── 4. Harness source ───
const harnessSrc = read('app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx')

assert(
  'harness imports resolveGroupChromeBlocks/EMPTY_GROUP_CHROME from ./groupChromeBlocks.ts',
  /import\s*\{\s*[\s\S]*resolveGroupChromeBlocks[\s\S]*\}\s*from\s*['"]\.\/groupChromeBlocks\.ts['"]/.test(harnessSrc),
)

assert(
  'harness declares groupChrome state',
  /const \[groupChrome, setGroupChrome\] = useState<GroupChromeBlocks>\(EMPTY_GROUP_CHROME\)/.test(harnessSrc),
)

assert(
  'harness resets groupChrome alongside other per-load model state',
  /setGroupChrome\(EMPTY_GROUP_CHROME\)/.test(harnessSrc),
)

const setGroupChromeCalls = harnessSrc.match(/setGroupChrome\(groupChromeBlocks\)/g) || []
assert(
  'harness calls setGroupChrome(groupChromeBlocks) at least 5 times (cloze x2, grammarFill x2, reading/sevenChoices x1)',
  setGroupChromeCalls.length >= 5,
  `found ${setGroupChromeCalls.length}`,
)

// Writing branch: extract the `if (group.groupType === 'writing') { ... }` body
// and assert it never calls setGroupChrome.
const writingBranchMatch = harnessSrc.match(
  /if \(group\.groupType === 'writing'\) \{([\s\S]*?)\n {10}\}\n\n {10}let analysisFile/,
)
assert(
  'writing branch body located for the no-setGroupChrome check',
  Boolean(writingBranchMatch),
)
if (writingBranchMatch) {
  assert(
    'writing branch does NOT call setGroupChrome (WritingPageModel already renders its own chrome)',
    !/setGroupChrome/.test(writingBranchMatch[1]),
  )
}

assert(
  'harness renders .pi-ps-group-chrome gated on !writingModel',
  /\{writingModel \? \(/.test(harnessSrc) &&
    /className="pi-ps-group-chrome"/.test(harnessSrc),
)
assert(
  'harness gates the chrome block on truthy sectionHeading/instruction (no empty-shell render)',
  /\{\(groupChrome\.sectionHeading \|\| groupChrome\.instruction\) && \(/.test(harnessSrc),
)
assert(
  'harness renders sectionHeading via h3.pi-ps-group-chrome-section-heading',
  /className="pi-ps-group-chrome-section-heading"/.test(harnessSrc),
)
assert(
  'harness renders instruction via p.pi-ps-group-chrome-instruction',
  /className="pi-ps-group-chrome-instruction"/.test(harnessSrc),
)

// ─── 5. CSS ───
const cssSrc = read('app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css')
for (const cls of ['.pi-ps-group-chrome', '.pi-ps-group-chrome-section-heading', '.pi-ps-group-chrome-instruction']) {
  assert(`CSS declares ${cls}`, cssSrc.includes(`${cls} {`))
}

// ─── 6. Forbidden-scope guard ───
const paperSurfaceTsxSrc = read('app/src/shared-ui/papersurface/PaperSurface.tsx')
assert(
  'PaperSurface.tsx does not reference groupChrome / groupChromeBlocks (untouched by this cut)',
  !/groupChrome/i.test(paperSurfaceTsxSrc),
)
assert(
  'harness imports exactly 2 things from shared/papersurface: the pre-existing types import plus the tokens.mjs re-use (same pattern WritingPaperPage.tsx already uses) — no new shared/papersurface surface introduced',
  (harnessSrc.match(/from ['"]\.\.\/\.\.\/\.\.\/\.\.\/shared\/papersurface\//g) || []).length === 2 &&
    /from ['"]\.\.\/\.\.\/\.\.\/\.\.\/shared\/papersurface\/types['"]/.test(harnessSrc) &&
    /from ['"]\.\.\/\.\.\/\.\.\/\.\.\/shared\/papersurface\/tokens\.mjs['"]/.test(harnessSrc),
)

// ─── 7. Housekeeping ───
const verifyCiSrc = read('scripts/verify-ci.mjs')
assert(
  'registered in scripts/verify-ci.mjs',
  verifyCiSrc.includes('verify-section-chrome-on-solo-surface.mjs'),
)
const readmeSrc = read('scripts/README.md')
assert(
  'registered as `yes` in scripts/README.md',
  /verify-section-chrome-on-solo-surface\.mjs`[^\n]*\|\s*yes\s*\|/.test(readmeSrc),
)

if (failed > 0) {
  console.error(`\nsection-chrome-on-solo-surface verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nsection-chrome-on-solo-surface verify passed: ${passed} passed, 0 failed`)
