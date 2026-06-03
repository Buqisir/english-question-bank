# I16·A Plan — 教学维度检索层（按考点/篇章功能/题型/词性找题，后端，无 UI）

> PA 通过（APPROVE WITH MUST FIX，`pa.md`，premise 验真）。3 Must Fix + 2 PO 决策已折入下文（见 §PA Follow-Up）。

## Cut Size

**medium**。Touches schema/data contract = **no（只读现有解析文件，不改解析生成/契约）**；product boundary（找题/检索）= **yes**。后端纯检索层；**不做 UI**（UI 这一相留给后续 + Claude Design）。全门：PA before DEV、CR-lite、verify-ci、（本 cut 无浏览器面，QA = 查询行为验证，PA 已确认可接受）。

## Objective

把四类解析里**已经结构化、已落盘**的教学考点**索引出来、可被查询**——让"按教学维度找题"成立（owner 的 A）。第一刀只做**搜索逻辑/检索层**：一个后端服务，遍历 paper-assets 的解析文件，把每个题组的教学 facet 聚合成可查询的索引，开放只读查询端点。**深维度按题型分域**：

- **语法填空** → 考点 `facetKey`（16 类）+ `blankType`（有/无提示）+ 非谓语 `role`
- **七选五** → 篇章功能 `roleFacet`（总起/小结/**承上启下 bridge**/衔接）+ `positionFacet` + `primaryMechanismFacet`
- **阅读** → 题型/技能 `skill.primary`（8 类）+ `skill.secondary`
- **完形** → 词性 `pos`（6 类，**可靠主维度**）+ 考点 `signatureFacet`（**稀疏/可选**，真实数据 13/15 空没有；best-effort 次维度）

覆盖 = **仅已解析的题组**（解析线覆盖即找题覆盖，诚实写明；未解析题组**不进索引**，绝不"present-with-empty"）。**主题（B）、被动/语态（C）、难度（假数据）不在本 cut。**

## Why (owner-locked, 2026-06-03)

PM grill 定案：新找题建在 owner 的**教学 taxonomy** 上（按"教什么"找，不按"哪张卷"），而非浅维度（题型/年份/地区 chip）。A/B/C 中 **A 先**——它只索引已有结构化数据、不生成新数据、风险低、自包含；owner 的"七选五承上启下""阅读推理题""非谓语作状语"靠它立刻能跑。UI 不急（留 Claude Design）。详见记忆 `i16-ai-home-find-search-direction`。

## Code Reality (verified — PA 复核为真)

- **解析文件位置**：`resolvePaperAssetReadPaths(paperAssetsDir, paperId)`（`server/paper-import/storage.mjs:23`）→ `baseDir/analyses/<type>-analysis-v1.json`。处理两种磁盘布局（960d0f8d 的 `versions/v1/`、jslk 的裸 paper-dir）。`server/search/paperSurfaceAvailability.mjs:104-130` **已按此套路**遍历 + 读 paper-asset.json + 读 analyses —— 检索层**复用该 walk/entryMapKey/targetGroups 模式**（注意：是**模式复用**，不是函数复用；availability 只判"有没有解析"，不抽 facet 值——SW-1）。
- **facet 容器（PA 在真实数据复核）**：facet 按 **questionId** 存在 dict：grammar `blanks{[qid]:{facetKey,blankType,role,...}}`、seven `questions{[qid]:{roleFacet,positionFacet,primaryMechanismFacet,...}}`、cloze `blanks{[qid]:{pos,signatureFacet?,...}}`、reading `questions{[qid]:{skill:{primary,secondary}}}`。
- **join 到题组**：分析文件 `targetGroups: groupId[]`；**问题→题组** 用 paper-asset.json `content.groups[].questionIds`。PA 复核：reading 15 题 3+4+4+4 干净分到 a/b/c/d，两份真卷**零孤儿**。仍要"questionId 找不到组就跳过不崩"防御。
- **paperId 匹配**：用 `asset.paper.paperId` 去匹配分析文件的 `paperId`（**别假设 = 目录名**，照 `paperSurfaceAvailability.mjs:68,113`）——SW-5。
- **枚举权威（只读，不新增）**：`grammarFillFacetRegistry.ts`（16 leaf）、seven roleFacet 4 值（`prompts/seven-choices-analysis-v1.md:181`，含 `role.bridge`=承上启下）、reading skill 对象式强制（`analyzeReading.mjs:146`，旧 `["detail"]` 数组式已废——只读对象式、其余跳过，SW-3）、cloze `VALID_POS`（`analyzeCloze.mjs:13`；`pos==='other'` 契约上不带 signatureFacet，`analyzeCloze.mjs:209`）。
- **卡片侧**：`QuestionGroupCard` 不带 facet。本 cut 产出**独立只读端点**，**不改卡片契约 / 不动 `/api/question-groups`**（PO 决策 #2 已定，见下）。

## Locked Product Decisions

