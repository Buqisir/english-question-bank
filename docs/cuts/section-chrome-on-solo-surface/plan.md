# section-chrome-on-solo-surface

Size: small-medium. Dispatch: main agent wrote this contract inline
(DEV executed + committed it per the cut's own instructions), CR-lite.

## Problem (owner 报障 2026-07-08)

The Paper Intelligence solo-group harness
(`PaperIntelligencePaperSurfaceHarness.tsx`, `surface=paper` route) mounts
exactly one group's `PaperSurface` with no卷面 chrome above it — the top of
the "纸" is blank where the real exam paper carries a **节标题**（e.g. 「第二
节(共10小题；每小题1.5分，满分15分)」) and a **指导语**（e.g. 「阅读下面短文，
在空白处填入1个适当的单词或括号内单词的正确形式。」). PaperBrowsePage.tsx
(the whole-paper preview page) already renders these two block types when it
streams a paper-asset's flat `content.blocks` array in document order; the
solo-group harness never consumed them because it only ever needed the one
`group` block.

## Data path

`content.blocks` is the paper-asset's whole-paper, document-order block
stream (`partHeading` / `sectionHeading` / `instruction` / `group` / …).
Every paper-asset-sourced group model the harness already builds
(`buildPaperAssetSurfaceModel` / `buildSevenChoicesSurfaceModel` /
`buildClozePaperView` / `buildGrammarFillPaperView` / `buildWritingPaperView`)
is built FROM the same `asset` object the harness already fetches — the
`asset.content.blocks` array was already in memory, just never read for this
purpose. No new network request.

New pure lookup, `app/src/features/paper-intelligence/groupChromeBlocks.ts`:

```ts
resolveGroupChromeBlocks(asset: PaperAssetV1, groupId: string): { sectionHeading: string | null; instruction: string | null }
```

Walks `content.blocks` backward from the target group's own `group` block,
collecting an immediately-preceding run of `sectionHeading` / `instruction`
blocks. Stops at the first block that is neither type — a `partHeading`
(卷层「第二部分」级别标题, deliberately excluded — a solo-group view has no
use for the whole-part label) or another `group` block (the previous group's
own chrome, not this one's). Old assets / groups with nothing preceding
resolve to `EMPTY_GROUP_CHROME` (`{ sectionHeading: null, instruction: null }`)
— zero render, zero placeholder.

`PaperIntelligencePaperSurfaceHarness.tsx` calls this once per load, in every
`source === 'paper-asset'` branch that resolves a final `asset` + `group`
(cloze analysis-success + cloze fallback-plain, grammarFill analysis-success
+ grammarFill fallback-plain, and the reading/sevenChoices branch —
recomputed there after its legacy-base-fallback re-fetch, since that branch
can reassign `asset`/`group`), storing the result in new `groupChrome` state.
`legacy-report` source (old regression fixtures, no `content.blocks` concept)
never sets it — state stays `EMPTY_GROUP_CHROME`, zero render, unaffected.

**Writing groups are deliberately excluded from the new `groupChrome`
render path.** `writingPageModel.mjs`'s `buildWritingPageModel` /
`findWritingBlockRange` already resolve and render a writing group's own
sectionHeading/instruction (plus an adjacent partHeading and the answerBox)
as part of `WritingPaperPage`'s single A4-sheet chrome — that mechanism
predates this cut (I6-writing-render) and already gives writing groups the
chrome this cut is otherwise adding. The `writing` branch in the harness's
load() never calls `setGroupChrome`, and the render is additionally gated
on `!writingModel`, so a writing group never gets a duplicate heading.

## Render

Inside `.pi-ps-harness-left`, immediately above the `PaperSurface` mount
(only on the non-writing branch of the existing `writingModel ? … : …`
ternary):

```tsx
{(groupChrome.sectionHeading || groupChrome.instruction) && (
  <div className="pi-ps-group-chrome" style={groupChromeTokenStyle}>
    {groupChrome.sectionHeading && <h3 className="pi-ps-group-chrome-section-heading">{groupChrome.sectionHeading}</h3>}
    {groupChrome.instruction && <p className="pi-ps-group-chrome-instruction">{groupChrome.instruction}</p>}
  </div>
)}
```

Styling mirrors PaperBrowsePage's own `.paper-browse-section-heading` /
`.paper-browse-instruction` (same font-size tiers: 16px/700 heading,
13px/regular instruction; same warm ink colors) — new classes
`.pi-ps-group-chrome-section-heading` / `.pi-ps-group-chrome-instruction` in
`paperIntelligencePaperSurfaceHarness.css` rather than reusing
paper-browse's classes directly (different CSS file / bundle, no shared
stylesheet import between the two features). The chrome wrapper is width-
locked to `var(--ps-page-width, 794px)` and centered, so it reads as this
page's own header sitting on the harness's desk background — the same
`--ps-font-stack` token-injection pattern `WritingPaperPage.tsx` already uses
(`paperSurfaceTokens` from `shared/papersurface/tokens.mjs`, read-only import,
not a modification of that module).

