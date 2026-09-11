# 试卷格式标准索引(Exam Paper Format Standards)

## 当前运行时字体（Owner 2026-09-08）

Screen、Print HTML 和新生成的 PDF 固定使用 TeX Gyre Termes 2.609 +
Source Han Serif CN 2.003；不优先使用用户本机 Times / 宋体 / 黑体 / Arial。
正文、大小标题、题号、选项、分值及页脚共用这两族，粗体使用实字重。
运行时字体入口为 `shared/papersurface/paperFonts.mjs`（font policy v1），
文件 SHA-256、许可证和来源见 `app/public/fonts/paper/`。

这是下文历史字体栈的**显式后继规则**，不是修改既有 Publication：字体选择和
派生选项宽度属于 renderer，不改变 Source、Teacher Confirmation、Canonical
语义或已保存 PDF。历史 manifest/typography 文件及其 digest 保持原样；字号、
行距、锚点和可见结构仍由既有闭包校验。仅该已接受的字体迁移豁免语义 manifest
升版，不扩大为绕过 admission 或几何 authority 的通行证。

Owner 复核金样后否定数字齐底：此字体迁移取消**节标题数字的额外下移**。
Termes + 思源宋统一使用 `sectionHeadingRuntime` 的 `0em` 下移量，替代旧宋体
`0.1em` 和未接受的 `0.05em` 齐底尝试；按金样自然随文排列，不强制下沿对齐或垂直居中。
不得把图片像素换算成 A4 尺寸。Screen、Print HTML、PDF 共用该值；字号、行距、
标题间距及历史 typography 数值不变。该窄例外不授权其他几何参数的无版本覆盖。
该规则覆盖各题型标题、题量、分值；阅读/听力题号、完形题号与选项、七选五/完形/
语法填空编号、写作说明编号和正文数字保持各自自然文本基线，不新增统一升降补偿。
填空横线与编号的关系仍由原题型规则控制，不能用移动数字来追齐汉字或横线底边。

`termes-source-han-metrics-v1.json` 是从随仓字体 cmap/hmtx 生成的版本化
运行时度量；派生 A–D plan 继续绑定 typography、metrics 和 shaping digest，
拒绝旧度量 plan。共享 `fontRendering.css` 禁用 kerning/ligature 和伪字重，
使 Screen/Print/PDF 与该宽度模型一致。复现入口为
`python3 scripts/generate-paper-font-metrics.py --check`（fonttools 4.59.2）。
新字体允许统一后的换行变化，不承诺复刻 Windows/macOS 字体分页。

## 当前可执行权威

本文件是唯一的人类可读索引，但必须区分两条已接受的 authority：全局 accepted
canonical authority 是
[`standards/paper-canonical/manifest-v36.json`](../../standards/paper-canonical/manifest-v36.json)，
它仍是一般 canonical 编译、校验、发布与当前 Screen v36、Print/PDF v37
consumer contracts 的唯一全局闭包。`paper-2026-i` 的历史 scoped successors 是
[`manifest-v43.json`](../../standards/paper-canonical/manifest-v43.json) 和
[`manifest-v44.json`](../../standards/paper-canonical/manifest-v44.json) 分别绑定的
immutable v2/v3 Publications，均为不可变历史；当前 scoped successor 是
[`manifest-v45.json`](../../standards/paper-canonical/manifest-v45.json)，只绑定该卷
immutable v4 Publication
([`canonical-paper-publication-ref-v1.json`](../../test-fixtures/paper-canonical/publications/ticket-32-remaining-v1/store/paper-2026-i/latest/canonical-paper-publication-ref-v1.json)，
`paper-2026-i` / `v4` / `sha256:11ff66bfb0fadda5edd7c78a05d0ab5aed939cc644708abfeb00aed48b749a34`)
及其同一份 source 所派生的 Screen、Student/Teacher Print HTML/PDF；它不推进或替代
全局 accepted v36 authority。这里不复制
卷型题号、分值、题组 cardinality、清洗条件或字体/物理排版数值，也不能被 caller
当作第二套配置。

