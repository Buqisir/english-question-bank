# PaperSurface Watch Ledger

This ledger records non-blocking watch items from PaperSurface cuts. Items here are not current merge blockers. Promote one into a real task only when it blocks a named future cut, appears in QA, or becomes part of an accessibility / architecture sweep.

## C3 Evidence Parity

Source: PR #48 CR, Issue #21-C3.

Status: C3 merged. No Must Fix remained.

### Right-Panel Button Content Model

The `surface=paper` harness renders the right-panel support evidence row and quoted distractor rows as buttons so a teacher can click a row and move the dotted evidence line.

Current risk:
- `SupportEvidenceRow` renders flow content such as `h4`, `blockquote`, and `p` inside a `button`.
- `DistractorRow` may render a `blockquote` inside a `button`.
- Browsers render and click this correctly today, but HTML audits and accessibility tooling can flag this content model.

Follow-up trigger:
- A teacher reports screen-reader / keyboard confusion.
- An accessibility audit is scheduled.
- The right Question Analysis panel gets refactored.

Preferred future fix:
- Replace block-content buttons with a valid row interaction pattern, such as a row wrapper using `role="button"` plus keyboard handling, or a smaller explicit button region inside a non-button row.

### Active Evidence Reseed Edge Case

The harness owns `activeEvidenceId` and reseeds it from `analysisView.supportEvidenceId` whenever `activeQuestionId` changes.

Current risk:
- If future code mutates `analysisView.supportEvidenceId` while the same question stays active, the reseed effect may overwrite a teacher-selected distractor evidence row.
- In current C3, report data is fetched once and `buildPreviewView` is pure, so this is not observable.

Follow-up trigger:
- `buildPreviewView` caching changes.
- live regeneration / re-analysis can update evidence ids while a question remains selected.
- right-panel evidence rows become editable.

Preferred future fix:
- Split "question changed" reseed from "analysis data changed" refresh, or preserve explicit teacher evidence selection until the active question changes.

### Highlight Without Connector On Malformed Data

C3 sets `activeEvidenceId` from the support evidence id. The left paper can highlight an evidence range when the PaperSurface data resolves it.

Current risk:
- If a malformed report has `supportEvidenceId` but no right-panel `answerEvidenceQuote`, the left highlight can exist while the dotted line has no right-side row to connect to.
- This is a data quality edge case, not a current product regression.

Follow-up trigger:
- QA finds support highlights without connectors in real paper-intelligence reports.
- reports begin accepting partial / human-edited evidence rows.

Preferred future fix:
- Gate seeded `activeEvidenceId` on both left evidence range and right source row availability, or add a dev-only warning for unresolved source/target pairs.




## C4 Insight Parity

Source: PR #21-C4 PaperSurface Insight Parity, the harness route `?view=paper-intelligence&surface=paper`.

Status: C4 ready for review. No Must Fix at the time of writing.

### Duplicated Insight Panel Content (future dedupe target)

The harness route renders its own insight popover body via `app/src/features/paper-intelligence/insight/HarnessInsightPanelContent.tsx` and a sibling pure helper `insight/insightChipLabel.ts`. Both intentionally duplicate the default PI route's `LoadsPanel` / `OutlinePanel` / `ChunksSummary` and `buildInsightChipLabel` from `PaperIntelligencePreview.tsx`.

Current risk:
- Two copies of the loads/outline/chunks rendering can drift visually or behaviorally if one route updates the panel content without updating the other.
- Two copies of the chip-label thresholds (≤2 light, ≤3.5 medium, otherwise heavy) can drift if a future cut tunes the binning on one side only.

Follow-up trigger:
- A teacher reports an insight content mismatch between `surface=printable` and `surface=paper`.
- A product cut adds new fields (e.g. estimated reading time) to the insight panel and the second route forgets to mirror them.
- The print-mode mount story stabilizes and the default PI route is ready for a non-trivial refactor.

