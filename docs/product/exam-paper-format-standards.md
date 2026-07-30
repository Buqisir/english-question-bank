# 试卷格式标准索引(Exam Paper Format Standards)

## 当前可执行权威

本文件是唯一的人类可读索引；当前 canonical 编译、校验、发布和受支持的
Screen / Print-PDF consumer 只从
[`standards/paper-canonical/manifest-v18.json`](../../standards/paper-canonical/manifest-v18.json)
解析一份 digest-closed 的权威闭包。这里不复制卷型题号、分值、题组
cardinality、清洗条件或字体/物理排版数值，也不能被 caller 当作第二套配置。

机器 manifest 分别绑定 Core Invariants、NCK1 / Zhejiang legacy / national
legacy Profiles、各 family contract、Normalization Rules、Source Adapters、
Renderer Typography、其 schema 及纯验证入口。未知版本、缺件、digest 不符、
重复所有者或跨 artifact 不一致必须 fail closed。`nck1-paper-standard.md` 和
`paper-asset-v1.md`保留为历史/legacy source evidence，不能定义 Canonical Plan
或 Canonical Question Group。

任何会改变 admission、canonical 语义、Profile、normalization 或 renderer
结果的变更，必须新增 versioned artifact、schema/semantic conformance fixture、
迁移说明和 manifest 升版；已经被 Publication 引用的 artifact 不可原位修改。
`manifest-v1.json` 至 `manifest-v17.json` 保留各自原始 digest-closed closure，
供既有 Publication 解析；当前 Screen v18、Print/PDF v19 consumer contracts
只绑定 v18 authority。v18 以 `cloze-rhythm-v1` 建立 Cloze Golden Geometry
successor renderer closure；迁移说明见
[`manifest-v18-migration.md`](../../standards/paper-canonical/manifest-v18-migration.md)。
此前 v17 以 `seven-choices-rhythm-v3` 对 Screen 与 Print/PDF
已验证的可见间距调整建立 successor renderer closure；迁移说明见
[`manifest-v17-migration.md`](../../standards/paper-canonical/manifest-v17-migration.md)
和
[`seven-choices-rhythm-v3-migration.md`](../../standards/paper-canonical/rendering/seven-choices-rhythm-v3-migration.md)。
此前 v16 以原始试题 PDF 和官方答案源纠正 Seven Choices
权威：原源没有独立篇章标题，因此 `seven-choices-rhythm-v2` 只保留可执行的
`passage_body_line`，移除 `passage_title` 及 `passage_title_to_body`。迁移说明见
[`manifest-v16-migration.md`](../../standards/paper-canonical/manifest-v16-migration.md)。
此前 v15 新增 Seven Choices Golden Geometry v1：它以
digest-bound page-08 证据绑定完整 vertical-rhythm 语义邻接图，并把 A–G
选项库分类为单列剩余宽度 track、固定 label 起点、label glyph 后固定 em gap
的 content-driven text 起点、非 distributed/space-between，以及 wrapped
continuation hanging indent。原始 JPEG 坐标只形成局部无量纲比例，绝不直接
映射为 CSS px、PDF pt 或整页 A4 比例；golden 中未观测到的 wrapped option
只由 adversarial public-artifact fixture 证明。通用测量轴见
[`golden-geometry-framework-v1.md`](../cuts/paper-canonical-unification/qa/golden-geometry-framework-v1.md)，
迁移说明见
[`manifest-v15-migration.md`](../../standards/paper-canonical/manifest-v15-migration.md)。
此前 v14 以 Renderer Typography v4 绑定 Reading A–D 的完整
vertical-rhythm 语义邻接图；迁移说明见
[`manifest-v14-migration.md`](../../standards/paper-canonical/manifest-v14-migration.md)
和
[`paper-typography-v4-migration.md`](../../standards/paper-canonical/rendering/paper-typography-v4-migration.md)。
此前 v13 以 Renderer Typography v3 绑定 Reading A–D 的 slot-identity 投影、
居中位置和 18pt 行盒；迁移说明见
[`manifest-v13-migration.md`](../../standards/paper-canonical/manifest-v13-migration.md)
和
[`paper-typography-v3-migration.md`](../../standards/paper-canonical/rendering/paper-typography-v3-migration.md)。
此前 v12 以 `consumer-contract-v2` 将当前输出矩阵收口为 Screen 与 Print/PDF，
并退役 generated DOCX capability；迁移说明见
[`manifest-v12-migration.md`](../../standards/paper-canonical/manifest-v12-migration.md)。
此前 v11 以 NCK1 Profile v5 为两个 inactive
listening slot 绑定 `listening-raw-closure@nck1-v1`，闭合 Questions 1–20、
A–C Options、官方答案、十段 transcript、source timing 与 audio inventory，
同时继续保持零 listening Group 与 `renderPolicy: suppress`；迁移说明见
[`nck1-v5-migration.md`](../../standards/paper-canonical/profiles/nck1-v5-migration.md)。
此前 v10 要求 NCK1 续写指令纠正文据与续写
原始 PDF 使用同一 digest，并生成可执行 Transformation Record；同时校验
schema descriptor 与 `$id` 恒等。迁移说明见
[`normalization-rules-v3-migration.md`](../../standards/paper-canonical/normalization/normalization-rules-v3-migration.md)。
此前 v9 以 Zhejiang legacy Profile v4 恢复 hash-bound 原卷中的
`第四部分 写作（共两节，满分40分）`、15 分应用文与 25 分读后续写层级，
并以 NCK1 Profile v4 通过 continuation slot 的 `instructionRefs` 恢复原卷
中带 `话` 的完整续写指令；迁移说明见
[`zhejiang-legacy-v4-migration.md`](../../standards/paper-canonical/profiles/zhejiang-legacy-v4-migration.md)
和
[`nck1-v4-migration.md`](../../standards/paper-canonical/profiles/nck1-v4-migration.md)。
此前 v8 以 Zhejiang legacy Profile v3 抑制未由 source 证明的
`Writing` / `Writing tasks`，同时保持同一 `writing.tasks` section 中的
Application / Continuation 两个 Group 各自完整且只出现一次；迁移说明见
[`zhejiang-legacy-v3-migration.md`](../../standards/paper-canonical/profiles/zhejiang-legacy-v3-migration.md)。
此前 v7 以 NCK1 Profile v3
闭合一份 40 分写作部分及独立的 15 / 25 分两节；迁移说明见
[`nck1-v3-migration.md`](../../standards/paper-canonical/profiles/nck1-v3-migration.md)。
此前 v6 新增闭合的
Continuation Writing v2 family、NCK1 / Zhejiang legacy v2 Profile 绑定、
原始 source + 独立 transcription admission 闭包；迁移说明见
[`continuation-writing-v2-migration.md`](../../standards/paper-canonical/families/continuation-writing-v2-migration.md)。
此前 v5 只新增
Application Writing v3 的原始 source + 独立 transcription admission 闭包；
迁移说明见
[`application-writing-v3-migration.md`](../../standards/paper-canonical/families/application-writing-v3-migration.md)。
此前 v4 只新增闭合的
Application Writing v2 family/source-evidence contract；迁移说明见
[`application-writing-v2-migration.md`](../../standards/paper-canonical/families/application-writing-v2-migration.md)。
此前 v3 只新增
Renderer Typography 对 Question stem 与外层 A–D Option block 共用起点的
digest-closed 物理坐标；迁移说明见
[`paper-typography-v2-migration.md`](../../standards/paper-canonical/rendering/paper-typography-v2-migration.md)。

