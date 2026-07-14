# home-blank Plan — 主页纯空白大搜索框（原型 D + 节拍 A），feed 退场进浏览态

## Cut Size

medium；touches schema / data contract / product boundary / teaching
interpretation: **no**（纯消费面 UI 重排 + URL 参数新增 `view=browse`）。
**PA 降 PA-lite**：方向已由原型逐裁点 owner 拍板（AGENTS Dispatch map
2026-07-12 条款——原型过程即方向审查）；CR 须复核此降档是否仍成立。

## Objective

主页静止态从「搜索框 + 整库 feed 直陈」改为原型 D 的纯空白大搜索框
（居中词标 + 框 + 一行可点 whisper），切换节拍走原型 T 档 A（提交拍）；
feed 不删除，退场进 `?view=browse` 浏览态。

决策记录（均已 commit）：
- `docs/cuts/home-desk/prototype-pure-blank.html`（原型 D，静止态视觉，07e6e4e）
- `docs/cuts/home-desk/prototype-transition-abc.html`（原型 T，节拍对比，949cc2d）

## Locked Product Decisions（owner grilling 拍板 2026-07-14，不得重开）

1. **静止态 = 纯空白**：居中词标「英语题库工作台」+ 大搜索框 + whisper
   一行「{N} 套卷 · {M} 篇章，一句话描述你要的题」（真值、可点）。
   无 feed、无筛选 chips、无任何首跑引导。member / owner 同面。
2. **浏览入口 = whisper 可点** → `?view=browse` 浏览态 = 今天的 feed +
   筛选逻辑原样（年份分组组头、「显示全部 N 套卷」展开器、结构化
   chips、真值计数）。带 `f.*` 或 `view=browse` 的深链落浏览态，不落
   空白页（trust-cracks 的筛选进 URL 不作废）。
3. **切换节拍 = 提交拍**：打字阶段零视觉变化；提交那一拍 stage 上移
   （26vh→9vh 语义）+ 现有 loading + 结果 / 诚实空态 / clarification /
   error 在下方承接。esc / 清除钮只清 query；回落纯空白的条件见硬契约。
4. **筛选 chips 只活在列表面**（结果态 / 浏览态）；静止态零 chips。

## 硬契约（不得偏离；偏离 = CR 打回）

- **列表面不变量**：
  `showListSurface = browseActive || anyFilterActive || state.kind !== 'empty'`；
  `!showListSurface` ⇔ 纯空白静止态。
  feed 显示条件从今天的 `state.kind === 'empty'` 改为
  `browseSurfaceActive && state.kind === 'empty'`（其中
  `browseSurfaceActive = browseActive || anyFilterActive`）——浏览态里
  发起搜索后结果列表取代 feed，同今天行为。
- **URL 契约**：`?view=browse` 新增，进出走既有 pushState / popstate
  模式（参照 `openDetail` / `openMySpace`，App.tsx:542 / :1050）；
  既有 `view=paper-browse`（整卷预览页）**不得混淆、不得改动**；
  `view=detail&groupId` 契约零变化；`f.*` 读写契约（trust-cracks C4，
  ConciergeDesk.tsx:159-216）原样保留。
- **词标**：主页 list 态顶栏不再渲染左侧品牌块（AppTopbar `variant='home'`
  的 brand 块该态隐去，加最小 prop 实现）；品牌词标居中入 stage；点击
  居中词标 = 清空回纯空白（logo=home 语义）。detail 态与全部 sub 页
  顶栏零变化。
- **回落条件**：query 空 && `state.kind === 'empty'` && 无激活 `f.*` &&
  非 browse 态 ⇔ 纯空白。浏览态的退出 = Back 或点居中词标（回空白并清
  browse 参数），esc 不退出浏览态。
- **计数真值**：whisper 用现成 `catalogPaperCount` / `catalogGroupCount`
  （ConciergeDesk.tsx:341-345）；`dataLoading` 时不显数字（避免 0 闪烁），
  submit 禁用沿用 `submitDisabled` 现逻辑（:370）。
- **placeholder 轮换**：仅 静止态 + 未聚焦 + 非 dataLoading 时轮换；
  所有示例文案以「比如：」开头——golden-path 定位正则
  `/找一道|正在连接|比如/`（smoke-golden-path.mjs:169,180）不得失配；
  `prefers-reduced-motion` 下停轮换。dataLoading 文案「正在连接本地
  题库…」保留。
