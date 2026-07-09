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

> 刀 1 收官后 owner 实测反馈（2026-07-09，已处置）：① 讲评态挤压卷面
> →已修（b325b0b，讲评态 rail 收 88px 紧凑档，只留题号项）；② 右栏只有
> 跳老解析页的链接≠预期——确认为刀 2 范围本身，即刻开工（下方契约）。

## 刀 3 — 入口带态 + 链接迁移 + URL/popstate + 样式抽共享（DEV 执行契约）

> 前置：刀 1（7c89222）/刀 2（bb1ac30）已合并，owner PO QA 过，
> 生产已部署 95dffc5。派 **dev-hard**（history/popstate 状态机 +
> 入口穿线 + verify 断言迁移，时序敏感）。

- Cut line: medium; touches schema / data contract: no; touches
  product boundary: **yes——PA-lite 降档**。降档理由（CR 须复核）：
  ① 方向（入口带态+链接迁移+老解析页过渡期保留）owner 2026-07-08
  High 档已拍板，本契约仅为既定方向的执行压缩；② 完全可逆——
  server 零改动（`buildPaperSurfaceHref` 原样），迁移是纯前端 href
  换算，老解析页 URL 直达保留，回滚=revert 前端 diff；③ 无 schema/
  数据契约触碰。

### 目标

1. **入口带态**：详情页/搜索卡「看解析」改为进整卷页**讲评态**并
   锚定题组+预选题；「看整卷」维持挑题态现状。老解析页
   （`?view=paper-intelligence&surface=paper`）URL 直达保留，
   页内不再有入口指向它（退役另刀，与 reading-analysis 孤儿支同收）。
2. **URL 状态承载**：`?view=paper-browse&paperId=<id>
   [&focusGroupId=<gid>][&questionId=<qid>][&lecture=1]`——讲评开合、
   点题选择随时同步进 URL（replaceState，不 push 历史）；刷新/分享
   该 URL 能还原同一姿态。
3. **popstate**：App 级 popstate 监听落地，Back/Forward 在
   workbench ↔ paper-browse 间正确进退。
4. **样式抽共享**：七选五高亮+证据连线的手抄副本收敛为单一来源。
5. **小尾巴**：scrollspy 跨组临界抖动、深链沉降期首点竞态、
   窄屏抽屉空态文案。

### Scope

白名单：

- `app/src/App.tsx`（路由参数扩展 + popstate 监听 + openPaperBrowse
  扩展；只动路由/导航层，不碰其他编排逻辑）
- `app/src/features/paper-browse/PaperBrowsePage.tsx`
- `app/src/features/paper-browse/paperBrowsePage.css`
- `app/src/concierge/paperSurfaceHref.ts`（新增 href 换算 helper）
- `app/src/concierge/ConciergeGroupCard.tsx`（仅「看解析」链接形态）
- `app/src/features/question-detail/QuestionGroupDetailView.tsx`
  （仅「看解析」链接形态；灰区文件，严禁动数据获取/状态契约）
- `app/src/features/paper-intelligence/paperIntelligencePaperSurfaceHarness.css`
  （**仅限**样式抽共享：删被搬走的块 + 引入共享文件，无其他改动）
- 新建共享样式文件（建议
  `app/src/features/paper-intelligence/paperSurfaceLectureHighlights.css`）
- `scripts/verify-paper-browse.mjs`（新行为断言）
- `scripts/verify-classic-retire-2.mjs`（156-164 行「看解析」href
  硬断言随迁移窄改，保住原 MF 意图：看解析≠看整卷）
- `scripts/verify-c6a3-reading-analysis-bridge.mjs`（若卡片消费形态
  变化导致 grep 断言失配，窄改；server 侧 href 形态断言不许动）

Forbidden：`server/**`（`buildPaperSurfaceHref` 零修改，换算全在
前端）、`shared-ui/papersurface/**`、五个解析面板组件与 adapter
（import-only 同刀 2）、`paperIntelligence.css`、
`PaperIntelligencePaperSurfaceHarness.tsx`（行为零变化）、
print/export、draft-paper/my-space/admin 各页、domain。

### 行为规格

1. **URL 契约**（paper-browse 页内状态同步）：
   - 讲评开合、点题（groupId+questionId）变化时 `replaceState` 同步
     URL；关讲评清 `lecture`/`questionId` 参数。页内状态变化一律
     replaceState（不产生历史条目）；进入/离开页面维持现有
     pushState/replaceState 语义。
   - 带 `lecture=1` 进页：讲评栏初始即开；带 `questionId`：asset
     加载完成后预选该题（走 `selectLectureQuestion` 同款路径，右栏
     显示该题解析、卷面显影层就位），并滚动锚定其题组
     （focusGroupId 缺省时由 questionId 推导所属组）。深链预选须与
     沉降期 clear 竞态修复（规格 5）协同，不得被 scrollspy 清掉。