Universal NCK1 导题与 Owner Review 的历史 Candidate-only authority 是
[`manifest-v50.json`](../../standards/paper-canonical/manifest-v50.json)：NCK1
Profile v15 将 source-bound Listening 1–5、6–20 激活为两个可选 Canonical
Group；源明确 `not_supplied` 时两组均省略且不留下标题或空隙。现有 Review
Screen 把已捕获听力放在 q1–20,点击题目后由同一右栏显示官方录音稿、答案和
简明 ASR / 对比 / 内容安全证据；Student projection 必须剥离录音稿、答案和
审核证据。v50 不推进全局 accepted authority,也不声明 Print/PDF 听力排版、
公开播放器或音频发布能力；v50 带音频的公开发布仍 fail closed。听力金样版式及
Screen/Print/PDF 共享输出由后续 successor 闭合,不得从本 Candidate Review
样式反推。

当前 Universal NCK1 导题、发布与呈现 successor 为
[`manifest-v54.json`](../../standards/paper-canonical/manifest-v54.json)，继承
v52 的听力发布闭包、NCK1 Profile v16、Reading family v2，并增加
Source Adapters v16 / materialization behavior v2 与 Paper Presentation v2；
其当前消费者为 Screen v42 和 Print/PDF v43。v52 的迁移只增加 materialization v3 的同质 A–D 图片选项及可选
源测量布局；v1/v2 文字题仍可导入，已有 Publications 保留原 authority/digest，
不自动重编译、不推进全局 accepted v36，也不恢复旧 Format2 导入运行时。
图片须保留独立 occurrence、原始字节和可重放裁切；测量布局绑定题目、原卷
页码、A–D 图片顺序、摘要及裁切坐标，原卷页尺寸和标号边界由 PDF 文本层
重放（容差 0.5pt）。无可验证文本层时不得声明此测量布局；普通图片选项不受
此限制。Screen 与 Print/PDF 消费同一份布局，Review 仍需人工确认题意、
图片质量及答案，不把几何校验当成语义审核。迁移验证入口为
`scripts/verify-nck1-reading-figure-options.mjs`；设置
`EQB_SHENZHEN_QUESTION_PDF` 可复跑原卷 Q33 图片的局部样例，外围题目为
合成数据，不能据此声明整卷已完成导入或发布。

renderer-only [`manifest-v53.json`](../../standards/paper-canonical/manifest-v53.json)
及其 Screen v41 / Print/PDF v42 保留为历史呈现后继；v54 不推进全局 accepted authority。
应用文标题居中、称呼在上、落款在下且右对齐，续写段首句和留白共用
`shared/papersurface/paperLayout.css`。已验证的旧续写恰好有两条源段首引用时，
两条只在答题框出现一次；缺失、数量异常或未标记角色的旧内容保留原文，
不靠文字猜测、不删重、不新增导出封锁。历史 consumer refs 保留历史放置。
长节标题和表格单元允许换行；插图等比适配可打印高度，图注计入占用。
分页后检查不可拆分框及内部文字的真实边界，超出时报告
`PAPER_LAYOUT_OVERFLOW`，不得交付被裁掉的 HTML/PDF。
迁移边界及复现入口见
[`manifest-v54-migration.md`](../../standards/paper-canonical/manifest-v54-migration.md)。

机器 manifest 分别绑定 Core Invariants、NCK1 / Zhejiang legacy / national
legacy Profiles、各 family contract、Normalization Rules、Source Adapters、
Renderer Typography、其 schema 及纯验证入口。未知版本、缺件、digest 不符、
重复所有者或跨 artifact 不一致必须 fail closed。`nck1-paper-standard.md` 和
`paper-asset-v1.md`保留为历史/legacy source evidence，不能定义 Canonical Plan
或 Canonical Question Group。

