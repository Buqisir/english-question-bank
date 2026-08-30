# 05 — 重庆五检开发 canary

Status: done
Blocked by: `04-agent-materializer-and-orchestration.md`
Next on PASS: `06-blind-imports-and-retirement.md`
Terminal: no

Spec: `docs/cuts/universal-nck1-import/spec.md`

## What to build

用 owner 提供的重庆 2026 届第五次质检 PDF/DOCX 与权威答案走通统一入口。
Reading A 产品标签外框/文字为 native table，警示与回收图标、条码为原始媒体。

## Acceptance criteria

- [x] `paper-mock-cq-2026-m5` 九题组与完整 inactive Listening 闭合。
- [x] PDF 与 DOCX 路径可见语义一致。
- [x] 标签不是整图；表内媒体摘要绑定原始 DOCX/PDF。
- [x] Screen、Student/Teacher Print、PDF 正确。
- [x] 导入期间没有 paperId 共享代码特例。

## Out of scope

- 生产上线。

## Result

重庆卷闭合 9 题组、65 条答案断言、完整 inactive Listening 和 5 个源媒体。
Reading A 以一个 native table 重画，5 个图标/条码按原媒体摘要加载；Screen、
Student/Teacher Print HTML 与 PDF 的统一消费验收通过。
