# Design Gaps Log

来源规则：`docs/agents/ui-collaboration.md`「写 CSS 与 token 的纪律」里的
The No-Literal-Fallback Rule（design-canon 立项 2026-07-14；2026-10-13 以前写在
DESIGN.md §7）。agent 写 CSS/token 时遇到既有 token 体系覆盖不到的取值
（颜色/间距/圆角/时长/曲线等），**禁止**现场拼字面量兜底——在这里显式
记一条缺口，标注临时方案，攒批等 owner 拍板收编成正式 token 或既有
token 的扩展用法。

条目收编后从本文件删除（或标记「已收编 → 落地 commit」），不留死缺口。

## 格式

每条一个二级标题，四个字段：

```
## YYYY-MM-DD 位置（文件:行 或 组件名）

- **想要的值**：描述这次实际需要、但现有 token 不覆盖的取值
- **临时方案**：这次先怎么权宜处理的（字面量/复用哪个不完全贴切的 token）
```

## 条目

## 2026-07-15 paperBrowsePage.css `.paper-browse-rail-panel`（整卷预览目录 rail 面板底）

- **想要的值**：暖纸系的「纸面 surface」档——一张浮在暖纸桌（--paper-bg
  #f4f1ea）上的浅纸面板底色，与卷面 A4 白同族但略低一级；--paper-* 家族现
  只有 bg/ink/ink-strong/border 四档，没有 surface 档。
- **临时方案**：字面量 `rgba(255, 255, 255, 0.6)`（半透明白叠暖纸底），落在
  `.paper-browse-rail-panel` 的 background。若日后收编，候选名 `--paper-surface`。

## 2026-08-28 全站按钮基档字号 13px（App.css `.primary-button/.ghost-button/...` 共享块）

- **想要的值**：按钮标签字号收进 The Four-Step UI Type Ramp（28/16/14/12 四档，
  禁 13px 半档）——需 owner 拍板走 12px（Label，更秀气）还是 14px（Compact
  Body，更舒展），再一刀切。
- **临时方案**：维持既有 13px 不动（quiet-chrome 刀只摘盒子、不动字号，避免
  全站布局位移）。本刀已顺手把 `.concierge-action` 的 12.5px 收进 12px，
  其余 13px 实例留待本缺口闭环。
- **2026-10-13 注**：2026-09-04 起工具界面四级字号改为 12 / 13 / 14 / 20
  （DESIGN.md §3），13px 已在族内。这条缺口等 Owner 确认后删除。

## 2026-09-15 语义色写小号正文（成功 `#1FA062`、提醒 `#E8901A`，跨文件）

- **想要的值**：能写小号正文、对浅底达到 WCAG AA（≥ 4.5:1）的语义色文字档，
  并在各文件之间统一。实测成功色对白 3.35:1，提醒色对白 2.49:1；提醒色的明度
  是 Owner 为讲评线色所定，线和图形不改。
- **临时方案**：语义色只作 chip 底、边、图标和大字。提醒色写小字时用
  `--eqb-color-warning-text`（`#965a08`，对白 5.58:1）；成功色还没有对应的
  文字档。2026-10-13 从 DESIGN.md §2 移入，留待独立刀。

## 2026-09-30 句子分析卡片（`.paper-sentence-analysis`）

- **想要的值**：成功绿的深色文字档，和 `--eqb-color-warning-text` 对称。成分标签、引导词和气泡标题都是 11–14px 的绿字，直接用 `--eqb-color-success #1FA062` 过不了 4.5:1。
- **临时方案**：在 `.paper-sentence-analysis` 里用 `color-mix(in srgb, var(--eqb-color-success) 68%, var(--desk-ink))` 派生出 `--sa-green`，不进全局 token。若日后收编，候选名 `--eqb-color-success-text`。
- **2026-10-13 更新**：卡片已改成「奶青 + 奶黄」两色方案，上面的绿字派生不再使用。想要的值：一组可点击成分的浅青底/边/字，一组「正在读」的浅黄底/边。临时方案：`sentenceAnalysis.css` 顶部的 `--sa-label-bg #dcede3`、`--sa-label-rest #e5f1e9`、`--sa-label-edge #bcd6c7`、`--sa-action-hover #cde5d7`、`--sa-action-selected #b4d8c4`、`--sa-label-active #5a8a72`、`--sa-label-ink #2f5a45`、`--sa-green-wash #ffe8ad`、`--sa-related-bg #fff4d7`、`--sa-text-edge #b89c56`，只在卡片作用域内生效。若收编，候选名 `--eqb-color-annotation-*`。
- **想要的值**：比 12px Label 再小一级的"行间标注"字号。原句上方的成分标签、下方的难点标签、弱墨小字和气泡按钮要夹在 3.9 倍行距的两行正文之间，12px 会让相邻标签更常互相让位。
- **临时方案**：这几处用 11px 字面量（`sentenceAnalysis.css` 的 `.sa-label`、`.sa-flag`、`.sa-quiet`、`.sa-bubble-unsure`、`.sa-bubble-action`）。若收编成 Type Ramp 的注释档，候选名 `--eqb-font-size-annotation`。
- **想要的值**：贴在正文里的轻浮层阴影。`--eqb-shadow-floating`（0 8px 24px 12%）对一行高的气泡太重，会压住下一行字。
- **临时方案**：`.sa-bubble` 用 `0 2px 8px rgba(25, 29, 24, 0.08)`。候选名 `--eqb-shadow-inline`。
