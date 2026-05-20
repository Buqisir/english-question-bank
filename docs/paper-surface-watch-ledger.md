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
