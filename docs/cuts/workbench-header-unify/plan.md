# workbench-header-unify Plan — 工作台头部统一为解析页语言

## Cut Size

small-medium；touches schema / data contract / product boundary / teaching
interpretation: **no**（纯 UI 重排 + 交互细化，零数据契约）。PA 不设
（方向由 owner 三轮现场 mock 实点拍板：v2 解析页式头 / v2.1 暖桌通铺 /
v2.2 纸列加宽）；fresh CR 冷读。

## Objective

草稿卷工作台的「表单式双层工具条」退役，头部改为解析页同款语言：一行
顶栏承载全部身份与动作；暖桌通铺到顶；纸列微加宽。出处：owner
2026-07-14「哪里磨哪里」现场会（Chrome 注入 mock 三轮实点，「没问题」）。

## Locked Decisions（owner 实点拍板，不得重开）

1. **跟随条去掉**：`.draft-toolbar` 的 `position: sticky` 三行退役，回归
   文档流（DraftPaperWorkbench.css:32-34）。
2. **头部一行化（解析页语言）**：
   - 草稿卷标题升入 AppTopbar 的 `pageTitle` 位（同解析页显示卷名），
     **点击可编辑**（hover 显示可编辑暗示，编辑中变输入框，blur/回车
     落库走现有 updateTitle）；
   - 学生（可选）/ 最近草稿卷 / 自动保存状态 三项降级收进头行一枚
     安静「⋯」菜单（点开小浮层，字段行为原样：学生 blur 保存、最近
     切换走现有 pushState 逻辑、保存状态实时显示）；
   - 学生版/教师版 segmented + 导出菜单（含 draft-docx 新加的 DOCX 项）
     移入头行右侧、置于全局动作（个人空间/退出）之前，中间细分隔线；
   - 原 `.draft-toolbar` 整条 DOM 退役。
3. **暖桌通铺到顶**：`.draft-preview-desk` 的 `margin-top: 18px` 去掉
   （v2.1 实证「小灰」即此缝漏出的冷底），白顶栏直接落暖桌，与解析页
   同构。
4. **头-纸垂直节奏对齐解析页**（owner 2026-07-14 改判：撤回纸列加宽，
   纸维持 820px；真病灶是头到卷子的距离太高把头衬细了）：
   `.draft-preview-desk` padding-top 24→10px、`.draft-paper-meta-row`
   margin-bottom 14→10px（v2.3 mock 实点方向认可，终值 DP-3 可微调）。

## 硬契约

- AppTopbar 改动最小化：pageTitle 位支持「可编辑模式」经 prop 注入
  （如 `pageTitleEditable` + 回调），**不得**把草稿卷业务逻辑塞进
  AppTopbar；其他页面（解析页/整卷/个人空间/详情）顶栏渲染零变化。
- 全部现有行为零丢失：标题编辑、学生标签、最近切换、保存状态、版本
  切换、导出三出口（PDF/DOCX/打印/存空间）——只换容器不换逻辑。
- 动效/颜色全走 token（verify-motion-tokens 在岗）；「⋯」浮层复用现有
  菜单样式系（draft-export-menu 同款）。
- 头部布局在 ≤980px 窄屏的退化方案沿用现有断点思路（挤不下时「⋯」
  吸收版本切换，导出永远可见）。
- 与解析页/paper-browse 的头部同构性自查一步入完成报告（那两页应已
  是目标形态，不改；若发现偏差只记录不顺手改）。

## Forbidden

- `server/**`、domain、schema、`*Adapter`、PaperSurface、print/export
  渲染链路（纸列宽度只改预览容器 max-width，不碰分页引擎参数）。
- 解析页/整卷页/主页的任何文件；`AppTopbar` 中 home variant 分支
  （home-blank 刚定型）。
- 导出菜单内部逻辑（draft-docx 刚收官）。

## Verification

- 授权更新 `scripts/verify-c8-draft-paper-contracts.mjs` 等断言中与
  `.draft-toolbar` DOM 结构耦合的条目（如有），改写为新头部契约；
  `verify-error-copy-mainline.mjs` 的 catch 计数如受牵连同步登记。
- narrow：`node scripts/verify-c8-draft-paper-contracts.mjs`、
  `node scripts/verify-motion-tokens.mjs`
- full：`pnpm -C app run verify:all`
- headless 行为自验：标题点击编辑落库、「⋯」内三字段行为、版本切换、
  导出菜单四出口可达、非 sticky（滚动后工具条不在视口）、窄屏退化。
- DP-2 主代理浏览器复核 + 截图对照三轮 mock。

## DEV Readiness

worktree `../wt-header-unify`（开工时建）；断点锚 wip commit；完成报告
按 dev-completion-protocol。**开工前置：DP-1b 纸列宽度定值。**

## 裁决点清单

- [x] DP-1a 方向拍板（owner 三轮 mock 实点「没问题」，2026-07-14）
- [x] DP-1b 头-纸垂直节奏（owner 2026-07-14 v2.3 实点：撤回纸宽 870，
  改压头到纸距离对齐解析页——desk padding-top 10px + meta-row
  margin-bottom 10px 暂定，DP-3 微调终值）
- [ ] DP-2 CR verdict 处置 + 主代理复核
- [ ] DP-3 owner 生产实用一轮（组卷→改题→导出全流程手感）
