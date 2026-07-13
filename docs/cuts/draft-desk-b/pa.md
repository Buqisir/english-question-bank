# draft-desk-b — PA（Plan Architect）审查

- 日期：2026-07-12
- 审查人：PA（fresh 独立 context）
- 基线：`github/main` @ 53fda0b（已 fetch 确认；工作树仅本 cut 的 docs 未追踪）
- 档位：Opus high（one-way-door：换出片引擎 + 预览架构从「客户端分页」翻到「服务器唯一真源」）
- 方向状态：owner 已逐点拍板（路甲：服务器唯一真源 + 分页活页面 + 每题叠操作按钮），**本审查不重开方向辩论**，只论证落地与钉契约。

---

## Verdict

**APPROVE WITH MUST FIX**

方向正确且证据链扎实（Vivliostyle 波及面 = 两处 PDF 导出、解析面板零关系；试卷需要的保真浏览器原生/paged.js 都有；spike 证明 headless page.pdf() 确定且 ~110ms 暖启动）。落地路径也基本清楚。但有 **7 个 Must Fix** 必须在 plan.md 钉死才能开工——其中两个是会直接返工的技术陷阱（双引擎重新分叉、预览渲染误挂到每次 getDraftPaper），一个是**推荐引擎 paged.js 在本仓从未 spike 过**（spike 只验了原生 page.pdf()，没验 paged.js）。这是 one-way-door，未验证的核心假设不能直接进 DEV。

未决 PO 问题 = 2 个（见文末），未超 3，可开工。

---

## Product Principle

老师此刻在做的事：**编排一份草稿卷，看着它被排成一页页 A4，随手上移/下移/前置分页/移除某个题组，然后打印/导出 PDF——屏幕上看到的分页必须就是打印出来的分页。** 产品红线是 program 柱子2「所见即所印」＋ Super Teacher Boundary「最忌不可信建议」：屏幕分页 ≠ 打印分页，则分页建议本身不可信。本刀就是第一次真正收敛 C8 起有意搁置的三套分页引擎近似。

「每题叠按钮」的操作（上移/下移/前置分页/移除）全部是**题组（group）粒度**——与 `draft_paper_items`（一行=一题组）、rail 目录、现有 sticker 操作条完全同粒度。**不是子题粒度**。这一条锁死，别让 DEV 去发明子题级寻址。

---

## Exact UX / Architecture Model（PA 论证的推荐落地）

### 核心技术方案：paged.js 单次渲染，一处产出两样

推荐 **paged.js 作为唯一分片引擎，服务器端在一个 headless Chromium 里跑一次，从同一个 page 对象同时产出（a）序列化的分页活 DOM（喂预览）+（b）`page.pdf()` 出 PDF**。这是 pagedjs-cli 的模型：paged.js 先把内容切进固定尺寸的 page box，浏览器打印时每个 box 恰好一页、原生 fragmentation 无事可做 → **PDF 的分页 == paged.js 的分页 == 预览的分页**，三面同源，构造上真 parity。

为什么不是别的候选：

- **原生 page.pdf()（spike 已验）做 PDF + paged.js 做预览** → **禁止**。这是两套 fragmentation 算法（Chromium 原生 print layout vs paged.js 的 JS chunker），会把「三套引擎各算各的」旧病复发成「两套」。spike 也证明了无法从**未分页** DOM 的 boundingRect 反推分页（`break-inside:avoid` 把整题推下页留的空白，未分页 DOM 看不见 → 提取算 7 页、实际 9 页）。所以**原生路给不出可序列化的分页活 DOM**，天然满足不了「活页面 + 叠按钮」需求。
- **column-width fragmentation 模拟** → 可读列位置、`break-inside` 在列内也生效，但把多列映射成堆叠 page box 供显示+出 PDF 本身是又一次重实现，且 multicol 分片有自己的 bug；相比 paged.js 有真实 `@page`/PDF 路径，劣。**不推荐**。
- **Vivliostyle（现状）** → 它就是「两套独立实现」里的那一套，与 parity 背道而驰。退役。

### `@media print` 样式泄漏（issue #219）：本形态下结构性规避

