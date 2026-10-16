# 新课标一卷标准(NCK1 Paper Standard)v1(owner 2026-07-08 拍板)

> 产品更新（2026-09-17）：[公共题库与个人解析](public-papers-personal-analysis.md)
> 已确认。全库完整教学解析不再是目标供题前提；个人内容和精选人工审核参考分开。
> 本文题面、结构、来源答案、媒体及原子发布要求不降级。全量解析/schema/发布门禁
> 只为历史无 profile / external analyzed package 保留，不是新 raw-source 的生产目标。

一切进入题库的试卷,先洗成本标准的结构与题号,再入库。本标准是
导题工序的**数据产品要求**；试卷规范总入口及排版视觉要求见
[试卷格式标准](exam-paper-format-standards.md)。可执行Canonical结构由该入口
列出的适用版本机器合同拥有；本文不另定义Canonical Plan/Question Group结构。
生产、校验、提交和返工按[导题合同](../import/agent-contract.md)执行。

新 raw-source 导入使用 `public-paper-v1`：本标准规定的完整题面、源答案、题号、媒体和
source locator 全部保留，并为 prose body paragraph 提供 digest-bound 中文摘要；不要求
九份教学解析；另产出 `public-search-metadata-v1.json` 的紧凑检索分类，不生成讲评、高亮、
Embedding 或合同外语义标签。历史无 profile 和外部
analyzed package 仍按既有严格合同，恢复与听力补件不得迁移 profile。

标准模子 = 2026 年新课标 I 卷(owner 2026-07-08 拍板)。任何 agent、
任何模型执行导题,均以本标准为准;发布闸按本标准校验,不合格不入库。

## 1. 标准卷结构(结构、题号、分值均为硬标准)

| 部分 | 节 | 题型 | 题号 | 每题分 | 满分 | group_type | 题组数 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 第一部分 听力 | 第一节 | 短对话 | 1–5 | 1.5 | 7.5 | `listening`(源含听力时,见 §4) | 1 |
| | 第二节 | 长对话/独白 | 6–20 | 1.5 | 22.5 | `listening`(源含听力时,见 §4) | 1 |
| 第二部分 阅读 | 第一节 | 阅读理解 A/B/C/D | 21–35 | 2.5 | 37.5 | `reading` | 4(A 3 题,B/C/D 各 4 题) |
| | 第二节 | 七选五 | 36–40 | 2.5 | 12.5 | `seven_choices` | 1 |
| 第三部分 语言运用 | 第一节 | 完形填空 | 41–55 | 1 | 15 | `cloze` | 1 |
| | 第二节 | 语法填空 | 56–65 | 1.5 | 15 | `grammar_cloze` | 1 |
| 第四部分 写作 | 第一节 | 应用文 | — | — | 15 | `writing` | 1 |
| | 第二节 | 读后续写 | — | — | 25 | `writing` | 1 |

非听力部分固定为 **9 个题组**(reading×4 + seven_choices +
cloze + grammar_cloze + writing×2)。导题源含完整听力且音频证据通过时,
正式发布共 11 个题组（另有 2 个 `listening`）;源明确未提供听力时仍为
9 个,不得编造(§4)。

## 2. 洗卷规则

- **题号重排**:无论源卷原题号如何,一律重排进上表题号段
  (21–35 / 36–40 / 41–55 / 56–65)。重排映射(源题号 → 标准题号)
  写入导入产物留痕,不得丢失。
- **分值覆写**:入库分值一律按上表,不采用源卷标注分值。源卷分值
  仅在留痕里保存。
- **统一材料化制**:完整 NCK1 试题和权威答案可来自文本 PDF、扫描
  PDF、单/双 DOCX 或这些载体的组合。Agent 一律生成
  `nck1-source-materialization-v1`,可信 adapter 从不可变原始字节重新
  派生 Candidate。正常标题、分页、空格、表格、图片和版式变化不得新增
  paperId 登记或格式刀。语义表格结构化重画;真实图片、图标、条码和图表
  从源提取/裁剪,不得 AI 重画。缺页、缺权威答案、来源矛盾或结构不确定
  必须 fail closed。旧格式①/②/③脚本只保留存量回退,停止新增登记。
- **语义保真**:洗卷只动结构 / 题号 / 分值 / 排版,不改题干、选项、
  篇章语义。归一化可能改变语义时,
  停下来交 owner 裁决。
- **内容角色保真**：`title`、`subtitle`、`body` 按源材料判定，不按段落序号猜测。
  阅读A/B/C/D标记是篇位，不证明后面的首段是标题；无标题文章首段仍是正文，
  应进入正文摘要和统计覆盖。角色不确定走已有materialization issues，不靠CSS
  遮掩，也不把源事实判断转交最终layout-only审核。角色修复后按流程重建绑定和
  派生内容，不静默改写已保存的sidecar或revision。
- **题意标记保真**：源中用于指代词句的局部下划线、粗体属于题面信息，
  不能在纯文本提取时静默丢弃，也不能根据题干猜测后补。当前 DOCX 阅读段落
  支持范围、版本重放及无法精确映射时的阻断见格式标准 v58 说明；旧候选保持原样。