任何会改变 admission、canonical 语义、Profile、normalization 或 renderer
结果的变更，必须新增 versioned artifact、schema/semantic conformance fixture、
迁移说明和 manifest 升版；已经被 Publication 引用的 artifact 不可原位修改。
`manifest-v1.json` 至 `manifest-v35.json` 保留各自原始 digest-closed closure，
供既有 Publication 解析；当前 Screen v36、Print/PDF v37 consumer contracts
只绑定 v36 authority。v36 继续以 NCK1 Profile v10 发布 renderer-neutral 的完整
可见结构：inactive Listening 不产生标题、正文或空隙，首个可见部分仍是
`第二部分 阅读（共两节，满分50分）`，且阅读理解、七选五的节标题和说明均
由同一 Profile/digest 绑定的 Consumption Plan 进入 plain/lecture Screen、
Student/Teacher Print HTML 与 PDF。六个在用节标题均与部标题共享正文左缘，
全文采用同一书宋栈；分值数字的历史可见基线校准由 digest-bound 的
Paper Typography authority 定义，当前固定字体取消额外下移的窄覆盖见本文首节；
`第X节` 后及数字与中文单位之间保留一个半角空格，
中文全角括号、分号、逗号不变。部标题到首个节标题按本地可见字高归一化为
1.882；动态页脚为 `英语试题第 ${page} 页（共 ${pages} 页）`，其中页数取
Student / Teacher 实际总页数。题组指导语和段落首行从 2em 起笔，段落续行
回到正文左缘。阅读题号到题干使用 1.647em 悬挂锚点；一行四项的 C 起点与
一行两项的第二列共同绑定 4160/8764 可用内容宽度锚点。阅读与完形的题号、
选项标号和选项正文均为 400 字重；完形题号布局盒左缘与正文续行左缘重合，
其右缘恰接 A 标号锚点，并连续呈现为 `41.A.`，中间不得新增空白、grid 或 CSS
gap。`questionLabelWidthPt` 是该连续 qnum run 的固定 advance 盒；字形自然 side
bearing 保留，不得拉伸或以墨迹边缘接触替代该布局关系。A/B/C/D 后到选项正文保持
0.411765em，四个选项使用金样归一化固定起点。
七选五、完形与语法填空横线保持 Screen 1px、Print/PDF 0.5pt，并共用题号到
横线的纵向关系：横线位于题号字形下方且不得跨过数字；语法填空不得另行上抬。
Grammar Fill 的该关系由 digest-bound `grammar-fill-rhythm-v7` 直接绑定；共享
blank ruling 只消费这个绑定值，不得以未版本化 token 覆盖它。
各题型横线长度仍按 §6 独立取值。应用文标题到首个 prompt 为一个 baseline step；
续写标题到 instruction 为一个 baseline step，instruction 到材料为 1.5
baseline steps，二者由独立 authority 拥有。Normalization Rules v5 只在英文 token 邻接中文释义时收窄
半角括号/标点空格转换，普通中文 `这是（中文）说明。` 保持原样，并保留英文
弯撇号规则；原始 Source Capture 字节保持不变。Application rhythm v4 /
Continuation rhythm v5 分别声明 Screen
1px 与 Print/PDF 0.5pt 的细线原语，正文首行统一 2em，续写给定段首仍为
独立 4em 角色。正文行盒继续固定 18pt，不引入任何 18/19、18–23 或按页自适应。
Paper Typography v10 保留历史 section heading numeric baseline，并继续拥有 instruction
常规字重；当前字体取消数字下移仅由本文首节的共享运行时覆盖。
Continuation Rhythm v5 另外绑定在 exact-final-HEAD 证据根持久化的六 bundle、两
relation 观测 ledger。迁移说明见
[`manifest-v36-migration.md`](../../standards/paper-canonical/manifest-v36-migration.md)。

此前 v32 以 NCK1 Profile v10、Paper Typography v7、Normalization Rules v5
和 Grammar Fill public-geometry-fixtures v11 闭合 Owner-QA geometry；
迁移说明见
[`manifest-v32-migration.md`](../../standards/paper-canonical/manifest-v32-migration.md)。

此前 v31 以 NCK1 Profile v10、Paper Typography v6、Normalization Rules v5
和 Grammar Fill public-geometry-fixtures v10 闭合完整可见结构与中文标点；
迁移说明见
[`manifest-v31-migration.md`](../../standards/paper-canonical/manifest-v31-migration.md)。

