# CR — scissor-select-feel（整卷页剪刀线选中手感，one-sheet-paper 追刀）

- Reviewer: fresh CR subagent (Opus), cold read.
- Commit under review: `b76f741` on `worktree-agent-aca672762f9763ada`; base
  `47a8a46`. Diff = `git diff 47a8a46..b76f741`. Working tree clean.
- Tier: CR-lite（纯视觉/交互层，无契约面，可逆；与 plan 的 PA-lite 理由一致）。

## Changed Scope

只动白名单：
- `app/src/features/paper-browse/PaperBrowsePage.tsx`（剪刀线 DOM 从流内 sibling
  迁为卡内 overlay；merged-instruction 与 actions 顺序随之调整）
- `app/src/features/paper-browse/paperBrowsePage.css`（gap 20→16 单一来源
  `--pb-block-gap`；剪刀线 absolute 化 + 减墨；hover band 迁到 `::after`；
  actions 绝对定位 → sticky rail；写作组内部线减墨到 0.18）
- `scripts/verify-paper-browse.mjs`（断言 46/49 随 DOM/CSS 窄改迁移）
- `docs/cuts/scissor-select-feel/qa/*`（截图 + qa-notes）

**零触碰 Forbidden**：diff 文件列表确认无 `shared-ui/papersurface/**`、
`paper-intelligence/**`、server/print/export、`App.tsx`、domain。写作组线仍走
CSS-only `.pi-writing-section + *` sibling 选择器，未改 writingPageModel/
WritingPaperPage（断言 50 绿）。

## Findings

### Must Fix
无。

### Should Watch（不阻塞本合并）

1. **高单元 hover 上半段（未滚动）sticky rail 初始位置未截图验证。**
   旧 `.paper-browse-group-actions` 为 `position:absolute; top:8px; right:8px`；
   新为 `position:sticky; top:16px; height:0; justify-content:flex-end;
   padding-right:8px`。未滚动、卡处于视口中部时，sticky 退化为自然流位置，即
   卡内容顶端 y=0（actions 是卡内首个 in-flow 子元素）——按钮比旧版高约 8px，
   贴卡片上沿而非内缩 8px。水平方向与旧版等价（距右 8px），且右上角通常是
   题号/标题的留白区，判断为可接受的等价迁移。但这是 plan 明确点名、DEV 也
   自认未补截图的盲区（qa-notes「已知缺口」第 1 条）。**owner 终验请肉眼过一遍
   上半段 hover，确认按钮不压首行内容。** 非阻塞：右上角重叠区与旧版一致。

2. **窄屏 band 贴纸边只在 794 默认宽度实测。** band 左右用
   `calc(var(--ps-page-margin-x,91px) * -1)`，与 `.paper-browse-content` 的
   `padding: … var(--ps-page-margin-x,91px)` 同一个 var 单一来源——只要卡左沿
   贴 content 内边距、页边距 var 响应式变化时两处同步，band 就恒贴物理纸边
   （已就 CSS 数学独立推演，成立）。风险仅在于未来若有 media query 单独改
   `--ps-page-margin-x` 且卡另加水平 inset 时可能漂移。当前无此路径，低风险。

3. **断言 46 是 source-grep 代理，非运行时零占位证明。**
   `/showScissorLine && \(\s*<div className="paper-browse-scissor-line"/` 只固化
   「render 存在且多行 JSX 包裹」，不直接证明零占位。真正的零占位保证来自
   断言 49 的 `position:absolute`（回退到 margin 流内会红）+ DEV 运行时实测
   相邻四卡间距 `[16,16,16,16]`。二者叠加足以支撑，但 46 单独看偏弱——记录
   在案，非缺陷（未固化错误行为，回退旧内联写法会因缺 `\(` 而红，有判别力）。

## Self-Review Blind Spots

- 我未亲自开浏览器，hover band 计算色（`rgba(44,110,86,0.02)`）、边界虚线色、
  sticky 可点性、七选五高亮叠加无遮挡等，依赖 DEV qa-notes 的 computed-style /
  boundingBox / elementFromPoint 实测数据；我独立复核了对应 CSS 数学（±gap/2、
  -page-margin-x、flex height:0 下按钮因 min-content 不塌陷）与之一致，但截图为
  二进制，未逐像素核对对齐。
- `@media (hover:none)` 触屏路径我核到规则确实 `position:static; opacity:1`
  覆盖 sticky（源码 306-319 行），与 DEV「computed static」一致；但真机触屏未
  自测。
- lecture 态 + 七选五/证据连线 z-index 层叠仅凭 DEV 单张截图 + actions z-index:2
  / band `::after` `pointer-events:none` 的静态推断判定不遮挡，未穷举所有覆盖层。

## Verification Evidence

- `node scripts/verify-paper-browse.mjs` → **177 passed, 0 failed**（自跑）。
- `node scripts/verify-ci.mjs`（= `npm run verify:all`）→ **70 PASS / 1 SKIP /
  0 FAIL**；SKIP 为 off-repo 夹具 `verify-i16a-teaching-dimension-search.mjs`，
  与本刀无关。
- `verify-paper-browse.mjs` 已注册在 `scripts/verify-ci.mjs:80`（真门会跑，非
  手跑才绿）。
- `npx tsc --noEmit -p app/tsconfig.json` → PaperBrowse 无类型错误。
- 语义不变核实：断言 44/45（scissorPlan useMemo + 写作组排除）+ 51/52（对
  `paper-2026-i` 真实 blocks 重跑 sectionGroupCounts→scissorGroupIndices/
  merged 算法，四阅读各一线 + 三单组各折指导语）全绿——九道线位置语义未动，
  本刀只改画法，与 plan 不变量一致。
- 可回退性：断言 49 要求 `position:absolute`、断言 46 要求 `&& (` 包裹形，回退
  到旧 margin 流内写法二者会红——非哑绿。

## Failure / Attack Angle

- 最可能的隐性失败是 **上半段 hover 按钮压首行**（Should Watch 1）：sticky 自然
  位比旧绝对定位高 8px，若某卡首行是靠右的内容（罕见），按钮可能压字。已判为
  低风险、右上角留白，owner 终验兜底。
- **零占位是否真零**：核心风险是流内零高度元素吃 flex gap。已从两侧夹紧——
  (a) DOM 上 Fragment 现只含一个 `<section>` flex 子（剪刀线 div 进了卡内，
  actions/scissor-line 均 absolute/height:0 且卡为 block 容器无内部 gap），
  (b) 断言 49 固化 `position:absolute`，(c) DEV 实测相邻四卡 `[16,16,16,16]`。
  三者一致，未见双 gap 复现路径。
- **stale fallback**：无。旧灰面整卡背景（`rgba(74,68,56,0.04)`）+ 12px 圆角 +
  流内剪刀线 margin 已从 CSS 删除，非留存不可达。

## Residual Risk

低。纯屏幕态视觉/交互层，print/PDF/DOCX 零引入（css 仅被 PaperBrowsePage
引入，断言 47/49 note 已述）；无数据/持久化/导出面。残留仅两处未截图的窄
场景（上半段 hover、窄屏 band），均低风险且交 owner 终验。

## Recommendation

**APPROVE**（0 Must Fix）。

零占位迁移正确且被 CSS 断言 + 运行时间距实测双向证明；剪刀线语义
（scissorPlan / 九线位置）经行为级夹具重跑确认未动；scope 未漂移、Forbidden
零触碰；verify 自跑全绿且注册在真门。两条 Should Watch 交 owner 终验，不阻塞
合并。
