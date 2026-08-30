# 02 — 表格单元格承载源媒体并三面渲染

Status: done
Blocked by: `01-source-materialization-contract.md`
Next on PASS: `03-universal-candidate-adapter.md`
Terminal: no

Spec: `docs/cuts/universal-nck1-import/spec.md`

## What to build

扩展 Canonical Reading table cell，使单元格可按序承载文字和已闭合媒体引用；投影、
Screen、Print HTML、PDF 消费同一结构。媒体必须属于同组 `media` 且摘要/尺寸闭合。

## Acceptance criteria

- [x] 纯文字表格行为不变。
- [x] 表内图标/条码可与文字共同出现，顺序稳定。
- [x] 悬空、重复或错组媒体失败。
- [x] 重庆标签合成夹具三面呈现 native table + source media。
- [x] 整表截图不会成为 Canonical body fallback。

## Out of scope

- 从源卷识别表格、真实重庆卷数据、通用 adapter。