此前 v29 以不可变 Continuation capture/transcription v2
完整逐字核对原题 PDF 材料，在 Unicode NFC + ASCII 空白折叠后仍保留标点
码位、标点相邻空格、撇号码位和词语有无，因而必须接受 `ditch （沟）.` 并
拒绝 `ditch (沟) .`，而不是让输出反向证明 source oracle。
`continuation-writing-rhythm-v2` 只重绑纠正后的 source/coverage oracle，保留
v1 的两段段首 4 em、窄屏换行、normal-flow 作答区、跨页移动、chrome 零缩进、
Teacher analysis 缺席和卷尾行为。NCK1 v8、Zhejiang legacy v7 与 Grammar
Fill public-geometry-fixtures v8 只推进当前 Plan 身份兼容；Application、
Reading、Seven Choices、Cloze、Grammar Fill 与 inactive Listening 语义不变。
迁移说明见
[`manifest-v29-migration.md`](../../standards/paper-canonical/manifest-v29-migration.md)。
此前 v28 新增 `continuation-writing-rhythm-v1`：它以原题
PDF、page-12 金样图、Paper Asset 与 reviewed evidence 约束
Application→Continuation 边界、写作部分/小节/instruction、材料、两个给定
段首、145 mm × 57 mm normal-flow 作答区及卷尾。两个给定段首统一使用
4 em 局部字体缩进，Screen、Print HTML 与 exact-A4 PDF 不得因跨页移动丢失
缩进、误缩进 chrome，或把给定段首混同为学生续写区；来源未授权的 Teacher
答案、分析与 rubric 必须保持缺席。public-geometry-fixtures v7 不改变
Grammar Fill 的源文本、geometry 或 projected-occurrence digest，只把
compatible Consumption Plan 推进到 v28。迁移说明见
[`manifest-v28-migration.md`](../../standards/paper-canonical/manifest-v28-migration.md)。
此前 v27 以不可变 Application capture/transcription v3 逐字纠正原题 PDF
第 10 页的 `“Opinion”`、`未来大学生活中的学习` 和 `写作词数应为 80 左右`，
并以 `application-writing-rhythm-v2` 将 border、padding 和原子作答区移动
严格限制在 Application selector；Continuation 恢复既有答题框几何，只保留
小节标题与 prompt 的已授权 chrome 边界。默认 runbook producer 按 Manifest
v27 的显式契约选择 v3 evidence，不再由 `--request-file-name` 暗示 evidence
版本。迁移说明见
[`manifest-v27-migration.md`](../../standards/paper-canonical/manifest-v27-migration.md)。
public-geometry-fixtures v6 不改变 Grammar Fill 的源文本、geometry 或
projected-occurrence digest，只把 compatible Consumption Plan 推进到 v27。
此前 v26 新增 `application-writing-rhythm-v1`：它把
page-11 金样图仅作为局部 baseline/font proxy 和 em/usable-width ratio 的
无量纲证据，不把 JPEG 像素换算成 CSS px、PDF pt 或整页 A4 比例；可见角色图
由 2026-I 原题 PDF、Paper Asset、官方答案源和 Application Writing
capture/transcription 共同约束，覆盖 Grammar Fill 边界、写作部分/小节、
两个源 prompt 段落/notice、源给定标题、144 mm × 65 mm 原子作答区，以及紧随其后的
Continuation Writing 小节和 prompt。2026-I 来源没有授权应用文参考答案、
分析、rubric、称呼或收件人，因此 Student / Teacher 产物都必须零文本、零
phantom gap 地折叠这些角色。迁移说明见
[`manifest-v26-migration.md`](../../standards/paper-canonical/manifest-v26-migration.md)。
public-geometry-fixtures v5 保留 Grammar Fill v4 的全部源文本、geometry 与
projected-occurrence digest，只把 compatible Consumption Plan 推进到 v26。
此前 v25 以 Grammar Fill family v3、Source Adapter v7 与
`grammar-fill-prompt-provision-v2` 闭合 prompt evidence：`source_prompt`
必须携带 `prompt`，`source_proven_none` 禁止携带 `prompt`；同一版本化契约在
admission、canonical projection 与 sealed Publication validation 三处执行，
矛盾证据不能再被接受后静默丢弃。迁移说明见
[`manifest-v25-migration.md`](../../standards/paper-canonical/manifest-v25-migration.md)。
public-geometry-fixtures v4 保留 v3 的全部 geometry 与 occurrence digest，
只把 compatible Consumption Plan 闭包推进到 v25。
此前 v24 以 Grammar Fill family v2、Question Group/Core
v2、Source Adapter v6 与 reviewed prompt source capture 显式拥有每个 Blank
的 `source_prompt` / `source_proven_none` 身份；public projection 只消费该
versioned identity，不从 prose 或 renderer authority 反推 prompt。Grammar
Fill rhythm v4 与 public-geometry-fixtures v3 不含 px/pt shadow geometry，
fixture 选择还必须通过 compatible Consumption Plan 的 exact occurrence
integrity 与 surface Consumer Contract。迁移说明见
[`manifest-v24-migration.md`](../../standards/paper-canonical/manifest-v24-migration.md)。
此前 v23 新增 Grammar Fill rhythm v3 与
public-geometry-fixtures v2：canonical projection 显式携带每个 Blank 的
source-backed prompt string 或 `null`，不从相邻 prose 推断 prompt；successor
source/adversary/fixture closure 不含 px/pt shadow geometry；fixture 选择只接受
exact v23 Consumption Plan 与 surface-compatible Consumer Contract。迁移说明见
[`manifest-v23-migration.md`](../../standards/paper-canonical/manifest-v23-migration.md)。
此前 v22 新增 Grammar Fill public-geometry-fixtures v1：
它把 q56 wrapped-line、q58 line-end 所需的 40em usable-width proxy、跨页
continuation 的 17em proxy 与 q55 producer page-break 身份绑定到真实
Screen / Print HTML / PDF producer 输入，产物生成后禁止 verifier 注入或
改写。迁移说明见
[`manifest-v22-migration.md`](../../standards/paper-canonical/manifest-v22-migration.md)。
此前 v21 以 `grammar-fill-rhythm-v2` 闭合 Grammar Fill
Golden Geometry successor：它保留 v20 及 v1 measurement 的精确历史字节，
并把 Question 63 纠正为与不可变 source/runtime 一致的 unprompted 身份；
q56 wrapped-line、q58 line-end、optional collapse、零产物和 PDF body seam
均须来自实际 public DOM/PDF/文件系统观测。迁移说明见
[`manifest-v21-migration.md`](../../standards/paper-canonical/manifest-v21-migration.md)。
此前 v20 以 `grammar-fill-rhythm-v1` 建立 Grammar Fill
Golden Geometry：权威分别绑定 page-10 Grammar Fill 金样图、2026-I 不可变
原题 PDF、versioned Paper Asset、官方答案与 reviewed analysis digest；完整
语义邻接图、24px / 18pt 行节奏、3.3em-class 原子作答线、居中无句点题号、
prompt 的 exact-text / attachment / spacing、Student / Teacher tail 以及到
Application Writing 的同页或跨页关系均为机器可执行事实。纵向只使用局部
baseline/font proxy 比例，横向只使用 em/usable-width 比例；Screen 与
exact-A4 Print/PDF 的独立 observed-set oracle 必须与实测 ledger 精确相等。
迁移说明见
[`manifest-v20-migration.md`](../../standards/paper-canonical/manifest-v20-migration.md)。
此前 v19 以 `cloze-rhythm-v2` 完整闭合 Cloze Golden
Geometry renderer semantics；迁移说明见
[`manifest-v19-migration.md`](../../standards/paper-canonical/manifest-v19-migration.md)。
此前 v18 以 `cloze-rhythm-v1` 建立 Cloze Golden Geometry
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
- 只观察到真卷行距按页变化的页级粒度；18–23 磅范围未获物理证明，
  不进入运行时权威。本产品渲染**统一取 18 磅,不实现撑满**。
