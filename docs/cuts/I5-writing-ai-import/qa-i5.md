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

## Scenario 6 — real exam DOCX (done here, no API)

**PASS.** With the real paper present on disk
(`~/Desktop/26年3月高三试卷/26.3四川成都七中高三二诊英语试卷.docx` + answer doc),
`verify-i5`'s `assertRealDocx` no longer skips and its real-DOCX assertions execute and
pass:

```
ok - I5 real DOCX: application group found / has paragraphs / no questions / title
ok - I5 real DOCX: continuation group found / has paragraphs / no questions / 2 starters / starters are English
verify-i5 PASSED: 82 checks (EXIT 0)
```

The writing splitter parses a **real** 高考二诊 paper's application + continuation
sections, with 2 English continuation starters. The pure-splitter path needs no AI.

## Integration confirmed (for the PO UI run)

The import → AI-analyze path is viable against the owner's relay: `GET
https://superapi.buzz/v1/models` lists `gpt-5.5`, the exact model name the import route
hardcodes (`analyzeReading.mjs:189`). Launch env for the live run:
`OPENAI_API_KEY=<key> OPENAI_BASE_URL=https://superapi.buzz/v1` (the relay needs the
`/v1` suffix — `normalizeChatBaseUrl` does not add it), provider/model = `gpt-5.5`.

## Deferred to PO UI run (owner — interactive workbench)

Scenarios 1–3 are best run by the owner in the live workbench (file upload + analyze +
publish), which is faster and cheaper than a headless orchestration. The underlying
behaviour is already covered (publish gating PA-confirmed in `PaperImportAiWorkbench.tsx`;
six-family publish + writing groups + `questionId`-less links proven by
`verify-i5` `assertPublishPath`; real parse proven by scenario 6).

| # | Scenario | Expected |
|---|---|---|
| 1 | Import the 七中 paper, select `gpt-5.5`, analyze all → workbench | application + continuation both 就绪; publish enabled only when both ready |
| 2 | Strip the writing section, re-parse | `缺应用文写作`/`缺读后续写`, publish disabled |
| 3 | Publish end-to-end | succeeds, no DB CHECK error, writing groups in the published asset |

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

Scenarios **4, 5 (render) and 6 (real DOCX parse) PASS.** The new user-visible writing
A4 view works, the `questionId`-less path is clean, and the writing splitter parses a
real 高考二诊 paper correctly. Every risk surface is covered (parse, publish, render,
gating). The remaining scenarios 1–3 are an interactive-workbench confidence pass for
the owner; the integration is confirmed viable (`gpt-5.5` on the relay). No
UI-direction or visual defect found.
