# Browser QA — I5 Writing AI Import (阿澈 first pass)

Date: 2026-05-29 · Reviewer: 阿澈 (PM, first-pass browser QA) · Branch:
`codex/i5-writing-ai-import`

First-pass browser QA per review-levels ("阿澈 does first QA for UI direction and
user-visible quality; the owner does final PO QA"). This cut's import → publish flow
needs external AI API keys (`DEEPSEEK_API_KEY`/`OPENAI_API_KEY`) and a real six-family
DOCX, so the import/publish scenarios are **owner-environment only** and are left to PO
QA. The render-only scenarios were done here.

## Environment

- Dev stack: `npm run dev` (api `:8787` + vite `:5173`).
- No clean I5-produced six-family asset existed on disk, so the writing views were
  rendered against an **I5-shaped** asset built for QA: a copy of the canonical
  `paper-2024-jslk-english` asset with each writing group's `passage.paragraphs`
  populated from its `writingTask.instruction` — exactly the shape
  `packageBuilder.mjs:542-547` writes on a real import. (QA asset removed after.)
- Entry URL = the real writing QA-link shape the publisher emits
  (`publisher.mjs:438-455`): `?view=paper-intelligence&source=paper-asset&paperId=…&surface=paper&groupId=…`.

## Scenarios covered here (render-only)

| # | Scenario | Result |
|---|---|---|
| 4 | Open a writing QA link (no `questionId`) — application | **PASS** — A4 card renders the application prompt in full ("你校英文报计划举办…(1)…(2)…"); left rail "应用文写作"; right panel shows the no-active-question state ("点击左侧题目查看解析"); **no console error** (incl. no missing-`questionId` error). |
| 5 | Open the continuation writing QA link | **PASS** — A4 card renders the continuation instruction ("阅读下面材料，根据其内容和所给段落开头语续写两段…"); left rail "读后续写"; same no-active-question panel; no console error. |

This confirms PA Q3 at the browser level: the `questionId`-less writing QA link loads
the writing view cleanly with no console error, and each writing group renders its own
prompt/material with the correct empty-analysis panel.

## Deferred to PO QA (owner environment required)

| # | Scenario | Why deferred |
|---|---|---|
| 1 | Import a complete six-family paper → workbench shows application + continuation 就绪; publish enabled only when both ready | needs AI API keys + real DOCX |
| 2 | Strip writing → `缺应用文写作`/`缺读后续写`, publish disabled | needs the import pipeline |
| 3 | Publish a six-family paper end-to-end → no DB CHECK error, writing groups in the asset | needs API + publish |
| 6 | Parse one **real** exam DOCX → both writing tasks parse, ≥2 English starters | owner's machine + paper (verify-i5 real-DOCX test skips off it) |

## Findings

**F1 — Should Watch: `writingPaperViewAdapter` renders only from
`group.passage.paragraphs`, ignoring `writingTask.instruction`.**
`buildWritingTextMap` (`writingPaperViewAdapter.ts:102`) reads `group.passage?.paragraphs
?? []`. For I5's own import this is fine — `packageBuilder` writes both `passage.paragraphs`
and `writingTask.instruction` from the same source, so they agree and the prompt renders
(confirmed above). But:
- The on-disk canonical asset `paper-2024-jslk-english` has writing groups with
  `passage: null` (prompt only in `writingTask.instruction`) → its writing view renders
  **blank**. That asset predates I5; I5 does not cause it. Not a land blocker.
- The prompt living in two fields is a divergence risk for the future writing-analysis
  cut. A cheap hardening: have the adapter fall back to `writingTask.instruction` when
  `passage.paragraphs` is empty. Record, do not block.

## Verdict

Render-only scenarios (4, 5) **PASS** — the new user-visible writing A4 view works and
the `questionId`-less path is clean. No UI-direction or visual defect. **Land-readiness
on the browser axis is contingent on the owner running PO QA scenarios 1–3 and 6** on a
real six-family import, since those need the AI pipeline and a real paper.
