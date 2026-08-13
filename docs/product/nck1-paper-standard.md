# 新课标一卷标准(NCK1 Paper Standard)v1(owner 2026-07-08 拍板)

一切进入题库的试卷,先洗成本标准的结构与题号,再入库。本标准是
导题工序的**数据契约**;排版视觉标准另见
`docs/product/exam-paper-format-standards.md`(互补,不重叠)。

标准模子 = 2026 年新课标 I 卷(owner 2026-07-08 拍板)。任何 agent、
任何模型执行导题,均以本标准为准;发布闸按本标准校验,不合格不入库。

## 1. 标准卷结构(结构、题号、分值均为硬标准)

| 部分 | 节 | 题型 | 题号 | 每题分 | 满分 | group_type | 题组数 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 第一部分 听力 | 第一节 | 短对话 | 1–5 | 1.5 | 7.5 | (不建题组,见 §4) | — |
| | 第二节 | 长对话/独白 | 6–20 | 1.5 | 22.5 | (不建题组,见 §4) | — |
| 第二部分 阅读 | 第一节 | 阅读理解 A/B/C/D | 21–35 | 2.5 | 37.5 | `reading` | 4(A 3 题,B/C/D 各 4 题) |
| | 第二节 | 七选五 | 36–40 | 2.5 | 12.5 | `seven_choices` | 1 |
| 第三部分 语言运用 | 第一节 | 完形填空 | 41–55 | 1 | 15 | `cloze` | 1 |
| | 第二节 | 语法填空 | 56–65 | 1.5 | 15 | `grammar_cloze` | 1 |
| 第四部分 写作 | 第一节 | 应用文 | — | — | 15 | `writing` | 1 |
| | 第二节 | 读后续写 | — | — | 25 | `writing` | 1 |

即每套卷入库后固定为 **9 个题组**(reading×4 + seven_choices +
cloze + grammar_cloze + writing×2),听力原料另存(§4)。

## 2. 洗卷规则

- **题号重排**:无论源卷原题号如何,一律重排进上表题号段
  (21–35 / 36–40 / 41–55 / 56–65)。重排映射(源题号 → 标准题号)
  写入导入产物留痕,不得丢失。
- **分值覆写**:入库分值一律按上表,不采用源卷标注分值。源卷分值
  仅在留痕里保存。
- **格式白名单制**:只导已被工序验证过的源格式。当前白名单:
  1. 新课标答案版 DOCX(2020–2025 十二套已验证的两种变体);
  2. 新课标 PDF 试题卷 + 独立答案 PDF(2026 起,刀②接入);
  3. 试题 DOCX + 答案解析 DOCX(NCK1 结构模拟卷;2026-08-13 owner
     拍板,映射见附录 A)。
  甲卷 / 乙卷 / 浙江卷等旧格式:为收存量真题按需接入,**一个格式
  一把刀**,接入时把该格式 → 本标准的映射规则写进本文件附录,
  并补对应 verify 锁。白名单之外的格式不得盲导。
- **语义保真**:洗卷只动结构 / 题号 / 分值 / 排版,不改题干、选项、
  篇章语义(与 exam-paper-format-standards.md 的
  Import Normalization Principle 一致)。归一化可能改变语义时,
  停下来交 owner 裁决。

## 3. 答案红线(硬约束,gate 强制)

- 每套卷必须有答案来源:**源自带答案,或 owner 另给答案文件。
  两者皆无,则该卷不导。**
- **禁止 AI 做题产生答案**:模型解题结果永远不得作为入库答案,
  准确率再高也不行。
- 答案与试题分离的源(如 2026 卷、模拟卷):切答案 → 按重排后的
  标准题号对齐 → 过数量校验 gate(客观题 1–65 段每题必须有且
  仅有一个答案,缺一即整卷打回)。
- 写作两节无客观答案;答案文件中的评分细则、参考范文(下水文)
  作为卷级资产附件保留(存法在刀②定,内容不得丢弃)。

## 4. 听力条款(owner 2026-07-08 拍板:原料先存,题组后建)

