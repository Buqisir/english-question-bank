# 现有试卷标准：权威、缺口与矛盾审计

## 范围与读法

本审计回答“今天什么在作数”，不设计未来实现。证据只取仓库内一手
文档、schema、生产者、validator、consumer 和 verify。为避免把“写在文档里”
误当成“运行时已强制”，以下区分三层：

1. **Owner / normative ruling**：`CONTEXT.md`、已接受 ADR、产品标准和本
   Wayfinder map 中的 owner-confirmed ruling；
2. **admission contract**：JSON Schema、validator、publisher/storage 和
   publish gate 实际允许或阻断的内容；
3. **de facto behavior**：当前 producer、Screen、Print/PDF、DOCX 与 verify
   实际生成、解释或锁住的行为。

目标词汇已经明确：Source Capture、Paper Format Profile、Canonical Paper
Plan、Canonical Question Group、Normalization Report
（`CONTEXT.md:11-29`），且规定一个 Source Capture 经编译形成一个 Plan、
多组 Canonical Question Groups 和一个 Report，Plan 只链接组而不内嵌组内容
（`CONTEXT.md:140-143`）。这些是本 initiative 的目标语义，不是对现状已完成
的描述。

## 当前权威矩阵

| 关注面 | 规范权威 | 当前可执行权威 / 实际消费 |
| --- | --- | --- |
| 来源事实 | primary 内容与官方答案必须在 import 时忠实捕获（`docs/adr/0008-primary-vs-derived-fields.md:11-17`）；PDF 双源由正文卷与答案卷组成（`docs/import/agent-runbook.md:20-42`） | package 只硬验一个 `.docx` 或 `.pdf` 及一个 hash（`server/paper-import/validator.mjs:638-711`），`import-meta-v1` 也只有一个 source 文件槽（`schemas/paper-import/import-meta-v1.schema.json:7-33`） |
| 语义事实 | 语义保真、不得由分析构造答案（`docs/product/nck1-paper-standard.md:28-54`）；Analysis 是补充而非答案权威（`docs/product/paper-asset-v1.md:114-124`） | builder、schema、validator 共同决定可发布 shape；答案同时写入 paper asset 与独立 answer key（`server/paper-import-ai/packageBuilder.mjs:795-838`） |
| 全卷结构 | `paper-asset-v1` 声称是正式全卷契约，`layoutTree` 与 `content.blocks` 都描述结构/顺序（`docs/product/paper-asset-v1.md:5-20,47-73`） | builder 分别构造 blocks 与 layout tree（`server/paper-import-ai/packageBuilder.mjs:357-450,795-825`）；Screen 以 `content.blocks` 为序（`app/src/features/paper-browse/PaperBrowsePage.tsx:492-510`） |
| 题号与分值 | NCK1 表与洗卷规则声明固定题号、分值并覆盖源值（`docs/product/nck1-paper-standard.md:10-38`） | builder 私有三套 profile 并按完形题数/阅读篇数推断（`server/paper-import-ai/packageBuilder.mjs:5-83`）；Draft Paper 又独立连续重编号（`docs/adr/0006-draft-paper-as-distinct-entity.md:25-55`） |
| 字体与版式 | NEEA 金样卷管字符级规则，2026 PDF 管可测物理量；纸面四面受同一标准约束（`docs/product/exam-paper-format-standards.md:11-26,167-177`） | Screen token/CSS、Print HTML、DOCX 各自决定选项布局（见“renderer ruling” findings） |
| 发布 | latest-last、versioned snapshot、DB transaction 是 core atomicity（`docs/adr/0004-c7-paper-import-atomicity.md:17-49`） | storage 原子写 core + normalization sidecar（`server/paper-import/storage.mjs:134-186,208-241,256-305`），listening/figures 后置复制（`docs/import/agent-runbook.md:369-393`），writing analysis 可绕过整卷 republish/version dance（`docs/adr/0010-writing-analysis-storage.md:18-48`） |
| 消费 | 网站 consume-only；paper asset、按题型 analysis、raw extras 各有边界 | PaperBrowse 读 latest/legacy asset、按 blocks 选组、另取 optional analysis/figures（`app/src/features/paper-browse/PaperBrowsePage.tsx:492-543`）；Print canonical adapter 只对白名单三组启用 canonical（`server/print-canonical-group-adapter.mjs:14-18,34-125`） |

## Findings：Source Capture

### SC-1 — 双源事实没有可执行的双源包络（gap / contradiction）

规范把 PDF 试题卷与独立答案 PDF 都当作 import source，并禁止缺答案源时导入
（`docs/import/agent-runbook.md:20-42`）；实际 package、hash 与
`import-meta-v1` 只表达一个源文件（`server/paper-import/validator.mjs:638-711`;
`schemas/paper-import/import-meta-v1.schema.json:7-33`）。因此“答案来自哪份不可变
capture”只留在 staging/runbook，不在发布契约内。Owner module：**Source Capture**。