2. **入口带态**：
   - `paperSurfaceHref.ts` 新增换算 helper：由服务端
     `paperSurfaceHref`（`?view=paper-intelligence&...`）构造
     `?view=paper-browse&paperId&focusGroupId&questionId&lecture=1`
     形态 href（groupId→focusGroupId；questionId 有则带）。
   - 详情页「直达解析面」与搜索卡解析直链改用该 helper 的 href，
     保持 `<a href>`（中键/新标签可用）；主点击可拦截走 SPA
     `openPaperBrowse` 扩展（带 questionId+lecture），DEV 择简但
     两种进入方式都必须正确带态。
   - 守卫不变：`hasPaperSurfaceAnalysis && paperSurfaceHref` 才渲染。
3. **popstate**：App.tsx 挂一个 popstate 监听，重放 boot-read 解析
   逻辑同步 admin / mySpace / draftPaper / paperBrowse 四个路由
   state；目标 URL 是 SPA 未承载的视图（`view=paper-intelligence`、
   `view=reading-analysis`）时允许 `window.location.reload()` 兜底。
   验收焦点是 paper-browse 相关进退；其余视图 Back/Forward 不回归
   现状即可（其页内状态债不在本刀）。
4. **样式抽共享**：七选五衔接句高亮（paperBrowsePage.css 119-187 ↔
   harness css 1869-1948）与证据连线色（430-467 ↔ 684-692）收敛进
   共享文件，双方 import；删除手抄副本；**两页视觉零变化**（QA 逐项
   对照）。选择器组织方式 DEV 定，约束＝单一来源、不改
   `paperIntelligence.css`、harness 页行为零变化。
5. **小尾巴**：
   - 深链/程序化滚动沉降期，scrollspy 清 `lectureSelection` 的
     effect（PaperBrowsePage 551-553）按刀 2 cr.md 250-252 建议修：
     仅当 `activeAnchor` 变为**另一个真实题组 id** 时才清；
     part/section 锚不清；程序化滚动期间抑制清除。
   - scrollspy 跨组临界抖动：仲裁去抖（迟滞/稳定帧/像素 tie-break
     任选），慢滚临界处 `activeAnchor` 不得来回横跳。
   - 窄屏抽屉空态文案：`滚动到题组查看速览` 在窄屏语境失真（抽屉
     盖在卷面上），改为可操作指引（如「滚动卷面或点选题目后，这里
     显示讲评」，宽窄屏可同文案，以窄屏读得通为准）。
6. **不变量**：刀 1/刀 2 全部交互（把手/Esc/抽屉/紧凑 rail/点题联动/
   显影层）不回归；挑题态零解析请求不变；PaperSurface 与五面板零
   修改；老解析页、详情页其余行为、草稿卷动线零变化。

### 验收标准

- 详情页「看解析」→ 整卷页讲评态开、锚定该组、该题预选、右栏为其
  解析、卷面显影就位；搜索卡解析直链同款；中键新标签打开同款。
- 「看整卷」→ 挑题态，无 lecture 参数、零解析请求。
- URL 还原：讲评态下复制 URL 新标签打开 → 同姿态同选题；关讲评后
  URL 无 lecture/questionId。
- Back/Forward：workbench→详情看解析→Back 回 workbench→Forward 回
  讲评态，视图与 URL 同步；页内开关讲评/点题不产生历史条目。
- 样式抽共享后：整卷页与老解析页七选五高亮、证据连线逐项目检零
  视觉差；两 css 内手抄副本已删。
- 小尾巴三项各自复验：深链进页立即点题不丢选、慢滚临界不抖、
  窄屏空态文案新文案上屏。
- `node scripts/verify-paper-browse.mjs` 绿（含 URL 契约/popstate/
  入口带态新断言）；`verify-classic-retire-2.mjs`、
  `verify-c6a3-reading-analysis-bridge.mjs` 绿；tsc 绿；
  `pnpm -C app run verify:all` 或 CI 绿。
- **真点浏览器 QA 必做**：paper-2026-i 走完上述验收各条 + 窄屏
  抽屉 + 触屏仿真，截图入 `docs/cuts/flow-panel/qa/`（命名 dao3-*）。

### DEV 汇报要求

同刀 1/刀 2：文件清单 / verify 摘要 / QA 状态+截图 / Blind Spots /
越界声明。worktree 纪律：开工先 `pwd` 自证 + 跑
`bash scripts/setup-worktree.sh`；一切操作只在自己 worktree；禁
`git stash`；禁对主树路径跑任何写命令；用 worktree 自带分支，
不自行 push/开 PR。

## 刀 2 — 点题联动 + 五解析面板搬家（DEV 执行契约）

> 前置：刀 1 已合并（7c89222 + 紧凑 rail b325b0b，main CI 绿）。
> 派 **dev-hard**（五题型面板 × 焦点状态机，wiring 密集）。

### 目标（owner 原话级）

