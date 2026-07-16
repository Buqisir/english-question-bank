# CR — grammar-facets-v2 (D1)

- Reviewer: CR（fresh context, formal 契约面刀, PA 判"不降档"）
- Range: `git diff 030310d..297d43d`（段1 cddb103 + checkpoint 5d4d43a + 收口 297d43d）
- Verdict: **MERGE（APPROVE, 0 Must Fix）**

## Changed Scope（核对 = plan 允许集 + PA 压稿）

- 33 份 `grammar-fill-analysis-v1.json` 原地重写为 `schemaVersion: grammar-fill-analysis-v2`，各带 `.bak`（实测 33 analysis + 11 sidecar .bak，回滚集完备）。
- v2 registry `server/paper-import-ai/grammar-fill-facets-v2.json`（22 叶）新增；analyzeGrammarFill 切换指向 + `stampVerbAxes` 服务端推导。
- I16·C sidecar 子系统退役：`verbProfileSidecar/BackfillService/BackfillRoutes/backfillVerbProfiles.mjs`、`vp-driver.mjs`、`verify-i16c-*.mjs` 删除；`api.mjs` 装配移除；`teachingFacets.mjs` `mergeVerbProfileAxes` 删除，三轴改从 v2 blank 直读；盘上 11 份 sidecar 删除（带 .bak）。
- 前端：`grammarFillFacetRegistry.ts` 数据表重映射 + `grammarFillAnalysisSurfaceAdapter.ts` schemaVersion 契约升 v2（UI 组件未动，MF-3 边界守住）。
- 门禁：`validator.mjs` allow-list v1→v2、`packageBuilder.mjs` 出口升 v2。
- verify：新 `verify-grammar-facets-v2.mjs`（67 断言）入册 verify-ci + README；`verify-i13/i14/i4/i1` 字面量升 v2。
- 无 scope drift，Forbidden（打分引擎/其他题型 schema/UI 组件/复用旧 agreement 值）均未触碰。

## Findings

### Must Fix
无。

### Should Watch（均不阻塞本刀）

1. **退役路由负例仅源码围栏，非活服 404 探针。** `verify-grammar-facets-v2.mjs:316` 断言路由串在 `api.mjs` 源码中缺席；`verify-owner-gate.mjs:136` 注释写"asserts the path now 404s"属**措辞过度**（实际断言的是源码缺席，非运行时 404）。**独立判断：对一次彻底删除足够**——import 删除 + 4 个模块文件删除 + 装配删除 + `Req 6` 断言文件不存在，Express 无匹配路由时按构造返回 404，无 catch-all 兜底。不构成 Must Fix，但 owner-gate 注释建议改为"路由已从装配移除，路径不再存在"以免误导。

2. **谓语推导三份副本。** 两份 **live** 副本（migrate 脚本 `deriveVerbAxes`/`deriveNonFiniteForm` vs `analyzeGrammarFill.mjs stampVerbAxes`）我逐行比对**逻辑一致**（仅 migrate 多一个 `method` 字段 + `VALID_TENSE.has` 显式守卫，等价）。第三份 `analyzeGrammarFillVerbProfile.mjs` 在 sidecar 退役后**零 live 调用者**（grep 确认），留仓未删（plan 未点名退役）。建议后续小刀：两 live 副本收拢到单一共享模块；死文件 `analyzeGrammarFillVerbProfile.mjs` 明确退役或标注。已在 cut-note 披露，非阻塞。

3. **`stampVerbAxes`（新导入路径）无专门行为测试。** verify 覆盖的是 33 份 migrate 产出 + validator 负例；**无测试**把一份新 grammar-fill 导入喂过 `analyzeGrammarFill.mjs` 并断言 tense/voice/agreementSensitive/form 被正确 stamp。是 owner 已验证逻辑的逐字副本，风险低，但这是生产导入路径、目前仅靠代码检视证实。下次触碰导入路径时补一条端到端断言。

4. **死 v1 registry 文件留盘。** `server/paper-import-ai/grammar-fill-facets-v1.json` 未删（verify Req 4 allowlist）。grep 确认零 live importer（analyzeGrammarFill 已切 v2）。作历史留存可接受；未来 agent 误接的低风险。

5. **cosmetic 悬挂文档引用已删除的 `vp-driver.mjs`：** `scripts/import-pipeline/README.md:57` 仍把 `vp-driver.mjs list|persist` 列为可用 driver 命令，`writing-analysis-driver.mjs:2` 注释亦引用。README 那条可能误导未来导入 agent 调一个不存在的命令，建议一行清理。非阻塞。

6. **`migration-map.md` 未创建。** plan §契约要求"迁移映射表入 migration-map.md 同目录"，该命名文件不存在；映射内容散落在 migrate 脚本内联（`DERIVATION_RENAME_MAP` + 分类函数）+ `step1-samples.md`/`suspects.md`（owner 已验）。内容在、命名 artifact 缺，纯文档 gap。

