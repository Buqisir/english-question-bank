# trust-cracks Plan — 刀2 信任裂缝（诚实空态 + 详情/筛选进 URL + 数据组合毛病收账）

## Cut Size

medium。

Touches schema, data contract, product boundary, or teaching interpretation: no。
（语义搜索 API 的 matches 字段**形状不变**，只是"永不为空"的行为改为"可诚实为空"——
客户端真空态渲染路径已存在且已上线；无 schema / 迁移 / 导出面。）

来源：2026-07-13 全站三路评审
`.impeccable/critique/2026-07-13T15-58-11Z__full-project.md` Priority 1/2/4 +
`docs/STATUS.md` 刀2 待办清单。六个账目全部由 PM 现场勘察定位到代码，见下。

## Objective

清掉评审命中的"信任裂缝"账：AI 搜索无匹配时不再硬凑 8 条自称无关的推荐
（P1）；详情视图与筛选状态进 URL，刷新/中键/分享不再丢态（P1）；卷名结巴、
rail 标签截断/题型复读、搜索结果年份列复读、"已删除"措辞四笔小账一并收。
不碰主页方向（另有原型议题未拍板）。

## Locked Product Decisions

- concierge 允许说"我没有这样的题"：AI 语义搜索在候选全不相关时返回空
  matches，前端走**已存在**的真空态（"没找到匹配…返回浏览全部 N 套卷" +
  默认 feed）。永不空态的机制废除。
- LLM 重排响应解析失败（拿不到 rankings 形状）≠ 无匹配：解析失败保留
  旧的"预筛候选按序兜底"行为，不得把 AI 抽风演成"题库没有这题"。
- 详情路由参数定为 `?view=detail&groupId=<id>`（groupId 语义与 PI 路由
  一致）；筛选参数定为 `f.groupType` / `f.year` / `f.region` /
  `f.sourceType` / `f.topicGroup`（无筛选时参数不出现在 URL）。
- 筛选写 URL 用 `replaceState`（精修不产生历史条目）；详情打开用
  `pushState`（是一次导航，Back 应能退回列表）。
- 搜索 intent 本身**不进 URL**（刷新重放 AI 搜索会烧配额；本刀不做）。
- 卷名去重后行首标题**只显示卷名**（"新课标Ⅰ卷"），region 与卷名重叠时
  不再前缀 region；年份已有独立列/组头承担。
- rail 行尾计数去掉题型词，只留 "N 题"（题型对阅读项与标签重复、对其他
  项与标签逐字复读）。
- undo toast 文案 "题组已删除" → "题组已移出"（动作按钮本就叫"移除"；
  题组仍在题库）。

## 硬契约（不得偏离；偏离 = CR 打回）

- C1 **语义搜索诚实空态（server）**：`server/search/semanticSearchService.mjs`
  - C1a 重排 prompt 规则 3 由「候选都不匹配时，也必须返回最相关的候选」
    改为「只返回与检索意图真正相关的候选；候选都不相关时返回空 rankings
    []，不要为凑数返回无关候选」。prompt 其余结构（0 缩进、JSON 示例块
    0/2 空格结构、规则/返回格式行）保持 verify-h5h 钉住的形状。
  - C1b LLM 响应含 rankings 形状（含空数组）时**完全信任**：不再把未入
    榜候选追加回 matches；rankings 为空 → matches 为空。响应解析失败
    （parsed 为空/无 rankings 形状字段）→ 保留现行为（候选按预筛序兜底,
    reason 走无 LLM reason 的分支）。
  - C1c 入榜但自打脸的条目要地板：ranking score 归一后 < 0.25 的条目
    丢弃；全部被地板丢弃视同诚实空。
  - C1d steward 路径不需改（`buildQuestionBankStewardMessage` count=0 已
    有诚实文案；`applyStewardFiltersToMatches` 对空集透传）。
- C2 **前端空态一个声音**：steward 来源（非 fallback）且 hits 为空时，
  `ConciergeDesk` 不再渲染 assistantMessage 段落——真空态由既有
  `concierge-empty` 行（含"返回浏览全部 N 套卷"按钮）+ 默认 feed 承担。
  本地 fallback 路径（weak/allWeak/噪声地板）行为零变化。
- C3 **详情进 URL**：
  - C3a `openDetail` 写 `?view=detail&groupId=<id>`（pushState，参照
    `openPaperBrowse` 模式；同时清掉 draftPaperId/focusGroupId/paperId/
    questionId/lecture/similar）。`backToList` 用 replaceState 删
    view+groupId。boot（App mount）读到 view=detail&groupId 时自动
    openDetail 且**不再重复写 URL**；popstate 重放同款（进入/退出详情
    均正确）。
  - C3b 其余 `open*` 导航（draft-paper / paper-browse / my-space）写 URL
    时顺带删 `groupId`，防孤儿参数。
  - C3c `ConciergeGroupCard` 的"详情"按钮改为 `<a href="?view=detail&
    groupId=…">` + onClick preventDefault 走 SPA 快路径（与同卡"看解析"
    家族同款模式）——中键/新标签可用。可访问名与现文案不变。
  - C3d 刷新详情页 URL 直接落回同一题组详情（fetch 独立于列表数据）。
