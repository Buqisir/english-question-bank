# 确定模块化试卷标准与机器权威结构

Status: closed
Type: grilling
Claim: claimed
Blocked by: 审计现有试卷标准的权威、缺口与矛盾; 盘点全库 latest 资产与所有生产消费变体
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/04-source-capture-normalization-ledger.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

Given the authority audit and real-asset census, what exact modular authority graph should replace today's overlapping documents and hard-coded rulings? Decide the single human-readable index, the versioned executable profile/rule artifacts, their schema and verification relationship, change-approval discipline, and which facts belong exclusively to core invariants, format profiles, per-family canonical contracts, normalization rules, source-format adapters, or renderer typography. The answer must prevent a document and implementation from silently becoming two independent standards.

## Resolution

### 决议

采用“**一个人类索引 + 一个机器根 manifest + 六个互斥事实所有者**”的权威图。
`docs/product/exam-paper-format-standards.md` 保留现有稳定入口，但改造成唯一
human-readable index；所有可改变 admission、canonical 语义、卷型结构或 renderer
结果的具体值，只能存在于由机器根 manifest 引用的版本化 executable artifact
中。索引解释术语、所有权、当前版本、证据和变更流程，但不得复制 profile
题号/分值、family cardinality、normalization 条件或 typography 数值。

机器根入口固定为：

```text
standards/paper-canonical/manifest-v1.json
```

它是 compiler、validator、migration、Screen、Print/PDF、DOCX 和 CI 唯一允许
解析的标准入口。任何 caller 都不得分别读取产品文档、旧 runbook、私有常量或
另一份“等价”配置来重建标准。manifest 以稳定 id、显式 version、相对路径和
sha256 引用以下 artifact；canonical compilation 的输出同时记录 manifest
id/version/digest，保证一次编译使用的是同一闭包而不是“各取最新”：

```text
standards/paper-canonical/
  manifest-v1.json
  core/core-invariants-v1.json
  profiles/nck1-v1.json
  profiles/zhejiang-legacy-v1.json
  profiles/national-legacy-v1.json
  families/<family>-v1.json
  normalization/normalization-rules-v1.json
  rendering/paper-typography-v1.json

schemas/paper-canonical/
  standard-manifest-v1.schema.json
  core-invariants-v1.schema.json
  paper-format-profile-v1.schema.json
  canonical-paper-plan-v1.schema.json
  canonical-question-group-v1.schema.json
  normalization-rules-v1.schema.json
  normalization-report-v1.schema.json
  renderer-typography-v1.schema.json
```

`families/` 至少按当前 scope 独立注册 reading、seven-choices、cloze、
grammar-fill、application-writing、continuation-writing；listening 在本 initiative
只由 plan/profile 表达 `raw/inactive`，不伪造 active Canonical Question Group。
表格、图片等 rich content 是共享 group envelope 的一等节点，不另建 source
或 renderer 私有语义。

JSON artifact 是可读、可 schema 验证、可由通用编译器消费的规则数据。
需要算法的规则实现放在 `shared/paper-canonical/` 的纯模块中，并由 manifest
中的稳定 rule id/version 选中；具体外部 interface 留给
[设计 canonical compilation 深模块接口](05-canonical-compilation-module-interface.md)，
Source Capture 和 transformation record 的字段留给
[定义 Source Capture 与清洗留痕合同](04-source-capture-normalization-ledger.md)。
本票只锁权威和所有权，不提前锁后继票的字段级 shape 或算法。

### 权威图

```text
docs/product/exam-paper-format-standards.md
  └─ human index; points to exactly one current manifest
       ↓
standards/paper-canonical/manifest-v1.json
  ├─ core invariants
  ├─ exact Paper Format Profile versions
  ├─ exact per-family Canonical Contract versions
  ├─ exact Normalization Rule Set version
  └─ exact Renderer Typography Rule Set version
       ↓
schemas + semantic conformance verifier
       ↓
canonical compiler
  ├─ Canonical Paper Plan
  ├─ Canonical Question Groups
  └─ Normalization Report
       ↓
Screen | Print/PDF | DOCX
```

