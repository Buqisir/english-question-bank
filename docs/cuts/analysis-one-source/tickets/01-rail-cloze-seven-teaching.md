# 01 — Lecture rail shows the cloze and seven-choices teaching

Status: accepted 2026-11-25; not started
Blocked by: none
Next on PASS: Owner QA of before/after samples
Terminal: no

## Problem

The 解析 PDF prints the adopted cloze method (docs/product/cloze-methods.md)
and seven-choices method v1 (docs/product/seven-choices-methods.md). The web
lecture rail prints neither. No file under `app/src` reads the new fields. On
new data the rail falls back to legacy fields derived from them
(`correctFit.reason`, `optionFit.fitSummary`), so it is never empty, but it is
not the adopted teaching.

| Block | PDF | Rail today |
|---|---|---|
| Cloze 主线 (主题意义, one line per paragraph, 情感线) | `renderClozeMainLine` | missing |
| Cloze 脉络 and 找法 per blank (找法 label from `clozeFindLabel`, quoted words bold) | `renderClozeTeachingLines` | missing; shows derived `correctFit.reason` |
| Cloze answer gloss 「词典义；此处指语境义」 | `answerGloss` | missing (no `dictMeaning` in the app) |
| Cloze distractor glosses | yes | yes |
| Seven 空前 / 答案 / 空后 rows, 锁定词 bold | `renderContextChain` and `contextChainRows` | blank highlight only; no rows |
| Seven 找法, 讲解, 错项 (`find`, `explain`, `distractors`) | `renderTeachingLines` | missing; shows derived `fitSummary` |
| Seven 多余项 under its likely blank, and 话题项 at the end (`extraOptions`) | `renderExtraAtBlank` and `renderUnaimedExtras` | missing |

## What to build

- Use the same predicates as the PDF: `hasClozeTeachingLines` and
  `hasSevenChoicesTeachingLines`. Data with the new fields gets the new
  blocks; legacy data renders exactly as today.
- Use the same helpers for derived text: `clozeFindLabel` and
  `contextChainRows`. Expose them to the app without duplicating logic. If a
  helper must move into `shared/`, that is a contract change and needs the
  contract unlock.
- Existing components and tokens only (Notice, Card, inline labels, the
  existing evidence and distractor styles). No new colours.

## Rail placement

- At 1440 px and wider the rail is sticky with its own scroll. Below that it
  flows under the paper. In both cases the clicked blank's explanation must be
  the first thing visible after a click.
- Cloze 主线 is group-level and several lines long. Proposal: a collapsible
  block next to 文章简介, open when no blank is active and closed once one is,
  matching how 文章简介 behaves now. Owner accepted 2026-11-25.
- Seven-choices: the rail is organised by option (A–G cards) while the PDF is
  organised by blank. Proposal: keep the A–G cards. Put 空前/答案/空后, 找法,
  讲解 and 错项 inside the card of each blank's answer, and put a spare
  option's text in that option's own card (the 多余项 tag, plus its likely
  blank). Owner accepted 2026-11-25.
- Clicking a quote in 找法 or a 锁定词 highlights it in the passage, the same
  way reading evidence does today. If a quote cannot be located, it shows as
  plain bold text with no error.

## Acceptance criteria

- [ ] On fixtures with the new fields (2026 全国Ⅱ cloze and seven-choices from
  the 2026-11-25 local run), the rail shows every block in the table above. Its
  text matches the PDF (same strings, same bold words).
- [ ] Legacy fixtures (2025 全国Ⅱ cloze before adoption, one seven-choices
  paper without `find`) render pixel-identical before and after at 1440 and
  390.
- [ ] Keyboard: new controls are reachable by Tab and work with Enter or
  Space; collapsibles use the existing disclosure component.
- [ ] Before/after screenshots at 1440 and 390 for both types, sent to the
  Owner and approved.
- [ ] `npx tsc -b` in `app/`, `node scripts/verify-paper-browse.mjs` (with new
  asserts for both types), and `node scripts/verify-ci.mjs` pass.

## Files

`app/src/features/paper-intelligence/ClozeAnalysisPanel.tsx`,
`clozeAnalysisSurfaceAdapter.ts`, `SevenChoicesAnalysisPanel.tsx`,
`sevenChoicesSurfaceAdapter.ts`, `useSevenChoicesPaperHighlights.ts`,
`app/src/features/paper-browse/PaperBrowsePage.tsx` (only if wiring changes),
`scripts/verify-paper-browse.mjs`. Read-only reference:
`server/exports/companion-analysis/cloze.mjs`, `sevenChoices.mjs`,
`server/paper-import-ai/clozeMainLine.mjs`, `sevenChoicesTeaching.mjs`.