- 听力题干和选项固定18pt；其他题型按各自已确认的共享几何执行，不由分页器临时放宽。
- 段落首行缩进 2em;题组之间留约 2 行(≈37pt)。

### 听力内部的固定节奏

依据金样的层次关系归纳为简单档位，不照抄扫描墨迹的1.4、1.9等小数：

- 题干→选项、竖排选项→下一选项、选项→下一题：正常18pt行步长，不叠加通用题目margin或grid row-gap。
- 材料提示前额外18pt，提示后直接接题；即上一选项行到材料提示约两个行步长，不是额外空两行。
- 注意事项到听力部标题、两节听力之间：额外18pt。
- 听力总说明到第一节标题、第一节说明到示例：额外9pt。
- 示例答案到正式题：额外18pt；听力到阅读部标题：额外36pt。
- Screen的外层flex gap与这些留白只计算一次。Print/PDF使用同一共享规则。
- 这些为固定角色间距，不参与逐卷凑页。仅卷名上下留白允许有界调整。

## 3b. 分页纪律(owner 2026-07-08 拍板,刀⑤收官时增补)

统一格式不等于逐卷复刻分页。自然 Print/普通 PDF 采用以下基础纪律；
整卷 8/10 页重排在此基础上应用下述优先级，不改变正文尺寸与答题区域。