## 3. 答案红线(硬约束,gate 强制)

- 每套卷必须有答案来源:**源自带答案,或 owner 另给答案文件。
  两者皆无,则该卷不导。**
- **禁止 AI 做题产生答案**:模型解题结果永远不得作为入库答案,
  准确率再高也不行。
- 答案与试题分离的源(如 2026 卷、模拟卷):切答案 → 按重排后的
  标准题号对齐 → 过数量校验 gate(客观题 1–65 段每题必须有且
  仅有一个答案,缺一即整卷打回)。
- 写作两节无客观答案;答案文件中的评分细则、参考范文(下水文)
  保留原件并进入独立、源绑定的参考内容，不写入客观答案或 AI analysis。
  Owner 2026-10-06 确认新增纯答案版、退役当前 Student/Teacher 产品选择；
  实施阶段、缺件状态及历史兼容见 [四款 PDF 产品合同](paper-pdf-products-v1.md)。
  下文历史“只留在 answers.pdf”及教师投影不覆盖这个目标，也不授权改写旧revision。

## 4. 听力条款

本节保留听力源内容与学生/教师投影要求。以下v51、ASR和单播放器描述对应
历史路径，不代表所有后继版本；实际导入profile、证据方式及本地候选范围从
[导题合同](../import/agent-contract.md)进入，消费者绑定从
[规范总入口](exam-paper-format-standards.md)进入。不可用历史步骤覆盖已明确的
signal-only演练，也不可把本地演练当成已部署能力。

- **播放遍数以录音为准（Owner 已确认）**：确认录音属于该卷、题组对应且实际播放
  遍数有据后，若题卷说明与录音不同，将新题卷的遍数说明改为录音的实际遍数，
  不再为这一类差异逐卷询问 Owner。只修正遍数说明，不裁剪、重复或重新编码录音，
  不改题目、答案及录音稿。保留原始题卷和音频；校正记录写明原说明、新说明与所依据
  的音频 SHA／非重叠播放区间，不冒称 OCR 错误。ASR 重复输出或重叠窗口不算实际
  播放次数。Screen、Print、PDF 使用同一修正；已封存版本不回写，按新 revision 交付。
- 源卷**含**完整听力题、A–C 选项、权威答案和录音稿时,Universal NCK1
  Materialization 将它们绑定成两个 Canonical `listening` 题组:
  `listening.short-dialogue`(1–5)与 `listening.long-form`(6–20)。录音稿按
  source segment 保留并精确覆盖题号;答案仍只认权威答案源,AI 不得补做。
- 两组题在现有导题 Review Screen 最前面显示。Owner 点击题目时,同一右栏
  显示该题的官方录音稿、答案及简明音频核对证据;不新增独立审核页、tab、
  审批状态或人工听完整音频的步骤。Student projection 不得包含录音稿、答案
  或音频核对证据。
- 源卷**无**听力部分(试题从阅读起、正文无「第一部分 听力」)时,必须以
  `not_supplied` 明确闭合两个可选 slot;Candidate 不建听力题组、不显示听力
  标题或空隙,不得编造。
- 音频整文件可解码与时长检查保留；默认 ASR 只取开头至多 180 秒，与源中
  绑定第 1 题的完整正式对话原文核对（排除说明与例题）。新 v2 证据显式记录
  “首段快速匹配、后续内容未核对”，Agent 内容安全检查也只覆盖采样范围。
  未匹配、识别不清或不能确认完整首段时保留证据并停，需显式扩展检查，不自动
  重跑全量 ASR 或换模型。历史 v1 整段核验兼容，不迁移已有卷或工作区。
  此轻量核对不替代题目和录音稿的 source closure；播放器与 duration 仍为全文件。
- 正式发布使用不可变 authority v51（历史 v50 不改写）。发布前校验已通过的
  音频证据、当前源绑定和字节 digest，不重复运行 ASR；仅复制规范化 playback.mp3
  与最小元数据。原音频、ASR 和核对记录仍仅留在私有 Review。
  读取回执时用已有 ASR 轻量复核词序，不能沿用旧无序重合算法的错误 pass；
  无需历史卷重发、新增人工听审或重复调用 ASR 模型。
- 整卷 Screen 的耳机紧随「第一部分 听力（共两节，满分30分）」末尾右括号，
  不在卷外工具区显示原生播放条。第一节 1–5 题、单题和材料的已有入口保留；
  各入口复用原录音与预计算波形，互斥播放，无自动播放，不对源音频切片。
  音频走现有鉴权和不可变版本路径，支持单段 Range；未登录不得读取。