## Forbidden scope (honored)

- `shared/papersurface/**` and `app/src/shared-ui/papersurface/PaperSurface.tsx`
  / `.css`: untouched. The harness only *imports* the pre-existing
  `paperSurfaceTokens` export (same pattern `WritingPaperPage.tsx` already
  uses) — no new export, no signature change.
- `server/**`, `app/src/domain/**`, `schemas/**`: untouched.
- No export/print surface touched.
- No right-panel change.
- `PaperBrowsePage.tsx` untouched (read-only reference for the visual
  pattern, not imported from).

## Verify

New script `scripts/verify-section-chrome-on-solo-surface.mjs` (registered
`yes` in `scripts/README.md` + `scripts/verify-ci.mjs`):
- `resolveGroupChromeBlocks` proven against the REAL `paper-2026-i` fixture:
  grammarFill group (owner's exact bug — both sectionHeading+instruction
  resolve), reading-a (sectionHeading only), reading-b (immediately
  preceded by another `group` block — both null, the real no-chrome case),
  sevenChoices (both resolve, a second section). Plus one synthetic
  old-asset case (group directly under a partHeading, no heading/instruction
  at all) for the compat guarantee no current fixture happens to exercise.
- partHeading text never leaks into a resolved sectionHeading (proves the
  walk-back stop condition).
- Harness source: state declared/reset, `setGroupChrome` called in every
  non-writing branch, NOT called in the writing branch, render gated on
  `!writingModel` and on a truthy heading/instruction.
- CSS classes declared.
- Forbidden-scope guard: PaperSurface.tsx has no `groupChrome` reference;
  harness's `shared/papersurface/` imports are exactly the pre-existing
  `types` import plus the `tokens.mjs` re-use (no new surface).

`pnpm -C app run verify:all`: 67 passed / 1 skipped (unrelated missing
off-repo fixture, `verify-i16a-teaching-dimension-search.mjs`) / 0 failed.
`pnpm -C app run build`: clean (tsc -b + vite build).

## Browser QA (local dev, port 5199/8799, qa-owner-role local user)

- `paper-2026-i` grammarFill group (owner's exact report): 节标题「第二节
  (共10小题；每小题1.5分，满分15分)」+ 指导语「阅读下面短文，在空白处填入1个
  适当的单词或括号内单词的正确形式。」now render above the passage,版式
  协调 (width-locked to the paper track, warm ink tone matching the rest of
  the harness).
- `paper-2026-i` sevenChoices group: 节标题「第二节 (共5小题；每小题2.5分，
  满分12.5分)」+ instruction render correctly; the A-G option pool
  (seven-options-on-paper cut) renders unaffected in the right column —
  no conflict.
- `paper-2026-i` reading-a: sectionHeading-only case renders correctly (no
  instruction block precedes it in the fixture).
- `paper-2026-i` reading-b (immediately preceded by another `group` block):
  renders NO chrome — confirms the walk-back correctly stops instead of
  reaching back to reading-a's section heading.
- `paper-2026-i` cloze group: sectionHeading + instruction render correctly,
  no regression to the existing analysis panel / evidence line.
- `paper-2026-i` writing-application group: unchanged — its own
  WritingPageModel-rendered chrome (partHeading + sectionHeading +
  instruction + answer box on one A4 sheet), no duplicate heading from the
  new code path.

## Known risks / self-review blind spots

- Not QA'd against `960d0f8d` (the other fixture named in the task) beyond
  the static verify script asserting resolveGroupChromeBlocks's generic
  contract — `paper-2026-i` alone exercises every real-fixture case listed
  above (both-present, heading-only, no-chrome, writing-unaffected), and
  the acceptance criteria explicitly named grammarFill/sevenChoices/reading
  on `paper-2026-i` as the QA targets.
- `resolveGroupChromeBlocks` collects at most one `sectionHeading` and one
  `instruction` per group (overwriting on a second hit of the same type
  while walking backward) — no fixture seen has two consecutive blocks of
  the same type before a group, but this is an implicit assumption, not an
  asserted invariant.
