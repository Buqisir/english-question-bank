# CR — home-blank (fresh cold-read)

**Reviewer**: CR (independent context, worktree `wt-home-blank`, base `main`)
**Diff**: `git diff main...HEAD` — 5 files, +491/-87
(App.css, App.tsx, AppTopbar.tsx, ConciergeDesk.tsx, verify-home-default-feed.mjs)
**Machine facts trusted (main 代理 已复核, not re-run)**: 4 narrow verify 全绿
(88/271/33/46) + `pnpm verify:all` 全绿 (build/typecheck included).

## Verdict: **APPROVE**（0 Must Fix）

前置条件（非 MF，DP-2 主代理补）：**五幕浏览器 QA 未执行**——本刀所有新 verify
断言均为 source-regex（静态结构），showListSurface 真正卸载 DOM、提交拍上移动效、
popstate/Back 退浏览态、`f.*` 深链落浏览态、esc 只清 query 这些**行为**尚无机器
证明，全部押在 DP-2 真鼠标五幕 + 深链/Back/reduced-motion 矩阵上。合并前须由
DP-2 跑通该矩阵。DEV 因工具把 dev server 起到主仓库而止损停手（blindspot d）——
经只读复核，**主仓库 `git status` 干净，无写入残留，claim 可信**。

硬契约逐条对照结论：**全部成立**。
- showListSurface 不变量：`browseSurfaceActive = Boolean(browseActive) || hasActiveFilters`；
  `showListSurface = browseSurfaceActive || state.kind !== 'empty'`
  （ConciergeDesk.tsx:276-277）——与契约公式字面一致（契约用 `anyFilterActive`，
  代码用等价的 `hasActiveFilters`，覆盖 groupType/year/region/sourceType/topicGroup
  全维，:263-268）。
- feed 门：`showFeed = !dataLoading && ((browseSurfaceActive && state.kind==='empty')
  || isVacuumResultsState(state))`（:466-468）——真空态分支原样保留，empty 直陈
  改为 browse 门控，同契约。
- `?view=browse` URL 契约：boot 读（App.tsx:125-128）+ popstate 同步
  （:1027 `setBrowseRouteActive(view === 'browse')`）+ enterBrowse pushState /
  exitBrowse replaceState（:1062-1093），只碰 `view` 参数，`f.*`/其它参数存活；
  与 `view=paper-browse`（独立字符串，处理未改）、`view=detail`、`f.*` 读写
  （trust-cracks C4，未触）零混淆。
- 词标：`hideBrand={!adminRouteActive && viewMode === 'list'}`（App.tsx:1252）——
  仅主页 list 态隐左侧品牌块；detail（viewMode!=='list'）与 sub 页零变化
  （AppTopbar.tsx:45-52）。居中词标点击 `handleWordmarkClick` = reset()+
  clearFilters()+onExitBrowse（ConciergeDesk.tsx:344-348），公式自落纯空白。
- 回落条件：esc/×→`actions.reset()`（useConciergeDesk.ts:281-285，只清 intent+
  state→empty，不碰 filters/browse）——esc 只清 query、不退浏览态，成立。
- 计数真值：whisper 与 command-count 均用 catalogPaperCount/catalogGroupCount；
  dataLoading 时 whisper 走「正在连接…」文案、command-count 整块不渲染，无 0 闪烁。
- placeholder：ROTATING_PLACEHOLDERS 三条全「比如：」前缀（:261-265），golden-path
  正则 `/找一道|正在连接|比如/` 命中（首条含「找一道」+「比如」）；轮换 effect
  门控 `!showListSurface && !dataLoading && !inputFocused` 且 reduced-motion 停轮换
  （:375-383）；dataLoading 文案「正在连接本地题库…」保留（:386）。
- 动效 token：新 CSS transition 全走 `--motion-entrance`/`--motion-fast` +
  `--ease-out`/`--ease-hover`（App.css:33,55,88），无裸 ms / ease-in / transition:all；
  verify-motion-tokens 绿佐证。