- **只读解析文件，不碰解析生成 / 契约 / prompt / registry**。
- **深维度按题型分域**；主题/难度跨题型维度**不在本 cut**。
- **聚合到题组级（distinct 并集）**：题组 facet = 该组所有题/空的 distinct facet 并集（"该组有空考承上启下" ⇒ 命中）。PA 确认这是**找题的正确粒度**（你拼的是题组，不是单个空）；题/空级下钻是未来 UI 的事，不是契约，不在本 cut。
- **`signatureFacet` 可选/稀疏**：`pos` 是可靠的完形主维度；`signatureFacet` 缺失时**跳过**（不崩、不造合成值；含 `pos==='other'` 无 signature 的情形）。（MF-1）
- **覆盖只含已解析题组**：未解析题组**不出现在索引里**（绝不 present-with-empty）；查询结果**不暗示自己没有的覆盖**。响应带一个 `coverage: 'analyzed-only'` 标记，给未来 UI 区分"没解析"vs"真没有"。（MF-2 + PO 决策 #1：**带标记**）
- **独立只读端点 `GET /api/teaching-facets`**（PO 决策 #2：**独立端点**，不附挂 `/api/question-groups`）——facet 索引是磁盘来源、按 groupId 键，未来 UI 按 groupId 与 DB 卡片 client-side join，不污染卡片契约。
- **内存聚合 + 稳定查询接口**（资源意识；规模大再换索引/DB，接口不变）。**不为 B 预留 cross-type filter 槽**——bibliographic 维度（年/地区/来源/难度）在 DB 卡片、同 groupId，消费端按 groupId join 即可；契约保持最小、避免投机泛化（PA 复核，锁为非决策）。
- **无 UI**：本 cut 不出前端面；产出供后续找题面消费。

## Must Do（TDD：纯函数先写 verifier 断言→实现到绿）

### Step 1 — 纯函数：单文件 facet 提取（每类一个 extractor）
- 新建 `server/search/teachingFacets.mjs`：`extractGroupFacets(analysisType, analysisJson, questionToGroup)` → `Map<groupId, { facetKeys, blankTypes, roles, roleFacets, positionFacets, mechanismFacets, skills, secondarySkills, pos, signatureFacets }>`（按类型只填该类字段，distinct set）。
- **容差（MF-1 / SW-3 / SW-5）**：`signatureFacet` 缺失 → 跳过该字段不报错；reading `skill` 只读对象式 `{primary,secondary}`，非对象/旧数组式跳过；`questionId` 在 `questionToGroup` 里找不到 → 跳过该条不崩。
- Verification（Step 4 verifier）：真实 960d0f8d 四类——七选五组 `roleFacets` 含 `cohesion` 且含 `bridge`；语法组 `facetKeys` >1 含 `...non-finite` 与 `...coordinating`、`roles` 捕到非空 `object`；cloze 组 `pos` 含 noun/verb/adj/adv **且对 13 个无 signatureFacet 的空不报错**；reading a/b/c/d 各自 `skill.primary` 正确归位（15 题 3+4+4+4 无孤儿、不重复计）。

### Step 2 — 聚合服务：遍历 paper-assets 建题组级教学索引
- 在 `server/search/teachingFacets.mjs` 加 `createTeachingFacetIndex({ paperAssetsDir })`（仿 `paperSurfaceAvailability`：`readdirSync` + `resolvePaperAssetReadPaths` + 读 paper-asset.json 建 `questionId→groupId` + 用 `asset.paper.paperId` 匹配读各 analyses 文件调 Step 1）→ `Map<groupId, GroupTeachingFacets>` + `invalidate()`。**保留 groupType 守卫**（防跨题型错绑，SW-1）。
- **只含已解析题组**：某题组在 `content.groups` 存在但磁盘无对应解析文件 → **不进索引**（MF-2）。
- Verification：跑真实 paper-assets → 已解析题组有 facet；`paper-2024-jslk-english` 的 grammar-fill/cloze 组（content 有、解析文件无）**不在索引里**；缓存命中。

### Step 3 — 只读端点 + 失效钩子（MF-3）
- 新增 `createTeachingFacetRoutes()` 路由工厂，加进 `serverRoutes` 组合（`api.mjs:419` 是工厂数组**组合**，不是往字面量里 push）；端点 `GET /api/teaching-facets` 返回 `{ coverage: 'analyzed-only', groups: { [groupId]: GroupTeachingFacets } }`。
- `queryGroupsByTeaching(index, filters)`：`filters` 按题型分域、可多值（`{ groupType?, facetKey?, roleFacet?, skill?, pos?, ... }`），返回命中 `groupId[]` + 每组 facet 摘要；空 filter 返回全部已解析组。
- **lazy-cache + invalidate 包装**：仿 `api.mjs:46,262-267` 的 `paperSurfaceAnalysisAvailability` 包装，挂到**同一条 import/publish 失效路径**（已调 `paperSurfaceAnalysisAvailability.invalidate()` 的地方一并调本索引 invalidate），免得重导后供陈旧 facet。
- Verification：查询 `roleFacet=bridge` 返回七选五组；`pos=noun` 返回完形组；多维 AND 收窄；未解析组永不出现；空 filter 返回全部已解析组；端点可达（路由表存在或最小请求 smoke）；`invalidate()` 清缓存。

