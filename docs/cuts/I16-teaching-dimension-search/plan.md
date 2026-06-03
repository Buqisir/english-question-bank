# I16·A Plan — 教学维度检索层（按考点/篇章功能/题型/词性找题，后端，无 UI）

## Cut Size

**medium**。Touches schema/data contract = **no（只读现有解析文件，不改解析生成/契约）**；product boundary（找题/检索）= **yes**。后端纯检索层；**不做 UI**（UI 这一相留给后续 + Claude Design）。全门：PA before DEV、CR-lite、verify-ci、（本 cut 无浏览器面，QA = 查询行为验证）。

## Objective

把四类解析里**已经结构化、已落盘**的教学考点**索引出来、可被查询**——让"按教学维度找题"成立（owner 的 A）。第一刀只做**搜索逻辑/检索层**：一个后端服务，遍历 paper-assets 的解析文件，把每个题组的教学 facet 聚合成可查询的索引，开放查询接口。**深维度按题型分域**：

- **语法填空** → 考点 `facetKey`（16 类）+ `blankType`（有/无提示）+ 非谓语 `role`
- **七选五** → 篇章功能 `roleFacet`（总起/小结/**承上启下 bridge**/衔接）+ `positionFacet` + `primaryMechanismFacet`
- **阅读** → 题型/技能 `skill.primary`（8 类）+ `skill.secondary`
- **完形** → 词性 `pos`（6 类）+ 考点 `signatureFacet`

覆盖 = **仅已解析的题组**（解析线覆盖即找题覆盖，诚实写明）。**主题（B）、被动/语态（C）、难度（假数据）不在本 cut。**

## Why (owner-locked, 2026-06-03)

PM grill 定案：新找题建在 owner 的**教学 taxonomy** 上（按"教什么"找，不按"哪张卷"），而非浅维度（题型/年份/地区 chip）。A/B/C 中 **A 先**——它只索引已有结构化数据、不生成新数据、风险低、自包含；owner 的"七选五承上启下""阅读推理题""非谓语作状语"靠它立刻能跑。UI 不急（留 Claude Design）。详见记忆 `i16-ai-home-find-search-direction`。

## Code Reality (verified — design around it)

