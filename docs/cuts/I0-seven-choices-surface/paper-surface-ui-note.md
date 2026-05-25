# PaperSurface UI Note — Reading + Seven Choices Follow-up

Date: 2026-05-25

## Locked Decisions

- Right analysis pad: the warm assistant background must cover the full scrollable right column, including expanded reading-choice analysis content.
- Left structure rail: the rail, detail panel, and rows should read as one exposed layer, not nested cards or a window inside a window.
- Structure panel scrolling: only the outer rail scrolls; `.pi-ps-insight-detail` must not create its own inner scroll window.
- Structure panel color: keep a very light warm tint (`#f5f1ea`) so the panel has hierarchy without feeling heavy.
- Seven choices blanks: keep the source-paper style underline with centered number and spacing calibrated from the source image.

## Final QA Targets

- Reading D: right analysis pad, evidence line, and left structure panel.
- Reading A/B/C sample: reading-choice route still renders the same analysis surface.
- Seven Choices: A-G option pool, chain toggles, clue highlights, and source-paper blank underline.

## Watch

- Do not reintroduce nested scrolling inside the left structure detail.
- Do not make the structure panel into a heavy card; use tint and typography rather than borders.
- If PaperSurface DOM changes, rerun both reading-choice evidence-line QA and seven-choices overlay QA.