7. **分布断言用 ±2 容差**（facet/role 计数对 step1 基线 ±2）。单个漏改的错档未必触发红（如 object-complement 基线 3、±2 → 1~5 全绿）。我已独立核实 8 条 owner 改判**逐条精确落库**（下方证据），本刀无虞；容差是通用软点，符合 program.md"预留位置如实说"，非阻塞。

## Verification Evidence（自跑，未采信 DEV 报数）

- `node scripts/verify-grammar-facets-v2.mjs` → **67 passed / 0 failed**（自跑）。断言实质：`Req 7` 起真实 `createTeachingFacetIndex` + `queryGroupsByTeaching` 建索引跑过滤，钉住 tense/voice 直读 v2 blank、agreementSensitive→string `"true"`/`"false"` 新值域、`?tense=/?voice=/?agreement=` 参数名不变、`agreement=false` 正确排除 true-only fixture；`Req 8` 调真实 `validatePaperImportPackage`，v1 形态命中 `json.schemaVersionUnknown`（负例真会红）。非 regex-a-string。
- `pnpm -C app run verify:all` → **78 pass / 1 skip / 0 fail**（自跑，exit 0）。唯一 skip = `verify-i16a-teaching-dimension-search.mjs`（off-repo fixture 缺失，早前 fixture-move 刀所致，**非本刀引入**）；i16a 关注的过滤参数契约已由 `Req 7` 行为测试覆盖，skip 不留空窗。
- `npx tsc -b` → **0 errors**（自跑）。
- **8 条 owner 改判逐条核实落库**（直读数据，非依赖 ±2 容差）：accuracy/richness/visibility/absence → `given.conversion.adjective-to-noun`；photographer → `noun-to-noun`；closed → role `predicative`+form `done`；to do / to finish → role `object-complement`+form `to-do`。**无多无漏**。
- 全仓 grep：`verbProfile*`/`vp-driver`/`mergeVerbProfileAxes` 无 live 引用（仅 verify 断言串 + 2 处 cosmetic 文档注释）；旧 key `given.noun`/`given.adjective`/`given.derivation.*` 仅存在于 .bak / 历史 docs / allowlisted v1.json / prompt 负例句 —— live 代码零残留。
- `similarQuestions.mjs`（E5 边界）：verify `Req 4` 双断言（allowlist 永不含 similarQuestions + 该文件本身零旧 key），源码确认干净。

## Failure / Attack Angle

- **最可能的隐患不在本刀的 33 份数据，而在新导入路径**：`stampVerbAxes` 若未来被改动而与 migrate 副本漂移，本刀 verify（只跑 33 份既有产出）**不会红**——它不喂新导入。防线只有"两副本逐字相同"这个当前事实 + cut-note 的收拢提醒。若 E6/后续导入刀改了任一副本又没同步，会静默产出不一致的谓语字段。→ Should Watch #2/#3。
- **误导性绿的排查**：verify-grammar-facets-v2 直接读盘上 33 份真实文件（非 fixture）跑完备/白名单/分布，且 `Req 7`/`Req 8` 用真模块——不是 branch-local 假绿。i16a 的 skip 已单独核实为 pre-existing 且被 Req 7 覆盖，不是本刀藏雷。
- **stale fallback**：死 v1 registry + 死 `analyzeGrammarFillVerbProfile.mjs` 留仓，均已确认零 live 调用，不构成可达旧路径；但留仓是未来误接面（Should Watch #2/#4）。

## Self-Review Blind Spots（喂后续 Big CR / E5 CR 先看这里）

- 我**未独立逐条重演** 52 finite / 62 non-finite 的谓语推导教学正确性（如 "has done"→present-perfect + agreementSensitive=true 是否对全部 finite 空成立）。我只证实了两 live 副本逻辑一致 + owner 对 step1-samples.md 抽验，语义正确性依赖 owner 步1裁点，非我的独立重导。
- 我**未逐空审全部 330 空**；靠 verify 的 330 完备/白名单/分布 + 抽验 8 疑点。一个非疑点空可能携带白名单内但语义微错的 tense/voice 而蒙混过关。
- MF-2 读取路径仅由 verify `Req 7` 的 teachingFacets fixture 证实，**未跑端到端 `/api/similar-questions` v2 分支**（那是 E5 的活）——E5 CR 应在真数据上验证谓语向量确实从 v2 blank 读到三字段。

## Residual Risk

低。契约面（schema v2 + registry + sidecar 退役 + 门禁）落地忠实、原子、可回滚；verify 行为化且入 CI；owner 8 改判精确落库；全суite + tsc 绿。残余风险集中在"新导入路径的推导副本漂移"（无测试守）与"三份副本/死文件的仓库卫生"，均为后续小刀挂账，不阻塞本刀合入。

## Recommendation

**MERGE（APPROVE）。** 无 Must Fix。合入后：主代理收口清理 `.claude/contract-unlock` marker（cut-note 项3，非 CR 动作）；Should Watch #2/#3/#5/#6 建议并入后续 import/consolidation 小刀，不纳入本刀 scope。