### SC-2 — 来源类型字段与真实文件相互矛盾（stale / contradiction）

TS contract 允许 `docx | pdf | image`，却只有名为 `docx` 的详情槽
（`app/src/domain/paperAsset.ts:33-44`）；builder 无条件写
`primarySourceType: docx`（`server/paper-import-ai/packageBuilder.mjs:795-815`）。
当前 `paper-2026-i` 因而把 `paper.pdf` 标成 docx、`sourcePath` 留空并记录
“未上传答案解析版”（`app/public/paper-assets/paper-2026-i/latest/paper-asset.json:11-20`），
与 runbook 声明的双 PDF 来源冲突。Owner module：**Source Capture**。

### SC-3 — raw extras 与 core snapshot 的发布身份不同（duplicated ruling / gap）

atomic core 先产出 version/latest（`docs/adr/0004-c7-paper-import-atomicity.md:17-49`），
storage 的 artifact set 不含 listening/figures
（`server/paper-import/storage.mjs:134-186,208-241`），runbook 再把它们复制进
latest 与 version（`docs/import/agent-runbook.md:369-393`）。同一“版本”的 source
capture 由两条提交路径组成。Owner module：**Source Capture**。

## Findings：normalization

### N-1 — shared envelope 只覆盖两种题型（gap）

sidecar 和 fail-closed gate 已存在，但 producer 只选 `cloze`、`grammarFill`
（`server/paper-import/normalization.mjs:17-20,47-105`），schema 的
`canonicalGroup.groupType` 也只允许这两种
（`schemas/paper-import/paper-normalized-groups-v1.schema.json:85-159`）。
Reading、Seven Choices、两种 writing、rich content 与 listening raw 不在同一
normalization contract 内。Owner module：**normalization**。

### N-2 — canonical consumption 是三组白名单，不是资产级规则（gap / stale）

Print/PDF adapter 只对白名单中的三个 paper/group 读取 sidecar 或现场 normalize；
其余合法组明确回退 legacy（`server/print-canonical-group-adapter.mjs:14-18,34-125`）。
这使同一 paper 内可能同时存在 canonical 与 legacy 解释。Owner module：
**normalization**。

### N-3 — clean-only 的 admission 语义不一致（contradiction）

产品规则说脏 JSON 不可导入（`docs/product/paper-asset-v1.md:128-138`），validator
却在 AJV 前删除未知字段并只记 warning；缺 schema 时直接跳过 AJV
（`server/paper-import/validator.mjs:174-233`）。对应 verify 明确把
unknown-field stripping 锁成成功路径
（`scripts/verify-c7-paper-import-contracts.mjs:165-175`）。Owner module：
**normalization**。

## Findings：Paper Format Profile

### PFP-1 — “一律洗成 NCK1”与现存三 profile 冲突（contradiction / stale）

NCK1 标准自称所有卷的结构、题号、分值权威，并要求旧格式映射写入附录
（`docs/product/nck1-paper-standard.md:3-8,28-38,83-87`），但附录仍是占位
（同文件 `112-115`）。运行时实际保有 `newStandard`、`zjLegacy`、
`nationalLegacy` 三套 profile（`server/paper-import-ai/packageBuilder.mjs:5-83`），
本 initiative 又明确要求保留三种真实历史 profile
（`docs/cuts/paper-canonical-unification/wayfinder/map.md:13-24`）。Owner module：
**Paper Format Profile**。

### PFP-2 — profile 是未版本化、未持久化的推断结果（gap）

格式由完形题数与阅读篇数推断，且全国老卷对 six-family completeness 有代码内
例外（`server/paper-import-ai/packageBuilder.mjs:68-83,288-292`）。profile 名称、
版本和选择依据不在 paper asset、import meta 或独立 artifact 中；现有 source
contract 只记录普通 paper 元数据（`schemas/paper-import/import-meta-v1.schema.json:15-49`）。
Owner module：**Paper Format Profile**。

### PFP-3 — format-specific gate 没有进入全局 verify 权威（gap）

`verify:all` registry 含通用 import/normalization gates，却不含
`verify-nck1-standard`、`verify-national-format`、`verify-zj-package`
（`scripts/verify-ci.mjs:9-108`）。national-format gate 还允许真实 fixture 缺失时
打印 SKIP 而 exit 0（`scripts/import-pipeline/verify-national-format.mjs:38-56`）。
Owner module：**Paper Format Profile**。

## Findings：Canonical Paper Plan

### CPP-1 — `layoutTree` 与 `content.blocks` 重复拥有全卷顺序（duplicated ruling）