- 听力**入库但不建题组、不跑解析、不上网站**任何消费面。
- 源卷**含**听力部分时,必须把听力四件套完整切出,存入该卷
  paper-assets 目录下的 `listening/` 原料区:题干、选项、答案(1–20)、
  录音稿(含分段时长 / 语速表,若源提供)。一个字不丢。
- 源卷**无**听力部分(试题从阅读起、正文无「第一部分 听力」)时,
  不建 `listening/` 原料,不得编造听力题。本项 gate 跳过。
- 音频文件暂不在范围内;将来有音频时归入同一原料区。
- 原料 → 正式听力题组的转正,由专门的「听力入库」刀负责
  (碰 schema 与网站消费面,需过 PA)。在那之前,任何消费面
  (找题 / 详情 / 组卷 / 导出)不得出现听力内容。

## 5. 命名与出处

- paperId 沿用现约定:`paper-<year>-<卷别>`(新课标 I = `-i`,
  II = `-ii`;旧格式接入时随刀定后缀)。模拟卷(格式③)由 owner
  开局给 id,建议 `paper-mock-<地区>-<年>-<场次>`(如广东 2026 一模
  `paper-mock-gd-2026-m1`)。不得占用 `paper-YYYY-i` /
  `paper-zj-YYYY-jan`。
- 出处如实:真题 `real_exam`,模拟卷用相应 sourceType 与
  provenance 标注出卷方。**洗成标准模子不改变出处属性**——
  模拟卷洗完仍是模拟卷,不得伪装真题。

## 6. 校验(gate)要求

发布闸必须能校验:9 题组齐全、题号段正确、每题分值符合 §1、
客观题答案数量齐(§3)、七选五 optionBank 恰好 A–G 七句非空候选句
(可作答卷面硬前提,owner 拍板 2026-07-16,validator blocking 已
落地)、源含听力时听力原料区存在且非空(§4)、含图或须截表的篇
figures 原料齐全(§8)。源无听力则跳过听力项;源无图且表已拍平为
纯文本、无独立截图则跳过 figures 项,不得编造占位。现有 publish
gate 覆盖不到的项,按格式补 verify 锁,不得靠人眼。

新卷(格式③必检;其他格式一旦交出写作分析稿同样必检)还须:

- **应用文卷面 chrome**:题干不把「（词数N左右。）」粘在提示末尾;
  独立「注意」块写词数与答题卡格式;源给的标题/称呼进答题框
  (`givenSkeleton.presence = provided`)。格式①历史卷给定语可
  `omitted`,不得用本条去改已入库真题。排版细节见
  `exam-paper-format-standards.md` §8。
- **九题组讲评齐**:阅读 / 七选五 / 完形 / 语法随发布包落地;写作两节
  必须写入 `analyses/writing-analysis-v1.json`(应用文 V3:`modelAnswer`
  + 完整 ReviewCard + 源有则 `officialModelAnswer`;续写 V1:
  `continuationAnalysis` 五段 + `modelAnswer`)。缺一组或整组只能显示
  「解析未发布」则整卷打回。旧 `continuationDesign` 只认历史资产。
- **应用文讲评入口**:完整 payload 时点击答题框打开讲评;框内叠放
  「AI 参考范文」与可选「官方范文」,右栏只 ReviewCard。不新增 tab,
  不用白名单题组。

## 7. 变更管理

本标准的任何修改(含附录新格式映射)须 owner 拍板后落档;
agent 不得以"源卷长得不一样"为由自行放宽。与本标准冲突的
历史文档,以本标准为准。

## 8. 图文条款(owner 2026-07-08 拍板:原料先存,渲染后建)

- **边界**:表格 ≠ 图。行列结构能表达的是**表格**;统计图、示意图、
  图画等视觉对象是**图**,走 figures 原料通道。
- **图(figures 原料区)**:含图篇导入时,必须把图无损截存为图片
  文件,存入该卷 paper-assets 的 `figures/` 原料区;正文以占位
  标记(如 `[图:fig-1]`)记录图与篇章/题目的关联。一张图不许丢。
  提取工序按源类型:PDF = 高分辨率页面渲染后区域裁图;DOCX
  内嵌位图 = 直接从 zip 取原文件;DOCX 形状绘图 = LibreOffice
  渲为 PDF 后走裁图路。