### Step 4 — Verifier + CI
- 新建 `scripts/verify-i16a-teaching-dimension-search.mjs`（node/tsx import 模块 + 真实样本），断言覆盖 PA Static Verify 清单 1–7（Step 1–3 各 Verification + MF-1/MF-2/MF-3 专项 + reading 多组 join 无孤儿/不重复）。
- 注册进 `scripts/verify-ci.mjs`（追加脚本路径到扁平数组 ~`:15`）；更新 `scripts/README.md`。
- Verification：`node scripts/verify-i16a-teaching-dimension-search.mjs` 绿；`verify-ci.mjs` 绿；不回归 `verify-h1d-analysis-availability` 与 paper-surface verifiers。

## Forbidden

- **不碰解析生成/契约**：`server/paper-import-ai/analyze*.mjs`、`prompts/*-analysis-v1.md`、`*.contract.md`、`grammarFillFacetRegistry.ts`、schema —— 只读。
- **不做主题（B）/ 被动语态（C）/ 难度筛选**。
- **不做 UI / 前端**（除非 PA 后续判定需在 `domain/questionBank.ts` 加只读可选 facet 类型，且仅类型、不改取数）。
- **不改 `QuestionGroupCard` 核心字段 / `/api/question-groups` 既有形状**（facet 走独立端点）。
- **不碰既有 server search / steward / concierge**。
- 不提交 `app/public/paper-assets/**` / `.claude/launch.json`；禁止 `git add -A`，显式 stage。
- **不为 B 预留 cross-type filter 槽**（避免投机泛化）。

## Suggested Files

- `server/search/teachingFacets.mjs`（新：extractor + 聚合 index + 查询）
- `server/api.mjs`（`createTeachingFacetRoutes()` 工厂注册 + lazy-cache/invalidate 包装 + 接到既有失效路径）
- `scripts/verify-i16a-teaching-dimension-search.mjs`（新）+ `scripts/verify-ci.mjs` + `scripts/README.md`
- （可选，仅类型）`app/src/domain/questionBank.ts`

## Verification

- 定向：`node scripts/verify-i16a-teaching-dimension-search.mjs`、`git diff --check`。
- 全门：`node scripts/verify-ci.mjs`、`npm run build --prefix app`。
- 无浏览器面；查询行为由 verifier 覆盖（PA 确认可接受）。

## DEV Readiness

- 本 plan（含 PA Must Fix）committed → **DEV 可开始**。DEV 用 **TDD**：Step 1–3 纯逻辑先在 verifier 写断言→实现到绿。
- CR-lite（fresh Opus）写 `cr.md`；注意 SW-2（与 `listPaperAssetAnalysisGroupCards`，`api.mjs:1301` 的 walk 重复，给 CR 看别 drift）。

## Out of Scope（后续）

- **B — 主题维度**：接通三大主题语境→主题群→主题（被 `94950a1` 砍掉的自动入库管道；前置先搞清为何砍）。
- **C — 被动/语态**：给语法解析补结构化 voice 维度。
- **难度维度**：需先给导题补真实难度评估。
- **找题 UI**：默认题库视图 + 教学维度筛选面（留 Claude Design）。
- **正文全文搜 / 语义兜底**：留 V1。

## PA Follow-Up Decisions

PA verdict: **APPROVE WITH MUST FIX**（`pa.md`，premise 验真）。3 Must Fix 全部折入；2 PO 决策按 PA 工程建议拍定（均为内部技术决策，无产品判断，按 owner 分工由 Claude 定）。

| PA item | `pa.md` 处置 | `plan.md` handling | Status |
| --- | --- | --- | --- |
| MF-1 `signatureFacet` 稀疏 | optional/sparse，`pos` 主维度，extractor 缺失即跳过（含 `pos==='other'`）；verifier 断言 | Objective 完形行软化 + Locked decision + Step 1 容差 + Step 4 断言 | Closed |
| MF-2 覆盖诚实 | 仅已解析组进索引，绝不 present-with-empty；带 `coverage` 标记；verifier：jslk grammar/cloze 组缺席 | Locked decision + Step 2 + Step 4 断言 | Closed |
| MF-3 路由 seam + 失效 | 经路由工厂注册（非 `:419` 字面 push）+ lazy-cache `invalidate()` 仿 `:262-267` 接既有失效路径 + 端点可达断言 | Step 3 重写 | Closed |
| PO #1 coverage 标记 | PA 荐带 | **带** `coverage:'analyzed-only'`（Locked decision + Step 3 端点响应） | Closed |
| PO #2 端点 vs 附挂 | PA 荐独立端点 | **独立** `GET /api/teaching-facets`（Locked decision + Step 3 + Forbidden 保卡片契约） | Closed |

PA 已替我解掉的 ask（无需 PO）：①题组级 distinct 并集 = 正确找题粒度；②reading 多组 join 真实零孤儿（仍留防御）；⑤不为 B 预留 cross-type 槽（锁为非决策）。
