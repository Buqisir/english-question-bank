# grammar-facets-v2（D1：语法填空解析字段 v2——词表重铸 + 推导回填）

- cut size: **medium**；契约面：**analysis schema v2 + facetKey registry**
  → formal PA 不降档（与 similar-v2-engine 同场 PA，重点审两刀契约一致性）。
- 语义拍板全在 `docs/cuts/similar-questions/program.md` §语法填空考点粒度
  终稿 + §配方 v2（2026-07-15 owner 逐格拍板，**不得重开**）。本 plan 只
  做工程化落地。
- 定位：**纯推导/规则刀，零人工标注**。owner 出场一次（抽验判例，见步 2）。

## 契约：grammar-fill-analysis v1 → v2

- `schemaVersion` 升 `grammar-fill-analysis-v2`；`server/search/teachingFacets.mjs`
  `analysisConfigs` 同步升版（walker 认 v2 拒 v1，防新旧混读）。
- **facetKey registry v2**（老师粒度，program.md 终稿）：

  | v2 类 | 说明 | 预期空数 |
  |---|---|---|
  | `given.verb.finite` | 保留；条目新增字段 `tense` / `voice` / `agreementSensitive` | 52 |
  | `given.verb.non-finite` | 保留；`role` 词表归一七格：`adverbial/attributive/subject/object/predicative/object-complement/subject-complement` | 62 |
  | `given.conversion.<src>-to-<dst>` | 词形转换八向，方向名全称：`noun-to-noun/noun-to-adjective/noun-to-verb/adjective-to-adverb/adjective-to-noun/verb-to-adjective/verb-to-noun/verb-to-adverb`（旧 `derivation.*` 四向迁入，旧名 `noun-to-adj` 等缩写废止） | ~60 |
  | `given.noun.number` | 名词的数（单复数），新立 | ~15 |
  | `given.noun.genitive` | 名词的格（所有格），新立 | ~3 |
  | `given.adjective.comparison` | 形容词比较等级（比较级/最高级），新立 | ~11 |
  | `no-hint.*` 各类 | 介词/冠词/连词/代词等，原样保留 | 不变 |

- 旧 `given.noun` / `given.adjective` / `given.derivation.*` 拆迁后**退役**；
  迁移映射表（old key → new key 判定规则）入 `migration-map.md` 同目录。
- **谓语新字段推导规则**（answer 形态确定性解析）：
  `tense`（一般现在/一般过去/现在完成/过去完成/进行体/将来 等枚举）、
  `voice`（active/passive：be 族+过去分词）、
  `agreementSensitive`（bool：answer 表面含 is/am/are/was/were/has/have/does/
  三单-s——owner 定义 2026-07-15）。
- **非谓语形态字段** `form`（to-do/doing/done，answer 推导）——只进 chip
  文案不进匹配（program.md：形态降级当解释）。

## I16·C 谓语 sidecar 收编/退役（PA MF-1/MF-2 压稿 2026-07-15）

仓库已有**上线中**的 I16·C 谓语时/语/一致子系统（每空 sidecar
`grammar-fill-verb-profile-v1.json` + teachingFacets 合并 + 活路由），与本刀
"显性化谓语三字段"讲的是同一份数据。处置拍板：

- **唯一真值**：谓语三字段折进 `grammar-fill-analysis-v2` 每空 blank 条目，
  **sidecar 路线本刀退役**。消费方读取路径唯一：analysis-v2 blank 条目经
  `buildRawFacetIndex` 的 `...entry` 透传（similarQuestions.mjs:122）——E5
  谓语向量按此读、按此造 fixture（两份 plan 同锁，MF-2）。
- **字段名钉死**：`agreementSensitive`（bool，answer 表面定义）。sidecar 的
  `agreement`（string，旧 subject-context/AI 定义）与索引聚合名 `agreements`
  随 sidecar 退役；`teachingFacets.mjs` 聚合改从 analysis-v2 blank 条目取
  三字段，**对外 tense/voice/agreement 过滤参数名与 i16a 契约行为不变**
  （agreement 轴值域随新定义，verify 显式断言新值域）。
