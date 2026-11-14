# 修卷面顺序（走查卡点 1 / 第四节第 1、3 条）

Owner 2026-11-14：「卷面顺序跟老师排的走，8 个问题都照你的」。这次只做两条：

1. 卷面顺序跟左栏走，卷面篇目字母按草稿顺序重排（第一篇阅读就是 A），原卷字母写在左栏那一行的小字里（「原卷 D 篇」）。
2. 新加入的题组排在最后，和老师点的顺序一致。

## 根因

- **卷面顺序**：`server/draft-paper/draftPaperStore.mjs` 的 `buildCanonicalVisibleBlocks` 会在草稿里的题组都来自同一张源卷时，按源卷的 `visibleStructure` 顺序出块，不看草稿顺序。卷面上的篇目字母也直接取源卷的 slotId。没有 spec 或 ADR 规定草稿卷要按原卷顺序（只有「定页版」导出要求按原顺序排的同源完整卷）。`docs/cuts/draft-depassage-letter/plan.md` 原本的拍板是草稿卷不带 A–D，现在已在那里补记 2026-11-14 的改动。
- **新加的排最前**：`addGroupToDraftPaper` 在没传 `insertIndex` 时，`Number(null) === 0` 被当成「插到第 0 位」。

## 改了什么

- `server/draft-paper/draftPaperStore.mjs`：按草稿顺序出块。部分标题、节标题和节首说明（如「阅读下列短文…」）在部分或节切换时出现，其余题组说明跟着自己的题组走。源卷分页提示只在相邻关系没变时保留。没传 `insertIndex` 时追加到末尾。新增 `draftReadingPassageLetters`，按卷面顺序给阅读篇目重新编 A、B、C…。
- `server/print-renderer.mjs`（只改 JS，没改 CSS）：可以从外部传入篇目字母，Canonical 阅读按实际出块顺序处理。
- `app/src/features/draft-paper/DraftPaperRail.tsx` 和 `DraftPaperWorkbench.css`：左栏显示「A篇」，后面的小字是「原卷 C 篇」。
- `docs/cuts/draft-depassage-letter/plan.md`：补记 Owner 这次的改动。

PaperSurface、`@media print` 和 PDF 模板样式都没改。

## 截图

| | 改之前 | 改之后 |
|---|---|---|
| 加入 A、C、D | — | `after-00-首页加入ACD.png` |
| 打开草稿卷 | `before-01-打开草稿卷.png` | `after-01-打开草稿卷.png`、`after-01-打开草稿卷-左栏.png` |
| 第一篇下移后 | `before-02-第一篇下移后.png` | `after-02-第一篇下移后.png`、`after-02-第一篇下移后-左栏.png` |

改之后的走查（端口偏移 48）：

- 依次加入 A、C、D，草稿顺序是 A、C、D（追加在后面）。
- 第一篇下移后，草稿是 C、A、D。左栏显示「A篇 原卷 C 篇 / B篇 原卷 A 篇 / C篇 原卷 D 篇」，卷面是 C(A)、A(B)、D(C)。
- 「第一节…」和「阅读下列短文…」仍在卷首，只出现一次。第一版改动曾经让这句说明跟着原卷 A 篇一起移走并丢失，已修好。
- 导出 PDF（largeNoListening）的文字顺序是 C、A、D，篇目字母是 A、B、C，说明句在卷首。

## 跑过的检查

- `npx tsc -b`：通过。
- `npx eslint src/features/draft-paper/DraftPaperRail.tsx`：通过。
- 两个改过的 server 文件跑了 `node --check`：通过。
- 上面的走查截图和 PDF 文字检查。

## 没验证的

- 按要求没跑任何 `verify-*.mjs` 或 `smoke-*.mjs`。这几个脚本可能受影响：verify-paper-canonical-reading-rendered-behavior、verify-reorder-suggest、verify-a3-imposition。
- DOCX 导出、教师版、听力或完形混排、超过 4 篇阅读，都没看。
- 走查只看了 largeNoListening 这一种 PDF。
