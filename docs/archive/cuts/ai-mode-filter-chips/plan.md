# AI 模式精准筛选 — 结构化筛选 chips（DEV 执行契约）

Cut size: medium；touches schema/data contract: **no**；touches product
boundary: yes（找题主面用户可见行为，但方向已被 owner 两次确认：I16
定案 + 2026-07-03「一体化」修订）。

**PA 降级理由（流程调优②，CR 必须复核此段）**：本刀纯前端 + 无 schema、
无 API 语义变更、无迁移；搜索管线零改动（硬契约 C3）。错了回头成本 =
revert 一个 PR。产品方向不确定性已被 owner 拍板消解（经典模式退役、
筛选长进 AI 模式、随时可点随时生效）。故不设正式 PA，plan → DEV → CR。

上游依据：
- roadmap.md 决策 #6（2026-07-03 修订版）：一体化 AI 模式是对所有人的
  唯一界面，经典模式走向退役。
- memory/i16-ai-home-find-search-direction.md：chip 要「从真实题库长出
  来、点了真筛、能跟自然语言搜索叠加」；**配色 token 一个不许动**
  （owner 强调两次）。
- 经典模式 `filteredGroups`（App.tsx:1209-1246）已验证「语义结果 +
  结构化筛选纯前端叠加」范式——本刀是把该范式长进 ConciergeDesk。

## PM 拍板（本 plan 的裁决记录）

1. **架构 = 纯客户端叠加过滤**。筛选是独立于搜索的前端状态层，对默认
   feed 和搜索结果统一生效；改筛选不触发任何网络请求、不重跑搜索。
   搜索管线（conciergeSearch.ts 本地 intent 过滤、server steward
   filters）一行不改——它们管「query 里说出来的意图」，chips 管「手点
   的硬条件」，两层天然 AND 叠加。
2. **维度四个：题型 / 年份 / 地区 / 来源**。**难度不做**：真实库 273
   题组 difficulty 100% 是 medium（侦察已核 SQLite），做了就是骗人的
   筛选。等难度数据有区分度再回补（那是数据刀不是 UI 刀）。
3. **选项从真实题库动态聚合**（distinct 值 + 计数），不硬编码。当前
   真实分布：题型 5 值、年份 7 值（2020–2026）、地区 9 值、来源 2 值
   （real_exam/mock_exam）。数据变化时选项自动跟随。
4. **每维单选、点击 toggle（再点取消）、即点即生效**。owner 2026-07-03
   对交互模型未表态，按「随时可点、随时生效」默认设计（已在 chat 留言
   备案，可追认）。
5. **三个写死的示例 chip（STARTER_CHIPS）退役**，由结构化筛选行接替。
   I16 定案原话：「现在的 3 个 chip 只是示例提示，要升级成结构化筛选
   面」。

## 硬契约（不得偏离；偏离 = CR 打回）

- C1 **纯函数模块**：新文件 `app/src/concierge/filters.ts`，至少导出：
  - `buildFilterOptions(groups: QuestionGroupCard[])` → 四维选项（含
    每选项计数），题型按固定业务序（阅读理解/七选五/完形填空/语法填空
    /写作），年份降序，地区按计数降序，来源固定序（真题/模拟题）。
    题型/来源显示名走现成 `groupTypeLabel` 等 domain 映射，不新造。
  - `applyConciergeFilters(groups, filters)` → 过滤后的 groups。
    `filters` 四字段全可选，缺省 = 不过滤；多字段 AND。
  - 两函数纯、无 React、无 IO——verify 直接 import 断言。
- C2 **双渲染源统一生效**：筛选状态激活时，默认 feed（groups 先过
  `applyConciergeFilters` 再进 `buildDefaultFeed`）与搜索结果（
  `state.hits` 按其 group 过滤后再进 `aggregatePaperResults`）都收窄。
  搜索结果的过滤不得改写 `state.hits` 本身（保持 useMemo 派生，清掉
  筛选即还原全量结果）。
