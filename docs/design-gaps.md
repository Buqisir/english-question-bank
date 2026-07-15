# Design Gaps Log

来源规则：DESIGN.md §7 The No-Literal-Fallback Rule（design-canon 立项
2026-07-14）。agent 写 CSS/token 时遇到既有 token 体系覆盖不到的取值
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