## v2 历史排版证据（非当前可执行标准）

以下内容保留 2026-07-08 的测量与 owner 决策记录，供后续版本化 Renderer
Typography artifact 溯源。它不授权 compiler、consumer 或 renderer 从 Markdown
重建或覆盖 manifest 的事实。

**历史效力记录：一切渲染、打印、显示均以当时 v2 为准**（owner 原话拍板）。

v2（2026-07-08）取代 v1 文字版，并吸收双权威源实测数值与命题人社区
共识（含纠错）。

## 0. 原则与权威源(owner 2026-07-08 拍板)

- **一个标准**:无论卷源是什么(真题/模拟/校本),渲染一律按本标准,
  排版与卷源无关。呈现基准 = A4。
- **权威源(等权,分工取值)**:
  - **NEEA 金样卷**(`docs/product/exam-paper-format-reference/images/`
    12 张,带 NEEA 水印)——**标点与字符级规则以它为准**(图为裁切件,
    绝对尺寸不可测);
  - **2026 新课标 I 卷 PDF**(`scripts/import-pipeline/papers/paper-2026-i/source/paper.pdf`)
    ——经实测确认为 WPS 复刻件(非官方原版):**版式骨架数值精确可用**
    (矢量,实测精度 0.01pt),**标点细节不作依据**。
  - 佛山模拟卷、广东一模不作为标准依据(owner 拍板剔除);
    `docs/paper-surface-guangdong-visual-qa-checklist.md` 的数值口径
    自 v2 起**废止**,仅作历史 QA 记录。
- 实测报告:2026-07-08 双源 12 项测量(会话交付,数值已固化入本文)。
- **保真分级**(nck1-paper-standard.md §8):试卷面(A4 组卷预览/
  打印/PDF)必须达到本标准;网站详情页语义完整、阅读
  友好即可,不要求仿真卷版式。

## 1. 页面(A4)