Forbidden 零越界：改动面仅 5 个授权文件；`domain/**`、schema、`*Adapter`、
`PaperSurface`、`server/**`、print/export 均未触；`buildDefaultFeed`/`groupFeedByYear`/
`defaultFeed.ts` 原样复用未重构；verify 只改授权的 verify-home-default-feed.mjs
（且仅追加 Test 26-31，未删旧断言）。

PA-lite 降档复核（成立）：方向 = owner grilling 四裁点（2026-07-14，DP-1 已勾），
diff 忠实落地四条 Locked Decision，DEV 未自创产品方向；唯一 taste 悬点（思考模式
开关，见 SW-1）恰是 PA-lite 该移交 owner 的类型。降档理由仍成立。

DEV 四盲点判定：(a) 合理偏离——risen 态 list 保留全宽即原列表视觉宽度，见 SW-3；
(b) 产品 taste，移交 owner，见 SW-1；(c) 正当契约引申——不 clearFilters 则词标无法
落纯空白，是「logo=home」语义的必要动作，非越权；(d) claim 可信，主仓库干净。

---

## Should Watch（非阻塞）

**SW-1 — 思考模式开关在纯空白静止态仍在场，与原型基准不符（移交 owner）**
纯空白态 command-bar 始终渲染，思考模式 toggle 随之显示在搜索框旁
（ConciergeDesk.tsx:528-538，无 `!showListSurface` 门控）。但 owner 拍板的静止态
视觉基准 `prototype-pure-blank.html:117-123` 只有 wordmark + searchbox + whisper，
**无思考开关**。plan 硬契约 Locked Decision 1 未显式点名该开关，故不判 MF；但原型
是 owner 亲裁的静止视觉基准，此偏离是真的。→ 移交 owner DP-3 拍板：纯空白态是否
藏思考开关（藏则加 `!showListSurface` 门控，与 chips/count 同款）。

**SW-2 — verify Test 5 断言标签已陈旧（覆盖未丢，但会误导后人）**
Test 5（verify-home-default-feed.mjs:131-148）断言「showFeed is true for
state.kind === 'empty'」靠 substring 正则命中仍通过，但行为已变——feed 现需
`browseSurfaceActive` 才在 empty 态显示。真正的新门控由新增 Test 27 正确覆盖，
**无放水、无覆盖缺口**；但 Test 5 的英文标签现在与行为不符，建议后续微调标签/
断言窗口以免误导。plan 曾要求「feed 在 empty 态直陈」断言改写为新契约——严格说
Test 5 应一并更新，此处以「新增 Test 27 已补真门控」认定覆盖充分。

**SW-3 — 提交拍上移动效：max-width 到 `none` 不可动画 + 落点 26vh→0（QA 视觉复核）**
`.concierge-stage-inner` transition 列了 `max-width var(--motion-entrance)…`
（App.css:33），但 CSS 无法在 `720px`↔`none` 间插值——宽度会瞬切、只有 margin-top
真正动画，提交那拍可能出现「先瞬间变宽再上滑」的观感。另 plan 硬契约写「stage 上移
（26vh→9vh 语义）」，实现落到 `margin-top: 0`（App.css:38）而非 9vh。两者都是视觉
落点问题，交 DP-2 真鼠标五幕确认平滑度与上移落位是否 owner 可接受；不平滑则 max-width
可从 transition 列表移除、或落点微调。

---

## Self-Review Blind Spots（喂给 Big CR）
- 本 CR 未跑运行时：DOM 卸载/动效/history 行为全信 DP-2；若 DP-2 未真跑五幕，
  本 APPROVE 的行为面即无证。
- 未逐字节比对 risen 态与 pre-cut 全宽布局的间距（44px/20px 静态值是否复现原观感），
  归入 SW-3 的 QA 视觉判断。