Source-format adapters 只把不同 dialect 投射到 immutable Source Capture；
它们位于 compiler 内部 seam，不能成为第七套标准。Analysis 在图外作为
supplement 关联 canonical identity，不能构造 passage、Question、Option、answer、
slot、numbering、scoring 或 renderer layout。

### 六个互斥事实所有者

| Owner | 独占事实 | 明确不拥有 |
| --- | --- | --- |
| **Core Invariants** | immutable/source-traceable；同一次编译固定一个 manifest closure；deterministic 或 `needs_review`；一个 Plan 使用一个明确版本 Profile；Plan 只链接 Group；每组使用一个 family contract；canonical identity、provenance、fingerprint/digest 规则；Analysis 非答案/非语义权威；tables/figures 为 first-class content；未知版本/不完整闭包 fail closed | 具体卷型题号分值、family cardinality、源格式语法、清洗步骤、字体分页 |
| **Paper Format Profile** | 合法卷型的 parts、sections、slot 顺序；slot required/optional/inactive；题号区间、分值、标准 instruction、answer region；允许的 family slot 与整卷 completeness；NCK1/Zhejiang legacy/national legacy 的差异 | passage/question/answer 内容；marker dialect；normalization；字体、物理尺寸、分页 |
| **Per-family Canonical Contract** | 共享 group envelope 下该 family 的语义 variant、cardinality、identity/reference 与 answer shape；例如 Seven Choices 一组唯一 A–G bank + 五个 blank reference，writing group 零 Question + Writing Task，reading 的 paragraph/question/option/rich-content 关系 | 全卷 slot/题号/分值；DOCX/PDF marker；清洗算法；A–D 4/2/1 layout；Analysis |
| **Normalization Rules** | 具稳定 ruleId/version 的确定性 source-to-canonical transformation、适用前置条件、允许输出、diagnostic/`needs_review` 后果，以及规则顺序/冲突纪律 | source bytes mutation；profile/family 语义新发明；renderer 布局；特定 DOCX/PDF parser 细节 |
| **Source-format Adapters** | DOCX、PDF、image、legacy `paper-asset-v1` 等 dialect 的 syntax extraction、source span/provenance、原始顺序与附件关联；只产生 Source Capture observation | 决定正确答案、洗成某个 profile、删除歧义、生成 canonical family 语义、排版 |
| **Renderer Typography** | 字体、字号、物理尺寸、indent/gutter、分页与 answer-space 规则；共享 A–D whole-set densest-fit selector 及 Screen/Print/PDF/DOCX 的同规则投影 | passage/question/answer、bank ownership、题号分值、normalization；layout selection 不写回 Canonical Question Group |

一个事实只能有一个 owner。跨层引用使用 id/version，不复制值。例如 Plan 引用
`profileId/profileVersion`，Group 引用 `familyContractId/version`，Normalization
Report 记录 adapter/rule ids；renderer 接收 canonical content 与 typography
ruleset，不从字符阈值、CSS auto-flow 或 family 名称私自推导另一套规则。

### Schema 与 verification 的关系

1. JSON Schema 只负责 artifact 与 compilation output 的封闭 shape、enum、
   required field 和引用格式；所有标准 schema 使用 `additionalProperties:
   false`，未知版本和未知字段直接失败，不再 strip-and-publish。
2. 跨 artifact 的引用闭合、版本兼容、sha256、唯一 owner、profile slot 与
   family contract 的一致性由一个 semantic conformance verifier 负责；schema
   valid 不等于 standard conformant。
3. Normalization rule、family invariant 和 renderer algorithm 必须各有提交到
   repo 的正例、反例、边界 fixture。fixture 通过 machine manifest 调用真实纯
   interface；不得用 source-regex 或“类名存在”代替行为证明，缺 fixture 不得
   `SKIP` 后算 PASS。