Preferred future fix:
- Extract a single shared `<InsightPanelContent />` and `buildInsightChipLabel` into `app/src/features/paper-intelligence/insight/` and have both `PaperIntelligencePreview.tsx` and `PaperIntelligencePaperSurfaceHarness.tsx` import from there.
- The harness's local class-name prefix (`pi-ps-insight-*`) keeps the CSS dependency split — the shared component would need either CSS Modules or duplicated CSS bundles.

### Left Rail Edge Cases (PR #52 PA-revised layout)

The harness left insight rail (`.pi-ps-insight-rail`) replaces the original top horizontal chip strip after PR #52 PA review. The rail sits `position: absolute; left: 0` inside `.pi-ps-harness-shell`, collapses to 48px in the outer-left desk gutter, and expands to 220px on `:hover`, `:focus-within`, the toggle's `[data-rail-locked]`, or the popover's `[data-rail-popover-open]`.

Current risk:
- A report with five or more reading passages can produce a rail list longer than the desk gutter visually accommodates at 1024-1199px (where the layout is about to enter stacked mode). The rail is `overflow: hidden` so the bottom of the list is clipped silently.
- Localized chip labels can become long enough that the 220px expanded rail truncates the label without an ellipsis. Non-Chinese labels (e.g. an English subtitle in a future cut) were not designed for.
- At tighter desktop widths (1280-1440) the expanded rail overlaps the paper edge by a few pixels by design (PA accepted this as a user-invoked overlap). If a future cut tightens the paper track or widens the rail, the overlap can grow into the reading area.
- The matchMedia handler clears `activeInsightSection` and `railLocked` on every breakpoint cross. A teacher resizing the window mid-lecture loses any open insight popover. This is the correct invariant for avoiding stale popover anchors but can feel abrupt.
- `:focus-within` keeps the rail expanded only while a descendant has focus. The popover is portalled to `document.body`, so when the teacher Tabs into the popover focus leaves the rail. The harness mitigates this with `[data-rail-popover-open]`, but a future popover variant that does NOT portal would re-introduce the rail-collapses-while-popover-open regression.

Follow-up trigger:
- A real exam paper with five or more reading passages enters the report set.
- The chip label format changes (e.g. adds an English subtitle, gains an icon).
- Browser QA finds the expanded rail visually breaking the paper edge at 1280px or smaller widths.
- A teacher reports the popover closing on resize.
- `AnchoredPopover` is refactored to mount inline rather than via portal.

Preferred future fix:
- Cap the rail-list height with `overflow-y: auto` so a long passage list scrolls inside the rail without clipping.
- Add an ellipsis fallback (`text-overflow: ellipsis`) to `.pi-ps-insight-chip-text` so localized long labels truncate visibly rather than clip.
- Move the desktop rail into a `position: sticky` track inside the existing 4-column grid (no overlap with paper) once a real 5+ passage layout justifies the cost of touching the grid.
- If "preserve popover across resize" becomes a teacher request, gate the breakpoint clear on whether the popover is currently open (currently it always clears). The Q1 invariant still applies — but a future implementation could re-anchor instead of close.

### Chip Strip Reflow Watch (RESOLVED by PR #52 PA must-fix)

The original C4 ship rendered insight chips in a top horizontal `position: sticky` strip inside `.pi-ps-harness-left`. Browser QA found the strip competed with the paper reading area, and the popover anchor briefly went offscreen during section scroll-into-view. PR #52 PA review rejected the strip and required the left rail above. Both risks the strip carried (reflow on 5+ passages, chip-out-of-viewport during section jump) are no longer applicable: the rail lives outside the left scroller, so section scroll cannot push the chips offscreen, and rail-list overflow is now a separate concern tracked above.

### Popover / Evidence-Line Z-index Watch

`AnchoredPopover` portals the insight panel to `document.body` and sets `position: fixed`. The harness CSS pins `.pi-ps-insight-panel { z-index: 60 }`, which sits above the C3 cross-column evidence-line overlay (`.pi-line-overlay { z-index: 5 }`).