两层规避，**不会中招**：
1. 新架构下 paged.js **只在服务器跑**，老师浏览器完全不加载 paged.js 的 Polisher → 前端根本不注入全局 print 样式。
2. 即便服务器序列化出的 DOM 带 paged.js 生成的 `@page`/page-box CSS，前端预览仍是 **iframe `srcDoc`**（`DraftPaperWorkbench.tsx:812-815`，已确认现状即 iframe）→ 样式被 iframe 隔离，污染不到宿主页。

### 活页面 ↔ PDF 一致性：一次渲染，不是两次

务必是**一个 Chromium page 对象** → 先 run paged.js → 再 `outerHTML` 序列化给预览 + `page.pdf()` 出 PDF。**不要**「序列化跑一个 Chromium、pagedjs-cli 另跑一个」——那是两次 paged.js run，虽同引擎同环境大概率确定，但 one-way-door 上没理由留这个不确定。字体锁：服务器一次渲染用服务器字体（Liberation Serif / Noto CJK，生产已装，`go-live-record.md:79-144`）；老师浏览器显示的是**已经排定的固定 page box**，字体度量差异只会造成 box 内极小重排，**不会改变哪个题组落在哪页**（分页已被服务器冻结）。这正是 owner「服务器算一次、所有老师一致」铁律的构造兑现。tech-recon 的陷阱1（预览画布比打印宽 7.4%）、陷阱2（长 passage 无断点）、陷阱3（字体度量）在单源架构下**基本消解**：只剩一个画布、paged.js 原生按块 fragment 长 passage、字体差降级为 box 内微重排。

### 预览架构 + 交互复用（关键：别回归刀A）

现状交互已经就是「父层在 iframe 外叠控件、锚到 iframe 内 `data-group-id` 元素」的模式——`DraftPaperWorkbench.tsx` 的 hover sticker（`computeGroupAnchorTop` 288-291 用 `iframeRect - colRect + offsetTop*previewScale`）、scrollspy（333-363）、`scrollToGroupInPaper`（375+）、pageCount（`handleIframeLoad` 296-297 数 `.preview-page`）全部依赖两个 DOM 契约：**`.preview-page` 页容器 + 每个可寻址元素上的 `data-group-id`**。「卷子上叠按钮」= 把现有 hover sticker 从 hover-only 变成常驻/每组一枚，复用 `computeGroupAnchorTop` 同一套锚点数学。**这是本刀能低成本复用刀A 的前提，也是最容易被 DEV 打破的地方。**

---

## Must Fix Before DEV

### MF-1 — paged.js 在本仓的证明 spike（gating，先于选型落定）

**风险**：spike（`scratchpad/spike-headless-pagination.mjs`）只验了**原生 `page.pdf()`**，**paged.js 从未在本仓 spike**。research 明确列了 paged.js 三个坑（稳定性/复杂布局不如 Vivliostyle、parity 承诺要锁同引擎同 OS、大文档性能）。这是 one-way-door，未验证的核心引擎不能直接进 DEV。
**处置**：plan 第一步为 gating spike，喂**真实一份完整高考整卷**（用 spike 里那份 9 页的），验收标准硬性四条：(a) 长阅读原文在段落边界正确跨页（对齐 `exam-paper-format-standards.md §3b`）；(b) `@page @bottom-center counter(page)` 页脚/页码在 paged.js 下正确渲染；(c) 暖实例单次渲染时间落在延迟预算内；(d) **序列化出的 paged.js DOM 塞进一个普通 iframe 渲染，肉眼与 PDF 分页一致**。任一条不过 → 触发 fallback（记录降级路径），不硬上。

### MF-2 — 单次渲染 parity 契约（禁止双引擎复发）

**风险**：DEV 若「预览用 paged.js、PDF 用原生 `page.pdf()`（或对未分页 HTML 另跑）」，三引擎旧病复发成两引擎，parity 假性成立、生产才发现分叉。
**处置**：plan 锁死「**一个 Chromium page → run paged.js → 同一 page 同时序列化 DOM + `page.pdf()`**」。Forbidden 明列：禁止对未经 paged.js 分片的 HTML 直接 `page.pdf()` 作为草稿卷出片路径。加确定性 verify：同一输入 N 次渲染，页数 + 每题组落页一致。