1. **篇章段落可以跨页**，题组完整是重排目标，不是对超长题组的硬性禁拆；
2. **单个小题不可拆**:一道小题(题干+选项)是原子,拆不下就整体挪到
   下一页;
3. **三样东西永不跨页**:节/部标题不落页尾(后面至少跟内容)、挖空
   横线不断开(§6 已有)、写作答题框整框不拆。

页尾因此略有参差,是不实现纵向撑满(§3)的已知代价,接受。

### 整卷标准重排（Owner 本轮确认）

- 有听力源卷提供 10 页含听力及 8 页去听力输出；原本无听力提供
  8 页输出。三者共用正式卷面，保留卷名、注意事项和作答说明，不另设练习版。
  Screen 保持自然滚动，普通 Print/PDF 与其缓存不受定页规划影响。
- 两种 8 页版采用相同的题组完整优先级：A/B/C/D、七选五、完形、
  读后续写尽量各面完成，语法填空＋应用文通常合页。先比较这一安排，
  再作必要的局部合页；A 过长不意味着后续全部放弃题组节奏。
- 卷首两处额外留白优先让步，正文尺寸、其他间距及写作区域不让步。
  8/10 页共用 72/72 → 54/72 → 54/54 → 18/36 → 0/18 → −25.5/18pt 候选
  （依次为标题上方偏移、标题至注意事项），先比较各档自然分页，再尝试题组起页。
  非负第一值是额外留白；最后一档把卷首真实占位上移约9mm，使标题框顶距纸顶
  仍约12mm，不用 transform 制造不释放空间的假上移，也不改变其余页的页边距。
  这些是有界产品候选值，不宣称来自金样裁切图的物理实测；总预算仍为24次渲染。
  旧审核方案显式省略卷首时保留原样重放；新自动方案不再省略。变更旧方案须重新 QA。
- 10 页完整版以有保护的自然接排为主；同等页数下争取少跨 A3 正反面。
  跨页不是不合格的充分条件；相同分页质量优先自然接排，不为不跨页强行增加纸张。
- 8/10 页的非听力题组按“主要页面之外的内容量”评估拆分程度：复用实际分页
  片段高度，除以行高后求总量减最大页量；短小开头仍按原规则豁免。
  整卷累加此代价，保留跨A3翻面惩罚及8页题组共页偏好，不再每拆一个题组固定扣10分。
  搜索与最终选用同一评分，不增加测量或试排次数，不识别句意，也不对单卷设特例。
- 所有定页版保护听力说明、材料提示和七选五选项组，优先避免其拆散。
  允许短小开头接在页尾；不要求所有题组必须另起新页。
  8/10 页都先搜索保持选项组完整的候选，仍找不到时才允许在完整选项之间分页，
  并在下载成功提示中明确告知；单道题、单条选项仍须完整，超出一页则报错。
- 指定页数是交付条件；少拆题组、少翻面是可退让的偏好。
  有界搜索找不到时明确报错，不缩字、不减题、不把错误页数宣称为完成。
  源数据重复须另行核对修正，不能由分页器删掉来凑页数。