- C3 **搜索管线零改动**：`conciergeSearch.ts`、
  `server/search/questionBankStewardService.mjs`、所有 `/api/ai/*` 均
  不改。改筛选不发任何请求。
- C4 **过滤后空集诚实处理**：feed 或结果被筛到 0 时，显示一句人话
  （说明是筛选条件筛空的，不是没搜到）+「清除筛选」一键还原。不得
  静默显示空白。
- C5 **显示时机**：筛选行在 `empty`（feed 上方）、`results`、真空态
  显示；`loading` / `clarification` 期间不显示新筛选行（现有行为区域
  不动）。`reset()`（重新开始）清空筛选状态。
- C6 **配色 token 零改动**（I16 owner 硬约束）：不新增/修改任何颜色
  变量；chips 复用现有 chip/徽章样式体系，只动结构与文案。
- C7 **STARTER_CHIPS 移除**：常量与渲染块删除；`submit(chip)` 直搜
  能力保留在代码路径中（筛选行不用它，但不许顺手拆 submit 的
  intentOverride 参数）。
- C8 **行为断言 verify**（流程调优⑤）：新增
  `scripts/verify-concierge-filters.mjs`（照
  `verify-home-default-feed.mjs` 套路直接 import `filters.ts`），登记
  `scripts/README.md` + 加入 `scripts/verify-ci.mjs`。最少覆盖：
  1. buildFilterOptions：四维选项值、排序、计数正确（含地区计数降序）；
  2. applyConciergeFilters：单维过滤、多维 AND、空 filters 全量返回；
  3. 过滤到空集返回 `[]`（不 throw、不回退全量——回退是搜索管线的
     语义，chips 是硬条件）；
  4. 与 buildDefaultFeed 组合：过滤后 feed 只含匹配卷、排序不变。
- C9 **既有行为零回归**：不点任何筛选时，feed / 搜索 / 展开 / 加入
  草稿卷行为逐字节不变；`pnpm -C app run verify:all` 全绿。

## 参考实现（可偏离，偏离须在完成报告里说明）

- 筛选状态放 `ConciergeDesk` 本地 state（`feedExpanded` 同层）即可，
  不必进 `useConciergeDesk`；若发现 results 过滤在 hook 里做更顺
  （paperResults 派生处），可偏离，说明即可。
- UI 形态建议：四组横排 wrap 的 chip 行（组间留白区隔，不加组标题也
  行——「2024」「阅读理解」自解释）；选中态复用现有选中样式；行首可
  加一个极简「筛选：」或不加。选中任一筛选后出现「清除」小按钮。
- 地区 9 个值直接全列（按计数降序，学校卷自然沉后）；不做二级收纳。
- 计数徽章：选项旁小字计数（如「浙江 84」）基于全库算一次即可，不必
  随其他维度联动收窄（联动计数是 80 分打磨，不在本刀）。
- feed 顶部说明行（「题库里现有 N 套卷…」）在筛选激活时数字随过滤后
  集合走，文案可加「（已筛选）」类标注，人话、克制。
- 「显示全部 N 套卷」折叠逻辑与筛选叠加：筛选后 ≤8 套就不显示按钮，
  数字随过滤后集合。

## Forbidden（本刀不碰）

- 经典模式（filter-bar、homeMode 切换、其退役是下一刀）。
- 搜索管线两套 intent 过滤的统一/重构（值得做，另立刀）。
- 难度维度（假筛选）；topic/主题维度（copy 空间与 label 层级需要单独
  的产品思考，不顺手加）。
- 任何 server 代码、DB、schema。
- 颜色 token、全局样式变量。

## 验收

1. `node scripts/verify-concierge-filters.mjs` 绿（C8 四条全覆盖）。
2. `pnpm -C app run verify:all` 绿。
3. 完成报告列：changed files、每条硬契约落点（file:line）、参考实现
   偏离清单、verify 输出摘要。