- C4 **筛选进 URL**：`ConciergeDesk` 的 chip 筛选状态与 `f.*` 参数双向：
  mount 时从 URL 读入（非法 year=NaN 忽略该维），变更时 replaceState 写回
  （只增删 `f.*` 键，**必须保留其它参数**）。从详情/草稿卷返回列表后筛选
  凭 URL 恢复（组件重挂载走 initializer 即可，不要求额外监听）。
- C5 **卷名结巴**：`ConciergePaperRow`
  - C5a `stripLeadingYearToken` 支持 `YY.M` / `YYYY.M` 月份形：剥年份后
    把月份改写为 `M月`（"26.3重庆市…" → "3月重庆市…"），不得再剩裸数字。
  - C5b `buildHeadline` 去重：剥年后的卷名包含 region、或 region 包含
    卷名去掉尾缀"卷"后的核心时，只显示卷名。实测全库 33 组 region/
    paperName 无一结巴（"全国甲卷 全国甲卷"、"全国新课标Ⅰ 新课标Ⅰ卷"、
    "浙江 1月浙江卷" 全部消失）；无重叠时保留 "region 卷名" 现状。
    fallback 桶（"其他来源"）不变。行级 aria-label 结构不变。
- C6 **rail 复读与截断**：`DraftPaperRail` 行尾计数改为 `N 题`（去题型
  词），行加 `title` 提示全文（label · 题型 · N 题）。默认 rail 宽度下
  四个阅读项的区分字母 A-D 可见（不再四行 "Reading…"）。
- C7 **搜索结果年份列去复读**：搜索态（variant='search'）连续同年行，
  仅首行显示年份列数字，其余行该列留空（aria-label 已含年份，读屏零损
  失）。feed 态（年份组头）零变化。verify-concierge-desk 钉住的行
  className 模板字面量不得动。
- C8 **措辞**：`DraftPaperWorkbench.tsx` undo toast "题组已删除" →
  "题组已移出"。该文件为灰区：**仅许这一处显示文案改动**，reducers /
  state / URL state / adapter 一概不碰。
- C9 全部既有 verify 脚本随行为同刀更新（优先行为断言）；
  `pnpm -C app run verify:all` 绿；不新增依赖。

## 参考实现（可偏离，偏离须在完成报告里说明）

- C1b 判定"LLM 响应过"：`deepSeekResult.parsed` 存在且其
  rankings/matches/results 任一字段为数组（或 parsed 本身是数组）→ 信任
  路径；否则解析失败路径。实现落点建议在
  `semanticSearchQuestionGroups` 内分支，或给
  `buildSemanticSearchMatchesFromRankings` 加一个显式 mode 参数——两者
  取其一，保持函数顶层 0 缩进（verify-h5h 的 extraction-seam 断言）。
- C1 verify：`scripts/verify-h5h-semantic-search.mjs` 加三个行为用例
  （stub DeepSeek）：①rankings:[] → matches:[]；②parsed:null → 预筛兜
  底非空；③rankings 只含 1/2 候选 → 未入榜者不追加（matches.length===1）。
  现有 fixture（0.9/0.4 两条）在 0.25 地板下不受影响。prompt 结构断言
  若因规则 3 文案变化失配，按新文案同刀更新断言（保持"结构不塌"检查的
  本意）。
- C3 boot 自动打开详情：App 内加一次性 mount effect（读 boot 时快照的
  URLSearchParams）；给 `openDetail` 加 `opts?: { writeUrl?: boolean }`
  缺省 true，boot/popstate 调用传 false。popstate handler 现有分支上
  加：view==='detail'&&groupId → openDetail(gid,{writeUrl:false})；
  否则 setViewMode('list')。main.tsx 只匹配自己认识的 view 值，
  view=detail 会自然落进 <App>（DEV 顺手确认，不改 main.tsx）。
- C4 落点：`filters` useState 初始化器读
  `new URLSearchParams(window.location.search)`；一个 `useEffect`
  在 filters 变化时写回。年份值 `Number()`，`Number.isFinite` 过滤。
- C7 落点：`ConciergeDesk` 渲染 `filteredPaperResults.map` 时算
  `hideYear = i>0 && paper.year!==null && paper.year===arr[i-1].year`，
  传新可选 prop 给 `ConciergePaperRow`（feed 变体不传）。