### MF-3 — 服务器分页 DOM 契约（保交互不回归）

**风险**：paged.js 输出的页容器是 `.pagedjs_page`、内容 `.pagedjs_page_content`，且 `print-renderer.mjs` 的 `.question-group` **本就不带任何 id**（324/421 行，客户端今天靠 `paginateA4Preview` 位置性补 `data-group-id`）。退役客户端分页后，若服务器输出不补齐 `.preview-page` + 每组 `data-group-id`，刀A 的 hover sticker / scrollspy / `scrollToGroupInPaper` / pageCount 全部瞎（选择器落空），静默回归。
**处置**：plan 钉死「服务器分页预览 DOM 的**稳定契约**」= 保留 `.preview-page` 页容器（供 pageCount 计数）+ 每个可寻址题组元素带 `data-group-id`。推荐在新的服务器渲染 wrapper 里、对 `buildDraftPrintHtml` 输出**位置性补 `data-group-id`**（照抄客户端 `tagGroupSections` 的顺序逻辑）后再喂 paged.js，并把 paged.js 页容器映射/别名到 `.preview-page`——**这样不必改 `print-renderer.mjs`**（见 MF-7 的 CI 冲突）。契约写进 plan 的 data-contract 段，刀A 交互代码按此契约最小改动。

### MF-4 — 分页渲染必须与 getDraftPaper / 非布局编辑解耦

**风险**：今天 `getDraftPaper`（`draftPaperStore.mjs:435`）每次都 `buildDraftPrintHtml`（纯字符串，便宜），而 `getDraftPaper` 被列表、改标题（`updateDraftPaper`→返回带 printHtml 的 next，`DraftPaperWorkbench.tsx:452/472/493`）、改 studentLabel 等**全部调用**。若把分页 render 天真挂进 printHtml 生成，**改个标题都会触发一次 headless Chromium**——荒唐且拖垮并发。
**处置**：plan 把「分页活页面」定义为**独立的、按布局签名缓存的产物**，只在**改变布局的编辑**（增删题组/reorder/toggle page_break）时重算，非布局编辑（标题/studentLabel/列表）绝不触发 render。缓存 key 复用现成的 `draftPaperPrintSignature`（`exportDraftPaperPdf` 已用它做 30s 缓存，890 行）。同时钉死**编辑刷新 UX 模型**（见 PO-2）：布局编辑后预览从「本地瞬时重排」变成「等服务器 render 回来」，plan 要写清 optimistic 显示 / debounce / 「重新排版中…」loading 态。

### MF-5 — break-hint 分页建议的显示回归（别静默丢刀A 功能）

**风险**：decision 把「分页**建议引擎**改真分页衍生」挪到后面单独刀，没错。但刀A 已上线的**建议显示**（`draftPaperPreviewHtml.ts:166-180` `insertBreakHints` 注入 `.break-hint` + `DraftPaperWorkbench.tsx:316-323` 点击 `.break-hint`→`togglePageBreak` 落库）是**跑在即将退役的客户端 `paginateA4Preview` 里的**。退役它 = 静默丢掉一个在产功能，且 `pageBreakSuggestions` 契约（`domain/questionBank.ts:155-159`）还挂着。
**处置**：plan 明确表态——本刀是否保留建议**显示**。若保留：服务器分页 DOM 必须注入 `.break-hint` 标记 + 保留 `data-break-hint-group-id` 点击契约（点击→`togglePageBreak`）。若本刀先不显示（跟随引擎一起延后）→ 需 PO 拍板（见 PO-1），且 plan 说明 `pageBreakSuggestions` 字段暂挂不消费。**不允许"没提到"就带走。**

### MF-6 — Chromium 实例生命周期 / 并发 / 不阻塞事件循环

