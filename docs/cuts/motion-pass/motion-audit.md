# motion-pass 全站动效审计（2026-07-12）

工具：improve-animations（Emil 标尺）+ impeccable v3.9.1。审计员：小川
（主代理，逐条核过 file:line 原文）。基线 commit：a081408。

## 大盘

- 纯 React + CSS，无动效库。动效面：15 文件 / ~65 条 transition /
  13 组 @keyframes。
- **零动效 token**：`--ease-*` / `--duration-*` 全站不存在。时长
  80ms–900ms 手写散落，单位混写（`0.15s` vs `150ms`），曲线混用
  （ease / ease-out / ease-in / ease-in-out）。
- 全局 `prefers-reduced-motion` 重置**已存在**（`app/src/App.css:4343`，
  `*` 通配 0.01ms），各 feature CSS 里零散 `animation: none` 冗余但
  无害。此项缺口已闭，本刀不需补全局退化。

## 发现（按杠杆排序）

| # | 严重度 | 类别 | 位置 | 发现 | 修法 |
| --- | --- | --- | --- | --- | --- |
| 1 | HIGH | token/一致性 | 全站 | 零 token，时长/曲线/单位全手写 | 收 `--motion-*` / `--ease-*` 五档 token 并统一映射 |
| 2 | HIGH | 缓动 | paperIntelligencePaperSurfaceHarness.css:1553 | 结构括线入场 `ease-in`（入场慢启动，方向反了） | 改 `var(--ease-out)` |
| 3 | MEDIUM | 性能 | App.css:181,198,211,388,1294,1660,2962,3095,3135 | `transition: all` ×9，连带动非 GPU 属性 | 换显式属性列表 |
| 4 | MEDIUM | 缓动/时长 | App.css:2365 | fadeInUp 入场弱 `ease` + 350ms（超 300ms UI 预算） | 强 ease-out + 260ms |
| 5 | MEDIUM | 补缺 | DraftPaperWorkbench.css:446 | draft-undo-toast 无入场动效（瞬移出现）；similar-toast 有 0.18s 滑入，同类不一致 | 复用 similar-toast 处方（entrance keyframes） |
| 6 | MEDIUM | 性能/感受 | paperBrowsePage.css:36 | 讲评栏开合动 `grid-template-columns`（整列 layout 动画，内含整张卷面） | 本刀只 token 化不改机制；收口 QA feel-check，卡则删动画（小刀跟进） |

## Owner「值得动的时刻」清单核对（2026-07-10 圈定）

- 配相似入场 ✓ 已有（similar-rcard + similar-toast，0.18s opacity/transform）
- 加卷乐观翻转 ✓ 已有（basket-count-in-up/down 0.18s）
- 悬浮显形 ✓ 已有（concierge-row-expand-hint 140ms，emil 处方注释在档）
- 讲评栏开合 ✓ 已动（见 #6，feel-check 待收口）
- toast ✗ 缺 → 本刀补（#5）
- 折叠 ✗ 全站扫描无折叠动效；具体指哪个折叠面待 owner QA 时确认，
  确认后另立 small 刀（height-auto 动画有兼容性成本，不盲补）

## 明确不动

- 七选五 0.9s 跳卡（pi-seven-card-jump）：「点谁看谁」签名注意力时刻，
  owner 拍板产物，不重审。
- skeleton shimmer 1.6s ease-in-out infinite：装载指示常速循环，合规。
- 按压反馈（:active scale）全站铺开：属「全站动效化」，刀章程明确不做。
- `shared-ui/papersurface/PaperSurface.css`：契约文件（print/export
  相邻），其 3 条 hover transition 留手写值，划出本刀范围。

## 裁点（UI direction 授权内决定，PO 可否决）

DESIGN.md「交互态 150–250ms」与现实不符（大量 80–120ms 微反馈是对的
——高频元素动效应更短）。修订为五档 token 制，条款随本刀更新 DESIGN.md。
