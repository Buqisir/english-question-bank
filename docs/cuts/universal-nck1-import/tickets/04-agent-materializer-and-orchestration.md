# 04 — Agent 材料化与统一入口

Status: done
Blocked by: `03-universal-candidate-adapter.md`
Next on PASS: `05-chongqing-development-canary.md`
Terminal: no

Spec: `docs/cuts/universal-nck1-import/spec.md`

## What to build

提供不要求格式编号的统一 CLI/Agent 契约：初始化卷目录、记录源角色、生成/校验
Materialization、确定性提取媒体、派生 Candidate，之后复用现有分析、写作、门禁、
signals 和发布停点。支持中断续跑。

## Acceptance criteria

- [x] 输入只需源文件、答案、paperId、出处。
- [x] PDF 文本层、扫描 PDF、DOCX media 和 DOCX shape 有明确路径。
- [x] 表格走结构化网格，图走源媒体配方。
- [x] 不编辑 registry 或共享代码即可开始下一卷。
- [x] 缺答案或 unresolved source issue 写 blocked/help receipt 并停。

## Out of scope

- 网站导入 UI、后台直连 LLM、生产 push。

## Result

`universal-nck1.mjs init|verify|build` 已成为统一入口；源文件摘要、DOCX PDF
rendition、媒体提取配方、Candidate digest 和未确认停点均由卷目录闭合。旧格式
脚本仅保留给存量卷复现。