- **解析文件位置**：`resolvePaperAssetReadPaths(paperAssetsDir, paperId)`（`server/paper-import/storage.mjs:23`）→ `baseDir/analyses/<type>-analysis-v1.json`。`server/search/paperSurfaceAvailability.mjs:104-130` **已经在按这个套路遍历 paperAssetsDir + 读 paper-asset.json + 读 analyses/** —— 检索层**复用同一读取/遍历模式**。
- **facet 容器（已核实，paper-960d0f8d）**：facet 按 **questionId** 存在 dict 里：
  - grammar-fill：`blanks{ [questionId]: { blankId, blankType, facetKey, role, path, ... } }`
  - seven-choices：`questions{ [questionId]: { roleFacet, positionFacet, primaryMechanismFacet, ... } }`
  - cloze：`blanks{ [questionId]: { pos, signatureFacet, ... } }`
  - reading-choice：`questions{ [questionId]: { skill: { primary, secondary }, ... } }`
- **join 到题组**：分析文件有 `targetGroups: groupId[]`；**问题→题组** 映射在 paper-asset.json `content.groups[].questionIds`（单组型 grammar/seven/cloze 全部问题归该唯一组；reading 4 组需用 questionId→groupId 映射）。检索层读 paper-asset.json 建 `questionId→groupId`，再把 facet 聚到题组级。
- **枚举值权威**：facet 取值由各 `analyze*.mjs` / `prompts/*-analysis-v1.md` / facet registry 固定（如 `grammarFillFacetRegistry.ts` 16 leaf、seven roleFacet 4 值、reading skill 8 值、cloze pos 6 值）——**检索层只读，不新增枚举**。
- **卡片侧**：`QuestionGroupCard`（`app/src/domain/questionBank.ts:30-56`）目前**不带 facet**。本 cut 产出 facet 索引**独立**（新端点 / 新字段），**不改核心卡片契约**（PA 定夺端点 vs 附挂）。

## Locked Product Decisions

- **只读解析文件，不碰解析生成 / 契约 / prompt / registry**。
- **深维度按题型分域**（每类只暴露该类相关 facet）；主题/难度跨题型维度**不在本 cut**。
- **聚合到题组级**：题组 facet = 该组所有题/空的 distinct facet 并集（"该组有空考承上启下" ⇒ 命中）。
- **覆盖仅已解析题组**，未解析题组无 facet（诚实，不报错、不臆造）。
- **内存聚合 + 稳定查询接口**（资源意识；规模大再换索引/DB，接口不变——与既有"建缝别建教堂"一致）。
- **无 UI**：本 cut 不出前端面；产出供后续找题面消费。

## Must Do（TDD：纯函数先写 verifier 断言→实现到绿）

### Step 1 — 纯函数：单文件 facet 提取（每类一个 extractor）
- 新建 `server/search/teachingFacets.mjs`：`extractGroupFacets(analysisType, analysisJson, questionToGroup)` → `Map<groupId, { facetKeys, blankTypes, roles, roleFacets, positionFacets, mechanismFacets, skills, secondarySkills, pos, signatureFacets }>`（按类型只填该类字段，distinct）。
- Verification（Step 4 verifier）：喂真实 960d0f8d 四类样本 → 七选五组含 `roleFacet` 含 `cohesion`；语法组含 `facetKey` 多个；reading 4 组各自的 `skill.primary` 正确归位（用 questionId→groupId）；cloze 组含 `pos`。

### Step 2 — 聚合服务：遍历 paper-assets 建题组级教学索引
- 在 `server/search/` 加 `createTeachingFacetIndex({ paperAssetsDir })`（仿 `paperSurfaceAvailability` 的 `readdirSync` + `resolvePaperAssetReadPaths` + 读 paper-asset.json 建 `questionId→groupId` + 读各 analyses 文件调 Step 1）→ 缓存 `Map<groupId, GroupTeachingFacets>` + `invalidate()`。
- Verification：跑真实 paper-assets → 已解析题组有 facet、未解析题组缺省为空；缓存命中。

### Step 3 — 查询接口 + 暴露
- `queryGroupsByTeaching(index, filters)`：`filters` 形如 `{ groupType?, facetKey?, roleFacet?, skill?, pos?, ... }`（按题型分域、可多值），返回命中 `groupId[]` + 每组 facet 摘要。空 filter 返回全部已解析组。
- 暴露：新增只读端点（如 `GET /api/teaching-facets`：全量题组→facet 摘要，供未来找题面消费）**或** 在 `/api/question-groups` 响应上附挂 `teachingFacets?`（PA 定夺，倾向独立端点以不动卡片契约）。注册进 `server/api.mjs` 路由表（`serverRoutes`，`api.mjs:419`）。
- Verification：查询"七选五 roleFacet=bridge/cohesion"返回对应组；"语法 facetKey=...non-finite"返回语法组；多维度叠加；未解析组不出现。

### Step 4 — Verifier + CI
- 新建 `scripts/verify-i16a-teaching-dimension-search.mjs`（`tsx`/`node` import Step 1-3 模块 + 真实样本断言；含上面各 Verification）。注册进 `scripts/verify-ci.mjs`；更新 `scripts/README.md`。
- Verification：`node scripts/verify-i16a-teaching-dimension-search.mjs` 绿；`verify-ci.mjs` 绿；不回归 `verify-paper-surface-availability*`（若有）。

## Forbidden

- **不碰解析生成/契约**：`server/paper-import-ai/analyze*.mjs`、`prompts/*-analysis-v1.md`、`*.contract.md`、facet registry、schema —— 只读，不改。
- **不做主题（B）/ 被动语态（C）/ 难度筛选**——分别是后续 cut / 假数据。
- **不做 UI / 前端**：不动 `app/src/**`（除非 PA 判定需在 `domain/questionBank.ts` 加一个**只读可选** facet 类型，且仅类型、不改取数）。
- **不改 `QuestionGroupCard` 核心字段 / `/api/question-groups` 既有形状**（facet 走独立端点/可选附挂）。
- **不碰服务端既有检索/ steward / concierge**。
- 不提交 `app/public/paper-assets/**` / `.claude/launch.json`；禁止 `git add -A`，显式 stage。

## Suggested Files

- `server/search/teachingFacets.mjs`（新：extractor + 聚合 index + 查询）
- `server/api.mjs`（注册只读端点；route 表 `:419`）
- `scripts/verify-i16a-teaching-dimension-search.mjs`（新）+ `scripts/verify-ci.mjs` + `scripts/README.md`
- （可选，仅类型）`app/src/domain/questionBank.ts`（只读 facet 摘要类型，供未来面消费）

## Verification

- 定向：`node scripts/verify-i16a-teaching-dimension-search.mjs`、`git diff --check`。
- 全门：`node scripts/verify-ci.mjs`、`npm run build --prefix app`（确保类型若有改动可编译）。
- 无浏览器面；查询行为由 verifier 覆盖。

## DEV Readiness

- 本 plan committed before PA；**PA before DEV**（找题产品边界 + 跨文件数据 join）。`pa-reviewer`（fresh Opus）写 `docs/cuts/I16-teaching-dimension-search/pa.md`。
- DEV 用 **TDD**：Step 1-3 纯逻辑先在 verifier 写断言→实现到绿。
- **PA attention asks**：
  1. 题组级聚合（distinct 并集）是否是 owner 要的语义——"该组有空考承上启下"即命中，对吗？还是要题/空级粒度（搜到具体哪个空）？
  2. join 可靠性：reading 多组用 paper-asset `content.groups[].questionIds` 映射 questionId→group，有无缺失/错配风险（缺则跳过不崩）？
  3. 端点形态：独立 `GET /api/teaching-facets` vs 附挂 `/api/question-groups`——哪个对未来找题面更省、对卡片契约零侵入？
  4. 覆盖局限（仅已解析题组）——本 cut 记为已知 watch 即可，还是要在产出里显式标注"未解析"？
  5. 与未来 B（主题，跨题型维度）、卡片既有 bibliographic 维度（年份/地区/来源）如何在同一查询接口里共存——本 cut 接口形状要不要先预留 cross-type filter 槽？

## Out of Scope（后续）

- **B — 主题维度**：接通三大主题语境→主题群→主题（被 `94950a1` 砍掉的自动入库管道；前置先搞清为何砍）。
- **C — 被动/语态**：给语法解析补结构化 voice 维度（owner 后面好好补）。
- **难度维度**：需先给导题补真实难度评估（现全"中"）。
- **找题 UI**：默认题库视图 + 教学维度筛选面（留 Claude Design）。
- **正文全文搜 / 语义兜底**：留 V1。

## PA Follow-Up Decisions

<PA 后填。每条 Must Fix 映射回 pa.md。>

| PA item | `pa.md` required disposition | `plan.md` handling | Status |
| --- | --- | --- | --- |
|  |  |  |  |
