# PaperSurface C4 Insight Layout Mockups

Date: 2026-05-19
Status: product discussion draft for PR #52

These mockups are design artifacts for the C4 PaperSurface Insight
Parity discussion. They are not production assets and must not be
imported by the app.

## Product decision

C4 insight should move away from the top horizontal chip strip.

The desired direction is:

- paper remains visually primary
- insight is hidden by default but one gesture away
- the entry point becomes a compact left-side rail with hover /
  focus expansion
- the right analysis background fills to the browser's right edge
- right analysis text remains constrained to a readable column

## Images

1. `01-current-problem.png`
   - Shows the current C4 issue: top insight strip competes with the
     paper reading area, and the right side has a visible empty gutter.

2. `02-target-default.png`
   - Shows the target default state: no top strip, compact A/B/C/D
     insight rail on the left, and full-bleed right analysis background.

3. `03-left-rail-expanded.png`
   - Shows the hover / focus state: left rail expands to reveal full
     labels and opens the insight popover without permanently occupying
     the paper reading area.

4. `04-before-after.png`
   - Side-by-side comparison of the current top-strip layout and the
     proposed left-rail / full-right-panel layout.

## Implementation constraints derived from the mockups

- Do not move insight into PaperSurface.
- Do not edit PaperSurface internals for this UX change.
- Keep insight host-owned in `PaperIntelligencePaperSurfaceHarness`.
- No top horizontal insight strip should remain over the paper.
- Left rail collapsed state should be quiet and compact.
- Left rail expanded state must support both hover and focus-within.
- Right analysis background may fill the available right side, but
  analysis content should remain at a readable max width.
- Browser QA still decides final acceptance.