- **动效全走 DESIGN.md token**（App.css:9-17 五档时长 + 三曲线）：stage
  上移用 `--motion-entrance` + `--ease-out`；不得出现裸时长、`ease-in`、
  `transition: all`——`verify-motion-tokens.mjs` 会红。原型里的裸 ms 值
  一律换 token。
- **零改动清单**：加卷篮浮钮（App.tsx:1300 `basket-chip`）、结果卡组件、
  详情页、AI 检索机制 / 重排 prompt / 诚实空态文案逻辑、日限额、
  clarification 语义。
- 无新增依赖。

## 参考实现（可偏离，偏离须在完成报告里说明）

- 静止 stage 的 markup / 层级参照原型 D（wordmark / searchbox / whisper /
  `data-searching` 上移语义），样式值换 token、类名归入 concierge 命名系。
- 搜索框静止态 autofocus（单动作页面）；deep link 进 detail / browse 态
  不抢焦点。
- reset：若 `useConciergeDesk` 无「清空回 empty」动作，补最小 reset
  （清 intent + kind→empty）；既有清除钮 `.concierge-intent-clear`
  （ConciergeDesk.css:19）接同一动作。
- 浏览态：whisper 点击 pushState `?view=browse`；浏览态下搜索框保持在场
  （risen 位），feed 块 + chips 面板 + 计数原样渲染其下。
- 文件面预估：`app/src/App.tsx`(route 布尔 + popstate + topbar props)、
  `app/src/components/AppTopbar.tsx`(brand 条件)、
  `app/src/concierge/ConciergeDesk.tsx`(stage markup + 条件重接)、
  `app/src/concierge/useConciergeDesk.ts`(reset，若需)、
  `app/src/App.css`(concierge 段内新样式)、必要时
  `app/src/concierge/ConciergeDesk.css`。

## Forbidden

- `domain/**`、schema、`*Adapter.ts`、`PaperSurface`、`server/**`、
  print / export 样式、paper-assets（契约 hook 在岗，本刀无解锁）。
- 搜索引擎 / AI prompt / 诚实空态文案语义（trust-cracks 刚收官，只消费
  不改）。
- 结果卡、详情页、卷宗柜、草稿卷工作台、登录页、member 权限语义。
- 不重构 feed 内部实现（`buildDefaultFeed` / `groupFeedByYear` 原样
  复用），不删 `defaultFeed.ts`。
- verify 脚本只许改本 plan 授权的（见 Verification），其余不动。

## Verification（DEV 自验；verify 步照抄复核）

- **授权更新** `scripts/verify-home-default-feed.mjs`：断言集从「feed 在
  empty 态直陈」改为新契约——静止态无 feed / chips 渲染路径、
  `showListSurface` 不变量成立、浏览态渲染 feed + chips、whisper 真值
  计数、`view=browse` 路由接线存在、placeholder 全部「比如：」前缀。
  文件名与 CI 注册不变。`smoke-golden-path.mjs` 以不改为先；确需微调
  定位时保住正则命中并在完成报告说明。
- narrow：`node scripts/verify-home-default-feed.mjs`、
  `node scripts/verify-concierge-desk.mjs`、
  `node scripts/verify-concierge-filters.mjs`、
  `node scripts/verify-motion-tokens.mjs`
- full：`pnpm -C app run verify:all`（含 app build / typecheck）
- headless 浏览器自验（qa-local-owner，worktree 自己的本地库）五幕：
  ①静止纯空白（feed / chips DOM 不存在）②打字零位移 ③提交→loading→
  结果 ④无关查询→诚实空态 ⑤whisper 点击→浏览态 feed + chips；外加
  `f.*` 深链落浏览态、esc 回落、`view=detail` 深链零回归。

## Browser QA Matrix（DP-2 主代理亲驱真鼠标）

五幕同上 + 词标点击回空白 + Back 键三态往返（空白↔浏览↔详情）+
reduced-motion 下无轮换无动画。owner DP-3 对照单随收口出
（`qa-checklist.md`，3-5 项）。

## DEV Readiness

workspace：worktree `../wt-home-blank`；开工第一步
`bash scripts/setup-worktree.sh`；断点锚 wip commit
（`wip(home-blank): impl complete, pre-QA`）；完成报告按
`docs/steering/dev-completion-protocol.md`。

## 裁决点清单（主代理出场点；施工中勾选）

- [x] DP-1 方向 + 四裁点 owner 拍板（grilling 2026-07-14，本 plan 即记录）
- [ ] DP-2 CR verdict / MF 处置 + 主代理真鼠标 QA（narrow + full 复核由
  verify 步承担，收口只盯 main CI）
- [ ] DP-3 owner 生产前台 QA（部署后）
