# flow-hover — 整卷页流式化 + 悬浮显形（DEV 执行契约）

- Cut line: **medium**; touches schema / data contract / product boundary /
  teaching interpretation: **no**（纯 UI 交互；PaperSurface 零修改；无 PA
  触发条件，走 medium 标准流：plan → Sonnet DEV → fresh Opus CR → 浏览器 QA）。
- 来源：`docs/STATUS.md` owner 定调 UI 轨队列首刀——「flow-hover（流式化+
  悬浮显形+rail联动+触屏兜底+尾部解析杆）」。页谱：整卷页=卷语境挑题。
- 施工分两段串行，各自独立成 PR、独立可合可用：
  - **Chunk A（本段）**：流式化 + 悬浮显形 + rail 联动 + 触屏兜底。
  - **Chunk B（第二段，A 合并后另派）**：尾部解析杆。本文件只给方向预告，
    细节在 A 收口后补进本 plan 再派工。

## 背景（现状一句话）

`app/src/features/paper-browse/PaperBrowsePage.tsx` 目前把每个题组渲成
「卡片：头部条(h4 标题 + 加入草稿卷按钮) + PaperSurface 只读卷面」，左侧
rail 只有单向点击跳转、无滚动联动。要磨成：浏览时是干净连续卷面，操作
在悬浮时显形。

## Chunk A — Scope

允许修改的文件（白名单，出界即停）：

- `app/src/features/paper-browse/PaperBrowsePage.tsx`
- `app/src/features/paper-browse/paperBrowsePage.css`
- `scripts/verify-paper-browse.mjs` —— **窄改授权**：仅当现有断言引用了被
  退役的卡片头部结构时同步修断言/补新断言；不得删除路由与
  focusGroupId 相关断言。

Forbidden（碰到即违规）：`app/src/shared-ui/papersurface/**`、
`app/src/features/paper-intelligence/*Adapter*`、`server/**`、
`app/src/domain/**`、App.tsx 路由逻辑、print/PDF/DOCX/export 样式、
其他页面。DEV 全程只在自己的 worktree 内操作（开工先 `pwd` 自证，
第一步跑 `bash scripts/setup-worktree.sh`；禁 `git stash`）。

## Chunk A — 交互规格

1. **流式化**
   - 题组卡的外框视觉与头部条（`paper-browse-group-card-header`：h4 +
     header 内按钮）退役；题组间以卷面自身的留白/标题分隔，整页读起来
     是一张连续卷面。
   - 题组 wrapper 元素保留（`data-paper-browse-anchor` 是 rail 跳转与
     `focusGroupId` 定位的锚，不许丢）；`aria-label` 保留。
   - hover 时 wrapper 允许极轻的显形提示（如浅背景/浅描边），移开恢复
     纯卷面；不要卡片阴影。
2. **悬浮显形（操作簇）**
   - hover 或 `:focus-within` 时，题组右上角浮出操作簇，当前仅一个成员：
     「加入草稿卷」按钮，三态文案与 disabled title 逻辑与现实现完全一致
     （in_current_draft／disabled／可加入），不改状态机。
   - 浮出位置不得遮挡卷面正文（右上角、随题组滚动即可，简单方案优先；
     无需 sticky 追随）。
   - 键盘可达：按钮可 Tab 聚焦，聚焦即显形（`:focus-within` 天然满足）。
3. **rail 联动（scrollspy）**
   - IntersectionObserver 监听滚动容器内各锚点，rail 当前项高亮 +
     `aria-current="true"`；滚动经过与点击跳转后高亮均正确。
   - 多项同时可见时取视口内最靠上者；实现保持简单，不做像素级仲裁。
   - 点击跳转行为保留不动。
4. **触屏兜底**
   - `@media (hover: none)` 下操作簇常显（紧凑版，不需要 hover 才出现）。
5. **不变量**
   - PaperSurface 挂载方式、adapter 调用、数据加载、草稿卷 chip、
     AppTopbar、focusGroupId 滚动定位：全部不动。

## Chunk A — 验收标准

- 默认浏览态：除 rail 与底部草稿卷 chip 外，卷面上无操作 chrome。
- hover 题组 → 操作簇显形，移开 → 隐匿；Tab 聚焦到按钮同样显形。
- 加入草稿卷三态行为与改造前一致（含 disabled title 文案）。
- rail 随滚动高亮当前项；点击 rail 跳转正常；`focusGroupId` 深链定位
  不回归。
- `node scripts/verify-paper-browse.mjs` 绿；`pnpm -C app run verify:all`
  或 PR CI 绿。
- **真点浏览器 QA 必做**（用户可见交互变化）：本地起服，用
  paper-2026-i 实卷走 hover 显形/rail 联动/触屏模拟（DevTools 触屏仿真
  或 Playwright `hasTouch`），截图留档在 DEV 报告里。

## Chunk B — 尾部解析杆（预告，暂不施工）

每题组尾部一根默认收起的解析杆（复用
`app/src/features/question-detail/AnalysisDisclosure.tsx` 的模式），
展开显示详情页同款解析块；解析两语境：整卷/详情=决策场景默认收起，
解析页=深读不动。数据源倾向复用 `questionGroupById`（详情页同源）。
细节待 Chunk A 收口后由 PM 补章再派。

## DEV 汇报要求

改动文件清单、verify 摘要（非原始日志）、浏览器 QA 状态+截图路径、
自评盲区（Self-Review Blind Spots）。