- **表格(双存桥,过渡期)**:表格拍平为文本进 materialText
  (保语义:搜索 / 解析 / 做题不受损),**同时**整表截图存入
  `figures/`(保观感原料)。长期解为表格结构化数据 + 渲染面按
  考卷样式绘制,由图表契约刀 / 渲染保真刀落地,落地后双存桥退役。
- **消费降级(渲染支持落地前)**:含图 / 含表截图的题组入库、
  详情页可见(文字照常显示 + 「本篇含图,图暂未支持展示」占位
  提示),**不可加入草稿卷**——缺图的卷子绝不能流到学生手里。
  渲染保真刀落地后自动解禁。
- **保真分级(owner 拍板)**:试卷面(A4 组卷预览 / 打印 /
  PDF)必须达到真题观感,版式权威为
  `exam-paper-format-standards.md`;网站详情页要求语义完整、
  图表在场、阅读友好,不要求仿真卷版式。

## 附录 A:格式③ 试题 DOCX + 答案解析 DOCX(2026-08-13 owner 拍板)

适用:各地模拟卷,卷面已是 NCK1 九题组(阅读 A–D / 七选五 / 完形 /
语法填空 / 应用文 / 读后续写)。源为两份 DOCX:`*试卷.docx` +
`*答案解析.docx`。同套 PDF 只作副本,不另开刀。旧 `.doc` 不在本条。

映射:

- **题号**:源已用 21–65 则不重排;否则按 §2 重排并留痕。
- **答案**:从答案解析抄客观题键,对齐标准题号。禁止把解析里的
  AI 解题当入库答案;源给的参考范文作 `officialModelAnswer` 保留。
- **听力**:试题从「第二部分 阅读」起、无听力部分 → 不建
  `listening/`,不编造(§4)。
- **图**:源无内嵌图、表已在正文以文字出现 → 不建 `figures/`,
  不编造(§8)。
- **身份**:以开局 `paperId` 为准,不按真题标题派生
  `paper-YYYY-i` / `paper-zj-YYYY-jan`。
- **出处**:`sourceType` 为模拟,provenance 标明出卷方;不得标成真题。
- **canonical**:本格式不走格式①标题派生 producer。用
  `scripts/import-pipeline/build-docx-pair-canonical-request.mjs`，开局
  `paperId` 必填；不得占用 `paper-YYYY-i` / `paper-zj-YYYY-jan`。
- **应用文 chrome**:pair producer 必须拆出 prompt / notice / given
  title 三块;题干禁止粘词数。`verify-nck1-standard.mjs` 与
  `verify-paper-canonical-docx-pair-request.mjs` 锁本条。
- **写作分析**:`papers/<id>/analysis-application.json` 与
  `analysis-continuation.json` 为 `--publish` 硬前置;`02-publish`
  在入库后写入 `writing-analysis-v1.json`。不得只改一卷、下一卷再丢。

甲卷 / 乙卷 / 浙江卷旧真题刀仍按「一个格式一把刀」另节补,本附录
不覆盖那些源。

## 刀②回填:开放项定案(2026-07-08,首导 paper-2026-i 落地)

以下开放项由 `nck1-import-runbook` 刀执行时定案,细节与派发模板见
`docs/import/agent-runbook.md`;本节只记结论,不重复工序。

- **写作评分细则 / 下水文**:存法与答案 PDF 一致——评分细则、下水文
  属于卷级"评分参考"整体,不拆分单独存文件,只保留在 `source/answers.pdf`
  原件里(该 PDF 已在 `papers/<paperId>/source/` 下,随卷归档、不会丢失)。
  若某卷答案 PDF 缺下水文(如本卷读后续写无下水文),按"源没有就不编"处理,
  不得由 AI 代写充数。