Current risk:
- A future cut that introduces a higher-stack surface inside the harness shell (e.g. a basket popover, a print preview overlay, or a teacher-mode toolbar) may collide with the insight popover at z=60.
- A change to `AnchoredPopover`'s portal target (e.g. portalling to a relatively-positioned ancestor for SSR reasons) could re-introduce the pre-QA #19 stacking-context trap that originally drove the portal design.

Follow-up trigger:
- The harness gains a second popover-style surface.
- `AnchoredPopover` is refactored or its portal target changes.
- Browser QA finds the insight popover painting under another harness surface.

Preferred future fix:
- Centralize all harness z-index values in CSS custom properties (e.g. `--pi-ps-z-line: 5`, `--pi-ps-z-popover: 60`) so the single point of truth lives in `paperIntelligencePaperSurfaceHarness.css`.
- Add a static verify assertion that the insight popover z-index is strictly greater than the line overlay z-index.


## C5b Structure Brace

Source: PR #60, `surface=paper` Structure Brace hotfix.

Status: C5b merged. The accepted display rule is `>=1360px` visible, `<=1359px` hidden.

PO QA contract: `docs/product/paper-surface-c5b-po-qa-contract.md`.

### Tight Desktop Brace Visibility

The Structure Brace lives in the white `.ps-page` left padding. Browser QA found that at tight desktop widths the expanded left rail can cover that padding area.

Current rule:
- `>=1360px`: brace may render in `.ps-page` left padding.
- `1200-1359px`: paragraph rows still scroll the paper, but the brace is hidden.
- `<=1199px`: stacked layout; paragraph rows still scroll, brace hidden.

Do not fix tight desktop visibility by raising the brace z-index. The brace is intentionally below the evidence line and rail controls. If teachers need visible structure marking at tight desktop widths, reopen the rail layout rather than painting the brace above controls.

Follow-up trigger:
- A teacher explicitly needs Structure Brace visibility between `1200px` and `1359px`.
- The left rail layout changes so it no longer covers the `.ps-page` padding.

Preferred future fix:
- Move the rail into a stable grid track or shrink the expanded rail before changing brace z-index.
- Keep PaperSurface unchanged; the harness should continue querying `data-paper-*` anchors.

### Sentence-initial 语法填空 blank not styled (space-marker only)

Source: I10-blank-rendering browser QA, 2026-05-31. PO 黄学伟 decided ship-now,
fix-next-slice.

PaperSurface styles a blank by matching `paperBlankPattern`
(`PaperSurface.tsx`) which requires a delimiter (2+ underscores OR 2+
regular/nbsp spaces) on BOTH sides of the number. The renderer runs per
SENTENCE slice (`renderTextWithPaperBlanks` is called on segmented sentence
text). Sentence segmentation splits at the space after a period, so a 语法填空
blank that sits at the START of a sentence (e.g. `...blood.  58  (study)...`)
loses its leading 2-space delimiter to the previous sentence and renders as a
plain number `58`, not the styled underline.

Scope: 语法填空 ONLY. 完形 (`__41__`) and 七选五 (`_____36_____`) use underscore
markers attached to the number, which survive sentence splitting, so they style
even sentence-initially. Confirmed in QA: cloze 15/15 styled; grammar 8/10
(the 2 unstyled were both immediately after a period).

NOT a regression: pre-I10 the renderer styled zero 语法填空 blanks. I10 is a net
improvement (cloze fully + grammar mid-sentence); this is a known remaining gap.

Do NOT fix by accepting a sentence-initial blank with only a TRAILING delimiter
(`^\s*\d{1,3}\s{2,}`) — that re-opens the false-match surface I10 deliberately
bounded (a sentence genuinely starting with a number + double space).

Preferred future fix (next slice):
- Keep the leading delimiter attached across the sentence boundary, or run the
  blank match before sentence segmentation, or carry a "sentence-initial blank"
  hint from the segmenter. Touches segmentation / cross-sentence delimiter
  handling — out of I10's display-only scope.