- **波形预处理（2026-10-05 规格）**：后续有音频的新导入，从最终完整规范化播放文件
  预计算一次 50ms RMS 波形，绑定该文件 SHA／时长和算法版本，并作为独立派生资产封存、
  复用。它只服务 Screen 播放导航，不是转写、题目映射或内容安全核验；不修改原音频、
  题文或信号分段，Print／PDF不显示。绘制失败不阻止播放；历史缺件不批量重导、不改
  既有 revision／批准。生成、校验、失效和完成表要求见
  [导题合同的音频波形预处理规则](../import/agent-contract.md#音频波形预处理规则owner-2026-10-05-要求明确规格)。
  此项是后续导入要求，不代表本地全入口门禁已完成或生产已部署。
- 听力题共用 Canonical 投影与现有 Screen/Print/PDF 渲染入口，A–C 等宽横排，
  单题不跨页。Student 不显示答案或录音稿；Teacher 仅在现有答案区增加 1–20
  答案，不打印录音稿、播放器或核对证据。`not_supplied` 不产生任何听力版面。

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

发布闸必须能校验:公开发布非听力 9 题组齐全、题号段正确、每题分值符合 §1、
客观题答案数量齐(§3)、七选五 optionBank 恰好 A–G 七句非空候选句
(可作答卷面硬前提,owner 拍板 2026-07-16,validator blocking 已
落地)、Review Candidate 源含听力时两个听力题组及核对证据闭合、源明确
未提供时两个可选 slot 均为 `not_supplied`(§4)、含图或须截表的篇
figures 原料齐全(§8)。源无听力则跳过听力项;源无图且表已拍平为
纯文本、无独立截图则跳过 figures 项,不得编造占位。现有 publish
gate 覆盖不到的项,按格式补 verify 锁,不得靠人眼。

所有通用入口新卷（旧格式回退入口按各自存量合同）还须:

- **应用文卷面 chrome**:题干不把「（词数N左右。）」粘在提示末尾;
  独立「注意」块写词数与答题卡格式;源给的标题/称呼进答题框
  (`givenSkeleton.presence = provided`)。格式①历史卷给定语可
  `omitted`,不得用本条去改已入库真题。排版细节见
  `exam-paper-format-standards.md` §8。
- **按 profile 闭合派生内容**:`public-paper-v1` 在 Review `push` 前须提供逐个 prose body
  paragraph 的 digest-bound 中文摘要和经 `verify-search-metadata` 验证的紧凑检索元数据，
  完整、唯一覆盖，不生成讲评、高亮、Embedding 或合同外语义标签。仅历史无 profile / external analyzed package 继续要求 4×阅读、七选五、完形、语法、
  应用文、续写九份 staged analysis，绑定进不可变 revision；阅读 / 七选五 /
  完形 / 语法随发布包落地;写作两节
  必须写入 `analyses/writing-analysis-v1.json`(应用文 V3:`modelAnswer`
  + 完整 ReviewCard + 源有则 `officialModelAnswer`;续写 V1:
  `continuationAnalysis` 五段 + `modelAnswer`)。缺一组或整组只能显示
  「解析未发布」则在 Owner QA 前整卷打回。正确项只来自权威答案，AI
  不能解题补答案。旧 `continuationDesign` 只认历史资产。
- **应用文讲评入口**:完整 payload 时点击答题框打开讲评;框内叠放
  「AI 参考范文」与可选「官方范文」,右栏只 ReviewCard。不新增 tab,
  不用白名单题组。

## 7. 变更管理

本标准的任何修改(含附录新格式映射)须 owner 拍板后落档;
agent 不得以"源卷长得不一样"为由自行放宽。与本标准冲突的
历史文档,以本标准为准。

## 8. 图文条款(owner 2026-07-08 拍板:原料先存,渲染后建)

- **边界**:表格 ≠ 图 ≠ 阅读细线框。行列结构能表达的是**表格**;
  统计图、示意图、图画等视觉对象是**图**,走 figures 原料通道;
  Word 左右细线框、框里只有能打的字和矩形表,是阅读
  `framed_columns` 正文(见本条末),不是整图,也不要把整块焊成一张
  假大表。
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

- **阅读细线框正文(`framed_columns`,2026-08-16 落地)**:源是 Word
  左右细线框、框里只有能打的字和矩形表时,Canonical 正文写成阅读
  `framed_columns`(恰好两栏,栏内只有 `paragraph` / `table`)。示意图、
  实物图、统计图仍走 figures。`paper-mock-sz-2026-m1` Reading A 的
  Puzzle | Solution 落地后认两栏真字真表,不再把
  `fig-paper-mock-sz-2026-m1-reading-a-puzzle-1` 当 Canonical 正文;PNG
  留 `figures/` 作原料/证据,`[图:]` 只留在 `groups.json`。台灯与 Q33
  流程图仍是图。两栏须在该格式 producer 里写明,不是从 PDF / DOCX
  自动认文本框。栏内对照表无格、收窄稍居中、行距松开;表后问句只
  略隔开,短栏底部可留白,禁止顶到框底。观感由共享渲染画出
  (`exam-paper-format-standards.md` §3c);导题只写 Canonical
  `framed_columns`,不为下一道同类题改 CSS。下一卷步骤见
  `docs/cuts/reading-framed-columns/spec.md`「下一卷怎么干」。

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
- **阅读细线框**:Word 左右细线框、框里只有能打的字和矩形表 →
  Canonical `framed_columns`(§8)。本格式不探测 DOCX 文本框,须在
  pair producer 里写明两栏。不为单卷改 CSS。
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
