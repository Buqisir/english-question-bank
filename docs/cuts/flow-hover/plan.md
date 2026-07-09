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

## Chunk B — 尾部解析杆（已撤刀，2026-07-08 owner 定向）

> **撤刀记录**：Chunk B 施工完成（分支
> `worktree-agent-a23d35ce234711510` @ 7c13124，DEV 验收全绿）后、CR
> 完成前，owner 定向改道：尾部解析杆每组一根，会把 Chunk A 刚磨平的卷面
> 重新切回卡片感，且"解析进整卷页"应以**右栏整条讲评面板**（一页两姿态）
> 的形态实现。方案移交新刀 `docs/cuts/flow-panel/plan.md`。
> 分支保留作参考（答案行/深读链接取数逻辑将在 flow-panel 刀 1 复用），
> flow-panel 刀 1 合并后删除。本节以下契约仅存档，不再执行。

> 前置：Chunk A 已合并（93bc7d4，CR APPROVE，main CI 绿）。

### Scope

允许修改的文件（白名单，出界即停）：

- `app/src/features/paper-browse/PaperBrowsePage.tsx`
- `app/src/features/paper-browse/paperBrowsePage.css`
- `scripts/verify-paper-browse.mjs` —— 授权两件事：① 必要断言窄改；
  ② **补轻量断言**覆盖本刀新行为（CR Should Watch 销账：解析杆存在且
  默认收起、悬浮操作簇 CSS、rail aria-current——source-level 即可）。

Forbidden 同 Chunk A（PaperSurface / adapter / server / domain /
App.tsx / print/export / 其他页面）。允许 **import**
`app/src/features/question-detail/AnalysisDisclosure.tsx`（只 import
不修改；其样式在全局 `App.css` 已加载，浏览页皮肤差异用自己的
className 叠加，不改 App.css）。

### 交互规格

每题组 section 尾部（卷面之后）挂一根解析杆，用 AnalysisDisclosure
默认形态（「展开解析」/「收起」，默认收起，不持久化、不进 URL）。
这是**决策语境速览**，不是深读——展开内容三件：

1. **答案行**：数据取整卷页已加载的 `asset.answerKey.answers`（零新增
   请求），过滤本组 `questionIds`、按 `questionNo` 排序，紧凑排版
   （如 `21. B　22. A　…`）。`groupType === 'writing'` 不渲染答案行；
   其他题型 answerKey 无命中时显示「答案未入库」。
2. **每题一句聚焦**（仅限已有数据的题型，零新增请求）：reading 用已
   加载 reading-choice-analysis 里每题的 `questionFocus`；sevenChoices
   若已加载 analysis 有等价字段则同样一句，没有就整段省略。
   cloze / grammarFill / writing 不做 digest、不新增 fetch。
3. **「深读解析」链接**：与详情页同款守卫与形态——
   `card.hasPaperSurfaceAnalysis && card.paperSurfaceHref` 时渲
   `<a href={card.paperSurfaceHref}>`（card 来自 `questionGroupById`），
   文案 `card.paperSurfaceLabel ?? '深读解析'`。无 card 或无解析时
   整个链接不渲染。

不变量：Chunk A 的悬浮显形 / scrollspy / 触屏兜底不回归；数据加载
路径零新增请求；PaperSurface 挂载不动。

### 验收标准

- 默认收起：浏览态卷面尾部只有一根杆，无解析正文。
- 展开：答案行与 `answer-key` 实卷比对一致；reading 每题一句聚焦；
  writing 无答案行；深读链接落到解析页并锚定该题组。
- 收起/展开可反复；触屏下可点；Tab 可达（AnalysisDisclosure 自带
  button + aria-expanded）。
- `node scripts/verify-paper-browse.mjs` 绿（含新补断言）；
  `pnpm -C app run verify:all` 或 CI 绿。
- 真点浏览器 QA 必做：paper-2026-i 实卷，覆盖上述各条 + Chunk A 交互
  抽查（hover 显形、rail 联动），截图入 `docs/cuts/flow-hover/qa/`。

### DEV 汇报要求

同 Chunk A：改动文件、verify 摘要、浏览器 QA 状态+截图路径、
Self-Review Blind Spots、越界/契约冲突声明。

## DEV 汇报要求

改动文件清单、verify 摘要（非原始日志）、浏览器 QA 状态+截图路径、
自评盲区（Self-Review Blind Spots）。
