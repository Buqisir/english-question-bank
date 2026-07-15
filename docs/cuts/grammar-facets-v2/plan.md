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
   文案表（E2 cr.md SW 挂账那张）、相关 verify 脚本。
   验证标准：`verify:all` 绿；全站 grep 旧 key 零残留（白名单除外）。
4. **导入门禁**：runbook 硬门禁更新——新导语法填空必须出 v2（显性 tense/
   role/新词表），publisher/analyzer 出口改 v2；负例测试（v1 形态输入被
   拒）。
5. **verify 入册** `verify-grammar-facets-v2.mjs`：330 空 v2 字段完备性、
   词表白名单（未知 key/role/tense 值即红）、分布断言（数~15/格~3/比较~11/
   八向计数对预期表±2 容差）。
6. 生产同步节点：随下次部署停服 apply 带备份（体裁真值 2026-07-13 先例
   流程）。

## Forbidden

- 不动打分引擎（E5 的活）；不动 UI；不动其他题型 analysis schema。
- program.md 已拍板语义（七格/八向/三新类/时语一致定义）不得在实现中
  变形——规则拿不准的空进嫌疑名单找 owner，不自由裁量。

## 收口

- [ ] verify:all + 新 verify 绿 + main CI 绿
- [ ] fresh CR
- [ ] STATUS.md 更新；生产同步后 owner 抽验 chips 文案（随 E6 DP-3 合场）
