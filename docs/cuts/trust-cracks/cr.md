# Fresh CR — trust-cracks（刀2 信任裂缝）

Reviewer: fresh CR subagent (Opus/high), cold read, independent context.
Range reviewed: `git diff 314c78a..d685427`（DEV 收口 commit，工作树 clean）。
Worktree: `/Users/huangxuewei/Projects/wt-trust-cracks`。

## Verdict

**APPROVE** — 0 Must Fix / 5 Should Watch。

契约 C1–C9 全部落地且实现正确；Forbidden 零触碰；灰区纪律守住；新增 verify
断言是行为断言/收紧断言而非放水，且四个脚本全部注册在 `verify-ci.mjs`（真正
进闸）。

## Changed Scope（11 文件，全在 Suggested Files + verify 白名单内）

- `server/search/semanticSearchService.mjs` — C1a/b/c 诚实空态（`server/**`
  唯一允许文件；steward service 按 C1d 未动）。
- `app/src/App.tsx` — C3a/b 详情进 URL（openDetailRef + writeUrl 选项 + boot
  mount effect + popstate detail 分支 + 三处 open* 删 groupId）。
- `app/src/concierge/ConciergeDesk.tsx` — C2 空态一个声音 / C4 筛选进 URL /
  C7 hideYear。
- `app/src/concierge/ConciergeGroupCard.tsx` — C3c 详情 button→`<a href>`。
- `app/src/concierge/ConciergePaperRow.tsx` — C5a/b 卷名去结巴 / C7 hideYear prop。
- `app/src/features/draft-paper/DraftPaperRail.tsx` — C6 行尾 "N 题" + title。
- `app/src/features/draft-paper/DraftPaperWorkbench.tsx` — C8 灰区，**仅** toast
  一处文案（单 hunk，实测 `grep -c "^@@"`=1；reducers/state/URL/adapter 零动）。
- 四个 verify 脚本：h5h / concierge-desk / classic-retire-2 / c8。

未出现任何 `domain/**`、`*Adapter.ts`、`shared/papersurface/**`、print/PDF/
export、`conciergeSearch.ts`、`SevenChoicesAnalysisPanel.tsx`、
`PaperIntelligencePaperSurfaceHarness.tsx`、其它 `server/**` 文件。契约 hook
无解锁需求。

## Findings

### Must Fix

无。

### Should Watch（非阻塞，记录监控，勿自动转任务）

- **SW-1｜C1c 分数地板（<0.25 丢弃）无直接测试。** verify-h5h 三个新用例证明了
  ①rankings:[]→空 ②parsed:null→兜底非空 ③部分入榜→未入榜不追加，且既有
  fixture（0.9/0.4）证明地板不误伤 >0.25 的条目；但"score<0.25 的入榜条目被
  丢弃"这条 C1c 分支本身没有用例覆盖。逻辑（`semanticSearchService.mjs:146`）
  简单且冷读正确，运行时风险低（最坏是漏丢一条略不相关结果，非数据/契约
  危害），故不阻塞。
- **SW-2｜C5b `region.includes(core)` 短核误伤（理论）。**
  `ConciergePaperRow.tsx` buildHeadline 的重叠判定，当 core 极短/常见时
  （例如卷名 "一卷"→core "一"，被任何含"一"的无关 region 命中）会误判重叠、
  丢掉 region 信息。plan 已接受该启发式且实测全库 33 组无结巴；新卷名数据
  入库时值得回看。
- **SW-3｜C4 写回只把 `undefined` 当"删键"。** `ConciergeDesk.tsx` 写 URL 的
  effect：filter 值为空字符串时会写成 `f.x=` 再在读入时被 `if (value)` 忽略
  （读写不对称）。当前 chip 不产生空字符串值，无实际影响。
- **SW-4｜boot 落详情有一帧列表闪。** `?view=detail` 直开时 viewMode 默认
  'list'，靠 mount effect 翻成 'detail'，理论上有一帧列表。DP-2 刷新 QA 实测
  落在详情，观感可接受。
- **SW-5｜defaultRankScore × 地板。** LLM 返回 rankings 但 score 省略（null）
  时，靠位次算出的 defaultRankScore 会让靠后条目跌破 0.25 被丢。仅在 LLM 不给
  分时触发；正常返回带分。

### Nice-to-have

无。

## Verification Evidence

- 独立重跑（已 unset 代理变量）：
  - `node scripts/verify-h5h-semantic-search.mjs` → 84 passed / 0 failed, exit 0。
  - `node scripts/verify-concierge-desk.mjs` → 271 passed / 0 failed, exit 0
    （含新增 Test 21 C5 / Test 22 C7 / Test 23 C4）。
- 断言可失性抽查（persona 要求）：
  - h5h 用例③ rankings 只含 g-alpha → matches.length===1：旧行为
    （appendUnranked=true）会把 g-beta 追加使 length>1，断言会失败 → 真保护。
  - h5h 用例① rankings:[]→matches:[]：旧行为会追加全部候选 → 断言会失败。
  - classic-retire-2：详情断言从 `<button onClick>` 收紧为 `<a href>` +
    preventDefault + onOpenDetail + 负向断言"不再是 button"——是收紧非放水。
- 闸门归属：四脚本均在 `scripts/verify-ci.mjs`（`verify:all` 入口），
  verify-ci preflight 含 `app build/typecheck`，新 TSX 会被类型检查。主代理
  `pnpm -C app run verify:all` PASS 77/FAIL 0 已证实。
- C5 copy-in-verify：Test 21 内联的 stripLeadingYearToken/buildHeadline 已与
  `ConciergePaperRow.tsx` 源逐字比对一致（本次评审时点无漂移），并有源扫描
  sanity 钉住关键正则/逻辑防未来单边改。

## Failure / Attack Angle

- **诚实空态被"伪空"绕过？** `hasRankingsShape` 对 `{}`（无 rankings 形状字段）
  判为解析失败 → 走兜底追加全部候选（即旧的"硬凑"行为）。这看似回到裂缝，但
  符合 plan C1b「无 rankings 形状字段=解析失败=保留现行为」，且 prompt(C1a)已
  指示模型对"无相关"返回 `{"rankings":[]}`（会被信任为真空）。`{}` 属真正
  歧义/截断响应，退回展示候选比误报"题库没这题"更安全。非缺陷。
- **幻觉 id 混入榜单？** `candidateById.get()` 取不到即 `return` 跳过，
  appendUnranked=false 下不会被追加；全为幻觉 id → 诚实空。已覆盖。
- **URL 双写/踩参？** openDetail(pushState) 只删 6 个导航参数、保留 `f.*`；
  boot/popstate 走 writeUrl:false 不二次 push；C4 写回只动 5 个 `f.*` 键、
  逐次从 window.location.href 重取 URL、保留 view/groupId/其它参。互不踩。
  ref-assign effect 声明在 boot effect 之前，mount 时 openDetailRef 已就位。
- **灰区扩权？** DraftPaperWorkbench 单 hunk，仅文案，验证过。

## Residual Risk

低。核心高危面是 server 诚实空态（C1），已有 stub DeepSeek 的行为级用例覆盖
主路径（空/解析失败/部分入榜）；剩余未测的是 C1c 地板丢弃分支（SW-1，低危）。
UI 侧受 .tsx 不可 import 限制走源扫描 + copy-in-verify，配合 DP-2 浏览器复核
（刷新落详情/中键/筛选恢复/卷名/年份列/rail/toast 全绿）已足。无 schema/迁移/
导出/print 面。

## Recommendation

**APPROVE。** 无 Must Fix。SW-1..5 记录监控，不并入本刀。可进裁决点1 收口。
