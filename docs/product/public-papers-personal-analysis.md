# 公共题库、个人解析与精选官方参考

状态：Owner 已确认产品方向；公共卷 metadata 的 revision/store/promotion/storage、publisher
投影及既有非写作检索已接线，写作相似题 UI 仍未实现；验收等待 parent Full 结果。
不得把既有 reviewed 资产静默改类。

## 产品身份与权限

平台主打可用题量、可靠检索与组卷。公共原题/源答案、用户个人解析、精选官方参考是三个
独立身份：个人内容仅本人可改，采用官方参考是复制到个人副本，AI 身份不会因保存消失；
精选参考是题库官方人工实审内容，不冒称命题机构官方详解，也不把写作范文当唯一答案。
个人内容不自动公开、进入公共索引或混入公共配套 PDF，旧卷修订后不得静默套用旧解析。

网站新增许可仅是围绕已发布卷制作个人解析，不恢复网站导题、公共改题或批量公共内容
生产。API 供应商、Key/代付、配额、编辑粒度、个人导出和精选频率仍未决定，不能称为
已实现能力。Passage-first、Canonical Paper、共享 Screen/Print/PDF、学生版隐藏答案、
权限隔离和版本追溯继续有效。

## 新公共卷导入：机器核事实，Owner 只验最终版式

新导入 AI 仍负责 OCR/源提取、校对、源答案抄录比对，并产出必要的结构化检索元数据；
自动 source/coverage/schema/answer 校验仍是硬门禁。缺源、缺答案、来源歧义或答案冲突通过
既有 Materialization issues、source-answer checks 和 validation gates 失败关闭，不能交给版式
认可吞掉，也不新增事实异常 receipt/workflow。源答案 variants 保持既有权威文本及 provenance，
不另造 alternative schema；AI 绝不是答案权威。

Owner Review **只认可最终渲染版式**，不审核段落摘要、主题、语义标签、原题准确性或答案
映射。认可 receipt 的精确字段是 `approvalScope: 'layout_only'`，不得声称人工语义/答案验证。认可绑定
不可变 revision 及 source/candidate/summary/metadata/render digests；之后仍须单独明确 promotion。
历史无 profile 卷和 external analyzed package 保持原 analysisDigest、审核身份和门禁，不能
因新规则被自动回填或重分类。

## 摘要与检索元数据分离

保留每个正文段落一至两句中文摘要，供浏览理解；摘要不是教学 prose，也不是检索分类的
替代品。结构化检索元数据独立保存并绑定稳定 `groupId`、`paragraphId`、`questionId` 和版本
digest，而不是证据高亮坐标。

| 范围 | 必要元数据 | 边界 |
| --- | --- | --- |
| 通用 | 多值 `topicLabels` 使用 canonical taxonomy 字符串，由 publisher 按表解析为 `theme/themeGroup/subtopic`；一级只允许人与自我/人与社会/人与自然；真实体裁记叙/说明/议论/应用/新闻；程序派生词数/段数/题数 | 体裁不等于题型；受控多标签合法；禁止新难度/CEFR、翻译、教学 prose、坐标 spans、Embedding/Jev |
| 阅读 | `family/subtype/detailScope/technique` + 程序派生 A–D 篇位 | 复用既有相似题分类，不由摘要猜题型 |
| 七选五 | `positionFacet/roleFacet/primaryMechanismFacet` | 保留既有受控值与逐空粒度 |
| 完形 | `pos/signatureFacet`；必要时一条来源有据的组级检索摘要 | 不把逐段摘要复制成长篇情绪/事件表 |
| 语法填空 | hint/source facts、`facetKey/role/route/features`，答案形式由源答案程序派生 | `contextParagraphIds` 保留并校验；当前不宣称 standalone renderer 已消费 |
| 应用文 | 完整源任务 + form/function/theme | 保留源写作限制，不生成范文 |
| 读后续写 | 完整原文/段首/要求 + 最小 situation/conflict/relationships | 不编结局、路线、情绪弧或范文 |

词数只数选定正文 paragraph IDs 中匹配 `[A-Za-z]+(?:['’-][A-Za-z]+)*` 的英文 lexical tokens
（缩写或连字符形式各计一个）；段数只数符合正文资格的结构段；
题数只数题组拥有的 question IDs，写作按一个 group-level task 计。算法和 scope IDs 要版本化，
不得让模型估算。NCK1 分值按现行标准程序派生：阅读 21–35 每题 2.5，完形 41–55 每题 1，
语法 56–65 每题 1.5，应用文 15，续写 25；听力和七选五沿用其现有编号段规则。源写作字数、
格式、段首等约束原样保留。

## 当前实现与缺口

本地 `public-paper-v1` 已有完整源材料化、digest-bound paragraph summary、不可变 Review 传输、
听力补件失效重绑和显式 promotion；原始答案文档 bytes/digest 继续保存，但答案文件中的详解/
范文不回流 active materialization。当前已实现 `public-search-metadata-v1.json`、其受控字段/
确定性计数 validator，以及 `prepare-search-metadata` / `finalize-search-metadata` /
`verify-search-metadata`。metadata 已绑定不可变 revision/store/promotion/storage；publisher 投影
taxonomy topic labels、genre 和 counts，既有阅读/七选五/完形/语法检索直接消费 metadata，
不要求 analyses。legacy 缺 metadata 时保留既有 genre，且绝不写入 group type。写作相似题 UI
尚未接线，Embedding 延后。

本地定向验收和六个浏览器 E2E 已通过；Full 原始失败及定向修复、一个缺外部 fixture 的
SKIP 均保留在验收记录中，不宣称全量全绿或已上线。写作相似题 UI 需另行立项；旧卷保持原值，不猜测回填。
个人编辑、私有 API/计费和 Embedding 不在本次导入改造内。具体阶段与验收见
[`../import/public-paper-import-plan.md`](../import/public-paper-import-plan.md)。
