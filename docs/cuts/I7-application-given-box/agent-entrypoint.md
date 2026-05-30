# I7-application-given-box — Agent Entrypoint

应用文给定上下格式：splitter 解析抓取 → 渲染进答题框（I6 的后续，纯解析+渲染）。

## Must Read

- `docs/cuts/I7-application-given-box/plan.md` — 执行契约（检测/切分规则、数据契约、三步、Forbidden）。

## Background（同会话已加载可跳过）

- `docs/cuts/I6-writing-render/plan.md` — 前序：写作卷面渲染（PaperSurface 哑、content.blocks 渲染源）。
- `docs/adr/0007-writing-import-data-contract.md` — 写作数据契约（本 cut 扩 PaperWritingTask）。
- `docs/product/exam-paper-format-reference/images/page-11-writing-start.jpeg` — 应用文框版式标尺。
- `server/paper-import-ai/docxSplitter.mjs` `extractApplicationParagraphs` — 改造点。

## Status

PM grill ✅（重庆卷数据已核）→ plan.md ✅（PO 全过 2026-05-31）→ **PA pending（数据契约+解析可靠性）**
→ DEV → CR-lite → browser QA → PO QA → RM。