| 项 | 值 | 来源 |
| --- | --- | --- |
| 页面 | A4(210×297mm;595.3×841.9pt) | 实测 |
| 左右边距 | 各 24mm(正文左缘 68pt) | 实测(高置信) |
| 上边距 | ≈21mm(至首行字顶) | 实测(中高) |
| 页脚 | 页码行「英语试题 第X页(共Y页)」距底 ≈17.5mm,居中 | 实测 |
| 正文栏宽 | ≈162mm(459.3pt),单栏,两端对齐 | 实测 |

封面页(如需)边距 35mm、内容居中;组卷产物默认不含封面。

## 2. 字体与字号

| 用途 | 字体 | 字号 |
| --- | --- | --- |
| 英文正文/题干/选项 | Times New Roman(粗/斜体用其变体) | **10.5pt(五号)** |
| 中文正文/说明/注释 | 书宋(方正书宋/华文宋体族) | 10.5pt(与英文同号) |
| 部标题(第X部分…) | 中黑(黑体族)加粗 | 10.5pt(**不放大**) |
| 节标题(第X节…) | 书宋常规 | 10.5pt |
| 阅读篇章标题 A/B/C/D 及副标题 | Times New Roman Bold | 10.5pt(不放大),居中 |
| 卷名「英 语」 | 中黑,字距拉开,居中 | 20pt |

Web 字体栈映射(token 层):英文 `"Times New Roman", Times, serif`;
中文正文接宋体族(`"SimSun", "Songti SC", "STSong"`),标题接黑体族。
px 换算(A4=794px@96dpi):10.5pt ≈ 14px。

## 3. 行距

- **基准 18 磅(固定值)**;10.5pt 正文下 ≈1.714 倍。
- 真卷存在按整页纵向撑满的弹性(实测 18–23 磅,两源同现"B 篇最松");
  本产品渲染**统一取 18 磅,不实现撑满**(有意简化)。
- 选项列表区(听力/完形/语法填空选项列)可放宽至 20 磅(实测 20.3pt)。
- 段落首行缩进 2em;题组之间留约 2 行(≈37pt)。

## 3b. 分页纪律(owner 2026-07-08 拍板,刀⑤收官时增补)

密排省纸,但阅读原子不被切开——与真卷行为一致,共三条:

1. **篇章段落可以跨页**(真卷即如此,不做题组原子化,不留整页空白);
2. **单个小题不可拆**:一道小题(题干+选项)是原子,拆不下就整体挪到
   下一页;
3. **三样东西永不跨页**:节/部标题不落页尾(后面至少跟内容)、挖空
   横线不断开(§6 已有)、写作答题框整框不拆。

页尾因此略有参差,是不实现纵向撑满(§3)的已知代价,接受。

## 4. 层级与标题

- **部标题**:中黑加粗,**左顶格**,分值信息内嵌同行——
  「第二部分 阅读(共两节,满分50分)」。
- **节标题**:书宋常规,**缩进 2 字符**(x≈89pt),分值内嵌——
  「第一节(共15小题;每小题2.5分,满分37.5分)」。分值不另起行。
- 层级靠**字重与缩进**区分,一律不放大字号。
- 篇章标题 A/B/C/D:加粗居中,与上下正文各空一行;篇内副标题
  (文章原标题)同样加粗居中。

## 5. 题号与选项排布

- 题号悬挂于正文左缘(68pt),题干首词起于缩进位(89pt,2 字符);
  **选项块与题干首词对齐,不与题号对齐**(wh-word 对齐规则)。
- 题号/选项字母标点:英文句点 + 一个空格(`21. ` / `A. `)。
  (2026 复刻件用全角「．」属仿制偏差,不采;金样卷倾向英文句点,
  中低置信,待 owner 实物复核。)
- 阅读短选项两行排布:A/C 一列(题干缘),B/D 一列(近页心 ≈290pt)。
- 完形选项四列:等距网格 ≈37mm(104pt),所有 A/B/C/D 各成一线
  (Word 侧即 Tab 制表位对齐)。
- 听力选项三列:等距 ≈150pt。
- 1–9 题与 10+ 题的题干起点差异是题号左对齐的自然结果,
  **不是独立缩进规则**(实测澄清社区说法)。

## 6. 挖空(七选五/完形/语法填空)

真卷构造 = **定长下划线 + 题号居中于线上**(非空格字符拼接)。
线长以金样卷专项实测为准(2026-07-08,30 条线全样本;仿制件此项
失真不采),与社区共识「七选五 3+3、完形/语填 2+2」精确互证
(留白比实测 3:2):

- **七选五**:下划线长 ≈**4.6em**(10.5pt 下 ≈48pt/17mm),
  数字两侧各约 3 字符位留白;
- **完形填空 / 语法填空**:下划线长 ≈**3.3em**(≈35pt/12mm),
  数字两侧各约 2 字符位留白;