讲评栏里放的是**解析页同款真面板**——"单个题组点进去看的和整卷看的是
一个东西，只不过统一了宽度"。刀 2 之后右栏不再是答案行+跳转链接的
速览，而是完整解析内容；「深读解析」跳转链接退役（入口带态迁移是刀 3）。

### Scope

白名单：
- `app/src/features/paper-browse/PaperBrowsePage.tsx`
- `app/src/features/paper-browse/paperBrowsePage.css`
- `scripts/verify-paper-browse.mjs`（断言窄改+新行为轻量断言）

**允许 import、严禁修改**：`app/src/features/paper-intelligence/**` 的
五个面板组件（PaperAssetAnalysisPanel / SevenChoicesAnalysisPanel /
ClozeAnalysisPanel / GrammarFillAnalysisPanel / WritingAnalysisPanel）、
相应 analysis adapter、`paperIntelligence.css`（随面板 import 生效，
不改其内容；宽度适配一律在 paperBrowsePage.css 里用容器上下文覆盖）。
参考实现=`PaperIntelligencePaperSurfaceHarness.tsx`（fetch→adapter→
panel 的接线和 lectureFocus/onFocusIntent 协议都在里面，只读参考）。

Forbidden：`shared-ui/papersurface/**`（PaperSurface 通过**现有 props**
接入焦点，零修改）、harness 与解析页任何行为改动、server/domain/
App.tsx、print/export、其他页面。

### 行为规格

1. **数据**：讲评态首次打开时按需补拉本卷缺的 analyses
   （cloze-analysis-v1 / grammar-fill-analysis-v1 / writing-analysis-v1；
   reading/sevenChoices 页面已有）。拉取失败/文件缺失→该组讲评栏显
   「解析未发布」，不崩、不阻塞其他组。挑题态（讲评关）**零新增请求**。
2. **右栏结构**（讲评开）：
   - 头部保留刀 1 的组级速览：题组名+题号范围+答案行（writing 无答案行）。
   - 身体=当前题组 groupType 对应的解析面板，数据经与 harness 同款
     adapter 构建；未点题时面板走自身空态（「点击左侧题目查看解析」）。
   - 「深读解析」链接退役。
3. **点题联动**：讲评态下 PaperSurface 传真 `onFocusIntent`
   （'request-lecture-focus'，协议同 harness），点卷面上的题→右栏
   选中该题并显示其解析；面板内 onSelectOption/onSelectEvidence 回传
   的 activeEvidenceId 经 `lectureFocus` 传回 PaperSurface 高亮证据。
   跨组点题→右栏切到该组+该题。挑题态（讲评关）维持现状
   （onFocusIntent no-op、lectureFocus null），卷面无讲评噪音。
4. **统一宽度**：五面板在 380px 栏内正常排版；pi-* 样式的硬宽度/溢出
   问题在 paperBrowsePage.css 用容器选择器覆盖（不改 pi css）。逐面板
   过一遍（阅读证据链/七选五选项池/完形选项格/语法 facet/写作条目）。
5. **不变量**：刀 1 交互（把手/Esc 还焦/窄屏抽屉/紧凑 rail/scrollspy）
   不回归；解析页与详情页行为零变化；PaperSurface 零修改。

### 验收标准

- 讲评开：五种题组滚动/点题各验一遍——面板内容与解析页同组内容一致
  （抽 2 题逐字比对）；点卷面题号右栏跟随；点面板证据卷面高亮。
- 讲评关：卷面纯净，零解析请求、零焦点噪音。
- 缺 analysis 的组显「解析未发布」（可用 QA 夹具或临时改名文件验证）。
- `node scripts/verify-paper-browse.mjs` 绿（含新断言）；tsc 绿；
  `pnpm -C app run verify:all` 或 CI 绿。
- **真点浏览器 QA 必做**：paper-2026-i 全五题型 + 窄屏抽屉里点题联动 +
  触屏仿真，截图入 `docs/cuts/flow-panel/qa/`（命名 dao2-*）。

### 卷面显影原则（owner 2026-07-09 实测后拍板，刀 2 修复轮依据）

看"题长在哪里"定显影层级：
- **阅读（定位型，题在文外）**：给**动线**——从题干回原文定位是教学
  内容本身，与解析页同款层级必须齐。
- **完形/语法填空（原位型，空即位置）**：只给**证据高亮**（点空亮
  线索句/呼应词），不做动线。完形若日后实测出现"跨段串线索"动作
  再议升级。
- **七选五（混血）**：衔接链在右栏手风琴里讲，原文恢复**衔接句高亮**
  （`useSevenChoicesPaperHighlights` 层），不加阅读式动线。

owner 实测抓到的两个 parity 缺口（修复轮范围）：①七选五高亮 hook
未接线；②阅读动线层缺失（对照解析页排查补齐）。

### DEV 汇报要求

同刀 1：文件清单 / verify 摘要 / QA 状态+截图 / Blind Spots / 越界声明。

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