**风险**：现出片是 `execFileSync(vivliostyleBin, …)`（`draftPaperStore.mjs:883`）——**同步阻塞事件循环**，且每次冷启一个 chromium。要拿到 spike 的 ~110ms 必须常驻暖实例，但**服务器进程内常驻 Chromium 是新基建**：启动/崩溃恢复/清理、多老师并发串行化、冷启 fallback，都得设计。且现在是 `preview render`（每次布局编辑）+ `PDF export` 两个触发点共用。
**处置**：plan 钉死 (a) Chromium/Playwright 实例池或单常驻实例的生命周期（launch / 崩溃重启 / 进程退出清理）；(b) 并发策略（渲染串行队列，避免同一实例并发页冲突）；(c) 冷启 fallback（首次/崩溃后降级路径与用户可见时延）；(d) render 走**异步**、不再 `execFileSync` 阻塞事件循环；(e) 明确延迟预算数字 + 一个 perf verify（暖实例单卷 render ≤ 预算）。`playwright-core` 现是 `@vivliostyle/cli` 的间接依赖（`project-feasibility.md §4`），需提为 `server` 正式依赖——plan 列为显式一步。

### MF-7 — Forbidden 边界 + 连带 CI 门（含一个实撞的门）

**风险**：`verify-c8-forbidden-scope.mjs:60` 硬断言 **`server/print-renderer.mjs` untouched**。若本刀为叠按钮去改 print-renderer 注入 group-id，**这个门直接红**。此外 tech-recon 已警告 `verify-c8-print-ready-gate.mjs:62-69` 锁着分页建议魔法数字——本刀**不动**建议引擎，故不撞它（确认排除即可）。
**处置**：plan 的 Forbidden 段明列并处置：
- **A4/A3 打印形态 + 同面判据** → OUT（后面单独刀）。
- **分页建议引擎改真分页衍生** → OUT（后面单独刀），本刀不动 `buildPageBreakSuggestions`、不撞 `verify-c8-print-ready-gate.mjs`。
- **旧系统 Vivliostyle 孤儿路由**（`server/exports/exportImplementation.mjs:129` `renderPrintPdfWithVivliostyle`）→ 不动。
- **schema 不动**（本刀无 A4/A3 字段，`draft_papers`/`draft_paper_items` 不加列）。
- **`server/print-renderer.mjs`**：优先**不改**（MF-3 走下游 wrapper 补 id），从而保持 `verify-c8-forbidden-scope.mjs:60` 绿。若确需改，plan 必须同刀更新该 verify 脚本并说明理由。

---

## Must Fix -> Plan Disposition Checklist

| Must Fix | plan.md 必须记录的处置 |
|---|---|
| MF-1 paged.js 未 spike | Must Do 第0步：gating spike，四条硬验收 + fallback 记录；spike 不过不选 paged.js |
| MF-2 单次渲染 parity | 锁定「一 page → paged.js → 序列化+page.pdf()」；Forbidden 禁止对未分片 HTML 直接出片；确定性 verify（N 次页数/落页一致） |
| MF-3 分页 DOM 契约 | data-contract 段钉死 `.preview-page` + 每组 `data-group-id`；wrapper 位置性补 id、不改 print-renderer；刀A 交互按此契约 |
| MF-4 render 解耦 | 锁定分页产物按 `draftPaperPrintSignature` 缓存、仅布局编辑触发；非布局编辑不 render；编辑刷新 UX 模型（optimistic/debounce/loading） |
| MF-5 break-hint 回归 | 明确本刀保留/延后建议显示（→PO-1）；保留则服务器注入 `.break-hint`+`data-break-hint-group-id` 点击契约；`pageBreakSuggestions` 字段去留说明 |
| MF-6 Chromium 生命周期 | 实例池/常驻生命周期 + 并发串行 + 冷启 fallback + 异步化 + 延迟预算 + perf verify + `playwright-core` 提正式依赖一步 |
| MF-7 Forbidden/CI 门 | Forbidden 明列 A4/A3、建议引擎、孤儿路由、schema、print-renderer；确认不撞 `verify-c8-print-ready-gate`；print-renderer 若改则同刀改 forbidden-scope verify |

---

## Should Watch（不阻塞 DEV）