4. 新的统一 gate 固定进入 `scripts/verify-ci.mjs`，并在
   `standards/paper-canonical/**`、`schemas/paper-canonical/**`、
   `shared/paper-canonical/**` 或唯一 human index 变化时运行。它至少证明：
   index 只指向一个 current manifest；manifest 闭包和 digest 完整；全部 artifact
   过 schema 与 semantic conformance；compile output 重跑稳定；受影响 family
   的 Screen、Print/PDF、DOCX 从同一 canonical fixture 和同一 ruleset 得到
   语义 parity。DOCX/PDF 的视觉/物理规则使用实际产物检查，不以 HTML 单面代替。
5. consumer 只验证公开 seam 的结果。任何 consumer 重新解释 source marker、
   shared option bank、profile scoring 或 family completeness，统一 gate 必须失败。

### 变更与批准纪律

- 已被 published Plan/Group/Report 引用的 artifact **不可原位修改**。任何影响
  admission、语义、题号/分值、normalization 或渲染结果的变化都新增 artifact
  version；旧版本继续可解析。纯索引措辞澄清只有在不改变 executable fact 时
  才能原位编辑。
- 一次标准变更必须是一个原子 change set：owner 明确批准的 decision、版本化
  artifact、对应 schema/validator、affected fixtures、兼容/迁移说明、受影响
  public-seam proof 和 manifest 升版。缺任一项不得把新 manifest 标为 current。
- root manifest 只在整套闭包通过后升版；Plan/Group/Report 不允许使用 manifest
  之外的 profile、family 或 rule “latest”。编译遇到未知、缺失、digest mismatch
  或组合不兼容时统一 fail closed。
- 这些文件属于 schema/data-contract、PaperSurface/print/export 高风险面：
  实现阶段必须经过独立 `$code-review` lineage；用户可见 typography 还必须有
  real-browser、actual PDF/DOCX 与 owner QA。CI 不得再因 docs-only path 跳过唯一
  index 与 executable standard 的一致性 gate。

### 既有权威的降级与迁移

- `docs/product/nck1-paper-standard.md` 降为 NCK1 profile 的说明与历史依据，
  不再声称所有真实卷都洗成同一结构。
- `docs/product/paper-asset-v1.md` 保留为 legacy source/package contract，
  供 adapter 与迁移读取；它不再定义 canonical Plan/Group。
- `docs/import/agent-runbook.md` 只拥有操作顺序和人工步骤，所有 admission 与
  format 事实必须链接 manifest/artifact。
- `server/paper-import-ai/packageBuilder.mjs` 中三套私有 profile、
  source-specific splitter/ruling，以及 Screen/Print/DOCX 的 fixed-grid、
  length-threshold、inline spacing 都必须在各自后继实现票中改为消费上述唯一
  authority；在 consumer 切换和 33 套 migration 完成前可作为显式 legacy
  fallback，但不得被称为 canonical。
- 现有 `paper-normalized-groups-v1` 是 cloze/grammar-fill protocol evidence，
  不是新 authority root；后续可迁移其 fingerprint/digest/fail-closed 机制，
  不能让它与新 manifest 并列拥有标准。

现有 `CONTEXT.md` 的 Source Capture、Paper Format Profile、Canonical Paper
Plan、Canonical Question Group、Normalization Report 与 Analysis 词义已经足够；
本票新增的是架构所有权而非新的业务实体，因此不向 glossary 塞入文件路径或
实现术语。

本决议没有新增或毕业 Fog：现有后继票已经分别覆盖 Source Capture/ledger、
compiler interface、profile/plan、family contracts、renderer selector、发布与
migration。下一张仍是
[定义 Source Capture 与清洗留痕合同](04-source-capture-normalization-ledger.md)。
