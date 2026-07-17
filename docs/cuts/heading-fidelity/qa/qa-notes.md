# heading-fidelity QA 样张说明（DP-2 证据）

`heading-fidelity-sample.pdf` / `heading-fidelity-sample.docx` 由
`server/print-renderer.mjs` / `server/exports/docxRenderer.mjs`
(exam printStyle, student versionType) 生成，固定 fixture（非真实卷号）——
只为让 owner 在同一页内目检部/节/篇章标题三级层次，不是真实组卷产物。

页面结构（`blocks` 顺序）：

1. `section_header`「第一部分 阅读（共两节，满分50分）」→ **部标题**
2. `question_group`（阅读理解 A，含篇章标题「A New Way to Learn」）→ **篇章标题**
3. `section_header`「第一节（共15小题；每小题2.5分，满分37.5分）」→ **节标题**
4. `question_group`（语法填空）

卷名「2026 新课标 I 英语」在页首，20pt（标准唯一放大项）。

## 生成方式

一次性脚本（未入库，QA 后已删除）直接调用两个渲染器的公开函数：
`buildPrintHtml()`（`server/print-renderer.mjs`）→ `vivliostyle build` → PDF；
`buildDocumentXml()` + `writeDocxPackage()`（`server/exports/docxRenderer.mjs`）
→ DOCX。fixture 的 block/title 文本与
`scripts/verify-print-renderer.mjs` Test 3b、
`scripts/verify-h5g-docx-renderer.mjs` `assertHeadingFidelity()`
里的断言 fixture 同源，可复现。

## 机械项已过（DEV 自验，见下方 selfVerify）

- `node scripts/verify-print-renderer.mjs`（Test 3b：92/92 绿）
- `node scripts/verify-h5g-docx-renderer.mjs`（148/148 绿）
- `node scripts/verify-draft-paper-docx.mjs`（16/16 绿，`.group-header` 未误伤）
- `pnpm -C app run verify:all`（83 pass / 1 skip(off-repo fixture) / 0 fail）

## 待 owner 目检（DP-3，人眼判断项）

- 部标题（黑体加粗顶格）与节标题（宋体常规缩进 2 字符）层级是否一眼可辨
- 10.5pt 后标题会不会显得弱
- 卷名 20pt 观感