- **I16·C sweep 清单**（并入步 3 消费方 sweep，缺一不收口）：
  `teachingFacets.mjs` mergeVerbProfileAxes 及三轴过滤内部改源、
  `verbProfileSidecar.mjs`、`verbProfileBackfillService.mjs`、
  `verbProfileBackfillRoutes.mjs`（活路由 `POST /api/grammar-fill/
  verb-profiles/backfill` **下线**，`server/api.mjs:515` 装配移除，负例测
  404）、`scripts/import-pipeline/vp-driver.mjs`、
  `verify-i16c-grammar-verb-axes.mjs`（断言迁移/退役逐条处置入 cut-note）、
  盘上各卷 sidecar 文件清理（带备份，回滚路径与 33 份分析文件同批）。
- **复用指针**（PA C-1）：三字段推导不从零写——改造
  `analyzeGrammarFillVerbProfile.mjs` 的
  `classifyFiniteVerbFormDeterministic` / `extractFiniteVerbBlanks`
  （agreement 换新定义重算）。

## 步骤

1. **推导+归桶脚本** `scripts/grammar-facets-v2-migrate.mjs`：
   后缀规则归八向 + 数/格/比较等级剥离 + 谓语三字段推导 + 非谓语 form。
   同时输出**嫌疑名单**：(a) reason 文本与标签冲突（已知 3 例：tell sb to
   do / wait for sth to do 标 object 应为宾补；stays closed 标主补应为
   表语）；(b) 规则无法判定的空。
   验证标准：脚本幂等；330 空全覆盖零遗漏；嫌疑名单 ≤20 条。
2. **裁点（owner 抽验）**：嫌疑名单 + 每个新类随机 3 例，owner 过目判例。
   通过前不落库。
3. **落库迁移**：33 份分析文件重写为 v2（带 `.bak` 备份）；**消费方 sweep**：
   `analysisConfigs`、similar 引擎 facetKey 常量、i16a filter 值、前端 facet
   文案表（E2 cr.md SW 挂账那张）、相关 verify 脚本、**I16·C sweep 清单
   全项（见上节）**。`analysisConfigs` 升 v2 与 33 份文件重写必须**同一提交
   原子落地**——v2 校验拒 v1（teachingFacets.mjs:282 / similarQuestions.mjs:112），
   分步落会让 grammarFill 索引整桶掉线（PA DEV-readiness）。
   验证标准：`verify:all` 绿；全站 grep 旧 key 零残留（白名单除外）。
4. **导入门禁**：runbook 硬门禁更新——新导语法填空必须出 v2（显性 tense/
   role/新词表），publisher/analyzer 出口改 v2；负例测试（v1 形态输入被
   拒）。
5. **verify 入册** `verify-grammar-facets-v2.mjs`：330 空 v2 字段完备性、
   词表白名单（未知 key/role/tense 值即红）、分布断言（数~15/格~3/比较~11/
   八向计数对预期表±2 容差）；**PA MF-3 两条**：全站旧 key 零残留**含前端**；
   v2 每个新 key 在 `grammarFillFacetRegistry.ts` 有条目（否则红，封禁兜底
   黑洞）；**PA MF-1 一条**：旧 sidecar 消费面零残留（文件/路由/合并逻辑）。
6. 生产同步节点：随下次部署停服 apply 带备份（体裁真值 2026-07-13 先例
   流程）。

## Forbidden

- 不动打分引擎（E5 的活）；不动 UI——**例外**（PA MF-3）：
  `grammarFillFacetRegistry.ts` 的**数据表（key→文案）在 scope 内**随 key
  重映射同步改，UI 组件不动；不动其他题型 analysis schema。
- **禁止复用 sidecar 现存 `agreement` 值**（旧 subject-context/AI 定义，
  按 owner 2026-07-15 新定义已失效）——一律重算（PA MF-1）。
- program.md 已拍板语义（七格/八向/三新类/时语一致定义）不得在实现中
  变形——规则拿不准的空进嫌疑名单找 owner，不自由裁量。

## 收口

- [ ] verify:all + 新 verify 绿 + main CI 绿
- [ ] fresh CR
- [ ] STATUS.md 更新；生产同步后 owner 抽验 chips 文案（随 E6 DP-3 合场）
