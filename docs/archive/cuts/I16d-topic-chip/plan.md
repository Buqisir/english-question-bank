# I16d 主题 chip — 「教学维度筛选面」开工第一节

## 定性

`cut size: medium`。PA **downgrade → PA-lite**（reversible 纯前端 product-surface；无
schema / server / API / migration；grill + 侦察已摸透边界。唯一实现风险 = `filters.ts`
多值语义，交 CR-lite 重点审）。touches：schema=**no**（主题走已落卡片的 `topicLabels`）/
data contract=**仅前端 `filters.ts` 类型小扩展**（非 DB/API 契约）/ product boundary=**yes**
（找题）/ teaching interpretation=**no**（chip 用 `theme_group` 中层，grill 已定）。

## 背景

接 2026-07-05 搜题引擎 grill 收口（本 session）。共识：owner 的"最全最细分搜题引擎"是
**兑现 ADR-0008/0009 + I16·A**，只差 `docs/cuts/I16-teaching-dimension-search/plan.md:100`
留给 "Claude Design" 的**找题 UI**。本刀 = 那个 UI 的**开工第一节**：把"主题"这个 **cross-type
通用教学维度**（区别于 `CONTEXT.md` 新术语 **Teaching Axis** 那类题型专属轴）做成 concierge
的结构化筛选 chip。②七选五承上启下、③语法填空考点（真 Teaching Axis，接 `/api/teaching-facets`
后端）是紧接的后续刀，**不在本刀**。

## 数据（已核实，活库 + 代码）

- `QuestionGroupCard.topicLabels: TopicLabel[]`（`questionBank.ts:45,58-69`）已在卡片、运行时
  有值（`conciergeSearch.ts:558` 早已消费做自然语言搜索）。
- DB `question_group_topic_labels`：**273/273 组 100% 覆盖**（活库实测），510 条，confidence 0.4–0.95。
- chip 用 `theme_group` 中层 = **9 类**（生活与学习/科学技术/环境保护/文学艺术体育/…）。grill 定：
  `theme`(3) 太粗、`subtopic`(68) 爆墙、`theme_group`(9) 是甜点区。
- 多值：一组平均 1.87 个 label（510/273）→ **OR 语义 + 多值计数是核心实现点**。

## Scope

### S1 — `filters.ts` 加 `topicGroup` 维度（核心；多值逻辑收敛在此）

- `ConciergeFilters`（`filters.ts:47-52`）+ `topicGroup?: string`（**单个**选中的 theme_group）。
- `ConciergeFilterOptions`（`:39-44`）+ `topicGroup: FilterOption[]`。
- `buildFilterOptions`（`:108-139`）+ topicGroup 段，**多值计数**：遍历每组 `topicLabels`，对该组
  **distinct** 的 `themeGroup` 各计一次（同组两 label 同一 themeGroup 只计一次）。排序按 count 降序。
- `applyConciergeFilters`（`:189-209`）+ topicGroup 判断，**OR 语义**：
  `topicGroup !== undefined && !group.topicLabels?.some(l => l.themeGroup === topicGroup)` → 排除。
- `buildFacetedFilterOptions` 的 `dimensions` 数组（`:162`）+ `'topicGroup'`。
- **`countBy` 多值处理**：现 `countBy`（`:66-77`）假设单值 pick。推荐**不动其签名**，在
  `buildFilterOptions` 里给 topicGroup 单写一段 distinct 计数循环（降低回归面）。

### S2 — `ConciergeDesk.tsx` 把维度加进列表 + label

- `FILTER_DIM_LABEL`（`:66-71`，含 type 联合）+ `topicGroup: '主题'`。
- `ALL_FILTER_DIMS`（`:81`）+ `'topicGroup'`。
- `DEFAULT_FILTER_DIMS`（`:80`）→ **PO 决策点 A**。按推荐 = `['groupType','year','topicGroup']`
  （主题默认露），地区/来源仍收「更多筛选」。
- `hasActiveFilters`（`:127-131`）+ `filters.topicGroup !== undefined`。
- 若 PO 选"主题收进隐藏维"，`hasHiddenActiveFilter`（`:136-137`）要加 topicGroup；默认露则不动。
- chip 渲染循环（`:260-287`）**零改**（已数据驱动 `visibleFilterDims.map`）。`toggleFilter` /
  year 特判（`:276`）topic 走 string else 分支，无需改。

### S3 — 结构确认（记录，不写码）

"为②③题型专属轴留接口"：现有 `visibleFilterDims.map` 已是数据驱动骨架，加维度=加进列表。②③要的
"选中题型才出现的动态维度" = 未来让 `visibleFilterDims` 按 `filters.groupType` 动态追加 —— **本刀不
实现，仅确认现结构不堵这条路**（razor：不搭空壳）。

## Out of Scope / Forbidden

- 不碰 `server/**`、`data/sql/schema.sql`、任何 API / migration。
- 不接 `/api/teaching-facets`（②③的事）。
- 不做题型专属轴（承上启下 / 考点 / 词性）。
- 不实现"选中题型才出现"的上下文 chip 动态逻辑。
- 不建 ADR-0009 通用属性表（是更后面的独立架构决策）。
- 不改 `conciergeSearch.ts`（主题自然语言搜索已有；本刀只加结构化 chip）。
- 不动难度 / `subtopic` / `theme` 顶层维度。

## PO 决策点

- **A（渐进披露位置）**：主题 chip **默认露**（顶掉"地区"进「更多筛选」）还是**收进「更多筛选」**？
  **推荐默认露** —— 主题是 DESIGN.md 点名的深维度主角；`theme_group` 才 9 个，第一屏放得下
  题型+年份+主题。本 plan 按"默认露"拟定；reversible，PO 可 QA 时推翻。

## Verify

- `node scripts/verify-concierge-desk.mjs`（若钉了 chip 结构/颜色，同步更新断言，非 test-gaming）。
- `filters.ts` 行为断言：选一个主题 chip → 只剩含该 `themeGroup` 的组；faceted count 对多值正确
  （一组多 label 不把同一 themeGroup 重复计数）；清除筛选恢复全集；主题 × 题型 AND 联动。
- 浏览器 QA：主题 chip 渲染 9 类、点选筛选、与题型 AND 联动、渐进披露 toggle、窄屏不挤、AA 对比度。
- redeploy eqbank.cc（拆法见记忆 `eqbank-live-ops`）。

## 参考坐标

`filters.ts:39-52,66-77,108-139,157-178,189-209` · `ConciergeDesk.tsx:66-81,127-140,260-287` ·
`questionBank.ts:45,58-69` · `CONTEXT.md「Teaching Axis」` · grill 收口见本 session transcript。