- **SW-1 reorder 的瞬时感**：`DraftPaperWorkbench.tsx:506-517` reorder 今天是本地 optimistic。服务器分页后，题组在**卷面**上的重排要等 render 回来。rail 里的顺序可先 optimistic，卷面预览会有一次 render 延迟——QA 关注手感，别做成"点一下卡半秒"。
- **SW-2 pageCount 归属**：今天 pageCount 是客户端数 `.preview-page`（`handleIframeLoad:296-297`）。服务器分页后服务器已知页数（`MySpaceArtifact.pageCount` 已有服务端计数先例），可顺势变服务端真值字段，「共 N 页 · 双面 ⌈N/2⌉ 张」更可信。非必须，做则更干净。
- **SW-3 previewScale × 固定 page box**：叠按钮锚点数学依赖 `previewScale` + 「iframe 长到内容高度」。paged.js 固定 mm page box 堆叠后，第 2 页及以后的锚点漂移必须浏览器 QA（不是只看第 1 页）。
- **SW-4 页脚样式级联**：`addDraftFooterCss`（`draftPaperStore.mjs:196-208`）把 `@bottom-center` 覆成「标题 · 页码」。换 paged.js 后确认这层级联仍生效（paged.js Polisher 处理 `@page` margin box）——归入 MF-1 spike 验收(b)。
- **SW-5 PDF 缓存签名**：`exportDraftPaperPdf` 的 `recentDraftPdfExports` 30s 签名缓存（840-850）逻辑要随新出片路径保留/迁移，别丢了缓存导致每次点导出都重渲。

---

## Allowed Files（预期改动面，供 plan 收敛）

- `server/draft-paper/draftPaperStore.mjs` — 新分页 render wrapper、`exportDraftPaperPdf` 换出片引擎、签名缓存迁移、`getDraftPaper` 挂新分页产物（解耦）。
- 新增 server 模块（建议）：headless Chromium/paged.js 渲染器 + 实例池（`server/draft-paper/` 下新文件）。
- `app/src/features/draft-paper/DraftPaperWorkbench.tsx` — iframe 改吃服务器分页 HTML、常驻叠按钮、刷新 UX、交互按 MF-3 契约微调。
- `app/src/features/draft-paper/draftPaperPreviewHtml.ts` — `paginateA4Preview` / `buildA4PreviewHtml` 退役（或改为薄壳）。
- `app/src/domain/questionBank.ts` — `DraftPaper` 增分页预览字段（如 `previewHtml`）/ 可选 `pageCount`。
- `app/src/services/draftPapers.ts` — 若新增分页预览端点。
- `server/package.json` — `playwright-core` 提正式依赖。
- 新增/更新 verify 脚本（确定性 + perf + DOM 契约）。

## Forbidden Files（本刀不许动）

- `server/print-renderer.mjs`（优先不动，护 `verify-c8-forbidden-scope.mjs:60`；MF-7）。
- `server/exports/exportImplementation.mjs`（旧 paperAssembly Vivliostyle 孤儿路由，不动）。
- `data/sql/schema.sql` / `ensureUserDatabaseShape` 的表结构（本刀无 schema 变更）。
- `buildPageBreakSuggestions` 及 `verify-c8-print-ready-gate.mjs` 魔法数字（建议引擎属后续刀）。
- 任何 A4/A3 / 同面判据 / 2-up 拼版代码（后续刀 / 刀E）。

## Static Verify Requirements

1. **确定性 verify**：同一草稿卷输入，分页 render N 次，页数 + 每题组落页序列一致（MF-2）。
2. **DOM 契约 verify**：服务器分页输出含 `.preview-page` 页容器 + 每可寻址题组带 `data-group-id`（+ 保留则 `.break-hint`/`data-break-hint-group-id`）（MF-3/MF-5）。
3. **perf verify**：暖实例单卷 render ≤ 延迟预算；实例池不阻塞事件循环（MF-6）。
4. **forbidden-scope 复核**：改动文件不含 print-renderer / 孤儿路由 / schema / 建议引擎（MF-7）。
5. **既有门回归**：`verify-c8-draft-paper-contracts`、`verify-c8-draft-paper-render-model`、`verify-print-pdf-export-flow`、`verify-c8-forbidden-scope` 全绿（退役客户端分页可能触及 render-model 门，plan 需预判并同刀更新）。

## Browser QA Matrix

