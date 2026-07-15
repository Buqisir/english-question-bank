# PA Review — grammar-facets-v2 (D1) 专节摘录

> **完整报告（含跨刀一致性总节 + E5 专节）在
> `docs/cuts/similar-v2-engine/pa.md`。本刀与 similar-v2-engine 同场审，
> 重点为两刀契约一致性——请以完整报告为准，本页仅摘 D1 相关结论。**

- Reviewer: PA（fresh context）
- 语义基准: `docs/cuts/similar-questions/program.md` §语法填空考点粒度终稿
  （2026-07-15 owner 逐格拍板，不重开）
- Verdict（两刀合一）: **APPROVE WITH MUST FIX（Must Fix 后开工）**

## D1 相关 Must Fix

### MF-1（D1 主责）— 显式收编/退役已上线的 I16·C 谓语 sidecar 子系统
D1 plan 只字未提仓库里**已上线**的 I16·C 谓语时/语/一致子系统：
- 每空 sidecar `grammar-fill-verb-profile-v1.json` 已铺盘（实测在各卷 latest/）；
- teachingFacets 合并 `tenses/voices/agreements` 并暴露过滤参数
  （`server/search/teachingFacets.mjs:136-140/205-225/292-300/379-381`）；
- 活路由 `POST /api/grammar-fill/verb-profiles/backfill`
  （`verbProfileBackfillRoutes.mjs` 挂在 `server/api.mjs:515`）；
- `agreement` 旧定义（主语上下文/AI）与 program.md 新定义（纯 answer 表面
  is/are/has/have/does/三单-s，plan.md:30-32）**语义冲突**，旧值已失效。

D1 必须：定谓语三字段唯一真值位置（推荐折进 analysis-v2，退役 sidecar 路线）→
展开完整 sweep（teachingFacets 合并逻辑 + 过滤参数、sidecar 模块、backfill
service、**活路由下线**、import vp-driver、verify-i16c、盘上 sidecar 文件回滚）→
字段名钉死一个（建议 `agreementSensitive`）→ agreement 按新定义**重算不复用**。

### MF-2（D1×E5 共契约）— 谓语每空读取路径钉死
E5 谓语向量取每空 tense/voice/agreementSensitive。现 `buildRawFacetIndex`
（similarQuestions.mjs:73-132）只走 analysis 文件 `...entry` 透传、**不读 sidecar**，
索引又只有每组聚合 Set。D1 必须保证这三字段落在 analysis-v2 blank 条目里，
E5 才读得到。两份 plan.md 都要写死此读取源。

### MF-3（D1 主责）— 前端 facetKey 文案表 key 重映射的范围与完备性 verify
`grammarFillFacetRegistry.ts` 硬编码退役旧 key（`given.noun`:76、
`given.adjective`:90、`given.derivation.*`:104/118/132/146）。D1 Forbidden
"不动 UI"(:61) 与 sweep "前端 facet 文案表"(:48) 打架。必须：registry 数据表
移出 Forbidden（可改）、UI 组件不动；verify 加"旧 key 零残留(含前端)" +
"v2 每新 key 有 registry 条目"两条，封禁兜底黑洞（DESIGN §7）。

## D1 相关 Should Fix / Consider（详见完整报告）
- **SF-1**: plan 引用的 `verify-similar-engine`（29 断言）不存在，真身
  `verify-similar-questions.mjs`（35 assert）——这条主要影响 E5，但 D1 verify
  入册命名同样应对齐真实脚本。
- **C-1**: 谓语推导可复用已有确定性分类器
  `classifyFiniteVerbFormDeterministic`/`extractFiniteVerbBlanks`
  （`analyzeGrammarFillVerbProfile.mjs`），别从零重写。
- **C-2**: role 七格含现库尚无的 `predicative`（由 role 校正引入）；verify 白名单
  须含全七格。

## D1 事实核对（Notes）
- 33 份 latest 分析文件 = 330 空（实测，与 plan.md:43 一致）。
- 旧桶分布实测吻合 program.md "三乱"：given.adjective 28 / given.noun 22 /
  derivation 四向 41 / verb.finite 52 / non-finite 62。八向重归桶 + 数/格/比较
  剥离的数据基础成立。
- role 现分布 adverbial 26/attributive 17/object 13/subject-complement 3/
  subject 2/object-complement 1（=62）；错档校正（tell sb to do→宾补、
  stays closed→表语）与目标分布对得上，嫌疑名单 ≤20 合理。
- 迁移原子性提醒：analysisConfigs 升 v2（teachingFacets.mjs:51-56）与 33 文件
  重写必须**同刀原子落地**，否则中间态 grammarFill 索引整桶掉线
  （v2 校验拒 v1：similarQuestions.mjs:112 / teachingFacets.mjs:282）。

## Must Fix → Plan Disposition Checklist（D1 部分）
| Must Fix | grammar-facets-v2/plan.md 应记录 |
|---|---|
| MF-1 | 新增"I16·C sidecar 收编/退役"决策段 + 完整 sweep（含活路由下线、字段名统一、agreement 重算、sidecar 文件回滚）；Must Do 步 + Forbidden（禁复用旧 agreement）+ Verify（sidecar 消费面零残留）。|
| MF-2 | 写死"谓语每空三字段唯一读取源 = analysis-v2 blank 条目经 raw-index"。|
| MF-3 | grammarFillFacetRegistry.ts 移出 Forbidden（数据表可改、组件不动）；Verify 加旧 key 零残留 + v2 新 key registry 完备两条。|