Follow-up trigger:
- A real imported 语法填空 paper shows enough sentence-initial blanks that the
  inconsistent styling bothers a teacher on the A4 page.


## I12 Symbol Normalization 2b

Source: I12 PA (fresh-Opus cold-read), `docs/cuts/I12-symbol-normalization-2b/pa.md`,
2026-05-31. Both items are non-blocking and explicitly OUT of 2b's locked 2-file scope.

### Reading group title is unnormalized English content (SW-1) — RESOLVED 2026-05-31

**Resolved** (PR follow-up, branch `sw1-reading-title-normalize`): `docxSplitter.mjs` L356 now
reads `title: normalizePassageText(marker.title) || \`Reading ${marker.label}\``, mirroring the
title-fallback paragraph at L340. `normalizePassageText` preserves ASCII, so the `Reading A`
fallback and the `Passage A` / `A篇` A-D label extraction (packageBuilder.mjs L47 regex) are
unaffected. Locked by `assertTitleNormalization()` in `scripts/verify-i1-paper-import-splitter.mjs`
(a titled `Passage A The Cloud Farm（云农场）guide` marker comes back
`The Cloud Farm (云农场) guide`; label still derives from groupId). Original note below for record.

`normalizePassageText` runs at 21 `docxSplitter.mjs` build sites, but the Reading **group
title** (`docxSplitter.mjs` L356, `title: marker.title || ...`) was NOT routed through it. This
was pre-existing since 2a (I11), not a 2b regression.

Why it is safe today:
- The title is outside the evidence-quote contract — `assertExactQuote`
  (`analyzeReading.mjs` L133-140) resolves only against `paragraphsById`, and a title is not a
  paragraph. The title-fallback paragraph at L340 *is* normalized. Render highlight filters by
  `paragraphId`, so a title is never a highlight target. No quote-divergence path exists.

Current risk:
- A group title containing a straight quote / dash / full-width punctuation renders
  un-normalized while its passage body is normalized — a cosmetic inconsistency only.

Follow-up trigger:
- A real paper shows a visibly un-normalized title beside a normalized passage and it bothers a
  teacher on the A4 page.