## 3c. 阅读细线框(`framed_columns`,2026-08-24 Owner QA 收口)

Word 左右细线框、框里只有能打的字和矩形对照时,三面由共享
`framed_columns` 画出,不为单卷改 CSS、不测像素仿真 Word。

- **栏框**:单实细线。Screen 1px、Print/PDF 0.5pt,与 §6 挖空细线原语
  同一意图。不另造虚线、双线或其它 Word 线型。
- **栏标题**:该栏 `columnHeading` 指向的段落居中加粗;不靠「第一段」,
  不是篇章 A/B/C/D 标题。
- **栏内对照表**:无格线。按内容收窄,整块稍居中;行距松开。不要画成
  满宽带框的 HTML 表。
- **表后问句 / 段落**:紧跟表后,只略隔开。两栏等高而一栏更短时,短栏
  底部可留白;禁止把问句或对照表顶到框底去填空。

实现: `PaperSurface.css` / `print-renderer.mjs` 的
`.canonical-reading-framed-column` 规则。导题写入见
`nck1-paper-standard.md` §8。下一卷只写 Canonical 块,步骤见
`docs/cuts/reading-framed-columns/spec.md`「下一卷怎么干」。

## 4. 层级与标题

- **部标题**:中黑加粗,**左顶格**,分值信息内嵌同行——
  「第二部分 阅读(共两节,满分50分)」。
- **节标题**:书宋常规,**左顶格，与部标题共享正文左缘**，分值内嵌——
  「第一节 （共 15 小题；每小题 2.5 分，满分 37.5 分）」。`第X节` 后、
  数字与中文单位之间各一个半角空格；中文全角括号、分号、逗号保持不变。
  整行使用本文首节固定字体组合；数字和小数点按金样自然随文排列，不强制下沿对齐
  或垂直居中。不要求字形等高，也不以墨迹或行盒底边相等作为验收依据。分值不另起行。
- 层级靠**字重**区分,一律不放大字号。
- 题组指导语与篇章段落首行从普通 2em 首行原点起笔；篇章换行回到正文左缘。
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
- 印刷细线以约 0.5pt 为意图；支持点值的 Print/PDF 原语取 0.5pt，
  Screen 取清晰的 1px。不得从栅格图制造 0.48 与 0.50 的虚假物理精度。
- **纵向关系**: 七选五、完形填空、语法填空均以题号字形下方的同一横线
  基线为准，横线不得跨过数字；只统一纵向关系，不统一各题型的横线长度。
  题号严格居中(实测偏差 ≤0.12em),**题号无尾点**,
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

- 应用文与读后续写**各配一个答题框,共两框**;印刷细边框约 0.5pt
  素框,框内无横线、无提示行。
- 实测尺寸:应用文 ≈144×65mm;读后续写 ≈145×57mm。
- 读后续写的两个段首语**印在框内**(各段起笔位置),学生续写于其后。
- 词数提示等说明行:书宋 10.5pt,全角括号编号「(1)…」,缩进列表。
- 应用文题干**不得**把「（词数80左右。）」粘在提示末尾。词数写在
  独立「注意」块:`注意：（1）写作词数应为N个左右；（2）请按如下格式在答题卡的相应位置作答。`
- 源给了标题 / 称呼等给定语时,印在答题框内(标题在框顶);不得只
  留在题干里或省略。
- 给定标题、称呼、已给开头属于框内上方；结束语、签名属于框内右下方。
  固定文字使用已有 `givenSkeleton` 与内容引用，同一源段落只占一次，不再复制进题干；
  不同源段落同文时仍保留来源事实，不按文字去重，
  也不扩大原答题框。书信不强求标题；源卷确无给定语时用已有来源确认表示缺省，
  不按体裁补写。导题 QA 按引用与归属检查，不依赖 `:given:title` 等节点名后缀。
- 历史 `legacy_opaque` 写作仍是未确认归属的兼容数据，不代表“没有给定文字”。
  必须先依据源卷确认并修订到结构化写作，再认可其版式；不得由 Screen/Print/PDF
  按 Dear、卷名或末几行猜测搬移。旧发布物保持不变，修订沿用已有 revision/QA 流程。

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
