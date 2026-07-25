# 定义 Source Capture 与清洗留痕合同

Status: closed
Type: grilling
Claim: claimed
Blocked by: 审计现有试卷标准的权威、缺口与矛盾; 盘点全库 latest 资产与所有生产消费变体
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/05-canonical-compilation-module-interface.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

What is the smallest lossless Source Capture slice needed to compile every current family while preserving source provenance, official-answer provenance, stable identity, and source spans? Define which deterministic transformations may produce canonical semantics automatically, what a transformation record must retain (`ruleId`, source span, before/after, confidence or equivalent), which ambiguity classes return `needs_review`, and how `unsupported`, incomplete source, answer conflict, and semantic-risk cases differ. Resolve the current conflict between byte preservation and punctuation/typography normalization without allowing source mutation or fabricated content.

## Resolution

### 决议摘要

采用“**不可变证据层 + 派生语义层 + 有序变换台账**”：

- Source Capture 保存原件 bytes/digest 和逐项可寻址的原始 observation；任何
  correction 都产生新 capture，禁止原位清洗。
- Canonical Paper Plan / Canonical Question Group 是从 capture 派生的 semantic
  view，可以与源字节不同，但每个不同点必须有 Transformation Record；未变化的
  值必须有 direct Source Span lineage。
- 自动变换不用概率分数证明安全，只接受 `certainty: exact`。任何只能给出
  confidence、heuristic 或多个合理候选的规则都不得生成 accepted canonical
  semantics，而是 `needs_review`。
- Analysis、常识、跨卷重复、renderer 输出和旧 `paper-asset-v1` 的已清洗文本都
  不能替代 source evidence，也不能补写缺失内容或裁决答案。

本票锁定 evidence、lineage、transformation 与 disposition 的领域合同；JSON
字段编排、public compile function、source-format adapter 隐藏方式仍由
[设计 canonical compilation 深模块接口](05-canonical-compilation-module-interface.md)
选择。

### 最小且无损的 Source Capture

一个可编译 slice 必须对下列四类事实闭合；少一类就不能称为 lossless：

1. **Capture 与 document identity**
   - 一个 immutable `captureId` 和 capture schema version；
   - 所有参与该 slice 的 source documents，各自有稳定 `documentId`、角色
     （question source、official-answer source、supplement、listening、figure
     等）、真实 media type、original name、byte length、sha256 和 immutable
     artifact reference；
   - 同一 document 可以承载多个角色，但 official-answer role 必须落到具体
     document/observation，不能只写“答案已核对”。
2. **有序 source observations**
   - 每个 observation 有稳定 `observationId`、document、parent/order、kind、
     exact observed value 或 binary artifact reference、typed Source Span，以及
     adapter/extraction method + version；
   - observation tree 只表达源中的顺序、段落/run、页/区域、表格行列/单元格、
     图片、选项标签等 syntax evidence，不预先宣称 profile、Question Group
     family、正确答案或 canonical boundary；
   - 手工转录也是 observation，必须保留 method 和 PDF page/region 等 span；
     原 PDF bytes 仍是最终 evidence，不因转录而被替换。
3. **Provenance-bearing assertions**
   - paper/source 元数据、题干、选项、instructions、writing prompt/starters、
     listening raw、表格/图片关联与每个 answer assertion 都指向 observation
     span；
   - operator-supplied metadata 若无法指向 source，必须明确标为
     `operator_assertion`，不能伪装成 source fact；
   - official answer 必须保留自己的 source assertion，canonical answer 同时
     关联 question identity anchor 与 answer assertion anchor。
4. **Identity anchors and closure**
   - capture、document、observation identity 对相同 bytes + role + typed locator
     重跑稳定；文件名、normalized text、数组位置或 rule version 不能单独成为
     business identity；
   - canonical object identity 由 source anchor set + semantic role/family 构成。
     规则升级只改变 compilation provenance/digest，不让同一 source-backed
     Question 因标点变化换 id；真实 split/merge 则需要显式 review resolution
     identity；
   - slice 必须带齐所有被引用 observation、answer assertion、attachment 与
     document digest。Analysis、renderer typography、DB row、已派生 canonical
     payload 不属于 Source Capture。

Source Span 永远使用 **pre-normalization** 坐标并绑定 document digest。它可按
source kind 使用 byte range、DOCX package part + element/text offsets、PDF
page + bbox/text offsets、table cell locator 或 image region；改变长度的输出可有
自己的 output range，但不得把 output offset 冒充 Source Span。

### 允许自动产生 canonical semantics 的变换

一条规则只有同时满足以下条件才可自动应用：manifest 注册且 version 固定；
输入前置条件可机器证明；同一输入只有一个输出；重跑稳定且规则幂等；不改变
source-backed meaning、identity、cardinality、answer authority 或 boundary；
capture + ledger 可完整解释差异。允许的最小类别是：

1. **Direct projection / structural tokenization**：按明确的源顺序复制值，或把
   唯一匹配的 marker/delimiter 切成 text/blank/option 等节点；全部节点覆盖且
   spans 不重叠、不丢字符。
2. **Registered one-to-one dialect aliases**：只在 family、marker grammar、
   cardinality 和 identity alignment 都唯一时，将已登记的 source dialect
   投射为 canonical enum/relationship。
3. **Guarded representation normalization**：有限 allowlist 中的换行、空格、
   punctuation-width、quote/dash glyph 等表示差异，仅在规则能证明 token、
   marker、number、identifier、URL、answer 和 lexical content 不变时写入
   derived canonical text。只改变 font、glyph rendering、line break 或 layout
   的事项属于 Renderer Typography，根本不改 canonical text。