| 场景 | 验的风险 |
|---|---|
| 打开多页草稿卷，肉眼对比屏幕分页 vs 下载 PDF 分页 | 核心 parity（同源）|
| 含超长阅读原文的卷，看段落是否在段落边界跨页 | 长 passage 病根（MF-1 (a)）|
| 第 2/3 页题组上 hover/点叠按钮，看锚点是否对准 | previewScale × 固定 box 漂移（SW-3）|
| 上移/下移/前置分页/移除，看卷面刷新与手感 | 交互回归 + render 延迟手感（MF-4/SW-1）|
| rail 点目录跳转 + scrollspy 高亮 | scrollspy 依赖 `data-group-id` 不回归（MF-3）|
| 改标题/studentLabel | 确认**不触发** render（MF-4）|
| 建议 break-hint 显示 + 点击落库（若本刀保留）| 建议显示回归（MF-5）|
| 冷启（首次/服务重启后）首次预览/导出时延 | Chromium 冷启 fallback（MF-6）|

## DEV Readiness

- 改善的老师动作：编排草稿卷时「屏幕分页 == 打印分页」，随手叠按钮调页。**清楚**。
- before/after：before = 三套引擎各算各的、长 passage 屏幕撑破/打印拆段不一致；after = 服务器一次分页，预览与 PDF 同源。**清楚**。
- 本刀边界：预览活页面 + 叠按钮 + 退役自研分页 + 草稿卷 PDF 换引擎，做到「预览==打印」能上线。**清楚**。
- 后续刀边界：A4/A3 形态 + 同面判据；建议引擎改真分页衍生。**清楚**。
- Allowed / Forbidden：见上。**清楚**。
- verify / QA：见上。**清楚**。
- PO 决策：2 个（< 3）。**达标**。

**结论：MF-1~7 在 plan 钉死后，DEV-ready。** 特别是 MF-1（paged.js 本仓 spike）应作为 plan 第 0 步的 gating gate——它不过，引擎选型翻案，后续步全废。

## Open PO Decisions（≤3）

1. **PO-1（建议显示去留）**：本刀是否保留分页建议的**显示**（break-hint），还是跟随「建议引擎改真分页衍生」一起延后到后续刀？影响 MF-5 与 `pageBreakSuggestions` 字段消费。
2. **PO-2（编辑刷新手感）**：布局编辑后预览从「本地瞬时重排」变为「等服务器 render（暖 ~110ms + 网络）」，出现短暂「重新排版中…」态是否可接受？这是编辑手感的产品取舍，owner 需拍板可接受的时延体验（也界定 MF-4/SW-1 的验收）。

---

## 拆刀骨架建议（供 PM 压进 plan.md 的 Must Do）

- **步0（gating spike，MF-1）**：paged.js 服务器端跑真实高考整卷，四条硬验收 + fallback。**不过则停，回 PO/PM 重议引擎。**
- **步1（服务器分页渲染器 + 实例池，MF-2/MF-6）**：新 render 模块，一 page → paged.js → 序列化 DOM + `page.pdf()`；实例池 + 异步 + 冷启 fallback。验收：确定性 verify 绿 + perf verify 绿。
- **步2（DOM 契约 + 缓存解耦，MF-3/MF-4）**：wrapper 补 `data-group-id`、映射 `.preview-page`；按 `draftPaperPrintSignature` 缓存、仅布局编辑触发。验收：DOM 契约 verify 绿；改标题不触发 render（QA）。
- **步3（前端吃分页 HTML + 常驻叠按钮，MF-3/MF-5）**：iframe 换源、hover sticker → 常驻叠按钮复用 `computeGroupAnchorTop`；退役 `paginateA4Preview`；建议显示按 PO-1 处置。验收：交互回归 QA 全绿。
- **步4（PDF 换引擎收口 + Vivliostyle 草稿卷退役，MF-2/MF-7）**：`exportDraftPaperPdf` 走新出片路径、迁移签名缓存；旧孤儿路由不动。验收：`verify-print-pdf-export-flow` + parity 肉眼 QA。
- **步5（Forbidden/门复核 + 上线）**：全 verify 绿、浏览器 QA matrix 走完、owner 产品 QA。