产品契约同时把 `layoutTree` 定义为 part→section→group，并把 `content.blocks`
定义为真实语义顺序（`docs/product/paper-asset-v1.md:47-73`）；builder 分别拼装
两者（`server/paper-import-ai/packageBuilder.mjs:357-450,795-825`），而 schema
对 sections 与 blocks 基本不约束（`schemas/paper-import/paper-asset-v1.schema.json:24-49`）。
没有 admission gate 证明两套顺序/标题/引用一致。Owner module：
**Canonical Paper Plan**。

### CPP-2 — 题号、分值与答案在多个载体重复（duplicated ruling / gap）

NCK1 把题号分值定为卷级硬标准
（`docs/product/nck1-paper-standard.md:10-38`）；builder 把分值落到 question/
answer entries，又同时生成 embedded `paperAsset.answerKey` 与独立
`answer-key-v1`（`server/paper-import-ai/packageBuilder.mjs:795-838`）。
validator 只阻断“独立答案指向未知 question”，非 Reading 缺 question/answer
只是 warning（`server/paper-import/validator.mjs:464-580`），对应 verify 明确要求
仍可发布（`scripts/verify-c7-paper-import-contracts.mjs:177-196`）。Owner module：
**Canonical Paper Plan**。

### CPP-3 — imported plan 与 Draft Paper output 各自重编号但关系未声明（gap）

Draft Paper 是独立持久实体并在输出时隐藏原号、连续重编号
（`docs/adr/0006-draft-paper-as-distinct-entity.md:25-55`）；当前 Canonical Paper
Plan 目标则固定 source paper 的 order/numbering/scoring
（`CONTEXT.md:19-21,140-143`）。两种合法 paper plan 的身份与映射尚无共同
authority。Owner module：**Canonical Paper Plan**。

### CPP-4 — listening 的结构权威存在代际冲突（contradiction / stale）

NCK1 明确 listening 只存 raw、不建 Question Group、不上消费面
（`docs/product/nck1-paper-standard.md:56-65`），但 paper-asset schema/TS contract
仍允许 `listening` group（`schemas/paper-import/paper-asset-v1.schema.json:50-65`;
`app/src/domain/paperAsset.ts:143-154`），全局 fixture verify 还要求 layoutTree
包含 listening part（`scripts/verify-paper-asset-v1.mjs:201-227`）。Owner module：
**Canonical Paper Plan**。

## Findings：Canonical Question Group

### CQG-1 — “正式契约”在 Markdown、schema、TS 三处漂移（duplicated ruling / stale）

文档把 blocks、共享 option bank、blanks、writing task 逐项锁定
（`docs/product/paper-asset-v1.md:59-112`）；JSON Schema 却把 blocks、sections、
options、blanks、writingTasks 和 analysis 留为数组/对象壳，并允许 group/question
任意附加字段（`schemas/paper-import/paper-asset-v1.schema.json:24-93`）。
TS 文件又自称 official contract，同时仍写“not wire into runtime UI”
（`app/src/domain/paperAsset.ts:1-18`），但 PaperBrowse 正在直接消费它
（`app/src/features/paper-browse/PaperBrowsePage.tsx:492-510`）。Owner module：
**Canonical Question Group**。

### CQG-2 — Seven Choices 的 shared-bank 语义只被局部门禁表达（gap）

产品规则规定一个 group 持有 A–G bank，五题只关联 blanks
（`docs/product/paper-asset-v1.md:81-97`）；validator 硬验 A–G 完整
（`server/paper-import/validator.mjs:447-460`），Screen adapter 也把 questions
留空并单独投射 bank（`app/src/features/paper-intelligence/sevenChoicesSurfaceAdapter.ts:165-224`）。
但通用 schema 没有编码“一组一 bank / blank reference”不变量
（`schemas/paper-import/paper-asset-v1.schema.json:50-84`），map 已记录 Print/PDF
生成 per-blank A–D 并重复/嵌套 A–G 的当前失败
（`docs/cuts/paper-canonical-unification/wayfinder/map.md:25-30`）。Owner module：
**Canonical Question Group**。

### CQG-3 — browser 声称消费全部 block，实际只对部分 block 有语义（gap）

正式 block union 包含 notice、exampleQuestion、questionRange、answerBox 等
（`docs/product/paper-asset-v1.md:59-73`），PaperBrowse 对这些类型只渲染“不支持”
占位（`app/src/features/paper-browse/PaperBrowsePage.tsx:1826-1840`）。Owner module：
**Canonical Question Group**。

## Findings：Analysis supplement

### AS-1 — embedded analysis 与按题型文件重复（duplicated ruling / stale）

