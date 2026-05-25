# Cut Note — I0-D Seven Choices Surface

Date: 2026-05-25
Branch: `main`

## Shipped

- Added a 七选五 PaperSurface experience for `group-2024-jslk-seven-choices`: left side keeps the paper passage; right side shows the A-G option pool.
- Correct option chains can be toggled independently; multiple chains may be open at once.
- Open chains highlight the matching passage clues and the matching option card with the same color.
- Wrong options stay plain in v1.
- A-G jump chips now toggle: click once to expand, click again to collapse.
- 七选五 blanks now mimic the source-paper style: one continuous underline, centered number, spacing preserved around surrounding words.

## Locked Rules

- No left-side answer pill overlay; the color highlight is enough and does not disturb original paper typography.
- Five chain colors are reused across passage highlights, option cards, and jump chips; color 4 is coral red to avoid the old yellow-brown collision.
- Blank underline width is calibrated from the source-paper image: about `72px` in the current A4 surface, with measured number center delta `0px`.
- Right panel quick controls remain: `全部显示`, `全部隐藏`, and A-G chips.

## Verification

- `node scripts/verify-i0d-seven-choices-surface.mjs`
- `git diff --check`
- `npm run build` in `app/`
- Browser QA on `q-2024-jslk-037`: all show/hide, chip toggle, color mapping, and blank underline rendering passed.

## Watch

- If PaperSurface DOM structure changes, rerun seven-choice overlay QA because highlights depend on sentence anchor geometry.
- If later adding wrong-option analysis, keep v1's rule that wrong options are visually quiet until explicitly designed.
- If source-paper typography changes, recalibrate the blank underline from the source image rather than from inconsistent DOCX underline runs.