- 线粗 0.48pt,题号严格居中(实测偏差 ≤0.12em),**题号无尾点**,
  句读标点排在线外;
- 横线**不得跨行断开**;行首/行尾必须完整显示(watch-ledger I10 的
  句首挖空 bug 属此条,刀⑤收);
- 横线与前后单词之间各留一个空格宽,不得粘连;
- 挖空数字不得写成裸数字(如 `57 countries` 样式),防止被误读为
  数据(student-friendly 原则)。
- 教师 Word 侧复现法(附注):空格+下划线构造,七选五 3+3、
  完形/语法填空 2+2 个空格——与金样卷实测留白精确一致;渲染实现
  以定长线为准,Word 授课/命题场景按空格法。
- 七选五标点归属:挖半句/小标题 → 标点留在文中横线后;五空全挖
  整句 → 标点在 A–G 选项内,文中横线后不带标点,不得重复。
- 语法填空提示词:紧随横线的英文括号 `(hold)`,与横线视觉相连,
  遵守英文空格规则。

## 7. 标点与字符(以金样卷为准)

- 英文文本一律英文半角标点;**英文标点后接一个空格**。
- 引号/撇号必须是英文弯引号,禁止直引号或中文引号。
- **英文破折号 = en-dash「–」,前后各一个空格**(金样卷实证;
  v1 的 em-dash 表述废止;社区"左右各 2 空格"说法不采)。
  中文注释文本内的破折号用全角「—」无空格。
- 超纲词中文加注:汉字置于**半角括号**内,括号外侧与相邻英文单词
  各留一个空格:`photosynthesis (光合作用) process`。
  (2026 复刻件的全角括号属仿制偏差,不采。)
- 整卷拼写体系统一(英式或美式选一,不混用)。

## 8. 写作答题区

- 应用文与读后续写**各配一个答题框,共两框**;细边框(0.48pt)
  素框,框内无横线、无提示行。
- 实测尺寸:应用文 ≈144×65mm;读后续写 ≈145×57mm。
- 读后续写的两个段首语**印在框内**(各段起笔位置),学生续写于其后。
- 词数提示等说明行:书宋 10.5pt,全角括号编号「(1)…」,缩进列表。

## 9. 分页保护

- 题干与其选项不得分离两页;完形文章与其选项块尽量同页;
  阅读设问不得与正答/干扰项跨页。学生不应为答一题来回翻页。

## 10. 命题文本规范(附则,authoring 层)

- 猜词题/态度题的单词选项是省略句:首字母大写,末尾加句号。
- 设问不用缩写:`What is ...?`,不写 `What's ...?`。
  `What is the text mainly about?` 配名词短语选项;
  `What is the main idea ...?` 配完整句选项。

## Import Normalization Principle(承自 v1,继续有效)

导入的真题/模拟卷**不是排版权威**。导入时保语义(原文、题意、
选项、答案、写作题干),排版一律向本标准归一:间距、标点、挖空
样式、选项对齐、引号、破折号、答题框。源卷排版邋遢的,产品不得
复刻其邋遢。归一化可能改变语义时,停下来交人裁。
(实例:paper-2026-i 正文里复刻件的 `--`/`-` 破折号,按本条应
归一为「 – 」——列为待办小刀,见执行与迁移。)

## 执行与迁移

- 本标准是两类受支持输出(Screen 与 Print/PDF)的唯一排版权威;现状
  PaperSurface / 写作页 / Print-PDF 数值各异(2026-07-08 盘点在案),
  收拢工作 = **渲染保真刀(刀⑤)**,含:token 单源化(关掉
  Issue #30 Gate 2 那道欠了 52 天的门)、Print/PDF 补挖空样式与
  写作框、字号回归 10.5pt 等比(屏幕纸面 794px 下
  由 16px 调整为 ≈14px)、I10 句首挖空修复、死码
  PaperSurfacePrototype 清理。
- 已入库内容的标点归一(如 paper-2026-i 的破折号)单独小刀。
- 本标准修改须 owner 拍板(同 nck1-paper-standard.md §7 变更纪律)。

## 待 owner 实物复核项(低置信,不阻塞)

- 题号句点样式(英文 `.` + 空格 vs 全角「．」)——金样卷分辨率不足,
  建议对照纸质真题定谳;v2 暂按英文句点 + 空格执行。
- **语法填空作答线是否加长**:金样卷 = 与完形等长(≈3.3em,未
  加长);2026 仿制件 = 加长至 6em。两源冲突、单卷样本,v2 暂按
  金样卷(不加长),建议拿多套纸质真题确认是否随年份浮动。
- 上/下边距的"名义设定值"(实测为 21mm/页脚 17.5mm,系至字面
  距离,非排版软件对话框值)。