`paper-asset-v1` 顶层含 analysis 且文档称其存可复用事实
（`docs/product/paper-asset-v1.md:114-124`）；builder 把 reading analysis 嵌入
paper asset，同时又发布按题型 analysis 文件
（`server/paper-import-ai/packageBuilder.mjs:795-838`;
`server/paper-import/storage.mjs:134-185,219-230`）。PaperBrowse 实际另取
`latest/analyses/*.json`（`app/src/features/paper-browse/PaperBrowsePage.tsx:512-529`）。
Owner module：**Analysis supplement**。

### AS-2 — analysis 的发布一致性按题型分裂（contradiction / gap）

ADR-0007 声明 six-family base analysis 是 whole-paper publish gate
（`docs/adr/0007-writing-import-data-contract.md:17-29`），validator 实际只要求
reading analysis；Seven/Cloze/Grammar 缺失可选、paperId mismatch 只是 warning
（`server/paper-import/validator.mjs:488-580`）。ADR-0010 又把 writing analysis
定义为 post-import optional 且无 version dance
（`docs/adr/0010-writing-analysis-storage.md:18-48`）。Owner module：
**Analysis supplement**。

### AS-3 — derived difficulty ruling 与 producer 冲突（stale / contradiction）

ADR-0008 要求停止写假的固定难度值
（`docs/adr/0008-primary-vs-derived-fields.md:31-38`），builder 仍给每类 group
写 `difficulty: '中'`（`server/paper-import-ai/packageBuilder.mjs:840-895`）。
Owner module：**Analysis supplement**。

## Findings：renderer ruling

### RR-1 — A–D gold-reference 4/2/1 rule 尚未成为共同权威（gap / contradiction）

既有 prose 只写阅读短选项两列、完形四列、听力三列
（`docs/product/exam-paper-format-standards.md:86-98`）。Owner 根据 NEEA 金样卷
补充的现行 invariant 是：每个 A–D set 整体选择四列、two-by-two 或一列，
按最密可容纳模式选择，禁止 CSS auto-flow/hybrid
（`docs/cuts/paper-canonical-unification/wayfinder/map.md:29-30`）。
两份规范目前不是同一可执行 ruling。Owner module：**renderer ruling**。

### RR-2 — Screen、Print/PDF、DOCX 使用三种不等价算法（contradiction）

Screen token 固定 `1fr 1fr`（`shared/papersurface/tokens.mjs:84-92`），CSS 只在
窄 viewport 改一列（`app/src/shared-ui/papersurface/PaperSurface.css:422-434`），
空 stem 的完形又强制整行 inline
（`app/src/shared-ui/papersurface/PaperSurface.tsx:718-758`）。Print 以每项
字符数 `<=20` 选择两列，否则一列，完形无条件 inline
（`server/print-renderer.mjs:90-93,366-375,737-761`）；DOCX 复制同一字符阈值/
两列表/inline 分支（`server/exports/docxRenderer.mjs:1007-1037,1151-1153`）。
三面都没有实现 whole-set 的 4/2/1 fit ruling。Owner module：
**renderer ruling**。

### RR-3 — verify 锁住存在性/旧分支，不证明 gold-reference fit（gap）

print verify 只断言 `options-grid` class 存在
（`scripts/verify-print-renderer.mjs:113-118`），PaperBrowse verify 明确锁住
empty-stem options 的单行分支
（`scripts/verify-paper-browse.mjs:753-772`），token verify 只检查 option token
映射（`scripts/verify-paper-surface-tokens.mjs:321-328`）。这些 gate 不能区分
四列、two-by-two、一列是否按同一测量规则选中。Owner module：
**renderer ruling**。

### RR-4 — typography 文档可在 CI 中无行为验证地变化（gap）

CI 对 docs-only change 完全跳过
（`.github/workflows/verify.yml:3-19`），而 `verify-paper-asset-v1` 对产品文档只做
关键词包含断言（`scripts/verify-paper-asset-v1.mjs:368-388`）。因此“格式标准
是四面唯一权威”（`docs/product/exam-paper-format-standards.md:167-177`）没有
与 renderer regression 同步的可执行约束。Owner module：**renderer ruling**。

## 审计结论

今天不存在单一 canonical authority。规范层已经给出 source/semantic/layout
边界，但 admission 与 consumption 仍由多份可漂移契约共同决定。最关键的断层是：
双源未进入 Source Capture 包络；三套真实 profile 与 NCK1 universal wording
冲突；全卷顺序、题号/分值/答案重复拥有者；canonical normalization 只覆盖两类
题组与三组消费白名单；Analysis 的存储与 gate 分裂；以及 A–D gold-reference
4/2/1 invariant 尚未替换三面不等价的固定网格/字符阈值/inline 行为。

本资产只记录现状与未来 owner module 归属；没有选择 schema 版本、迁移方式、
模块接口或 renderer 算法。