4. **Exact joins**：question ↔ option、blank、shared bank、official-answer
   assertion、table/figure attachment 的 join，只有 key、范围、数量和 target
   都唯一时自动成立。
5. **Anchor-derived identity**：从 immutable source anchors 与 semantic role
   生成稳定 id；不得从 normalized payload hash、question number alone 或跨卷
   内容相似度生成。

以下行为一律不是 deterministic normalization：修正拼写/语法/事实；猜缺失
文字、answer、word count、writing skeleton 或 table cell；凭题数猜多个都可行的
profile；删除疑似 splitter 污染或局部序号；合并/拆分有歧义的 passage/group；
以 Analysis、模型输出或多数答案裁决 source；因 normalized payload 相同而跨卷
去重。它们分别进入下述 fail-closed disposition。

### Transformation Record 的最小账本

每一次 **值改变、boundary/identity 建立或 source relationship 建立** 都必须按
执行顺序留一条 record；byte-for-byte direct copy 不造伪变换记录，但必须有
direct source map。每条 record 至少保留：

- stable `recordId`、sequence/parent record；
- manifest/rule-set digest、`ruleId`、rule version；
- canonical target identity/path 与 operation category；
- 全部 input observation ids、typed Source Spans 和 input digests；
- exact `before` 与 `after` scalar/token/structural relation；大 binary 使用
  immutable artifact reference + sha256，而不是复制 bytes；
- output digest，以及链式变换时所消费的上一条 output；
- `certainty: exact` 和机器可复核的 matched preconditions/equivalence proof。

数值 confidence 不能把 heuristic 变成 accepted transformation。非 exact
candidate 留在 diagnostics，保留候选、证据 spans、风险原因和建议 review
action，但没有 accepted `after`。人工 resolution 也不改 capture；它另留
review decision identity、所选候选与证据，再以该 decision 作为下一次编译的
显式输入。

Normalization Report 因而同时包含：capture/manifest/compiler digests、direct
source map、ordered Transformation Records、全部 diagnostics、每个
paper/group 的 disposition、canonical semantic digest。只给一份“清洗后文本”
或只记 `before/after` 而无 rule/span 均不合格。

### Fail-closed disposition 与边界

每个 paper/group scope 只有在没有 blocking diagnostic 时才是 `ready`。其余
状态不能静默降级为 legacy canonical；diagnostics 全部保留，聚合时按
`answer_conflict` → `incomplete_source` → `unsupported` → `needs_review` →
`ready` 给出主 disposition：

| Disposition | 精确定义 | 恢复动作 |
| --- | --- | --- |
| `needs_review` | evidence 齐全且现有合同可表示，但存在两个以上合理 boundary/marker/profile/identity 解释，或拟议变换具有 semantic risk | reviewer 只能在保留 spans 的候选间裁决或确认 source quirk；记录 decision 后重编译 |
| `unsupported` | evidence 完整、含义明确，但 manifest 中没有能表示该 family/dialect/feature 的 profile、contract、adapter 或 rule | 新增 owner-approved executable standard/implementation；不是让 reviewer 猜 |
| `incomplete_source` | 所需 source/official-answer/页/区域/附件缺失、损坏、截断、hash 不符、无法读取或无法定位 | 重新 capture 或补齐 source；严禁生成内容 |
| `answer_conflict` | 两个 provenance-bearing official-answer assertions，或 official answer 与同样被声明为 authoritative 的 embedded answer，在 exact label normalization 后仍不一致/无法唯一 join | 修正 source role/provenance，或由 owner 作有证据的显式裁决；Analysis 和多数票无权覆盖 |

`semantic_risk` 是 diagnostic class，不是第五种自动变换：凡是可能改变词义、
punctuation force、source boundary、Question/blank/bank identity、cardinality、
writing constraint 或答案的操作都进入 `needs_review`。若风险根因其实是缺证据，
归 `incomplete_source`；若合同没有表达能力，归 `unsupported`；若只涉及答案
权威冲突，归更具体的 `answer_conflict`。

### 对当前真实异常的裁决

- `paper-2026-i` 的 declared `docx` 与 PDF magic bytes/filename 冲突：保留两个
  assertions；真实 media type 可由 exact magic-byte rule 得到，旧字段不得回写
  capture，provenance mismatch 留 diagnostic。
- Seven Choices marker 后局部数字、两个 grammar group 的孤立数字，以及
  mixed quote/parenthesis：不能批量正则删除；在 source boundary/语义不能唯一
  证明前都是 `needs_review`。
- 六对 writing payload 即使 normalized bytes 相同，也保持不同 capture anchors
  和 canonical identities；只标 provenance review，不跨卷 deduplicate。
- question PDF 与 answers PDF 都进入同一 capture closure；缺答案 PDF 是
  `incomplete_source`，两份 official key 冲突是 `answer_conflict`。
- table/figure 的原 page bytes/region、structured observations 与 binary digest
  分开保留。只有 flattened text 而无足够 row/cell evidence 是
  `incomplete_source`；evidence 完整但 family contract 尚不能表达时才是
  `unsupported`。
- 全角英文标点等只有命中 guarded allowlist 才可产生 ledgered canonical text；
  straight quote 朝向、破折号含义或 marker 内空格不能唯一证明时
  `needs_review`。renderer 仅改变字形和版式时不产生 source normalization。

这解决了“byte preservation 与标点/字体 normalization”冲突：**bytes 和 exact
observations 永远保留；canonical view 可以不同；差异必须 exact、可追溯、可重放，
否则不生成 ready semantics。**