Preferred future fix:
- Wrap the L356 title in `normalizePassageText` (one-line, but touches `docxSplitter.mjs` which
  was forbidden in 2b's scope). Confirm it does not shift any title-keyed parse classification.

### Corner brackets 「」『』 not normalized to curly quotes (SW-2)

2b deliberately does NOT special-case CJK corner brackets `「」『』` → English curly quotes.
Empirical scan of 33 real source papers found **0** occurrences. 2a Rule 1 already maps
ASCII-adjacent `「」『』` → straight quotes (then 2b Rule 4 direction-derives them); the residual
`word「q」` → both-closing direction-loss edge is theoretical on real input.

Follow-up trigger:
- A real paper uses corner brackets around English text and the wrong-facing curly is visible.

Preferred future fix:
- Add a glyph-directional corner-bracket map (`「`→U+201C, `」`→U+201D, `『`→U+2018, `』`→U+2019)
  at the TOP of `normalizePassageText` (before 2a Rule 1), and retire Rule 1's `「」『』` branches
  as unreachable. Re-verify 2a cases stay green.


## I13 Grammar-Fill Analysis — render-slice Follow-up Gate (evidence highlight)

Source: I13 slice-1 CR (`docs/cuts/I13-grammar-fill-analysis/cr.md`), 2026-05-31. **Follow-up
Gate** — blocks the named future grammar-fill analysis **render slice** (not slice 1).

`grammar-fill-analysis-v1` `evidence.signalText` is validated at generation against the
**parse-time** passage (`normalizePassageText`), but the **stored/published** grammar-fill
passage gets an extra `normalizeGrammarFillText` pass at publish (`packageBuilder.mjs:~525`).
So a stored `signalText` may not be an exact substring of the stored passage. Inert in slice 1
(no render / no consumer reads it).

Follow-up trigger:
- The grammar-fill analysis **render slice** starts (the I9-equivalent for grammar fill).

Required fix before render ships (do NOT ship a grammar-fill highlight without this):
- Validate `evidence.signalText` against the **stored/published** passage bytes (not the
  parse-time bytes), OR render the highlight with a normalization-tolerant match. Plain
  `indexOf` against the stored passage will silently lose the highlight (the I11 C1 failure
  mode). Add a verifier fixture whose passage actually changes under `normalizeGrammarFillText`.

**RESOLVED by I14 (2026-06-01).** The render slice (`I14-grammar-fill-analysis-surface`) shipped a
**normalization-tolerant** locate (`grammarFillAnalysisSurfaceAdapter.ts` `findAllTextRangesTolerant`,
GATE-1) + MF-1 textMap/locate sentenceId consistency. `verify-i14-grammar-fill-analysis-surface.mjs`
has the normalize-divergence fixture + the sentenceId-membership assertion (CR mutation-tested 3/3).
Gate closed.


## I14 Grammar-Fill (and all analysis surfaces) — in-passage blank = focus target (PO request)

Source: PO 黄学伟 browser-QA feedback during I14, 2026-06-01. **Follow-up** (new cut; explicitly
scoped OUT of I14, which is consume-only render mirroring I9's existing interaction).

PO wants: **clicking the blank number IN the passage** (e.g. `56`) focuses that blank and shows its
analysis, and the **bottom number rail** (`PaperSurfaceQuestionList` — the row of `56. 57. … 65.`
focus targets) is **removed** (for grammar fill it is naked numbers: those "questions" have no stem /
no options, so the rail is noise).

Current reality (verified): the focus interaction lives in the **shared** PaperSurface
(`PaperSurface.tsx` `PaperSurfaceQuestionList` / `PaperSurfaceQuestionItem`); ALL four analysis
surfaces (reading / 七选五 / cloze / grammar-fill) use it. In-passage blanks render as
**non-clickable** text (`renderTextWithPaperBlanks` → `<span class="ps-paper-blank">`, no question-id
wiring), and the grammar-fill `NN._____` format does not even match `paperBlankPattern` (I10 limit).

Follow-up trigger:
- The next PaperSurface interaction cut is scheduled (阿澈 owns the UI direction).

Scope notes (for that cut, NOT I14):
- Touches `shared/papersurface/**` (the forbidden zone for I14) + the I10 blank renderer
  (`paperBlankPattern` / `renderTextWithPaperBlanks`): recognize `NN._____(word)` as a clickable
  focus target carrying the question id → emit `request-lecture-focus`.
- Decide (阿澈 UI direction): in-passage-click **global** (all 4 surfaces) or grammar-fill-only;
  retire the number rail fully or keep it for surfaces whose questions have real stems
  (reading / 七选五); keyboard accessibility for the in-passage targets.

**RESOLVED by I15 (2026-06-01, PR #177).** Cut `I15-grammar-fill-blank-focus`, scoped
**grammar-fill only** (owner-locked). New `PaperSurfaceProps.blankFocusMode` (`'rail'` default keeps
reading/七选五/cloze byte-for-byte unchanged; `'in-passage'` for grammar fill) suppresses the rail and
renders in-passage blanks as keyboard-accessible focus `<button>`s firing the same
`request-lecture-focus` intent. Isolated `grammarFillBlankPattern` (`app/src/shared-ui/papersurface/
grammarFillBlank.ts`) — the REQUIRED dot distinguishes `56._____` from cloze `__41__` / 七选五
`_____36_____`; `paperBlankPattern` untouched. PA + CR (mutation-tested verifier) APPROVE; browser QA +
PO QA passed. NOTE: global (all-surface) in-passage click was deliberately NOT done — reading/七选五/
cloze rails carry real question content and stay.