- C8 文案钉子已查：仓库内无脚本/测试钉住"题组已删除"字符串。
- 触达文件的相邻窄脚本（自验用，最终以 verify:all 为准）：
  `verify-h5h-semantic-search.mjs`、`verify-h5i-steward-service.mjs`、
  `verify-concierge-desk.mjs`、`verify-c6a10-concierge-local-search.mjs`、
  `verify-classic-retire-2.mjs`、`verify-c8-draft-paper-render-model.mjs`。

## Forbidden

- `app/src/domain/**`、schema、`*Adapter.ts`、`shared/papersurface/**`、
  print / PDF / export styling（契约 hook 看守；本刀无解锁）。
- `server/**` 中除 `server/search/semanticSearchService.mjs` 外的一切
  文件（steward service 按 C1d 明确不改）。
- `DraftPaperWorkbench.tsx` 除 C8 一处文案外的任何改动；
  `SevenChoicesAnalysisPanel.tsx`、`PaperIntelligencePaperSurfaceHarness.tsx`
  零触碰。
- 本地关键词 fallback 的评分/地板/weak 语义（conciergeSearch.ts 的
  排序与阈值逻辑）零改动——C2 只动 Desk 的一处渲染条件。
- 主页布局/方向（home-desk 议题未拍板）；搜索 intent 进 URL；新依赖；
  重排 prompt 除规则 3 外的其它行。
- 生产环境与部署（本刀只到 merge + main CI 绿）。

## Suggested Files

- `server/search/semanticSearchService.mjs`（C1）
- `scripts/verify-h5h-semantic-search.mjs`（C1 verify）
- `app/src/concierge/ConciergeDesk.tsx`（C2、C4、C7）
- `app/src/App.tsx`（C3）
- `app/src/concierge/ConciergeGroupCard.tsx`（C3c）
- `app/src/concierge/ConciergePaperRow.tsx`（C5、C7）
- `app/src/features/draft-paper/DraftPaperRail.tsx`（C6）
- `app/src/features/draft-paper/DraftPaperWorkbench.tsx`（C8，仅文案）

## Verification

- C1: `node scripts/verify-h5h-semantic-search.mjs`（含新增三用例）
- C1d: `node scripts/verify-h5i-steward-service.mjs`
- C2/C5/C7: `node scripts/verify-concierge-desk.mjs` +
  `node scripts/verify-c6a10-concierge-local-search.mjs`
- C3: `node scripts/verify-classic-retire-2.mjs`（详情视图既有钉）+
  浏览器 QA（下表）
- C6: `node scripts/verify-c8-draft-paper-render-model.mjs`
- 全量: `pnpm -C app run verify:all`（tsc + eslint + vitest + verify-ci）

## Browser QA Matrix（DEV 自验 headless / qa-local-owner；DP-2 主代理复核）

| Case | Expected result |
| --- | --- |
| 无 AI key 场景搜"生态"（本地 fallback） | 行为与现状一致（weak 提示等零回归） |
| 打开某题组详情 → 刷新 | 仍在该题组详情；Back 退回列表 |
| 详情按钮中键 | 新标签直接落详情 |
| 勾 题型=阅读 + 年份 chip → 刷新 | 筛选保持；URL 含 f.* 参数；清除筛选后 URL 无 f.* |
| 详情 → 返回列表 | 筛选凭 URL 恢复 |
| feed 卷行标题 | 无 "全国甲卷 全国甲卷"/"全国新课标Ⅰ 新课标Ⅰ卷" 式结巴；巴蜀中学卷无裸 "3" |
| 搜索结果多行同年 | 年份列只在首行显示 |
| 草稿卷 rail 四个阅读项 | "Reading A/B/C/D" 字母可见；行尾 "N 题" |
| 草稿卷移除题组 | toast 文案 "题组已移出 · 撤销" 可撤销 |

（steward 真空态依赖 DeepSeek key：DEV 用 verify-h5h stub 用例证明；有
key 的环境可补一条真查询人证，无 key 不阻塞。）

## DEV Readiness

- 全部契约互相独立，可按 C1→C8 顺序或任意顺序施工；C9 收尾。
- worktree 开工第一步 `bash scripts/setup-worktree.sh`；浏览器 QA 用
  worktree 自己的 sqlite 副本 + `node scripts/create-user.mjs
  --reset-password` 重置 qa-local-owner。

## 裁决点清单(主代理出场点;施工中勾选)

- [x] 裁决点0：plan 拍板 commit（PM，本文件）
- [x] 裁决点1：流水线回执收口（CR APPROVE 0MF/5SW；verify 假红主代理亲跑复核 PASS77）
- [x] 裁决点2：merge 98d708d + main CI 绿（经 e2e 跟刀修复后 9517085 success）+ STATUS
- [x] 裁决点3：DP-3 owner 前台 QA 全过（诚实空态打回→relevant 补刀→生产双证；中键/toast owner 确认 2026-07-14）+ 生产 9517085