- **听力原料区 `listening/` JSON schema**(三件套,不含音频):
  - `listening/questions.json`——`{ section1: { title, instruction, questions:[{no,stem,options:{A,B,C}}] }, section2: { title, instruction, questions:[{no,textRef,stem,options}] } }`(第一节 5 题 A-B-C 三选项;第二节 15 题按 `textRef` 关联到对应听力材料段)。
  - `listening/answers.json`——`{ answers: { "1":"C", ..., "20":"B" } }`。
  - `listening/transcript.json`——`{ texts:[{textId,label,timeRange,coversQuestions,lines:[{speaker,line}]}], broadcastEnd, timingTable:[{text,time,durationSeconds,wordCount,wordsPerMinute}], notes:[] }`(时长/语速表逐字照抄源 PDF,不重算)。
  - 三个文件均为原料,不建 DB 记录、不被任何网站消费面读取(§4)。
- **`figures/` 命名与图-题关联记录格式**(§8 双存桥):
  - 文件名:`<groupId 去 group- 前缀>-table-<序号>.png`(如
    `reading-a-table-1.png`),同目录下 `figures/manifest.json` 登记每张图的
    `{figureId, groupId, kind, file, caption, sourceDocument, sourcePage, placeholderMarker}`。
  - 关联记录:图/表位置在 `materialText`(即 groups.json 对应 group 的段落
    文本)里嵌入与 manifest 完全一致的 `placeholderMarker` 文本(如
    `[表: fig-paper-2026-i-reading-a-table-1]`,注意冒号后的空格是
    `normalizePassageText` 标点规则的产物,占位符必须按标准化后的实际字符
    登记,不能想当然按肉眼原文抄)。`verify-nck1-standard.mjs` 强校验两边
    一致,防止双存桥其中一侧漏更新。
  - DOCX 源中的真实形状由 public publisher 直接完成 LibreOffice PDF
    转换、逐形状裁图、摘要绑定与 manifest/body 关联,并与 paper asset
    version 原子发布;不得再用 `attach-paper-assets-extras.mjs` 覆盖这类
    publisher-owned figures。`sources.docx.shapeAssociations` 必须逐形状登记
    `sourcePart`、`sourceShapeId`、`sourcePage`、页内视觉顺序
    `sourcePageOrder`、`figureId`、`groupId`、`kind`、`placeholderMarker`
    与 `caption`;页码和视觉顺序让同页同尺寸形状也能 fail-closed 地逐一关联。
    该脚本只保留给另行 staging 的 PDF/人工截存图。
- **PDF 源的文本提取工序**:不复用 `lib.mjs` 的正则切卷(它是为
  "答案版 DOCX 内嵌【答案】"约定设计的,新格式的试题卷排版——选项列在
  段落下方、无内嵌答案——是完全不同的视觉约定,现改造正则风险高于手工核对)。
  改为:agent 直读 `source/paper.pdf` + `source/answers.pdf`,原样转录进
  `scripts/import-pipeline/pdf-extract.mjs` 的 `CONTENT` 登记表(与
  `zj-inject-answers.mjs` 的 `KEYS` 表同一先例套路),再用 shipped 的
  `build*AnalysisMessages` 校验形状——不新增 PDF 解析依赖,`pdfjs-dist`
  预批未实际使用(留作将来真正需要程序化提取时的选项)。
  **独立答案注入**:不做文本层面"marry"(如 `zj-inject-answers.mjs`
  对 DOCX 文本做的字符串缝合),而是在 `CONTENT` 登记表里直接把
  `source/answers.pdf` 的客观题答案抄成每题的 `answerKey` 字段——两份源
  PDF 都由 agent 直接读,答案红线(§3)由"抄录忠实度"保证,由完成报告的
  21-65 抽查表交叉核验。
- **发布闸现状盘点**:`scripts/import-pipeline/verify-nck1-standard.mjs`
  补齐 §6 全部条目(9 题组/题号段/分值前置条件/客观题答案数量/听力原料/
  figures 双存一致性),支持发布前(仅查 staging)与发布后(另查
  `app/public/paper-assets/<id>/latest` 里 listening/另行 staging 的
  PDF 或人工 figures 是否已用 `attach-paper-assets-extras.mjs` 落地;
  DOCX 形状 figures 由 public publisher 原子落地)两种模式,同一条命令自动识别。
