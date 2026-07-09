# flow-panel — 整卷页一页两姿态（挑题态 / 讲评态）

- Cut line（整刀）: **medium ×3 串行**; touches schema / data contract: **no**;
  touches product boundary: **刀 3 yes**（解析页职能迁移，届时 PA-lite 理由
  写入刀 3 契约；刀 1/刀 2 为可逆产品面 UI，无 PA 触发）。
- 来源：owner 2026-07-08 High 档定向（本刀取代 flow-hover Chunk B
  尾部解析杆方案，撤刀记录见 `docs/cuts/flow-hover/plan.md`）。

## 方向（owner 已拍板）

整卷页终局 = **一页两姿态**：

- **挑题态**（默认）：目录 rail 贴左、卷面居中舒展，零解析噪音。
  服务挑题/看卷/打印决策。
- **讲评态**（开关打开）：rail + 卷面 + **右栏解析整条**——从上到下
  贯通、宽度恒定的一根解析面板栏，内容随选中/滚动到的题切换，
  五个题型面板复用解析页现成组件、统一进同一宽度。
- **入口带态**（刀 3）：直接打开整卷页=挑题态；从详情页/搜索卡
  「看解析」进来=讲评态+锚定题组+预选题。链接迁移后老解析页退役
  （过渡期保留；若 owner 实测怀念单组边界感，备用牌=聚焦态：其他
  题组暗化/折叠，同页状态而非第二页面）。
- 交互原则：**开关选姿态，点题选内容**。讲评开着时右栏常驻；
  无点选时右栏跟随 scrollspy 当前题组显示组级概览，点题后进题级。

三刀切法（每刀独立可合可用）：

1. **刀 1（本契约）**：布局重排 + 右栏骨架（组级速览版）。
2. **刀 2**：点题联动 + 五解析面板搬家统一宽度（复用 harness 面板
   与 paperSurfaceHostInteraction 交互协议；面板硬宽度/宽表格清点）。
3. **刀 3**：入口带态 + 链接迁移 + popstate/URL 状态承载
   （paperId+groupId+questionId+讲评态全进 URL）；解析页去留议题。

刀 2/刀 3 细节在前一刀收口后由 PM 补写成执行契约再派工。

## 刀 1 — DEV 执行契约

### Scope

允许修改的文件（白名单，出界即停）：

- `app/src/features/paper-browse/PaperBrowsePage.tsx`
- `app/src/features/paper-browse/paperBrowsePage.css`
- `scripts/verify-paper-browse.mjs`（断言窄改 + 为新行为补轻量断言）

Forbidden：`app/src/shared-ui/papersurface/**`、
`app/src/features/paper-intelligence/**`（刀 1 不碰解析面板）、
`server/**`、`app/src/domain/**`、`App.tsx`、`AppTopbar`、App.css、
print/export、其他页面。

参考实现：本地分支 `worktree-agent-a23d35ce234711510`（7c13124）
是被撤刀的 Chunk B，其中 `buildAnswerRowText`（answerKey 过滤/排序/
writing 分支/「答案未入库」兜底）与深读链接守卫
（`card.hasPaperSurfaceAnalysis && card.paperSurfaceHref`）逻辑可
`git show` 参考移植（只搬逻辑，不搬尾部解析杆的挂载方式）。

### 布局规格

1. **rail 贴左**：目录 rail 靠视口左缘（AppTopbar 之下），去掉现在
   shell 居中带来的左侧大留白；rail 自身宽度维持现状即可。
2. **卷面居中**：paper 列在剩余空间居中；讲评态打开时卷面在
   「rail 与右栏之间」居中，允许平滑过渡（transition 简单即可）。
3. **右栏（讲评栏）骨架**：
   - 固定宽度整条（建议 360–400px 区间定一个值），从内容区顶部
     贯通到底部，独立滚动。
   - **默认收起**。页面右缘一枚常驻竖向把手/胶囊「讲评」，点击开合；
     开合状态本刀存组件 state（URL 承载留给刀 3）。
   - 开着时内容 = **当前题组的组级速览**，跟随 Chunk A 已有的
     scrollspy（`activeAnchor`）切换：
     a. 题组标题 + 题号范围；
     b. 答案行（移植 Chunk B 逻辑：answerKey 过滤本组、按 questionNo
        排序、writing 不渲染、其余无命中显「答案未入库」）；
     c. 「深读解析」链接（守卫与形态同详情页：
        `<a href={card.paperSurfaceHref}>`，无则不渲染）。
     d. activeAnchor 落在 part/section 标题上时，显示最近的题组或
        「滚动到题组查看速览」空态，实现从简。
   - 零新增网络请求（answerKey 在已加载 asset 内）。
4. **窄屏兜底**：视口宽度不足以三栏并存时（阈值 DEV 按现有断点体系
   定，~1200px 量级），讲评栏改为右侧抽屉浮层（overlay），把手仍可用；
   触屏可点。
5. **不变量**：Chunk A 全部交互（悬浮操作簇 / scrollspy / 触屏兜底 /
   focusGroupId 深链）不回归；PaperSurface 挂载、adapter、数据加载
   不动；草稿卷 chip 不动（与右栏/把手不互相遮挡）。

### 验收标准

- 挑题态：rail 贴左、卷面居中、右缘只有「讲评」把手，卷面无解析噪音。
- 开讲评：右栏整条滑出，滚动卷面时速览跟随当前题组切换；答案行与
  `answer-key.json` 实卷一致；writing 组无答案行；深读链接可跳转。
- 关讲评：回到挑题态布局。
- 窄屏（<阈值）：右栏为抽屉浮层，开合正常，不破坏卷面布局。
- Chunk A 交互回归抽查全过。
- `node scripts/verify-paper-browse.mjs` 绿（含新断言：把手存在、
  右栏默认收起、答案行函数关键分支）；`pnpm -C app run verify:all`
  或 CI 绿。
- 真点浏览器 QA 必做：paper-2026-i 实卷，覆盖上述各条（含窄屏视口
  与触屏仿真），截图入 `docs/cuts/flow-panel/qa/`。

### DEV 汇报要求

改动文件清单 / verify 摘要（非原始日志）/ 浏览器 QA 状态+截图路径 /
Self-Review Blind Spots / 越界或契约冲突声明。
