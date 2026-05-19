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

### Chip Strip Reflow Watch

The harness chip strip (`.pi-ps-insight-chip-strip`) sits at the top of `.pi-ps-harness-left`. It uses `display: flex; flex-wrap: wrap` with a `max-width: 794px` matching the white A4 sheet width.

Current risk:
- A report with many passages (e.g. >4) produces enough chips that the strip wraps to two lines, increasing the height of the chips region and pushing the paper sheet down. The popover anchor still works (the chip ref still resolves), but the chip-to-section visual alignment can break (two chip rows above one paper).
- Localized chip labels can become long enough that even three chips wrap; non-Chinese labels were not tested.

Follow-up trigger:
- A real exam paper with five or more reading passages enters the report set.
- The label format changes (e.g. adds an English subtitle).
- Browser QA finds the chip strip pushing the paper out of view at 1280px.

Preferred future fix:
- Cap the chip strip height with `overflow-x: auto` and a horizontal scroll, OR
- Render the strip as a sticky header inside `.pi-ps-harness-left` so it survives wrapping without pushing the paper, OR
- Anchor each chip directly to its `[data-paper-section]` root via CSS (e.g. position: sticky inside the section header) once PaperSurface exposes a "section header slot".

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
